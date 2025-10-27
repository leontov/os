import json
from pathlib import Path

import pytest

from training import build_learning_journey, load_program_from_mapping
from scripts import mentorship_program


@pytest.fixture()
def sample_program() -> dict:
    return {
        "sessions_per_week": 2,
        "courses": [
            {"id": "ml-basics", "competencies": ["ml", "python"], "lab_required": True},
            {"id": "observability", "competencies": ["logging", "metrics"]},
            {"id": "ethics", "competencies": ["ethics"], "duration_hours": 2},
        ],
        "mentors": [
            {"name": "Ирина", "specialization": ["ml", "python", "ethics"], "capacity": 2},
            {"name": "Дмитрий", "specialization": ["metrics"], "capacity": 1},
        ],
        "mentees": [
            {"name": "Алекс", "goals": ["ml", "ethics"], "baseline_score": 0.4},
        ],
    }


def test_learning_journey_covers_weeks(sample_program: dict) -> None:
    program = load_program_from_mapping(sample_program)
    result = build_learning_journey(program, weeks=3, target_score=0.9)
    sessions = result.sessions
    assert {session.course_id for session in sessions} >= {"ml-basics", "ethics"}
    assert all(session.focus in {"лаборатория", "семинар", "практикум"} for session in sessions)

    summary = result.summary(program)
    assert summary.mentee_goal_coverage["Алекс"] >= 0.66
    assert summary.mentor_utilization["Ирина"] > 0


def test_summary_tracks_uncovered_goals(sample_program: dict) -> None:
    sample_program["mentees"].append(
        {"name": "Мария", "goals": ["ml", "governance"], "baseline_score": 0.2}
    )
    program = load_program_from_mapping(sample_program)
    result = build_learning_journey(program, weeks=2, target_score=0.8)
    summary = result.summary(program)

    assert "Мария" in summary.uncovered_goals
    assert summary.uncovered_goals["Мария"] == ("governance",)
    assert "ml-basics" in summary.recommended_courses["Мария"]


def test_cli_generates_schedule(tmp_path: Path, sample_program: dict) -> None:
    config_path = tmp_path / "program.json"
    config_path.write_text(json.dumps(sample_program, ensure_ascii=False), encoding="utf-8")
    output_path = tmp_path / "schedule.json"

    exit_code = mentorship_program.main(
        [
            str(config_path),
            "--weeks",
            "2",
            "--target-score",
            "0.9",
            "--output",
            str(output_path),
            "--summary",
        ]
    )

    assert exit_code == 0
    data = json.loads(output_path.read_text(encoding="utf-8"))
    assert any(item["focus"] == "лаборатория" for item in data["sessions"])
    assert all(item["mentor"] == "Ирина" for item in data["sessions"])
    assert "summary" in data
    assert data["summary"]["mentor_utilization"]["Ирина"] > 0
