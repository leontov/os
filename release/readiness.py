"""Release readiness evaluation for the «Колибри ИИ» ecosystem."""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean
from typing import Mapping, Sequence


def _as_optional_float(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    raise TypeError(f"Expected numeric value, got {type(value)!r}")


@dataclass(frozen=True)
class ReadinessCriteria:
    """Thresholds that each service artifact must satisfy."""

    min_coverage: float | None = None
    max_latency_p95_ms: float | None = None
    max_error_rate: float | None = None
    max_energy_kwh: float | None = None
    min_nps: float | None = None
    min_retention: float | None = None

    @classmethod
    def from_mapping(cls, payload: Mapping[str, object]) -> "ReadinessCriteria":
        return cls(
            min_coverage=_as_optional_float(payload.get("min_coverage")),
            max_latency_p95_ms=_as_optional_float(payload.get("max_latency_p95_ms")),
            max_error_rate=_as_optional_float(payload.get("max_error_rate")),
            max_energy_kwh=_as_optional_float(payload.get("max_energy_kwh")),
            min_nps=_as_optional_float(payload.get("min_nps")),
            min_retention=_as_optional_float(payload.get("min_retention")),
        )


@dataclass(frozen=True)
class ServiceArtifact:
    """Measured release artifact metrics."""

    name: str
    coverage: float | None = None
    latency_p95_ms: float | None = None
    error_rate: float | None = None
    energy_kwh: float | None = None
    nps: float | None = None
    retention: float | None = None
    blockers: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def from_mapping(cls, payload: Mapping[str, object]) -> "ServiceArtifact":
        blockers_payload = payload.get("blockers", [])
        blockers: tuple[str, ...] = tuple(str(item) for item in blockers_payload)
        return cls(
            name=str(payload["name"]),
            coverage=_as_optional_float(payload.get("coverage")),
            latency_p95_ms=_as_optional_float(payload.get("latency_p95_ms")),
            error_rate=_as_optional_float(payload.get("error_rate")),
            energy_kwh=_as_optional_float(payload.get("energy_kwh")),
            nps=_as_optional_float(payload.get("nps")),
            retention=_as_optional_float(payload.get("retention")),
            blockers=blockers,
        )


@dataclass(frozen=True)
class MetricEvaluation:
    """Outcome for a single metric check."""

    metric: str
    passed: bool
    score: float
    reason: str | None
    actual_defined: bool
    threshold_defined: bool


@dataclass(frozen=True)
class ServiceReadiness:
    """Aggregated readiness result for a single service."""

    artifact: ServiceArtifact
    evaluations: tuple[MetricEvaluation, ...]
    score: float
    status: str
    blockers: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "service": self.artifact.name,
            "status": self.status,
            "score": round(self.score, 3),
            "metrics": [
                {
                    "metric": evaluation.metric,
                    "passed": evaluation.passed,
                    "score": round(evaluation.score, 3),
                    "reason": evaluation.reason,
                }
                for evaluation in self.evaluations
            ],
            "blockers": list(self.blockers),
        }


@dataclass(frozen=True)
class ReleaseReadinessReport:
    """Result of evaluating all services prior to a release."""

    version: str
    criteria: ReadinessCriteria
    services: tuple[ServiceReadiness, ...]
    overall_status: str
    overall_score: float
    blockers: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "version": self.version,
            "overall_status": self.overall_status,
            "overall_score": round(self.overall_score, 3),
            "criteria": {
                "min_coverage": self.criteria.min_coverage,
                "max_latency_p95_ms": self.criteria.max_latency_p95_ms,
                "max_error_rate": self.criteria.max_error_rate,
                "max_energy_kwh": self.criteria.max_energy_kwh,
                "min_nps": self.criteria.min_nps,
                "min_retention": self.criteria.min_retention,
            },
            "services": [service.to_dict() for service in self.services],
            "blockers": list(self.blockers),
        }


def evaluate_release(
    *,
    version: str,
    criteria: ReadinessCriteria,
    artifacts: Sequence[ServiceArtifact],
) -> ReleaseReadinessReport:
    if not artifacts:
        raise ValueError("Release readiness evaluation requires at least one service artifact")

    services: list[ServiceReadiness] = []
    all_blockers: list[str] = []
    for artifact in artifacts:
        readiness = _evaluate_service(criteria=criteria, artifact=artifact)
        services.append(readiness)
        all_blockers.extend(readiness.blockers)

    overall_score = mean(service.score for service in services)
    if all(service.status == "ready" for service in services):
        overall_status = "ready"
    else:
        overall_status = "blocked"

    return ReleaseReadinessReport(
        version=version,
        criteria=criteria,
        services=tuple(services),
        overall_status=overall_status,
        overall_score=overall_score,
        blockers=tuple(all_blockers),
    )


def _evaluate_service(
    *, criteria: ReadinessCriteria, artifact: ServiceArtifact
) -> ServiceReadiness:
    evaluations: list[MetricEvaluation] = []
    blockers: list[str] = list(artifact.blockers)

    evaluations.append(
        _evaluate_metric(
            metric="coverage",
            actual=artifact.coverage,
            threshold=criteria.min_coverage,
            mode="min",
        )
    )
    evaluations.append(
        _evaluate_metric(
            metric="latency_p95_ms",
            actual=artifact.latency_p95_ms,
            threshold=criteria.max_latency_p95_ms,
            mode="max",
        )
    )
    evaluations.append(
        _evaluate_metric(
            metric="error_rate",
            actual=artifact.error_rate,
            threshold=criteria.max_error_rate,
            mode="max",
        )
    )
    evaluations.append(
        _evaluate_metric(
            metric="energy_kwh",
            actual=artifact.energy_kwh,
            threshold=criteria.max_energy_kwh,
            mode="max",
        )
    )
    evaluations.append(
        _evaluate_metric(
            metric="nps",
            actual=artifact.nps,
            threshold=criteria.min_nps,
            mode="min",
        )
    )
    evaluations.append(
        _evaluate_metric(
            metric="retention",
            actual=artifact.retention,
            threshold=criteria.min_retention,
            mode="min",
        )
    )

    reportable_evaluations = tuple(
        evaluation
        for evaluation in evaluations
        if evaluation.threshold_defined or evaluation.actual_defined
    )

    if not reportable_evaluations:
        # Always keep coverage metric even when thresholds are not configured.
        reportable_evaluations = (evaluations[0],)

    scores = [evaluation.score for evaluation in reportable_evaluations]
    service_score = mean(scores) if scores else 0.0

    for evaluation in reportable_evaluations:
        if not evaluation.passed and evaluation.reason:
            blockers.append(f"{artifact.name}:{evaluation.metric}:{evaluation.reason}")

    status = "ready" if not blockers and all(
        evaluation.passed for evaluation in reportable_evaluations
    ) else "blocked"

    return ServiceReadiness(
        artifact=artifact,
        evaluations=reportable_evaluations,
        score=service_score,
        status=status,
        blockers=tuple(blockers),
    )


def _evaluate_metric(
    *, metric: str, actual: float | None, threshold: float | None, mode: str
) -> MetricEvaluation:
    if threshold is None and actual is None:
        return MetricEvaluation(
            metric=metric,
            passed=True,
            score=1.0,
            reason=None,
            actual_defined=False,
            threshold_defined=False,
        )

    if actual is None:
        return MetricEvaluation(
            metric=metric,
            passed=False,
            score=0.0,
            reason="missing_actual",
            actual_defined=False,
            threshold_defined=threshold is not None,
        )

    if threshold is None:
        # When the organization has no threshold we treat the metric as informational.
        return MetricEvaluation(
            metric=metric,
            passed=True,
            score=1.0,
            reason=None,
            actual_defined=True,
            threshold_defined=False,
        )

    safe_threshold = threshold if threshold != 0 else 1e-9
    safe_actual = actual if actual != 0 else 1e-9

    if mode == "min":
        passed = actual >= threshold
        ratio = actual / safe_threshold
    elif mode == "max":
        passed = actual <= threshold
        ratio = safe_threshold / safe_actual
    else:
        raise ValueError(f"Unsupported evaluation mode: {mode!r}")

    score = max(0.0, min(ratio, 1.0))
    reason = None if passed else "threshold_breach"
    return MetricEvaluation(
        metric=metric,
        passed=passed,
        score=score,
        reason=reason,
        actual_defined=True,
        threshold_defined=True,
    )

