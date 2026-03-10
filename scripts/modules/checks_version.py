"""Version and CHANGELOG validation."""

import os
import re

from .constants import PROJECT_ROOT
from .display import ask_yn, fail, fix, info, ok, warn
from .utils import (
    bump_patch,
    is_version_tagged,
    read_package_version,
    write_package_version,
)


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


def _changelog_has_unpublished() -> bool:
    """Check for [Unreleased] or similar section."""
    changelog = os.path.join(PROJECT_ROOT, "CHANGELOG.md")
    if not os.path.isfile(changelog):
        return False

    with open(changelog, encoding="utf-8") as f:
        text = f.read()

    return bool(re.search(
        r"##\s+\[?(Unreleased|Unpublished|Undefined)",
        text, re.IGNORECASE,
    ))


def _stamp_changelog(version: str) -> None:
    """Replace [Unreleased] header with [version]."""
    changelog = os.path.join(PROJECT_ROOT, "CHANGELOG.md")
    with open(changelog, encoding="utf-8") as f:
        text = f.read()

    text = re.sub(
        r"(##\s+)\[?(Unreleased|Unpublished|Undefined)\]?",
        rf"\g<1>[{version}]",
        text,
        count=1,
        flags=re.IGNORECASE,
    )

    with open(changelog, "w", encoding="utf-8") as f:
        f.write(text)

    fix(f"Stamped CHANGELOG with [{version}]")


def validate_version_changelog() -> tuple[str, bool]:
    """Validate version consistency and CHANGELOG. Returns (version, ok)."""
    version = read_package_version()
    ok(f"package.json version: {version}")

    # Check if tag already exists — auto-bump if so
    if is_version_tagged(version):
        new = bump_patch(version)
        warn(f"Tag v{version} already exists")
        if not ask_yn(f"Bump to v{new}?", default=True):
            fail("Version conflict not resolved")
            return version, False
        write_package_version(new)
        version = new
        fix(f"Bumped package.json to {version}")

    # Check CHANGELOG max version
    changelog_max = _get_changelog_max_version()
    if changelog_max and changelog_max > version:
        new = bump_patch(changelog_max)
        warn(f"package.json v{version} < CHANGELOG max v{changelog_max}")
        if not ask_yn(f"Bump to v{new}?", default=True):
            fail("Version conflict not resolved")
            return version, False
        write_package_version(new)
        version = new
        fix(f"Bumped package.json to {version}")

    # Stamp CHANGELOG if it has an Unreleased section
    if _changelog_has_unpublished():
        _stamp_changelog(version)

    ok(f"Version validated: {version}")
    return version, True
