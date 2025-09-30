#!/usr/bin/env python3
"""Длительные прогоны KolibriSim с сохранением состояния и метрик."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import List, Optional, Sequence

from core.kolibri_sim import KolibriSim, MetricEntry, SoakState, obnovit_soak_state


def zapisat_csv(path: Path, metrika: Sequence[MetricEntry]) -> None:
    """Сохраняет метрики прогона в CSV."""
    fieldnames = ["minute", "formula", "fitness", "genome"]
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for zapis in metrika:
            writer.writerow({pole: zapis.get(pole) for pole in fieldnames})


def main() -> int:
    parser = argparse.ArgumentParser(description="Kolibri soak runner")
    parser.add_argument("--hours", type=float, default=4.0, help="длительность чанка в часах")
    parser.add_argument(
        "--minutes",
        type=int,
        default=None,
        help="длительность чанка в минутах (приоритетнее, чем часы)",
    )
    parser.add_argument("--resume", action="store_true", help="сохранять и продолжать существующее состояние")
    parser.add_argument("--state-path", default="soak_state.json", help="путь к файлу состояния")
    parser.add_argument("--metrics-path", default=None, help="путь к CSV с метриками")
    parser.add_argument("--log-dir", type=Path, default=None, help="каталог для JSONL-журналов")
    parser.add_argument(
        "--keep-genome",
        action="store_true",
        help="сохранять снимок генома в каталоге журналов",
    )
    parser.add_argument("--seed", type=int, default=0, help="зерно генератора KolibriSim")
    args = parser.parse_args()

    minuti = args.minutes if args.minutes is not None else max(1, int(args.hours * 60))
    state_path = Path(args.state_path)
    if not args.resume and state_path.exists():
        state_path.unlink()

    log_dir = Path(args.log_dir) if args.log_dir is not None else Path("logs")
    trace_path = log_dir / f"kolibri_seed{args.seed}_events.jsonl"

    sim = KolibriSim(
        zerno=args.seed,
        trace_path=trace_path,
        trace_include_genome=args.keep_genome,
    )

    rezultat: SoakState = obnovit_soak_state(state_path, sim, minuti)
    metrics_value = rezultat.get("metrics")
    if metrics_value is None:
        metrics_list: List[MetricEntry] = []
    else:
        metrics_list = metrics_value
    recent_metrics = metrics_list[-minuti:]

    if args.metrics_path:
        zapisat_csv(Path(args.metrics_path), recent_metrics)

    genome_path: Optional[Path] = None
    if args.keep_genome:
        log_dir.mkdir(parents=True, exist_ok=True)
        genome_path = log_dir / f"kolibri_seed{args.seed}_genome.json"
        genome_path.write_text(
            json.dumps(sim.poluchit_genom_slovar(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    events_value = rezultat.get("events")
    events_count = events_value if isinstance(events_value, int) else 0

    print(
        json.dumps(
            {
                "minutes": minuti,
                "events": events_count,
                "metrics_written": len(recent_metrics),
                "state_path": str(state_path),
                "trace_path": str(sim.poluchit_trace_path() or trace_path),
                "genome_path": str(genome_path) if genome_path else None,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
