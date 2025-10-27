from __future__ import annotations

import json
from pathlib import Path

from support import SupportProgram, SupportTier, SupportScenario, evaluate_sla, parse_response_log
from scripts import support_program


def test_evaluate_sla_reports_compliance() -> None:
    program = SupportProgram(
        tiers=(
            SupportTier(name="priority", sla_hours=2.0, channels=("pager",)),
            SupportTier(name="standard", sla_hours=4.0, channels=("chat",)),
        ),
        scenarios=(),
    )
    entries = parse_response_log(
        [
            {"ticket_id": "1", "tier": "priority", "response_minutes": 60, "resolution_minutes": 120},
            {"ticket_id": "2", "tier": "priority", "response_minutes": 200, "resolution_minutes": 500},
            {"ticket_id": "3", "tier": "standard", "response_minutes": 100, "resolution_minutes": 200},
        ]
    )

    report = evaluate_sla(program, entries)

    priority = next(item for item in report if item.tier == "priority")
    assert priority.response_compliance == 50.0
    assert priority.resolution_compliance == 50.0


def test_cli_catalog_outputs_program(tmp_path: Path, capsys) -> None:
    config_path = tmp_path / "program.json"
    config_path.write_text(
        json.dumps(
            {
                "tiers": [
                    {"name": "priority", "sla_hours": 2, "channels": ["pager"]},
                ],
                "scenarios": [
                    {
                        "title": "Outage",
                        "criticality": "critical",
                        "recommended_tier": "priority",
                        "playbook": "Call on-call",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    exit_code = support_program.run(["catalog", "--config", str(config_path)])

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["tiers"][0]["name"] == "priority"
    assert payload["scenarios"][0]["title"] == "Outage"


def test_cli_evaluate_outputs_sla_report(tmp_path: Path, capsys) -> None:
    config_path = tmp_path / "program.json"
    config_path.write_text(
        json.dumps(
            {
                "tiers": [
                    {"name": "standard", "sla_hours": 4, "channels": ["chat"]},
                ],
                "scenarios": [],
            }
        ),
        encoding="utf-8",
    )
    responses_path = tmp_path / "responses.json"
    responses_path.write_text(
        json.dumps(
            [
                {
                    "ticket_id": "1",
                    "tier": "standard",
                    "response_minutes": 90,
                    "resolution_minutes": 200,
                }
            ]
        ),
        encoding="utf-8",
    )

    exit_code = support_program.run(
        [
            "evaluate",
            "--config",
            str(config_path),
            "--responses",
            str(responses_path),
        ]
    )

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload[0]["response_compliance"] == 100.0
    assert payload[0]["resolution_compliance"] == 100.0
