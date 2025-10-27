"""Reusable middleware components for the Kolibri backend service."""
from __future__ import annotations

import logging
import time
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp

from .instrumentation import HTTP_REQUESTS, HTTP_REQUEST_LATENCY
from .observability import generate_trace_id, record_duration, reset_trace_id, set_trace_id

__all__ = ["RequestContextMiddleware"]


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach trace identifiers and structured logging to incoming requests."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._logger = logging.getLogger("kolibri.service.http")

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        trace_id = generate_trace_id()
        token = set_trace_id(trace_id)
        start = time.perf_counter()
        method = request.method.upper()
        path_template = request.url.path
        status_code = 500
        outcome = "error"
        try:
            response = await call_next(request)
            status_code = response.status_code
            outcome = "success" if status_code < 400 else "error"
            return response
        except Exception:
            self._logger.exception(
                "request_failed",
                extra={
                    "http_method": method,
                    "http_route": path_template,
                },
            )
            raise
        finally:
            duration = record_duration(start)
            route = self._resolve_route(request, path_template)
            HTTP_REQUESTS.labels(
                method=method,
                route=route,
                status=str(status_code),
                outcome=outcome,
            ).inc()
            HTTP_REQUEST_LATENCY.labels(method=method, route=route).observe(duration)
            self._logger.info(
                "request_completed",
                extra={
                    "http_method": method,
                    "http_route": route,
                    "status_code": status_code,
                    "duration_ms": round(duration * 1000.0, 3),
                },
            )
            reset_trace_id(token)

    @staticmethod
    def _resolve_route(request: Request, fallback: str) -> str:
        route: Any = request.scope.get("route")
        if route and hasattr(route, "path"):
            path = getattr(route, "path", None)
            if isinstance(path, str) and path:
                return path
        return fallback
