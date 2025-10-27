"""Configuration loading for the documentation portal."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Mapping


@dataclass(frozen=True, slots=True)
class VersionConfig:
    """Represents a single documentation version and its content root."""

    name: str
    label: str
    path: Path

    @classmethod
    def from_payload(cls, payload: Mapping[str, object], *, base_dir: Path) -> "VersionConfig":
        try:
            name = str(payload["name"])
            label = str(payload.get("label", name))
            raw_path = payload["path"]
        except KeyError as exc:  # pragma: no cover - defensive guard
            raise ValueError(f"Missing required key in version config: {exc}") from exc

        path = (base_dir / Path(str(raw_path))).resolve()
        if not path.is_dir():
            raise ValueError(f"Documentation path does not exist: {path}")
        return cls(name=name, label=label, path=path)


@dataclass(frozen=True, slots=True)
class PortalConfig:
    """Top-level portal configuration."""

    default_version: str
    versions: Mapping[str, VersionConfig]

    def ordered_versions(self) -> Iterable[VersionConfig]:
        return self.versions.values()


def load_config(config_path: Path) -> PortalConfig:
    """Parse *config_path* and build a :class:`PortalConfig`."""

    payload = json.loads(config_path.read_text(encoding="utf-8"))
    try:
        default_version = str(payload["default_version"])
        versions_payload = payload["versions"]
    except KeyError as exc:  # pragma: no cover - defensive guard
        raise ValueError(f"Missing key in portal config: {exc}") from exc

    if not isinstance(versions_payload, list):
        raise TypeError("'versions' must be a list of version definitions")

    base_dir = config_path.parent
    versions: Dict[str, VersionConfig] = {}
    for entry in versions_payload:
        version = VersionConfig.from_payload(entry, base_dir=base_dir)
        versions[version.name] = version

    if default_version not in versions:
        raise ValueError(
            f"Default version '{default_version}' is not defined in the config"
        )

    return PortalConfig(default_version=default_version, versions=versions)
