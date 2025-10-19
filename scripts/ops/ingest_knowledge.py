#!/usr/bin/env python3
"""Kolibri knowledge ingestion helper."""

from __future__ import annotations

import argparse
import logging
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.utils import bootstrap_parser, ensure_project_root  # noqa: E402


def run() -> None:
    """Entry point for the CLI."""
    parser = argparse.ArgumentParser(description="Kolibri knowledge ingestion helper")
    parser.add_argument("query", nargs="?", default="", help="Search query to execute")
    parser.add_argument("--limit", type=int, default=5, help="Number of snippets to return")
    parser.add_argument(
        "--export",
        type=Path,
        help="Path to write JSON snapshot of the knowledge index",
    )

    args = bootstrap_parser(parser, commands=["cmake"], modules=["sqlite3"])

    project_root = ensure_project_root()
    roots = [str(project_root / "docs"), str(project_root / "data")]
    indexer_path = project_root / "build" / "kolibri_indexer"

    if args.export:
        with tempfile.TemporaryDirectory(prefix="kolibri_index_") as tmpdir:
            subprocess.run(
                [str(indexer_path), "build", "--output", tmpdir, *roots],
                check=True,
            )
            payload = Path(tmpdir) / "index.json"
            if payload.exists():
                args.export.write_text(payload.read_text(encoding="utf-8"), encoding="utf-8")
                logging.info("Экспортирован снепшот индекса: %s", args.export)

    query = args.query.strip()
    if not query:
        logging.debug("Пустой запрос — завершаю работу без поиска")
        return

    completed = subprocess.run(
        [
            str(indexer_path),
            "search",
            "--query",
            query,
            "--limit",
            str(args.limit),
            *roots,
        ],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        logging.error("Поиск не выполнен: %s", completed.stderr.strip())
        return

    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        logging.warning("Знания не найдены")
        return

    for line in lines:
        parts = line.split("\t", 2)
        if len(parts) == 3:
            score, doc_id, title = parts
            print(f"[{float(score):.4f}] {title} ({doc_id})")
        else:
            print(line)


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    run()
