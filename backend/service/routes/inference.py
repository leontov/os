"""LLM inference endpoints."""
from __future__ import annotations

import json
import time
from typing import Any, Dict

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from ..audit import log_audit_event, log_genome_event
from ..config import Settings, get_settings
from ..instrumentation import INFER_LATENCY, INFER_REQUESTS
from ..schemas import InferenceRequest, InferenceResponse
from ..security import AuthContext, require_permission

__all__ = ["router"]

router = APIRouter()


def _extract_text(payload: Any) -> str:
    if isinstance(payload, dict):
        if isinstance(payload.get("response"), str):
            return payload["response"].strip()

        choices = payload.get("choices")
        if isinstance(choices, list) and choices:
            first_choice = choices[0]
            if isinstance(first_choice, dict):
                message = first_choice.get("message")
                if isinstance(message, dict) and isinstance(message.get("content"), str):
                    return message["content"].strip()
                if isinstance(first_choice.get("text"), str):
                    return first_choice["text"].strip()

        if isinstance(payload.get("content"), str):
            return payload["content"].strip()

    raise ValueError("Upstream response did not contain text output")


async def _perform_upstream_call(
    request: InferenceRequest,
    settings: Settings,
) -> tuple[str, float, str]:
    if not settings.llm_endpoint:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM endpoint is not configured",
        )

    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"

    temperature = request.temperature
    if temperature is None:
        temperature = settings.llm_temperature_default

    max_tokens = request.max_tokens
    if max_tokens is None:
        max_tokens = settings.llm_max_tokens_default

    payload: Dict[str, Any] = {
        "prompt": request.prompt,
        "mode": request.mode,
        "model": settings.llm_model,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    sanitized_payload = {key: value for key, value in payload.items() if value is not None}

    start = time.perf_counter()
    async with httpx.AsyncClient(timeout=settings.llm_timeout) as client:
        upstream_response = await client.post(
            settings.llm_endpoint,
            json=sanitized_payload,
            headers=headers,
        )
    elapsed = (time.perf_counter() - start) * 1000.0

    try:
        upstream_response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Upstream LLM returned {exc.response.status_code}: {detail}",
        ) from exc

    try:
        payload_json = upstream_response.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Upstream LLM responded with invalid JSON",
        ) from exc

    try:
        text = _extract_text(payload_json)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    provider = "llm"
    if isinstance(payload_json, dict) and isinstance(payload_json.get("provider"), str):
        provider = payload_json["provider"].strip() or provider

    return text, elapsed, provider


@router.post("/api/v1/infer", response_model=InferenceResponse)
async def infer(
    request: InferenceRequest,
    settings: Settings = Depends(get_settings),
    context: AuthContext = Depends(require_permission("kolibri.infer")),
) -> InferenceResponse:
    if settings.response_mode != "llm":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM mode is disabled",
        )

    try:
        text, latency_ms, provider = await _perform_upstream_call(request, settings)
    except HTTPException:
        INFER_REQUESTS.labels(outcome="error").inc()
        log_audit_event(
            event_type="llm.infer.error",
            actor=context.subject,
            payload={"mode": request.mode},
            settings=settings,
        )
        raise

    INFER_REQUESTS.labels(outcome="success").inc()
    INFER_LATENCY.labels(provider=provider or "unknown").observe((latency_ms or 0.0) / 1000.0)

    log_audit_event(
        event_type="llm.infer",
        actor=context.subject,
        payload={
            "mode": request.mode,
            "provider": provider,
            "latency_ms": latency_ms,
        },
        settings=settings,
    )
    log_genome_event(
        stage="response",
        actor=context.subject,
        payload={"provider": provider, "latency_ms": latency_ms},
        settings=settings,
    )
    return InferenceResponse(response=text, provider=provider, latency_ms=latency_ms)
