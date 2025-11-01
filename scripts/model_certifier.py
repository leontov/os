"""Автоматизированная сертификация моделей Колибри ИИ.

Закрывает пункт Фазы 3: проверка доверия и энергоэффективности моделей.
Скрипт анализирует отчёты о качестве и энергопотреблении, формируя вердикт.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping as ABCMapping
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True, slots=True)
class CertificationInput:
    """Описание модели и её метрик."""

    name: str
    accuracy: float
    fairness: float
    energy_j: float
    latency_ms: float


@dataclass(frozen=True, slots=True)
class CertificationReport:
    """Вердикт по модели."""

    model: str
    approved: bool
    reasons: tuple[str, ...]


def _coerce_float(value: object, *, default: float = 0.0) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def load_input(payload: Mapping[str, object]) -> CertificationInput:
    return CertificationInput(
        name=str(payload.get("name", "model")),
        accuracy=_coerce_float(payload.get("accuracy")),
        fairness=_coerce_float(payload.get("fairness")),
        energy_j=_coerce_float(payload.get("energy_j")),
        latency_ms=_coerce_float(payload.get("latency_ms")),
    )


def certify(data: CertificationInput, *, thresholds: Mapping[str, float]) -> CertificationReport:
    reasons: list[str] = []
    if data.accuracy < thresholds.get("accuracy", 0.8):
        reasons.append("недостаточная точность")
    if data.fairness < thresholds.get("fairness", 0.75):
        reasons.append("требуются корректировки справедливости")
    if data.energy_j > thresholds.get("energy_j", 6.0):
        reasons.append("превышены лимиты энергоэффективности")
    if data.latency_ms > thresholds.get("latency_ms", 150.0):
        reasons.append("латентность выше SLO")
    approved = not reasons
    if approved:
        reasons.append("модель соответствует стандартам доверия и эффективности")
    return CertificationReport(model=data.name, approved=approved, reasons=tuple(reasons))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Сертификация моделей Колибри ИИ")
    parser.add_argument("report", type=Path, help="JSON с метриками модели")
    parser.add_argument("--thresholds", type=Path, help="JSON с порогами сертификации")
    parser.add_argument("--output", type=Path, help="Файл для записи вердикта")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = json.loads(args.report.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):  # pragma: no cover - защитная ветка
        raise ValueError("Ожидался JSON-объект с метриками")
    thresholds: Mapping[str, float] = {}
    if args.thresholds:
        thresholds_payload = json.loads(args.thresholds.read_text(encoding="utf-8"))
        if isinstance(thresholds_payload, ABCMapping):
            parsed: dict[str, float] = {}
            for key, value in thresholds_payload.items():
                if isinstance(key, str):
                    parsed[key] = _coerce_float(value)
            thresholds = parsed
    input_data = load_input(payload)
    report = certify(input_data, thresholds=thresholds)
    rendered = json.dumps(
        {
            "model": report.model,
            "approved": report.approved,
            "reasons": list(report.reasons),
        },
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
