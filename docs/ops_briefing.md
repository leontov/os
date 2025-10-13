# Ops Briefing – Kolibri Commercialization Rollout

## Purpose

This memo summarizes the operational changes introduced for the commercialization
initiative and should be circulated across the on-call and platform squads.

## Highlights

- **Service Playbook**: Refer to `docs/service_playbook.md` for SLA tiers,
  release cadence, incident workflows, and on-call expectations.
- **Deployment Tooling**: New scripts (`scripts/deploy_linux.sh`,
  `scripts/deploy_macos.sh`, `scripts/deploy_windows.ps1`) support containerized
  rollouts with configurable images and prefixes. Smoke tests run in CI to ensure
  parity.
- **Release Bundle**: CI now produces signed artifacts (ISO, wasm, frontend
  bundle) together with a manifest stored in release artifacts. Validation
  requires checking signatures via `cosign verify-blob`.
- **Security Posture**: `docs/security_policy.md` defines dependency audit
  cadence, vulnerability SLAs, and secret-management rules. Escalate incidents
  through `security@kolibri.example`.

## Action Items

1. Review the updated service processes and confirm on-call coverage for each
   tier.
2. Align internal runbooks with the new deployment scripts; test staging
   environments using the `--skip-pull` option for locally built images.
3. Update the status page and customer communication templates to match the SLA
   table in `docs/service_playbook.md`.
4. Ensure team members have cosign installed (`sigstore/cosign`) for artifact
   verification ahead of the next release candidate.

For questions, reach out via `#kolibri-ops` Slack channel or email
`ops-lead@kolibri.example`.
