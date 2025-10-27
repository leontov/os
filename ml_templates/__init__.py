"""Библиотека шаблонов ML для экосистемы «Колибри ИИ».

Модуль отвечает за пункт Фазы 3: предоставление библиотек шаблонов
рекомендательных, классификационных и генеративных моделей.
"""

from .base import DatasetProfile, EvaluationResult, PipelineTemplate
from .generative import GenerativeTemplate
from .recommendation import RecommendationTemplate
from .classification import ClassificationTemplate

__all__ = [
    "DatasetProfile",
    "EvaluationResult",
    "PipelineTemplate",
    "GenerativeTemplate",
    "RecommendationTemplate",
    "ClassificationTemplate",
]
