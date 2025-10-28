"""Производственная консоль Колибри — флагманское приложение."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from ml_templates import RecommendationTemplate
from ml_templates.base import DatasetProfile, EvaluationResult
from .metrics import ExperienceReview


@dataclass(slots=True)
class ProductivityConsole:
    """Приложение для операционной эффективности."""

    template: RecommendationTemplate

    @classmethod
    def default(cls) -> "ProductivityConsole":
        dataset = DatasetProfile(
            name="workflow_signals",
            samples=120000,
            features=("actor", "task", "duration", "energy"),
            target="priority",
        )
        template = RecommendationTemplate(
            name="kolibri-productivity",
            dataset=dataset,
            preprocessors=("normalize-duration", "energy-aware"),
            trainer="gradient-boosting",
            evaluators=(lambda metrics: EvaluationResult(metric="ctr", value=metrics[0], threshold=0.6),),
            objectives=("focus", "flow", "energy"),
        )
        return cls(template=template)

    def orchestrate(self, exposures: Mapping[str, int], ctr: float) -> ExperienceReview:
        diversification = self.template.diversification_score(exposures)
        evaluation = self.template.evaluate_ctr(ctr, threshold=0.62)
        readiness = self.template.readiness((evaluation.value,))
        return ExperienceReview(
            app="productivity",
            satisfaction=0.82 + 0.1 * diversification,
            retention=0.72 + 0.08 * readiness,
            nps=45 + diversification * 10 + evaluation.value * 5,
        )
