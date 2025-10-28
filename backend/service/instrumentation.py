"""Prometheus instruments shared across Kolibri service routes."""
from __future__ import annotations

from .metrics import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    generate_latest,
    register_counter,
    register_histogram,
)

__all__ = [
    "registry",
    "INFER_REQUESTS",
    "INFER_LATENCY",
    "SSO_EVENTS",
    "HTTP_REQUESTS",
    "HTTP_REQUEST_LATENCY",
    "CONTENT_TYPE_LATEST",
    "generate_latest",
]

registry = CollectorRegistry()
INFER_REQUESTS = register_counter(
    registry,
    "kolibri_infer_requests_total",
    "Количество запросов к апстрим LLM",
    labelnames=("outcome",),
)
INFER_LATENCY = register_histogram(
    registry,
    "kolibri_infer_latency_seconds",
    "Латентность запроса к LLM",
    labelnames=("provider",),
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0),
)
SSO_EVENTS = register_counter(
    registry,
    "kolibri_sso_events_total",
    "Количество событий SSO",
    labelnames=("event",),
)
HTTP_REQUESTS = register_counter(
    registry,
    "kolibri_http_requests_total",
    "Количество HTTP запросов к сервису",
    labelnames=("method", "route", "status", "outcome"),
)
HTTP_REQUEST_LATENCY = register_histogram(
    registry,
    "kolibri_http_request_latency_seconds",
    "Латентность HTTP запросов к сервису",
    labelnames=("method", "route"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
)
