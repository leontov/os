"""Application lifespan handlers."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import get_settings
from .observability import configure_logging

__all__ = ["lifespan"]


@asynccontextmanager
async def lifespan(app: FastAPI):  # pragma: no cover - integration behaviour tested
    settings = get_settings()
    configure_logging(settings.log_level, json_logs=settings.log_json)
    logging.getLogger("kolibri.service").info(
        "observability_configured",
        extra={
            "log_level": settings.log_level,
            "log_json": settings.log_json,
        },
    )
    yield
