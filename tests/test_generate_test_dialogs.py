from __future__ import annotations

import json
from pathlib import Path

from scripts.generate_test_dialogs import GenerationConfig, generate_bundle, save_bundle


def test_stub_bundle_structure(tmp_path: Path) -> None:
    cfg = GenerationConfig(backend="stub", count=2, seed=7, model="stub-model")
    bundle = generate_bundle(cfg)

    assert bundle["backend"] == "stub"
    assert bundle["model"] == "stub-model"
    assert len(bundle["dialogues"]) == 2
    assert len(bundle["scenarios"]) == 2

    for dialogue in bundle["dialogues"]:
        assert "title" in dialogue
        assert dialogue["steps"][0]["role"] in {"user", "assistant"}
        assert dialogue["steps"]

    for scenario in bundle["scenarios"]:
        assert scenario["steps"], "scenario steps expected"
        assert scenario["success_criteria"], "success criteria expected"

    output = tmp_path / "bundle.json"
    save_bundle(bundle, output)

    loaded = json.loads(output.read_text(encoding="utf-8"))
    assert loaded["dialogues"][0]["steps"][0]["role"] == bundle["dialogues"][0]["steps"][0]["role"]
