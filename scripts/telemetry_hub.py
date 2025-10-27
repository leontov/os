"""Телеметрический концентратор для ИИ-помощников Колибри ИИ.

Инструмент реализует пункт Фазы 3: обеспечение телеметрии для
ИИ-помощников отладки и эксплуатации. Он агрегирует события, вычисляет
показатели надёжности и предоставляет рекомендации для ассистентов.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping


@dataclass(frozen=True, slots=True)
class TelemetryEvent:
    """Событие телеметрии."""

    service: str
    category: str
    severity: str
    message: str


@dataclass(frozen=True, slots=True)
class TelemetrySummary:
    """Сводка телеметрии для ассистента."""

    service: str
    incidents: int
    errors: int
    slowdowns: int
    suggestions: tuple[str, ...]


def load_events(payload: Iterable[Mapping[str, object]]) -> list[TelemetryEvent]:
    events: list[TelemetryEvent] = []
    for entry in payload:
        events.append(
            TelemetryEvent(
                service=str(entry.get("service", "unknown")),
                category=str(entry.get("category", "general")),
                severity=str(entry.get("severity", "info")),
                message=str(entry.get("message", "")),
            )
        )
    return events


def summarize(events: Iterable[TelemetryEvent]) -> list[TelemetrySummary]:
    buckets: dict[str, list[TelemetryEvent]] = defaultdict(list)
    for event in events:
        buckets[event.service].append(event)

    summaries: list[TelemetrySummary] = []
    for service, service_events in buckets.items():
        categories = Counter(event.category for event in service_events)
        severity = Counter(event.severity for event in service_events)
        suggestions: list[str] = []
        if severity.get("critical", 0) > 0:
            suggestions.append("запустить авто-плейбук инцидента и уведомить on-call")
        if categories.get("latency", 0) > 2:
            suggestions.append("передать ассистенту данные стресс-тестов и включить троттлинг")
        if categories.get("deployment", 0) > 0:
            suggestions.append("предложить ассистенту релизный отчёт и проверить фич-флаги")
        if not suggestions:
            suggestions.append("обновить статус ассистента: отклонений не обнаружено")
        summaries.append(
            TelemetrySummary(
                service=service,
                incidents=severity.get("critical", 0) + severity.get("high", 0),
                errors=categories.get("error", 0),
                slowdowns=categories.get("latency", 0),
                suggestions=tuple(suggestions),
            )
        )
    return summaries


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Агрегатор телеметрии Колибри ИИ")
    parser.add_argument("events", type=Path, help="JSON-массив событий телеметрии")
    parser.add_argument("--output", type=Path, help="Файл для записи сводки")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = json.loads(args.events.read_text(encoding="utf-8"))
    if not isinstance(payload, list):  # pragma: no cover - защитная ветка
        raise ValueError("Ожидался JSON-массив событий")

    events = load_events(payload)
    summaries = summarize(events)
    rendered = json.dumps(
        [
            {
                "service": summary.service,
                "incidents": summary.incidents,
                "errors": summary.errors,
                "slowdowns": summary.slowdowns,
                "suggestions": list(summary.suggestions),
            }
            for summary in summaries
        ],
        ensure_ascii=False,
        indent=2,
    )

    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:  # pragma: no cover - ручной режим
        print(rendered)
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI вход
    raise SystemExit(main())
