"""Coverage enforcement utility for the «Колибри ИИ» toolchain."""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, MutableMapping, Optional, Sequence


@dataclass(frozen=True)
class CoverageThresholds:
    """Minimum acceptable coverage values."""

    line: float
    branch: Optional[float] = None


@dataclass
class CoverageVerdict:
    """Result of checking the coverage report against thresholds."""

    passed: bool
    line_coverage: Optional[float]
    branch_coverage: Optional[float]
    violations: list[str]
    packages: Dict[str, Mapping[str, Any]]


def load_report(report_path: Path) -> Mapping[str, Any]:
    """Read and validate a coverage JSON report."""

    payload = json.loads(report_path.read_text(encoding="utf-8"))
    if "totals" not in payload or "files" not in payload:
        raise ValueError("coverage report must include `totals` and `files` sections")
    return payload


def _percent(value: Optional[float], total: Optional[float]) -> Optional[float]:
    if value is None or total in (None, 0):
        return None
    return round((value / total) * 100.0, 2)


def _extract_rate(source: Mapping[str, Any], percent_key: str, value_key: str, total_key: str) -> Optional[float]:
    percent = source.get(percent_key)
    if isinstance(percent, (int, float)):
        return round(float(percent), 2)
    value = source.get(value_key)
    total = source.get(total_key)
    return _percent(float(value) if value is not None else None, float(total) if total is not None else None)


def _aggregate_for_prefix(files: Mapping[str, Any], prefix: str) -> tuple[Optional[float], Optional[float]]:
    total_statements = 0.0
    covered_statements = 0.0
    total_branches = 0.0
    covered_branches = 0.0

    target = prefix.rstrip("/")

    for path, payload in files.items():
        normalised = path.replace("\\", "/")
        if not (normalised == target or normalised.startswith(f"{target}/")):
            continue
        summary = payload.get("summary", {})
        total_statements += float(summary.get("num_statements", 0) or 0)
        covered_statements += float(summary.get("covered_lines", 0) or 0)
        total_branches += float(summary.get("num_branches", 0) or 0)
        covered_branches += float(summary.get("covered_branches", 0) or 0)

    line_rate = _percent(covered_statements, total_statements)
    branch_rate = _percent(covered_branches, total_branches)
    return line_rate, branch_rate


def evaluate_coverage(
    report: Mapping[str, Any],
    thresholds: CoverageThresholds,
    package_thresholds: Optional[Mapping[str, CoverageThresholds]] = None,
) -> CoverageVerdict:
    """Check coverage metrics against configured thresholds."""

    totals = report.get("totals", {})
    files = report.get("files", {})

    global_line = _extract_rate(totals, "percent_covered", "covered_lines", "num_statements")
    global_branch = _extract_rate(totals, "percent_covered_branches", "covered_branches", "num_branches")

    violations: list[str] = []

    if global_line is None:
        violations.append("В отчёте отсутствует информация о покрытии строк.")
    elif global_line < thresholds.line:
        violations.append(
            f"Покрытие строк {global_line}% ниже целевого значения {thresholds.line}%."
        )

    if thresholds.branch is not None:
        if global_branch is None:
            violations.append("В отчёте отсутствуют данные о покрытии веток.")
        elif global_branch < thresholds.branch:
            violations.append(
                f"Покрытие веток {global_branch}% ниже целевого значения {thresholds.branch}%."
            )

    package_results: Dict[str, MutableMapping[str, Any]] = {}
    for prefix, pkg_threshold in (package_thresholds or {}).items():
        pkg_line, pkg_branch = _aggregate_for_prefix(files, prefix)
        passed = True
        pkg_violations: list[str] = []

        if pkg_line is None:
            pkg_violations.append("Недоступны данные о покрытии строк для пакета.")
            passed = False
        elif pkg_line < pkg_threshold.line:
            pkg_violations.append(
                f"Покрытие строк {pkg_line}% ниже требуемых {pkg_threshold.line}%."
            )
            passed = False

        branch_threshold = pkg_threshold.branch
        if branch_threshold is not None:
            if pkg_branch is None:
                pkg_violations.append("Недоступны данные о покрытии веток для пакета.")
                passed = False
            elif pkg_branch < branch_threshold:
                pkg_violations.append(
                    f"Покрытие веток {pkg_branch}% ниже требуемых {branch_threshold}%."
                )
                passed = False

        package_results[prefix] = {
            "line_coverage": pkg_line,
            "branch_coverage": pkg_branch,
            "thresholds": {
                "line": pkg_threshold.line,
                "branch": branch_threshold,
            },
            "passed": passed,
            "violations": pkg_violations,
        }

        if not passed:
            violations.append(f"Порог покрытия не выполнен для пакета `{prefix}`.")

    return CoverageVerdict(
        passed=not violations,
        line_coverage=global_line,
        branch_coverage=global_branch,
        violations=violations,
        packages=package_results,
    )


def _parse_package_thresholds(values: Iterable[str]) -> Dict[str, CoverageThresholds]:
    parsed: Dict[str, CoverageThresholds] = {}
    for raw in values:
        name, _, limits = raw.partition("=")
        if not name or not limits:
            raise ValueError(f"Некорректный формат пакета: {raw!r}")
        if ":" in limits:
            line_str, branch_str = limits.split(":", 1)
            thresholds = CoverageThresholds(line=float(line_str), branch=float(branch_str))
        else:
            thresholds = CoverageThresholds(line=float(limits), branch=None)
        parsed[name.strip()] = thresholds
    return parsed


def run(argv: Sequence[str] | None = None) -> int:
    """Entry point used by tests and console scripts."""

    parser = argparse.ArgumentParser(description="Проверка покрытия тестами против целевых порогов.")
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("coverage.json"),
        help="Путь к JSON-отчёту coverage (команда `coverage json`).",
    )
    parser.add_argument("--line-min", type=float, default=75.0, help="Минимальное покрытие строк в процентах.")
    parser.add_argument(
        "--branch-min",
        type=float,
        default=60.0,
        help="Минимальное покрытие веток в процентах (укажите 0, чтобы пропустить проверку).",
    )
    parser.add_argument(
        "--package-threshold",
        action="append",
        default=[],
        help="Дополнительные пороги в формате prefix=line[:branch]",
    )

    args = parser.parse_args(argv)

    thresholds = CoverageThresholds(
        line=args.line_min,
        branch=args.branch_min if args.branch_min > 0 else None,
    )
    package_thresholds = _parse_package_thresholds(args.package_threshold)

    report = load_report(args.report)
    verdict = evaluate_coverage(report, thresholds, package_thresholds)

    output = {
        "passed": verdict.passed,
        "line_coverage": verdict.line_coverage,
        "branch_coverage": verdict.branch_coverage,
        "violations": verdict.violations,
        "packages": verdict.packages,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if verdict.passed else 1


if __name__ == "__main__":  # pragma: no cover - CLI invocation guard
    raise SystemExit(run())
