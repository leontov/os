#!/usr/bin/env python3
"""Utility for running evaluation scenarios and aggregating metrics.

This tool loads scenario definitions (JSON) describing BLEU, CodeEval and
MT-Bench style tasks.  Every task definition contains the necessary
information to run the evaluation locally without external services:

* BLEU tasks operate on collections of reference translations and model
  candidates.
* CodeEval tasks execute Python solutions against lightweight unit test
  definitions.
* MT-Bench tasks compare model conversations with reference responses using
  similarity heuristics.

The script can be hooked into CI by enforcing minimal thresholds for each
metric.  A non-zero exit code is returned when any aggregated score violates
its threshold.
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import statistics
import sys
from collections import Counter
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional

LOGGER = logging.getLogger("evaluate_model")


class ScenarioFormatError(RuntimeError):
    """Raised when a scenario file cannot be interpreted."""


@dataclass
class TaskResult:
    name: str
    task_type: str
    score: float
    details: Mapping[str, Any]
    source: Path


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run model evaluation scenarios and aggregate BLEU/CodeEval/MT-Bench metrics.",
    )
    parser.add_argument(
        "--scenario",
        "-s",
        action="append",
        required=True,
        help="Path to a JSON scenario file. Can be provided multiple times.",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Optional path for storing the aggregated JSON report.",
    )
    parser.add_argument(
        "--min-bleu",
        type=float,
        default=0.0,
        help="Minimum acceptable average BLEU score (0-100).",
    )
    parser.add_argument(
        "--min-codeeval",
        type=float,
        default=0.0,
        help="Minimum acceptable average CodeEval pass rate (0-1).",
    )
    parser.add_argument(
        "--min-mtbench",
        type=float,
        default=0.0,
        help="Minimum acceptable average MT-Bench similarity score (0-1).",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="count",
        default=0,
        help="Increase verbosity (use -vv for debug output).",
    )
    return parser.parse_args(argv)


def configure_logging(verbosity: int) -> None:
    level = logging.WARNING
    if verbosity == 1:
        level = logging.INFO
    elif verbosity >= 2:
        level = logging.DEBUG
    logging.basicConfig(level=level, format="[%(levelname)s] %(message)s")


def load_json(path: Path) -> Mapping[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError as exc:
        raise ScenarioFormatError(f"Scenario file '{path}' does not exist") from exc
    except json.JSONDecodeError as exc:
        raise ScenarioFormatError(f"Scenario file '{path}' is not valid JSON: {exc}") from exc


def _read_text_or_value(value: Any) -> str:
    if isinstance(value, str):
        candidate_path = Path(value)
        if candidate_path.exists() and candidate_path.is_file():
            LOGGER.debug("Loading text from %s", candidate_path)
            return candidate_path.read_text(encoding="utf-8").strip()
    if not isinstance(value, str):
        raise ScenarioFormatError(f"Expected string literal or file path, got {type(value)!r}")
    return value


def _ensure_list(value: Any, field: str) -> List[Any]:
    if not isinstance(value, list):
        raise ScenarioFormatError(f"Field '{field}' must be a list, got {type(value).__name__}")
    return value


def _tokenise(sentence: str) -> List[str]:
    return [token for token in sentence.strip().split() if token]


def _extract_ngrams(tokens: List[str], n: int) -> Counter:
    if n <= 0:
        raise ValueError("n must be positive")
    return Counter(tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1))


def _brevity_penalty(candidate_length: int, reference_lengths: List[int]) -> float:
    if candidate_length == 0:
        return 0.0
    reference_length = sum(reference_lengths)
    if candidate_length > reference_length:
        return 1.0
    return math.exp(1 - reference_length / candidate_length)


def compute_bleu_corpus(references: List[List[str]], candidates: List[str], max_order: int = 4) -> float:
    if not references or not candidates:
        raise ScenarioFormatError("BLEU tasks require non-empty references and candidates")
    if len(references) != len(candidates):
        raise ScenarioFormatError("Number of reference sets must match number of candidates")

    matches_by_order = [0 for _ in range(max_order)]
    possible_matches_by_order = [0 for _ in range(max_order)]
    candidate_length = 0
    reference_lengths: List[int] = []

    for idx, (ref_list, candidate) in enumerate(zip(references, candidates)):
        candidate_tokens = _tokenise(candidate)
        candidate_length += len(candidate_tokens)
        tokenised_refs = [_tokenise(ref) for ref in ref_list]
        best_ref_length = min(
            (len(ref_tokens) for ref_tokens in tokenised_refs),
            key=lambda ref_len: (abs(ref_len - len(candidate_tokens)), ref_len),
        )
        reference_lengths.append(best_ref_length)

        for n in range(1, max_order + 1):
            cand_ngrams = _extract_ngrams(candidate_tokens, n)
            possible_matches_by_order[n - 1] += sum(cand_ngrams.values())
            if not cand_ngrams:
                continue
            max_ref_counts: Counter = Counter()
            for ref_tokens in tokenised_refs:
                ref_ngrams = _extract_ngrams(ref_tokens, n)
                for ngram, count in ref_ngrams.items():
                    max_ref_counts[ngram] = max(max_ref_counts.get(ngram, 0), count)
            overlap = sum(min(count, max_ref_counts.get(ngram, 0)) for ngram, count in cand_ngrams.items())
            matches_by_order[n - 1] += overlap
            LOGGER.debug(
                "BLEU task item %d order %d: overlap=%s, possible=%s",
                idx,
                n,
                overlap,
                sum(cand_ngrams.values()),
            )

    precisions: List[float] = []
    for n in range(max_order):
        numerator = matches_by_order[n] + 1e-9
        denominator = possible_matches_by_order[n] + 1e-9
        precisions.append(numerator / denominator)

    if not any(possible_matches_by_order):
        return 0.0

    log_precisions = sum(math.log(p) for p in precisions) / max_order
    bp = _brevity_penalty(candidate_length, reference_lengths)
    bleu = bp * math.exp(log_precisions)
    return bleu * 100.0


def run_bleu_task(task: Mapping[str, Any], scenario_path: Path) -> TaskResult:
    items = _ensure_list(task.get("items"), "items")
    references: List[List[str]] = []
    candidates: List[str] = []

    for idx, item in enumerate(items):
        if not isinstance(item, Mapping):
            raise ScenarioFormatError(f"BLEU task items must be objects (index {idx})")
        ref_values = _ensure_list(item.get("references"), "references")
        references.append([_read_text_or_value(ref) for ref in ref_values])
        candidate_value = item.get("candidate")
        if candidate_value is None:
            raise ScenarioFormatError("BLEU task requires 'candidate'")
        candidates.append(_read_text_or_value(candidate_value))

    score = compute_bleu_corpus(references, candidates)
    return TaskResult(
        name=str(task.get("name", "bleu")),
        task_type="bleu",
        score=score,
        details={"items": len(items)},
        source=scenario_path,
    )


def run_code_eval_task(task: Mapping[str, Any], scenario_path: Path) -> TaskResult:
    entrypoint = task.get("entrypoint")
    if not isinstance(entrypoint, str) or not entrypoint:
        raise ScenarioFormatError("CodeEval task must provide a non-empty 'entrypoint' field")

    if "solution_file" in task:
        solution_code = _read_text_or_value(task["solution_file"])
    elif "solution" in task:
        solution_code = _read_text_or_value(task["solution"])
    else:
        raise ScenarioFormatError("CodeEval task requires 'solution' or 'solution_file'")

    tests = _ensure_list(task.get("tests"), "tests")
    if not tests:
        raise ScenarioFormatError("CodeEval task requires at least one test case")

    namespace: Dict[str, Any] = {}
    try:
        exec(solution_code, namespace)
    except Exception as exc:  # noqa: BLE001
        raise ScenarioFormatError(f"Unable to execute solution for CodeEval task: {exc}") from exc

    if entrypoint not in namespace or not callable(namespace[entrypoint]):
        raise ScenarioFormatError(f"Entrypoint '{entrypoint}' not found after executing solution")

    func = namespace[entrypoint]
    passed = 0

    for index, test_case in enumerate(tests):
        if not isinstance(test_case, Mapping):
            raise ScenarioFormatError(f"Test case #{index} must be an object")
        args = test_case.get("input", [])
        kwargs = test_case.get("kwargs", {})
        expected = test_case.get("expected")
        if not isinstance(args, list):
            raise ScenarioFormatError("CodeEval test 'input' must be a list of positional arguments")
        if not isinstance(kwargs, Mapping):
            raise ScenarioFormatError("CodeEval test 'kwargs' must be a mapping of keyword arguments")
        try:
            result = func(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("CodeEval task %s test #%d raised an exception: %s", task.get("name"), index, exc)
            continue
        if result == expected:
            passed += 1

    score = passed / len(tests)
    return TaskResult(
        name=str(task.get("name", "code_eval")),
        task_type="code_eval",
        score=score,
        details={"passed": passed, "total": len(tests)},
        source=scenario_path,
    )


def run_mt_bench_task(task: Mapping[str, Any], scenario_path: Path) -> TaskResult:
    conversations = _ensure_list(task.get("conversations"), "conversations")
    if not conversations:
        raise ScenarioFormatError("MT-Bench task requires at least one conversation")

    similarities: List[float] = []
    for index, convo in enumerate(conversations):
        if not isinstance(convo, Mapping):
            raise ScenarioFormatError(f"Conversation #{index} must be an object")
        response_value = convo.get("response")
        reference_value = convo.get("reference")
        if response_value is None or reference_value is None:
            raise ScenarioFormatError("Each MT-Bench conversation needs 'response' and 'reference'")
        response = _read_text_or_value(response_value)
        reference = _read_text_or_value(reference_value)
        similarity = SequenceMatcher(None, reference, response).ratio()
        similarities.append(similarity)
        LOGGER.debug(
            "MT-Bench conversation %d similarity %.3f (reference length %d, response length %d)",
            index,
            similarity,
            len(reference),
            len(response),
        )

    score = statistics.mean(similarities)
    return TaskResult(
        name=str(task.get("name", "mt_bench")),
        task_type="mt_bench",
        score=score,
        details={"conversations": len(conversations)},
        source=scenario_path,
    )


TASK_HANDLERS = {
    "bleu": run_bleu_task,
    "code_eval": run_code_eval_task,
    "mt_bench": run_mt_bench_task,
}


def run_scenario(path: Path) -> List[TaskResult]:
    LOGGER.info("Processing scenario %s", path)
    payload = load_json(path)
    tasks = _ensure_list(payload.get("tasks"), "tasks")
    results: List[TaskResult] = []

    for task in tasks:
        if not isinstance(task, Mapping):
            raise ScenarioFormatError("Each task entry must be an object")
        task_type = task.get("type")
        if task_type not in TASK_HANDLERS:
            raise ScenarioFormatError(
                f"Unsupported task type '{task_type}'. Supported types: {', '.join(TASK_HANDLERS)}"
            )
        handler = TASK_HANDLERS[task_type]
        result = handler(task, path)
        LOGGER.info("Task %s (%s) -> %.4f", result.name, result.task_type, result.score)
        results.append(result)

    return results


def aggregate_results(results: Iterable[TaskResult]) -> Mapping[str, Any]:
    per_metric: MutableMapping[str, List[float]] = {key: [] for key in TASK_HANDLERS}
    task_reports: List[Mapping[str, Any]] = []

    for result in results:
        per_metric[result.task_type].append(result.score)
        task_reports.append(
            {
                "name": result.name,
                "type": result.task_type,
                "score": result.score,
                "details": dict(result.details),
                "scenario": str(result.source),
            }
        )

    aggregates = {}
    for metric, values in per_metric.items():
        aggregates[metric] = statistics.mean(values) if values else None

    return {"tasks": task_reports, "aggregates": aggregates}


def enforce_thresholds(aggregates: Mapping[str, Optional[float]], args: argparse.Namespace) -> None:
    failures: List[str] = []

    bleu_score = aggregates.get("bleu")
    if bleu_score is not None and bleu_score < args.min_bleu:
        failures.append(f"BLEU {bleu_score:.2f} < {args.min_bleu:.2f}")

    code_eval_score = aggregates.get("code_eval")
    if code_eval_score is not None and code_eval_score < args.min_codeeval:
        failures.append(f"CodeEval {code_eval_score:.2f} < {args.min_codeeval:.2f}")

    mt_bench_score = aggregates.get("mt_bench")
    if mt_bench_score is not None and mt_bench_score < args.min_mtbench:
        failures.append(f"MT-Bench {mt_bench_score:.2f} < {args.min_mtbench:.2f}")

    if failures:
        raise SystemExit("; ".join(failures))


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    configure_logging(args.verbose)

    scenario_paths = [Path(item) for item in args.scenario]
    all_results: List[TaskResult] = []
    for path in scenario_paths:
        all_results.extend(run_scenario(path))

    summary = aggregate_results(all_results)

    LOGGER.info("Aggregated results: %s", summary["aggregates"])

    output = args.output
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("w", encoding="utf-8") as handle:
            json.dump(summary, handle, indent=2, ensure_ascii=False)
        LOGGER.info("Saved report to %s", output)

    print("=== Evaluation summary ===")
    for task in summary["tasks"]:
        print(f"- {task['name']} ({task['type']}): {task['score']:.4f}")
    print("Aggregates:")
    for metric, value in summary["aggregates"].items():
        if value is None:
            print(f"  * {metric}: n/a")
        else:
            print(f"  * {metric}: {value:.4f}")

    enforce_thresholds(summary["aggregates"], args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
