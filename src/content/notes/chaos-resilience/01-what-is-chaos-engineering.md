---
title: "What Is Chaos Engineering"
subtitle: "Deliberately injecting failure to discover weaknesses before your users do — and why controlled experiments beat hoping for the best."
chapter: 1
level: "beginner"
readingTime: "8 min"
topics: ["chaos engineering", "resilience", "fault injection", "steady state", "GameDays"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Crash testing a car before selling it: you deliberately drive it into a wall in controlled conditions to find out what breaks. You don't find out during your customer's commute. Chaos engineering does the same for distributed systems — controlled failures in your environment, not surprises in production.

</Callout>

## The Core Problem

Distributed systems fail in ways that are impossible to fully anticipate. A database replica falls behind and clients time out. A network partition causes half your cluster to believe it's the primary. A dependency returns 200 OK with an empty body. A memory leak surfaces only under load after seven days of uptime.

You can write tests for scenarios you've imagined. You can't write tests for scenarios you haven't. Chaos engineering finds the scenarios you haven't imagined by probing the system's actual behavior under real failure conditions.

## Principles of Chaos Engineering

Netflix's original chaos engineering principles, distilled:

**1. Define steady state.** What does "working" look like? Define it in measurable terms: 99th percentile latency &lt; 200ms, error rate &lt; 0.5%, checkout completion rate > 98%. This is your baseline hypothesis.

**2. Hypothesize that steady state continues under failure.** Before injecting failure, state what you expect: "if we kill one app server, steady state will be maintained because N+1 capacity handles the load."

**3. Inject realistic failures.** Not random chaos — targeted experiments that reflect actual failure modes in your system: server crashes, network latency, disk full, dependency timeouts.

**4. Try to disprove your hypothesis.** Run the experiment and measure. If steady state breaks, you've found a real weakness. If it holds, you've validated your resilience assumption.

**5. Run in production.** Staging doesn't have production traffic patterns, production data volumes, or production dependencies. Start in staging, but the real value comes from production experiments (with appropriate safeguards).

## What Chaos Engineering Is Not

It's not **random destruction** — experiments are deliberate, scoped, and reversible. You're not randomly killing services; you're testing specific hypotheses.

It's not **testing for bugs** — unit and integration tests cover known failure modes. Chaos engineering explores unknown failure modes and emergent behaviors.

It's not **a one-time event** — it's a continuous practice. Systems change; experiments need to keep up.

## The Experiment Loop

```
1. Define steady state metrics
   → Latency p99, error rate, throughput, business metric (conversions, etc.)

2. Form a hypothesis
   → "If the payment service latency increases to 500ms,
      checkout still completes because we have a 2s timeout
      and the circuit breaker opens to return cached prices"

3. Design minimal blast radius experiment
   → Inject 500ms latency on 5% of payment service calls
   → Monitor for 15 minutes
   → Abort if error rate exceeds 1%

4. Run and observe
   → Did steady state hold?
   → What was the actual behavior vs hypothesized?

5. Learn and fix
   → If hypothesis failed: fix the weakness, re-run
   → If hypothesis held: document the validated resilience, increase scope
```

## Failure Mode Taxonomy

Organize experiments around the actual failure modes in your system:

**Infrastructure failures:**
- Server crash / OOM kill
- Disk full
- Network partition (split brain)
- AZ failure simulation
- DNS resolution failures

**Dependency failures:**
- Downstream service timeout
- Downstream service returning 500
- Downstream service returning corrupted data
- Third-party API rate limiting (429)
- Database connection exhaustion

**Resource exhaustion:**
- CPU saturation
- Memory pressure
- Thread pool / connection pool exhaustion
- File descriptor limits

**Latency injection:**
- Slow response (but not timeout) from dependency
- High variance latency (some requests slow, most fast)
- Packet loss causing TCP retransmits

## Starting Small: The Blast Radius

The blast radius of an experiment is how much of your system can be affected. Start with the smallest possible scope and expand as you build confidence.

```
Small blast radius (start here):
  → Single instance in a development environment
  → 1% of traffic to one endpoint
  → One non-critical dependency

Larger blast radius (after building experience):
  → One availability zone
  → 10% of production traffic
  → A critical dependency

Full production experiments (with mature practices):
  → Entire region failover
  → Primary database failure
  → Core service outage
```

## Pre-Requisites Before You Start

Chaos engineering amplifies whatever is already true about your system. If you don't have monitoring, you won't know what broke. If you don't have runbooks, you won't know how to fix it.

**Minimum viable foundation:**
```
□ Metrics and dashboards for your steady state indicators
□ Alerting that fires before users notice
□ Ability to immediately abort an experiment
□ On-call engineer available during experiment window
□ Runbooks for common failure scenarios
□ Clear rollback procedure for the experiment
```

Run your first experiments during business hours, not at 2am. You want experienced engineers watching.

## The Human Side

Chaos engineering often reveals organizational problems, not just technical ones:

- "The runbook says to restart service X, but nobody knows where the command is documented"
- "The alert fired but nobody on call knew it was their responsibility"
- "We thought we had a circuit breaker, but it was misconfigured"

These findings are as valuable as technical fixes. Chaos engineering is a learning tool for teams, not just systems.

## First Experiment

The simplest useful experiment: kill one instance of your application and verify traffic shifts cleanly:

```bash
# 1. Document steady state first
# Confirm: current p99 latency, error rate, all instances healthy

# 2. Kill one instance
kill -9 $(pgrep -f "node server.js" | head -1)
# or: docker kill <container-id>
# or: aws ec2 terminate-instances --instance-ids i-xxx

# 3. Watch your load balancer health checks
# → Unhealthy instance should be removed within 30s
# → Traffic should redistribute to remaining instances

# 4. Measure steady state indicators for 5 minutes
# → Did error rate spike? For how long?
# → Did latency increase? By how much?
# → Did your alert fire? How quickly?

# 5. Restore the instance
# → Bring the instance back up
# → Verify it re-joins the load balancer pool

# 6. Document findings
```

This tells you: does your health check work, how long does traffic failover take, does your alerting detect instance loss. You'll likely find something you didn't expect.

