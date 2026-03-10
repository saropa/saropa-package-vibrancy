"""Global constants for the publish pipeline."""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, os.pardir, os.pardir))
PROJECT_NAME = "Saropa Package Vibrancy"
REPO_URL = "https://github.com/saropa/saropa-package-vibrancy"
MARKETPLACE_URL = (
    "https://marketplace.visualstudio.com/items?itemName=saropa.saropa-package-vibrancy"
)

MAX_FILE_LINES = 300
MIN_NODE_MAJOR = 18


class ExitCode:
    """Named exit codes for CI consumption."""

    SUCCESS = 0
    PREREQUISITE_FAILED = 10
    WORKING_TREE_DIRTY = 20
    REMOTE_SYNC_FAILED = 21
    DEPENDENCY_FAILED = 30
    LINT_FAILED = 40
    TEST_FAILED = 50
    QUALITY_FAILED = 60
    VERSION_INVALID = 70
    GIT_FAILED = 80
    PUBLISH_FAILED = 90
    RELEASE_FAILED = 91
    USER_CANCELLED = 99


# ── ANSI colours ──────────────────────────────────────────────

_NO_COLOR = os.environ.get("NO_COLOR") is not None
_IS_TTY = hasattr(sys.stdout, "isatty") and sys.stdout.isatty()

if _IS_TTY and not _NO_COLOR:
    try:
        import colorama
        colorama.init()
    except ImportError:
        pass


class C:
    """ANSI colour shortcuts (noop when NO_COLOR or non-TTY)."""

    _ON = _IS_TTY and not _NO_COLOR
    RESET = "\033[0m" if _ON else ""
    BOLD = "\033[1m" if _ON else ""
    DIM = "\033[2m" if _ON else ""
    RED = "\033[91m" if _ON else ""
    GREEN = "\033[92m" if _ON else ""
    YELLOW = "\033[93m" if _ON else ""
    CYAN = "\033[96m" if _ON else ""
    WHITE = "\033[97m" if _ON else ""
