"""Terminal output helpers."""

import os
from .constants import C


def dim(text: str) -> str:
    return f"{C.DIM}{text}{C.RESET}"


def heading(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def ok(msg: str) -> None:
    print(f"  {C.GREEN}[OK]{C.RESET}   {msg}")


def fail(msg: str) -> None:
    print(f"  {C.RED}[FAIL]{C.RESET} {msg}")


def warn(msg: str) -> None:
    print(f"  {C.YELLOW}[WARN]{C.RESET} {msg}")


def info(msg: str) -> None:
    print(f"  {C.CYAN}[INFO]{C.RESET} {msg}")


def fix(msg: str) -> None:
    print(f"  {C.YELLOW}[FIX]{C.RESET}  {msg}")


def ask_yn(prompt: str, default: bool = False) -> bool:
    """Prompt yes/no. Respects PUBLISH_YES env for CI."""
    if os.environ.get("PUBLISH_YES"):
        hint = "y" if default else "auto-yes"
        print(f"  {prompt} [{hint}]")
        return True
    suffix = "[Y/n]" if default else "[y/N]"
    answer = input(f"  {prompt} {suffix}: ").strip().lower()
    if not answer:
        return default
    return answer.startswith("y")


def show_logo(version: str) -> None:
    print(f"""
  {'=' * 50}
  {C.BOLD}{C.CYAN}Saropa Package Vibrancy{C.RESET}
  Publish Pipeline {dim(f'v{version}')}
  {'=' * 50}""")
