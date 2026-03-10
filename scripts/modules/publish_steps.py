"""Irreversible publish operations."""

import re
import os

from .constants import C, MARKETPLACE_URL, PROJECT_ROOT, REPO_URL
from .display import ask_yn, fail, info, ok, warn
from .utils import run


def check_gh_cli() -> bool:
    """Step 9a: Verify GitHub CLI is authenticated."""
    result = run("gh auth status")
    if result.returncode != 0:
        fail("GitHub CLI not authenticated — run: gh auth login")
        return False
    ok("GitHub CLI authenticated")
    return True


def check_vsce_pat() -> bool:
    """Step 9b: Verify vsce Personal Access Token is valid."""
    result = run("npx vsce verify-pat saropa")
    if result.returncode == 0:
        ok("vsce PAT verified for publisher 'saropa'")
        return True

    fail("vsce PAT is missing or expired")
    print(f"""
  {C.YELLOW}To fix:{C.RESET}
    1. Go to {C.CYAN}https://dev.azure.com/saropa/_usersSettings/tokens{C.RESET}
    2. Create a PAT with scope: {C.WHITE}Marketplace > Manage{C.RESET}
       (click "Show all scopes" to find it)
    3. Run: {C.WHITE}npx vsce login saropa{C.RESET}
    4. Paste the token when prompted
""")
    return False


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
    4. Create GitHub release
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
    """Push to origin, handle non-fast-forward."""
    result = run("git push origin")
    if result.returncode == 0:
        ok("Pushed to origin")
        return True

    if "non-fast-forward" in (result.stderr or ""):
        info("Non-fast-forward — pulling and retrying...")
        pull = run("git pull --ff-only")
        if pull.returncode != 0:
            fail("git pull failed — resolve manually")
            return False
        retry = run("git push origin")
        if retry.returncode == 0:
            ok("Pushed to origin (after pull)")
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


def publish_to_marketplace() -> bool:
    """Step 12: Package and publish via vsce."""
    info("Packaging extension...")
    pkg = run("npx vsce package")
    if pkg.returncode != 0:
        fail("vsce package failed")
        if pkg.stderr:
            print(pkg.stderr)
        return False

    info("Publishing to VS Code Marketplace...")
    pub = run("npx vsce publish")
    if pub.returncode != 0:
        fail("vsce publish failed")
        if pub.stderr:
            print(pub.stderr)
        _print_vsce_troubleshooting()
        return False

    ok("Published to VS Code Marketplace")
    return True


def _print_vsce_troubleshooting() -> None:
    """Print hints for publish failures."""
    print(f"""
  {C.YELLOW}Troubleshooting:{C.RESET}
    - Ensure you have a Personal Access Token (PAT) for Azure DevOps
    - Run: npx vsce login saropa
    - See: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
""")


def extract_changelog_section(version: str) -> str:
    """Extract the CHANGELOG section for a specific version."""
    changelog = os.path.join(PROJECT_ROOT, "CHANGELOG.md")
    if not os.path.isfile(changelog):
        return f"Release v{version}"

    with open(changelog, encoding="utf-8") as f:
        text = f.read()

    pattern = rf"##\s+\[?{re.escape(version)}\]?.*?\n(.*?)(?=\n##\s|\Z)"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()

    return f"Release v{version}"


def create_github_release(version: str) -> bool:
    """Step 13: Create GitHub release with CHANGELOG notes."""
    # Check if release already exists
    check = run(f"gh release view v{version}")
    if check.returncode == 0:
        info(f"Release v{version} already exists — skipping")
        return True

    notes = extract_changelog_section(version)
    result = run(
        f'gh release create v{version} '
        f'--title "v{version}" '
        f'--notes "{notes}"',
    )

    if result.returncode != 0:
        fail("GitHub release creation failed")
        if result.stderr:
            print(result.stderr)
        return False

    ok(f"GitHub release v{version} created")
    return True


def step_dry_run() -> bool:
    """Dry-run: package without publishing."""
    info("Running vsce package (dry run)...")
    result = run("npx vsce package")
    if result.returncode != 0:
        fail("vsce package failed")
        if result.stderr:
            print(result.stderr)
        return False
    ok("Dry run passed — .vsix created")
    return True
