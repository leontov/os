"""Structured audit and genome event logging."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Mapping, Optional

from .config import Settings, get_settings


@dataclass
class _StructuredLogger:
    path: Path
    lock: Lock

    def write(self, payload: Mapping[str, Any]) -> None:
        record = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock:
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(record + "\n")


_audit_logger: Optional[_StructuredLogger] = None
_genome_logger: Optional[_StructuredLogger] = None
_audit_lock = Lock()
_genome_lock = Lock()


def _ensure_logger(path: str, lock: Lock) -> _StructuredLogger:
    return _StructuredLogger(Path(path), lock)


def _build_event(
    *,
    event_type: str,
    actor: str,
    payload: Mapping[str, Any],
    settings: Settings,
) -> Dict[str, Any]:
    return {
        "ts": time.time(),
        "event": event_type,
        "actor": actor,
        "service": "kolibri-backend",
        "namespace": settings.prometheus_namespace,
        "payload": payload,
    }


def get_audit_logger(settings: Optional[Settings] = None) -> _StructuredLogger:
    if settings is None:
        settings = get_settings()
    global _audit_logger
    if _audit_logger is None:
        _audit_logger = _ensure_logger(settings.audit_log_path, _audit_lock)
    return _audit_logger


def get_genome_logger(settings: Optional[Settings] = None) -> _StructuredLogger:
    if settings is None:
        settings = get_settings()
    global _genome_logger
    if _genome_logger is None:
        _genome_logger = _ensure_logger(settings.genome_log_path, _genome_lock)
    return _genome_logger


def log_audit_event(
    *,
    event_type: str,
    actor: str,
    payload: Mapping[str, Any],
    settings: Optional[Settings] = None,
) -> None:
    resolved_settings = settings or get_settings()
    logger = get_audit_logger(resolved_settings)
    record = _build_event(
        event_type=event_type,
        actor=actor,
        payload=payload,
        settings=resolved_settings,
    )
    logger.write(record)


def log_genome_event(
    *,
    stage: str,
    actor: str,
    payload: Mapping[str, Any],
    settings: Optional[Settings] = None,
) -> None:
    resolved_settings = settings or get_settings()
    logger = get_genome_logger(resolved_settings)
    record = _build_event(
        event_type=f"genome.{stage}",
        actor=actor,
        payload=payload,
        settings=resolved_settings,
    )
    logger.write(record)
