"""Dev environment checks (VS Code CLI, global npm packages, extensions).

VS Code CLI, global npm packages, and VS Code extensions are
developer conveniences — non-blocking warnings if unavailable,
but will auto-install if missing and the tools are reachable.
"""

import json
import shutil

from .constants import (
    C,
    REQUIRED_GLOBAL_NPM_PACKAGES,
    REQUIRED_VSCODE_EXTENSIONS,
)
from .display import fail, fix, info, ok, warn
from .utils import list_editor_extensions, run


def check_vscode_cli() -> bool:
    """Verify the 'code' CLI is available (non-blocking).

    The code CLI is needed for auto-installing .vsix files and
    VS Code extensions. If missing, the user can still install manually.
    """
    if not shutil.which("code"):
        warn("VS Code CLI (code) not found on PATH.")
        info(f"  Open VS Code → {C.YELLOW}Ctrl+Shift+P{C.RESET} → "
             f"'{C.WHITE}Shell Command: Install code command in PATH{C.RESET}'")
        return True  # non-blocking
    ok("VS Code CLI (code) available on PATH")
    return True


def check_global_npm_packages() -> bool:
    """Check and install required global npm packages."""
    result = run(["npm", "list", "-g", "--depth=0", "--json"])

    installed: set[str] = set()
    if result.returncode == 0:
        try:
            data = json.loads(result.stdout)
            installed = set(data.get("dependencies", {}).keys())
        except json.JSONDecodeError:
            pass

    all_ok = True
    for pkg in REQUIRED_GLOBAL_NPM_PACKAGES:
        if pkg in installed:
            ok(f"npm global: {C.WHITE}{pkg}{C.RESET}")
        else:
            all_ok = _install_npm_package(pkg) and all_ok
    return all_ok


def _install_npm_package(pkg: str) -> bool:
    """Auto-install a single global npm package."""
    fix(f"Installing global npm package: {C.WHITE}{pkg}{C.RESET}")
    result = run(["npm", "install", "-g", pkg])
    if result.returncode != 0:
        fail(f"Failed to install {pkg}: {(result.stderr or '').strip()}")
        return False
    ok(f"Installed: {C.WHITE}{pkg}{C.RESET}")
    return True


def check_vscode_extensions() -> bool:
    """Check and install required VS Code extensions.

    Skips silently if the 'code' CLI isn't available. Uses the cached
    extension list to avoid spawning extra VS Code windows on Windows.
    """
    if not shutil.which("code"):
        warn("Skipping VS Code extension check — 'code' CLI not available.")
        return True

    ext_lines = list_editor_extensions("code")
    installed = {line.split("@")[0] for line in ext_lines}

    all_ok = True
    for ext in REQUIRED_VSCODE_EXTENSIONS:
        if ext.lower() in installed:
            ok(f"VS Code extension: {C.WHITE}{ext}{C.RESET}")
        else:
            all_ok = _install_vscode_extension(ext) and all_ok
    return all_ok


def _install_vscode_extension(ext: str) -> bool:
    """Auto-install a single VS Code extension."""
    fix(f"Installing VS Code extension: {C.WHITE}{ext}{C.RESET}")
    result = run(["code", "--install-extension", ext])
    if result.returncode != 0:
        fail(f"Failed to install {ext}: {(result.stderr or '').strip()}")
        return False
    ok(f"Installed: {C.WHITE}{ext}{C.RESET}")
    return True
