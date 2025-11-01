"""CLI for generating marketing launch artefacts for «Колибри ИИ»."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


from go_to_market import build_launch_plan, calculate_metric_report, load_launch_config
from go_to_market.playbook import serialise_plan


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan_parser = subparsers.add_parser(
        "plan", help="generate a launch plan JSON payload"
    )
    plan_parser.add_argument("--config", type=Path, help="path to launch JSON config")

    metrics_parser = subparsers.add_parser(
        "metrics", help="evaluate progress against launch targets"
    )
    metrics_parser.add_argument(
        "--config", type=Path, help="path to launch JSON config"
    )
    metrics_parser.add_argument(
        "--observations",
        type=Path,
        help="path to JSON file with metric observations",
        required=True,
    )

    return parser.parse_args(argv)


def run(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    config_payload = load_launch_config(getattr(args, "config", None))
    plan = build_launch_plan(config_payload)

    if args.command == "plan":
        print(json.dumps(serialise_plan(plan), ensure_ascii=False, indent=2))
        return 0

    observations = json.loads(args.observations.read_text(encoding="utf-8"))
    if not isinstance(observations, dict):
        raise ValueError("Наблюдения по метрикам должны быть JSON-объектом")

    report = calculate_metric_report(plan, observations)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(run())
