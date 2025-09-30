"""Конфигурация Kolibri Script."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os


@dataclass(frozen=True)
class KolibriConfig:
    """Конфигурация ядра Kolibri."""

    script_secret: bytes

    @staticmethod
    def from_env() -> "KolibriConfig":
        secret = os.getenv("KOLIBRI_SCRIPT_SECRET", "kolibri-script-secret")
        return KolibriConfig(script_secret=secret.encode("utf-8"))


@lru_cache(maxsize=1)
def get_config() -> KolibriConfig:
    """Возвращает конфигурацию с мемоизацией."""

    return KolibriConfig.from_env()


def get_secret() -> bytes:
    """Возвращает секрет для HMAC-подписи Kolibri Script."""

    return get_config().script_secret
