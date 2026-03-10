"""Terminal output helpers."""

import os
from .constants import C


def dim(text: str) -> str:
    return f"{C.DIM}{text}{C.RESET}"


def heading(title: str) -> None:
    print(f"\n{C.BLUE}{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}{C.RESET}")


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


# cspell:disable
def show_logo(version: str) -> None:
    """Print the Saropa ASCII logo with gradient colours."""
    print(f"""
{C.ORANGE_208}                               ....{C.RESET}
{C.ORANGE_208}                       `-+shdmNMMMMNmdhs+-{C.RESET}
{C.ORANGE_209}                    -odMMMNyo/-..````.++:+o+/-{C.RESET}
{C.YELLOW_215}                 `/dMMMMMM/`            ````````{C.RESET}
{C.YELLOW_220}                `dMMMMMMMMNdhhhdddmmmNmmddhs+-{C.RESET}
{C.YELLOW_226}                QMMMMMMMMMMMMMMMMMMMMMMMMMMMMMNhs{C.RESET}
{C.GREEN_190}              . :sdmNNNNMMMMMNNNMMMMMMMMMMMMMMMMm+{C.RESET}
{C.GREEN_154}              o     `..~~~::~+==+~:/+sdNMMMMMMMMMMMo{C.RESET}
{C.GREEN_118}              m                        .+NMMMMMMMMMN{C.RESET}
{C.CYAN_123}              m+                         :MMMMMMMMMm{C.RESET}
{C.CYAN_87}              qN:                        :MMMMMMMMMF{C.RESET}
{C.BLUE_51}               oNs.                    `+NMMMMMMMMo{C.RESET}
{C.BLUE_45}                :dNy\\.              ./smMMMMMMMMm:{C.RESET}
{C.BLUE_39}                 `TdMNmhyso+++oosydNNMMMMMMMMMdP+{C.RESET}
{C.BLUE_33}                    .odMMMMMMMMMMMMMMMMMMMMdo-{C.RESET}
{C.BLUE_57}                       `-+shdNNMMMMNNdhs+-{C.RESET}
{C.BLUE_57}                               ````{C.RESET}

  {C.PINK_195}Saropa Package Vibrancy{C.RESET}  {dim(f'v{version}')}
  {C.LIGHT_BLUE_117}Analyze + Publish{C.RESET}
""")
# cspell:enable
