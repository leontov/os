"""Intent classification endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..config import Settings, get_settings
from ..intent_classifier import INTENT_CLASSIFIER
from ..prompt_catalog import PROMPT_CATALOG, select_variant
from ..schemas import (
    IntentCandidate,
    IntentClassificationRequest,
    IntentClassificationResponse,
    PromptTemplateView,
)

__all__ = ["router"]

router = APIRouter()


@router.post("/api/v1/intents/resolve", response_model=IntentClassificationResponse)
async def resolve_intent(
    request: IntentClassificationRequest,
    settings: Settings = Depends(get_settings),
) -> IntentClassificationResponse:
    del settings  # Currently unused but kept for future configuration hooks

    text = request.text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text must not be empty",
        )

    predictions = INTENT_CLASSIFIER.predict(
        text,
        context=request.context,
        top_k=request.top_k,
    )
    if not predictions:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Intent classifier is not available",
        )

    base_identifier = "|".join([request.text, *request.context])
    variant = (request.variant or select_variant(base_identifier)).lower()
    if variant not in {"a", "b"}:
        variant = "a"

    language = (request.language or "en").lower()

    primary = predictions[0]
    prompts, settings_payload = PROMPT_CATALOG.get_prompts(primary.intent, variant, language=language)
    if not prompts and variant != "a":
        variant = "a"
        prompts, settings_payload = PROMPT_CATALOG.get_prompts(primary.intent, variant, language=language)

    return IntentClassificationResponse(
        intent=primary.intent,
        confidence=primary.confidence,
        variant=variant,
        candidates=[
            IntentCandidate(intent=prediction.intent, confidence=prediction.confidence)
            for prediction in predictions
        ],
        prompts=[
            PromptTemplateView(
                id=prompt.id,
                intent=prompt.intent,
                title=prompt.title,
                body=prompt.body,
                tags=list(prompt.tags),
            )
            for prompt in prompts
        ],
        settings=settings_payload,
    )
