"""LLM inference endpoints."""
from __future__ import annotations

import json
import time
from typing import Any, AsyncGenerator, Dict, Iterable

import httpx
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from ..audit import log_audit_event, log_genome_event
from ..config import Settings, get_settings
from ..instrumentation import INFER_LATENCY, INFER_REQUESTS
from ..schemas import InferenceRequest, InferenceResponse
from ..security import AuthContext, get_rbac_policy, require_permission, verify_session_token

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


def _token_chunks(text: str, *, chunk_size: int = 32) -> Iterable[str]:
    buffer: list[str] = []
    for char in text:
        buffer.append(char)
        if len(buffer) >= chunk_size and char.isspace():
            yield "".join(buffer)
            buffer.clear()
    if buffer:
        yield "".join(buffer)


def _encode_sse(event: str, payload: Dict[str, Any]) -> str:
    data = json.dumps(payload, ensure_ascii=False)
    return f"event: {event}\ndata: {data}\n\n"


async def _execute_inference(
    request: InferenceRequest,
    settings: Settings,
    context: AuthContext,
) -> tuple[str, float, str]:
    try:
        text, latency_ms, provider = await _perform_upstream_call(request, settings)
    except HTTPException as exc:
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
    return text, latency_ms, provider


async def _sse_event_stream(
    request: InferenceRequest,
    settings: Settings,
    context: AuthContext,
) -> AsyncGenerator[str, None]:
    try:
        text, latency_ms, provider = await _execute_inference(request, settings, context)
    except HTTPException as exc:
        yield _encode_sse("error", {"detail": exc.detail})
        return

    for chunk in _token_chunks(text):
        if chunk:
            yield _encode_sse("token", {"token": chunk})

    yield _encode_sse(
        "done",
        {
            "provider": provider,
            "latency_ms": latency_ms,
        },
    )


async def _websocket_event_stream(
    request: InferenceRequest,
    settings: Settings,
    context: AuthContext,
) -> AsyncGenerator[Dict[str, Any], None]:
    try:
        text, latency_ms, provider = await _execute_inference(request, settings, context)
    except HTTPException as exc:
        yield {"type": "error", "detail": exc.detail}
        return

    for chunk in _token_chunks(text):
        if chunk:
            yield {"type": "token", "token": chunk}

    yield {"type": "done", "provider": provider, "latency_ms": latency_ms}


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

    text, latency_ms, provider = await _execute_inference(request, settings, context)
    return InferenceResponse(response=text, provider=provider, latency_ms=latency_ms)


@router.post("/api/v1/infer/stream")
async def infer_stream(
    request: InferenceRequest,
    settings: Settings = Depends(get_settings),
    context: AuthContext = Depends(require_permission("kolibri.infer")),
) -> StreamingResponse:
    if settings.response_mode != "llm":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM mode is disabled",
        )

    stream = _sse_event_stream(request, settings, context)
    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return StreamingResponse(stream, media_type="text/event-stream", headers=headers)


async def _authenticate_websocket(websocket: WebSocket, settings: Settings) -> AuthContext:
    policy_violation_code = 1008
    if not settings.sso_enabled:
        roles = set(settings.offline_mode_roles or ["system:admin"])
        return AuthContext(
            subject="offline-mode",
            roles=roles,
            attributes={"mode": "offline"},
            session_expires_at=None,
            session_id=None,
        )

    authorization = websocket.headers.get("Authorization")
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if not token:
            await websocket.close(code=policy_violation_code, reason="Empty bearer token")
            raise WebSocketDisconnect(code=policy_violation_code)
        try:
            return verify_session_token(token, settings)
        except HTTPException as exc:  # pragma: no cover - defensive close
            await websocket.close(code=policy_violation_code, reason=exc.detail)
            raise WebSocketDisconnect(code=policy_violation_code) from exc

    await websocket.close(code=policy_violation_code, reason="Missing bearer token")
    raise WebSocketDisconnect(code=policy_violation_code)


@router.websocket("/ws/v1/infer")
async def infer_websocket(websocket: WebSocket) -> None:
    settings = get_settings()
    if settings.response_mode != "llm":
        await websocket.close(code=1013, reason="LLM mode is disabled")
        return

    try:
        context = await _authenticate_websocket(websocket, settings)
    except WebSocketDisconnect:
        return

    policy = get_rbac_policy(settings=settings)
    if not policy.is_allowed(context.roles, "kolibri.infer"):
        await websocket.close(code=1008, reason="Insufficient permissions")
        return

    await websocket.accept()

    while True:
        try:
            payload = await websocket.receive_json()
        except WebSocketDisconnect:
            break
        except json.JSONDecodeError:
            await websocket.send_json({"type": "error", "detail": "Invalid JSON payload"})
            continue

        try:
            request = InferenceRequest(**payload)
        except ValidationError as exc:
            await websocket.send_json(
                {
                    "type": "error",
                    "detail": "Invalid request payload",
                    "errors": exc.errors(),
                }
            )
            continue

        async for message in _websocket_event_stream(request, settings, context):
            try:
                await websocket.send_json(message)
            except WebSocketDisconnect:
                return
