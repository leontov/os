from __future__ import annotations

import json
from pathlib import Path
from textwrap import dedent

import pytest
from fastapi.testclient import TestClient

from docs_portal.app import create_app
from docs_portal.engine import PortalEngine
from scripts.docs_portal import main as docs_portal_cli


@pytest.fixture()
def portal_config(tmp_path: Path) -> Path:
    stable_dir = tmp_path / "stable"
    next_dir = tmp_path / "next"
    stable_dir.mkdir()
    next_dir.mkdir()

    (stable_dir / "intro.md").write_text(
        dedent(
            """
            # Введение

            Kolibri documentation accelerates learning.

            ```kolibri-example id=calc language=python
            result = sum(range(4))
            print(result)
            ```
            """
        ).strip(),
        encoding="utf-8",
    )

    (next_dir / "guide.md").write_text(
        dedent(
            """
            # Руководство

            This release explores next capabilities.
            """
        ).strip(),
        encoding="utf-8",
    )

    config = tmp_path / "portal.json"
    config.write_text(
        json.dumps(
            {
                "default_version": "stable",
                "versions": [
                    {"name": "stable", "label": "Stable", "path": "stable"},
                    {"name": "next", "label": "Next", "path": "next"},
                ],
            }
        ),
        encoding="utf-8",
    )
    return config


def test_engine_loads_documents_and_examples(portal_config: Path) -> None:
    engine = PortalEngine.from_config(portal_config)

    versions = engine.list_versions()
    assert {entry["name"] for entry in versions} == {"stable", "next"}

    docs = engine.list_documents("stable")
    assert len(docs) == 1
    document = docs[0]
    assert document.title == "Введение"
    assert document.examples

    search_hits = engine.search("stable", "kolibri")
    assert search_hits and search_hits[0].identifier == document.identifier

    result = engine.execute_example("stable", document.examples[0].identifier)
    assert result.stdout == "6"
    assert result.variables["result"] == "6"


def test_engine_raises_for_unknown_example(portal_config: Path) -> None:
    engine = PortalEngine.from_config(portal_config)
    with pytest.raises(KeyError):
        engine.execute_example("stable", "intro::missing")


def test_fastapi_endpoints_expose_portal(portal_config: Path) -> None:
    app = create_app(portal_config)
    client = TestClient(app)

    versions = client.get("/api/versions").json()
    assert len(versions) == 2

    docs = client.get("/api/versions/stable/docs").json()
    assert docs[0]["title"] == "Введение"

    doc = client.get(
        f"/api/versions/stable/docs/{docs[0]['identifier']}"
    ).json()
    assert doc["examples"]

    search = client.get(
        "/api/versions/stable/search", params={"query": "kolibri"}
    ).json()
    assert search

    execution = client.post(
        f"/api/versions/stable/examples/{doc['examples'][0]['identifier']}/execute"
    ).json()
    assert execution["stdout"] == "6"


def test_cli_versions_lists_payload(portal_config: Path, capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = docs_portal_cli(["--config", str(portal_config), "versions"])
    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert {entry["name"] for entry in payload} == {"stable", "next"}


def test_cli_run_example_executes_snippet(
    portal_config: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    engine = PortalEngine.from_config(portal_config)
    example_id = engine.list_examples("stable")[0].identifier
    exit_code = docs_portal_cli(
        ["--config", str(portal_config), "run-example", "stable", example_id]
    )
    captured = capsys.readouterr()
    assert exit_code == 0
    payload = json.loads(captured.out)
    assert payload["stdout"] == "6"


def test_cli_run_example_handles_errors(
    portal_config: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    exit_code = docs_portal_cli(
        ["--config", str(portal_config), "run-example", "stable", "missing"]
    )
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "missing" in captured.err
