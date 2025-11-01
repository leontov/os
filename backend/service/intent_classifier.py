"""Intent classification utilities for Kolibri backend."""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

_TOKEN_PATTERN = re.compile(r"[\w'а-яё]+", re.IGNORECASE)


@dataclass(frozen=True)
class IntentSample:
    """A single training example."""

    text: str
    intent: str


@dataclass(frozen=True)
class IntentPrediction:
    """Prediction result for an intent."""

    intent: str
    confidence: float


class IntentClassifier:
    """Lightweight multinomial Naive Bayes classifier for intents."""

    def __init__(self) -> None:
        self._intent_counts: Dict[str, int] = {}
        self._token_counts: Dict[str, Dict[str, int]] = {}
        self._token_totals: Dict[str, int] = {}
        self._vocabulary: set[str] = set()
        self._total_samples = 0

    def fit(self, samples: Sequence[IntentSample]) -> None:
        if not samples:
            raise ValueError("Intent classifier requires at least one sample")

        for sample in samples:
            intent = sample.intent.strip().lower()
            if not intent:
                continue
            tokens = self._tokenize(sample.text)
            if not tokens:
                continue
            self._intent_counts[intent] = self._intent_counts.get(intent, 0) + 1
            token_bucket = self._token_counts.setdefault(intent, {})
            for token in tokens:
                token_bucket[token] = token_bucket.get(token, 0) + 1
                self._vocabulary.add(token)
            self._token_totals[intent] = self._token_totals.get(intent, 0) + len(tokens)
            self._total_samples += 1

        if not self._intent_counts:
            raise ValueError("Intent classifier did not receive valid samples")

    def predict(
        self,
        text: str,
        *,
        context: Iterable[str] | None = None,
        top_k: int = 3,
    ) -> List[IntentPrediction]:
        if not self._intent_counts:
            raise RuntimeError("Intent classifier is not trained")

        focus_tokens = self._tokenize(text)
        for extra in context or []:
            focus_tokens.extend(self._tokenize(extra))

        if not focus_tokens:
            # Fallback token to keep prior distribution meaningful
            focus_tokens = ["__empty__"]

        predictions: list[IntentPrediction] = []
        log_scores: Dict[str, float] = {}
        vocab_size = max(len(self._vocabulary), 1)
        total_examples = sum(self._intent_counts.values())

        for intent, count in self._intent_counts.items():
            log_prob = math.log(count / total_examples)
            token_total = self._token_totals.get(intent, 0) + vocab_size
            token_counts = self._token_counts.get(intent, {})
            for token in focus_tokens:
                token_freq = token_counts.get(token, 0) + 1
                log_prob += math.log(token_freq / token_total)
            log_scores[intent] = log_prob

        if not log_scores:
            return []

        max_log = max(log_scores.values())
        normaliser = sum(math.exp(score - max_log) for score in log_scores.values())

        for intent, score in sorted(log_scores.items(), key=lambda item: item[1], reverse=True):
            confidence = math.exp(score - max_log) / normaliser if normaliser else 0.0
            predictions.append(IntentPrediction(intent=intent, confidence=confidence))

        return predictions[: max(1, top_k)]

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        if not text:
            return []
        return [token.lower() for token in _TOKEN_PATTERN.findall(text)]


def _load_samples(path: Path) -> List[IntentSample]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_samples = payload.get("samples", [])
    samples: list[IntentSample] = []
    for item in raw_samples:
        text = str(item.get("text", "")).strip()
        intent = str(item.get("intent", "")).strip()
        if text and intent:
            samples.append(IntentSample(text=text, intent=intent))
    return samples


def load_default_classifier() -> IntentClassifier:
    """Load and train the default classifier from bundled data."""

    data_path = Path(__file__).with_name("data") / "intent_samples.json"
    if not data_path.exists():
        raise FileNotFoundError(f"Intent dataset not found: {data_path}")
    samples = _load_samples(data_path)
    classifier = IntentClassifier()
    classifier.fit(samples)
    # Record empty token to stabilise predictions for short prompts
    classifier._vocabulary.add("__empty__")
    return classifier


INTENT_CLASSIFIER = load_default_classifier()

__all__ = [
    "IntentSample",
    "IntentPrediction",
    "IntentClassifier",
    "INTENT_CLASSIFIER",
    "load_default_classifier",
]
