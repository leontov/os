# AGENTS Guidelines for Kolibri OS Repository

## Copyright
Copyright (c) 2025 Кочуров Владислав Евгеньевич. All contributions must preserve this notice in every source file header where it already exists and include it in new source files when appropriate.

## General Workflow
- Work directly on the `main` branch; do not create additional branches.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`) when committing.
- Keep the working tree clean before finishing a task.

## Code Style & Conventions
- **Language Standard**: C sources target ANSI C11 with minimal external dependencies.
- **Headers**: Place shared declarations under `backend/include/kolibri/`. Maintain include guards using the `KOLIBRI_<NAME>_H` pattern.
- **Formatting**: Follow `clang-format` defaults compatible with LLVM style. Avoid trailing whitespace.
- **Error Handling**: Prefer explicit return codes over silent failures. Log meaningful error messages via the existing logging utilities.
- **Determinism**: Randomized routines must accept a seed and remain reproducible across runs.

## Testing & Tooling
- Always build with `make` and execute `make test` after modifying code under `backend/` or `apps/`.
- Run `./kolibri.sh up` to validate orchestration scripts when they are touched.
- Execute the relevant linters: `clang-tidy` for C sources, `npm run lint` / `npm run test` for frontend code (when present).
- Property-based tests (e.g., RapidCheck) must accompany new deterministic logic where feasible.

## Documentation & Specs
- Update `README.md` and files in `docs/` whenever CLI usage, API contracts, or protocol behaviour changes.
- Keep documentation multilingual where applicable (Russian, English, Chinese sections).
- Cite experimental logs and artefacts in `docs/kolibri_integrated_prototype.md` when referencing new results.

## Networking & Security
- Swarm protocol changes must include binary framing diagrams and integration tests under `tests/`.
- Never commit credentials, secrets, or real-world dataset snapshots.

## Project Structure Notes
- `backend/` contains the Kolibri core (decimal cognition, genome chain, formula evolution, networking).
- `apps/kolibri_node.c` is the reference CLI; ensure new options have help text and tests.
- `tests/` holds unit and property tests; mirror new modules with matching test files.
- `docs/` is authoritative for research papers, concept manifests, and roadmap material.

