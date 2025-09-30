"""Регрессионные тесты для сценария длительного прогона Kolibri."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import List
from unittest.mock import patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from core.kolibri_sim import MetricEntry, zagruzit_sostoyanie
from scripts import soak


def _run_soak(capsys: pytest.CaptureFixture[str], args: List[str]) -> dict:
    argv = ["soak"] + args
    with patch.object(sys, "argv", argv):
        exit_code = soak.main()
    assert exit_code == 0
    captured = capsys.readouterr()
    return json.loads(captured.out)


def test_soak_resume_accumulates_state(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    state_path = tmp_path / "state.json"
    log_dir = tmp_path / "logs"

    result_first = _run_soak(
        capsys,
        [
            "--minutes",
            "1",
            "--state-path",
            str(state_path),
            "--log-dir",
            str(log_dir),
            "--seed",
            "123",
        ],
    )

    assert result_first["metrics_written"] == 1
    state_after_first = zagruzit_sostoyanie(state_path)
    metrics_first = state_after_first.get("metrics")
    assert isinstance(metrics_first, list)
    assert len(metrics_first) == 1

    result_second = _run_soak(
        capsys,
        [
            "--minutes",
            "1",
            "--state-path",
            str(state_path),
            "--log-dir",
            str(log_dir),
            "--seed",
            "123",
            "--resume",
        ],
    )

    assert result_second["metrics_written"] == 1
    state_after_second = zagruzit_sostoyanie(state_path)
    metrics_second = state_after_second.get("metrics")
    assert isinstance(metrics_second, list)
    assert len(metrics_second) == 2
    assert state_after_second.get("events", 0) >= state_after_first.get("events", 0)


def test_zapisat_csv_outputs_expected_rows(tmp_path: Path) -> None:
    csv_path = tmp_path / "metrics.csv"
    metrics: List[MetricEntry] = [
        {"minute": 0, "formula": "f0", "fitness": 1.23, "genome": 42},
        {"minute": 1, "formula": "f1", "fitness": 2.34, "genome": 84},
    ]

    soak.zapisat_csv(csv_path, metrics)

    lines = csv_path.read_text(encoding="utf-8").splitlines()
    assert lines[0] == "minute,formula,fitness,genome"
    assert len(lines) == 3
    first_row = lines[1].split(",")
    assert first_row == ["0", "f0", "1.23", "42"]


def test_soak_tracing_creates_log(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    state_path = tmp_path / "state.json"
    log_dir = tmp_path / "logs"

    result = _run_soak(
        capsys,
        [
            "--minutes",
            "1",
            "--state-path",
            str(state_path),
            "--log-dir",
            str(log_dir),
            "--seed",
            "314",
        ],
    )

    trace_path_str = result["trace_path"]
    assert trace_path_str
    trace_path = Path(trace_path_str)
    assert trace_path.exists()
    content = trace_path.read_text(encoding="utf-8").strip().splitlines()
    assert content
    json.loads(content[0])
