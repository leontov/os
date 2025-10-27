"""CLI-планировщик масштабирования моделей до 100 млрд параметров."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from training import ScaleBlueprint, build_blueprint_from_mapping


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Расчёт дорожной карты обучения моделей Колибри до 100 млрд параметров"
    )
    parser.add_argument(
        "config",
        type=Path,
        help="Путь к JSON с описанием модели, кластера и этапов обучения",
    )
    parser.add_argument(
        "--modalities",
        nargs="*",
        default=None,
        help="Список требуемых модальностей для оценки покрытия",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Путь для сохранения отчёта (JSON). Если не указан — вывод в stdout",
    )
    return parser.parse_args(argv)


def load_config(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):  # pragma: no cover - защитная ветка
        raise ValueError("Ожидался JSON-объект с конфигурацией масштабирования")
    return data


def render_report(blueprint: ScaleBlueprint, modalities: list[str] | None) -> str:
    report = blueprint.generate_report(required_modalities=modalities)
    return json.dumps(report, ensure_ascii=False, indent=2)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    config = load_config(args.config)
    blueprint = build_blueprint_from_mapping(config)

    modalities = args.modalities if args.modalities else None
    rendered = render_report(blueprint, modalities)

    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:  # pragma: no cover - вывод для ручного запуска
        print(rendered)

    return 0


if __name__ == "__main__":  # pragma: no cover - CLI вход
    raise SystemExit(main())
