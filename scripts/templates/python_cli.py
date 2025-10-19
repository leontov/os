#!/usr/bin/env python3
"""Skeleton for Kolibri Python CLI utilities."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.utils import bootstrap_parser  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Describe what the script does")
    parser.add_argument("--example", help="Document required arguments here")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = bootstrap_parser(parser, argv=argv)
    logging.info("Received arguments: %s", args)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
