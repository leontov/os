# Evaluation Benchmarks

The files in this directory describe the curated benchmark suites that back the
`scripts/evaluate_model.py` harness. Each benchmark focuses on a different
capability of the Kolibri simulation stack:

- **numerical** &mdash; arithmetic and numeric prompt handling through the
  KolibriScript chat commands.
- **symbolic** &mdash; symbolic association recall and deterministic numeric
  projections.
- **swarm** &mdash; multi-node synchronisation routines and shared fitness gains.

Every benchmark definition (`*.json`) encodes the prompts to execute and the
fitness probes to run. The expected outputs produced by the current reference
implementation are tracked in `expected_results.json`. Updating the reference
values can be done locally via

```bash
python scripts/evaluate_model.py --update
```

The CI workflow reuses the same harness to detect regressions. Any deviation
beyond the thresholds stored in the benchmark definitions will cause the build
to fail.
