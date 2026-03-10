"""Reporting and output."""

import os
import re
import sys
import webbrowser
from datetime import datetime

from .constants import C, MARKETPLACE_URL, OPENVSX_URL, PROJECT_ROOT, REPO_URL
from .display import dim, info
from .utils import elapsed_str

# ── Publish log (tee stdout to file) ────────────────────────

_ANSI_RE = re.compile(r"\033\[[0-9;]*m")
_original_stdout = None
_log_file = None


class _TeeWriter:
    """Wraps stdout to also write ANSI-stripped text to a log file."""

    def __init__(self, terminal, logfile):
        self.terminal = terminal
        self.logfile = logfile

    def write(self, text):
        self.terminal.write(text)
        self.logfile.write(_ANSI_RE.sub("", text))

    def flush(self):
        self.terminal.flush()
        self.logfile.flush()


def open_publish_log() -> None:
    """Start teeing stdout to reports/YYYYMMDD/YYYYMMDD_publish.log."""
    global _original_stdout, _log_file
    now = datetime.now()
    date_dir = os.path.join(
        PROJECT_ROOT, "reports", now.strftime("%Y%m%d"),
    )
    os.makedirs(date_dir, exist_ok=True)
    path = os.path.join(
        date_dir, now.strftime("%Y%m%d") + "_publish.log",
    )
    _log_file = open(path, "w", encoding="utf-8")
    _original_stdout = sys.stdout
    sys.stdout = _TeeWriter(_original_stdout, _log_file)


def close_publish_log() -> None:
    """Stop teeing and close the log file."""
    global _original_stdout, _log_file
    if _original_stdout is None:
        return
    path = _log_file.name
    sys.stdout = _original_stdout
    _log_file.close()
    _original_stdout = None
    _log_file = None
    rel = os.path.relpath(path, PROJECT_ROOT)
    info(f"Publish log: {C.WHITE}{rel}{C.RESET}")


def ensure_utf8_stdout() -> None:
    """Reconfigure stdout to UTF-8 on Windows."""
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")


def save_report(
    results: list[tuple[str, bool, float]],
    version: str,
    vsix_path: str | None = None,
    is_publish: bool = False,
) -> str | None:
    """Save timestamped report to reports/ directory."""
    now = datetime.now()
    date_dir = now.strftime("%Y%m%d")
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    kind = "publish" if is_publish else "analysis"

    reports_dir = os.path.join(PROJECT_ROOT, "reports", date_dir)
    os.makedirs(reports_dir, exist_ok=True)

    filename = f"{timestamp}_{version}_{kind}_report.log"
    filepath = os.path.join(reports_dir, filename)

    lines = _build_report_lines(kind, version, now, results, vsix_path)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    return filepath


def _build_report_lines(
    kind: str,
    version: str,
    now: datetime,
    results: list[tuple[str, bool, float]],
    vsix_path: str | None,
) -> list[str]:
    """Build the text lines for a report file."""
    lines = [
        f"Saropa Package Vibrancy — {kind.title()} Report",
        f"Version: {version}",
        f"Timestamp: {now.isoformat()}",
    ]
    if vsix_path and os.path.isfile(vsix_path):
        size_kb = os.path.getsize(vsix_path) / 1024
        lines.append(f"VSIX: {os.path.basename(vsix_path)} ({size_kb:.0f} KB)")
    lines += [
        "",
        f"{'Step':<30} {'Result':<8} {'Time':>8}",
        "-" * 50,
    ]
    for name, passed, elapsed in results:
        status = "PASS" if passed else "FAIL"
        lines.append(f"{name:<30} {status:<8} {elapsed_str(elapsed):>8}")
    total = sum(e for _, _, e in results)
    lines.append(f"\nTotal: {elapsed_str(total)}")
    return lines


def print_timing(results: list[tuple[str, bool, float]]) -> None:
    """Print proportional bar chart of step durations."""
    total = sum(e for _, _, e in results)
    if total == 0:
        return

    print(f"\n  {C.BOLD}Timing{C.RESET}")
    max_bar = 30

    for name, passed, elapsed in results:
        bar_len = int((elapsed / total) * max_bar) if total > 0 else 0
        bar = "█" * bar_len
        color = C.GREEN if passed else C.RED
        print(f"  {name:<25} {color}{bar}{C.RESET} {elapsed_str(elapsed)}")

    print(f"  {'Total':<25} {elapsed_str(total)}")


def print_success_banner(version: str) -> None:
    """Print success summary with links."""
    release_url = f"{REPO_URL}/releases/tag/v{version}"
    print(f"""
  {C.GREEN}{'=' * 50}
  Published v{version} successfully!
  {'=' * 50}{C.RESET}

  Marketplace: {C.CYAN}{MARKETPLACE_URL}{C.RESET}
  Open VSX:    {C.CYAN}{OPENVSX_URL}{C.RESET}
  Release:     {C.CYAN}{release_url}{C.RESET}
""")
    try:
        webbrowser.open(MARKETPLACE_URL)
    except Exception:
        pass
