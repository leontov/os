#!/usr/bin/env python3
"""Evaluation harness for KolibriSim prompt benchmarks."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.kolibri_sim import KolibriSim  # noqa: E402

DEFAULT_DEFINITIONS_DIR = ROOT / "docs" / "eval"
DEFAULT_BASELINE_PATH = DEFAULT_DEFINITIONS_DIR / "expected_results.json"


@dataclass
class BenchmarkRun:
    """Holds the runtime state for a single benchmark definition."""

    name: str
    definition_path: Path
    baseline: MutableMapping[str, Any]
    nodes: MutableMapping[str, KolibriSim]
    thresholds: Mapping[str, float]


def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _write_json(path: Path, payload: Mapping[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)


def _prepare_nodes(definition: Mapping[str, Any]) -> Dict[str, KolibriSim]:
    nodes_cfg = definition.get("nodes")
    if nodes_cfg:
        nodes = {}
        for entry in nodes_cfg:
            node_id = entry["id"]
            seed = int(entry.get("seed", 0))
            nodes[node_id] = KolibriSim(zerno=seed)
        return nodes
    seed = int(definition.get("seed", 0))
    return {"default": KolibriSim(zerno=seed)}


def _resolve_node_id(entry: Mapping[str, Any], nodes: Mapping[str, KolibriSim], fallback: str = "default") -> str:
    node_id = entry.get("node")
    if node_id is not None:
        return node_id
    if fallback in nodes:
        return fallback
    return next(iter(nodes))


def _apply_setup(run: BenchmarkRun, setup_entries: Iterable[Mapping[str, Any]]) -> None:
    for step in setup_entries:
        action = step["action"]
        node_id = _resolve_node_id(step, run.nodes)
        sim = run.nodes[node_id]
        if action == "teach":
            sim.obuchit_svjaz(step["stimulus"], step["response"])
        elif action == "seed_tournament":
            sim.zapustit_turniry(int(step.get("rounds", 1)))
        else:
            raise ValueError(f"Unsupported setup action: {action}")


def _run_case(run: BenchmarkRun, case: Mapping[str, Any]) -> str:
    action = case["action"]
    if action == "sync":
        source_id = case["source"]
        target_id = case["target"]
        imported = run.nodes[target_id].sinhronizaciya(run.nodes[source_id].vzjat_sostoyanie())
        return str(imported)

    node_id = _resolve_node_id(case, run.nodes)
    sim = run.nodes[node_id]

    if action == "ask":
        return sim.sprosit(case["stimulus"])
    if action == "chat":
        return sim.dobrovolnaya_otpravka(case["command"], case["argument"])
    if action == "digits":
        count = int(case.get("count", 0))
        digits = sim.massiv_cifr(count)
        return " ".join(str(value) for value in digits)
    if action == "sync":
        source_id = case["source"]
        target_id = case["target"]
        imported = run.nodes[target_id].sinhronizaciya(run.nodes[source_id].vzjat_sostoyanie())
        return str(imported)
    raise ValueError(f"Unsupported case action: {action}")


def _run_fitness_probe(run: BenchmarkRun, probe: Mapping[str, Any]) -> Dict[str, float]:
    node_id = _resolve_node_id(probe, run.nodes)
    sim = run.nodes[node_id]
    context = probe["context"]
    success = float(probe["success"])
    formula_name = sim.evolyuciya_formul(context)
    before = sim.formuly[formula_name]["fitness"]
    after = sim.ocenit_formulu(formula_name, success)
    delta = after - before
    return {"after": after, "delta": delta}


def _ensure_baseline_section(baseline: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    section = baseline.get(key)
    if section is None:
        section = {}
        baseline[key] = section
    return section  # type: ignore[return-value]


def _compare_case(
    *,
    case_id: str,
    observed: str,
    expected_cases: MutableMapping[str, Any],
    update: bool,
) -> tuple[bool, str]:
    expected = expected_cases.get(case_id)
    if expected is None:
        if not update:
            raise KeyError(f"Missing expected output for case '{case_id}'")
        expected = observed
        expected_cases[case_id] = expected
    match = observed == expected
    if update:
        expected_cases[case_id] = observed
    return match, str(expected)


def _compare_fitness(
    *,
    probe_id: str,
    observed: Mapping[str, float],
    expected_fitness: MutableMapping[str, Any],
    update: bool,
) -> tuple[float, Dict[str, float]]:
    baseline_entry = expected_fitness.get(probe_id)
    if baseline_entry is None:
        if not update:
            raise KeyError(f"Missing expected fitness for probe '{probe_id}'")
        baseline_entry = {"after": observed["after"], "delta": observed["delta"]}
        expected_fitness[probe_id] = baseline_entry
    if update:
        expected_fitness[probe_id] = {"after": observed["after"], "delta": observed["delta"]}
    return float(baseline_entry["delta"]), {"after": float(baseline_entry["after"]), "delta": float(baseline_entry["delta"]) }


def _load_baseline(path: Path, *, update: bool) -> Dict[str, Any]:
    if path.exists():
        return _load_json(path)
    if update:
        return {}
    raise FileNotFoundError(f"Baseline file '{path}' not found. Run with --update to create it.")


def evaluate_benchmarks(
    definitions_dir: Path,
    baseline_path: Path,
    *,
    update: bool,
) -> tuple[Dict[str, Any], List[str]]:
    baseline = _load_baseline(baseline_path, update=update)
    report: Dict[str, Any] = {"benchmarks": []}
    failures: List[str] = []

    definition_files = sorted(
        path for path in definitions_dir.glob("*.json") if path.name != baseline_path.name
    )

    for definition_path in definition_files:
        definition = _load_json(definition_path)
        name = definition["name"]
        threshold_values = definition.get("thresholds", {})
        benchmark_baseline = _ensure_baseline_section(baseline, name)
        cases_baseline = _ensure_baseline_section(benchmark_baseline, "cases")
        fitness_baseline = _ensure_baseline_section(benchmark_baseline, "fitness")
        metrics_baseline = _ensure_baseline_section(benchmark_baseline, "metrics")

        run = BenchmarkRun(
            name=name,
            definition_path=definition_path,
            baseline=benchmark_baseline,
            nodes=_prepare_nodes(definition),
            thresholds=threshold_values,
        )

        _apply_setup(run, definition.get("setup", []))

        case_results: Dict[str, Dict[str, Any]] = {}
        correct = 0
        cases = definition.get("cases", [])
        for case in cases:
            case_id = case["id"]
            observed = _run_case(run, case)
            match, expected = _compare_case(
                case_id=case_id,
                observed=observed,
                expected_cases=cases_baseline,
                update=update,
            )
            if match:
                correct += 1
            else:
                failures.append(
                    f"{name}:{case_id} output mismatch (expected='{expected}' observed='{observed}')"
                )
            case_results[case_id] = {"observed": observed, "expected": expected, "match": match}

        accuracy = (correct / len(cases)) if cases else 1.0

        fitness_results: Dict[str, Dict[str, float]] = {}
        fitness_probes = definition.get("fitness_cases", [])
        deltas: List[float] = []
        for probe in fitness_probes:
            probe_id = probe["id"]
            observed = _run_fitness_probe(run, probe)
            baseline_delta, baseline_entry = _compare_fitness(
                probe_id=probe_id,
                observed=observed,
                expected_fitness=fitness_baseline,
                update=update,
            )
            deltas.append(observed["delta"])
            fitness_results[probe_id] = {
                "observed_after": observed["after"],
                "observed_delta": observed["delta"],
                "expected_after": baseline_entry["after"],
                "expected_delta": baseline_entry["delta"],
                "delta_regression": baseline_delta - observed["delta"],
            }

        fitness_delta = (sum(deltas) / len(deltas)) if deltas else 0.0

        metrics = {
            "accuracy": accuracy,
            "fitness_delta": fitness_delta,
        }
        if update:
            metrics_baseline["accuracy"] = accuracy
            metrics_baseline["fitness_delta"] = fitness_delta

        else:
            baseline_accuracy = float(metrics_baseline.get("accuracy", accuracy))
            baseline_fitness = float(metrics_baseline.get("fitness_delta", fitness_delta))
            acc_drop = baseline_accuracy - accuracy
            fit_drop = baseline_fitness - fitness_delta
            max_acc_drop = float(run.thresholds.get("max_accuracy_regression", 0.0))
            max_fit_drop = float(run.thresholds.get("max_fitness_delta_regression", 0.0))
            if acc_drop > max_acc_drop + 1e-9:
                failures.append(
                    f"{name}: accuracy regression {acc_drop:.4f} exceeds allowed {max_acc_drop:.4f}"
                )
            if fit_drop > max_fit_drop + 1e-9:
                failures.append(
                    f"{name}: fitness delta regression {fit_drop:.4f} exceeds allowed {max_fit_drop:.4f}"
                )

        report["benchmarks"].append(
            {
                "name": name,
                "definition": str(definition_path.relative_to(ROOT)),
                "metrics": metrics,
                "cases": case_results,
                "fitness_probes": fitness_results,
            }
        )

    if update:
        _write_json(baseline_path, baseline)

    return report, failures


def main() -> None:
    parser = argparse.ArgumentParser(description="Run KolibriSim evaluation benchmarks")
    parser.add_argument(
        "--definitions",
        type=Path,
        default=DEFAULT_DEFINITIONS_DIR,
        help="Directory with benchmark definition JSON files.",
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=DEFAULT_BASELINE_PATH,
        help="Path to the expected results JSON file.",
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Refresh the baseline file with the current evaluation results.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        help="Optional path to write the JSON report.",
    )
    args = parser.parse_args()

    report, failures = evaluate_benchmarks(args.definitions, args.baseline, update=args.update)

    if args.report:
        _write_json(args.report, report)
    else:
        json.dump(report, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
        sys.stdout.write("\n")

    if failures and not args.update:
        for message in failures:
            print(message, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
