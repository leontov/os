"""Колибри: стресс-тестирование и отчёт по энергоэффективности.

Инструмент закрывает пункт Фазы 1 дорожной карты: развёртывание
стресс-тестирования и энергетических отчётов для ключевых сервисов.
Он выполняет асинхронные HTTP-сценарии, агрегирует латентность,
пропускную способность и оценивает энергопотребление, формируя JSON
отчёт для команд надёжности.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
import sys
from typing import Any, Callable, Iterable, Mapping, Sequence

import httpx


Number = float


@dataclass(frozen=True)
class Scenario:
    """HTTP-сценарий для стресс-тестирования."""

    name: str
    method: str
    path: str
    payload: Any | None = None
    headers: Mapping[str, str] | None = None

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> "Scenario":
        """Создать сценарий из произвольного словаря."""

        try:
            name = data["name"]
            path = data["path"]
        except KeyError as exc:  # pragma: no cover - defensive branch
            missing = exc.args[0]
            raise ValueError(f"Missing scenario field: {missing}") from exc

        method = str(data.get("method", "GET")).upper()
        payload = data.get("payload")
        headers = data.get("headers")
        return cls(name=name, method=method, path=path, payload=payload, headers=headers)


@dataclass(slots=True)
class ScenarioMetrics:
    """Результаты выполнения сценария."""

    name: str
    total_requests: int
    success: int
    failures: int
    duration_s: float
    throughput_rps: float
    latency_ms: Mapping[str, float]
    energy_joules: float

    def to_json_ready(self) -> dict[str, Any]:
        """Преобразовать данные в словарь для сериализации."""

        payload = asdict(self)
        payload["latency_ms"] = dict(self.latency_ms)
        return payload


DEFAULT_SCENARIOS: tuple[Scenario, ...] = (
    Scenario(name="health-check", method="GET", path="/health"),
)


def _positive_int(value: str) -> int:
    result = int(value)
    if result <= 0:
        raise argparse.ArgumentTypeError("Значение должно быть положительным целым числом")
    return result


def _positive_float(value: str) -> float:
    result = float(value)
    if result <= 0:
        raise argparse.ArgumentTypeError("Значение должно быть больше нуля")
    return result


def _percentile(sorted_values: Sequence[Number], percentile: float) -> float:
    """Интерполированный процентиль, возвращающий значение в исходных единицах."""

    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])

    index = (len(sorted_values) - 1) * (percentile / 100.0)
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return float(sorted_values[int(index)])

    fraction = index - lower
    lower_value = float(sorted_values[lower])
    upper_value = float(sorted_values[upper])
    return lower_value + (upper_value - lower_value) * fraction


async def _run_worker(
    client: httpx.AsyncClient,
    scenario: Scenario,
    iterations: int,
    monotonic: Callable[[], float],
) -> tuple[list[float], int, int]:
    """Выполнить часть запросов сценария и вернуть латентность и счётчики."""

    latencies: list[float] = []
    success = 0
    failures = 0

    for _ in range(iterations):
        start = monotonic()
        is_success = False
        try:
            response = await client.request(
                scenario.method,
                scenario.path,
                json=scenario.payload,
                headers=scenario.headers,
            )
            await response.aread()
            is_success = 200 <= response.status_code < 400
        except httpx.HTTPError:
            is_success = False
        finally:
            end = monotonic()
            latencies.append(max(0.0, end - start))
            if is_success:
                success += 1
            else:
                failures += 1

    return latencies, success, failures


async def execute_stress_test(
    client: httpx.AsyncClient,
    scenarios: Sequence[Scenario],
    *,
    iterations: int,
    concurrency: int,
    energy_per_request_joules: float,
    monotonic: Callable[[], float],
) -> list[ScenarioMetrics]:
    """Запустить стресс-тесты и вернуть собранные метрики."""

    if concurrency <= 0:
        raise ValueError("Concurrency must be > 0")
    if iterations <= 0:
        raise ValueError("Iterations must be > 0")

    results: list[ScenarioMetrics] = []

    for scenario in scenarios:
        per_worker = iterations // concurrency
        remainder = iterations % concurrency
        batches = [per_worker + (1 if index < remainder else 0) for index in range(concurrency)]
        batches = [batch for batch in batches if batch > 0]

        start_time = monotonic()
        workers = [
            _run_worker(client=client, scenario=scenario, iterations=batch, monotonic=monotonic)
            for batch in batches
        ]
        worker_results = await asyncio.gather(*workers)
        duration = max(0.0, monotonic() - start_time)

        latencies: list[float] = []
        success_total = 0
        failure_total = 0
        for worker_latencies, worker_success, worker_failures in worker_results:
            latencies.extend(worker_latencies)
            success_total += worker_success
            failure_total += worker_failures

        latencies.sort()
        latency_avg_ms = (sum(latencies) / len(latencies) * 1000.0) if latencies else 0.0
        latency_p50_ms = _percentile(latencies, 50.0) * 1000.0
        latency_p95_ms = _percentile(latencies, 95.0) * 1000.0
        latency_p99_ms = _percentile(latencies, 99.0) * 1000.0
        total_requests = success_total + failure_total
        throughput = (success_total / duration) if duration > 0 else 0.0
        energy = success_total * energy_per_request_joules

        metrics = ScenarioMetrics(
            name=scenario.name,
            total_requests=total_requests,
            success=success_total,
            failures=failure_total,
            duration_s=duration,
            throughput_rps=throughput,
            latency_ms={
                "avg": latency_avg_ms,
                "p50": latency_p50_ms,
                "p95": latency_p95_ms,
                "p99": latency_p99_ms,
            },
            energy_joules=energy,
        )
        results.append(metrics)

    return results


def build_report(
    metrics: Sequence[ScenarioMetrics],
    *,
    base_url: str,
    iterations: int,
    concurrency: int,
    energy_per_request_joules: float,
) -> dict[str, Any]:
    """Собрать итоговый JSON-отчёт."""

    total_requests = sum(item.total_requests for item in metrics)
    total_success = sum(item.success for item in metrics)
    total_failures = sum(item.failures for item in metrics)
    total_energy = sum(item.energy_joules for item in metrics)
    total_duration = sum(item.duration_s for item in metrics)
    aggregate_throughput = (total_success / total_duration) if total_duration > 0 else 0.0

    return {
        "metadata": {
            "base_url": base_url,
            "iterations": iterations,
            "concurrency": concurrency,
            "energy_per_request_joules": energy_per_request_joules,
            "scenario_count": len(metrics),
        },
        "scenarios": [item.to_json_ready() for item in metrics],
        "totals": {
            "requests": total_requests,
            "success": total_success,
            "failures": total_failures,
            "energy_joules": total_energy,
            "avg_throughput_rps": aggregate_throughput,
        },
    }


def _load_scenarios_from_file(path: Path) -> list[Scenario]:
    """Загрузить сценарии из JSON-файла."""

    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, Mapping) and "scenarios" in raw:
        payload: Any = raw["scenarios"]
    else:
        payload = raw

    if isinstance(payload, (str, bytes)) or not isinstance(payload, Iterable):
        raise ValueError("Scenarios payload must be a list of definitions")

    scenarios: list[Scenario] = []
    for item in payload:
        if not isinstance(item, Mapping):
            raise ValueError("Scenario definition must be a mapping")
        scenarios.append(Scenario.from_mapping(item))
    return scenarios


def _build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kolibri-stress-report",
        description=(
            "Асинхронный стресс-тест Kolibri: измерение латентности, "
            "пропускной способности и оценка энергопотребления."
        ),
    )
    parser.add_argument("--base-url", required=True, help="Базовый URL сервиса Kolibri")
    parser.add_argument(
        "--iterations",
        type=_positive_int,
        default=25,
        help="Количество запросов на сценарий (по умолчанию 25)",
    )
    parser.add_argument(
        "--concurrency",
        type=_positive_int,
        default=5,
        help="Количество одновременных запросов (по умолчанию 5)",
    )
    parser.add_argument(
        "--energy-per-request",
        type=_positive_float,
        default=0.35,
        help="Оценка энергии в джоулях на успешный запрос",
    )
    parser.add_argument(
        "--timeout",
        type=_positive_float,
        default=10.0,
        help="Таймаут HTTP-запроса в секундах",
    )
    parser.add_argument(
        "--scenarios",
        type=Path,
        help="Путь к JSON со списком сценариев (если не указан, используется /health)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Путь к файлу отчёта (если не указан, вывод в STDOUT)",
    )
    return parser


async def _async_main(
    args: argparse.Namespace,
    *,
    monotonic: Callable[[], float],
) -> dict[str, Any]:
    scenarios = (
        _load_scenarios_from_file(args.scenarios)
        if args.scenarios is not None
        else list(DEFAULT_SCENARIOS)
    )

    async with httpx.AsyncClient(base_url=args.base_url, timeout=args.timeout) as client:
        metrics = await execute_stress_test(
            client,
            scenarios,
            iterations=args.iterations,
            concurrency=args.concurrency,
            energy_per_request_joules=args.energy_per_request,
            monotonic=monotonic,
        )

    return build_report(
        metrics,
        base_url=args.base_url,
        iterations=args.iterations,
        concurrency=args.concurrency,
        energy_per_request_joules=args.energy_per_request,
    )


def run(
    argv: Sequence[str] | None = None,
    *,
    monotonic: Callable[[], float] | None = None,
) -> int:
    """Входная точка CLI. Возвращает код выхода."""

    parser = _build_argument_parser()
    args = parser.parse_args(argv)

    try:
        if monotonic is None:
            import time

            monotonic_fn = time.perf_counter
        else:
            monotonic_fn = monotonic

        report = asyncio.run(_async_main(args, monotonic=monotonic_fn))
    except ValueError as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        return 2

    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output is not None:
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)
    return 0


def main() -> None:  # pragma: no cover - CLI entrypoint convenience
    raise SystemExit(run())


__all__ = [
    "Scenario",
    "ScenarioMetrics",
    "DEFAULT_SCENARIOS",
    "execute_stress_test",
    "build_report",
    "run",
]

