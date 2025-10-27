"""Structured logging and tracing utilities for Kolibri services."""
from __future__ import annotations

import json
import logging
import sys
import threading
import time
import uuid
from contextvars import ContextVar, Token
from datetime import datetime, timezone
from typing import Any, Dict


_TRACE_ID: ContextVar[str | None] = ContextVar("kolibri_trace_id", default=None)
_CONFIG_LOCK = threading.Lock()
_CONFIGURED = False

_EXCLUDED_FIELDS = {
    "args",
    "asctime",
    "created",
    "exc_info",
    "exc_text",
    "filename",
    "funcName",
    "levelname",
    "levelno",
    "lineno",
    "module",
    "msecs",
    "message",
    "msg",
    "name",
    "pathname",
    "process",
    "processName",
    "relativeCreated",
    "stack_info",
    "thread",
    "threadName",
}


def generate_trace_id() -> str:
    """Generate a lightweight unique identifier for tracing log events."""

    return uuid.uuid4().hex


def get_trace_id() -> str | None:
    """Return the trace identifier bound to the current context, if any."""

    return _TRACE_ID.get()


def set_trace_id(trace_id: str | None) -> Token[str | None]:
    """Bind the provided trace identifier to the current execution context."""

    return _TRACE_ID.set(trace_id)


def reset_trace_id(token: Token[str | None]) -> None:
    """Restore the tracing context to a previous state."""

    _TRACE_ID.reset(token)


class JsonFormatter(logging.Formatter):
    """Format log records as structured JSON payloads."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401 - inherited docstring is sufficient
        timestamp = datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat()
        payload: Dict[str, Any] = {
            "ts": timestamp,
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }

        trace_id = get_trace_id()
        if trace_id:
            payload["trace_id"] = trace_id

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        for key, value in record.__dict__.items():
            if key in _EXCLUDED_FIELDS:
                continue
            payload.setdefault(key, value)

        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO", *, json_logs: bool = True) -> None:
    """Install a consistent logging configuration across the service."""

    global _CONFIGURED
    with _CONFIG_LOCK:
        if _CONFIGURED:
            return

        resolved_level = logging.getLevelName(level.upper())
        if isinstance(resolved_level, str):
            resolved_level = logging.INFO

        handler = logging.StreamHandler(sys.stdout)
        if json_logs:
            handler.setFormatter(JsonFormatter())
        else:
            handler.setFormatter(
                logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
            )

        service_logger = logging.getLogger("kolibri")
        service_logger.handlers = [handler]
        service_logger.setLevel(resolved_level)
        service_logger.propagate = False

        logging.getLogger("uvicorn.error").setLevel(resolved_level)
        logging.getLogger("uvicorn.access").setLevel(resolved_level)

        _CONFIGURED = True


def record_duration(start_time: float) -> float:
    """Return the elapsed duration in seconds given a monotonic start time."""

    return max(time.perf_counter() - start_time, 0.0)

