"""Go-to-market planning helpers for «Колибри ИИ».

The module keeps the marketing and launch planning logic importable. The
functions work with lightweight dataclasses to stay easy to unit test while
still delivering actionable artefacts for the product organisation.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class LaunchAsset:
    """Marketing artefact that needs to be prepared for launch."""

    name: str
    owner: str
    channel: str
    status: str = "planned"


@dataclass(frozen=True)
class LaunchMetric:
    """Success metric tracked during the launch window."""

    name: str
    baseline: float
    target: float

    def delta(self) -> float:
        return self.target - self.baseline


@dataclass(frozen=True)
class LaunchPhase:
    """Launch phase with a dedicated focus and length."""

    name: str
    focus: str
    weeks: int
    channels: Sequence[str]

    def date_window(self, start: date) -> tuple[date, date]:
        end = start + timedelta(weeks=self.weeks)
        return start, end


@dataclass(frozen=True)
class LaunchPlan:
    """Aggregate artefact containing phases, assets and metrics."""

    product: str
    launch_date: date
    phases: Sequence[LaunchPhase]
    assets: Sequence[LaunchAsset]
    metrics: Sequence[LaunchMetric]
    notes: Sequence[str] = field(default_factory=tuple)

    def phase_windows(self) -> list[dict[str, Any]]:
        current = self.launch_date
        schedule: list[dict[str, Any]] = []
        for phase in self.phases:
            start, end = phase.date_window(current)
            schedule.append(
                {
                    "name": phase.name,
                    "focus": phase.focus,
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                    "channels": list(phase.channels),
                }
            )
            current = end
        return schedule

    def asset_matrix(self) -> list[dict[str, str]]:
        return [
            {
                "name": asset.name,
                "owner": asset.owner,
                "channel": asset.channel,
                "status": asset.status,
            }
            for asset in self.assets
        ]

    def metric_targets(self) -> list[dict[str, float | str]]:
        return [
            {
                "name": metric.name,
                "baseline": metric.baseline,
                "target": metric.target,
                "delta": metric.delta(),
            }
            for metric in self.metrics
        ]


def _load_date(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:  # pragma: no cover - error path documented by tests
        raise ValueError("Дата запуска должна быть в формате YYYY-MM-DD") from exc


def _phase_from_payload(payload: Mapping[str, Any]) -> LaunchPhase:
    return LaunchPhase(
        name=str(payload["name"]),
        focus=str(payload.get("focus", "")),
        weeks=int(payload.get("weeks", 2)),
        channels=tuple(str(ch) for ch in payload.get("channels", ())),
    )


def _asset_from_payload(payload: Mapping[str, Any]) -> LaunchAsset:
    return LaunchAsset(
        name=str(payload["name"]),
        owner=str(payload.get("owner", "unassigned")),
        channel=str(payload.get("channel", "unknown")),
        status=str(payload.get("status", "planned")),
    )


def _metric_from_payload(payload: Mapping[str, Any]) -> LaunchMetric:
    baseline = float(payload.get("baseline", 0.0))
    target = float(payload.get("target", baseline))
    return LaunchMetric(
        name=str(payload["name"]),
        baseline=baseline,
        target=target,
    )


def load_launch_config(path: Path | None) -> Mapping[str, Any]:
    if path is None:
        return {
            "product": "Колибри ИИ",
            "launch_date": date.today().isoformat(),
            "phases": [
                {
                    "name": "Awareness",
                    "focus": "Tell the story of trusted modular intelligence",
                    "weeks": 3,
                    "channels": ["blog", "webinars", "community"],
                },
                {
                    "name": "Adoption",
                    "focus": "Guide pilots and onboarding with live labs",
                    "weeks": 4,
                    "channels": ["beta", "partners", "docs"],
                },
                {
                    "name": "Expansion",
                    "focus": "Activate lighthouse customers across industries",
                    "weeks": 4,
                    "channels": ["case-studies", "events", "press"],
                },
            ],
            "assets": [
                {"name": "Vision manifesto", "owner": "brand", "channel": "blog"},
                {"name": "Launch microsite", "owner": "web", "channel": "web"},
                {
                    "name": "Pilot success deck",
                    "owner": "solutions",
                    "channel": "sales",
                },
            ],
            "metrics": [
                {"name": "NPS", "baseline": 32, "target": 48},
                {"name": "Activation rate", "baseline": 0.35, "target": 0.55},
                {"name": "Retention 90d", "baseline": 0.52, "target": 0.7},
            ],
            "notes": [
                "Align with mentorship cohorts for storytelling",
                "Sync telemetry insights to marketing dashboards",
            ],
        }

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise ValueError("Конфигурация запуска должна быть JSON-объектом")
    return payload


def build_launch_plan(config: Mapping[str, Any]) -> LaunchPlan:
    product = str(config.get("product", "Колибри ИИ"))
    launch_date = _load_date(str(config.get("launch_date", date.today().isoformat())))

    phases = tuple(_phase_from_payload(item) for item in config.get("phases", ()))
    assets = tuple(_asset_from_payload(item) for item in config.get("assets", ()))
    metrics = tuple(_metric_from_payload(item) for item in config.get("metrics", ()))
    notes = tuple(str(note) for note in config.get("notes", ()))

    return LaunchPlan(
        product=product,
        launch_date=launch_date,
        phases=phases,
        assets=assets,
        metrics=metrics,
        notes=notes,
    )


def calculate_metric_report(
    plan: LaunchPlan,
    observations: Mapping[str, float],
) -> list[dict[str, Any]]:
    report: list[dict[str, Any]] = []
    for metric in plan.metrics:
        actual = float(observations.get(metric.name, metric.baseline))
        progress = 0.0
        if metric.target != metric.baseline:
            progress = max(0.0, min(1.0, (actual - metric.baseline) / metric.delta()))
        report.append(
            {
                "name": metric.name,
                "baseline": metric.baseline,
                "target": metric.target,
                "actual": actual,
                "delta": metric.delta(),
                "progress": round(progress * 100, 2),
                "status": _metric_status(progress),
            }
        )
    return report


def _metric_status(progress: float) -> str:
    if progress >= 1.0:
        return "achieved"
    if progress >= 0.75:
        return "on-track"
    if progress >= 0.4:
        return "needs-attention"
    return "at-risk"


def serialise_plan(plan: LaunchPlan) -> dict[str, Any]:
    return {
        "product": plan.product,
        "launch_date": plan.launch_date.isoformat(),
        "phases": plan.phase_windows(),
        "assets": plan.asset_matrix(),
        "metrics": plan.metric_targets(),
        "notes": list(plan.notes),
    }
