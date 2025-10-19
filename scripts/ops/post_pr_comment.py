#!/usr/bin/env python3
"""Post comments to GitHub pull requests or print watchdog summaries."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List
from urllib.error import HTTPError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.utils import bootstrap_parser  # noqa: E402

API_BASE = "https://api.github.com"


def _get_headers(token: str | None) -> Dict[str, str]:
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def otpravit_kommentarij(repo: str, pr: int, tekst: str, token: str | None) -> None:
    """Отправляет комментарий в PR или выводит его в консоль при отсутствии токена."""
    if not token:
        logging.warning("GITHUB_TOKEN не найден — печатаю комментарий в stdout")
        print(tekst)
        return
    url = f"{API_BASE}/repos/{repo}/issues/{pr}/comments"
    zapros = Request(url, data=json.dumps({"body": tekst}).encode("utf-8"), headers=_get_headers(token))
    with urlopen(zapros) as response:
        logging.info("Комментарий опубликован, статус %s", response.status)


def poluchit_runs(repo: str, token: str | None, limit: int = 5) -> List[Dict[str, Any]]:
    """Получает последние прогоны GitHub Actions для watchdog-отчёта."""
    url = f"{API_BASE}/repos/{repo}/actions/runs?per_page={limit}"
    zapros = Request(url, headers=_get_headers(token))
    try:
        with urlopen(zapros) as response:
            dannye = json.loads(response.read().decode("utf-8"))
    except HTTPError as oshibka:
        logging.error("Не удалось получить список прогонов: %s", oshibka)
        return []
    return dannye.get("workflow_runs", [])


def sobrat_watchdog_tekst(repo: str, token: str | None) -> str:
    """Формирует сводку завершённых прогонов для сторожевого сценария."""
    runs = poluchit_runs(repo, token)
    stroki = ["## Watchdog отчёт", "Последние прогоны:"]
    for run in runs:
        stroki.append(
            f"- {run.get('name','run')} #{run.get('run_number')} — {run.get('conclusion','unknown')}"
        )
    if not runs:
        stroki.append("(нет данных о прогонах)")
    return "\n".join(stroki)


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="Kolibri PR commentator")
    parser.add_argument("--pr", type=int, help="номер PR")
    parser.add_argument("--body", help="текст комментария")
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--watchdog", action="store_true", help="сформировать отчёт без указания PR")
    args = bootstrap_parser(parser)

    token = os.environ.get("GITHUB_TOKEN")

    if args.watchdog:
        if not args.repository:
            logging.error("Не задано имя репозитория для watchdog-режима")
            return 1
        tekst = sobrat_watchdog_tekst(args.repository, token)
        print(tekst)
        return 0

    if not args.pr or not args.body:
        logging.error("Для публикации комментария требуются --pr и --body")
        return 1

    if not args.repository:
        logging.error("Неизвестный репозиторий")
        return 1

    otpravit_kommentarij(args.repository, args.pr, args.body, token)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
