from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import kolibri_dev


def test_backend_template_generation(tmp_path, capfd):
    destination = tmp_path / "cognitive"
    exit_code = kolibri_dev.main([
        "init-backend",
        str(destination),
        "--name",
        "Cognitive Atlas",
    ])
    assert exit_code == 0

    captured = capfd.readouterr()
    payload = json.loads(captured.out)
    created_paths = {Path(p).name for p in payload["created"]}
    assert {"__init__.py", "router.py", "service.py"} == created_paths

    router_content = (destination / "router.py").read_text(encoding="utf-8")
    assert "cognitive-atlas" in router_content
    assert "Получить интеллектуальные инсайты" in router_content

    service_content = (destination / "service.py").read_text(encoding="utf-8")
    assert "Лёгкая аналитика от Kolibri" in service_content


def test_frontend_template_generation(tmp_path, capfd):
    destination = tmp_path / "insight-card"
    exit_code = kolibri_dev.main([
        "init-frontend",
        str(destination),
        "--name",
        "Insight Card",
    ])
    assert exit_code == 0

    captured = capfd.readouterr()
    payload = json.loads(captured.out)
    created_paths = {Path(p).name for p in payload["created"]}
    assert created_paths == {"index.tsx"}

    component_source = (destination / "index.tsx").read_text(encoding="utf-8")
    assert "export function InsightCard" in component_source
    assert "fetch(`${props.endpoint}/insights`)" in component_source


def test_pipeline_dry_run(capfd):
    exit_code = kolibri_dev.main(["pipeline", "backend"])
    assert exit_code == 0
    payload = json.loads(capfd.readouterr().out)
    assert payload["command"][0] == "uvicorn"
    assert "--reload" in payload["command"]


def test_doctor_json(capfd):
    exit_code = kolibri_dev.main(["doctor", "--json"])
    assert exit_code == 0
    payload = json.loads(capfd.readouterr().out)
    assert "tools" in payload
    assert "python" in payload["tools"]


def test_existing_files_raise(tmp_path):
    destination = tmp_path / "module"
    destination.mkdir()
    (destination / "router.py").write_text("existing", encoding="utf-8")
    with pytest.raises(FileExistsError):
        kolibri_dev._render_backend_template(destination, name="Test")
