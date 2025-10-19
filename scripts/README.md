# Kolibri scripts

Kolibri operational tooling is grouped into four categories:

| Directory            | Purpose                                                        |
|----------------------|----------------------------------------------------------------|
| `build/`             | Build and packaging helpers (`build_wasm.sh`, `build_iso.sh`). |
| `deploy/`            | Environment provisioning and stack orchestration scripts.      |
| `ops/`               | Day-to-day maintenance utilities (lint, release checks, CI).    |
| `experiments/`       | Research prototypes and exploratory automation.                 |

Every Python script consumes the shared helpers from `scripts.utils.cli` to expose a
standard `--log-level` flag, configure logging, and optionally assert command/module
dependencies. To start a new script copy `templates/python_cli.py` and adjust the
metadata.

## Adding a new script

1. Pick the appropriate subdirectory (`build/`, `deploy/`, `ops/`, `experiments/`).
2. Copy `templates/python_cli.py` if you need a Python entry point with argument
   parsing, logging, and dependency checks pre-wired.
3. Document usage within the script header and keep behaviour idempotent—CI runs the
   tools directly.
4. Update this README when new categories or notable scripts appear.
