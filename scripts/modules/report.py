"""Reporting and output."""

import os
import sys
import webbrowser
from datetime import datetime

from .constants import C, MARKETPLACE_URL, PROJECT_ROOT
from .display import dim, ok
from .utils import elapsed_str


def ensure_utf8_stdout() -> None:
    """Reconfigure stdout to UTF-8 on Windows."""
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")


def save_report(
    results: list[tuple[str, bool, float]],
    version: str,
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

    lines = [
        f"Saropa Package Vibrancy — {kind.title()} Report",
        f"Version: {version}",
        f"Timestamp: {now.isoformat()}",
        "",
        f"{'Step':<30} {'Result':<8} {'Time':>8}",
        "-" * 50,
    ]

    for name, passed, elapsed in results:
        status = "PASS" if passed else "FAIL"
        lines.append(f"{name:<30} {status:<8} {elapsed_str(elapsed):>8}")

    total = sum(e for _, _, e in results)
    lines.append(f"\nTotal: {elapsed_str(total)}")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    return filepath


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
    print(f"""
  {C.GREEN}{'=' * 50}
  ✓ Published v{version} successfully!
  {'=' * 50}{C.RESET}

  Marketplace: {C.CYAN}{MARKETPLACE_URL}{C.RESET}
""")
    try:
        webbrowser.open(MARKETPLACE_URL)
    except Exception:
        pass
