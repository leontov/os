# Kolibri Security & Licensing Policy / Политика безопасности и лицензирования

## 1. Dependency Management / Управление зависимостями

- Python:
  ```bash
  source .venv/bin/activate
  pip list --outdated
  pip-licenses --format=markdown --with-urls
  ```
  Update pinned versions in `requirements.txt` quarterly or when security
  advisories are published.

- Node.js:
  ```bash
  npm audit --prefix frontend
  npm outdated --prefix frontend
  ```
  Apply patches in ≤7 days for high severity CVEs, ≤30 days for medium severity.

- C/C++ toolchain: track `glibc`, `openssl`, and `libssl` advisories for Docker
  base images. Bump base images monthly.

## 2. Licensing / Лицензирование

- Maintain SPDX headers in source files (existing copyright line).
- Generate license inventory:
  ```bash
  pip-licenses > docs/licenses/python.md
  npm ls --prefix frontend --json > docs/licenses/npm.json
  ```
- Ensure third-party components comply with “build: ours / code: ours / docs: ours”
  policy; avoid copyleft libraries that conflict with commercial licensing.

## 3. Vulnerability Response / Реагирование на уязвимости

1. Intake via `security@kolibri.example` or private GitHub advisory.
2. Acknowledge reporter within 24 hours, triage severity (Critical/High/Medium/Low).
3. Produce fix and release patch within:
   - Critical: 48 hours
   - High: 7 days
   - Medium: 30 days
   - Low: next scheduled release
4. Publish security advisory in changelog and notify customers.

## 4. Secrets Management / Управление секретами

- No plaintext secrets in repo. Use `.env.example` templates referencing external
  secret managers (Vault, AWS Secrets Manager, GCP Secret Manager).
- CI integrates secret scanning (`scripts/policy_validate.py` + gitleaks).
- Production secrets stored in HSM-backed vault; access logged and rotated at
  least every 90 days.

## 5. Hardening / Укрепление

- Containers run as non-root user; reduce capabilities via `--cap-drop=ALL`.
- Enable mTLS between Kolibri nodes where clusters span multiple hosts.
- Use `kolibri_node --verify-genome` at boot to detect tampering.

## 6. Audit Trail / Аудит

- Keep signed release manifests (`deploy/release-manifests/`).
- Retain CI logs for minimum 12 months.
- Annual third-party penetration test; track remediation in internal tracker.

