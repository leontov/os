#!/usr/bin/env python3
"""Длительные прогоны KolibriSim с сохранением состояния и метрик."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import List

from core.kolibri_sim import KolibriSim, obnovit_soak_state


def zapisat_csv(path: Path, metrika: List[dict]) -> None:
    """Сохраняет метрики прогона в CSV."""
    if not metrika:
        path.write_text("minute,formula,fitness,genome\n", encoding="utf-8")
        return
    fieldnames = ["minute", "formula", "fitness", "genome"]
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for zapis in metrika:
            writer.writerow({pole: zapis.get(pole) for pole in fieldnames})


def main() -> int:
    parser = argparse.ArgumentParser(description="Kolibri soak runner")
    parser.add_argument("--hours", type=float, default=4.0, help="длительность чанка в часах")
    parser.add_argument("--minutes", type=int, default=None, help="длительность чанка в минутах (приоритетнее, чем часы)")
    parser.add_argument("--resume", action="store_true", help="сохранять и продолжать существующее состояние")
    parser.add_argument("--state-path", default="soak_state.json", help="путь к файлу состояния")
    parser.add_argument("--metrics-path", default=None, help="путь к CSV с метриками")
    parser.add_argument("--seed", type=int, default=0, help="зерно генератора KolibriSim")
    args = parser.parse_args()

    minuti = args.minutes if args.minutes is not None else max(1, int(args.hours * 60))
    state_path = Path(args.state_path)
    if not args.resume and state_path.exists():
        state_path.unlink()

    sim = KolibriSim(zerno=args.seed)
    rezultat = obnovit_soak_state(state_path, sim, minuti)
    metrika = rezultat.get("metrics", [])[-minuti:]

    if args.metrics_path:
        zapisat_csv(Path(args.metrics_path), metrika)

    print(json.dumps({
        "minutes": minuti,
        "events": rezultat.get("events", 0),
        "metrics_written": len(metrika),
        "state_path": str(state_path),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
