---
title: 'Reliability ও SRE Practices'
subtitle: 'SLOs, error budgets, incident response, এবং chaos engineering — কিছু ভুল হলেও সিস্টেম চালু রাখা।'
chapter: 8
level: 'advanced'
topics: ['SRE', 'SLO', 'reliability', 'incident response', 'chaos engineering']
readingTime: '16 মিনিট'
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## SLIs, SLOs, এবং Error Budgets

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা হাসপাতালের backup power system-এর মতো — main grid হয়তো fail করতে পারে, কিন্তু generator কয়েক সেকেন্ডের মধ্যে চালু হয়ে যায়। Reliability engineering নিশ্চিত করে যে আপনার সিস্টেম failure-এর মধ্যেও চালু থাকে — ঠিক যেমন হাসপাতাল downtime সহ্য করতে পারে না।

</Callout>

```typescript
// SLI (Service Level Indicator): a measurement
// "What percentage of requests complete in under 200ms?"
const latencySLI = successfulFastRequests / totalRequests;

// SLO (Service Level Objective): a target
// "99.9% of requests should complete in under 200ms"
const latencySLO = 0.999;

// Error Budget: how much failure you can tolerate
// 99.9% SLO = 0.1% error budget = 43 minutes of downtime per month
const errorBudget = 1 - latencySLO; // 0.001

// If you've used 80% of your error budget this month:
// → Slow down risky deployments
// → Focus on reliability work
// If you have plenty of budget left:
// → Ship features faster, take more risks
```

### SLO বেছে নেওয়া

```typescript
// Common SLOs:
const slos = {
	availability: {
		target: 0.999, // 99.9%
		measurement: 'successful responses / total responses',
		window: '30 days rolling'
	},
	latency: {
		target: 0.99, // 99%
		measurement: 'requests under 200ms / total requests',
		window: '30 days rolling'
	},
	correctness: {
		target: 0.9999, // 99.99%
		measurement: 'correct responses / total responses',
		window: '30 days rolling'
	}
};

// The nines:
// 99%    = 7.3 hours downtime/month  (probably too low)
// 99.9%  = 43 minutes/month          (good for most services)
// 99.95% = 22 minutes/month          (requires serious investment)
// 99.99% = 4.3 minutes/month         (extremely hard/expensive)
```

<Callout type="tip">

**100% uptime-এর লক্ষ্য রাখবেন না।** এটা অসম্ভব এবং এর খরচ exponentially বাড়ে। user-দের প্রত্যাশার সাথে মেলে এমন একটা SLO বেছে নিন। একটা internal tool হয়তো 99.5%-এ ঠিক থাকবে। একটা payment API-এর 99.99% দরকার।

</Callout>

## Incident Response

```typescript
// Incident lifecycle:
// 1. Detection  — alert fires (automated)
// 2. Triage     — assess severity (1-5 minutes)
// 3. Mitigation — stop the bleeding (rollback, scale up, failover)
// 4. Resolution — fix the root cause
// 5. Postmortem — learn from it (blameless)

interface Incident {
	severity: 'SEV1' | 'SEV2' | 'SEV3';
	// SEV1: users impacted, revenue loss → all hands, war room
	// SEV2: degraded service → on-call team
	// SEV3: minor issue → normal priority

	roles: {
		incidentCommander: string; // coordinates response
		communicator: string; // updates stakeholders
		responders: string[]; // debug and fix
	};

	timeline: Array<{
		time: Date;
		action: string;
		who: string;
	}>;
}
```

### Blameless Postmortems

```typescript
// After every SEV1/SEV2, write a postmortem:
interface Postmortem {
	title: string; // "API outage due to database connection pool exhaustion"
	date: Date;
	duration: string; // "47 minutes"
	impact: string; // "12% of API requests failed"
	rootCause: string; // what actually broke
	timeline: string[]; // minute-by-minute of detection → resolution
	whatWentWell: string[]; // "Alerts fired within 2 minutes"
	whatWentPoorly: string[]; // "Runbook was outdated"
	actionItems: Array<{
		task: string;
		owner: string;
		deadline: Date;
		priority: 'P0' | 'P1' | 'P2';
	}>;
}

// Key principle: blame the SYSTEM, not the person
// "The deployment pipeline lacked a canary phase"
// NOT "Ahmad deployed bad code"
```

## Chaos Engineering

আসল outage ঘটানোর আগেই দুর্বলতা খুঁজে বের করতে ইচ্ছাকৃতভাবে failure inject করা।

```typescript
// Start simple:
const chaosExperiments = [
	// Level 1: Known failures
	'Kill a random pod — does Kubernetes reschedule it?',
	'Block database access — does the app degrade gracefully?',
	'Inject 500ms latency — do timeouts and retries work?',

	// Level 2: Infrastructure
	'Kill an entire availability zone — does traffic failover?',
	'Fill the disk — does the app handle it?',
	'Expire TLS certificates — do alerts fire?',

	// Level 3: Gameday
	'Simulate a full database failover during peak traffic',
	'Test disaster recovery: restore from backup in a new region'
];

// The chaos engineering loop:
// 1. Hypothesize: "If we kill 1 of 3 API pods, latency stays under 300ms"
// 2. Run experiment in staging first, then production
// 3. Measure: did the hypothesis hold?
// 4. Fix: if it didn't, fix the weakness
// 5. Repeat
```

<Callout type="warning">

**Chaos experiments staging-এ শুরু করুন।** আপনার monitoring, alerting, এবং rollback mechanism-এর উপর আস্থা তৈরি হওয়ার পরেই কেবল production-এ চালান। experiment সঙ্গে সঙ্গে থামানোর জন্য সবসময় একটা kill switch রাখুন।

</Callout>

## Runbooks

```typescript
// Every alert should link to a runbook:
interface Runbook {
	alert: string; // "HighErrorRate"
	description: string; // what this alert means
	severity: string;
	steps: string[]; // diagnostic steps
	mitigations: string[]; // quick fixes
	escalation: string; // who to call if steps don't work
	lastUpdated: Date; // stale runbooks are dangerous
}

// Example:
// Alert: HighErrorRate
// 1. Check error logs: kubectl logs -l app=api --tail=100
// 2. Check recent deployments: kubectl rollout history deployment/api
// 3. If recent deployment: kubectl rollout undo deployment/api
// 4. If database related: check connection pool metrics
// 5. Escalate to: #team-platform in Slack
```

## মূল কথা

1. **User-দের প্রত্যাশার ভিত্তিতে SLO সেট করুন** — তারপর reliability আর velocity-এর ভারসাম্য রাখতে error budgets ব্যবহার করুন
2. **আগে mitigate করুন, পরে debug করুন** — আপনি তদন্ত করার সময় rollback/failover রক্তক্ষরণ থামায়
3. **Blameless postmortems সিস্টেমকে উন্নত করে** — ব্যক্তিকে নয়, process-কে দোষ দিন
4. **Chaos engineering user-দের আগেই দুর্বলতা খুঁজে বের করে** — ছোট থেকে শুরু করুন, staging-এ
