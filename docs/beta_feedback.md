# Kolibri Beta Feedback Log / Журнал обратной связи бета-тестирования

**Временное окно:** 2025-10-18 — 2025-10-29  \
**Координатор:** Анастасия Литвинова (Product Ops)

## 1. Participants / Участники

| Team | Testers | Focus |
|------|---------|-------|
| Core Engineering | Sergey K. (runtime), Lina M. (orchestration) | Stability of ISO/wasm artifacts, deployment automation |
| Applied Research | Fatima A. | KolibriScript evolution accuracy on multi-turn prompts |
| Design Lab | Hugo P., Yulia V. | Web UI flows, accessibility, beta onboarding copy |
| Support Guild | Priya R. | Incident intake, new beta triage scenario validation |

## 2. Scenario coverage / Покрытие сценариев

- **CI/CD** — executed full `Beta CI/CD` workflow on 6 feature branches; average run time 41 minutes. All lint/test stages passed; one wasm build retried after increasing emsdk cache size.
- **Deployment** — validated `scripts/deploy_linux.sh` against restored Docker images; rollout completed under 5 minutes with deterministic SHA256 manifests.
- **User journey** — confirmed first-run wizard, prompt library import, and system health dashboard on Chromium, Firefox, and Safari.
- **Support** — logged three trial tickets using the “Beta feedback triage” playbook. SLA tracking exported via `support.program.evaluate_sla` produced 100% response compliance.

## 3. Feedback highlights / Ключевые наблюдения

1. _Runtime observability_: request trace panel lacks aggregation by KolibriScript stage; add grouped counters before public launch.
2. _Accessibility_: color contrast on dark mode secondary buttons is below WCAG AA (4.0:1). Design Lab provided corrected token palette `ui/token/dark-beta-contrast`.
3. _Deployment ergonomics_: testers requested an explicit summary of artifact versions in the workflow logs. Action: keep manifest upload and mention run ID in release notes.
4. _Support tooling_: need automated reminder when beta tickets stay in “Awaiting product” for >48h.

## 4. Action items / План улучшений

| ID | Description | Owner | Target |
|----|-------------|-------|--------|
| B-201 | Add grouped KolibriScript stage metrics to backend `/metrics` endpoint. | Core Engineering | 2025-11-05 |
| B-202 | Ship updated dark mode palette and regression tests in Storybook. | Design Lab | 2025-11-03 |
| B-203 | Extend `Beta CI/CD` deploy step with manifest summary in logs. | Release Engineering | 2025-10-31 |
| B-204 | Implement beta ticket aging reminder in support automation. | Support Guild | 2025-11-07 |

## 5. Release readiness / Готовность релиза

- ✅ All critical findings resolved or assigned with committed due dates.
- ✅ No blocker bugs after final regression (build `beta-2025.10-run-142`).
- ✅ Support playbooks updated; see `support/program.py` for the new “Beta feedback triage” scenario.
- ⚠️ Monitor wasm cache hits in CI to avoid future retries; track under issue `OPS-118`.

## 6. Next steps / Следующие шаги

1. Publish condensed highlights to customer-facing release notes (см. `docs/release_notes.md`).
2. Schedule follow-up enablement session for enterprise design partners (week of 2025-11-04).
3. Keep this log updated with post-beta hotfix status until GA cut.
