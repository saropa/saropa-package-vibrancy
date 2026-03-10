"""Low-level shell and file operations."""

import json
import os
import re
import subprocess
import sys
import time

from .constants import PROJECT_ROOT
from .display import fail, ok


def run(
    cmd: str | list[str],
    capture: bool = True,
    cwd: str | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a shell command. Uses shell=True on Windows for .cmd resolution."""
    use_shell = isinstance(cmd, str) or sys.platform == "win32"
    return subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        cwd=cwd or PROJECT_ROOT,
        shell=use_shell,
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
