from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import coverage_guard


@pytest.fixture
def coverage_report() -> dict:
    return {
        "meta": {"version": "7.4"},
        "files": {
            "backend/service/main.py": {
                "summary": {
                    "num_statements": 120,
                    "covered_lines": 102,
                    "num_branches": 80,
                    "covered_branches": 60,
                }
            },
            "backend/service/observability.py": {
                "summary": {
                    "num_statements": 60,
                    "covered_lines": 48,
                    "num_branches": 20,
                    "covered_branches": 16,
                }
            },
            "scripts/dependency_audit.py": {
                "summary": {
                    "num_statements": 90,
                    "covered_lines": 72,
                    "num_branches": 40,
                    "covered_branches": 30,
                }
            },
        },
        "totals": {
            "num_statements": 270,
            "covered_lines": 222,
            "num_branches": 140,
            "covered_branches": 106,
        },
    }


def test_evaluate_coverage_passes_when_thresholds_met(coverage_report: dict) -> None:
    verdict = coverage_guard.evaluate_coverage(
        coverage_report,
        coverage_guard.CoverageThresholds(line=80.0, branch=70.0),
    )

    assert verdict.passed is True
    assert verdict.violations == []
    assert pytest.approx(verdict.line_coverage, rel=1e-3) == 82.222
    assert pytest.approx(verdict.branch_coverage, rel=1e-3) == 75.714


def test_package_thresholds_detect_underperforming_prefix(coverage_report: dict) -> None:
    verdict = coverage_guard.evaluate_coverage(
        coverage_report,
        coverage_guard.CoverageThresholds(line=70.0, branch=70.0),
        {"backend/service": coverage_guard.CoverageThresholds(line=90.0, branch=80.0)},
    )

    assert verdict.passed is False
    assert "Порог покрытия не выполнен" in verdict.violations[0]
    backend_report = verdict.packages["backend/service"]
    assert backend_report["passed"] is False
    assert any("строк" in message for message in backend_report["violations"])


def test_cli_outputs_json_and_exit_code(
    tmp_path: Path, coverage_report: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    report_path = tmp_path / "coverage.json"
    report_path.write_text(json.dumps(coverage_report), encoding="utf-8")

    exit_code = coverage_guard.run(
        [
            "--report",
            str(report_path),
            "--line-min",
            "85",
            "--branch-min",
            "70",
            "--package-threshold",
            "scripts=85:80",
        ]
    )

    assert exit_code == 1
    payload = json.loads(capsys.readouterr().out)
    assert payload["passed"] is False
    assert "scripts" in payload["packages"]
