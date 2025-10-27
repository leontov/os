import json
from pathlib import Path

from scripts import beta_feedback


def test_summarize_feedback_groups_entries() -> None:
    entries = beta_feedback.load_feedback(
        [
            {"app": "creative", "satisfaction": 0.9, "retention_intent": 0.8, "nps": 50, "pain_points": ["latency"]},
            {"app": "creative", "satisfaction": 0.88, "retention_intent": 0.78, "nps": 48, "pain_points": ["ui"]},
        ]
    )
    summaries = beta_feedback.summarize_feedback(entries)
    assert summaries[0].review.satisfaction > 0.85
    assert "latency" in summaries[0].top_pains


def test_cli_outputs_beta_summary(tmp_path: Path) -> None:
    payload = [
        {"app": "productivity", "satisfaction": 0.84, "retention_intent": 0.74, "nps": 46, "pain_points": ["setup"]}
    ]
    feedback_path = tmp_path / "feedback.json"
    output_path = tmp_path / "summary.json"
    feedback_path.write_text(json.dumps(payload), encoding="utf-8")

    exit_code = beta_feedback.main([str(feedback_path), "--output", str(output_path)])
    assert exit_code == 0
    data = json.loads(output_path.read_text(encoding="utf-8"))
    assert data[0]["app"] == "productivity"
    assert data[0]["top_pains"] == ["setup"]
