from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import project_health


def _write_json(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


@pytest.fixture()
def sample_reports(tmp_path: Path) -> dict[str, Path]:
    coverage_payload = {
        "totals": {
            "covered_lines": 920,
            "num_statements": 1000,
            "covered_branches": 160,
            "num_branches": 200,
        },
        "files": {},
    }

    dependency_payload = {
        "total_dependencies": 12,
        "duplicates": ["httpx"],
        "critical_focus": [
            {
                "name": "fastapi",
                "specifier": "==0.110.0",
                "classification": "runtime-api",
                "criticality": "critical",
                "source": "requirements.txt",
            }
        ],
    }

    stress_payload = {
        "metadata": {
            "base_url": "https://kolibri",
            "iterations": 10,
            "concurrency": 4,
            "energy_per_request_joules": 0.4,
            "scenario_count": 1,
        },
        "totals": {
            "requests": 40,
            "success": 35,
            "failures": 5,
            "avg_throughput_rps": 6.5,
            "energy_joules": 14.0,
        },
    }

    release_payload = {
        "status": "passed",
        "rollback": [],
        "skipped_stages": [],
    }

    return {
        "coverage": _write_json(tmp_path / "coverage.json", coverage_payload),
        "dependencies": _write_json(tmp_path / "dependencies.json", dependency_payload),
        "stress": _write_json(tmp_path / "stress.json", stress_payload),
        "release": _write_json(tmp_path / "release.json", release_payload),
    }


def test_aggregate_health_produces_weighted_score(sample_reports: dict[str, Path]) -> None:
    report = project_health.aggregate_health(
        coverage_report=sample_reports["coverage"],
        dependency_report=sample_reports["dependencies"],
        stress_report_path=sample_reports["stress"],
        release_report=sample_reports["release"],
    )

    payload = report.to_dict()
    assert set(payload["overall"]["sections"]) == {
        "coverage",
        "dependencies",
        "stress",
        "release",
    }
    assert payload["overall"]["score"] > 70
    assert pytest.approx(payload["overall"]["weights"]["coverage"], rel=1e-3) == 0.35

    coverage_section = next(section for section in report.sections if section.name == "coverage")
    assert coverage_section.metrics["line_coverage"] == pytest.approx(92.0)
    assert coverage_section.status in {"stellar", "strong"}
    assert coverage_section.weight == pytest.approx(0.35, rel=1e-3)


def test_aggregate_health_requires_inputs(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        project_health.aggregate_health()


def test_aggregate_health_supports_config_and_baseline(
    tmp_path: Path, sample_reports: dict[str, Path]
) -> None:
    baseline_report = project_health.aggregate_health(
        coverage_report=sample_reports["coverage"],
        dependency_report=sample_reports["dependencies"],
        stress_report_path=sample_reports["stress"],
        release_report=sample_reports["release"],
    ).to_dict()

    baseline_path = tmp_path / "baseline.json"
    baseline_path.write_text(json.dumps(baseline_report), encoding="utf-8")

    coverage_payload = json.loads(sample_reports["coverage"].read_text(encoding="utf-8"))
    coverage_payload["totals"]["covered_lines"] = 850
    coverage_payload["totals"]["covered_branches"] = 140
    sample_reports["coverage"].write_text(json.dumps(coverage_payload), encoding="utf-8")

    config = project_health.AggregationConfig.from_payload(
        {
            "weights": {"coverage": 6, "stress": 2, "dependencies": 1, "release": 1},
            "coverage_targets": {"line": 88, "branch": 68},
        }
    )

    report = project_health.aggregate_health(
        coverage_report=sample_reports["coverage"],
        dependency_report=sample_reports["dependencies"],
        stress_report_path=sample_reports["stress"],
        release_report=sample_reports["release"],
        config=config,
        baseline=baseline_path,
    )

    payload = report.to_dict()
    assert payload["overall"]["delta"] < 0
    assert pytest.approx(payload["overall"]["weights"]["coverage"], rel=1e-3) == 0.6

    coverage_section = next(section for section in report.sections if section.name == "coverage")
    assert coverage_section.delta is not None and coverage_section.delta < 0
    assert any("88" in insight for insight in coverage_section.insights)


def test_cli_outputs_markdown(sample_reports: dict[str, Path], capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = project_health.run(
        [
            "--coverage",
            str(sample_reports["coverage"]),
            "--dependencies",
            str(sample_reports["dependencies"]),
            "--stress",
            str(sample_reports["stress"]),
            "--release",
            str(sample_reports["release"]),
            "--format",
            "markdown",
        ]
    )

    assert exit_code == 0
    captured = capsys.readouterr().out
    assert "# Сводный отчёт здоровья платформы Колибри" in captured
    assert "| coverage |" in captured
    assert "kolibri-project-health" in captured

