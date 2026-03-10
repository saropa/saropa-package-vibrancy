"""Prerequisite tool validation checks."""

from .constants import C, MIN_NODE_MAJOR
from .display import fail, info, ok
from .utils import run


def check_node() -> bool:
    """Verify Node.js is installed and meets minimum version."""
    result = run("node --version")
    if result.returncode != 0:
        fail("Node.js not found")
        return False

    version = result.stdout.strip().lstrip("v")
    major = int(version.split(".")[0])
    if major < MIN_NODE_MAJOR:
        fail(f"Node.js {version} < required {MIN_NODE_MAJOR}.x")
        return False

    ok(f"Node.js {version}")
    return True


def check_npm() -> bool:
    """Verify npm is available."""
    result = run("npm --version")
    if result.returncode != 0:
        fail("npm not found (should ship with Node.js)")
        return False
    ok(f"npm {result.stdout.strip()}")
    return True


def check_git() -> bool:
    """Verify git is installed."""
    result = run("git --version")
    if result.returncode != 0:
        fail("git not found")
        return False
    ok(result.stdout.strip())
    return True


def check_vsce() -> bool:
    """Verify vsce is available."""
    result = run("npx vsce --version")
    if result.returncode != 0:
        fail(f"vsce not found — run: {C.WHITE}npm install -g @vscode/vsce{C.RESET}")
        return False
    ok(f"vsce {result.stdout.strip()}")
    return True
