"""CLI utilities for managing the Kolibri documentation portal."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence, cast

import uvicorn
from uvicorn._types import ASGIApplication

from docs_portal import PortalEngine, create_app

DEFAULT_CONFIG = Path("docs/portal_config.json")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="docs_portal",
        description=(
            "Запуск и интроспекция портала документации «Колибри ИИ» с поиском, "
            "версионностью и интерактивными примерами."
        ),
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help="Путь к JSON-конфигурации портала",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="Запустить FastAPI-сервер портала")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8080)

    sub.add_parser("versions", help="Вывести доступные версии документации")

    docs = sub.add_parser("docs", help="Список документов выбранной версии")
    docs.add_argument("version", help="Идентификатор версии")

    search = sub.add_parser("search", help="Поиск по содержимому документации")
    search.add_argument("version", help="Идентификатор версии")
    search.add_argument("query", help="Строка поиска")

    run = sub.add_parser("run-example", help="Выполнить интерактивный пример")
    run.add_argument("version", help="Идентификатор версии")
    run.add_argument("example", help="Идентификатор примера")

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    engine = PortalEngine.from_config(args.config)

    if args.command == "serve":
        app = create_app(args.config)
        uvicorn.run(cast(ASGIApplication, app), host=args.host, port=args.port, log_level="info")
        return 0

    if args.command == "versions":
        payload = [
            {
                "name": entry["name"],
                "label": entry["label"],
                "documents": entry["documents"],
            }
            for entry in engine.list_versions()
        ]
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if args.command == "docs":
        documents = engine.list_documents(args.version)
        payload = [
            {
                "identifier": doc.identifier,
                "title": doc.title,
                "summary": doc.summary,
            }
            for doc in documents
        ]
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if args.command == "search":
        hits = engine.search(args.version, args.query)
        payload = [
            {
                "identifier": hit.identifier,
                "title": hit.title,
                "summary": hit.summary,
                "score": hit.score,
            }
            for hit in hits
        ]
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if args.command == "run-example":
        try:
            result = engine.execute_example(args.version, args.example)
        except (KeyError, ValueError) as exc:
            print(str(exc), file=sys.stderr)
            return 1
        payload = {"stdout": result.stdout, "variables": dict(result.variables)}
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    raise RuntimeError(f"Unhandled command: {args.command}")


if __name__ == "__main__":
    sys.exit(main())
