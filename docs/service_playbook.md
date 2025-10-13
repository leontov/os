# Kolibri Service Playbook / План обслуживания Kolibri

## 1. Service Overview / Описание сервиса

- **Service tiers:** Starter, Professional, Enterprise.
- **Components:** Backend nodes, Knowledge indexer, Frontend portal, Support tooling.

## 2. SLA / Уровни сервисного обслуживания

| Tier | Availability | Response Time | Resolution Target |
|------|--------------|---------------|-------------------|
| Starter | 99.0% | 8 business hours | 3 business days |
| Professional | 99.5% | 4 hours | 24 hours |
| Enterprise | 99.9% | 1 hour (24/7) | 12 hours |

Escalation path: L1 Support → L2 Engineering → Incident Commander.

## 3. Incident Management / Управление инцидентами

1. Create ticket in ServiceDesk with severity (SEV1–SEV4).
2. Engage on-call via PagerDuty; bridge line established for SEV1/SEV2.
3. Publish status updates every 30 minutes until mitigation.
4. Capture timeline and remediation actions for post-incident review (PIR within 5 days).

## 4. Release Cadence / Цикл релизов

- Patch releases: weekly (if needed).
- Minor releases: second Tuesday of each month.
- Major releases: twice per year; include upgrade guide, rollback plan, and RC phase.
- Maintain two active branches: `stable` (latest minor) and `lts` (previous major).

## 5. Customer Communication / Коммуникации

- Channels: email bulletins, status page (`status.kolibri.example`), dedicated Slack workspace.
- Scheduled maintenance notifications: at least 48 hours in advance.
- Security advisories: direct email to registered contacts.

## 6. On-call Runbook / Руководство для дежурных

- Pre-shift checklist: verify monitoring dashboards, acknowledge open alerts, review planned changes.
- Monitoring stack: Grafana + Prometheus (infrastructure), Loki (logs), Sentry (frontend errors).
- HTTP checks: `kolibri_node --health`, `http://<knowledge>/healthz`, `http://<knowledge>/metrics` (scrape `kolibri_knowledge_documents`).
- Alert thresholds:
  - CPU > 80% for 5 minutes
  - Request latency P95 > 2 seconds
  - Knowledge index age > 48 hours
- Response steps: assess impact, mitigate, document ticket updates every 20 minutes.

## 7. Change Management / Управление изменениями

- Use Change Advisory Board (CAB) for major modifications.
- Track deployment approvals in Jira; include peer code review and QA sign-off.
- For emergency changes, perform retrospective within 72 hours.

## 8. Customer Onboarding / Онбординг клиентов

- Provide welcome kit (user guide, admin guide, SLA summary).
- Schedule orientation call for Enterprise tier.
- Collect contacts for technical and business stakeholders.
