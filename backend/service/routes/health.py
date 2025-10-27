"""Health and diagnostics endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from ..config import Settings, get_settings
from ..instrumentation import CONTENT_TYPE_LATEST, generate_latest, registry
from ..schemas import HealthResponse

__all__ = ["router"]

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        response_mode=settings.response_mode,
        sso_enabled=settings.sso_enabled,
        prometheus_namespace=settings.prometheus_namespace,
    )


@router.get("/metrics")
async def metrics() -> Response:
    payload = generate_latest(registry)
    return Response(content=payload, media_type=CONTENT_TYPE_LATEST)
