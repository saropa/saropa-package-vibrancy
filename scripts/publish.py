#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Saropa Package Vibrancy — Publish Pipeline
#
# Gated analyze-then-publish for VS Code Marketplace. Requires Python 3.10+.
#
# Usage:
#   python scripts/publish.py                  # full analyze + publish
#   python scripts/publish.py --analyze-only   # analysis + dry-run only
#   python scripts/publish.py --skip-tests     # skip test step
#   python scripts/publish.py --yes            # non-interactive (CI)

import argparse
import os
import sys
import time

from modules.constants import C, ExitCode, PROJECT_ROOT
from modules.display import dim, heading, info, ok, show_logo
from modules.utils import is_version_tagged, read_package_version, run_step
from modules.report import (
    close_publish_log,
    ensure_utf8_stdout,
    open_publish_log,
    print_timing,
    save_report,
    print_success_banner,
)

from modules.checks import (
    check_node,
    check_file_line_limits,
    check_git,
    check_remote_sync,
    check_vsce,
    check_working_tree,
    ensure_dependencies,
    step_compile,
    step_lint,
    step_test,
)
from modules.checks_version import validate_version_changelog
from modules.publish_steps import (
    check_gh_cli,
    confirm_publish,
    create_git_tag,
    create_github_release,
    git_commit_and_push,
    publish_to_marketplace,
    step_dry_run,
)


# ── CLI ──────────────────────────────────────────────────────

_CLI_FLAGS = [
    ("--analyze-only", "Run analysis + dry-run. No publish."),
    ("--yes", "Auto-accept all prompts (CI mode)."),
    ("--skip-tests", "Skip the test step."),
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


# ── Orchestration ─────────────────────────────────────────────


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
    heading("Step 1 - Prerequisites")
    for name, fn in [
        ("Node.js", check_node),
        ("git", check_git),
        ("vsce", check_vsce),
    ]:
        if not run_step(name, fn, results):
            return False
    return True


def _run_project_checks(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> bool:
    """Steps 2-7: Git state, deps, lint, compile, tests, quality."""
    heading("Step 2 - Working Tree")
    if not run_step("Working tree", check_working_tree, results):
        return False

    heading("Step 3 - Remote Sync")
    if not run_step("Remote sync", check_remote_sync, results):
        return False

    heading("Step 4 - Dependencies")
    if not run_step("Dependencies", ensure_dependencies, results):
        return False

    heading("Step 5 - Lint & Compile")
    if not run_step("Lint", step_lint, results):
        return False
    if not run_step("Type check", step_compile, results):
        return False

    if args.skip_tests:
        heading("Step 6 - Tests (skipped)")
    else:
        heading("Step 6 - Tests")
        if not run_step("Tests", step_test, results):
            return False

    heading("Step 7 - Quality Checks")
    if not run_step("File line limits", check_file_line_limits, results):
        return False

    return True


def _run_analysis(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> tuple[str, bool]:
    """Run all analysis steps (1-8). Returns (version, all_passed)."""
    if not _run_prerequisites(results):
        return "", False
    if not _run_project_checks(args, results):
        return "", False

    heading("Step 8 - Version & CHANGELOG")
    t0 = time.time()
    version, version_ok = validate_version_changelog()
    elapsed = time.time() - t0
    results.append(("Version validation", version_ok, elapsed))
    if not version_ok:
        return "", False

    return version, True


def _run_publish(
    version: str,
    results: list[tuple[str, bool, float]],
) -> bool:
    """Run publish steps (9-13). Returns True on success."""
    heading("Step 9 - Credentials")
    if not run_step("GitHub CLI", check_gh_cli, results):
        return False

    if is_version_tagged(version):
        heading("Step 10 - Git Commit & Push")
        info(f"Tag v{version} already exists; skipping commit & tag.")
        heading("Step 11 - Git Tag")
        info("Skipped (tag exists).")
    else:
        heading("Step 10 - Git Commit & Push")
        if not run_step("Git commit & push",
                        lambda: git_commit_and_push(version), results):
            return False
        heading("Step 11 - Git Tag")
        if not run_step("Git tag",
                        lambda: create_git_tag(version), results):
            return False

    heading("Step 12 - Publish to Marketplace")
    if not run_step("Marketplace publish",
                    publish_to_marketplace, results):
        return False

    heading("Step 13 - GitHub Release")
    if not run_step("GitHub release",
                    lambda: create_github_release(version), results):
        return False

    return True


def _save_and_show_report(
    results: list[tuple[str, bool, float]],
    version: str,
    is_publish: bool = False,
) -> None:
    """Save report, print timing chart, show report path."""
    report = save_report(results, version, is_publish=is_publish)
    print_timing(results)
    if report:
        rel = os.path.relpath(report, PROJECT_ROOT)
        ok(f"Report: {C.WHITE}{rel}{C.RESET}")


_STEP_EXIT_CODES = {
    "Node.js": ExitCode.PREREQUISITE_FAILED,
    "git": ExitCode.PREREQUISITE_FAILED,
    "vsce": ExitCode.PREREQUISITE_FAILED,
    "GitHub CLI": ExitCode.PREREQUISITE_FAILED,
    "Working tree": ExitCode.WORKING_TREE_DIRTY,
    "Remote sync": ExitCode.REMOTE_SYNC_FAILED,
    "Dependencies": ExitCode.DEPENDENCY_FAILED,
    "Lint": ExitCode.LINT_FAILED,
    "Type check": ExitCode.LINT_FAILED,
    "Tests": ExitCode.TEST_FAILED,
    "File line limits": ExitCode.QUALITY_FAILED,
    "Version validation": ExitCode.VERSION_INVALID,
    "Git commit & push": ExitCode.GIT_FAILED,
    "Git tag": ExitCode.GIT_FAILED,
    "Dry run": ExitCode.PUBLISH_FAILED,
    "Marketplace publish": ExitCode.PUBLISH_FAILED,
    "GitHub release": ExitCode.RELEASE_FAILED,
}


def _exit_code_from_results(
    results: list[tuple[str, bool, float]],
) -> int:
    """Derive an exit code from the last failing step name."""
    for name, passed, _ in reversed(results):
        if not passed:
            return _STEP_EXIT_CODES.get(name, 1)
    return 1


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


def _main_inner(
    args: argparse.Namespace,
    version: str,
) -> int:
    """Run the analysis + publish pipeline."""
    results: list[tuple[str, bool, float]] = []

    # ── ANALYSIS PHASE ──
    version, passed = _run_analysis(args, results)
    if not passed:
        _save_and_show_report(results, version or "unknown")
        return _exit_code_from_results(results)

    # ── ANALYZE-ONLY: dry-run + stop ──
    if args.analyze_only:
        heading("Dry Run")
        dry_ok = run_step("Dry run", step_dry_run, results)
        _save_and_show_report(results, version)
        if not dry_ok:
            return _exit_code_from_results(results)
        return ExitCode.SUCCESS

    # ── PUBLISH PHASE ──
    heading("Publish Confirmation")
    if not confirm_publish(version):
        info("Publish cancelled by user.")
        return ExitCode.USER_CANCELLED

    if not _run_publish(version, results):
        _save_and_show_report(results, version)
        return _exit_code_from_results(results)

    _save_and_show_report(results, version, is_publish=True)
    print_success_banner(version)
    return ExitCode.SUCCESS


if __name__ == "__main__":
    sys.exit(main())
