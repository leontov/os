"""Рекомендательные шаблоны Колибри."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from .base import EvaluationResult, PipelineTemplate


@dataclass(slots=True)
class RecommendationTemplate(PipelineTemplate):
    """Шаблон для систем рекомендаций."""

    objectives: tuple[str, ...]

    def diversification_score(self, exposures: Mapping[str, int]) -> float:
        total = sum(exposures.values())
        if total == 0:
            return 0.0
        unique = len([value for value in exposures.values() if value > 0])
        return unique / len(self.objectives)

    def evaluate_ctr(self, ctr: float, threshold: float) -> EvaluationResult:
        return EvaluationResult(metric="ctr", value=ctr, threshold=threshold)
