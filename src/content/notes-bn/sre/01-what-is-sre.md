---
title: 'SRE আসলে কী'
subtitle: 'Class SRE implements DevOps। error-budget contract, toil cap, আর embedded engineer model যা Google-এর reliability-কে কাজ করায়।'
chapter: 1
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['SRE', 'error budget', 'toil', 'DevOps', 'reliability']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## এক-বাক্যের সংজ্ঞা

> Site Reliability Engineering হচ্ছে সেটাই যা ঘটে যখন তুমি একজন software engineer-কে একটা operations team ডিজাইন করতে বলো।
> — Ben Treynor Sloss, Google-এ SRE-র প্রতিষ্ঠাতা

ঐ বাক্যটাই পুরো disciplineটা। SRE, shell-script-চালিত ops-কে engineering দিয়ে replace করে: code, automation, statistical thinking, আর একটা team কতটুকু "ops work" শুষে নিতে পারবে তার একটা hard budget।

## SRE vs DevOps vs Platform Engineering

এই তিনটা টার্ম একে অপরের বদলে ব্যবহার হয় আর এরা এক জিনিস নয়।

| Discipline       | কী owns করে                       | কীসের জন্য optimize করে | Headline metric      |
| ---------------- | --------------------------------- | ----------------------- | -------------------- |
| **DevOps**       | Pipeline + culture                | Deploy frequency        | Lead time, MTTR      |
| **Platform Eng** | Internal developer platform (IDP) | Developer self-service  | Time-to-first-deploy |
| **SRE**          | Production reliability            | Error budget compliance | SLO attainment       |

তুমি এভাবে ভাবতে পারো: DevOps হচ্ছে একটা philosophy, Platform Engineering হচ্ছে একটা product, SRE হচ্ছে hard numerical constraint সহ একটা job role।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন pilot mechanic নন। একজন mechanic এয়ারলাইনের safety board নন। SRE হচ্ছে safety board: তারা safety budget (error budget) সেট করে, প্রতিটা incident তদন্ত করে, আর budget উড়ে গেলে fleet-কে ground করার (releases block করার) authority তাদের আছে।

</Callout>

## The error-budget contract

সবচেয়ে গুরুত্বপূর্ণ SRE কনসেপ্ট। এটা reliability-কে product (যারা features চায়) আর SRE (যারা stability চায়)-এর মধ্যে একটা negotiable currency-তে পরিণত করে।

```typescript
// Service Level Objective — the promise to users
const checkoutSLO = {
	target: 0.999, // 99.9% of requests must succeed
	window: '30d rolling'
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

### "error budget" আসলে তোমাকে কী কিনে দেয়

```typescript
// Pre-SRE world: ops vetoes every risky deploy
// Post-SRE world: deploys are governed by budget state

type BudgetState = 'healthy' | 'burning' | 'exhausted';

function deployPolicy(state: BudgetState) {
	switch (state) {
		case 'healthy':
			return 'Ship aggressively. Try the risky migration.';
		case 'burning':
			return 'Ship carefully. Canary at 1% for 24h before full rollout.';
		case 'exhausted':
			return 'Feature freeze. Reliability work only until budget recovers.';
	}
}
```

এটাই deal: product-রা budget-টা launches, experiments, আর risky migrations-এ খরচ করতে পারে। SRE কখনো বলে না "না, ওটা বড্ড risky।" তারা বলে "budget খরচ হয়ে গেছে, rolling window রিকভার না হওয়া পর্যন্ত তুমি non-reliability work deploy করতে পারবে না।" সংখ্যাটা বিচার করে, কোনো মানুষ নয়।

## The toil cap

দ্বিতীয় pillar। Toil হচ্ছে manual, repetitive, automatable, tactical কাজ যা service-এর growth-এর সাথে linearly বাড়ে। Google, SRE toil-কে একটা **team-এর সময়ের 50%-এ** cap করে দেয়।

```typescript
// Toil examples (must be eliminated):
const toil = [
	'Manually restarting a stuck pod every Tuesday',
	'Filing the same Jira ticket after every release',
	'Copy-pasting cert renewal commands every 90 days',
	'Hand-editing a load balancer config to add a new shard'
];

// Engineering work (the other 50%+):
const engineering = [
	'Writing a controller that auto-restarts stuck pods',
	'Building a release-notes generator',
	'Implementing cert-manager with auto-renewal',
	'Adding consistent hashing so the LB scales itself'
];
```

একটা team যদি 80% toil-এ থাকে, তাহলে toil কমানোর automation বানানোর সময় তাদের থাকে না। তারা ডুবে যায়। cap-টাই ঐ ডুবে যাওয়ার spiral আটকায়।

<Callout type="tip">

**Toil ত্রৈমাসিকভাবে track করো।** প্রতিটা SRE-কে দুই কলামে সময় log করাও: toil vs project। দুই quarter ধরে toil 50% ছাড়ালে team-কে headcount দেওয়া হয় বা scope কমানো হয়। এটা non-negotiable। cap ছাড়া SRE শুধু একটা নাম-বদলানো ops team।

</Callout>

## The embedded engineer model

একটা রিয়েল SRE team আলাদা একটা "ops" silo-তে বসে না। যে model কাজ করে:

```
Product team owns the service.
SRE is embedded for a fixed term (6-12 months) per service.

Embedding goal: bring the service to a "production-ready" bar
so the SRE team can disengage and the product team operates it
independently.

If the service degrades after disengagement, SRE can hand it
back ("we are returning the pager"). This is a real, exercised right.
```

"returning the pager" mechanism-টাই সেই back-pressure যা product team-কে unreliable service ship করে SRE-র ঘাড়ে ফেলা থেকে আটকায়।

## SRE org structures (real examples)

```typescript
// Three real-world SRE org patterns

const patterns = {
	google: {
		structure: 'Embedded SRE per product (Search SRE, Ads SRE, ...)',
		pager: 'SRE holds the pager for services they accept',
		pro: 'Deep service expertise',
		con: 'Hard to share knowledge across SRE teams'
	},
	netflix: {
		structure: 'No SRE. CORE team owns shared resilience tooling.',
		pager: 'Product teams hold their own pager (you build it, you run it)',
		pro: 'No reliability silo, full ownership',
		con: 'Requires extreme engineering maturity'
	},
	stripe: {
		structure: 'Hybrid — Foundation SRE + embedded SRE per critical surface',
		pager: 'Foundation SRE owns infra pager; product owns app pager',
		pro: 'Clear infra/app split',
		con: 'Boundary disputes during incidents'
	}
};
```

## A day in the life

একটা সাধারণ Tuesday-তে একজন SRE ঘণ্টার পর ঘণ্টা আসলে কী করে:

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

খেয়াল করো কী নেই: সারাদিন firefighting নেই, manual ticket ঘষা নেই। pager মাঝেমধ্যে fire করে; দিনের বেশিরভাগটা engineering work।

## কখন তোমার SRE লাগবে না

প্রতিটা company-র SRE team থাকা উচিত নয়। সৎ signal যে তুমি এখনো ready নও:

```typescript
// You probably don't need dedicated SRE if:
const skipSRE =
	monthlyActiveUsers < 100_000 || engineerCount < 50 || serviceCount < 10 || !hasOnCallCulture;

// Hire your first SRE when:
const hireFirstSRE =
	pagerDutyAlertsPerWeek > 30 ||
	postmortemsPerMonth > 3 ||
	productEngineersSpendingMoreThanThirtyPercentOnOps;
```

অকালে একটা SRE team দাঁড় করানো ঠিক সেই silo সমস্যাটাই তৈরি করে যেটা সমাধানের জন্য SRE আবিষ্কার হয়েছিল।

## Stay current

- [Google SRE Book — chapter 1](https://sre.google/sre-book/introduction/) — canonical definition
- [Google SRE Workbook](https://sre.google/workbook/table-of-contents/) — practical chapters, ফ্রি
- [Charity Majors — On Call](https://charity.wtf/) — modern blameless ops thinking
- [SREcon archives](https://www.usenix.org/srecon) — SRE org কীভাবে evolve হয় তার yearly talks

## Key Takeaways

1. **SRE হচ্ছে software engineer-দের করা operations** — code, toil-কে replace করে
2. **Error budget হচ্ছে contract** — এটা reliability-কে একটা tradeable resource-এ রূপান্তর করে
3. **50% toil cap non-negotiable** — এটা ছাড়া SRE ops-এ ধসে পড়ে
4. **Embedding + return-the-pager** product team-দের যা বানায় তার জন্য accountable রাখে
5. **যথেষ্ট scale না থাকতে SRE hire করো না** — অকালের SRE শুধু ব্যয়বহুল ops
