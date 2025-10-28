from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from go_to_market import build_launch_plan, calculate_metric_report
from go_to_market.playbook import serialise_plan
from scripts import launch_playbook


def test_build_launch_plan_creates_phase_schedule() -> None:
    config = {
        "product": "Колибри ИИ",
        "launch_date": "2025-01-06",
        "phases": [
            {"name": "Awareness", "focus": "story", "weeks": 2, "channels": ["blog"]},
            {"name": "Adoption", "focus": "pilots", "weeks": 3, "channels": ["beta"]},
        ],
        "assets": [
            {"name": "Landing", "owner": "web", "channel": "web", "status": "in-progress"}
        ],
        "metrics": [
            {"name": "NPS", "baseline": 30, "target": 50},
            {"name": "Activation", "baseline": 0.2, "target": 0.5},
        ],
    }

    plan = build_launch_plan(config)
    schedule = plan.phase_windows()

    assert schedule[0]["start"] == "2025-01-06"
    assert schedule[0]["end"] == "2025-01-20"
    assert schedule[1]["start"] == "2025-01-20"
    assert schedule[1]["end"] == "2025-02-10"
    assert plan.asset_matrix()[0]["status"] == "in-progress"


def test_metric_report_tracks_progress() -> None:
    config = {
        "product": "Колибри ИИ",
        "launch_date": date.today().isoformat(),
        "phases": [],
        "assets": [],
        "metrics": [{"name": "NPS", "baseline": 30, "target": 50}],
    }
    plan = build_launch_plan(config)

    report = calculate_metric_report(plan, {"NPS": 42})

    assert report[0]["status"] == "needs-attention"
    assert report[0]["progress"] == 60.0


def test_cli_plan_outputs_serialised_plan(tmp_path: Path, capsys) -> None:
    config_path = tmp_path / "launch.json"
    config_path.write_text(
        json.dumps(
            {
                "product": "Колибри ИИ",
                "launch_date": "2025-01-06",
                "phases": [],
                "assets": [],
                "metrics": [],
            }
        ),
        encoding="utf-8",
    )

    exit_code = launch_playbook.run(["plan", "--config", str(config_path)])

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["product"] == "Колибри ИИ"


def test_cli_metrics_outputs_report(tmp_path: Path, capsys) -> None:
    config_path = tmp_path / "launch.json"
    config_path.write_text(
        json.dumps(
            {
                "product": "Колибри ИИ",
                "launch_date": "2025-01-06",
                "phases": [],
                "assets": [],
                "metrics": [{"name": "NPS", "baseline": 30, "target": 50}],
            }
        ),
        encoding="utf-8",
    )
    observations_path = tmp_path / "observations.json"
    observations_path.write_text(json.dumps({"NPS": 55}), encoding="utf-8")

    exit_code = launch_playbook.run(
        [
            "metrics",
            "--config",
            str(config_path),
            "--observations",
            str(observations_path),
        ]
    )

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload[0]["status"] == "achieved"
    assert payload[0]["progress"] == 100.0
