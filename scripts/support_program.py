"""CLI utilities for the «Колибри ИИ» customer support program."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from support import load_program, parse_response_log, evaluate_sla


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    catalog_parser = subparsers.add_parser(
        "catalog", help="output the support scenarios catalog"
    )
    catalog_parser.add_argument("--config", type=Path, help="optional program config")

    evaluate_parser = subparsers.add_parser(
        "evaluate", help="evaluate SLA compliance from response logs"
    )
    evaluate_parser.add_argument("--config", type=Path, help="optional program config")
    evaluate_parser.add_argument(
        "--responses",
        type=Path,
        required=True,
        help="JSON file with response metrics",
    )

    return parser.parse_args(argv)


def run(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    program = load_program(getattr(args, "config", None))

    if args.command == "catalog":
        payload = {
            "tiers": [
                {
                    "name": tier.name,
                    "sla_hours": tier.sla_hours,
                    "channels": list(tier.channels),
                }
                for tier in program.tiers
            ],
            "scenarios": [
                {
                    "title": scenario.title,
                    "criticality": scenario.criticality,
                    "recommended_tier": scenario.recommended_tier,
                    "playbook": scenario.playbook,
                }
                for scenario in program.scenarios
            ],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    log_payload = json.loads(args.responses.read_text(encoding="utf-8"))
    if not isinstance(log_payload, list):
        raise ValueError("Логи поддержки должны быть JSON-массивом")

    entries = parse_response_log(log_payload)
    report = [
        {
            "tier": summary.tier,
            "tickets": summary.tickets,
            "response_compliance": summary.response_compliance,
            "resolution_compliance": summary.resolution_compliance,
            "response_p50": summary.response_p50,
            "response_p90": summary.response_p90,
            "resolution_p50": summary.resolution_p50,
            "resolution_p90": summary.resolution_p90,
        }
        for summary in evaluate_sla(program, entries)
    ]
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(run())
