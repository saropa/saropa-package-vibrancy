#!/usr/bin/env python3
"""Saropa Package Vibrancy — Developer Toolkit & Publish Pipeline.

Orchestrates a multi-step pipeline for building, validating, packaging,
and publishing the VS Code extension. Two modes are supported:

  - Analyze-only: Steps 1-10 (prerequisites, environment checks, git state,
    dependencies, compile, test, quality, version validation) then package
    the .vsix and offer local install.

  - Publish: All analysis steps above, plus steps 11-15 (credential checks,
    git commit/tag, publish to VS Code Marketplace, Open VSX, and GitHub
    Releases).

Each step's result (name, pass/fail, elapsed time) is accumulated in a
results list for report generation and exit-code determination.

Usage:
    python scripts/publish.py                 # Interactive mode selection
    python scripts/publish.py --analyze-only  # Skip publish, just build & test
    python scripts/publish.py --yes           # CI mode, auto-accept all prompts
"""

import argparse
import os
import sys
import time
import webbrowser

# --- ANSI colors, named exit codes, and project-root path ---
from modules.constants import (
    C, ExitCode, MARKETPLACE_URL, PROJECT_ROOT, exit_code_from_results,
)

# --- Terminal UI: prompts, colored output, ASCII logo ---
from modules.display import (
    ask_pipeline_mode,       # Interactive "analyze-only vs publish" chooser
    ask_publish_stores,      # Interactive store selection (Marketplace/OpenVSX/both)
    ask_yn,                  # Yes/no prompt with default
    dim,                     # Wrap text in ANSI dim (grey) styling
    heading,                 # Print a blue section heading with separators
    info,                    # Print an "[INFO]" prefixed message in cyan
    show_logo,               # Print the Saropa ASCII art banner
)

# --- Low-level utilities: subprocess execution, version I/O, step runner ---
from modules.utils import (
    get_installed_extension_versions,  # {editor: version} for locally installed ext
    read_package_version,              # Read "version" from package.json
    run,                               # Execute a shell command via subprocess
    run_step,                          # Run a check function, time it, record result
)

# --- Report generation: stdout tee-to-file, timing charts, success banner ---
from modules.report import (
    close_publish_log,       # Stop teeing stdout and close the log file
    ensure_utf8_stdout,      # Reconfigure stdout to UTF-8 on Windows
    open_publish_log,        # Start teeing stdout to reports/<date>/<log>.log
    print_success_banner,    # Green box with version + marketplace URLs
    print_timing,            # Proportional bar chart of step durations
    save_report,             # Write timestamped analysis/publish report to disk
)

# --- Step 1: Prerequisite tool checks (Node.js ≥18, git, vsce) ---
from modules.checks_prereqs import check_git, check_node, check_vsce

# --- Steps 2-3: Dev environment checks (global npm pkgs, VS Code extensions) ---
from modules.checks_environment import (
    check_global_npm_packages,   # Verify/auto-install yo, generator-code
    check_vscode_cli,            # Check "code" CLI on PATH (non-blocking)
    check_vscode_extensions,     # Verify/auto-install required VS Code extensions
)

# --- Steps 4-9: Project state validation (git, deps, build, quality) ---
from modules.checks_project import (
    check_file_line_limits,   # Warn if any src/*.ts file exceeds 300 lines
    check_known_issues_data,  # Validate knownIssues.json (no dupes, valid dates)
    check_remote_sync,        # Fetch origin, auto-pull if behind upstream
    check_working_tree,       # Warn if uncommitted changes exist
    ensure_dependencies,      # Run npm install if node_modules stale or missing
    step_compile,             # Run npm run check-types (TypeScript type checking)
    step_lint,                # Run npm run lint (ESLint)
    step_test,                # Run npm test (Mocha suite)
)

# --- Step 10: Version & CHANGELOG validation, conflict resolution ---
from modules.checks_version import validate_version_changelog

# --- Steps 11-15: Irreversible publish operations ---
from modules.publish_steps import (
    check_publish_credentials,  # Verify PATs for Marketplace, Open VSX, GitHub CLI
    commit_and_tag,             # Git commit "release: vX.Y.Z" + annotated tag
    confirm_publish,            # Print summary and ask for final confirmation
    publish_to_stores,          # Push to Marketplace, Open VSX, and GitHub Releases
)

# --- Packaging: build .vsix via vsce ---
from modules.packaging import step_package

# --- Post-publish: poll marketplaces to confirm version went live ---
from modules.verify_publish import verify_publish

# --- Post-analysis: local install prompts and report viewer ---
from modules.install import (
    print_install_instructions,  # Print 3 ways to install the .vsix locally
    prompt_install,              # Offer auto-install via "code --install-extension"
    prompt_open_report,          # Offer to open the report file in OS viewer
)

# Each tuple is (flag, help-text) fed to argparse. Flags are converted to
# snake_case attributes on the Namespace (e.g. --analyze-only → args.analyze_only).
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
    """Print the script banner.

    Shows either the full ASCII art logo or a compact one-liner
    (when --no-logo is set), followed by the project root path.
    """
    if not args.no_logo:
        show_logo(version)  # Gradient-colored ASCII art + version
    else:
        # Compact fallback: bold name + dimmed version on one line
        print(f"\n  {C.BOLD}Saropa Package Vibrancy{C.RESET}"
              f"  {dim(f'v{version}')}")
    print(f"  Project root: {dim(PROJECT_ROOT)}")


def _run_prerequisites(
    results: list[tuple[str, bool, float]],
) -> bool:
    """Step 1: Verify required CLI tools are installed.

    Checks Node.js (≥18), git, vsce (via npx), and the VS Code "code" CLI.
    Each check is timed and recorded. Fails fast on the first missing tool
    since later steps depend on all of them.
    """
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
    """Steps 2-6: Dev environment, git state, and dependency checks.

    Steps 2 and 3 are skippable via CLI flags (useful in CI or when the
    "code" CLI is unavailable). Steps 4-6 are mandatory:
      - Step 4: Warn on uncommitted changes (interactive continue prompt)
      - Step 5: Fetch origin and auto-pull if behind upstream
      - Step 6: Run npm install if node_modules is stale or missing
    """
    # Step 2: Verify/auto-install global npm packages (yo, generator-code)
    if args.skip_global_npm:
        heading("Step 2 · Global npm Packages (skipped)")
    else:
        heading("Step 2 · Global npm Packages")
        if not run_step("Global npm pkgs",
                        check_global_npm_packages, results):
            return False

    # Step 3: Verify/auto-install required VS Code dev extensions
    if args.skip_extensions:
        heading("Step 3 · VS Code Extensions (skipped)")
    else:
        heading("Step 3 · VS Code Extensions")
        if not run_step("VS Code extensions",
                        check_vscode_extensions, results):
            return False

    # Step 4: Check for uncommitted changes (warns, asks to continue)
    heading("Step 4 · Working Tree")
    if not run_step("Working tree", check_working_tree, results):
        return False

    # Step 5: Ensure local branch is up-to-date with remote
    heading("Step 5 · Remote Sync")
    if not run_step("Remote sync", check_remote_sync, results):
        return False

    # Step 6: Ensure node_modules matches package.json
    heading("Step 6 · Dependencies")
    if not run_step("Dependencies", ensure_dependencies, results):
        return False

    return True


def _run_build_and_validate(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> tuple[str, bool]:
    """Steps 7-10: Build the project and validate quality.

    Returns (version, passed). The version string comes from step 10's
    CHANGELOG/package.json validation — it may differ from the initial
    package.json value if the user accepted a version bump during
    conflict resolution.
    """
    # Step 7: ESLint + TypeScript type checking (both must pass)
    heading("Step 7 · Lint & Compile")
    if not run_step("Lint", step_lint, results):
        return "", False
    if not run_step("Type check", step_compile, results):
        return "", False

    # Step 8: Mocha test suite (skippable via --skip-tests)
    if args.skip_tests:
        heading("Step 8 · Tests (skipped)")
    else:
        heading("Step 8 · Tests")
        if not run_step("Tests", step_test, results):
            return "", False

    # Step 9: Non-functional quality gates
    heading("Step 9 · Quality Checks")
    if not run_step("File line limits", check_file_line_limits, results):
        return "", False
    if not run_step("Known issues data", check_known_issues_data, results):
        return "", False

    # Step 10: Validate version ↔ CHANGELOG consistency, resolve conflicts,
    # stamp the [Unreleased] section, and ensure the git tag is unique.
    # Timed manually because validate_version_changelog() is interactive
    # and doesn't follow the simple bool-return convention of run_step().
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
    """Run all analysis steps (1-10). Returns (version, passed).

    Composes the three phase groups in order: prerequisites → dev checks
    → build & validate. Fails fast if any phase fails — remaining phases
    are skipped and partial results are still available for reporting.
    """
    if not _run_prerequisites(results):
        return "", False
    if not _run_dev_checks(args, results):
        return "", False
    return _run_build_and_validate(args, results)


def _package_and_install(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> str | None:
    """Package .vsix and offer local install. Returns vsix path or None.

    Runs `vsce package`, then shows the user which editors already have the
    extension installed (code, cursor) and offers to install the new .vsix.
    With --auto-install, skips the prompt and installs immediately.
    """
    heading("Package")
    # Timed manually since step_package() returns a path (not bool)
    t0 = time.time()
    vsix_path = step_package()
    elapsed = time.time() - t0
    results.append(("Package", vsix_path is not None, elapsed))
    if not vsix_path:
        return None

    heading("Local Install")
    # Show which editors already have the extension installed
    installed = get_installed_extension_versions()
    if installed:
        parts = [f"{ed} v{ver}" for ed, ver in sorted(installed.items())]
        info(f"Installed locally: {', '.join(parts)}")
    else:
        info("Not installed in VS Code or Cursor.")

    # Print manual install instructions (Command Palette, CLI, drag-drop)
    print_install_instructions(vsix_path)

    if args.auto_install:
        # CI/headless mode: install without prompting
        info(f"Running: code --install-extension {os.path.basename(vsix_path)}")
        run(["code", "--install-extension", os.path.abspath(vsix_path)])
    else:
        # Interactive: ask the user if they want to auto-install
        prompt_install(vsix_path)
    return vsix_path


def _save_and_show_report(
    results: list[tuple[str, bool, float]],
    version: str,
    vsix_path: str | None = None,
    is_publish: bool = False,
) -> str | None:
    """Save a timestamped report and print a timing bar chart.

    Reports are written to reports/<YYYYMMDD>/ with filenames encoding
    the timestamp and whether this was an analysis or publish run.
    Returns the report file path, or None if saving failed.
    """
    report = save_report(results, version, vsix_path, is_publish=is_publish)
    print_timing(results)  # Proportional bar chart of step durations
    if report:
        rel = os.path.relpath(report, PROJECT_ROOT)
        info(f"Report: {C.WHITE}{rel}{C.RESET}")
    return report


def main() -> int:
    """Main entry point — analyze + publish pipeline.

    Sets up the environment (UTF-8 stdout, CI auto-yes, stdout tee-to-log),
    then delegates to _main_inner(). The publish log is always closed in
    the finally block, even if the pipeline raises an exception.
    """
    ensure_utf8_stdout()           # Fix Windows console encoding
    args = parse_args()
    version = read_package_version()  # Current version from package.json

    if args.yes:
        # Set env var so all interactive prompts (ask_yn, ask_pipeline_mode,
        # etc.) auto-accept their defaults without waiting for user input.
        os.environ["PUBLISH_YES"] = "1"

    _print_banner(args, version)
    open_publish_log()  # Start teeing stdout to reports/<date>/publish.log
    try:
        return _main_inner(args, version)
    finally:
        close_publish_log()  # Always close the log, even on crash


def _main_inner(args: argparse.Namespace, version: str) -> int:
    """Run the analysis + optional publish pipeline.

    Flow:
      1. Choose mode (analyze-only or analyze+publish)
      2. Run analysis steps 1-10; bail with report on failure
      3. Package .vsix and offer local install; bail if packaging fails
      4. If analyze-only: save report, offer to open it, exit 0
      5. If publish: delegate to _main_publish() for steps 11-15

    Returns an ExitCode int suitable for sys.exit().
    """
    # Accumulates (step_name, passed, elapsed_seconds) for every step
    results: list[tuple[str, bool, float]] = []

    # Determine pipeline mode: --analyze-only flag or interactive prompt
    mode = "analyze" if args.analyze_only else ask_pipeline_mode()

    # --- Analysis phase (steps 1-10) ---
    version, passed = _run_analysis(args, results)
    if not passed:
        # Save partial report so the user can see which step failed
        _save_and_show_report(results, version or "unknown")
        return exit_code_from_results(results)

    # --- Package phase ---
    vsix_path = _package_and_install(args, results)
    if not vsix_path:
        _save_and_show_report(results, version)
        return ExitCode.PACKAGE_FAILED

    # --- Analyze-only: done after packaging ---
    if mode == "analyze":
        report = _save_and_show_report(results, version, vsix_path)
        if report:
            prompt_open_report(report)  # Offer to open in OS file viewer
        return ExitCode.SUCCESS

    # --- Publish mode: continue to steps 11-15 ---
    return _main_publish(version, vsix_path, results)


def _main_publish(
    version: str,
    vsix_path: str,
    results: list[tuple[str, bool, float]],
) -> int:
    """Handle the publish flow: confirmation → credentials → push → release.

    Prompts for final confirmation, selects target stores, then runs the
    irreversible publish steps. On success, prints a green banner with
    marketplace URLs and attempts to open the marketplace page in a browser.
    """
    heading("Publish Confirmation")
    if not confirm_publish(version):
        info("Publish cancelled by user.")
        return ExitCode.USER_CANCELLED

    # If the extension is already installed locally, publish to both stores
    # by default. Otherwise, let the user choose which store(s) to target.
    stores = "both"
    if not get_installed_extension_versions():
        stores = ask_publish_stores()

    if not _run_publish(version, vsix_path, results, stores):
        _save_and_show_report(results, version, vsix_path)
        return exit_code_from_results(results)

    # Poll marketplaces to confirm the new version is live
    run_step("Publish verification",
             lambda: verify_publish(version, stores), results)

    # All publish steps succeeded — save the final report and celebrate
    _save_and_show_report(results, version, vsix_path, is_publish=True)
    print_success_banner(version)
    if ask_yn("Open marketplace page in browser?", default=False):
        try:
            webbrowser.open(MARKETPLACE_URL)
        except Exception:
            pass
    return ExitCode.SUCCESS


def _run_publish(
    version: str,
    vsix_path: str,
    results: list[tuple[str, bool, float]],
    stores: str,
) -> bool:
    """Run publish steps (11-15). Returns True on success.

    Sequence:
      11. Verify credentials for target stores (PATs, gh auth)
      12. Git commit "release: vX.Y.Z" + annotated tag + push
      13-15. Publish to VS Code Marketplace, Open VSX, and GitHub Releases

    Note: Open VSX and GitHub Release failures are non-blocking —
    the pipeline continues and reports partial success.
    """
    if not check_publish_credentials(results, stores):
        return False
    if not commit_and_tag(version, results):
        return False
    return publish_to_stores(version, vsix_path, results, stores)


# Script entry point — exit code is propagated to the shell / CI runner
if __name__ == "__main__":
    sys.exit(main())
