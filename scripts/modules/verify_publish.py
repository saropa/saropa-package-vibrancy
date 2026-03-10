"""Post-publish verification — poll marketplace(s) until version is live."""

import json
import time
import urllib.request
import urllib.error

from .constants import MARKETPLACE_URL, OPENVSX_URL, REPO_URL
from .display import heading, info, ok, warn
from .packaging import get_marketplace_published_version
from .utils import run

_POLL_INTERVAL = 30
_MAX_ATTEMPTS = 20
_OPENVSX_API = "https://open-vsx.org/api/saropa/saropa-package-vibrancy"


def _check_openvsx_version() -> str | None:
    """Fetch the latest version from Open VSX JSON API."""
    try:
        req = urllib.request.Request(
            _OPENVSX_API,
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        version = data.get("version")
        return str(version).strip() if version else None
    except (urllib.error.URLError, json.JSONDecodeError, OSError):
        return None


def _check_github_release(version: str) -> bool:
    """Return True if the GitHub release for this version exists."""
    result = run(f"gh release view v{version}")
    return result.returncode == 0


def _show_target_urls(stores: str) -> None:
    """Print which URLs are being verified."""
    if stores in ("both", "vscode_only"):
        info(f"Marketplace: {MARKETPLACE_URL}")
    if stores in ("both", "openvsx_only"):
        info(f"Open VSX:    {OPENVSX_URL}")
    info(f"GitHub:      {REPO_URL}/releases")


def _build_check_list(stores: str) -> list[str]:
    """Return list of store keys to verify based on stores selection."""
    checks: list[str] = []
    if stores in ("both", "vscode_only"):
        checks.append("marketplace")
    if stores in ("both", "openvsx_only"):
        checks.append("openvsx")
    checks.append("github")
    return checks


def _check_store(key: str, version: str) -> bool:
    """Check a single store by key. Returns True if version matches."""
    if key == "marketplace":
        return get_marketplace_published_version() == version
    if key == "openvsx":
        return _check_openvsx_version() == version
    if key == "github":
        return _check_github_release(version)
    return False


def _store_label(key: str) -> str:
    """Human-readable label for a store key."""
    labels = {
        "marketplace": "VS Code Marketplace",
        "openvsx": "Open VSX",
        "github": "GitHub Release",
    }
    return labels.get(key, key)


def _report_status(
    verified: set[str],
    pending: list[str],
) -> None:
    """Print OK for verified stores and list what's still pending."""
    for key in verified:
        ok(f"{_store_label(key)} — live")
    for key in pending:
        info(f"{_store_label(key)} — not yet available")


def _poll_stores(version: str, checks: list[str]) -> bool:
    """Poll stores until all verified or timeout. Returns True always."""
    verified: set[str] = set()
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        if attempt > 1:
            time.sleep(_POLL_INTERVAL)
        info(f"Attempt {attempt}/{_MAX_ATTEMPTS} — checking...")
        verified = _run_all_checks(version, checks, verified)
        pending = [k for k in checks if k not in verified]
        _report_status(verified, pending)
        if not pending:
            return True
    _warn_timeout(checks, verified)
    return True


def _run_all_checks(
    version: str,
    checks: list[str],
    already_verified: set[str],
) -> set[str]:
    """Run checks for stores not yet verified. Returns updated set."""
    verified = set(already_verified)
    for key in checks:
        if key in verified:
            continue
        if _check_store(key, version):
            verified.add(key)
    return verified


def _warn_timeout(checks: list[str], verified: set[str]) -> None:
    """Warn about stores that didn't verify within the polling window."""
    still_pending = [k for k in checks if k not in verified]
    if still_pending:
        names = ", ".join(_store_label(k) for k in still_pending)
        warn(f"Timed out waiting for: {names}")
        warn("This is normal — propagation can take a few minutes.")


def verify_publish(version: str, stores: str) -> bool:
    """Poll marketplace(s) until the published version is live.

    Checks every 30 seconds for up to 10 minutes. Returns True
    regardless — a timeout is a warning, not a failure.
    """
    heading("Post-Publish Verification")
    info(f"Verifying v{version} is live...")
    _show_target_urls(stores)
    checks = _build_check_list(stores)
    return _poll_stores(version, checks)
