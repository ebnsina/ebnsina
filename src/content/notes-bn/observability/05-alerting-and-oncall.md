---
title: 'Alerting & On-Call'
subtitle: 'যে alert তখনই fire করে যখন ইউজার আক্রান্ত হয়, metric একটু নড়লেই নয় — SLO-based alerting, runbooks, আর এমন on-call practice যা মানুষজনকে পুড়িয়ে ফেলে না।'
chapter: 5
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['alerting', 'on-call', 'SLO', 'error budget', 'PagerDuty', 'runbooks', 'alert fatigue']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা smoke detector বনাম fire department dispatch: একটা smoke detector ধোঁয়া পেলেই alert করে — যেটা পোড়া টোস্টও হতে পারে, আবার বাড়িতে আগুনও। fire department তখন পাঠায় যখন সত্যিই একটা নিশ্চিত আগুন থাকে যাতে সাড়া দেওয়া দরকার। এমন symptom-এ alert করুন যাতে মানুষের action দরকার (আগুন), প্রতিটা metric নড়াচড়ায় নয় (ধোঁয়া)। খুব বেশি ভুয়া অ্যালার্ম হলে মানুষ detector-টাই বন্ধ করে দেয়।

</Callout>

## Alert Fatigue একটা Safety Problem

যে সিস্টেম দিনে 20 বার engineer-দের page করে, সেটা তাদের page উপেক্ষা করতে শেখায়। যখন আসল incident fire করে, তখন সাড়া দিতে দেরি হয়। Alert fatigue SLA মেরে ফেলে।

মূল কারণ হলো ভুল জিনিসের উপর alert করা:

- Threshold-based alert যা একটা স্থির সংখ্যা metric ছাড়ালেই fire করে
- এমন জিনিসের alert যা হস্তক্ষেপ ছাড়াই নিজে থেকে ঠিক হয়ে যায়
- কোনো স্পষ্ট action নেই এমন alert

**প্রতিটা alert-এর জন্য পরীক্ষা:** "এটা যদি রাত 3টায় fire করে, একজন engineer-এর কি জেগে উঠে 15 মিনিটের মধ্যে কিছু করা উচিত?" যদি না হয়: alert-টা page করা উচিত নয়। এটা log করতে পারে, Slack-এ post করতে পারে, বা রেকর্ড করা যেতে পারে, কিন্তু page করা উচিত নয়।

## SLO-Based Alerting

metric threshold নয়, user impact-এর উপর alert করুন।

**Step 1: SLO সংজ্ঞায়িত করুন**

```
Success rate SLO: 99.9% of requests succeed over 30 days
Latency SLO: P99 < 500ms for 99.5% of requests over 30 days
```

**Step 2: Error budget হিসাব করুন**

```
99.9% success → 0.1% errors allowed
30 days = 43,200 minutes
Budget: 43.2 minutes of 100% outage (or equivalent degradation)
```

**Step 3: Burn rate-এর উপর alert করুন**

Burn rate = আপনি কত দ্রুত error budget খরচ করছেন। 1x-এ আপনি ঠিক মাসের শেষে শেষ করেন। 14x-এ আপনি ~2 দিনে শেষ করে ফেলেন।

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

দুটো window: `[5m]` হঠাৎ spike ধরে, `[30m]` ধীর degradation ধরে। দুটোই দরকার — একটা মাত্র window একধরনের failure মিস করে।

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

যে প্রতিটা alert page করে তার একটা runbook থাকতেই হবে। runbook incident-এর আগে লেখা হয়, চলাকালীন নয়।

````markdown
# Runbook: HighErrorBudgetBurnRate

## এর মানে কী

order-service-এর error rate এত বেশি যে আমাদের 30-দিনের error
budget 2 দিনেরও কম সময়ে শেষ হয়ে যাবে। ইউজাররা order তৈরিতে failure দেখছে।

## তাৎক্ষণিক পদক্ষেপ (< 5 minutes)

1. বর্তমান error rate চেক করুন:
   - Grafana dashboard: https://grafana.internal/d/orders/order-service
   - "Error Rate by Path" panel দেখুন

2. সাম্প্রতিক deployment চেক করুন:
   ```bash
   kubectl rollout history deployment/order-service -n production
   ```
````

গত 30 মিনিটে deploy হয়ে থাকলে: rollback বিবেচনা করুন।

3. Downstream service চেক করুন:
   - Payment service: https://grafana.internal/d/payments
   - Database: https://grafana.internal/d/postgres

## Diagnosis paths

**যদি error একটা deploy-এর সময় থেকে শুরু হয়:**

```bash
kubectl rollout undo deployment/order-service -n production
```

5 মিনিট monitor করুন। error rate কমলে: deploy-ই কারণ ছিল।

**যদি payment service error দিচ্ছে:**

- payment service runbook চেক করুন: https://runbooks.internal/payment-service
- payment fallback mode চালু করুন: `kubectl set env deployment/order-service PAYMENT_FALLBACK=true -n production`

**যদি database error:**

- connection pool চেক করুন: `psql -h db.internal -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"`
- connection ফুরিয়ে গেলে: PgBouncer restart করুন: `systemctl restart pgbouncer`

## Escalation

- 15 minutes: service owner-এর কাছে escalate করুন (#incidents-এ @layla)
- 30 minutes: engineering lead-এর কাছে escalate করুন (@ahmad)

## সম্পর্কিত alert

- OrderQueueHigh — queue জমে যাওয়া processing failure নির্দেশ করতে পারে
- PaymentServiceDown — downstream dependency

```

action ধাপ ছাড়া একটা runbook অকেজো। action ধাপসহ একটা runbook একটা টুল। প্রতিটা incident-এর পরে যা শিখলেন তা দিয়ে এটা আপডেট করুন।

## On-Call Rotation

```

Rotation কাঠামো:

- Primary: page প্রথমে যে পায়
- Secondary: primary 15min-এ ack না করলে escalation
- Rotation: সাপ্তাহিক, সোমবার থেকে সোমবার

Handoff:

- বর্তমান incident, পরিচিত issue, আসন্ন deploy-এর লিখিত summary
- আগত on-call-এর সাথে 30-মিনিটের sync
- সব alert resolved বা নথিভুক্ত কিনা নিশ্চিত করুন

Compensation:

- ঘুম নষ্ট = পরদিন comp time (স্পষ্ট policy)
- Weekend page = অতিরিক্ত একদিন ছুটি
  স্পষ্ট policy বিরক্তি প্রতিরোধ করে

```

## Incident Response

যখন একটা critical alert fire করে:

```

0m — Alert fire করে, primary on-call acknowledge করে
2m — severity যাচাই করুন। incident channel তৈরি করুন: #incident-YYYY-MM-DD-service
5m — impact শনাক্ত করুন: কতজন ইউজার, কোন feature
10m — Mitigation চেষ্টা (rollback, traffic shift, restart)
15m — stakeholder-দের আপডেট দিন: "Order service degraded, team investigating"
30m — mitigate না হলে: escalate করুন, সাহায্য চান
60m — mitigate না হলে: incident commander সমন্বয়ের দায়িত্ব নেয়

Resolution:
— metric baseline-এ ফিরেছে কিনা যাচাই করুন
— incident channel-এ "All-clear" message
— 24 ঘণ্টার মধ্যে প্রাথমিক post-mortem লিখুন
— 5 কর্মদিবসের মধ্যে সম্পূর্ণ post-mortem

````

## Post-Mortems

একটা blameless post-mortem মানুষ নয়, সিস্টেমের উপর মনোযোগ দেয়।

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

Post-mortem-এর আসল মূল্য হলো action item গুলো। action item ছাড়া একটা incident মানে একটা হারানো সুযোগ — একই failure আপনি আবার দেখবেন।

## On-Call Health Metrics

ট্র্যাক করুন আর পর্যালোচনা করুন:

```
Mean Time to Acknowledge (MTTA): target < 5 minutes
Mean Time to Resolve (MTTR): track trend over time
Pages per week per person: > 5 is unsustainable
  Alert noise ratio: (pages with no action / total pages) → target < 10%
Post-mortems completed: 100% of P1/P2 incidents
Action items resolved: review at each quarterly infra review
```

সপ্তাহে page সংখ্যা 5 ছাড়িয়ে গেলে, নতুন feature-এর চেয়ে alert pruning-কে অগ্রাধিকার দিন। যে on-call rotation মানুষকে পুড়িয়ে ফেলে, সেটা আপনি যে feature ship করছেন তার চেয়ে বেশি খরচ করাবে attrition-এ।
