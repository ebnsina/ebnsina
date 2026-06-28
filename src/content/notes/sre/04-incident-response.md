---
title: 'Incident Response & On-Call'
subtitle: "ICS roles, severity classification, comms cadence, and the on-call rotation that doesn't burn engineers out."
chapter: 4
level: 'intermediate'
readingTime: '17 min'
topics: ['incident response', 'on-call', 'ICS', 'PagerDuty', 'war room']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A fire drill — the procedures exist so that when the real fire happens, nobody is improvising.

</Callout>

## The five phases of an incident

Every incident, regardless of size, moves through the same five phases. Naming them out loud during the response keeps the team coordinated.

```
1. DETECT      Alert fires (or human notices)
2. TRIAGE      Assess severity, assemble responders, declare incident
3. MITIGATE    Stop the bleeding (rollback, failover, kill switch)
4. RESOLVE    Fix the root cause (often hours/days after mitigation)
5. LEARN       Postmortem, action items, share learnings
```

The biggest mistake junior responders make is conflating Mitigate and Resolve. **Mitigate first, debug later.** If a deploy is on fire, roll it back, then investigate the rolled-back code at leisure. Don't try to fix forward in the middle of an outage.

## Severity classification (a real one)

Severity must be defined in writing, before the incident, and posted in the on-call runbook. Here is a battle-tested grid you can adapt:

```
SEV1  Customer-visible outage, data loss, security breach,
      revenue impact >$1k/min, regulatory exposure
      → Page incident commander + on-call lead + comms
      → Stand up war room within 5 minutes
      → Status page update within 15 minutes
      → Executive update every 30 minutes

SEV2  Major degradation: significant feature broken, key
      customer impacted, SLO budget burning at >10x rate
      → Page primary on-call
      → Internal Slack channel
      → Status page update if customer-visible

SEV3  Minor degradation: non-critical feature impaired,
      latency elevated but within SLO
      → Ticket-grade alert; no page
      → Investigate next business day

SEV4  Cosmetic, internal-only, or self-recovering
      → Log it; aggregate weekly
```

The grid prevents the most common dispute in incident response: "is this a SEV1 or a SEV2?" Decide it before the adrenaline hits.

<Callout type="warning">

**Err toward higher severity at declaration time.** It is cheap to downgrade a SEV1 to SEV2 ten minutes in. It is expensive to realize at hour 2 that you understaffed the response.

</Callout>

## Incident Command System (ICS) roles

Borrowed from firefighting and FEMA, ICS gives every responder a clear lane.

```
INCIDENT COMMANDER (IC)
  Owns the response. Single decision-maker.
  Does NOT debug. Coordinates, decides, delegates.
  Can be a junior engineer — authority comes from the role.

OPERATIONS LEAD (OL)
  Drives technical mitigation. Runs the actual debugging.
  Reports findings to IC.

COMMUNICATIONS LEAD (CL)
  Owns external comms: status page, customer support, executives.
  Frees IC and OL to focus on the system.

SCRIBE
  Captures the timeline in real time. Every command run, every
  hypothesis, every decision. The scribe document becomes the
  postmortem skeleton.

SUBJECT MATTER EXPERTS (SMEs)
  Pulled in by IC as needed. Database SME, network SME, etc.
  They answer questions; they do not run the incident.
```

For a SEV1 you fill all four named roles. For a SEV2, IC + OL + Scribe is enough. The IC must explicitly NOT touch the keyboard — their job is to think one level above the debugging.

## The on-call rotation that doesn't break people

```typescript
// Anti-patterns that destroy on-call teams:
const broken = {
	rotation: 'Same 3 people forever', // burnout in 6 months
	handoff: 'None — silent transition', // dropped context
	pageVolume: '10+ pages per shift', // sleep deprivation
	daytimeWork: 'Same as non-on-call week', // exhaustion
	comp: "None — 'it's part of the job'" // resentment
};

// What works:
const sustainable = {
	rotation: '8+ engineers, 1-week shifts',
	handoff: '30-min sync at start: open issues, recent deploys, watchlist',
	pageVolume: '<5 pages/week (else: fix the noise)',
	daytimeWork: 'On-call week is project-light; backlog/runbook focused',
	comp: 'Per-shift stipend OR comp time off after',
	followUp: 'Every page reviewed in weekly on-call retro'
};
```

If your team only has 4 engineers, you do not have an on-call rotation. You have a death march. Hire more, narrow the on-call scope, or use a paid follow-the-sun service.

### The handoff template

```markdown
# On-call handoff: [outgoing engineer] → [incoming engineer]

Date: 2026-05-03
Time: 09:00 PT

## Open incidents

- INC-2247: Checkout p99 elevated since Friday. Mitigated by autoscaler bump.
  Root cause TBD. Next step: OL to review traces.

## Recent deploys (past 48h)

- payment-service v2.14.0 — small refactor, no incidents
- checkout v3.8.1 — autoscaler config change (related to INC-2247)

## Watchlist

- DB primary CPU trending up (60% → 75% over 7 days)
- Kafka consumer lag on order-events occasionally spikes; tolerable for now

## Known noise

- "S3 5xx burst" alert fires daily at 03:15 UTC during cost-report job
  → Suppressed in PagerDuty until INFRA-882 lands

## Anything you should know

- Big marketing push tomorrow 10am PT — expect 3-5x normal traffic
```

## Status page communication

External comms is its own discipline. The template that works for almost any incident:

```
[INVESTIGATING]   We are investigating reports of [symptom]. We will
                  update within 30 minutes.

[IDENTIFIED]      We have identified the cause of [symptom] as
                  [neutral description, no blame, no jargon].
                  Mitigation is underway.

[MONITORING]      A fix has been applied to [symptom]. We are
                  monitoring to confirm full recovery.

[RESOLVED]        [Symptom] has been resolved. A postmortem will be
                  published within [N] business days.
```

Rules:

1. **Update on a regular cadence** even if there's nothing new. "Still investigating, next update at 14:30" is better than 90 minutes of silence.
2. **Plain language**. "Some users may be unable to check out" beats "the order pipeline experienced a partial degradation."
3. **No internal jargon**. The reader does not know what "the canary" is.
4. **No blame, no speculation**. Especially not on third parties — you'll be wrong half the time.

## A complete incident channel template

Spin up a dedicated Slack/Teams channel for every SEV1/SEV2. Pin this template at the top:

```markdown
# Incident: INC-2271 — Checkout returning 503s

**Status**: INVESTIGATING
**Severity**: SEV1
**Started**: 2026-05-03 14:22 UTC
**IC**: @alice
**OL**: @bob
**CL**: @carol
**Scribe**: @dan
**Status page**: status.example.com/incidents/abc123

## Current hypothesis

Database connection pool exhaustion in EU region.

## Mitigation in progress

1. Bumping pool size from 50 → 100 (in progress)
2. Diverting EU traffic to US (decided against — too much latency)

## Timeline

14:22 Page fired (CheckoutErrorBudgetFastBurn)
14:24 IC declared SEV1
14:28 OL identified DB connection saturation
14:31 Hypothesis posted, mitigation 1 started
14:35 Connection pool bump deployed to canary
...
```

Everything goes in this channel. Threads for side conversations. No DMs about the incident — the scribe needs to capture every decision.

## Drills (the part everyone skips)

You cannot expect people to perform incident response correctly under pressure if they have never practiced. Run quarterly drills:

```typescript
// Quarterly incident drill template

const drill = {
	scenario: 'Database primary becomes unreachable from app tier',
	injection: 'Block port 5432 with iptables on db-primary',
	region: 'staging',
	observers: ['sre-lead', 'vp-eng'],
	participants: ['full on-call rotation'],

	successCriteria: [
		'IC declared within 5 minutes of first symptom',
		'Status page updated within 15 minutes (simulated)',
		'Mitigation (failover) executed within 20 minutes',
		'Scribe captured complete timeline'
	],

	postDrill: 'Retro within 24h; action items into Jira'
};
```

The first drill always exposes that the runbook has a typo, the failover script needs a flag that nobody knows, and the IC role rotation is unclear. That's the point — better to discover it in staging on a Tuesday than in production at 3am.

## Stay current

- [PagerDuty Incident Response docs](https://response.pagerduty.com/) — the public playbook
- [Google SRE Book — Managing Incidents](https://sre.google/sre-book/managing-incidents/) — IC roles defined
- [Grafana OnCall](https://grafana.com/oss/oncall/) — open-source rotation tool, free tier real
- [Increment magazine — On-Call issue](https://increment.com/on-call/) — how mature orgs run pagers

## Key Takeaways

1. **Mitigate first, debug later** — rollback before root cause
2. **Severity grid is written before the incident**, not argued during one
3. **ICS gives every responder a clear lane** — IC decides, OL debugs, CL communicates
4. **8+ engineers, 1-week shifts, paid on-call** is the floor for sustainable rotation
5. **Drill quarterly** — the first time you exercise a runbook should not be in a real outage
