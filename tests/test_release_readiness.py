from __future__ import annotations

import json
from pathlib import Path

import pytest

from release.readiness import (
    ReadinessCriteria,
    ServiceArtifact,
    evaluate_release,
)
from scripts import release_readiness


def test_evaluate_release_ready_status() -> None:
    criteria = ReadinessCriteria(
        min_coverage=85.0,
        max_latency_p95_ms=250.0,
        max_error_rate=0.02,
        max_energy_kwh=120.0,
        min_nps=40.0,
        min_retention=70.0,
    )

    backend = ServiceArtifact(
        name="backend",
        coverage=90.0,
        latency_p95_ms=220.0,
        error_rate=0.01,
        energy_kwh=100.0,
        nps=45.0,
        retention=75.0,
    )
    creative_app = ServiceArtifact(
        name="creative",
        coverage=88.0,
        latency_p95_ms=180.0,
        error_rate=0.015,
        energy_kwh=95.0,
        nps=52.0,
        retention=78.0,
    )

    report = evaluate_release(
        version="1.2.0",
        criteria=criteria,
        artifacts=[backend, creative_app],
    )

    assert report.overall_status == "ready"
    assert report.overall_score > 0.9
    assert not report.blockers
    assert {service.artifact.name for service in report.services} == {"backend", "creative"}


def test_evaluate_release_detects_blockers() -> None:
    criteria = ReadinessCriteria(min_coverage=85.0, max_latency_p95_ms=240.0)
    artifacts = [
        ServiceArtifact(name="backend", coverage=80.0, latency_p95_ms=230.0),
        ServiceArtifact(name="docs", coverage=None, latency_p95_ms=260.0),
    ]

    report = evaluate_release(version="2.0.0", criteria=criteria, artifacts=artifacts)

    assert report.overall_status == "blocked"
    backend_result = next(service for service in report.services if service.artifact.name == "backend")
    docs_result = next(service for service in report.services if service.artifact.name == "docs")

    assert backend_result.status == "blocked"
    assert any("threshold_breach" in blocker for blocker in backend_result.blockers)
    assert docs_result.status == "blocked"
    assert any("missing_actual" in blocker for blocker in docs_result.blockers)


def test_cli_summary_and_output(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    payload = {
        "version": "3.1.0",
        "criteria": {
            "min_coverage": 80.0,
            "max_latency_p95_ms": 300.0,
            "max_error_rate": 0.05,
        },
        "artifacts": [
            {
                "name": "backend",
                "coverage": 83.0,
                "latency_p95_ms": 250.0,
                "error_rate": 0.03,
            },
            {
                "name": "frontend",
                "coverage": 88.0,
                "latency_p95_ms": 270.0,
                "error_rate": 0.04,
            },
        ],
    }

    input_path = tmp_path / "payload.json"
    output_path = tmp_path / "report.json"
    input_path.write_text(json.dumps(payload), encoding="utf-8")

    report = release_readiness.run(
        [str(input_path), "--summary", "--output", str(output_path)]
    )

    captured = capsys.readouterr()
    assert "Release 3.1.0 status" in captured.out
    assert "backend" in captured.out
    assert "frontend" in captured.out

    persisted = json.loads(output_path.read_text(encoding="utf-8"))
    assert persisted["version"] == "3.1.0"
    assert report.overall_status == persisted["overall_status"]

