"""Аналитика аномалий и рекомендации масштабирования для Колибри ИИ.

Модуль покрывает задачи Фазы 3 по обнаружению аномалий и предиктивному
масштабированию. Он обрабатывает временные ряды метрик, вычисляет z-score
и тренды наклона, после чего выдаёт рекомендации по масштабированию сервисов.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from collections.abc import Mapping, Sequence as ABCSequence
from pathlib import Path
from statistics import mean, pstdev
from typing import Iterable, Sequence

Number = float


@dataclass(frozen=True, slots=True)
class MetricSeries:
    """Ряд метрик для сервиса."""

    service: str
    metric: str
    timestamps: tuple[str, ...]
    values: tuple[Number, ...]

    def slope(self) -> float:
        """Линейный тренд на основе последнего окна значений."""

        if len(self.values) < 2:
            return 0.0
        diffs = [self.values[i + 1] - self.values[i] for i in range(len(self.values) - 1)]
        return sum(diffs) / len(diffs)


@dataclass(frozen=True, slots=True)
class Anomaly:
    """Информация об обнаруженной аномалии."""

    index: int
    value: Number
    z_score: float
    recommendation: str


def _z_scores(values: Sequence[Number]) -> list[float]:
    if not values:
        return []
    if len(values) == 1:
        return [0.0]
    mu = mean(values)
    sigma = pstdev(values)
    if sigma == 0:
        return [0.0 for _ in values]
    return [(value - mu) / sigma for value in values]


def detect_anomalies(series: MetricSeries, *, threshold: float = 2.5) -> list[Anomaly]:
    """Выявить аномалии по z-score и текущему тренду."""

    anomalies: list[Anomaly] = []
    scores = _z_scores(series.values)
    trend = series.slope()
    for idx, (value, score) in enumerate(zip(series.values, scores)):
        if abs(score) < threshold:
            continue
        if score > 0 and trend > 0:
            recommendation = "увеличить ресурсы и включить авто-масштабирование"
        elif score < 0 and trend < 0:
            recommendation = "проверить недогрузку и скорректировать лимиты"
        else:
            recommendation = "проверить наблюдаемость и повторить измерения"
        anomalies.append(Anomaly(index=idx, value=value, z_score=score, recommendation=recommendation))
    return anomalies


@dataclass(frozen=True, slots=True)
class Forecast:
    """Прогноз масштабирования на основе тенденций."""

    service: str
    metric: str
    slope: float
    requires_scale_up: bool
    requires_scale_down: bool


def forecast_capacity(series: MetricSeries, *, upper: float, lower: float) -> Forecast:
    slope = series.slope()
    latest = series.values[-1] if series.values else 0.0
    projection = latest + slope * max(1, len(series.values) // 2)
    peak = max(series.values) if series.values else 0.0
    return Forecast(
        service=series.service,
        metric=series.metric,
        slope=slope,
        requires_scale_up=latest >= upper
        or projection >= upper
        or (slope > 0 and (latest >= 0.6 * upper or peak >= 0.85 * upper)),
        requires_scale_down=latest <= lower or slope < 0 and latest <= 1.2 * lower,
    )


def _ensure_sequence_of_strings(value: object) -> tuple[str, ...]:
    if isinstance(value, ABCSequence) and not isinstance(value, (str, bytes, bytearray)):
        return tuple(str(item) for item in value)
    return ()


def _ensure_sequence_of_numbers(value: object) -> tuple[Number, ...]:
    if isinstance(value, ABCSequence) and not isinstance(value, (str, bytes, bytearray)):
        result: list[Number] = []
        for item in value:
            try:
                result.append(float(item))
            except (TypeError, ValueError):
                continue
        return tuple(result)
    return ()


def load_series(payload: Iterable[Mapping[str, object]]) -> list[MetricSeries]:
    series: list[MetricSeries] = []
    for entry in payload:
        timestamps = _ensure_sequence_of_strings(entry.get("timestamps"))
        values = _ensure_sequence_of_numbers(entry.get("values"))
        series.append(
            MetricSeries(
                service=str(entry.get("service", "unknown")),
                metric=str(entry.get("metric", "latency")),
                timestamps=timestamps,
                values=values,
            )
        )
    return series


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Аналитика аномалий Колибри ИИ")
    parser.add_argument("metrics", type=Path, help="JSON с временными рядами метрик")
    parser.add_argument("--threshold", type=float, default=2.5, help="Порог z-score для аномалий")
    parser.add_argument("--upper", type=float, default=0.8, help="Верхний порог для масштабирования")
    parser.add_argument("--lower", type=float, default=0.2, help="Нижний порог для масштабирования")
    parser.add_argument("--output", type=Path, help="Файл для записи рекомендаций")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = json.loads(args.metrics.read_text(encoding="utf-8"))
    if not isinstance(payload, list):  # pragma: no cover - защитная ветка
        raise ValueError("Ожидался JSON-массив рядов метрик")

    series_list = load_series(payload)
    output: list[dict[str, object]] = []
    for series in series_list:
        anomalies = detect_anomalies(series, threshold=args.threshold)
        forecast = forecast_capacity(series, upper=args.upper, lower=args.lower)
        output.append(
            {
                "service": series.service,
                "metric": series.metric,
                "anomalies": [
                    {
                        "timestamp": series.timestamps[item.index] if series.timestamps else item.index,
                        "value": item.value,
                        "z_score": round(item.z_score, 3),
                        "recommendation": item.recommendation,
                    }
                    for item in anomalies
                ],
                "forecast": {
                    "slope": round(forecast.slope, 4),
                    "scale_up": forecast.requires_scale_up,
                    "scale_down": forecast.requires_scale_down,
                },
            }
        )

    rendered = json.dumps(output, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:  # pragma: no cover - ручной запуск
        print(rendered)

    return 0


if __name__ == "__main__":  # pragma: no cover - CLI вход
    raise SystemExit(main())
