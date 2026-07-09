---
title: 'SLIs, SLOs & Error Budgets'
subtitle: 'সঠিক SLI বেছে নাও, এমন একটা SLO সেট করো যা lawyer review-তে টেকে, আর Google-এর CRE team যেভাবে করে সেভাবে budget burn করো।'
chapter: 2
level: 'beginner'
readingTime: '18 মিনিট'
topics: ['SLI', 'SLO', 'SLA', 'error budget', 'burn rate', 'Prometheus']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

penalty clause সহ একটা service contract — "যথেষ্ট ভালো" মানে কী তা তুমি আগেভাগেই একমত হও, আর budget হচ্ছে penalty শুরু হওয়ার আগে তোমার হাতে কতটা ঢিল আছে।

</Callout>

## SLI, SLO, SLA — এরা একই শব্দ নয়

```
SLI — Indicator    A measurement.            "% of HTTP requests succeeding."
SLO — Objective    A target on the SLI.       ">= 99.9% over 30 days."
SLA — Agreement    A contract with $$$.       "If we miss 99.5%, we refund 10%."

SLO < SLA always.  Internal target is stricter than the contractual one.
You must hit the SLO well before you risk the SLA.
```

একটা customer meeting-এ এই টার্মগুলো গুলিয়ে ফেললে, তোমার finance team শেষমেশ সেটা ব্যয়বহুলভাবে জানতে পারবে।

## সঠিক SLI বেছে নেওয়া

ভুল SLI, কোনো SLI না থাকার চেয়ে খারাপ। এটা team-কে বছরের পর বছর ভুল জিনিসের উপর anchor করে রাখে।

একটা ভালো SLI:

1. **good event আর total event-এর একটা ratio** (যাতে এটা পরিষ্কারভাবে compose হয়)
2. **user-perceived layer-এ measured** (stack-এর গভীরে নয়)
3. **instance জুড়ে aggregatable** — tail behavior নিয়ে মিথ্যা না বলে

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

**Latency SLI-এর জন্য কখনো average ব্যবহার করো না।** p50 = 50ms আর p99 = 5s সহ একটা service-এর average চমৎকার আর user experience ভয়ঙ্কর। Latency সবসময় "X-এর চেয়ে দ্রুত request-এর ভগ্নাংশ" হিসেবে প্রকাশ করো।

</Callout>

## Service type অনুযায়ী SLI menu

```typescript
// Reference table: what SLI fits which service shape

const sliMenu = {
	requestResponse: {
		// REST APIs, RPCs
		availability: 'good HTTP responses / total HTTP responses',
		latency: 'requests under threshold / total requests',
		quality: 'high-quality responses / total responses'
	},
	dataPipeline: {
		// ETL, stream processing
		coverage: 'records processed / records ingested',
		freshness: 'records processed within N minutes / total records',
		correctness: 'correct records / total records'
	},
	storage: {
		// databases, object stores
		durability: 'objects retrievable / objects written',
		availability: 'successful reads + writes / total operations',
		latency: 'reads under threshold / total reads'
	},
	scheduledJob: {
		// crons, batch
		onTime: 'jobs completed before deadline / scheduled jobs',
		success: 'successful jobs / scheduled jobs'
	}
};
```

## SLO সংখ্যাটা সেট করা

SLO target শুধু SLE team একা বেছে নেয় না। process-টা:

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

প্রতিটা অতিরিক্ত 9-এর দাম আগেরটার চেয়ে মোটামুটি **10x বেশি engineering effort**।

```
99%      = 7.2 hours of badness/month   (cheap; a tutorial site)
99.9%    = 43.2 minutes/month           (most B2B SaaS)
99.95%   = 21.6 minutes/month           (paid consumer)
99.99%   = 4.32 minutes/month           (payments, identity)
99.999%  = 25.9 seconds/month           (emergency services, exchanges)
99.9999% = 2.59 seconds/month           (you cannot afford this; you don't need it)
```

<Callout type="tip">

**যতটা ভাবছ তার চেয়ে নিচে aim করো।** 99.99% SLO আর 99.95% প্রয়োজন থাকা একটা team শুধু অপ্রয়োজনীয় ভোগান্তির জন্য সাইন আপ করেছে। user expectation-এর বেশি reliability অপচয়; user সেটা টের পায় না, কিন্তু তুমি feature velocity দিয়ে তার দাম দাও।

</Callout>

## Prometheus-এ SLO রেকর্ড করা

recording rules আর burn-rate alerts ব্যবহার করে production-grade SLO tracking। এটা ঠিক সেই shape যা `sloth` generate করে। `sloth` একটা option; অনেক team এখন SLI rules সরাসরি IaC-তে codify করে, বা portable থাকতে [OpenSLO](https://github.com/OpenSLO/OpenSLO) spec ব্যবহার করে।

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

সরল approach — "শেষ 5 মিনিট 99.9%-এর নিচে গেলে alert দাও" — ছোটখাটো blip-এর সময়ও অনবরত fire করে। সঠিক approach ব্যবহার করে **multi-window, multi-burn-rate** alerts, যে technique SRE Workbook-এ publish হয়েছে।

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
          summary: 'Checkout SLO fast burn — 2% of monthly budget in 1h'
          runbook: 'https://runbooks.example.com/checkout-fast-burn'

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

double-window `and`-টাই মূল কৌশল: লম্বা window trend শনাক্ত করে, ছোট window নিশ্চিত করে যে badness এখনো চলছে (যাতে issue ঠিক হওয়ার মুহূর্তেই alert resolve হয়, 6 ঘণ্টা পরে নয়)।

<Callout type="info">

**14.4 আর 6 কেন?** এগুলো এমনভাবে derive করা যাতে তুমি তোমার monthly budget-এর X%-এর বেশি burn করার আগেই alert fire করে। পুরো derivation আছে Google SRE Workbook-এর "Alerting on SLOs" chapter-এ। এই constants সরাসরি ব্যবহার করো — এরা battle-tested।

</Callout>

## Error budget policy (the document)

লেখা policy ছাড়া সংখ্যাগুলো অকেজো। রিয়েল team-রা এক পাতার একটা document publish করে যা প্রতিটা budget state-এ ঠিক কী হবে তা বলে দেয়।

```markdown
# Checkout Service — Error Budget Policy

## SLO

99.9% availability over 30-day rolling window.

## Budget states

- HEALTHY (>50% remaining): Normal velocity. Risky deploys allowed.
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

এই document-এ engineering manager আর product manager দুজনেই sign off করে। এটা এই কারণে থাকে যাতে একটা deploy allowed কিনা তা নিয়ে তোমাকে রাত 2টায় তর্ক করতে না হয়।

## সাধারণ SLO ভুল (রিয়েল outage থেকে)

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

- [Google SRE Workbook — Implementing SLOs](https://sre.google/workbook/implementing-slos/) — source material
- [OpenSLO spec](https://github.com/OpenSLO/OpenSLO) — vendor-neutral SLO definitions
- [Sloth](https://sloth.dev) — Prometheus SLO generator, এখনো actively maintained
- [Alex Hidalgo — Implementing SLOs (book)](https://www.alex-hidalgo.com/the-art-of-slos) — practical depth

## Key Takeaways

1. **SLI = good আর total-এর ratio**, user-এর কাছাকাছি measured
2. **SLO = SLI-এর উপর একটা target**, perfection যা চায় তার চেয়ে নিচে সেট করা
3. **প্রতিটা 9-এর দাম ~10x বেশি** — সবচেয়ে নিচু defensible target বেছে নাও
4. **Multi-window multi-burn alerting** হচ্ছে SLO violation-এ page করার সঠিক উপায়
5. **Error budget policy document** হচ্ছে যা budget-কে আসলে enforceable করে
