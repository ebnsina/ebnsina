---
title: "Runbooks & Incident Response"
subtitle: "Writing runbooks people will actually use, incident commander patterns, post-mortems that produce real change."
chapter: 5
level: "intermediate"
readingTime: "9 min"
topics: ["runbooks", "incident response", "post-mortem", "on-call", "communication"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

An ER triage protocol: not a guide for doctors who have time to think — it's a series of immediate, specific actions for the first five minutes when someone is brought in critical. Good runbooks are the same: written for a stressed engineer at 3am who needs to act, not think.

</Callout>

## What Makes a Runbook Usable

Most runbooks fail not because they're wrong, but because they're not actually useful in an incident:

**Useless runbook:**
> "When the database is unavailable, restore service according to the DR procedure and notify stakeholders."

**Useful runbook:**
```markdown
# Database Unavailable Runbook

**Trigger:** PagerDuty alert "database-primary-down" fires
**Owner:** Database on-call
**Last tested:** 2024-01-15

## First 5 minutes: triage

1. Verify the alert is real (not a flapping monitor):
   ```bash
   psql $DATABASE_URL -c "SELECT 1" 2>&1
   ```
   If this returns: "connection refused" → primary is down, continue
   If this returns data → false alarm, acknowledge and close

2. Check if replica is available:
   ```bash
   psql $REPLICA_DATABASE_URL -c "SELECT 1" 2>&1
   ```
   Yes → Go to Section A (failover to replica)
   No  → Go to Section B (restore from backup)

3. Open incident:
   - PagerDuty: escalate to secondary if no response in 5 min
   - Slack: post in #incidents "Database outage in progress, investigating"
   - Status page: set to "Investigating"
```

Good runbooks are **imperative** (do this, then this), **specific** (exact commands, not descriptions), and **decision-tree shaped** (if X, do Y; if Z, do W).

## Runbook Structure

```markdown
# [Service Name] [Failure Mode] Runbook

**Severity:** P1 / P2 / P3
**RTO target:** 60 minutes
**Owner:** [Team or rotation]
**Last tested:** [Date] by [Person] — actual RTO: [N] minutes
**Escalation:** If no progress in 30 min, page [name]

## Symptoms
- Alert name and what it means
- What users experience

## Pre-requisites
- Access required (AWS account, SSH keys, kubectl context)
- Tools needed and where to find them

## Diagnostic steps (first 10 minutes)
[Numbered steps with exact commands]

## Resolution paths
### Path A: [Common case]
[Steps]

### Path B: [Alternative]
[Steps]

## Verification
[How to confirm the system is recovered]
[Specific checks to run before declaring resolved]

## Communication templates
**Initial:** "We are investigating [issue]. Updates every 15 minutes."
**Update:** "Root cause identified as [X]. Expected resolution at [time]."
**Resolution:** "Issue resolved at [time]. [N] minutes of impact. Post-mortem to follow."

## Post-incident
- [ ] Update status page to resolved
- [ ] Post timeline in #incidents
- [ ] Open post-mortem within 48 hours
- [ ] Update this runbook if any steps were wrong
```

## Incident Roles

Clear roles prevent the "too many cooks" problem where everyone is acting and nobody is coordinating.

**Incident Commander (IC):**
- Owns the incident timeline and decisions
- Delegates investigation tasks, doesn't do them personally
- Manages external communication
- Calls the "all clear" when resolved
- One person — if there are two ICs, there is none

**Technical Lead:**
- Drives investigation and resolution
- Reports findings to IC
- Can ask for help without losing ownership

**Communicator:**
- Updates status page, Slack, customer communications
- Frees technical leads from context-switching to comms

**Scribe:**
- Documents timeline in real time (timestamps, what was tried, what was found)
- Invaluable for post-mortem — memory fades fast under stress

```
[10:02] IC: @alice you're technical lead. @bob you're communicator.
[10:03] alice: checking replication lag
[10:04] alice: primary is up, replica is 47 minutes behind — something's wrong with WAL sender
[10:05] IC: @bob update status page: "Investigating elevated database latency"
[10:06] alice: found it — WAL sender process crashed. restarting.
[10:08] alice: lag recovering — now 35 minutes behind
[10:15] alice: lag at 2 minutes, system recovering normally
[10:22] alice: lag at 10 seconds, application latency back to baseline
[10:25] IC: declaring resolved. @bob update status page. opening post-mortem.
```

## Communication Cadence

Silence is the worst thing during an incident. Update stakeholders even when you have nothing new:

```
T+0:   Acknowledge the incident publicly ("We are aware and investigating")
T+15:  Update with what you know ("Root cause identified as X, working on fix")
T+30:  Update or ETA ("Expected resolution by T+45")
T+45:  Update ("Fix deployed, monitoring recovery")
T+60:  Resolution or escalation ("Resolved" or "Escalating, bringing in [team]")
```

If you have nothing new: "We're still investigating, update in 15 minutes." Never go silent for more than 15 minutes during a P1.

## The Post-Mortem

A blameless post-mortem finds systemic causes, not individual fault. The goal is learning, not punishment.

**Write within 48 hours — not after a week.**

```markdown
# Post-Mortem: Database WAL Sender Crash — 2024-01-22

**Severity:** P1 (database latency > 30 seconds for 23 minutes)
**Duration:** 10:02 – 10:25 (23 minutes)
**Impact:** ~1,200 users experienced slow or failed requests
**Authors:** @alice, @bob

## Summary

The WAL sender process on the primary database crashed due to a memory
allocation failure, causing replication lag to build to 47 minutes before
detection. Recovery involved manually restarting the WAL sender process.

## Timeline

| Time  | Event |
|-------|-------|
| 09:55 | WAL sender process crashes (undetected) |
| 09:55 | Replication lag begins growing |
| 10:02 | Alert fires: "replica lag > 5 minutes" |
| 10:02 | On-call @alice paged |
| 10:04 | alice identifies crashed WAL sender |
| 10:06 | WAL sender restarted |
| 10:25 | Lag recovered, p99 latency baseline |

## Root cause

Memory allocation failure in WAL sender caused by OOM condition on primary
database server. The primary was at 94% memory utilization; a spike in
analytical queries pushed it over the limit and the kernel OOM-killed
the WAL sender process.

## Contributing factors

1. No alert for WAL sender process health (only lag was monitored)
2. Analytical queries running on primary (should be on replica)
3. Memory utilization not alerting until 95% (too late)

## What went well

- Runbook covered this exact scenario with correct commands
- IC/technical lead separation worked — no coordination confusion
- Status page updated promptly

## What didn't go well

- 7-minute gap between crash (09:55) and alert (10:02)
- Replica at 47 minutes of lag — much worse RPO than our 15-minute target
- Communicator didn't have status page access initially (3-minute delay)

## Action items

| Action | Owner | Due |
|--------|-------|-----|
| Alert on WAL sender process count (should be > 0) | @alice | Jan 29 |
| Move analytical queries to read replica | @carol | Feb 5 |
| Lower memory alert threshold to 80% | @alice | Jan 25 |
| Add status page access for all on-call engineers | @bob | Jan 24 |
| Update runbook with memory pressure diagnostic steps | @alice | Jan 29 |
```

## Making Post-Mortems Produce Change

Post-mortems generate action items. Action items get forgotten. Close the loop:

```
1. Track action items in your project management tool (not just the doc)
2. Assign owners — "team" is not an owner
3. Set specific due dates — "soon" is not a date
4. Review in weekly engineering meeting until all items closed
5. Verify the fix: re-run the drill that exposed the gap
```

A post-mortem where nothing changes is documentation of a failure that will happen again.

## On-Call Health

Good incident response requires healthy on-call practices:

```
□ Alert fatigue audit: count pages per week per person
  More than 2-3 pages/week/person = too much noise
□ Runbooks updated within 48 hours of every incident
□ No silent pages — every alert has a runbook
□ On-call rotation covers at least 3 people (no single hero)
□ Post-mortems have specific owners, not "the team"
□ DR drills scheduled on calendar, not just intended
□ On-call engineers compensated fairly (time off, extra pay, or both)
```

Burnout from on-call is an engineering effectiveness problem. Each incident handled by an exhausted engineer takes longer, resolves less well, and produces worse post-mortems.

