"""Low-level shell and file operations."""

import json
import os
import re
import shutil
import subprocess
import sys
import time

from .constants import MARKETPLACE_EXTENSION_ID, PROJECT_ROOT
from .display import fail, info, ok


def run(
    cmd: str | list[str],
    capture: bool = True,
    cwd: str | None = None,
    timeout: int | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a shell command. Uses shell=True on Windows for .cmd resolution.

    On Windows, applies STARTF_USESHOWWINDOW + SW_HIDE to suppress
    console/editor windows that CLI tools like `code` may briefly spawn.
    """
    use_shell = isinstance(cmd, str) or sys.platform == "win32"
    kwargs: dict = {}
    if sys.platform == "win32":
        si = subprocess.STARTUPINFO()
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        si.wShowWindow = subprocess.SW_HIDE
        kwargs["startupinfo"] = si
    return subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        cwd=cwd or PROJECT_ROOT,
        shell=use_shell,
        timeout=timeout,
        **kwargs,
    )


def read_package_version() -> str:
    """Read version from package.json."""
    pkg = os.path.join(PROJECT_ROOT, "package.json")
    with open(pkg, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("version", "0.0.0")


def write_package_version(version: str) -> None:
    """Write version to package.json."""
    pkg = os.path.join(PROJECT_ROOT, "package.json")
    with open(pkg, encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = version
    with open(pkg, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def is_version_tagged(version: str) -> bool:
    """Check if git tag v{version} exists."""
    result = run(f"git tag -l v{version}")
    return result.stdout.strip() == f"v{version}"


def elapsed_str(seconds: float) -> str:
    """Format duration as '1.2s' or '500ms'."""
    if seconds < 1:
        return f"{int(seconds * 1000)}ms"
    return f"{seconds:.1f}s"


def run_step(
    name: str,
    fn: callable,
    results: list[tuple[str, bool, float]],
) -> bool:
    """Run a step function, record timing and result."""
    t0 = time.time()
    try:
        passed = fn()
    except Exception as exc:
        fail(f"{name}: {exc}")
        passed = False
    elapsed = time.time() - t0
    results.append((name, passed, elapsed))
    return passed


def bump_patch(version: str) -> str:
    """Bump the patch component of a semver string."""
    match = re.match(r"^(\d+)\.(\d+)\.(\d+)", version)
    if not match:
        return version
    major, minor, patch = match.groups()
    return f"{major}.{minor}.{int(patch) + 1}"


def get_ovsx_pat() -> str:
    """Return OVSX_PAT from environment or from project .env file.

    .env is in .gitignore; use one line: OVSX_PAT=your-token
    """
    pat = os.environ.get("OVSX_PAT", "").strip()
    if pat:
        return pat
    env_path = os.path.join(PROJECT_ROOT, ".env")
    try:
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("OVSX_PAT="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


# Cache for `editor --list-extensions --show-versions` output.
# Keyed by editor name ("code", "cursor"). Each CLI call can spawn
# a window on Windows, so we cache to call at most once per editor.
_extensions_cache: dict[str, set[str]] = {}


def list_editor_extensions(editor: str = "code") -> set[str]:
    """Return cached set of lowercase extension lines from the editor CLI.

    Each line looks like 'publisher.name@version'. Returns empty set
    if the CLI isn't available or the command fails.
    """
    if editor in _extensions_cache:
        return _extensions_cache[editor]
    if not shutil.which(editor):
        _extensions_cache[editor] = set()
        return set()
    result = run([editor, "--list-extensions", "--show-versions"])
    if result.returncode != 0:
        _extensions_cache[editor] = set()
        return set()
    lines = set(result.stdout.strip().lower().splitlines())
    _extensions_cache[editor] = lines
    return lines


def get_installed_extension_versions() -> dict[str, str]:
    """Return installed version per editor: {"code": "0.1.0"}.

    Uses cached CLI output so each editor is queried at most once.
    """
    out: dict[str, str] = {}
    prefix = f"{MARKETPLACE_EXTENSION_ID.lower()}@"
    for editor in ("code", "cursor"):
        for line in list_editor_extensions(editor):
            if line.startswith(prefix):
                version = line[len(prefix):].strip()
                if version:
                    out[editor] = version
                break
    return out
