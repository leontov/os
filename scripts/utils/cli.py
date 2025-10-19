#!/usr/bin/env python3
"""Utility helpers shared across Kolibri maintenance scripts."""

from __future__ import annotations

import argparse
import logging
import shutil
import sys
from pathlib import Path
from typing import Iterable, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def ensure_project_root() -> Path:
    """Return the repository root and ensure it is importable."""
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
    return PROJECT_ROOT


def add_logging_arguments(parser: argparse.ArgumentParser) -> None:
    """Add a unified ``--log-level`` flag to the parser."""
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"],
        help="Уровень подробности логов (по умолчанию INFO).",
    )


def configure_logging(level: str) -> None:
    """Initialise logging for scripts with a consistent format."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="[%(levelname)s] %(message)s",
    )


def require_commands(commands: Iterable[str]) -> None:
    """Ensure that required command-line tools are available."""
    missing = [cmd for cmd in commands if shutil.which(cmd) is None]
    if missing:
        raise SystemExit(
            "Отсутствуют необходимые зависимости: " + ", ".join(sorted(missing))
        )


def require_modules(modules: Sequence[str]) -> None:
    """Ensure that python modules can be imported."""
    missing: list[str] = []
    for module in modules:
        try:
            __import__(module)
        except ImportError:
            missing.append(module)
    if missing:
        raise SystemExit(
            "Отсутствуют обязательные python-модули: " + ", ".join(sorted(missing))
        )


def bootstrap_parser(
    parser: argparse.ArgumentParser,
    *,
    commands: Iterable[str] | None = None,
    modules: Sequence[str] | None = None,
    argv: Sequence[str] | None = None,
) -> argparse.Namespace:
    """Parse arguments and apply Kolibri CLI conventions."""
    add_logging_arguments(parser)
    args = parser.parse_args(argv)
    configure_logging(args.log_level)
    if commands:
        require_commands(commands)
    if modules:
        require_modules(modules)
    return args


__all__ = [
    "PROJECT_ROOT",
    "ensure_project_root",
    "add_logging_arguments",
    "configure_logging",
    "require_commands",
    "require_modules",
    "bootstrap_parser",
]
