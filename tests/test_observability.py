from __future__ import annotations

import io
import json
import logging

from backend.service.observability import JsonFormatter, reset_trace_id, set_trace_id


def test_json_formatter_includes_trace_and_extras() -> None:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())

    logger = logging.getLogger("kolibri.test_observability")
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False

    token = set_trace_id("trace-1234")
    try:
        logger.info("hello", extra={"event": "unit", "custom": 42})
    finally:
        reset_trace_id(token)

    payload = json.loads(stream.getvalue())
    assert payload["message"] == "hello"
    assert payload["trace_id"] == "trace-1234"
    assert payload["event"] == "unit"
    assert payload["custom"] == 42
    assert payload["level"] == "info"
