"""Automated release pipeline orchestration for «Колибри ИИ».

The module provides a deterministic, testable implementation of the
roadmap requirement to offer staging-aware release pipelines with
rollback guidance. Pipelines are described declaratively via JSON files,
allowing the release guild to reuse the tooling across services while
keeping the logic importable for unit tests.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Sequence


class StageStatus:
    """String constants describing the outcome of a stage execution."""

    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class StageChecks:
    """Acceptance criteria enforced for a pipeline stage."""

    max_latency_ms: float | None = None
    max_error_rate: float | None = None
    max_energy_kwh: float | None = None
    required_approvals: int = 0

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "StageChecks":
        return cls(
            max_latency_ms=_as_optional_float(payload.get("max_latency_ms")),
            max_error_rate=_as_optional_float(payload.get("max_error_rate")),
            max_energy_kwh=_as_optional_float(payload.get("max_energy_kwh")),
            required_approvals=int(payload.get("required_approvals", 0)),
        )


@dataclass(frozen=True)
class StageSpec:
    """Declarative description of a pipeline stage."""

    name: str
    environment: str
    description: str
    checks: StageChecks
    rollback_steps: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "StageSpec":
        return cls(
            name=str(payload["name"]),
            environment=str(payload.get("environment", "ci")),
            description=str(payload.get("description", "")),
            checks=StageChecks.from_mapping(payload.get("checks", {})),
            rollback_steps=tuple(
                str(item) for item in payload.get("rollback_steps", [])
            ),
        )


@dataclass(frozen=True)
class StageObservation:
    """Measured data produced by stage execution."""

    latency_ms: float | None = None
    error_rate: float | None = None
    energy_kwh: float | None = None
    approvals: int = 0
    notes: str | None = None

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "StageObservation":
        return cls(
            latency_ms=_as_optional_float(payload.get("latency_ms")),
            error_rate=_as_optional_float(payload.get("error_rate")),
            energy_kwh=_as_optional_float(payload.get("energy_kwh")),
            approvals=int(payload.get("approvals", 0)),
            notes=str(payload.get("notes")) if payload.get("notes") is not None else None,
        )


@dataclass(frozen=True)
class StageResult:
    """Outcome of evaluating a stage against its checks."""

    spec: StageSpec
    observation: StageObservation | None
    status: str
    reasons: tuple[str, ...] = field(default_factory=tuple)
    requires_rollback: bool = False

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "stage": self.spec.name,
            "environment": self.spec.environment,
            "status": self.status,
            "description": self.spec.description,
            "reasons": list(self.reasons),
            "requires_rollback": self.requires_rollback,
            "checks": asdict(self.spec.checks),
        }
        if self.observation is not None:
            payload["observation"] = asdict(self.observation)
        return payload


@dataclass(frozen=True)
class PipelineConfig:
    """Full release pipeline definition."""

    name: str
    version: str
    stages: tuple[StageSpec, ...]
    default_rollback_steps: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "PipelineConfig":
        stages_payload = payload.get("stages", [])
        if not stages_payload:
            raise ValueError("Pipeline configuration must define at least one stage")
        stages = tuple(StageSpec.from_mapping(entry) for entry in stages_payload)
        return cls(
            name=str(payload.get("name", "kolibri-release")),
            version=str(payload.get("version", "0.0.0")),
            stages=stages,
            default_rollback_steps=tuple(
                str(step) for step in payload.get("default_rollback_steps", [])
            ),
        )


@dataclass(frozen=True)
class PipelineReport:
    """Serializable representation of a pipeline execution."""

    config: PipelineConfig
    results: tuple[StageResult, ...]
    skipped: tuple[str, ...]
    status: str
    rollback: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "pipeline": {
                "name": self.config.name,
                "version": self.config.version,
                "stage_count": len(self.config.stages),
            },
            "status": self.status,
            "results": [result.to_dict() for result in self.results],
            "skipped_stages": list(self.skipped),
            "rollback": list(self.rollback),
        }


def _as_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


def evaluate_stage(
    spec: StageSpec,
    observation: StageObservation | None,
) -> StageResult:
    """Compare *observation* with the checks defined on *spec*."""

    reasons: list[str] = []
    if observation is None:
        reasons.append("observations missing")
        return StageResult(
            spec=spec,
            observation=None,
            status=StageStatus.FAILED,
            reasons=tuple(reasons),
            requires_rollback=_requires_rollback(spec),
        )

    checks = spec.checks

    if checks.max_latency_ms is not None:
        if observation.latency_ms is None:
            reasons.append("latency measurement missing")
        elif observation.latency_ms > checks.max_latency_ms:
            reasons.append(
                f"latency {observation.latency_ms:.1f}ms exceeds "
                f"budget {checks.max_latency_ms:.1f}ms"
            )

    if checks.max_error_rate is not None:
        if observation.error_rate is None:
            reasons.append("error rate measurement missing")
        elif observation.error_rate > checks.max_error_rate:
            reasons.append(
                f"error rate {observation.error_rate:.4f} exceeds "
                f"budget {checks.max_error_rate:.4f}"
            )

    if checks.max_energy_kwh is not None:
        if observation.energy_kwh is None:
            reasons.append("energy usage measurement missing")
        elif observation.energy_kwh > checks.max_energy_kwh:
            reasons.append(
                f"energy usage {observation.energy_kwh:.3f}kWh exceeds "
                f"budget {checks.max_energy_kwh:.3f}kWh"
            )

    if checks.required_approvals:
        if observation.approvals < checks.required_approvals:
            reasons.append(
                "approvals below required quorum: "
                f"{observation.approvals}/{checks.required_approvals}"
            )

    status = StageStatus.PASSED if not reasons else StageStatus.FAILED
    return StageResult(
        spec=spec,
        observation=observation,
        status=status,
        reasons=tuple(reasons),
        requires_rollback=bool(reasons) and _requires_rollback(spec),
    )


def _requires_rollback(spec: StageSpec) -> bool:
    return spec.environment.lower() in {"staging", "production"}


def run_pipeline(
    config: PipelineConfig,
    observations: Mapping[str, StageObservation],
) -> PipelineReport:
    """Execute the pipeline according to *config* and collected *observations*."""

    results: list[StageResult] = []
    skipped: list[str] = []
    rollback_steps: tuple[str, ...] = ()

    for stage in config.stages:
        result = evaluate_stage(stage, observations.get(stage.name))
        results.append(result)
        if result.status == StageStatus.FAILED:
            rollback_steps = result.spec.rollback_steps or config.default_rollback_steps
            skipped.extend(spec.name for spec in config.stages[len(results) :])
            break

    else:
        skipped = []

    pipeline_status = StageStatus.PASSED
    if results and results[-1].status == StageStatus.FAILED:
        pipeline_status = StageStatus.FAILED

    return PipelineReport(
        config=config,
        results=tuple(results),
        skipped=tuple(skipped),
        status=pipeline_status,
        rollback=rollback_steps,
    )


def load_pipeline_config(path: Path) -> tuple[PipelineConfig, dict[str, StageObservation]]:
    """Load a pipeline configuration and optional embedded observations."""

    payload = json.loads(path.read_text(encoding="utf-8"))
    config = PipelineConfig.from_mapping(payload)
    observations_payload = payload.get("observations", {})
    observations = {
        name: StageObservation.from_mapping(data)
        for name, data in observations_payload.items()
    }
    return config, observations


def load_observations(path: Path) -> dict[str, StageObservation]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("observations", payload)
    return {name: StageObservation.from_mapping(data) for name, data in entries.items()}


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="release_pipeline",
        description="Автоматизированный конвейер релизов Kolibri ИИ",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan_parser = subparsers.add_parser(
        "plan", help="Показать этапы конвейера и критерии приёмки"
    )
    plan_parser.add_argument("--config", type=Path, required=True, help="Файл конфигурации")

    run_parser = subparsers.add_parser(
        "run", help="Выполнить оценку наблюдений и сформировать отчёт"
    )
    run_parser.add_argument("--config", type=Path, required=True, help="Файл конфигурации")
    run_parser.add_argument(
        "--observations",
        type=Path,
        required=False,
        help="JSON с наблюдениями по стадиям (приоритетнее embedded)",
    )
    run_parser.add_argument(
        "--output",
        type=Path,
        required=False,
        help="Путь для записи итогового отчёта (JSON)",
    )

    return parser


def _command_plan(config_path: Path) -> int:
    config, _ = load_pipeline_config(config_path)
    lines = [
        f"Pipeline: {config.name} v{config.version}",
        "Этапы и критерии приёмки:",
    ]
    for index, stage in enumerate(config.stages, start=1):
        lines.append(
            f"  {index}. {stage.name} ({stage.environment}) — {stage.description}".rstrip()
        )
        checks = stage.checks
        criteria: list[str] = []
        if checks.max_latency_ms is not None:
            criteria.append(f"latency ≤ {checks.max_latency_ms}ms")
        if checks.max_error_rate is not None:
            criteria.append(f"error_rate ≤ {checks.max_error_rate}")
        if checks.max_energy_kwh is not None:
            criteria.append(f"energy ≤ {checks.max_energy_kwh}kWh")
        if checks.required_approvals:
            criteria.append(f"approvals ≥ {checks.required_approvals}")
        if criteria:
            lines.append("     - " + ", ".join(criteria))
        if stage.rollback_steps:
            lines.append("     - rollback: " + "; ".join(stage.rollback_steps))
    print("\n".join(lines))
    return 0


def _command_run(config_path: Path, observations_path: Path | None, output: Path | None) -> int:
    config, embedded = load_pipeline_config(config_path)
    observations: MutableMapping[str, StageObservation] = dict(embedded)
    if observations_path is not None:
        observations = load_observations(observations_path)

    report = run_pipeline(config, observations)
    payload = report.to_dict()

    if output is not None:
        output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    else:
        print(json.dumps(payload, indent=2, ensure_ascii=False))

    return 0 if report.status == StageStatus.PASSED else 1


def run(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "plan":
        return _command_plan(args.config)
    if args.command == "run":
        return _command_run(args.config, args.observations, args.output)
    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    raise SystemExit(run())
