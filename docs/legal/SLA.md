# Kolibri Service Level Agreement (SLA)

_Version 1.0 — October 12, 2025_

## 1. Scope
This SLA applies to Kolibri Enterprise and Kolibri Managed subscriptions. It defines service availability, support tiers, and remedies. Starter plans are covered by best-effort support only.

## 2. Definitions
- **Service** – KolibriNode, Knowledge Service, Frontend Portal, and managed infrastructure components.
- **Monthly Uptime Percentage (MUP)** – `100% - (Minutes of Downtime * 100 / Total Minutes)`.
- **Downtime** – Interval when production instances return HTTP 5xx or fail health checks for >3 consecutive minutes.
- **Planned Maintenance** – Scheduled windows communicated ≥72 hours in advance; excluded from downtime.
- **SEV Level** – Severity of incident (SEV1 Critical, SEV2 High, SEV3 Medium, SEV4 Low).

## 3. Availability
| Plan | SLA Uptime | Planned Maintenance | Disaster Recovery |
|------|------------|---------------------|-------------------|
| Professional | 99.5% per calendar month | ≤ 4 hours/month | RPO 24h / RTO 8h |
| Enterprise | 99.9% per calendar month | ≤ 2 hours/month | RPO 4h / RTO 2h |
| Managed | 99.95% per calendar month | ≤ 1 hour/month | RPO 1h / RTO 1h |

## 4. Response Times
| SEV | Examples | Response | Mitigation Update |
|-----|----------|----------|-------------------|
| SEV1 (Critical) | Outage, data corruption | 1 hour (24×7) | Every 30 minutes |
| SEV2 (High) | Major functionality degraded | 4 hours (12×5) | Every 4 hours |
| SEV3 (Medium) | Partial issues, bugs | 1 business day | Daily |
| SEV4 (Low) | Feature requests | 3 business days | On change |

## 5. Credit Structure
If MUP falls below SLA target, Licensee receives service credits:
| MUP | Credit |
|-----|--------|
| < 99.9% (Enterprise) | 10% of monthly fee |
| < 99.5% | 25% of monthly fee |
| < 99.0% | 40% of monthly fee |
| < 97.0% | 100% of monthly fee |

Credits apply to future invoices and require a written claim within 30 days of the incident.

## 6. Obligations of Licensee
- Maintain supported environment and apply security updates.
- Provide valid escalation contacts.
- Configure redundant network and power for on-prem deployments.
- Implement backup procedures for knowledge data if not using managed backup.

## 7. Exclusions
SLA does not cover downtime caused by:
- Force majeure events or upstream provider outages.
- Misconfiguration or unauthorized modifications by Licensee.
- Breach of Agreement (EULA) or failure to pay applicable fees.
- Beta features or sandbox environments.

## 8. Monitoring & Reporting
Licensor provides:
- Status page with real-time incidents.
- Monthly SLA report.
- Post-incident review within 5 business days for SEV1/SEV2.

## 9. Termination for Chronic Failure
If Licensor fails to meet SLA uptime in three consecutive months or four months within a 12‑month period, Licensee may terminate the subscription with 30 days’ written notice and receive a prorated refund.

## 10. Modifications
Licensor may update this SLA with 30 days’ notice via email and status page. Material reductions require Licensee consent or provide the right to terminate.

---

For questions or to file an SLA claim, contact `support@kolibri.example`.
