"""Анализ обратной связи закрытых бет флагманских приложений Колибри."""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping as ABCMapping, Sequence as ABCSequence
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Iterable, Mapping

from apps.flagship.metrics import ExperienceReview


@dataclass(frozen=True, slots=True)
class FeedbackEntry:
    """Заявка пользователя беты."""

    app: str
    satisfaction: float
    retention_intent: float
    nps: float
    pain_points: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class BetaSummary:
    """Сводка по закрытой бете."""

    review: ExperienceReview
    top_pains: tuple[str, ...]


def _coerce_float(value: object, *, default: float = 0.0) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _coerce_pain_points(value: object) -> tuple[str, ...]:
    if isinstance(value, ABCSequence) and not isinstance(value, (str, bytes, bytearray)):
        return tuple(str(item) for item in value)
    return ()


def load_feedback(payload: Iterable[Mapping[str, object]]) -> list[FeedbackEntry]:
    entries: list[FeedbackEntry] = []
    for item in payload:
        if not isinstance(item, ABCMapping):
            continue
        entries.append(
            FeedbackEntry(
                app=str(item.get("app", "unknown")),
                satisfaction=_coerce_float(item.get("satisfaction")),
                retention_intent=_coerce_float(item.get("retention_intent")),
                nps=_coerce_float(item.get("nps")),
                pain_points=_coerce_pain_points(item.get("pain_points")),
            )
        )
    return entries


def summarize_feedback(entries: Iterable[FeedbackEntry]) -> list[BetaSummary]:
    grouped: dict[str, list[FeedbackEntry]] = {}
    for entry in entries:
        grouped.setdefault(entry.app, []).append(entry)

    summaries: list[BetaSummary] = []
    for app, app_entries in grouped.items():
        if not app_entries:
            continue
        review = ExperienceReview(
            app=app,
            satisfaction=mean(item.satisfaction for item in app_entries),
            retention=mean(item.retention_intent for item in app_entries),
            nps=mean(item.nps for item in app_entries),
        )
        pains: dict[str, int] = {}
        for entry in app_entries:
            for pain in entry.pain_points:
                pains[pain] = pains.get(pain, 0) + 1
        top_pains = tuple(name for name, _ in sorted(pains.items(), key=lambda item: item[1], reverse=True)[:3])
        summaries.append(BetaSummary(review=review, top_pains=top_pains))
    return summaries


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Обработка обратной связи закрытых бет Колибри")
    parser.add_argument("feedback", type=Path, help="JSON-массив отзывов участников")
    parser.add_argument("--output", type=Path, help="Файл для записи агрегированных метрик")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = json.loads(args.feedback.read_text(encoding="utf-8"))
    if not isinstance(payload, list):  # pragma: no cover - защитная ветка
        raise ValueError("Ожидался JSON-массив отзывов")
    entries = load_feedback(payload)
    summaries = summarize_feedback(entries)
    rendered = json.dumps(
        [
            {
                "app": summary.review.app,
                "satisfaction": round(summary.review.satisfaction, 3),
                "retention": round(summary.review.retention, 3),
                "nps": round(summary.review.nps, 1),
                "meets_targets": summary.review.meets_targets(),
                "top_pains": list(summary.top_pains),
            }
            for summary in summaries
        ],
        ensure_ascii=False,
        indent=2,
    )
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:  # pragma: no cover - ручной запуск
        print(rendered)
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI вход
    raise SystemExit(main())
