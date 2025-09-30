"""Telemetry helpers for exporting Kolibri backend metrics via OpenTelemetry."""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from typing import Optional, TYPE_CHECKING

_LOGGER = logging.getLogger(__name__)

try:  # pragma: no cover - exercised indirectly in runtime environments with OTEL installed
    from opentelemetry import metrics as otel_metrics
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.exporter.prometheus import PrometheusMetricReader
    from prometheus_client import start_http_server
    try:
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    except ImportError:  # pragma: no cover - OTLP support is optional
        OTLPMetricExporter = None  # type: ignore[assignment]
    _OTEL_AVAILABLE = True
except ImportError:  # pragma: no cover - allows unit tests without OTEL deps
    otel_metrics = None  # type: ignore[assignment]
    MeterProvider = None  # type: ignore[assignment]
    PeriodicExportingMetricReader = None  # type: ignore[assignment]
    Resource = None  # type: ignore[assignment]
    PrometheusMetricReader = None  # type: ignore[assignment]
    start_http_server = None  # type: ignore[assignment]
    OTLPMetricExporter = None  # type: ignore[assignment]
    _OTEL_AVAILABLE = False

if TYPE_CHECKING:  # pragma: no cover - typing hints only
    from opentelemetry.metrics import Counter, Histogram, Meter
else:  # pragma: no cover - mypy/runtime fallback when OTEL is missing
    Counter = Histogram = Meter = object  # type: ignore[misc, assignment]


_PRIVACY_DISABLED_VALUES = {"", "0", "false", "no", "off"}


@dataclass
class TelemetryHandle:
    """Concrete metric instruments used by backend components."""

    event_counter: "Counter"
    event_errors: "Counter"
    genome_blocks: "Histogram"
    soak_duration: "Histogram"
    soak_events: "Counter"

    def record_event(self, event_type: str, genome_blocks: int) -> None:
        attributes = {"event.type": event_type}
        self.event_counter.add(1, attributes)
        self.genome_blocks.record(float(genome_blocks), attributes)

    def record_error(self, event_type: str) -> None:
        self.event_errors.add(1, {"event.type": event_type})

    def record_soak(self, duration_seconds: float, events: int) -> None:
        attributes = {"phase": "soak"}
        self.soak_duration.record(duration_seconds, attributes)
        if events:
            self.soak_events.add(events, attributes)


class _NoopHandle:
    """Fallback handle used when telemetry is disabled or unavailable."""

    __slots__ = ()

    def record_event(self, event_type: str, genome_blocks: int) -> None:  # pragma: no cover - trivial
        return

    def record_error(self, event_type: str) -> None:  # pragma: no cover - trivial
        return

    def record_soak(self, duration_seconds: float, events: int) -> None:  # pragma: no cover - trivial
        return


class _TelemetryFactory:
    """Initialises and caches the OpenTelemetry meter provider."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._initialized = False
        self._enabled = False
        self._meter: Optional["Meter"] = None
        self._prometheus_started = False

    def get_handle(self) -> TelemetryHandle | _NoopHandle:
        if not self._initialized:
            self._lazy_initialize()
        if not self._enabled or self._meter is None:
            return _NoopHandle()
        meter = self._meter
        event_counter = meter.create_counter(
            name="kolibri_backend_events_total",
            description="Total Kolibri backend events recorded",
        )
        event_errors = meter.create_counter(
            name="kolibri_backend_events_failed_total",
            description="Total Kolibri backend events that resulted in errors",
        )
        genome_blocks = meter.create_histogram(
            name="kolibri_backend_genome_blocks",
            unit="blocks",
            description="Distribution of genome length after backend events",
        )
        soak_duration = meter.create_histogram(
            name="kolibri_backend_soak_duration_seconds",
            unit="s",
            description="Duration of soak simulations executed by Kolibri",
        )
        soak_events = meter.create_counter(
            name="kolibri_backend_soak_events_total",
            unit="events",
            description="Number of events generated during soak simulations",
        )
        return TelemetryHandle(
            event_counter=event_counter,
            event_errors=event_errors,
            genome_blocks=genome_blocks,
            soak_duration=soak_duration,
            soak_events=soak_events,
        )

    def _lazy_initialize(self) -> None:
        if self._initialized:
            return
        with self._lock:
            if self._initialized:
                return
            self._initialized = True

            if not _OTEL_AVAILABLE:
                _LOGGER.info("OpenTelemetry packages are not installed; backend telemetry disabled")
                return

            if _is_disabled(os.getenv("KOLIBRI_TELEMETRY")):
                _LOGGER.info("KOLIBRI_TELEMETRY flag disabled metrics export")
                return

            readers = []
            resource = Resource.create(
                {
                    "service.name": os.getenv("KOLIBRI_SERVICE_NAME", "kolibri-backend"),
                    "service.namespace": "kolibri",
                }
            )

            prom_reader = self._configure_prometheus()
            if prom_reader is not None:
                readers.append(prom_reader)

            otlp_reader = self._configure_otlp()
            if otlp_reader is not None:
                readers.append(otlp_reader)

            if not readers:
                _LOGGER.info("No telemetry readers configured; backend metrics export disabled")
                return

            provider = MeterProvider(resource=resource, metric_readers=readers)
            otel_metrics.set_meter_provider(provider)
            self._meter = otel_metrics.get_meter("kolibri.backend", "1.0.0")
            self._enabled = True
            _LOGGER.info("Backend telemetry configured with %d metric readers", len(readers))

    def _configure_prometheus(self) -> Optional[PrometheusMetricReader]:
        if PrometheusMetricReader is None or start_http_server is None:
            return None
        port_raw = os.getenv("KOLIBRI_PROMETHEUS_PORT", "9464")
        try:
            port = int(port_raw)
        except ValueError:
            _LOGGER.warning("Invalid KOLIBRI_PROMETHEUS_PORT=%s; disabling Prometheus export", port_raw)
            return None
        if port <= 0:
            return None
        host = os.getenv("KOLIBRI_PROMETHEUS_HOST", "0.0.0.0")
        reader = PrometheusMetricReader()
        if not self._prometheus_started:
            try:
                start_http_server(port, addr=host)
                self._prometheus_started = True
                _LOGGER.info("Prometheus metrics endpoint exposed on %s:%s", host, port)
            except OSError as error:
                _LOGGER.error("Failed to expose Prometheus metrics endpoint: %s", error)
                return None
        return reader

    def _configure_otlp(self) -> Optional[PeriodicExportingMetricReader]:
        if OTLPMetricExporter is None:
            return None
        endpoint = os.getenv("KOLIBRI_OTLP_ENDPOINT")
        if not endpoint:
            return None
        insecure_raw = os.getenv("KOLIBRI_OTLP_INSECURE", "1").strip().lower()
        insecure = insecure_raw not in _PRIVACY_DISABLED_VALUES
        headers_env = os.getenv("KOLIBRI_OTLP_HEADERS", "")
        headers = {}
        if headers_env:
            for item in headers_env.split(","):
                if "=" in item:
                    key, value = item.split("=", 1)
                    headers[key.strip()] = value.strip()
        exporter = OTLPMetricExporter(endpoint=endpoint, headers=headers if headers else None, insecure=insecure)
        interval_ms_raw = os.getenv("KOLIBRI_OTLP_EXPORT_INTERVAL_MS", "30000")
        try:
            interval_ms = int(interval_ms_raw)
        except ValueError:
            interval_ms = 30000
        return PeriodicExportingMetricReader(exporter, export_interval_millis=interval_ms)


def _is_disabled(value: Optional[str]) -> bool:
    if value is None:
        return False
    return value.strip().lower() in _PRIVACY_DISABLED_VALUES


_FACTORY = _TelemetryFactory()


def get_backend_telemetry() -> TelemetryHandle | _NoopHandle:
    """Returns a telemetry handle for backend components."""

    return _FACTORY.get_handle()


__all__ = ["TelemetryHandle", "get_backend_telemetry"]
