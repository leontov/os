"""Генеративные шаблоны Колибри."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .base import EvaluationResult, PipelineTemplate


@dataclass(slots=True)
class GenerativeTemplate(PipelineTemplate):
    """Шаблон генеративного приложения."""

    modalities: tuple[str, ...]

    def coherence_score(self, judges: Sequence[float]) -> EvaluationResult:
        score = sum(judges) / len(judges) if judges else 0.0
        return EvaluationResult(metric="coherence", value=score, threshold=0.7)

    def energy_per_output(self, joules: float) -> EvaluationResult:
        return EvaluationResult(metric="energy_j", value=joules, threshold=5.0)
