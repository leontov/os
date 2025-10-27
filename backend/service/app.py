"""Application factory for the Kolibri FastAPI service."""
from __future__ import annotations

from fastapi import FastAPI

from .config import get_settings
from .lifespan import lifespan
from .middlewares import RequestContextMiddleware
from .routes import api_router

__all__ = ["create_app", "app"]


def create_app() -> FastAPI:
    application = FastAPI(
        title="Kolibri Enterprise API",
        version="1.0.0",
        lifespan=lifespan,
    )
    application.add_middleware(RequestContextMiddleware)
    application.include_router(api_router)
    application.add_event_handler("shutdown", get_settings.cache_clear)
    return application


app = create_app()
