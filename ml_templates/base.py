"""Базовые сущности ML-шаблонов Колибри."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Sequence


@dataclass(frozen=True, slots=True)
class DatasetProfile:
    """Описание датасета для ускоренного онбординга моделей."""

    name: str
    samples: int
    features: tuple[str, ...]
    target: str


@dataclass(frozen=True, slots=True)
class EvaluationResult:
    """Результат оценки модели."""

    metric: str
    value: float
    threshold: float

    @property
    def passed(self) -> bool:
        return self.value >= self.threshold


@dataclass(slots=True)
class PipelineTemplate:
    """Шаблон, описывающий ключевые шаги ML-конвейера."""

    name: str
    dataset: DatasetProfile
    preprocessors: tuple[str, ...]
    trainer: str
    evaluators: tuple[Callable[[Sequence[float]], EvaluationResult], ...]

    def evaluate(self, metrics: Sequence[float]) -> list[EvaluationResult]:
        if len(metrics) != len(self.evaluators):
            raise ValueError("Количество метрик не совпадает с числом оценщиков")
        return [evaluator((metrics[i],)) for i, evaluator in enumerate(self.evaluators)]

    def readiness(self, metrics: Sequence[float]) -> float:
        results = self.evaluate(metrics)
        success = sum(1 for result in results if result.passed)
        return success / len(results) if results else 0.0
