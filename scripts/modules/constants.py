"""Global constants for the publish pipeline."""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, os.pardir, os.pardir))
PROJECT_NAME = "Saropa Package Vibrancy"
MARKETPLACE_EXTENSION_ID = "saropa.saropa-package-vibrancy"
REPO_URL = "https://github.com/saropa/saropa-package-vibrancy"
MARKETPLACE_URL = (
    "https://marketplace.visualstudio.com"
    f"/items?itemName={MARKETPLACE_EXTENSION_ID}"
)
OPENVSX_URL = "https://open-vsx.org/extension/saropa/saropa-package-vibrancy"

MAX_FILE_LINES = 300
MIN_NODE_MAJOR = 18

# cspell:ignore connor4312 dbaeumer

# VS Code extensions required for development.
REQUIRED_VSCODE_EXTENSIONS = [
    "connor4312.esbuild-problem-matchers",
    "dbaeumer.vscode-eslint",
]

# Global npm packages required for scaffolding/publishing.
REQUIRED_GLOBAL_NPM_PACKAGES = [
    "yo",
    "generator-code",
]


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
    OPENVSX_FAILED = 92
    PACKAGE_FAILED = 93
    USER_CANCELLED = 99


# Maps step names (used in publish.py run_step calls) to exit codes.
STEP_EXIT_CODES = {
    "Node.js": ExitCode.PREREQUISITE_FAILED,
    "git": ExitCode.PREREQUISITE_FAILED,
    "vsce": ExitCode.PREREQUISITE_FAILED,
    "VS Code CLI": ExitCode.PREREQUISITE_FAILED,
    "GitHub CLI": ExitCode.PREREQUISITE_FAILED,
    "vsce PAT": ExitCode.PREREQUISITE_FAILED,
    "OVSX PAT": ExitCode.PREREQUISITE_FAILED,
    "Global npm pkgs": ExitCode.PREREQUISITE_FAILED,
    "VS Code extensions": ExitCode.PREREQUISITE_FAILED,
    "Working tree": ExitCode.WORKING_TREE_DIRTY,
    "Remote sync": ExitCode.REMOTE_SYNC_FAILED,
    "Dependencies": ExitCode.DEPENDENCY_FAILED,
    "Lint": ExitCode.LINT_FAILED,
    "Type check": ExitCode.LINT_FAILED,
    "Tests": ExitCode.TEST_FAILED,
    "File line limits": ExitCode.QUALITY_FAILED,
    "Known issues data": ExitCode.QUALITY_FAILED,
    "Version validation": ExitCode.VERSION_INVALID,
    "Package": ExitCode.PACKAGE_FAILED,
    "Git commit & push": ExitCode.GIT_FAILED,
    "Git tag": ExitCode.GIT_FAILED,
    "Marketplace publish": ExitCode.PUBLISH_FAILED,
    "Open VSX publish": ExitCode.OPENVSX_FAILED,
    "GitHub release": ExitCode.RELEASE_FAILED,
}


def exit_code_from_results(
    results: list[tuple[str, bool, float]],
) -> int:
    """Derive exit code from the last failing step."""
    for name, passed, _ in reversed(results):
        if not passed:
            return STEP_EXIT_CODES.get(name, 1)
    return 1


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
    BLUE = "\033[94m" if _ON else ""
    CYAN = "\033[96m" if _ON else ""
    WHITE = "\033[97m" if _ON else ""

    # Extended 256-colour palette (logo gradient)
    ORANGE_208 = "\033[38;5;208m" if _ON else ""
    ORANGE_209 = "\033[38;5;209m" if _ON else ""
    YELLOW_215 = "\033[38;5;215m" if _ON else ""
    YELLOW_220 = "\033[38;5;220m" if _ON else ""
    YELLOW_226 = "\033[38;5;226m" if _ON else ""
    GREEN_190 = "\033[38;5;190m" if _ON else ""
    GREEN_154 = "\033[38;5;154m" if _ON else ""
    GREEN_118 = "\033[38;5;118m" if _ON else ""
    CYAN_123 = "\033[38;5;123m" if _ON else ""
    CYAN_87 = "\033[38;5;87m" if _ON else ""
    BLUE_51 = "\033[38;5;51m" if _ON else ""
    BLUE_45 = "\033[38;5;45m" if _ON else ""
    BLUE_39 = "\033[38;5;39m" if _ON else ""
    BLUE_33 = "\033[38;5;33m" if _ON else ""
    BLUE_57 = "\033[38;5;57m" if _ON else ""
    PINK_195 = "\033[38;5;195m" if _ON else ""
    LIGHT_BLUE_117 = "\033[38;5;117m" if _ON else ""
