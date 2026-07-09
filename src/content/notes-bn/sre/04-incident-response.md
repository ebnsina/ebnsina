---
title: 'Incident Response & On-Call'
subtitle: 'ICS roles, severity classification, comms cadence, আর যে on-call rotation engineer-দের burn out করে না।'
chapter: 4
level: 'intermediate'
readingTime: '17 মিনিট'
topics: ['incident response', 'on-call', 'ICS', 'PagerDuty', 'war room']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা fire drill — procedure গুলো থাকে যাতে আসল আগুন লাগলে কেউ improvise না করে।

</Callout>

## একটা incident-এর পাঁচটা phase

আকার নির্বিশেষে প্রতিটা incident একই পাঁচটা phase-এর মধ্য দিয়ে যায়। response-এর সময় এগুলো জোরে নাম ধরে বলা team-কে coordinated রাখে।

```
1. DETECT      Alert fires (or human notices)
2. TRIAGE      Assess severity, assemble responders, declare incident
3. MITIGATE    Stop the bleeding (rollback, failover, kill switch)
4. RESOLVE    Fix the root cause (often hours/days after mitigation)
5. LEARN       Postmortem, action items, share learnings
```

junior responder-রা সবচেয়ে বড় ভুলটা করে Mitigate আর Resolve গুলিয়ে ফেলে। **আগে Mitigate করো, পরে debug করো।** একটা deploy জ্বলছে হলে, ওটাকে roll back করো, তারপর rolled-back code-টা নিরিবিলি তদন্ত করো। outage-এর মাঝখানে fix forward করার চেষ্টা করো না।

## Severity classification (একটা রিয়েল)

Severity অবশ্যই লিখিতভাবে, incident-এর আগে define করা থাকতে হবে, আর on-call runbook-এ post করা থাকতে হবে। এখানে একটা battle-tested grid যা তুমি adapt করতে পারো:

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

grid-টা incident response-এর সবচেয়ে সাধারণ বিবাদ আটকায়: "এটা কি SEV1 নাকি SEV2?" adrenaline আঘাত করার আগেই এটা ঠিক করে নাও।

<Callout type="warning">

**Declaration-এর সময় বেশি severity-র দিকে ভুল করো।** 10 মিনিট পরে একটা SEV1-কে SEV2-তে downgrade করা সস্তা। hour 2-তে বুঝতে পারা যে তুমি response-টা understaff করেছ, সেটা ব্যয়বহুল।

</Callout>

## Incident Command System (ICS) roles

firefighting আর FEMA থেকে ধার করা, ICS প্রতিটা responder-কে একটা পরিষ্কার লেন দেয়।

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

একটা SEV1-এর জন্য তুমি চারটা named role-ই পূরণ করো। একটা SEV2-এর জন্য IC + OL + Scribe যথেষ্ট। IC-কে অবশ্যই স্পষ্টভাবে keyboard-এ হাত দেওয়া থেকে বিরত থাকতে হবে — তার কাজ debugging-এর এক লেভেল উপরে চিন্তা করা।

## যে on-call rotation মানুষ ভাঙে না

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

তোমার team-এ যদি মাত্র 4 জন engineer থাকে, তোমার একটা on-call rotation নেই। তোমার একটা death march আছে। আরও hire করো, on-call scope সংকীর্ণ করো, বা একটা paid follow-the-sun service ব্যবহার করো।

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

External comms নিজেই একটা discipline। যে template প্রায় যেকোনো incident-এর জন্য কাজ করে:

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

নিয়ম:

1. **একটা নিয়মিত cadence-এ update দাও** নতুন কিছু না থাকলেও। "এখনো investigating, পরের update 14:30-এ" 90 মিনিটের নীরবতার চেয়ে ভালো।
2. **সহজ ভাষা**। "কিছু user হয়তো checkout করতে পারছে না" — "the order pipeline experienced a partial degradation"-এর চেয়ে ভালো।
3. **কোনো internal jargon নয়**। পাঠক জানে না "the canary" কী।
4. **কোনো blame নয়, কোনো speculation নয়**। বিশেষত third party-দের নিয়ে নয় — তুমি অর্ধেক সময় ভুল হবে।

## একটা সম্পূর্ণ incident channel template

প্রতিটা SEV1/SEV2-এর জন্য একটা dedicated Slack/Teams channel দাঁড় করাও। উপরে এই template-টা pin করো:

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

সবকিছু এই channel-এ যায়। পাশের আলাপের জন্য thread। incident নিয়ে কোনো DM নয় — scribe-কে প্রতিটা decision capture করতে হয়।

## Drills (যে অংশটা সবাই এড়িয়ে যায়)

তুমি আশা করতে পারো না যে মানুষ চাপের মধ্যে incident response ঠিকমতো করবে যদি তারা কখনো প্র্যাকটিস না করে থাকে। ত্রৈমাসিক drill চালাও:

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

প্রথম drill-টা সবসময় ফাঁস করে দেয় যে runbook-এ একটা typo আছে, failover script-এ এমন একটা flag লাগে যা কেউ জানে না, আর IC role rotation অস্পষ্ট। ঐটাই মূল কথা — মঙ্গলবার staging-এ এটা আবিষ্কার করা রাত 3টায় production-এ করার চেয়ে ভালো।

## Stay current

- [PagerDuty Incident Response docs](https://response.pagerduty.com/) — public playbook
- [Google SRE Book — Managing Incidents](https://sre.google/sre-book/managing-incidents/) — IC roles defined
- [Grafana OnCall](https://grafana.com/oss/oncall/) — open-source rotation tool, free tier আসল
- [Increment magazine — On-Call issue](https://increment.com/on-call/) — mature org-রা কীভাবে pager চালায়

## Key Takeaways

1. **আগে Mitigate, পরে debug** — root cause-এর আগে rollback
2. **Severity grid incident-এর আগে লেখা হয়**, তার সময় তর্ক নয়
3. **ICS প্রতিটা responder-কে একটা পরিষ্কার লেন দেয়** — IC decide করে, OL debug করে, CL communicate করে
4. **8+ engineers, 1-week shifts, paid on-call** হচ্ছে sustainable rotation-এর floor
5. **ত্রৈমাসিক drill করো** — একটা runbook প্রথমবার exercise করার সময়টা যেন একটা রিয়েল outage না হয়
