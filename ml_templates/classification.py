"""Шаблон классификационной модели для Колибри."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .base import DatasetProfile, EvaluationResult, PipelineTemplate


@dataclass(slots=True)
class ClassificationTemplate(PipelineTemplate):
    """Специализация PipelineTemplate для задач классификации."""

    classes: tuple[str, ...]

    def confusion_penalty(self, matrix: Sequence[Sequence[int]]) -> float:
        total = sum(sum(row) for row in matrix)
        if total == 0:
            return 0.0
        correct = sum(matrix[i][i] for i in range(min(len(matrix), len(matrix[0]))))
        return 1.0 - correct / total

    def evaluate_accuracy(self, accuracy: float, threshold: float) -> EvaluationResult:
        return EvaluationResult(metric="accuracy", value=accuracy, threshold=threshold)
