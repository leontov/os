"""Support program models and analytics for «Колибри ИИ»."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class SupportTier:
    name: str
    sla_hours: float
    channels: Sequence[str]


@dataclass(frozen=True)
class SupportScenario:
    title: str
    criticality: str
    recommended_tier: str
    playbook: str


@dataclass(frozen=True)
class SupportProgram:
    tiers: Sequence[SupportTier]
    scenarios: Sequence[SupportScenario]

    def tier_map(self) -> dict[str, SupportTier]:
        return {tier.name: tier for tier in self.tiers}

    def find_scenario(self, title: str) -> SupportScenario | None:
        """Return the first support scenario matching ``title`` (case-insensitive)."""

        normalized = title.strip().casefold()
        for scenario in self.scenarios:
            if scenario.title.casefold() == normalized:
                return scenario
        return None


@dataclass(frozen=True)
class ResponseLogEntry:
    ticket_id: str
    tier: str
    response_minutes: float
    resolution_minutes: float


@dataclass(frozen=True)
class SLASummary:
    tier: str
    tickets: int
    response_breaches: int
    resolution_breaches: int
    response_p50: float
    response_p90: float
    resolution_p50: float
    resolution_p90: float

    @property
    def response_compliance(self) -> float:
        if self.tickets == 0:
            return 100.0
        return round((1 - self.response_breaches / self.tickets) * 100, 2)

    @property
    def resolution_compliance(self) -> float:
        if self.tickets == 0:
            return 100.0
        return round((1 - self.resolution_breaches / self.tickets) * 100, 2)


def load_program(path: Path | None) -> SupportProgram:
    if path is None:
        return SupportProgram(
            tiers=(
                SupportTier(name="priority", sla_hours=2.0, channels=("pager", "chat")),
                SupportTier(name="standard", sla_hours=4.0, channels=("chat", "email")),
                SupportTier(name="community", sla_hours=24.0, channels=("forum",)),
            ),
            scenarios=(
                SupportScenario(
                    title="Production outage",
                    criticality="critical",
                    recommended_tier="priority",
                    playbook="Engage on-call engineer, activate rollback plan, run postmortem.",
                ),
                SupportScenario(
                    title="Integration guidance",
                    criticality="medium",
                    recommended_tier="standard",
                    playbook="Schedule solution architect session within 24h and share API kits.",
                ),
                SupportScenario(
                    title="Beta feedback triage",
                    criticality="medium",
                    recommended_tier="standard",
                    playbook=(
                        "Acknowledge tester report within 2h, capture details in docs/beta_feedback.md, "
                        "and escalate blocking items to the on-call engineer."
                    ),
                ),
                SupportScenario(
                    title="Community best practices",
                    criticality="low",
                    recommended_tier="community",
                    playbook="Link to documentation portal, invite to mentorship labs.",
                ),
            ),
        )

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise ValueError("Конфигурация поддержки должна быть JSON-объектом")

    tiers = tuple(
        SupportTier(
            name=str(item["name"]),
            sla_hours=float(item.get("sla_hours", 4.0)),
            channels=tuple(str(ch) for ch in item.get("channels", ())),
        )
        for item in payload.get("tiers", ())
    )
    scenarios = tuple(
        SupportScenario(
            title=str(item["title"]),
            criticality=str(item.get("criticality", "medium")),
            recommended_tier=str(item.get("recommended_tier", "standard")),
            playbook=str(item.get("playbook", "")),
        )
        for item in payload.get("scenarios", ())
    )
    return SupportProgram(tiers=tiers, scenarios=scenarios)


def parse_response_log(payload: Sequence[Mapping[str, Any]]) -> list[ResponseLogEntry]:
    entries: list[ResponseLogEntry] = []
    for item in payload:
        entries.append(
            ResponseLogEntry(
                ticket_id=str(item.get("ticket_id", "")),
                tier=str(item.get("tier", "standard")),
                response_minutes=float(item.get("response_minutes", 0.0)),
                resolution_minutes=float(item.get("resolution_minutes", 0.0)),
            )
        )
    return entries


def _percentiles(values: Sequence[float]) -> tuple[float, float]:
    if not values:
        return 0.0, 0.0
    sorted_values = sorted(values)
    p50_index = int(0.5 * (len(sorted_values) - 1))
    p90_index = int(0.9 * (len(sorted_values) - 1))
    return (
        round(sorted_values[p50_index], 2),
        round(sorted_values[p90_index], 2),
    )


def evaluate_sla(program: SupportProgram, entries: Sequence[ResponseLogEntry]) -> list[SLASummary]:
    tier_map = program.tier_map()
    grouped: dict[str, list[ResponseLogEntry]] = {}
    for entry in entries:
        grouped.setdefault(entry.tier, []).append(entry)

    summaries: list[SLASummary] = []
    for tier_name, tier_entries in grouped.items():
        tier = tier_map.get(tier_name)
        sla_minutes = tier.sla_hours * 60 if tier else 240.0
        response_breaches = sum(1 for item in tier_entries if item.response_minutes > sla_minutes)
        resolution_breaches = sum(
            1
            for item in tier_entries
            if tier and item.resolution_minutes > sla_minutes * 2
        )
        responses = [item.response_minutes for item in tier_entries]
        resolutions = [item.resolution_minutes for item in tier_entries]
        response_p50, response_p90 = _percentiles(responses)
        resolution_p50, resolution_p90 = _percentiles(resolutions)
        summaries.append(
            SLASummary(
                tier=tier_name,
                tickets=len(tier_entries),
                response_breaches=response_breaches,
                resolution_breaches=resolution_breaches,
                response_p50=response_p50,
                response_p90=response_p90,
                resolution_p50=resolution_p50,
                resolution_p90=resolution_p90,
            )
        )

    # Ensure tiers without activity still show up for dashboards
    for tier in program.tiers:
        if tier.name not in grouped:
            summaries.append(
                SLASummary(
                    tier=tier.name,
                    tickets=0,
                    response_breaches=0,
                    resolution_breaches=0,
                    response_p50=0.0,
                    response_p90=0.0,
                    resolution_p50=0.0,
                    resolution_p90=0.0,
                )
            )

    return sorted(summaries, key=lambda summary: summary.tier)
