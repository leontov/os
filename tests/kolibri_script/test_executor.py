"""Тесты для исполнителя KolibriScript."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.kolibri_script import Executor
from core.kolibri_sim import KolibriSim


def _build_script() -> Sequence[dict[str, object]]:
    return [
        {"op": "set", "name": "стимул", "value": "привет"},
        {"op": "set", "name": "ответ", "value": "мир"},
        {
            "op": "block",
            "name": "обучение",
            "body": [
                {
                    "op": "teach",
                    "stimulus": {"var": "стимул"},
                    "response": {"var": "ответ"},
                },
                {
                    "op": "ask",
                    "stimulus": {"var": "стимул"},
                    "store_as": "отклик",
                },
            ],
        },
        {
            "op": "block",
            "name": "эволюция",
            "body": [
                {
                    "op": "evolve",
                    "context": "math",
                    "store_as": "формула",
                },
                {
                    "op": "evaluate",
                    "formula": {"var": "формула"},
                    "fitness": 0.75,
                    "store_as": "фитнес",
                },
                {
                    "op": "get_formula",
                    "name": {"var": "формула"},
                    "store_as": "формула_данные",
                },
                {
                    "op": "genome_snapshot",
                    "limit": 5,
                    "store_as": "геном",
                },
                {
                    "op": "swarm",
                    "command": "broadcast",
                    "payload": {"formula": {"var": "формула"}},
                },
            ],
        },
        {"op": "log", "tip": "INFO", "message": "script:complete"},
    ]


@pytest.fixture
def script() -> Sequence[dict[str, object]]:
    return _build_script()


def test_executor_updates_state_and_effects(script: Sequence[dict[str, object]]) -> None:
    sim = KolibriSim(zerno=2024)
    executor = Executor(sim)
    snapshot = executor.execute(script)

    assert snapshot.block_stack == []
    assert snapshot.genome_length == len(sim.genom)

    assert snapshot.variables["отклик"] == "мир"
    assert pytest.approx(snapshot.variables["фитнес"], rel=1e-9) == 0.45

    formula = snapshot.variables["формула_данные"]
    assert formula["kod"].startswith("f(x)=")

    genome_snapshot = snapshot.variables["геном"]
    assert len(genome_snapshot) == min(len(sim.genom), 5)
    assert genome_snapshot[-1]["nomer"] == sim.genom[-1].nomer

    logs = snapshot.effects["logs"]
    assert any(entry["tip"] == "TEACH" for entry in logs)
    swarm_events = snapshot.effects["swarm_events"]
    assert swarm_events and swarm_events[0]["komanda"] == "broadcast"


def test_executor_is_deterministic(script: Sequence[dict[str, object]]) -> None:
    script = list(script)
    snap_a = Executor(KolibriSim(zerno=73)).execute(script)
    snap_b = Executor(KolibriSim(zerno=73)).execute(script)
    snap_c = Executor(KolibriSim(zerno=74)).execute(script)

    assert snap_a == snap_b
    assert snap_a != snap_c
