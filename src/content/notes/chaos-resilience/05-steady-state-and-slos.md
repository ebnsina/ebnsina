---
title: "Steady State & SLOs"
subtitle: "Defining what 'working' means in measurable terms — SLIs, SLOs, error budgets, and the feedback loop that drives reliability work."
chapter: 5
level: "intermediate"
readingTime: "10 min"
topics: ["SLO", "SLI", "error budget", "steady state", "reliability"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A thermostat: it doesn't just know that temperature matters — it has a specific target (68°F), measures the current state continuously, and triggers action when the gap is too large. SLOs are your thermostat for reliability: a specific target, continuous measurement, and a trigger for when to act.

</Callout>

## Steady State Is Not "No Errors"

"The system is working" is meaningless for chaos engineering. You need a measurable definition:

**Bad steady state definition:**
> "The system is up and handling requests normally."

**Good steady state definition:**
> "p99 request latency &lt; 300ms, error rate &lt; 0.5%, successful checkout rate > 99.2%, all measured over a 5-minute rolling window."

Now you can answer: "Is this still true with 200ms of injected latency?" The answer is either yes or no, measurable in real time.

## Service Level Indicators (SLIs)

An SLI is a metric that represents the quality of your service from the user's perspective:

```typescript
// Availability SLI: fraction of requests that succeed
const availabilitySLI = successRequests / totalRequests;

// Latency SLI: fraction of requests faster than threshold
const latencySLI = requestsFasterThan300ms / totalRequests;

// Throughput SLI: successful operations per second
const throughputSLI = successfulOpsPerSecond;

// Error rate (inverted availability)
const errorRate = errorRequests / totalRequests;
```

SLIs measure what users experience, not what your infrastructure shows. CPU at 80% is not an SLI — it doesn't tell you if users are getting good service. 99.5% requests completing under 300ms is an SLI.

**Implementing SLI collection:**
```typescript
const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
});

const requestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Middleware
app.use((req, res, next) => {
  const end = requestDuration.startTimer({ method: req.method, route: req.route?.path });
  res.on('finish', () => {
    end({ status_code: res.statusCode });
    requestTotal.inc({ method: req.method, route: req.route?.path, status_code: res.statusCode });
  });
  next();
});
```

**Prometheus queries for your SLIs:**
```promql
# Availability SLI (5m window)
sum(rate(http_requests_total{status_code!~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))

# Latency SLI: fraction of requests < 300ms
sum(rate(http_request_duration_seconds_bucket{le="0.3"}[5m]))
/
sum(rate(http_request_duration_seconds_count[5m]))
```

## Service Level Objectives (SLOs)

An SLO is a target value for an SLI:

```
SLI: availability = successful requests / total requests
SLO: availability >= 99.9% over a 30-day rolling window

SLI: p99 latency
SLO: p99 latency < 300ms, 99% of the time over a 30-day window

SLI: successful checkout rate
SLO: > 99.2% of checkout attempts succeed
```

SLOs are aspirational targets — not contractual guarantees (those are SLAs). Setting them slightly below your actual capability gives you room to experiment and improve without burning your error budget.

**Setting realistic SLOs:**
```
Step 1: Measure your current actual performance over 30 days
Step 2: Set SLO slightly below your actual best (not your worst)
Step 3: Review quarterly — tighten if you consistently exceed it

Example:
  Actual 30-day availability: 99.95%
  Initial SLO: 99.9%   (leaves headroom for experiments)
  After 6 months: 99.95% SLO if consistently met
```

## Error Budgets

The error budget is the inverse of your SLO — the amount of failure you're allowed:

```
SLO: 99.9% availability
Error budget: 100% - 99.9% = 0.1%

In a 30-day month (43,200 minutes):
  Allowed downtime: 43,200 × 0.001 = 43.2 minutes/month

SLO: 99.99% availability
  Allowed downtime: 43,200 × 0.0001 = 4.32 minutes/month
```

The error budget drives decisions:
- **Budget remaining:** Confidence to run chaos experiments, deploy risky changes, take calculated risks.
- **Budget exhausted:** Freeze feature deployments, focus on reliability improvements, cancel chaos experiments until budget recovers.

```typescript
interface ErrorBudget {
  sloPercent: number;        // e.g., 99.9
  windowDays: number;        // e.g., 30
  budgetMinutes: number;     // 43.2
  usedMinutes: number;       // measured from incidents
  remainingMinutes: number;  // budget - used
  remainingPercent: number;  // remaining / budget
}

function calculateErrorBudget(
  sloPercent: number,
  windowDays: number,
  actualAvailability: number,
): ErrorBudget {
  const windowMinutes = windowDays * 24 * 60;
  const budgetPercent = 100 - sloPercent;
  const budgetMinutes = windowMinutes * (budgetPercent / 100);
  const usedMinutes = windowMinutes * ((100 - actualAvailability * 100) / 100);

  return {
    sloPercent,
    windowDays,
    budgetMinutes,
    usedMinutes,
    remainingMinutes: budgetMinutes - usedMinutes,
    remainingPercent: (budgetMinutes - usedMinutes) / budgetMinutes,
  };
}
```

## Error Budget Policy

Document what the team does at different budget levels:

```markdown
## Error Budget Policy

### > 50% remaining
- Normal operations
- Chaos experiments encouraged
- Feature deployments proceed
- Risky infrastructure changes OK with review

### 25-50% remaining
- Slow chaos experiment cadence
- Require post-mortems for any SLO violations
- Review and improve monitoring

### < 25% remaining
- Freeze non-critical feature deployments
- Focus engineering time on reliability improvements
- Cancel chaos experiments until budget recovers

### Exhausted (0%)
- Feature freeze (critical fixes only)
- Incident review for all SLO violations
- Executive visibility
- Recovery plan required before feature work resumes
```

## Chaos Experiments and the Error Budget

Chaos experiments intentionally consume error budget — that's the point. Track this explicitly:

```typescript
interface ChaosExperiment {
  name: string;
  plannedBudgetCost: number; // estimated minutes of budget consumed
  actualBudgetCost: number;  // measured after experiment
  hypothesis: string;
  result: 'passed' | 'failed' | 'aborted';
  findings: string[];
}

// Before running an experiment:
function canRunExperiment(budget: ErrorBudget, experiment: ChaosExperiment): boolean {
  // Don't run if experiment would exhaust remaining budget
  return budget.remainingMinutes > experiment.plannedBudgetCost * 2; // 2x safety margin
}
```

If you're low on error budget, run experiments in staging only. Save production experiments for when you have budget to spend.

## SLOs for Downstream Dependencies

Your SLO is limited by your dependencies' SLOs. If payment service has 99.9% availability, your checkout flow cannot realistically offer better than 99.9%:

```
Your availability = product of all critical dependency availabilities
  = 99.95% (your app) × 99.9% (payment) × 99.99% (database)
  = 99.84%

Realistic SLO: 99.8% (leaves margin for correlated failures)
```

Track each dependency's SLO and their actual performance. When a dependency degrades below its SLO, that's a legitimate excuse for your own budget burn — and a signal to invest in circuit breakers or fallbacks for that dependency.

## Dashboards for Steady State

Put SLI/SLO visibility front and center:

```
Main reliability dashboard:
┌─────────────────────────────────────────────────┐
│ 30-day SLO Status          Current: 99.94%      │
│ Target: 99.9%              Status: ✓ PASSING     │
│                                                  │
│ Error Budget                                     │
│ Budget: 43.2 min           Used: 17.3 min (40%) │
│ Remaining: 25.9 min        Burn rate: normal     │
│                                                  │
│ Current SLIs (5min window)                       │
│ Availability: 99.97%   Latency p99: 187ms        │
│ Checkout success: 99.4%                          │
└─────────────────────────────────────────────────┘
```

This dashboard tells you in 10 seconds whether the system is healthy and how much risk budget you have. Reference it before every chaos experiment and every major deployment.

