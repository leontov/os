"""Moderation pipeline utilities for inference responses."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Iterable, List, Sequence, Tuple

import httpx

from .config import Settings

LOGGER = logging.getLogger("kolibri.service.moderation")

_POSITIVE_LEXICON = {
    "admire",
    "amazing",
    "awesome",
    "brilliant",
    "calm",
    "cheerful",
    "compassion",
    "excellent",
    "fair",
    "gentle",
    "great",
    "happy",
    "kind",
    "love",
    "peace",
    "pleasant",
    "polite",
    "positive",
    "respect",
    "supportive",
    "thank",
    "tolerant",
    "wonderful",
}

_NEGATIVE_LEXICON = {
    "abuse",
    "angry",
    "annoying",
    "awful",
    "bad",
    "cruel",
    "damn",
    "disgusting",
    "furious",
    "hate",
    "horrible",
    "idiot",
    "insult",
    "kill",
    "nasty",
    "offend",
    "rage",
    "rude",
    "stupid",
    "terrible",
    "toxic",
    "ugly",
    "violent",
}


class ModerationError(RuntimeError):
    """Raised when moderation rules reject a prompt or response."""

    def __init__(
        self,
        *,
        message: str,
        code: str,
        topics: Sequence[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.topics = list(topics or [])


@dataclass(slots=True)
class ToneEvaluation:
    """Structured information about the evaluated tone."""

    label: str
    score: float
    negative_terms: List[str]
    positive_terms: List[str]


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[\w']+", text.lower())


def _score_terms(tokens: Iterable[str]) -> Tuple[List[str], List[str]]:
    positives: List[str] = []
    negatives: List[str] = []
    for token in tokens:
        if token in _POSITIVE_LEXICON:
            positives.append(token)
        if token in _NEGATIVE_LEXICON:
            negatives.append(token)
    return negatives, positives


def evaluate_tone(text: str, *, threshold: float) -> ToneEvaluation:
    tokens = _tokenize(text)
    negatives, positives = _score_terms(tokens)
    hits = len(negatives) + len(positives)
    if hits == 0:
        score = 0.0
    else:
        score = len(negatives) / hits

    label = "neutral"
    if hits > 0 and len(positives) > len(negatives):
        label = "positive"
    elif len(negatives) > 0 and score >= threshold:
        label = "negative"

    return ToneEvaluation(label=label, score=score, negative_terms=negatives, positive_terms=positives)


def detect_forbidden_topics(text: str, forbidden_topics: Sequence[str]) -> List[str]:
    matches: List[str] = []
    if not forbidden_topics:
        return matches
    for topic in forbidden_topics:
        normalized = topic.strip()
        if not normalized:
            continue
        pattern = re.escape(normalized)
        if re.search(pattern, text, flags=re.IGNORECASE):
            matches.append(normalized)
    return matches


def enforce_prompt_policy(prompt: str, settings: Settings) -> None:
    matches = detect_forbidden_topics(prompt, settings.moderation_forbidden_topics)
    if matches:
        raise ModerationError(
            message="Prompt contains topics that are not allowed", code="prompt_forbidden", topics=matches
        )


async def _call_paraphraser(text: str, settings: Settings) -> str:
    if not settings.paraphraser_endpoint:
        return text

    headers = {"Content-Type": "application/json"}
    if settings.paraphraser_api_key:
        headers["Authorization"] = f"Bearer {settings.paraphraser_api_key}"

    payload = {"text": text, "mode": "toxicity_reduction"}

    try:
        async with httpx.AsyncClient(timeout=settings.paraphraser_timeout) as client:
            response = await client.post(settings.paraphraser_endpoint, json=payload, headers=headers)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        LOGGER.warning("Paraphraser request failed: %s", exc)
        return text

    try:
        data = response.json()
    except ValueError:
        LOGGER.warning("Paraphraser returned non-JSON payload")
        return text

    if isinstance(data, dict):
        for key in ("paraphrased", "text", "content", "response"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    if isinstance(data, str) and data.strip():
        return data.strip()

    LOGGER.warning("Paraphraser response did not contain text field")
    return text


async def moderate_response(response: str, settings: Settings) -> tuple[str, ToneEvaluation, bool]:
    matches = detect_forbidden_topics(response, settings.moderation_forbidden_topics)
    if matches:
        raise ModerationError(
            message="Response contains topics that are not allowed", code="response_forbidden", topics=matches
        )

    threshold = settings.moderation_tone_negative_threshold
    if threshold <= 0:
        threshold = 1.0
    tone = evaluate_tone(response, threshold=threshold)

    paraphrased = False
    moderated_text = response
    if tone.label == "negative" and settings.paraphraser_endpoint:
        moderated_text = await _call_paraphraser(response, settings)
        paraphrased = moderated_text != response

    return moderated_text, tone, paraphrased
