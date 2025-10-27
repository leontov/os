"""Проектный агрегатор здоровья платформы «Колибри ИИ».

Модуль консолидирует результаты существующих инструментов наблюдаемости,
качества и надёжности, а также добавляет слой аналитики: взвешивание
секций, сравнение с базовыми отчётами и генерацию Markdown-таблиц для
продуктовых рассылок. Благодаря чистой реализации на Python модуль
остаётся пригодным для импортов в тестах и внешних утилитах.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from scripts import coverage_guard, release_pipeline, stress_report


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _score_label(score: float) -> str:
    if score >= 90.0:
        return "stellar"
    if score >= 75.0:
        return "strong"
    if score >= 50.0:
        return "attention"
    return "critical"


@dataclass(frozen=True)
class CoverageTargets:
    """Нормативы покрытия для отчёта здоровья."""

    line: float = 90.0
    branch: float = 70.0

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any] | None) -> CoverageTargets:
        if payload is None:
            return cls()
        return cls(
            line=float(payload.get("line", cls.line)),
            branch=float(payload.get("branch", cls.branch)),
        )


@dataclass(frozen=True)
class StressTargets:
    """Целевые показатели нагрузочных тестов."""

    throughput_multiplier: float = 2.0
    energy_per_request: float = 0.35

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any] | None) -> StressTargets:
        if payload is None:
            return cls()
        return cls(
            throughput_multiplier=float(
                payload.get("throughput_multiplier", cls.throughput_multiplier)
            ),
            energy_per_request=float(
                payload.get("energy_per_request", cls.energy_per_request)
            ),
        )


@dataclass(frozen=True)
class AggregationConfig:
    """Конфигурация агрегатора здоровья."""

    weights: Mapping[str, float]
    coverage_targets: CoverageTargets
    stress_targets: StressTargets
    release_scores: Mapping[str, float]

    @staticmethod
    def default() -> AggregationConfig:
        return AggregationConfig(
            weights={
                "coverage": 0.35,
                "dependencies": 0.2,
                "stress": 0.25,
                "release": 0.2,
            },
            coverage_targets=CoverageTargets(),
            stress_targets=StressTargets(),
            release_scores={
                release_pipeline.StageStatus.PASSED: 100.0,
                release_pipeline.StageStatus.FAILED: 30.0,
                "unknown": 40.0,
            },
        )

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> AggregationConfig:
        default = cls.default()
        weights = payload.get("weights", default.weights)
        release_scores = payload.get("release_scores", default.release_scores)
        return cls(
            weights={str(k): float(v) for k, v in weights.items()},
            coverage_targets=CoverageTargets.from_payload(payload.get("coverage_targets")),
            stress_targets=StressTargets.from_payload(payload.get("stress_targets")),
            release_scores={str(k).lower(): float(v) for k, v in release_scores.items()},
        )


def load_config(path: Path | None) -> AggregationConfig:
    if path is None:
        return AggregationConfig.default()
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise ValueError("Конфигурация агрегатора должна быть JSON-объектом.")
    return AggregationConfig.from_payload(payload)


@dataclass(frozen=True)
class HealthSection:
    name: str
    score: float
    status: str
    insights: tuple[str, ...]
    metrics: Mapping[str, Any]
    weight: float = 0.0
    delta: float | None = None

    def with_weight(self, weight: float) -> HealthSection:
        return replace(self, weight=weight)

    def with_delta(self, delta: float | None) -> HealthSection:
        return replace(self, delta=delta)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["insights"] = list(self.insights)
        payload["metrics"] = dict(self.metrics)
        return payload


@dataclass(frozen=True)
class HealthReport:
    sections: tuple[HealthSection, ...]
    overall_score: float
    status: str
    weights: Mapping[str, float]
    delta: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "overall": {
                "score": round(self.overall_score, 2),
                "status": self.status,
                "delta": None if self.delta is None else round(self.delta, 2),
                "sections": [section.name for section in self.sections],
                "weights": {k: round(v, 4) for k, v in self.weights.items()},
            },
            "sections": [section.to_dict() for section in self.sections],
        }


def _baseline_to_mapping(baseline: Mapping[str, Any] | Path | None) -> Mapping[str, Any] | None:
    if baseline is None:
        return None
    if isinstance(baseline, Path):
        payload = json.loads(baseline.read_text(encoding="utf-8"))
        if not isinstance(payload, Mapping):
            raise ValueError("Базовый отчёт должен быть JSON-объектом.")
        return payload
    return baseline


def _coverage_section(report_path: Path, targets: CoverageTargets) -> HealthSection:
    report = coverage_guard.load_report(report_path)
    verdict = coverage_guard.evaluate_coverage(
        report,
        coverage_guard.CoverageThresholds(line=0.0, branch=None),
    )

    line = verdict.line_coverage or 0.0
    branch = verdict.branch_coverage if verdict.branch_coverage is not None else line

    line_component = _clamp(line, 0.0, 100.0)
    branch_component = _clamp(branch, 0.0, 100.0)
    score = round(0.7 * line_component + 0.3 * branch_component, 2)

    insights: list[str] = []
    if line < targets.line:
        insights.append(
            "Повышайте покрытие строк: текущий уровень "
            f"{line:.2f}% при целевом ≥ {targets.line:.0f}%."
        )
    if branch < targets.branch:
        insights.append(
            "Расширьте покрытие веток: текущий уровень "
            f"{branch:.2f}% при целевом ≥ {targets.branch:.0f}%."
        )

    return HealthSection(
        name="coverage",
        score=score,
        status=_score_label(score),
        insights=tuple(insights),
        metrics={
            "line_coverage": round(line, 2),
            "branch_coverage": round(branch, 2),
            "thresholds": {
                "line": round(targets.line, 2),
                "branch": round(targets.branch, 2),
            },
        },
    )


def _dependency_section(report_path: Path) -> HealthSection:
    payload = json.loads(report_path.read_text(encoding="utf-8"))

    total = int(payload.get("total_dependencies", 0))
    duplicates = tuple(payload.get("duplicates", []))
    critical_focus = tuple(payload.get("critical_focus", []))

    score = 100.0
    score -= len(duplicates) * 8.0
    score -= len(critical_focus) * 2.5
    score = round(_clamp(score, 0.0, 100.0), 2)

    insights: list[str] = []
    if duplicates:
        insights.append(
            "Удалите дублирующиеся зависимости: " + ", ".join(sorted(duplicates))
        )
    high_risk = [entry["name"] for entry in critical_focus]
    if high_risk:
        insights.append(
            "Пересмотрите критичные зависимости: " + ", ".join(sorted(high_risk))
        )

    return HealthSection(
        name="dependencies",
        score=score,
        status=_score_label(score),
        insights=tuple(insights),
        metrics={
            "total": total,
            "duplicates": list(duplicates),
            "critical_focus": list(critical_focus),
        },
    )


def _stress_section(report_path: Path, targets: StressTargets) -> HealthSection:
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    totals = payload.get("totals", {})
    metadata = payload.get("metadata", {})

    requests = float(totals.get("requests", 0) or 0)
    success = float(totals.get("success", 0) or 0)
    failures = float(totals.get("failures", 0) or 0)
    throughput = float(totals.get("avg_throughput_rps", 0.0) or 0.0)
    energy = float(totals.get("energy_joules", 0.0) or 0.0)

    concurrency = float(metadata.get("concurrency", 1) or 1)
    baseline_energy = float(
        metadata.get("energy_per_request_joules", targets.energy_per_request)
        or targets.energy_per_request
    )

    total_requests = max(requests, 1.0)
    success_rate = _clamp(success / total_requests, 0.0, 1.0)
    failure_rate = _clamp(failures / total_requests, 0.0, 1.0)
    throughput_target = max(concurrency * targets.throughput_multiplier, 1.0)
    throughput_ratio = _clamp(throughput / throughput_target, 0.0, 1.2)

    successful_requests = max(success, 1.0)
    actual_energy_per_request = energy / successful_requests
    if actual_energy_per_request <= 0:
        energy_ratio = 1.0
    else:
        energy_ratio = _clamp(baseline_energy / actual_energy_per_request, 0.0, 1.2)

    score = (
        success_rate * 60.0
        + _clamp(throughput_ratio, 0.0, 1.0) * 25.0
        + _clamp(energy_ratio, 0.0, 1.0) * 15.0
    )
    score = round(_clamp(score, 0.0, 100.0), 2)

    insights: list[str] = []
    if success_rate < 0.9:
        insights.append(
            f"Увеличьте стабильность сценариев: успешность {success_rate * 100:.1f}%"
        )
    if throughput_ratio < 0.75:
        insights.append(
            "Низкая пропускная способность: средний rps "
            f"{throughput:.2f} при целевом ≥ {throughput_target:.2f}."
        )
    if energy_ratio < 0.85:
        insights.append(
            "Оптимизируйте энергопотребление: фактическое значение "
            f"{actual_energy_per_request:.3f} J против ориентира {baseline_energy:.3f} J."
        )

    return HealthSection(
        name="stress",
        score=score,
        status=_score_label(score),
        insights=tuple(insights),
        metrics={
            "success_rate": round(success_rate * 100.0, 2),
            "failure_rate": round(failure_rate * 100.0, 2),
            "throughput_rps": round(throughput, 3),
            "energy_per_request": round(actual_energy_per_request, 4),
            "targets": {
                "throughput_rps": round(throughput_target, 2),
                "energy_per_request": round(baseline_energy, 4),
            },
        },
    )


def _release_section(report_path: Path, release_scores: Mapping[str, float]) -> HealthSection:
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    status = str(payload.get("status", "unknown")).lower()
    rollback = tuple(payload.get("rollback", []))
    skipped = tuple(payload.get("skipped_stages", []))

    score = release_scores.get(status)
    if score is None:
        if status == release_pipeline.StageStatus.FAILED and rollback:
            score = 25.0
        else:
            score = release_scores.get("unknown", 40.0)
    score = round(score, 2)

    insights: list[str] = []
    if rollback:
        insights.append(
            "Требуются действия по откату: " + ", ".join(rollback)
        )
    if skipped:
        insights.append(
            "Пропущенные стадии конвейера: " + ", ".join(skipped)
        )

    return HealthSection(
        name="release",
        score=score,
        status=_score_label(score),
        insights=tuple(insights),
        metrics={
            "status": status,
            "rollback": list(rollback),
            "skipped": list(skipped),
        },
    )


def aggregate_health(
    *,
    coverage_report: Path | None = None,
    dependency_report: Path | None = None,
    stress_report_path: Path | None = None,
    release_report: Path | None = None,
    config: AggregationConfig | None = None,
    baseline: Mapping[str, Any] | Path | None = None,
) -> HealthReport:
    cfg = config or AggregationConfig.default()
    baseline_payload = _baseline_to_mapping(baseline)
    sections: list[HealthSection] = []

    if coverage_report is not None:
        sections.append(_coverage_section(coverage_report, cfg.coverage_targets))
    if dependency_report is not None:
        sections.append(_dependency_section(dependency_report))
    if stress_report_path is not None:
        sections.append(_stress_section(stress_report_path, cfg.stress_targets))
    if release_report is not None:
        sections.append(_release_section(release_report, cfg.release_scores))

    if not sections:
        raise ValueError("Необходимо указать хотя бы один источник данных для отчёта.")

    section_weights: dict[str, float] = {}
    for section in sections:
        section_weights[section.name] = float(cfg.weights.get(section.name, 1.0))
    total_weight = sum(section_weights.values())
    if total_weight <= 0:
        equal_weight = 1.0 / len(sections)
        normalized_weights = {section.name: equal_weight for section in sections}
    else:
        normalized_weights = {
            name: weight / total_weight for name, weight in section_weights.items()
        }

    baseline_sections: Mapping[str, Any] | None = None
    baseline_overall: float | None = None
    if baseline_payload is not None:
        baseline_sections = {
            str(entry.get("name")): entry
            for entry in baseline_payload.get("sections", [])
            if isinstance(entry, Mapping)
        }
        overall_section = baseline_payload.get("overall", {})
        if isinstance(overall_section, Mapping):
            raw_score = overall_section.get("score")
            if raw_score is not None:
                baseline_overall = float(raw_score)

    enriched_sections: list[HealthSection] = []
    for section in sections:
        weighted = section.with_weight(round(normalized_weights[section.name], 6))
        if baseline_sections and section.name in baseline_sections:
            previous = baseline_sections[section.name]
            previous_score = previous.get("score")
            if previous_score is not None:
                delta = round(section.score - float(previous_score), 2)
                weighted = weighted.with_delta(delta)
        enriched_sections.append(weighted)

    overall_score = 0.0
    for section in enriched_sections:
        overall_score += section.score * normalized_weights[section.name]
    overall_score = round(overall_score, 2)

    overall_delta: float | None = None
    if baseline_overall is not None:
        overall_delta = round(overall_score - baseline_overall, 2)

    return HealthReport(
        sections=tuple(enriched_sections),
        overall_score=overall_score,
        status=_score_label(overall_score),
        weights={name: round(weight, 6) for name, weight in normalized_weights.items()},
        delta=overall_delta,
    )


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kolibri-project-health",
        description=(
            "Консолидированный отчёт о зрелости платформы Колибри: объединяет"
            " покрытие, аудит зависимостей, стресс-тесты и статус релиза."
        ),
    )
    parser.add_argument("--coverage", type=Path, help="Путь к JSON-отчёту coverage.json", nargs="?")
    parser.add_argument(
        "--dependencies",
        type=Path,
        help="Путь к JSON-отчёту scripts/dependency_audit.py",
        nargs="?",
    )
    parser.add_argument(
        "--stress",
        type=Path,
        help="Путь к JSON-отчёту scripts/stress_report.py",
        nargs="?",
    )
    parser.add_argument(
        "--release",
        type=Path,
        help="Путь к JSON-отчёту scripts/release_pipeline.py",
        nargs="?",
    )
    parser.add_argument(
        "--config",
        type=Path,
        help="Путь к JSON-файлу с весами и порогами агрегатора",
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        help="Базовый отчёт здоровья для расчёта дельт",
    )
    parser.add_argument(
        "--format",
        choices=["json", "markdown"],
        default="json",
        help="Формат вывода отчёта",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Файл для сохранения итогового JSON (по умолчанию вывод в STDOUT)",
    )
    return parser


def run(argv: Sequence[str] | None = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    coverage_path = args.coverage
    dependencies_path = args.dependencies
    stress_path = args.stress
    release_path = args.release

    try:
        cfg = load_config(args.config)
        report = aggregate_health(
            coverage_report=coverage_path,
            dependency_report=dependencies_path,
            stress_report_path=stress_path,
            release_report=release_path,
            config=cfg,
            baseline=args.baseline,
        )
    except FileNotFoundError as exc:
        parser.error(str(exc))
    except ValueError as exc:
        parser.error(str(exc))

    if args.format == "json":
        payload = json.dumps(report.to_dict(), ensure_ascii=False, indent=2, sort_keys=True)
    else:
        payload = render_markdown(report)

    if args.output is not None:
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)
    return 0


def main() -> None:  # pragma: no cover - CLI convenience wrapper
    raise SystemExit(run())


def render_markdown(report: HealthReport) -> str:
    """Сформировать Markdown-представление отчёта здоровья."""

    header = [
        "# Сводный отчёт здоровья платформы Колибри",
        "",
        f"**Итоговый балл:** {report.overall_score:.2f} ({report.status})",
    ]
    if report.delta is not None:
        trend_symbol = "▲" if report.delta >= 0 else "▼"
        header.append(f"**Изменение к базе:** {trend_symbol} {report.delta:+.2f} п.п.")
    header.append("")
    header.extend([
        "| Секция | Балл | Вес | Тренд | Ключевые инсайты |",
        "| --- | --- | --- | --- | --- |",
    ])

    for section in report.sections:
        if section.delta is None:
            delta_label = "—"
        else:
            symbol = "▲" if section.delta >= 0 else "▼"
            delta_label = f"{symbol} {section.delta:+.2f}"
        insights = section.insights or ("Поддерживайте текущее качество.",)
        insight_text = "<br/>".join(insights)
        header.append(
            "| {name} | {score:.2f} ({status}) | {weight:.2%} | {delta} | {insights} |".format(
                name=section.name,
                score=section.score,
                status=section.status,
                weight=section.weight,
                delta=delta_label,
                insights=insight_text,
            )
        )

    header.append("")
    header.append("_Отчёт сгенерирован утилитой `kolibri-project-health`._")
    return "\n".join(header)


__all__ = [
    "AggregationConfig",
    "CoverageTargets",
    "HealthReport",
    "HealthSection",
    "StressTargets",
    "aggregate_health",
    "load_config",
    "render_markdown",
    "run",
    "main",
]

