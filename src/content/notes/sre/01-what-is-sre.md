---
title: "What SRE Actually Is"
subtitle: "Class SRE implements DevOps. The error-budget contract, toil cap, and the embedded engineer model that makes Google's reliability work."
chapter: 1
level: "beginner"
readingTime: "14 min"
topics: ["SRE", "error budget", "toil", "DevOps", "reliability"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The one-sentence definition

> Site Reliability Engineering is what happens when you ask a software engineer to design an operations team.
> — Ben Treynor Sloss, founder of SRE at Google

That sentence is the whole discipline. SRE replaces shell-script-driven ops with engineering: code, automation, statistical thinking, and a hard budget for how much "ops work" a team is allowed to absorb.

## SRE vs DevOps vs Platform Engineering

These three terms get used interchangeably and they are not the same.

| Discipline | Owns | Optimizes for | Headline metric |
|------------|------|---------------|-----------------|
| **DevOps** | Pipeline + culture | Deploy frequency | Lead time, MTTR |
| **Platform Eng** | Internal developer platform (IDP) | Developer self-service | Time-to-first-deploy |
| **SRE** | Production reliability | Error budget compliance | SLO attainment |

You can think of it as: DevOps is a philosophy, Platform Engineering is a product, SRE is a job role with hard numerical constraints.

<Callout type="info">

**Real-World Analogy**

A pilot is not a mechanic. A mechanic is not the airline's safety board. SRE is the safety board: they set the safety budget (error budget), they investigate every incident, and they have the authority to ground the fleet (block releases) when the budget is blown.

</Callout>

## The error-budget contract

The single most important SRE concept. It turns reliability into a negotiable currency between product (who want features) and SRE (who want stability).

```typescript
// Service Level Objective — the promise to users
const checkoutSLO = {
  target: 0.999,        // 99.9% of requests must succeed
  window: "30d rolling",
};

// Error budget — the inverse of the SLO
const errorBudget = 1 - checkoutSLO.target; // 0.001 = 0.1%

// In a 30-day window:
// 30 * 24 * 60 = 43,200 minutes
// 0.1% of that = 43.2 minutes of allowable badness
const allowedDowntimeMinutes = 30 * 24 * 60 * errorBudget; // 43.2

// Or, expressed in requests:
// If checkout receives 100M requests/month,
// you can fail 100,000 of them before the SLO is violated.
const monthlyRequests = 100_000_000;
const allowedFailures = monthlyRequests * errorBudget; // 100,000
```

### What "error budget" actually buys you

```typescript
// Pre-SRE world: ops vetoes every risky deploy
// Post-SRE world: deploys are governed by budget state

type BudgetState = "healthy" | "burning" | "exhausted";

function deployPolicy(state: BudgetState) {
  switch (state) {
    case "healthy":   return "Ship aggressively. Try the risky migration.";
    case "burning":   return "Ship carefully. Canary at 1% for 24h before full rollout.";
    case "exhausted": return "Feature freeze. Reliability work only until budget recovers.";
  }
}
```

This is the deal: product gets to spend the budget on launches, experiments, and risky migrations. SRE never says "no, that's too risky." They say "the budget is spent, you cannot deploy non-reliability work until the rolling window recovers." The number adjudicates, not a person.

## The toil cap

The second pillar. Toil is manual, repetitive, automatable, tactical work that scales linearly with service growth. Google caps SRE toil at **50% of a team's time**.

```typescript
// Toil examples (must be eliminated):
const toil = [
  "Manually restarting a stuck pod every Tuesday",
  "Filing the same Jira ticket after every release",
  "Copy-pasting cert renewal commands every 90 days",
  "Hand-editing a load balancer config to add a new shard",
];

// Engineering work (the other 50%+):
const engineering = [
  "Writing a controller that auto-restarts stuck pods",
  "Building a release-notes generator",
  "Implementing cert-manager with auto-renewal",
  "Adding consistent hashing so the LB scales itself",
];
```

If a team is at 80% toil, they have no time to build the automation that would reduce toil. They drown. The cap is what prevents the drowning spiral.

<Callout type="tip">

**Track toil quarterly.** Have every SRE log time in two columns: toil vs project. If toil exceeds 50% for two quarters, the team gets headcount or scope cuts. This is non-negotiable. Without the cap, SRE is just a renamed ops team.

</Callout>

## The embedded engineer model

A real SRE team does not sit in a separate "ops" silo. The model that works:

```
Product team owns the service.
SRE is embedded for a fixed term (6-12 months) per service.

Embedding goal: bring the service to a "production-ready" bar
so the SRE team can disengage and the product team operates it
independently.

If the service degrades after disengagement, SRE can hand it
back ("we are returning the pager"). This is a real, exercised right.
```

The "returning the pager" mechanism is the back-pressure that prevents product teams from shipping unreliable services and dumping them on SRE.

## SRE org structures (real examples)

```typescript
// Three real-world SRE org patterns

const patterns = {
  google: {
    structure: "Embedded SRE per product (Search SRE, Ads SRE, ...)",
    pager: "SRE holds the pager for services they accept",
    pro: "Deep service expertise",
    con: "Hard to share knowledge across SRE teams",
  },
  netflix: {
    structure: "No SRE. CORE team owns shared resilience tooling.",
    pager: "Product teams hold their own pager (you build it, you run it)",
    pro: "No reliability silo, full ownership",
    con: "Requires extreme engineering maturity",
  },
  stripe: {
    structure: "Hybrid — Foundation SRE + embedded SRE per critical surface",
    pager: "Foundation SRE owns infra pager; product owns app pager",
    pro: "Clear infra/app split",
    con: "Boundary disputes during incidents",
  },
};
```

## A day in the life

What an SRE actually does, hour by hour, on a typical Tuesday:

```
09:00  Standup. Review last night's SLO burn rate dashboard.
09:30  Postmortem doc for Friday's incident — write Phase 3 (action items).
10:30  PRR (Production Readiness Review) for a new service.
       Block launch on missing runbook + missing dashboard.
12:00  Pair with a backend dev to add tracing to slow checkout endpoint.
14:00  Project work: build a Terraform module so teams stop hand-rolling
       multi-region failover configs.
16:00  Page fires. Database connection pool exhaustion in EU region.
       Mitigate (increase pool, restart canary). Open incident doc.
17:00  Hand off pager to APAC oncall. Write up timeline before logging off.
```

Notice what is missing: no firefighting all day, no manual ticket grinding. The pager fires occasionally; most of the day is engineering work.

## When you do NOT need SRE

Not every company should have an SRE team. Honest signals you are not ready:

```typescript
// You probably don't need dedicated SRE if:
const skipSRE =
  monthlyActiveUsers < 100_000 ||
  engineerCount < 50 ||
  serviceCount < 10 ||
  !hasOnCallCulture;

// Hire your first SRE when:
const hireFirstSRE =
  pagerDutyAlertsPerWeek > 30 ||
  postmortemsPerMonth > 3 ||
  productEngineersSpendingMoreThanThirtyPercentOnOps;
```

Spinning up an SRE team prematurely creates the same silo problem SRE was invented to solve.

## Stay current

- [Google SRE Book — chapter 1](https://sre.google/sre-book/introduction/) — the canonical definition
- [Google SRE Workbook](https://sre.google/workbook/table-of-contents/) — practical chapters, free
- [Charity Majors — On Call](https://charity.wtf/) — modern blameless ops thinking
- [SREcon archives](https://www.usenix.org/srecon) — yearly talks on how SRE orgs evolve

## Key Takeaways

1. **SRE is operations done by software engineers** — code replaces toil
2. **Error budget is the contract** — it converts reliability into a tradeable resource
3. **50% toil cap is non-negotiable** — without it SRE collapses into ops
4. **Embedding + return-the-pager** keeps product teams accountable for what they build
5. **Don't hire SRE before you have the scale to justify it** — premature SRE is just expensive ops

