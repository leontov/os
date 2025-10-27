"""Dependency cataloguing and prioritisation for «Колибри ИИ».

This module implements a lightweight auditing tool that inspects one or more
`requirements.txt`-style manifests and produces a structured report. The
report is optimised for the Phase 1 roadmap task: *«Провести аудит модулей,
каталогизацию зависимостей и расстановку приоритетов по критическим дефектам.»*

Design goals:
* Keep parsing resilient to informal requirement formatting while avoiding
  heavy third-party dependencies.
* Provide clear prioritisation buckets so reliability teams instantly see
  what requires attention.
* Emit JSON to integrate with downstream dashboards or CI guardrails.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Sequence


_REQ_LINE_RE = re.compile(
    r"^\s*(?P<name>[A-Za-z0-9_.\-]+)"
    r"(?P<extras>\[[^\]]+\])?\s*"
    r"(?P<specifier>(?:[!=<>~]=?)[^;#\s]+)?"
    r"(?:;(?P<marker>[^#]+))?\s*$"
)


@dataclass(frozen=True, slots=True)
class DependencyRecord:
    """Structured information about a dependency entry."""

    name: str
    specifier: str
    classification: str
    criticality: str
    source: str


_KNOWN_CLASSIFICATIONS = {
    "fastapi": ("runtime-api", "critical"),
    "uvicorn": ("runtime-api", "critical"),
    "asyncpg": ("data-plane", "high"),
    "clickhouse-connect": ("data-plane", "high"),
    "torch": ("ml-core", "critical"),
    "transformers": ("ml-core", "critical"),
    "pytest": ("quality", "medium"),
    "coverage": ("quality", "medium"),
    "ruff": ("quality", "medium"),
    "pyright": ("quality", "medium"),
    "httpx": ("runtime-api", "high"),
}

_CRITICALITY_ORDER = {"critical": 3, "high": 2, "medium": 1, "normal": 0}


def _normalise_name(raw: str) -> str:
    return raw.strip().lower().replace("_", "-")


def _classify_dependency(name: str) -> tuple[str, str]:
    """Return `(classification, criticality)` bucket for the dependency."""

    normalised = _normalise_name(name)

    if normalised in _KNOWN_CLASSIFICATIONS:
        return _KNOWN_CLASSIFICATIONS[normalised]

    if any(keyword in normalised for keyword in ("train", "ml", "model")):
        return "ml-aux", "high"

    if "test" in normalised or "lint" in normalised:
        return "quality", "medium"

    if any(keyword in normalised for keyword in ("dev", "tool", "script")):
        return "tooling", "medium"

    return "misc", "normal"


def parse_requirements(path: Path) -> list[DependencyRecord]:
    """Parse requirement entries from *path* and return structured records."""

    records: list[DependencyRecord] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        candidate = stripped.split("#", 1)[0].strip()
        match = _REQ_LINE_RE.match(candidate)
        if not match:
            # Fall back to using the raw candidate; we still register the
            # dependency so the report shows manual action is required.
            classification, criticality = "unparsed", "high"
            records.append(
                DependencyRecord(
                    name=candidate,
                    specifier="",
                    classification=classification,
                    criticality=criticality,
                    source=str(path),
                )
            )
            continue

        name = match.group("name")
        specifier = match.group("specifier") or "*"

        classification, criticality = _classify_dependency(name)
        records.append(
            DependencyRecord(
                name=name,
                specifier=specifier,
                classification=classification,
                criticality=criticality,
                source=str(path),
            )
        )

    return records


def build_report(records: Iterable[DependencyRecord]) -> dict:
    """Aggregate *records* into a JSON-serialisable audit report."""

    records = list(records)
    name_counts = Counter(_normalise_name(record.name) for record in records)
    duplicates = sorted(
        name for name, count in name_counts.items() if count > 1
    )

    categories: dict[str, set[str]] = defaultdict(set)
    critical_focus: list[DependencyRecord] = []
    for record in records:
        categories[record.classification].add(record.name)
        if _CRITICALITY_ORDER[record.criticality] >= _CRITICALITY_ORDER["high"]:
            critical_focus.append(record)

    critical_focus.sort(
        key=lambda record: (
            -_CRITICALITY_ORDER[record.criticality],
            record.classification,
            record.name,
        )
    )

    return {
        "total_dependencies": len(records),
        "duplicates": duplicates,
        "categories": {
            key: sorted(names) for key, names in sorted(categories.items())
        },
        "critical_focus": [asdict(record) for record in critical_focus],
        "records": [asdict(record) for record in records],
    }


def audit(paths: Sequence[Path]) -> dict:
    """High-level helper used by the CLI and tests."""

    records: list[DependencyRecord] = []
    for path in paths:
        if not path.exists():
            raise FileNotFoundError(f"Не найден файл зависимостей: {path}")
        records.extend(parse_requirements(path))
    return build_report(records)


def run(argv: Sequence[str] | None = None) -> int:
    """Execute the CLI, returning a conventional exit status."""

    parser = argparse.ArgumentParser(
        description=(
            "Каталогизация зависимостей Kolibri ИИ с приоритизацией критичных"
            " компонентов."
        )
    )
    parser.add_argument(
        "--requirements",
        "-r",
        action="append",
        default=None,
        help=(
            "Путь к manifest-файлу зависимостей. Можно указать несколько раз."
            " По умолчанию используется ./requirements.txt."
        ),
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Файл, куда будет сохранён JSON-отчёт. Если не указан, выводим в stdout.",
    )

    args = parser.parse_args(argv)

    requirement_paths = (
        [Path("requirements.txt")] if not args.requirements else [Path(p) for p in args.requirements]
    )

    report = audit(requirement_paths)
    serialized = json.dumps(report, indent=2, ensure_ascii=False)

    if args.output:
        args.output.write_text(serialized + "\n", encoding="utf-8")
    else:
        print(serialized)

    if report["duplicates"]:
        # Signal that manual review is needed without failing the pipeline.
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(run())

