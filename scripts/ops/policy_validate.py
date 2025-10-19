#!/usr/bin/env python3
"""Validate the AGENTS.md Kolibri policy block."""

from __future__ import annotations

import argparse
import logging
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.utils import bootstrap_parser  # noqa: E402

RE_BLOCK = re.compile(r"```kolibri-policy\n(.*?)\n```", re.DOTALL | re.MULTILINE)
REQUIRED_TOP = {"build", "code", "docs"}
REQUIRED_FILES_KEYS = {"prefer_ours", "prefer_theirs"}
REQUIRED_BUDGETS = {
    "wasm_max_kb",
    "step_latency_ms",
    "coverage_min_lines",
    "coverage_min_branches",
}


def zagruzit_blok(path: Path) -> str:
    """Читает AGENTS.md и извлекает содержимое блока политики."""
    tekst = path.read_text(encoding="utf-8")
    sovpadenie = RE_BLOCK.search(tekst)
    if not sovpadenie:
        raise SystemExit("В AGENTS.md отсутствует блок ```kolibri-policy```.")
    return sovpadenie.group(1)


def proverit_shablon(obrazec: str, tekst: str, soobshchenie: str) -> None:
    """Проверяет наличие шаблона в тексте и завершает процесс при отсутствии."""
    if not re.search(obrazec, tekst, re.MULTILINE):
        raise SystemExit(soobshchenie)


def main() -> None:
    """Запускает проверку всех обязательных ключей политики."""
    parser = argparse.ArgumentParser(prog="policy-validate")
    bootstrap_parser(parser)

    agent = Path("AGENTS.md")
    if not agent.exists():
        raise SystemExit("Файл AGENTS.md не найден в корне репозитория.")

    blok = zagruzit_blok(agent)

    for klyuch in REQUIRED_TOP:
        proverit_shablon(
            rf"^{klyuch}\s*:\s*(ours|theirs)\s*$",
            blok,
            f"Ключ '{klyuch}' должен быть задан значением ours или theirs.",
        )

    proverit_shablon(r"files\s*:\s*\n", blok, "Отсутствует секция 'files:'.")
    for klyuch in REQUIRED_FILES_KEYS:
        proverit_shablon(
            rf"^[\t ]*{klyuch}\s*:\s*\n(?:[\t ]*-\s*.*\n)+",
            blok,
            f"Секция files/{klyuch} должна содержать хотя бы один шаблон.",
        )

    proverit_shablon(r"budgets\s*:\s*\n", blok, "Отсутствует секция 'budgets:'.")
    for klyuch in REQUIRED_BUDGETS:
        proverit_shablon(
            rf"^[\t ]*{klyuch}\s*:\s*\d+\s*$",
            blok,
            f"Бюджет {klyuch} должен быть задан целым числом.",
        )

    logging.info("policy: OK")


if __name__ == "__main__":
    main()
