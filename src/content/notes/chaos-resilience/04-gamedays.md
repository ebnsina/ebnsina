---
title: 'GameDays'
subtitle: 'How to run a structured chaos experiment with a team — planning, execution, post-mortem, and building a resilience culture.'
chapter: 4
level: 'intermediate'
readingTime: '9 min'
topics: ['GameDay', 'incident simulation', 'post-mortem', 'runbooks', 'team exercises']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A fire drill: not a surprise — everyone knows it's happening, exits are reviewed in advance, and afterwards you note what took too long. The point isn't to scare people; it's to ensure that when the real fire happens, the response is practiced muscle memory, not first-time chaos.

</Callout>

## What Is a GameDay

A GameDay is a scheduled chaos engineering exercise where a team intentionally breaks something and practices the response. Unlike ad-hoc experiments, a GameDay is a structured team event:

- Defined scope and hypothesis before the exercise
- Team members in designated roles (chaos engineer, observer, on-call)
- Real-time communication during the experiment
- Formal post-mortem after

GameDays build two things: technical resilience (you find and fix real weaknesses) and team resilience (people practice incident response in a safe context).

## Planning a GameDay

**4-6 weeks before:**

```
□ Choose the scenario (what failure are you simulating?)
□ Define steady state and success/failure criteria
□ Identify blast radius and safeguards
□ Book calendar time (2-4 hours, during business hours)
□ Notify stakeholders (customer success, leadership)
□ Prepare rollback procedures
```

**1 week before:**

```
□ Review runbooks for the scenario
□ Confirm monitoring dashboards are ready
□ Test kill switch / abort procedure
□ Brief participating engineers on their roles
□ Prepare communication templates (status page messages, Slack updates)
```

**Choosing a scenario:** Pick failure modes that are realistic but that you haven't fully validated your resilience for:

- "What happens when our primary database is unavailable?"
- "What happens when our payment provider returns 500 for 5 minutes?"
- "What happens when one of three app servers goes down during peak traffic?"
- "What happens when Redis (our session store) is unreachable?"

## Roles During a GameDay

**Chaos Engineer:** Executes the fault injection. Knows exactly what commands to run and how to stop them. Only one person does this — avoids confusion.

**Incident Commander:** Coordinates the team's response. Makes decisions about escalation and termination. Ideally the on-call rotation lead.

**Observer(s):** Watch metrics, dashboards, and logs. Document what they see in real time. Don't intervene — observe and report.

**Communicator:** Handles external communication during the exercise (status page, Slack, stakeholder updates). Even in a drill, practice the communication flow.

## Running the Experiment

**30 minutes before:**

```bash
# Verify baseline
# All instances healthy? ✓
# Error rate < 0.1%? ✓
# p99 latency < 200ms? ✓
# Dashboards open? ✓
# Team in #gameday-2024-01 Slack channel? ✓
```

**Start the experiment:**

```
[10:00] Chaos Engineer: "Starting experiment. Injecting 500ms latency on payment-service."
[10:00] Observer 1: "Watching payment latency dashboard"
[10:00] Observer 2: "Watching error rate and circuit breaker state"
[10:00] Incident Commander: "Confirmed. Abort condition: error rate > 2% sustained for 2+ minutes"
```

**During the experiment — real-time logging:**

```
[10:01] Observer 1: "Payment p99 climbing: 120ms → 680ms"
[10:01] Observer 2: "Checkout error rate: 0.2% (below abort threshold)"
[10:02] Observer 1: "Circuit breaker status: CLOSED"
[10:03] Observer 2: "Error rate: 0.8% — approaching threshold"
[10:04] Observer 1: "Circuit breaker OPEN — payment calls returning 503"
[10:04] Observer 2: "Checkout error rate: 4.2% — EXCEEDED THRESHOLD"
[10:04] Incident Commander: "Abort. Chaos Engineer: stop fault injection now."
[10:04] Chaos Engineer: "Fault injection stopped. tc rules removed."
[10:05] Observer 1: "Payment latency returning to baseline"
[10:06] Observer 2: "Error rate recovering: 1.2% → 0.3%"
[10:07] Incident Commander: "System recovered. Steady state restored."
```

**What you learned:** Circuit breaker opened as designed, but checkout error rate spiked too high before it opened. The threshold (50% failure rate before opening) is too permissive. Action: lower threshold to 30%.

## Abort Conditions

Define these before you start. The moment any condition is hit, stop everything:

```
Abort conditions for this GameDay:
□ Error rate > 2% sustained for > 2 minutes
□ Any complete loss of a service (0 healthy instances)
□ Customer-visible data corruption
□ Team member requests abort for any reason

Abort procedure:
1. Chaos Engineer runs: ./scripts/chaos-stop.sh
2. Incident Commander: "Aborting GameDay. All hands on recovery."
3. Observer: document timestamp and metrics at abort
4. Normal incident response begins if system doesn't recover in 5 minutes
```

No shame in aborting. You've learned something: your safety margins were tighter than expected.

## The Post-Mortem

Run within 48 hours while memory is fresh. Blameless — the goal is system improvement, not assigning fault.

**Structure:**

```markdown
## GameDay Post-Mortem: Payment Latency — 2024-01-15

### What we tested

Injected 500ms latency on payment-service for 7 minutes

### Hypothesis

Error rate would remain < 0.5% due to circuit breaker protection

### What happened

- Circuit breaker opened at T+4m (as designed)
- But checkout errors peaked at 4.2% at T+4m before breaker opened
- Recovery was clean once fault injection stopped (< 2 minutes)

### What worked

✓ Circuit breaker opened automatically
✓ Monitoring dashboards showed the issue clearly
✓ System recovered without manual intervention

### What didn't work

✗ Circuit breaker threshold (50% errors) too high — too many users hit errors before it opened
✗ Runbook for "payment degraded" was hard to find (buried in Notion)
✗ Communicator didn't know how to update status page

### Action items

1. Lower circuit breaker error threshold to 30% [Owner: @alice, Due: Jan 22]
2. Move payment runbook to top-level docs [Owner: @bob, Due: Jan 19]
3. Status page update training for all team members [Owner: @carol, Due: Jan 31]
4. Add GameDay for "payment fully down" scenario [Owner: @alice, Due: Feb 15]
```

## Building a Chaos Calendar

Run GameDays regularly — quarterly is a good cadence for mature teams, monthly for teams early in their chaos journey.

```
Q1: App server failure (kill N-1 instances)
Q2: Database primary failure (promote replica)
Q3: Third-party payment service outage (circuit breaker + queue fallback)
Q4: Full AZ failure simulation

Between GameDays:
  Monthly: smaller experiments (latency injection on one endpoint)
  Weekly: review chaos metrics (circuit breaker open counts, retry rates)
```

Rotate who plays each role — everyone should experience being the chaos engineer, incident commander, and observer.

## Chaos as a Hiring Signal

Teams that run regular GameDays attract engineers who want to work on robust systems. It signals:

- The team takes reliability seriously
- Learning from failure is safe and expected
- There's space to be curious about how the system actually works

Include GameDay experience in engineering blog posts and job descriptions. "We run monthly chaos exercises" is a strong signal to experienced reliability engineers.

## Automated Chaos in CI/CD

For mature teams, run chaos experiments automatically against staging on every deployment:

```yaml
# GitHub Actions: chaos test on deployment
- name: Deploy to staging
  run: ./deploy.sh staging

- name: Wait for health checks
  run: ./scripts/wait-healthy.sh staging 120

- name: Run chaos suite
  run: |
    # Kill one instance, verify health
    ./chaos/kill-single-instance.sh staging
    ./chaos/assert-steady-state.sh staging 30

    # Inject 200ms latency, verify circuit breaker
    ./chaos/inject-latency.sh staging 200ms
    ./chaos/assert-steady-state.sh staging 60

    # Restore and verify
    ./chaos/restore.sh staging

- name: Promote to production (only if chaos passed)
  run: ./promote.sh staging production
```

This ensures every release is validated against your known failure modes before reaching users.
