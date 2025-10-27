"""Compatibility module exposing the Kolibri FastAPI application."""
from __future__ import annotations

from .app import app, create_app
from .middlewares import RequestContextMiddleware

__all__ = ["app", "create_app", "RequestContextMiddleware"]
