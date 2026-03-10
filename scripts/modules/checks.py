"""Pre-flight and quality validation checks."""

import os
import re
import sys

from .constants import C, MAX_FILE_LINES, MIN_NODE_MAJOR, PROJECT_ROOT
from .display import ask_yn, dim, fail, info, ok, warn
from .utils import run


def check_node() -> bool:
    """Step 1a: Verify Node.js is installed and meets minimum version."""
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


def check_git() -> bool:
    """Step 1b: Verify git is installed."""
    result = run("git --version")
    if result.returncode != 0:
        fail("git not found")
        return False
    ok(result.stdout.strip())
    return True


def check_vsce() -> bool:
    """Step 1c: Verify vsce is available."""
    result = run("npx vsce --version")
    if result.returncode != 0:
        fail("vsce not found — run: npm install -g @vscode/vsce")
        return False
    ok(f"vsce {result.stdout.strip()}")
    return True


def check_working_tree() -> bool:
    """Step 2: Check for uncommitted changes."""
    result = run("git status --porcelain")
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        fail(f"git status failed: {stderr}" if stderr else "git status failed")
        return False

    changes = [
        line for line in result.stdout.strip().splitlines()
        if line.strip()
    ]
    if not changes:
        ok("Working tree clean")
        return True

    warn(f"{len(changes)} uncommitted change(s):")
    for line in changes[:10]:
        print(f"         {line}")
    return ask_yn("Continue with dirty working tree?")


def _has_origin_remote() -> bool:
    """Check whether a remote named 'origin' is configured."""
    result = run("git remote get-url origin")
    return result.returncode == 0


def check_remote_sync() -> bool:
    """Step 3: Fetch origin and check sync state."""
    if not _has_origin_remote():
        warn("No remote 'origin' configured — skipping sync")
        return True

    info("Fetching origin...")
    fetch = run("git fetch origin")
    if fetch.returncode != 0:
        stderr = (fetch.stderr or "").strip()
        fail(f"git fetch failed: {stderr}" if stderr else "git fetch failed")
        return False

    local = run("git rev-parse HEAD").stdout.strip()
    remote = run("git rev-parse @{u} 2>/dev/null").stdout.strip()

    if not remote:
        ok("No upstream tracking branch")
        return True

    if local == remote:
        ok("Up to date with origin")
        return True

    base = run(f"git merge-base {local} {remote}").stdout.strip()
    if base == remote:
        ok("Local is ahead of origin (will push during publish)")
        return True
    if base == local:
        info("Local is behind origin — pulling...")
        pull = run("git pull --ff-only")
        if pull.returncode != 0:
            fail("git pull failed")
            return False
        ok("Pulled latest from origin")
        return True

    fail("Local and remote have diverged — resolve manually")
    return False


def ensure_dependencies() -> bool:
    """Step 4: Run npm install if needed."""
    node_modules = os.path.join(PROJECT_ROOT, "node_modules")
    pkg_json = os.path.join(PROJECT_ROOT, "package.json")
    lock_file = os.path.join(PROJECT_ROOT, "package-lock.json")

    needs_install = (
        not os.path.isdir(node_modules)
        or not os.path.isfile(lock_file)
        or os.path.getmtime(pkg_json) > os.path.getmtime(lock_file)
    )

    if needs_install:
        info("Running npm install...")
        result = run("npm install")
        if result.returncode != 0:
            fail("npm install failed")
            if result.stderr:
                print(result.stderr)
            return False

    ok("Dependencies up to date")
    return True


def step_lint() -> bool:
    """Step 5: Run ESLint."""
    info("Running eslint...")
    result = run("npm run lint")
    if result.returncode != 0:
        fail("eslint failed")
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr)
        return False
    ok("eslint passed")
    return True


def step_compile() -> bool:
    """Step 5b: Type-check with tsc."""
    info("Running type check...")
    result = run("npm run check-types")
    if result.returncode != 0:
        fail("Type check failed")
        if result.stdout:
            print(result.stdout)
        return False
    ok("Type check passed")
    return True


def step_test() -> bool:
    """Step 6: Run tests."""
    info("Running tests...")
    result = run("npm test")
    if result.returncode != 0:
        fail("Tests failed")
        if result.stdout:
            print(result.stdout)
        return False
    ok("Tests passed")
    return True


def check_file_line_limits() -> bool:
    """Step 7: Warn if .ts files exceed line limit."""
    src_dir = os.path.join(PROJECT_ROOT, "src")
    violations = []

    for root, _dirs, files in os.walk(src_dir):
        for fname in files:
            if not fname.endswith(".ts"):
                continue
            if fname.endswith(".test.ts"):
                continue

            fpath = os.path.join(root, fname)
            with open(fpath, encoding="utf-8") as f:
                count = sum(1 for _ in f)

            if count > MAX_FILE_LINES:
                rel = os.path.relpath(fpath, PROJECT_ROOT)
                violations.append((rel, count))

    if violations:
        for rel, count in violations:
            warn(f"{rel}: {count} lines (limit {MAX_FILE_LINES})")
    else:
        ok(f"All .ts files within {MAX_FILE_LINES}-line limit")

    return True  # warnings, not blocking
