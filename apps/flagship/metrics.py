"""Метрики пользовательского опыта флагманских приложений Колибри."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True, slots=True)
class ExperienceReview:
    """Сводка UX-показателей."""

    app: str
    satisfaction: float
    retention: float
    nps: float

    def health_score(self) -> float:
        weights = (0.4, 0.3, 0.3)
        values = (self.satisfaction, self.retention, self.nps)
        return sum(w * v for w, v in zip(weights, values))

    def meets_targets(self) -> bool:
        return self.satisfaction >= 0.85 and self.retention >= 0.7 and self.nps >= 45

    @classmethod
    def aggregate(cls, reviews: Sequence["ExperienceReview"]) -> "ExperienceReview":
        if not reviews:
            return cls(app="aggregate", satisfaction=0.0, retention=0.0, nps=0.0)
        satisfaction = sum(review.satisfaction for review in reviews) / len(reviews)
        retention = sum(review.retention for review in reviews) / len(reviews)
        nps = sum(review.nps for review in reviews) / len(reviews)
        return cls(app="aggregate", satisfaction=satisfaction, retention=retention, nps=nps)
