from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import dependency_audit


def test_parse_requirements_extracts_normalised_records(tmp_path: Path) -> None:
    manifest = tmp_path / "requirements.txt"
    manifest.write_text(
        """
        # comment
        FastAPI>=0.110,<0.112
        uvicorn[standard]>=0.29,<0.31
        custom-tool>=1.0
        lint-helper
        """.strip()
        + "\n",
        encoding="utf-8",
    )

    records = dependency_audit.parse_requirements(manifest)

    assert [record.name for record in records] == [
        "FastAPI",
        "uvicorn",
        "custom-tool",
        "lint-helper",
    ]
    assert {record.classification for record in records} == {
        "runtime-api",
        "tooling",
        "quality",
    }


def test_build_report_highlights_duplicates_and_priorities() -> None:
    records = [
        dependency_audit.DependencyRecord(
            name="fastapi",
            specifier=">=0.110,<0.112",
            classification="runtime-api",
            criticality="critical",
            source="requirements.txt",
        ),
        dependency_audit.DependencyRecord(
            name="fastapi",
            specifier=">=0.111",
            classification="runtime-api",
            criticality="critical",
            source="requirements-dev.txt",
        ),
        dependency_audit.DependencyRecord(
            name="pytest",
            specifier=">=7.0",
            classification="quality",
            criticality="medium",
            source="requirements.txt",
        ),
    ]

    report = dependency_audit.build_report(records)

    assert report["duplicates"] == ["fastapi"]
    assert [item["name"] for item in report["critical_focus"]] == ["fastapi", "fastapi"]
    assert report["categories"]["runtime-api"] == ["fastapi"]


def test_cli_outputs_json_and_sets_exit_code(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    manifest = tmp_path / "requirements.txt"
    manifest.write_text("fastapi>=0.110\n", encoding="utf-8")

    exit_code = dependency_audit.run(["--requirements", str(manifest)])

    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    assert exit_code == 0
    assert payload["total_dependencies"] == 1
    assert payload["critical_focus"][0]["name"].lower() == "fastapi"

