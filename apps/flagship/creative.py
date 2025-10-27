"""Генеративная студия Колибри — флагманское приложение."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from ml_templates import GenerativeTemplate
from ml_templates.base import DatasetProfile, EvaluationResult
from .metrics import ExperienceReview


@dataclass(slots=True)
class CreativeStudio:
    """Приложение для творческих сценариев."""

    template: GenerativeTemplate

    @classmethod
    def default(cls) -> "CreativeStudio":
        dataset = DatasetProfile(
            name="creative_prompts",
            samples=50000,
            features=("prompt", "style", "tone"),
            target="artifact",
        )
        template = GenerativeTemplate(
            name="kolibri-creative",
            dataset=dataset,
            preprocessors=("normalize-style", "safety-filter"),
            trainer="diffusion-finetune",
            evaluators=(),
            modalities=("text", "image"),
        )

        def evaluator(metrics: Sequence[float], *, target: GenerativeTemplate = template) -> EvaluationResult:
            return target.coherence_score(metrics)

        template.evaluators = (lambda metrics: evaluator(metrics),)
        return cls(template=template)

    def produce(self, judges: Sequence[float]) -> ExperienceReview:
        coherence = self.template.coherence_score(judges)
        energy = self.template.energy_per_output(4.2)
        readiness = self.template.readiness((coherence.value,))
        return ExperienceReview(
            app="creative",
            satisfaction=min(0.95, coherence.value),
            retention=0.75 + 0.1 * readiness,
            nps=47 + coherence.value * 10 - energy.value,
        )
