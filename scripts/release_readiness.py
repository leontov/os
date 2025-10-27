"""CLI for evaluating release readiness across the «Колибри ИИ» platform."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from release.readiness import (
    ReadinessCriteria,
    ReleaseReadinessReport,
    ServiceArtifact,
    evaluate_release,
)


def load_payload(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def dump_report(path: Path, report: ReleaseReadinessReport) -> None:
    payload = report.to_dict()
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def build_cli() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Evaluate release readiness against platform thresholds",
    )
    parser.add_argument(
        "input",
        type=Path,
        help="Path to JSON payload containing criteria and service artifacts",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write the evaluated readiness report as JSON",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print a textual summary to stdout",
    )
    return parser


def run(arguments: list[str] | None = None) -> ReleaseReadinessReport:
    parser = build_cli()
    args = parser.parse_args(arguments)

    payload = load_payload(args.input)
    version = str(payload.get("version", "0.0.0"))
    criteria = ReadinessCriteria.from_mapping(payload.get("criteria", {}))
    artifacts_payload = payload.get("artifacts", [])
    artifacts = [ServiceArtifact.from_mapping(item) for item in artifacts_payload]

    report = evaluate_release(version=version, criteria=criteria, artifacts=artifacts)

    if args.output is not None:
        dump_report(args.output, report)

    if args.summary:
        _print_summary(report)

    return report


def _print_summary(report: ReleaseReadinessReport) -> None:
    print(f"Release {report.version} status: {report.overall_status} (score={report.overall_score:.3f})")
    for service in report.services:
        print(f"- {service.artifact.name}: {service.status} (score={service.score:.3f})")
        for evaluation in service.evaluations:
            threshold_state = "configured" if evaluation.threshold_defined else "informational"
            if evaluation.passed:
                print(
                    f"    · {evaluation.metric}: ok, score={evaluation.score:.3f}, {threshold_state}"
                )
            else:
                reason = evaluation.reason or "threshold_breach"
                print(
                    f"    · {evaluation.metric}: FAIL ({reason}), score={evaluation.score:.3f}, {threshold_state}"
                )
        for blocker in service.blockers:
            print(f"    blocker: {blocker}")

    if report.blockers:
        print("Blocking issues detected:")
        for blocker in report.blockers:
            print(f"  - {blocker}")


def main() -> None:  # pragma: no cover - thin wrapper
    run()


if __name__ == "__main__":  # pragma: no cover
    main()

