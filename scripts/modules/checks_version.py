"""Version and CHANGELOG validation."""

import os
import re

from .constants import C, PROJECT_ROOT
from .display import ask_yn, fail, fix, info, ok, warn
from .utils import (
    bump_patch,
    is_version_tagged,
    read_package_version,
    write_package_version,
)


def _parse_semver(version: str) -> tuple[int, ...]:
    """Convert 'X.Y.Z' (or 'X.Y.Z-pre') to a comparable tuple."""
    base = version.split("-")[0]
    return tuple(int(x) for x in base.split("."))


def _get_changelog_max_version() -> str | None:
    """Parse the highest version header from CHANGELOG.md."""
    changelog = os.path.join(PROJECT_ROOT, "CHANGELOG.md")
    if not os.path.isfile(changelog):
        return None

    with open(changelog, encoding="utf-8") as f:
        for line in f:
            match = re.match(r"^##\s+\[?(\d+\.\d+\.\d+)", line)
            if match:
                return match.group(1)
    return None


_UNPUBLISHED_RE = re.compile(
    r"##\s+.*(?:Unreleased|Unpublished|Undefined)", re.IGNORECASE,
)


def _changelog_has_unpublished() -> bool:
    """Check for Unreleased/Unpublished marker in a heading."""
    changelog = os.path.join(PROJECT_ROOT, "CHANGELOG.md")
    if not os.path.isfile(changelog):
        return False

    with open(changelog, encoding="utf-8") as f:
        text = f.read()

    return bool(_UNPUBLISHED_RE.search(text))


def _max_version_is_unpublished() -> bool:
    """Check if the highest versioned CHANGELOG heading has an Unreleased marker."""
    changelog = os.path.join(PROJECT_ROOT, "CHANGELOG.md")
    if not os.path.isfile(changelog):
        return False
    with open(changelog, encoding="utf-8") as f:
        for line in f:
            if re.match(r"^##\s+\[?\d+\.\d+\.\d+", line):
                return bool(re.search(
                    r"Unreleased|Unpublished|Undefined", line, re.IGNORECASE,
                ))
    return False


_FIRST_RELEASE_RE = re.compile(r"^##\s*\[\d+\.\d+\.\d+\]", re.MULTILINE)


def _ensure_unreleased_section() -> bool:
    """Insert ## [Unreleased] before first ## [x.y.z] if missing."""
    if _changelog_has_unpublished():
        return True
    changelog = os.path.join(PROJECT_ROOT, "CHANGELOG.md")
    try:
        with open(changelog, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        fail("Could not read CHANGELOG.md")
        return False
    match = _FIRST_RELEASE_RE.search(content)
    if not match:
        fail("CHANGELOG.md has no release headings")
        return False
    new = content[:match.start()] + "## [Unreleased]\n\n" + content[match.start():]
    with open(changelog, "w", encoding="utf-8") as f:
        f.write(new)
    fix("Added ## [Unreleased] to CHANGELOG.md")
    return True


def _stamp_changelog(version: str) -> bool:
    """Replace Unreleased marker with version number."""
    changelog = os.path.join(PROJECT_ROOT, "CHANGELOG.md")
    try:
        with open(changelog, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        fail("Could not read CHANGELOG.md")
        return False

    # Handle: ## [0.1.0] - Unreleased  →  ## [0.1.0]
    text = re.sub(
        r"(##\s+\[[\d.]+\])\s*-\s*(?:Unreleased|Unpublished|Undefined)",
        r"\1", text, count=1, flags=re.IGNORECASE,
    )
    # Handle: ## [Unreleased]  →  ## [0.1.0]
    text = re.sub(
        r"(##\s+)\[?(?:Unreleased|Unpublished|Undefined)\]?",
        rf"\1[{version}]", text, count=1, flags=re.IGNORECASE,
    )

    with open(changelog, "w", encoding="utf-8") as f:
        f.write(text)
    ok(f"CHANGELOG: [Unreleased] → [{version}]")
    return True


def _ensure_untagged_version(version: str) -> tuple[str, bool]:
    """Iteratively bump patch if tag exists. Returns (version, ok)."""
    original = version
    while is_version_tagged(version):
        next_ver = bump_patch(version)
        warn(f"Tag v{version} already exists")
        if not ask_yn(f"Bump to v{next_ver}?", default=True):
            fail("Version already tagged")
            return version, False
        version = next_ver

    if version != original:
        write_package_version(version)
        fix(f"package.json: {original} → {C.WHITE}{version}{C.RESET}")
    ok(f"Tag v{version} is available")
    return version, True


def _offer_bump(current: str, next_ver: str, reason: str) -> tuple[str, bool]:
    """Ask to bump; if yes, write package.json. Returns (version, ok)."""
    if not ask_yn(f"Bump to v{next_ver}?", default=True):
        fail(reason)
        return current, False
    write_package_version(next_ver)
    fix(f"package.json: {current} → {C.WHITE}{next_ver}{C.RESET}")
    return next_ver, True


def validate_version_changelog() -> tuple[str, bool]:
    """Validate version, resolve conflicts, and stamp CHANGELOG."""
    version = read_package_version()
    if version in ("unknown", "0.0.0"):
        fail("Could not read version from package.json")
        return version, False
    ok(f"package.json version: {version}")

    # When version < CHANGELOG max, or equal but already released: conflict
    max_cl = _get_changelog_max_version()
    is_conflict = (
        max_cl
        and _parse_semver(version) <= _parse_semver(max_cl)
        and not (version == max_cl and _changelog_has_unpublished())
    )
    if is_conflict:
        version = _resolve_version_conflict(version, max_cl)
        if version is None:
            return "", False

    # Ensure CHANGELOG has [Unreleased] section
    if not _changelog_has_unpublished():
        if not _ensure_unreleased_section():
            return version, False

    # Ensure version is not already tagged
    version, tag_ok = _ensure_untagged_version(version)
    if not tag_ok:
        return version, False

    # Stamp CHANGELOG
    if not _stamp_changelog(version):
        return version, False

    ok(f"Version {C.WHITE}{version}{C.RESET} validated")
    return version, True


def _resolve_version_conflict(version: str, max_cl: str) -> str | None:
    """Handle version <= CHANGELOG max. Returns resolved version or None."""
    # If the max version heading is itself marked unreleased, the user
    # planned to release at that version — target it, not the next patch.
    target = max_cl if _max_version_is_unpublished() else bump_patch(max_cl)

    if is_version_tagged(version):
        warn(f"v{version} is already released (tag exists)")
        if _changelog_has_unpublished():
            version, ok_ = _offer_bump(version, target, "Bump to release changelog")
            return version if ok_ else None
        # No unreleased section — offer publish-as-is
        if ask_yn(f"Publish v{version} as-is (e.g. sync to Open VSX)?"):
            ok(f"Publishing v{version} as-is")
            return version
        version, ok_ = _offer_bump(version, target, "Version conflict not resolved")
        return version if ok_ else None

    warn(f"package.json v{version} <= CHANGELOG max v{max_cl}")
    version, ok_ = _offer_bump(version, target, "Version conflict not resolved")
    return version if ok_ else None
