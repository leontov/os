import json
from pathlib import Path

from scripts import telemetry_hub


def test_summarize_highlights_incidents() -> None:
    events = telemetry_hub.load_events(
        [
            {"service": "api", "category": "latency", "severity": "high"},
            {"service": "api", "category": "latency", "severity": "critical"},
            {"service": "api", "category": "deployment", "severity": "info"},
        ]
    )
    summaries = telemetry_hub.summarize(events)
    assert summaries[0].incidents == 2
    assert any("инцидента" in suggestion for suggestion in summaries[0].suggestions)


def test_cli_produces_json(tmp_path: Path) -> None:
    payload = [
        {"service": "api", "category": "latency", "severity": "critical"},
        {"service": "api", "category": "latency", "severity": "high"},
    ]
    events_path = tmp_path / "events.json"
    output_path = tmp_path / "summary.json"
    events_path.write_text(json.dumps(payload), encoding="utf-8")

    exit_code = telemetry_hub.main([str(events_path), "--output", str(output_path)])
    assert exit_code == 0
    data = json.loads(output_path.read_text(encoding="utf-8"))
    assert data[0]["incidents"] == 2
