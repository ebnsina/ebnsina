---
title: 'Reliability & SRE Practices'
subtitle: 'SLOs, error budgets, incident response, and chaos engineering — keeping systems running when things go wrong.'
chapter: 8
level: 'advanced'
readingTime: '16 min'
topics: ['SRE', 'SLO', 'reliability', 'incident response', 'chaos engineering']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## SLIs, SLOs, and Error Budgets

<Callout type="info">

**Real-World Analogy**

Like a hospital's backup power system — the main grid might fail, but the generator kicks in within seconds. Reliability engineering ensures your system keeps running through failures — just like hospitals can't afford downtime.

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

### Choosing SLOs

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

**Don't aim for 100% uptime.** It's impossible and the cost grows exponentially. Choose an SLO that matches user expectations. An internal tool might be fine at 99.5%. A payment API needs 99.99%.

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

Deliberately inject failures to discover weaknesses before they cause real outages.

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

**Start chaos experiments in staging.** Run in production only after you have confidence in your monitoring, alerting, and rollback mechanisms. Always have a kill switch to stop the experiment immediately.

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

## Key Takeaways

1. **Set SLOs based on user expectations** — then use error budgets to balance reliability and velocity
2. **Mitigate first, debug later** — rollback/failover stops the bleeding while you investigate
3. **Blameless postmortems improve systems** — blame the process, not the person
4. **Chaos engineering finds weaknesses** before users do — start small, in staging
