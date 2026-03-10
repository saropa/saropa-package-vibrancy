"""Extension packaging and marketplace publish operations."""

import glob
import json
import os

from .constants import C, MARKETPLACE_EXTENSION_ID, PROJECT_ROOT
from .display import fail, info, ok
from .utils import get_ovsx_pat, run


def step_package() -> str | None:
    """Package the extension into a .vsix file. Returns the file path."""
    info("Packaging .vsix file...")
    result = run("npx @vscode/vsce package --no-dependencies")
    if result.returncode != 0:
        fail("Packaging failed")
        if result.stdout and result.stdout.strip():
            print(result.stdout)
        if result.stderr and result.stderr.strip():
            print(result.stderr)
        return None

    # Pick the most recently modified .vsix
    pattern = os.path.join(PROJECT_ROOT, "*.vsix")
    vsix_files = sorted(glob.glob(pattern), key=os.path.getmtime)
    if not vsix_files:
        fail("No .vsix file found after packaging")
        return None

    vsix_path = vsix_files[-1]
    size_kb = os.path.getsize(vsix_path) / 1024
    ok(f"Created: {os.path.basename(vsix_path)} ({size_kb:.0f} KB)")
    return vsix_path


def get_marketplace_published_version() -> str | None:
    """Return latest marketplace version via vsce show --json."""
    result = run(f"npx @vscode/vsce show {MARKETPLACE_EXTENSION_ID} --json")
    if result.returncode != 0 or not result.stdout.strip():
        return None
    try:
        data = json.loads(result.stdout)
        versions = data.get("versions")
        if versions and isinstance(versions, list) and versions:
            first = versions[0]
            if isinstance(first, dict) and "version" in first:
                return str(first["version"]).strip()
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def publish_marketplace(vsix_path: str) -> bool:
    """Publish pre-built .vsix to VS Code Marketplace."""
    info(f"Publishing {os.path.basename(vsix_path)} to marketplace...")
    result = run(f"npx @vscode/vsce publish --packagePath {vsix_path}")
    if result.returncode != 0:
        fail("Marketplace publish failed")
        if result.stdout and result.stdout.strip():
            print(result.stdout)
        if result.stderr and result.stderr.strip():
            print(result.stderr)
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


def publish_openvsx(vsix_path: str) -> bool:
    """Publish pre-built .vsix to Open VSX (Cursor/VSCodium)."""
    pat = get_ovsx_pat()
    if not pat:
        fail("OVSX_PAT is not set")
        info(f"  Create a token: {C.WHITE}https://open-vsx.org/user-settings/tokens{C.RESET}")
        return False
    info(f"Publishing {os.path.basename(vsix_path)} to Open VSX...")
    result = run(f"npx ovsx publish {vsix_path} -p {pat}")
    if result.returncode != 0:
        fail("Open VSX publish failed")
        if result.stdout and result.stdout.strip():
            print(result.stdout)
        if result.stderr and result.stderr.strip():
            print(result.stderr)
        return False
    ok("Published to Open VSX")
    return True
