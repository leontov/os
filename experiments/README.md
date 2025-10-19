# Experiments

Prototype scripts, research notebooks, and one-off tooling live under this directory. Nothing here is part of the production release pipeline. Subdirectories:

- `scripts/`: archived `.ks` snippets and temporary utilities used for manual validation.
- `auto_train.sh`, `llm_teacher.py`, `train_model.py`: machine learning experiments and fine-tuning helpers.
- `export_soak_results.sh`, `archive_cluster_results.sh`: support scripts for long-running soak tests.

Re-run or modify these scripts with care—they are intentionally decoupled from the automated CI pipeline.
