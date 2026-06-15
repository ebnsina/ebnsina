---
title: "SLIs, SLOs & Error Budgets"
subtitle: "Pick the right SLI, set an SLO that survives lawyer review, and burn the budget the way Google's CRE team does it."
chapter: 2
level: "beginner"
readingTime: "18 min"
topics: ["SLI", "SLO", "SLA", "error budget", "burn rate", "Prometheus"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A service contract with a penalty clause — you agree upfront on what "good enough" means, and the budget is how much slack you have before penalties kick in.

</Callout>

## SLI, SLO, SLA — they are not the same word

```
SLI — Indicator    A measurement.            "% of HTTP requests succeeding."
SLO — Objective    A target on the SLI.       ">= 99.9% over 30 days."
SLA — Agreement    A contract with $$$.       "If we miss 99.5%, we refund 10%."

SLO < SLA always.  Internal target is stricter than the contractual one.
You must hit the SLO well before you risk the SLA.
```

If you confuse these terms in a customer meeting, your finance team will eventually find out the expensive way.

## Picking the right SLI

The wrong SLI is worse than no SLI. It anchors the team on the wrong thing for years.

A good SLI is:

1. **A ratio of good events to total events** (so it composes cleanly)
2. **Measured at the user-perceived layer** (not deep in the stack)
3. **Aggregatable across instances** without lying about tail behavior

```promql
# ✓ Good SLI: availability for the checkout API
# Measured at the load balancer (closest to user)
sum(rate(http_requests_total{service="checkout", status!~"5.."}[5m]))
/
sum(rate(http_requests_total{service="checkout"}[5m]))

# ✗ Bad SLI: "average latency"
# Average hides the tail. p99 is what users feel.
avg(http_request_duration_seconds{service="checkout"})

# ✓ Good SLI: latency as a ratio
# "Fraction of requests served under 300ms"
sum(rate(http_request_duration_seconds_bucket{
  service="checkout", le="0.3"
}[5m]))
/
sum(rate(http_request_duration_seconds_count{service="checkout"}[5m]))
```

<Callout type="warning">

**Never use averages for latency SLIs.** A service with p50 = 50ms and p99 = 5s has a glorious average and a terrible user experience. Always express latency as "fraction of requests faster than X."

</Callout>

## The SLI menu by service type

```typescript
// Reference table: what SLI fits which service shape

const sliMenu = {
  requestResponse: {  // REST APIs, RPCs
    availability: "good HTTP responses / total HTTP responses",
    latency:      "requests under threshold / total requests",
    quality:      "high-quality responses / total responses",
  },
  dataPipeline: {  // ETL, stream processing
    coverage:     "records processed / records ingested",
    freshness:    "records processed within N minutes / total records",
    correctness:  "correct records / total records",
  },
  storage: {  // databases, object stores
    durability:   "objects retrievable / objects written",
    availability: "successful reads + writes / total operations",
    latency:      "reads under threshold / total reads",
  },
  scheduledJob: {  // crons, batch
    onTime:       "jobs completed before deadline / scheduled jobs",
    success:      "successful jobs / scheduled jobs",
  },
};
```

## Setting the SLO number

SLO target is not chosen by the SRE team alone. The process:

```
1. Measure current performance for 4 weeks (be honest).
2. Survey real users — what would they tolerate?
3. Look at competitive baseline (what does the market expect?).
4. Negotiate with product on a number that is:
   - Achievable within ~6 months of focused work
   - Higher than current performance (so it stretches)
   - Lower than what perfectionism demands (so it leaves time for features)
5. Commit. Review every 90 days.
```

### The cost of nines

Each additional 9 costs roughly **10x more engineering effort** than the previous one.

```
99%      = 7.2 hours of badness/month   (cheap; a tutorial site)
99.9%    = 43.2 minutes/month           (most B2B SaaS)
99.95%   = 21.6 minutes/month           (paid consumer)
99.99%   = 4.32 minutes/month           (payments, identity)
99.999%  = 25.9 seconds/month           (emergency services, exchanges)
99.9999% = 2.59 seconds/month           (you cannot afford this; you don't need it)
```

<Callout type="tip">

**Aim lower than you think.** A team with a 99.99% SLO and a 99.95% need has just signed up for unnecessary suffering. Reliability over user expectation is wasted; users do not perceive it, but you pay for it in feature velocity.

</Callout>

## Recording the SLO in Prometheus

Production-grade SLO tracking using recording rules and burn-rate alerts. This is the same shape `sloth` generates. `sloth` is one option; many teams now codify SLI rules directly in IaC, or use the [OpenSLO](https://github.com/OpenSLO/OpenSLO) spec to stay portable.

```yaml
# prometheus/rules/checkout-slo.yml

groups:
  - name: checkout-slo-recording
    interval: 30s
    rules:
      # 1. Define the SLI as a recording rule for cheap reuse
      - record: sli:checkout_availability:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{service="checkout",status!~"5.."}[5m]))
          /
          sum(rate(http_requests_total{service="checkout"}[5m]))

      - record: sli:checkout_availability:ratio_rate1h
        expr: |
          sum(rate(http_requests_total{service="checkout",status!~"5.."}[1h]))
          /
          sum(rate(http_requests_total{service="checkout"}[1h]))

      - record: sli:checkout_availability:ratio_rate6h
        expr: |
          sum(rate(http_requests_total{service="checkout",status!~"5.."}[6h]))
          /
          sum(rate(http_requests_total{service="checkout"}[6h]))

      # 2. The SLO as a constant (lets dashboards reference it)
      - record: slo:checkout_availability:target
        expr: vector(0.999)

      # 3. Error budget remaining as a gauge
      - record: slo:checkout_availability:error_budget_remaining
        expr: |
          1 - (
            (1 - sli:checkout_availability:ratio_rate30d)
            /
            (1 - slo:checkout_availability:target)
          )
```

## Burn-rate alerts (the modern way)

The naive approach — "alert when last 5 min are below 99.9%" — fires constantly during minor blips. The correct approach uses **multi-window, multi-burn-rate** alerts, the technique published in the SRE Workbook.

```yaml
# Two windows + two burn rates = catch fast outages and slow leaks

groups:
  - name: checkout-slo-burn
    rules:
      # PAGE: fast burn — we'd consume 2% of budget in 1 hour at this rate
      # Burn rate 14.4 over 1h consumes 2% of a 30d budget
      - alert: CheckoutErrorBudgetFastBurn
        expr: |
          (1 - sli:checkout_availability:ratio_rate1h)
          > (14.4 * (1 - slo:checkout_availability:target))
          and
          (1 - sli:checkout_availability:ratio_rate5m)
          > (14.4 * (1 - slo:checkout_availability:target))
        for: 2m
        labels:
          severity: page
          slo: checkout_availability
        annotations:
          summary: "Checkout SLO fast burn — 2% of monthly budget in 1h"
          runbook: "https://runbooks.example.com/checkout-fast-burn"

      # TICKET: slow burn — would consume 10% over 6 hours
      # Burn rate 6 over 6h consumes 10% of a 30d budget
      - alert: CheckoutErrorBudgetSlowBurn
        expr: |
          (1 - sli:checkout_availability:ratio_rate6h)
          > (6 * (1 - slo:checkout_availability:target))
          and
          (1 - sli:checkout_availability:ratio_rate1h)
          > (6 * (1 - slo:checkout_availability:target))
        for: 15m
        labels:
          severity: ticket
          slo: checkout_availability
```

The double-window `and` is the key trick: the long window detects the trend, the short window confirms the badness is still ongoing (so the alert resolves the moment the issue is fixed, not 6 hours later).

<Callout type="info">

**Why 14.4 and 6?** These are derived to ensure the alert fires before you've burned more than X% of your monthly budget. The full derivation is in the Google SRE Workbook chapter "Alerting on SLOs." Use these constants directly — they are battle-tested.

</Callout>

## Error budget policy (the document)

The numbers are useless without a written policy. Real teams publish a one-page document that says exactly what happens at each budget state.

```markdown
# Checkout Service — Error Budget Policy

## SLO
99.9% availability over 30-day rolling window.

## Budget states
- HEALTHY (>50% remaining):  Normal velocity. Risky deploys allowed.
- BURNING (10-50% remaining): Mandatory canary. PRs require SRE LGTM.
- EXHAUSTED (<10% remaining): Feature freeze. Only:
    1. Reliability fixes
    2. Security patches (P0/P1)
    3. Customer-blocking bugs
  Lifted when budget recovers above 25%.

## Disagreement escalation
Engineering Manager → Director → VP Eng. Decision recorded in writing.

## Owner
Checkout SRE (rotation: see PagerDuty schedule "checkout-primary")
```

This document is signed off by the engineering manager AND the product manager. It exists so you do not have to argue at 2am about whether a deploy is allowed.

## Common SLO mistakes (from real outages)

```typescript
// Mistake 1: SLI measured at the wrong layer
// "Pod liveness probe success rate" → tells you nothing about user experience
// → Move to load balancer or, better, RUM data from the browser

// Mistake 2: Averaging SLOs across regions
// "Global availability" hides EU collapsing while US is fine
// → Per-region SLOs, then a derived global SLO

// Mistake 3: Counting non-prod traffic
// Synthetic monitors and bots bloat the denominator
// → Filter by user-agent or use a probe-only label

// Mistake 4: Ignoring partial failures
// Status 200 with empty body = "success" by HTTP code, garbage to user
// → Add a quality SLI on response payload validity

// Mistake 5: SLO never gets reviewed
// You set 99.95% in 2022 and the service has done 99.99% for a year.
// You are leaving error budget on the table → tighten the SLO.
```

## Stay current

- [Google SRE Workbook — Implementing SLOs](https://sre.google/workbook/implementing-slos/) — the source material
- [OpenSLO spec](https://github.com/OpenSLO/OpenSLO) — vendor-neutral SLO definitions
- [Sloth](https://sloth.dev) — Prometheus SLO generator, still actively maintained
- [Alex Hidalgo — Implementing SLOs (book)](https://www.alex-hidalgo.com/the-art-of-slos) — practical depth

## Key Takeaways

1. **SLI = ratio of good to total**, measured close to the user
2. **SLO = target on the SLI**, set lower than what perfection wants
3. **Each 9 costs ~10x more** — pick the lowest defensible target
4. **Multi-window multi-burn alerting** is the right way to page on SLO violation
5. **Error budget policy document** is what makes the budget actually enforceable

