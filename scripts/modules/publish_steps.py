"""Irreversible publish operations."""

import getpass
import os
import re
import shutil
import subprocess
import sys

from .constants import C, MARKETPLACE_URL, PROJECT_ROOT, REPO_URL
from .display import ask_yn, fail, heading, info, ok, warn
from .utils import get_ovsx_pat, is_version_tagged, run, run_step
from .packaging import (
    get_marketplace_published_version,
    publish_marketplace,
    publish_openvsx,
)


def check_gh_cli() -> bool:
    """Verify GitHub CLI is installed and authenticated."""
    if not shutil.which("gh"):
        fail("GitHub CLI (gh) is not installed")
        info(f"  Install from {C.CYAN}https://cli.github.com/{C.RESET}")
        return False
    try:
        result = run("gh auth status", timeout=10)
    except subprocess.TimeoutExpired:
        fail("GitHub CLI auth check timed out (10s)")
        return False
    if result.returncode != 0:
        fail(f"GitHub CLI not authenticated — run: {C.WHITE}gh auth login{C.RESET}")
        return False
    ok("GitHub CLI authenticated")
    return True


def check_vsce_pat() -> bool:
    """Verify vsce PAT; run vsce login interactively if expired."""
    info("Checking marketplace credentials...")
    result = run("npx @vscode/vsce verify-pat saropa")
    if result.returncode == 0:
        ok("Marketplace PAT verified for 'saropa'")
        return True

    # verify-pat may not exist in older vsce versions
    stderr = (result.stderr or "").lower()
    if "unknown command" in stderr or "not a vsce command" in stderr:
        warn("Could not verify PAT (vsce verify-pat not available)")
        return True

    info("Marketplace PAT expired or missing. Running vsce login...")
    info(f"  PAT from: {C.WHITE}https://dev.azure.com{C.RESET} → "
         f"User Settings → Personal Access Tokens")
    login = subprocess.run(
        ["npx", "@vscode/vsce", "login", "saropa"],
        cwd=PROJECT_ROOT,
        shell=(sys.platform == "win32"),
    )
    if login.returncode != 0:
        fail("vsce login failed or was cancelled")
        return False

    # Re-verify after login
    result = run("npx @vscode/vsce verify-pat saropa")
    if result.returncode == 0:
        ok("Marketplace PAT verified for 'saropa'")
        return True
    fail("No valid PAT found for publisher 'saropa'")
    return False


def check_ovsx_token() -> bool:
    """Check OVSX_PAT for Open VSX. Non-blocking: will prompt at publish."""
    pat = get_ovsx_pat()
    if pat:
        ok("OVSX_PAT set (Open VSX publish)")
        return True
    warn("OVSX_PAT not set; will prompt at publish time or skip.")
    info(f"  To avoid prompt: add {C.YELLOW}OVSX_PAT=your-token{C.RESET}"
         f" to {C.WHITE}.env{C.RESET}")
    return True


def confirm_publish(version: str) -> bool:
    """Show summary and require explicit confirmation."""
    print(f"""
  {C.BOLD}Publish Summary{C.RESET}
  ─────────────────────────────────
  Version:     {C.CYAN}v{version}{C.RESET}
  Marketplace: {MARKETPLACE_URL}
  Repository:  {REPO_URL}

  {C.YELLOW}This will:{C.RESET}
    1. Commit and push to origin
    2. Create git tag v{version}
    3. Publish to VS Code Marketplace
    4. Publish to Open VSX (if token set)
    5. Create GitHub release
""")
    return ask_yn("Proceed with publish?")


def git_commit_and_push(version: str) -> bool:
    """Step 10: Stage, commit, and push."""
    run("git add -A")
    result = run(f'git commit -m "release: v{version}"')
    if result.returncode != 0:
        # Nothing to commit is ok
        if "nothing to commit" in (result.stdout or ""):
            info("Nothing to commit")
        else:
            fail("git commit failed")
            if result.stderr:
                print(result.stderr)
            return False

    return _push_to_origin()


def _push_to_origin() -> bool:
    """Push current branch to origin (detects branch dynamically)."""
    branch = run("git rev-parse --abbrev-ref HEAD").stdout.strip() or "main"
    result = run(f"git push origin {branch}")
    if result.returncode == 0:
        ok(f"Pushed to origin/{branch}")
        return True

    if "non-fast-forward" in (result.stderr or ""):
        info("Non-fast-forward — rebasing and retrying...")
        pull = run(f"git pull --rebase origin {branch}")
        if pull.returncode != 0:
            run("git rebase --abort")
            fail("git pull --rebase failed — resolve manually")
            return False
        retry = run(f"git push origin {branch}")
        if retry.returncode == 0:
            ok(f"Pushed to origin/{branch} (after rebase)")
            return True

    fail("git push failed")
    if result.stderr:
        print(result.stderr)
    return False


def create_git_tag(version: str) -> bool:
    """Step 11: Create and push annotated tag."""
    result = run(
        f'git tag -a v{version} -m "Release v{version}"',
    )
    if result.returncode != 0:
        fail(f"Failed to create tag v{version}")
        return False

    push = run(f"git push origin v{version}")
    if push.returncode != 0:
        fail("Failed to push tag")
        return False

    ok(f"Tagged and pushed v{version}")
    return True


def extract_changelog_section(version: str) -> str:
    """Extract the CHANGELOG section for a specific version."""
    changelog = os.path.join(PROJECT_ROOT, "CHANGELOG.md")
    if not os.path.isfile(changelog):
        return f"Release v{version}"

    with open(changelog, encoding="utf-8") as f:
        text = f.read()

    pattern = rf"##\s+\[?{re.escape(version)}\]?.*?\n(.*?)(?=\n##\s|\Z)"
    match = re.search(pattern, text, re.DOTALL)
    return match.group(1).strip() if match else f"Release v{version}"


def create_github_release(version: str, vsix_path: str | None = None) -> bool:
    """Create GitHub release with CHANGELOG notes and optional .vsix."""
    check = run(f"gh release view v{version}")
    if check.returncode == 0:
        info(f"Release v{version} already exists — skipping")
        return True

    notes = extract_changelog_section(version)
    vsix_arg = f" {vsix_path}" if vsix_path else ""
    result = run(
        f'gh release create v{version}{vsix_arg} '
        f'--title "v{version}" '
        f'--notes "{notes}"',
    )

    if result.returncode != 0:
        fail("GitHub release creation failed")
        if result.stderr:
            print(result.stderr)
        _print_gh_troubleshooting()
        return False

    ok(f"GitHub release v{version} created")
    return True


def check_publish_credentials(
    results: list[tuple[str, bool, float]],
    stores: str = "both",
) -> bool:
    """Verify credentials for chosen store(s)."""
    heading("Publish Credentials")
    if not run_step("GitHub CLI", check_gh_cli, results):
        return False
    if stores in ("both", "vscode_only"):
        if not run_step("vsce PAT", check_vsce_pat, results):
            return False
    else:
        info("Skipping vsce PAT (Open VSX only).")
    if stores in ("both", "openvsx_only"):
        run_step("OVSX PAT", check_ovsx_token, results)
    else:
        info("Skipping OVSX PAT (Marketplace only).")
    return True


def commit_and_tag(
    version: str,
    results: list[tuple[str, bool, float]],
) -> bool:
    """Steps 11-12: Git commit, push, and tag."""
    if is_version_tagged(version):
        heading("Step 11 · Git Commit & Push")
        info(f"Tag v{version} already exists; skipping commit & tag.")
        heading("Step 12 · Git Tag")
        info("Skipped (tag exists).")
        return True

    heading("Step 11 · Git Commit & Push")
    if not run_step("Git commit & push",
                    lambda: git_commit_and_push(version), results):
        return False
    heading("Step 12 · Git Tag")
    return run_step("Git tag",
                    lambda: create_git_tag(version), results)


def publish_to_stores(
    version: str,
    vsix_path: str,
    results: list[tuple[str, bool, float]],
    stores: str = "both",
) -> bool:
    """Steps 13-15: Marketplace, Open VSX, GitHub release."""
    if not _publish_marketplace_step(version, vsix_path, results, stores):
        return False

    heading("Step 14 · Publish to Open VSX")
    if stores == "vscode_only":
        info("Skipping (Marketplace only).")
    else:
        _publish_openvsx_step(vsix_path, results)

    heading("Step 15 · GitHub Release")
    if not run_step("GitHub release",
                    lambda: create_github_release(version, vsix_path),
                    results):
        warn("GitHub release failed.")
    return True


def _publish_marketplace_step(
    version: str,
    vsix_path: str,
    results: list[tuple[str, bool, float]],
    stores: str,
) -> bool:
    """Step 13: Publish to VS Code Marketplace."""
    heading("Step 13 · Publish to Marketplace")
    if stores == "openvsx_only":
        info("Skipping (Open VSX only).")
        return True
    published = get_marketplace_published_version()
    if published == version:
        info(f"Marketplace already has v{version}; skipping.")
        return True
    return run_step("Marketplace publish",
                    lambda: publish_marketplace(vsix_path), results)


def _publish_openvsx_step(
    vsix_path: str,
    results: list[tuple[str, bool, float]],
) -> None:
    """Publish to Open VSX, prompting for token if missing."""
    pat = get_ovsx_pat()
    if not pat:
        try:
            info(f"Token page: {C.WHITE}"
                 f"https://open-vsx.org/user-settings/tokens{C.RESET}")
            pat = (getpass.getpass(
                prompt="  Paste Open VSX token or Enter to skip: ",
            ) or "").strip()
            if pat:
                os.environ["OVSX_PAT"] = pat
                _save_ovsx_pat_to_env(pat)
        except (EOFError, KeyboardInterrupt):
            pat = ""
    if not pat:
        info("No token; skipping Open VSX.")
        return
    if not run_step("Open VSX publish",
                    lambda: publish_openvsx(vsix_path), results):
        warn("Open VSX publish failed; continuing to GitHub release.")


def _save_ovsx_pat_to_env(pat: str) -> None:
    """Append OVSX_PAT to .env so it persists across runs."""
    env_path = os.path.join(PROJECT_ROOT, ".env")
    try:
        existing = ""
        if os.path.exists(env_path):
            with open(env_path, encoding="utf-8") as f:
                existing = f.read()
        if "OVSX_PAT=" in existing:
            info("OVSX_PAT already in .env — not overwriting.")
            return
        with open(env_path, "a", encoding="utf-8") as f:
            if existing and not existing.endswith("\n"):
                f.write("\n")
            f.write(f"OVSX_PAT={pat}\n")
        info(f"Saved OVSX_PAT to {C.WHITE}.env{C.RESET}")
    except OSError:
        warn("Could not save OVSX_PAT to .env")


def _print_gh_troubleshooting() -> None:
    """Print hints for GitHub release failures."""
    warn("Check auth: gh auth status")
    warn("If GITHUB_TOKEN env var is set, it may conflict")
