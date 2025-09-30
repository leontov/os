"""Тесты для автоматического резолвера конфликтов."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "resolve_conflicts.py"


def run_git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        text=True,
        capture_output=True,
        check=True,
    )


def test_resolve_conflicts_rebase_auto_resolution(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    run_git(repo, "init", "-b", "main")
    run_git(repo, "config", "user.name", "Pytest User")
    run_git(repo, "config", "user.email", "pytest@example.com")

    file_path = repo / "note.txt"
    file_path.write_text("start\nbase\n", encoding="utf-8")
    run_git(repo, "add", "note.txt")
    run_git(repo, "commit", "-m", "base commit")

    run_git(repo, "checkout", "-b", "feature")
    file_path.write_text("start\nfeature\n", encoding="utf-8")
    run_git(repo, "commit", "-am", "feature change")

    run_git(repo, "checkout", "main")
    file_path.write_text("start\nmain\n", encoding="utf-8")
    run_git(repo, "commit", "-am", "main change")

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--base",
            "main",
            "--head",
            "feature",
            "--report",
            "report.json",
        ],
        cwd=repo,
        text=True,
        capture_output=True,
    )

    assert result.returncode == 0, result.stderr

    report_path = repo / "report.json"
    assert report_path.exists()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["base"] == "main"
    assert report["head"] == "feature"
    assert report["merge_base"], "ожидается вычисленный merge-base"
    statuses = {entry["status"] for entry in report["files"]}
    assert "resolved" in statuses

    content = file_path.read_text(encoding="utf-8")
    assert "feature" in content and "main" in content

    head_branch = run_git(repo, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    assert head_branch == "feature"
    status_lines = [line.strip() for line in run_git(repo, "status", "--porcelain").stdout.splitlines() if line.strip()]
    assert not status_lines or status_lines == ["?? report.json"]


def test_resolve_conflicts_invalid_head_returns_nonzero(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    run_git(repo, "init", "-b", "main")
    run_git(repo, "config", "user.name", "Pytest User")
    run_git(repo, "config", "user.email", "pytest@example.com")

    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    run_git(repo, "add", "README.md")
    run_git(repo, "commit", "-m", "init")

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--base",
            "main",
            "--head",
            "missing-branch",
        ],
        cwd=repo,
        text=True,
        capture_output=True,
    )

    assert result.returncode != 0
    assert "missing-branch" in result.stderr
