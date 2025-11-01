from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from scripts import stress_report


class FakeMonotonic:
    def __init__(self, step: float = 0.05) -> None:
        self._value = 0.0
        self._step = step

    def __call__(self) -> float:
        current = self._value
        self._value += self._step
        return current


async def _successful_responder(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"status": "ok"}, request=request)


def test_execute_stress_test_collects_metrics() -> None:
    async def _run() -> stress_report.ScenarioMetrics:
        transport = httpx.MockTransport(_successful_responder)
        async with httpx.AsyncClient(base_url="https://kolibri", transport=transport) as client:
            metrics = await stress_report.execute_stress_test(
                client,
                [stress_report.Scenario(name="health", method="GET", path="/health")],
                iterations=3,
                concurrency=1,
                energy_per_request_joules=0.42,
                monotonic=FakeMonotonic(step=0.1),
            )
        return metrics[0]

    scenario_metrics = asyncio.run(_run())

    assert scenario_metrics.total_requests == 3
    assert scenario_metrics.success == 3
    assert scenario_metrics.failures == 0
    assert pytest.approx(scenario_metrics.energy_joules, rel=1e-3) == 1.26
    assert scenario_metrics.latency_ms["avg"] > 0
    assert scenario_metrics.latency_ms["p95"] >= scenario_metrics.latency_ms["p50"]


def test_build_report_summarises_totals() -> None:
    metrics = [
        stress_report.ScenarioMetrics(
            name="a",
            total_requests=5,
            success=4,
            failures=1,
            duration_s=0.5,
            throughput_rps=8.0,
            latency_ms={"avg": 10.0, "p50": 9.0, "p95": 12.0, "p99": 15.0},
            energy_joules=1.4,
        ),
        stress_report.ScenarioMetrics(
            name="b",
            total_requests=3,
            success=2,
            failures=1,
            duration_s=0.25,
            throughput_rps=7.0,
            latency_ms={"avg": 20.0, "p50": 18.0, "p95": 22.0, "p99": 25.0},
            energy_joules=0.7,
        ),
    ]

    report = stress_report.build_report(
        metrics,
        base_url="https://kolibri",
        iterations=5,
        concurrency=2,
        energy_per_request_joules=0.35,
    )

    assert report["totals"]["requests"] == 8
    assert report["totals"]["success"] == 6
    assert report["totals"]["failures"] == 2
    assert pytest.approx(report["totals"]["energy_joules"], rel=1e-6) == 2.1
    assert report["metadata"]["scenario_count"] == 2
    assert report["metadata"]["energy_per_request_joules"] == 0.35


def test_cli_writes_report_with_custom_scenarios(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    scenarios_path = tmp_path / "scenarios.json"
    scenarios_path.write_text(
        json.dumps(
            {
                "scenarios": [
                    {"name": "ok", "method": "GET", "path": "/ok"},
                    {"name": "post", "method": "POST", "path": "/submit", "payload": {"value": 1}},
                ]
            }
        ),
        encoding="utf-8",
    )

    class DummyClient:
        def __init__(self, *, base_url: str, timeout: float) -> None:
            self._base_url = base_url.rstrip("/")
            self._timeout = timeout

        async def __aenter__(self) -> "DummyClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def request(
            self,
            method: str,
            path: str,
            json: Any | None = None,
            headers: Any | None = None,
        ) -> httpx.Response:
            request = httpx.Request(method=method, url=f"{self._base_url}{path}")
            return httpx.Response(200, json={"received": json}, request=request)

    monkeypatch.setattr(stress_report.httpx, "AsyncClient", DummyClient)

    output_path = tmp_path / "report.json"

    exit_code = stress_report.run(
        [
            "--base-url",
            "https://kolibri",
            "--iterations",
            "2",
            "--concurrency",
            "1",
            "--energy-per-request",
            "0.5",
            "--scenarios",
            str(scenarios_path),
            "--output",
            str(output_path),
        ],
        monotonic=FakeMonotonic(step=0.2),
    )

    assert exit_code == 0
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["metadata"]["base_url"] == "https://kolibri"
    assert payload["metadata"]["scenario_count"] == 2
    assert payload["totals"]["requests"] == 4

