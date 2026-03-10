#!/usr/bin/env python3
"""Saropa Package Vibrancy — Developer Toolkit & Publish Pipeline."""

import argparse
import os
import sys
import time

from modules.constants import C, ExitCode, PROJECT_ROOT, exit_code_from_results
from modules.display import ask_publish_stores, dim, heading, info, show_logo
from modules.utils import (
    get_installed_extension_versions,
    read_package_version,
    run,
    run_step,
)
from modules.report import (
    close_publish_log,
    ensure_utf8_stdout,
    open_publish_log,
    print_success_banner,
    print_timing,
    save_report,
)
from modules.checks_prereqs import check_git, check_node, check_vsce
from modules.checks_environment import (
    check_global_npm_packages,
    check_vscode_cli,
    check_vscode_extensions,
)
from modules.checks_project import (
    check_file_line_limits,
    check_remote_sync,
    check_working_tree,
    ensure_dependencies,
    step_compile,
    step_lint,
    step_test,
)
from modules.checks_version import validate_version_changelog
from modules.publish_steps import (
    check_publish_credentials,
    commit_and_tag,
    confirm_publish,
    publish_to_stores,
)
from modules.packaging import step_package
from modules.install import (
    print_install_instructions,
    prompt_install,
    prompt_open_report,
)

_CLI_FLAGS = [
    ("--analyze-only", "Build + package + local install. No publish."),
    ("--yes", "Auto-accept all prompts (CI mode)."),
    ("--skip-tests", "Skip the test step."),
    ("--skip-extensions", "Skip VS Code extension checks."),
    ("--skip-global-npm", "Skip global npm package checks."),
    ("--auto-install", "Auto-install .vsix without prompting."),
    ("--no-logo", "Suppress the project banner."),
]


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Saropa Package Vibrancy — Publish Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    for flag, help_text in _CLI_FLAGS:
        parser.add_argument(flag, action="store_true", help=help_text)
    return parser.parse_args()


def _print_banner(args: argparse.Namespace, version: str) -> None:
    """Print the script banner."""
    if not args.no_logo:
        show_logo(version)
    else:
        print(f"\n  {C.BOLD}Saropa Package Vibrancy{C.RESET}"
              f"  {dim(f'v{version}')}")
    print(f"  Project root: {dim(PROJECT_ROOT)}")


def _run_prerequisites(
    results: list[tuple[str, bool, float]],
) -> bool:
    """Step 1: Check prerequisite tools."""
    heading("Step 1 · Prerequisites")
    for name, fn in [
        ("Node.js", check_node),
        ("git", check_git),
        ("vsce", check_vsce),
        ("VS Code CLI", check_vscode_cli),
    ]:
        if not run_step(name, fn, results):
            return False
    return True


def _run_dev_checks(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> bool:
    """Steps 2-6: Dev environment, git state, dependencies."""
    if args.skip_global_npm:
        heading("Step 2 · Global npm Packages (skipped)")
    else:
        heading("Step 2 · Global npm Packages")
        if not run_step("Global npm pkgs",
                        check_global_npm_packages, results):
            return False

    if args.skip_extensions:
        heading("Step 3 · VS Code Extensions (skipped)")
    else:
        heading("Step 3 · VS Code Extensions")
        if not run_step("VS Code extensions",
                        check_vscode_extensions, results):
            return False

    heading("Step 4 · Working Tree")
    if not run_step("Working tree", check_working_tree, results):
        return False

    heading("Step 5 · Remote Sync")
    if not run_step("Remote sync", check_remote_sync, results):
        return False

    heading("Step 6 · Dependencies")
    if not run_step("Dependencies", ensure_dependencies, results):
        return False

    return True


def _run_build_and_validate(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> tuple[str, bool]:
    """Steps 7-10: Compile, test, quality, version."""
    heading("Step 7 · Lint & Compile")
    if not run_step("Lint", step_lint, results):
        return "", False
    if not run_step("Type check", step_compile, results):
        return "", False

    if args.skip_tests:
        heading("Step 8 · Tests (skipped)")
    else:
        heading("Step 8 · Tests")
        if not run_step("Tests", step_test, results):
            return "", False

    heading("Step 9 · Quality Checks")
    if not run_step("File line limits", check_file_line_limits, results):
        return "", False

    heading("Step 10 · Version & CHANGELOG")
    t0 = time.time()
    version, version_ok = validate_version_changelog()
    elapsed = time.time() - t0
    results.append(("Version validation", version_ok, elapsed))
    if not version_ok:
        return "", False
    return version, True


def _run_analysis(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> tuple[str, bool]:
    """Run all analysis steps (1-10). Returns (version, passed)."""
    if not _run_prerequisites(results):
        return "", False
    if not _run_dev_checks(args, results):
        return "", False
    return _run_build_and_validate(args, results)


def _package_and_install(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> str | None:
    """Package .vsix and offer local install. Returns vsix path."""
    heading("Package")
    t0 = time.time()
    vsix_path = step_package()
    elapsed = time.time() - t0
    results.append(("Package", vsix_path is not None, elapsed))
    if not vsix_path:
        return None

    heading("Local Install")
    installed = get_installed_extension_versions()
    if installed:
        parts = [f"{ed} v{ver}" for ed, ver in sorted(installed.items())]
        info(f"Installed locally: {', '.join(parts)}")
    else:
        info("Not installed in VS Code or Cursor.")
    print_install_instructions(vsix_path)
    if args.auto_install:
        info(f"Running: code --install-extension {os.path.basename(vsix_path)}")
        run(["code", "--install-extension", os.path.abspath(vsix_path)])
    else:
        prompt_install(vsix_path)
    return vsix_path


def _save_and_show_report(
    results: list[tuple[str, bool, float]],
    version: str,
    vsix_path: str | None = None,
    is_publish: bool = False,
) -> str | None:
    """Save report, print timing chart, return report path."""
    report = save_report(results, version, vsix_path, is_publish=is_publish)
    print_timing(results)
    if report:
        rel = os.path.relpath(report, PROJECT_ROOT)
        info(f"Report: {C.WHITE}{rel}{C.RESET}")
    return report


def main() -> int:
    """Main entry point — analyze + publish pipeline."""
    ensure_utf8_stdout()
    args = parse_args()
    version = read_package_version()

    if args.yes:
        os.environ["PUBLISH_YES"] = "1"

    _print_banner(args, version)
    open_publish_log()
    try:
        return _main_inner(args, version)
    finally:
        close_publish_log()


def _main_inner(args: argparse.Namespace, version: str) -> int:
    """Run the analysis + publish pipeline."""
    results: list[tuple[str, bool, float]] = []

    version, passed = _run_analysis(args, results)
    if not passed:
        _save_and_show_report(results, version or "unknown")
        return exit_code_from_results(results)

    vsix_path = _package_and_install(args, results)
    if not vsix_path:
        _save_and_show_report(results, version)
        return ExitCode.PACKAGE_FAILED

    if args.analyze_only:
        report = _save_and_show_report(results, version, vsix_path)
        if report:
            prompt_open_report(report)
        return ExitCode.SUCCESS

    heading("Publish Confirmation")
    if not confirm_publish(version):
        info("Publish cancelled by user.")
        return ExitCode.USER_CANCELLED

    stores = "both"
    if not get_installed_extension_versions():
        stores = ask_publish_stores()

    if not _run_publish(version, vsix_path, results, stores):
        _save_and_show_report(results, version, vsix_path)
        return exit_code_from_results(results)

    _save_and_show_report(results, version, vsix_path, is_publish=True)
    print_success_banner(version)
    return ExitCode.SUCCESS


def _run_publish(
    version: str,
    vsix_path: str,
    results: list[tuple[str, bool, float]],
    stores: str,
) -> bool:
    """Run publish steps (11-15). Returns True on success."""
    if not check_publish_credentials(results, stores):
        return False
    if not commit_and_tag(version, results):
        return False
    return publish_to_stores(version, vsix_path, results, stores)


if __name__ == "__main__":
    sys.exit(main())
