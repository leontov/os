"""CLI наставнической программы «Колибри ИИ».

Инструмент завершает Фазу 2 дорожной карты: запуск обучения и наставничества
для исследовательских команд. Он позволяет загрузить описание курсов,
менторов и участников, построить учебные траектории и сохранить отчёт
о расписании для распределённых команд.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from training import MentorshipProgram, build_learning_journey, load_program_from_mapping


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Генерация наставнических программ Колибри ИИ")
    parser.add_argument("config", type=Path, help="Путь к JSON c курсами, менторами и участниками")
    parser.add_argument("--weeks", type=int, default=6, help="Количество недель программы")
    parser.add_argument(
        "--target-score",
        type=float,
        default=0.85,
        help="Желаемая итоговая оценка компетенций участников",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Путь для сохранения расписания (JSON). Если не указан, вывод в stdout.",
    )
    return parser.parse_args(argv)


def load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):  # pragma: no cover - защитная ветка
        raise ValueError("Ожидался JSON-объект с конфигурацией программы")
    return data


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    config = load_json(args.config)
    program = load_program_from_mapping(config)
    program.sessions_per_week = int(config.get("sessions_per_week", program.sessions_per_week))

    sessions = build_learning_journey(program, weeks=args.weeks, target_score=args.target_score)
    payload = [asdict(session) for session in sessions]

    rendered = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:  # pragma: no cover - вывод для ручного запуска
        print(rendered)

    return 0


if __name__ == "__main__":  # pragma: no cover - CLI вход
    raise SystemExit(main())
