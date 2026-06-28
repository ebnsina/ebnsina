---
title: 'Alerting & On-Call'
subtitle: "Alerts that fire when users are impacted, not when metrics twitch — SLO-based alerting, runbooks, and on-call practices that don't burn people out."
chapter: 5
level: 'intermediate'
readingTime: '9 min'
topics: ['alerting', 'on-call', 'SLO', 'error budget', 'PagerDuty', 'runbooks', 'alert fatigue']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A smoke detector vs a fire department dispatch: a smoke detector alerts on smoke — which could be burnt toast or a house fire. The fire department dispatches when there's a confirmed fire requiring response. Alert on symptoms that require human action (fire), not on every metric wiggle (smoke). Too many false alarms and people disable the detector.

</Callout>

## Alert Fatigue Is a Safety Problem

A system that pages engineers 20 times per day trains them to ignore pages. When the real incident fires, the response is slow. Alert fatigue kills SLAs.

The root cause is alerting on the wrong things:

- Threshold-based alerts that fire when metrics exceed a static number
- Alerts for things that self-heal without intervention
- Alerts with no clear action

**The test for every alert:** "If this fires at 3am, should an engineer wake up and do something within 15 minutes?" If no: the alert should not page. It can log, post to Slack, or be recorded, but it should not page.

## SLO-Based Alerting

Alert on user impact, not metric thresholds.

**Step 1: Define SLOs**

```
Success rate SLO: 99.9% of requests succeed over 30 days
Latency SLO: P99 < 500ms for 99.5% of requests over 30 days
```

**Step 2: Calculate error budget**

```
99.9% success → 0.1% errors allowed
30 days = 43,200 minutes
Budget: 43.2 minutes of 100% outage (or equivalent degradation)
```

**Step 3: Alert on burn rate**

Burn rate = how fast you're consuming error budget. At 1x you exhaust exactly at month end. At 14x you exhaust in ~2 days.

```yaml
# Alert when burning fast enough to exhaust budget in < 1 hour
- alert: HighErrorBudgetBurnRate
  expr: |
    (
      rate(http_requests_total{status=~"5.."}[5m]) /
      rate(http_requests_total[5m])
    ) > (0.001 * 14.4)   # 14.4x burn rate = budget exhausted in ~2 days
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: 'Error budget burning fast — SLO at risk'
    description: 'Current burn rate: {{ $value | humanizePercentage }}'

# Alert on slower burn (week-level exhaustion)
- alert: MediumErrorBudgetBurnRate
  expr: |
    (
      rate(http_requests_total{status=~"5.."}[30m]) /
      rate(http_requests_total[30m])
    ) > (0.001 * 3)   # 3x burn rate = budget exhausted in ~10 days
  for: 15m
  labels:
    severity: warning
```

Two windows: `[5m]` catches sudden spikes, `[30m]` catches slow degradation. Both required — a single window misses one class of failure.

## Alert Taxonomy

```
Severity: critical — page immediately, 15min response
Severity: warning  — investigate during business hours
Severity: info     — no action needed, informational

Page on:
  - SLO breach in progress
  - Service completely down
  - Data loss risk

Slack/email on:
  - Elevated error rates (not yet SLO-breaching)
  - Resource approaching limits
  - Unusual traffic patterns

No notification:
  - Metrics that self-correct within seconds
  - Expected behavior during deployments
```

## Runbooks

Every alert that pages must have a runbook. The runbook is written before the incident, not during.

````markdown
# Runbook: HighErrorBudgetBurnRate

## What this means

The order-service error rate is high enough to exhaust our 30-day error
budget in less than 2 days. Users are seeing failures on order creation.

## Immediate steps (< 5 minutes)

1. Check current error rate:
   - Grafana dashboard: https://grafana.internal/d/orders/order-service
   - Look at "Error Rate by Path" panel

2. Check recent deployments:
   ```bash
   kubectl rollout history deployment/order-service -n production
   ```
````

If deployed in last 30 minutes: consider rollback.

3. Check downstream services:
   - Payment service: https://grafana.internal/d/payments
   - Database: https://grafana.internal/d/postgres

## Diagnosis paths

**If errors started at a deploy time:**

```bash
kubectl rollout undo deployment/order-service -n production
```

Monitor for 5 minutes. If error rate drops: deploy was the cause.

**If payment service is erroring:**

- Check payment service runbook: https://runbooks.internal/payment-service
- Activate payment fallback mode: `kubectl set env deployment/order-service PAYMENT_FALLBACK=true -n production`

**If database errors:**

- Check connection pool: `psql -h db.internal -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"`
- If connections exhausted: restart PgBouncer: `systemctl restart pgbouncer`

## Escalation

- 15 minutes: escalate to service owner (@layla in #incidents)
- 30 minutes: escalate to engineering lead (@ahmad)

## Related alerts

- OrderQueueHigh — queue backing up may indicate processing failures
- PaymentServiceDown — downstream dependency

```

A runbook without steps to take is useless. A runbook with steps to take is a tool. Update it after every incident with what you learned.

## On-Call Rotation

```

Rotation structure:

- Primary: first to receive page
- Secondary: escalation if primary doesn't ack in 15min
- Rotation: weekly, Monday to Monday

Handoff:

- Written summary of current incidents, known issues, upcoming deploys
- 30-minute sync with incoming on-call
- Confirm all alerts are resolved or documented

Compensation:

- Disrupted sleep = comp time next day (explicit policy)
- Weekend pages = extra day off
  Clear policy prevents resentment

```

## Incident Response

When a critical alert fires:

```

0m — Alert fires, primary on-call acknowledges
2m — Assess severity. Create incident channel: #incident-YYYY-MM-DD-service
5m — Identify impact: how many users, which features
10m — Mitigation attempt (rollback, traffic shift, restart)
15m — Update stakeholders: "Order service degraded, team investigating"
30m — If not mitigated: escalate, call for help
60m — If not mitigated: incident commander takes over coordination

Resolution:
— Verify metrics returned to baseline
— "All-clear" message in incident channel
— Write preliminary post-mortem within 24h
— Full post-mortem within 5 business days

````

## Post-Mortems

A blameless post-mortem focuses on systems, not people.

```markdown
# Post-Mortem: Order Service Outage 2024-01-15

**Duration:** 10:15 — 11:42 UTC (87 minutes)
**Impact:** 23% of order creation requests failed. ~3,400 affected orders.
**Severity:** P1

## Timeline

10:15 — Alert fired: HighErrorBudgetBurnRate
10:17 — On-call acknowledges, begins investigation
10:23 — Identified elevated 500 errors on POST /orders
10:31 — Traced to payment service returning 503
10:44 — Payment service team identified root cause: connection pool exhaustion
10:51 — Payment service PgBouncer restarted
10:58 — Order service errors begin clearing
11:42 — Error rate returned to baseline, incident resolved

## Root Cause

A slow query introduced in payment-service v1.47 (deployed 09:30) held
connections for 5-8 seconds per request instead of < 100ms. The PgBouncer
pool (50 connections) was exhausted within 45 minutes of the deploy.

## Why It Wasn't Caught Earlier

1. The slow query only manifests under production-level concurrent load
2. Staging uses a smaller dataset where the query is fast
3. No alert on PgBouncer pool utilization

## Action Items

| Action | Owner | Due |
|--------|-------|-----|
| Add alert: PgBouncer pool > 80% utilized | Layla | 2024-01-22 |
| Add slow query detection to CI benchmarks | Omar | 2024-01-29 |
| Increase PgBouncer pool size: 50 → 100 | Layla | 2024-01-17 |
| Add payment-service circuit breaker in order-service | Fatima | 2024-01-24 |
````

The post-mortem's value is the action items. An incident without action items is a missed opportunity — you'll see the same failure again.

## On-Call Health Metrics

Track and review:

```
Mean Time to Acknowledge (MTTA): target < 5 minutes
Mean Time to Resolve (MTTR): track trend over time
Pages per week per person: > 5 is unsustainable
  Alert noise ratio: (pages with no action / total pages) → target < 10%
Post-mortems completed: 100% of P1/P2 incidents
Action items resolved: review at each quarterly infra review
```

If pages per week exceeds 5, prioritize alert pruning over new features. An on-call rotation that burns people out will cost more in attrition than the features you're shipping.
