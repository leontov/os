from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import release_pipeline


def _config_payload() -> dict:
    return {
        "name": "kolibri-trust-release",
        "version": "2024.06",
        "default_rollback_steps": [
            "Сообщить капитану релиза",
            "Выполнить откат через orchestrator",
        ],
        "stages": [
            {
                "name": "build-artifacts",
                "environment": "ci",
                "description": "Сборка контейнеров и артефактов",
                "checks": {"max_latency_ms": 900, "max_error_rate": 0.01},
            },
            {
                "name": "staging-verify",
                "environment": "staging",
                "description": "Проверка на стейджинге",
                "checks": {
                    "max_latency_ms": 1200,
                    "max_error_rate": 0.02,
                    "max_energy_kwh": 1.8,
                    "required_approvals": 2,
                },
                "rollback_steps": [
                    "Заблокировать продвижение трафика",
                    "Восстановить предыдущий build на стейджинге",
                ],
            },
            {
                "name": "production-rollout",
                "environment": "production",
                "description": "Постепенное включение фичей",
                "checks": {
                    "max_latency_ms": 1500,
                    "max_error_rate": 0.015,
                    "max_energy_kwh": 2.2,
                },
            },
        ],
    }


def test_run_pipeline_successful_flow() -> None:
    config = release_pipeline.PipelineConfig.from_mapping(_config_payload())
    observations = {
        "build-artifacts": release_pipeline.StageObservation(
            latency_ms=650, error_rate=0.0, energy_kwh=0.4, approvals=0
        ),
        "staging-verify": release_pipeline.StageObservation(
            latency_ms=1000, error_rate=0.01, energy_kwh=1.5, approvals=3
        ),
        "production-rollout": release_pipeline.StageObservation(
            latency_ms=1200, error_rate=0.005, energy_kwh=1.7, approvals=0
        ),
    }

    report = release_pipeline.run_pipeline(config, observations)

    assert report.status == release_pipeline.StageStatus.PASSED
    assert report.rollback == ()
    assert not report.skipped
    assert [result.status for result in report.results] == [
        release_pipeline.StageStatus.PASSED,
        release_pipeline.StageStatus.PASSED,
        release_pipeline.StageStatus.PASSED,
    ]


def test_pipeline_failure_triggers_stage_specific_rollback() -> None:
    config = release_pipeline.PipelineConfig.from_mapping(_config_payload())
    observations = {
        "build-artifacts": release_pipeline.StageObservation(
            latency_ms=700, error_rate=0.0, energy_kwh=0.4, approvals=0
        ),
        "staging-verify": release_pipeline.StageObservation(
            latency_ms=1600, error_rate=0.03, energy_kwh=2.4, approvals=1
        ),
    }

    report = release_pipeline.run_pipeline(config, observations)

    assert report.status == release_pipeline.StageStatus.FAILED
    assert report.skipped == ("production-rollout",)
    assert report.rollback == (
        "Заблокировать продвижение трафика",
        "Восстановить предыдущий build на стейджинге",
    )
    failing_stage = report.results[1]
    assert failing_stage.requires_rollback is True
    assert "latency" in " ".join(failing_stage.reasons)
    assert "error rate" in " ".join(failing_stage.reasons)
    assert "approvals" in " ".join(failing_stage.reasons)


@pytest.mark.parametrize(
    "observations_key",
    ["observations", "custom"],
)
def test_cli_run_generates_report(tmp_path: Path, observations_key: str) -> None:
    config_path = tmp_path / "pipeline.json"
    config_payload = _config_payload()
    config_payload["observations"] = {
        "build-artifacts": {
            "latency_ms": 700,
            "error_rate": 0.001,
            "energy_kwh": 0.5,
        }
    }
    config_path.write_text(json.dumps(config_payload), encoding="utf-8")

    stage_observations = {
        "build-artifacts": {
            "latency_ms": 650,
            "error_rate": 0.0,
            "energy_kwh": 0.4,
        },
        "staging-verify": {
            "latency_ms": 1100,
            "error_rate": 0.01,
            "energy_kwh": 1.4,
            "approvals": 3,
        },
        "production-rollout": {
            "latency_ms": 1300,
            "error_rate": 0.012,
            "energy_kwh": 1.8,
        },
    }
    if observations_key == "observations":
        observations_payload = {"observations": stage_observations}
    else:
        observations_payload = stage_observations
    observations_path = tmp_path / "observations.json"
    observations_path.write_text(json.dumps(observations_payload), encoding="utf-8")

    output_path = tmp_path / "report.json"

    exit_code = release_pipeline.run(
        [
            "run",
            "--config",
            str(config_path),
            "--observations",
            str(observations_path),
            "--output",
            str(output_path),
        ]
    )

    assert exit_code == 0
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["status"] == release_pipeline.StageStatus.PASSED
    assert payload["pipeline"]["stage_count"] == 3
    assert payload["results"][0]["stage"] == "build-artifacts"
