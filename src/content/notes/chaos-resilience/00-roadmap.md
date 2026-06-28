---
title: 'Chaos & Resilience — Roadmap'
subtitle: 'Fault injection, resilience patterns, GameDays, and the SLO-based feedback loop that turns failure into a learning tool.'
chapter: 0
level: 'beginner'
readingTime: '3 min'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Vaccination: you expose the system to controlled, weakened versions of what could harm it, so when the real thing hits, the response is already calibrated. Chaos engineering is your system's immune training.

</Callout>

## What you will learn

Most systems are only as resilient as their last incident. Chaos engineering changes that: you find the weaknesses on your schedule, in controlled conditions, with experienced engineers watching — not at 3am with users affected. This track covers the full practice: the mental model, the resilience patterns that contain failures, the tools to inject realistic faults, how to run structured GameDays with your team, and the SLO framework that tells you whether you have budget to experiment.

## Chapters in this track

1. **What Is Chaos Engineering** — principles, the experiment loop, failure mode taxonomy, prerequisites
2. **Resilience Patterns** — timeouts, retries, circuit breakers, bulkheads, graceful degradation
3. **Fault Injection Tools** — Pumba, `tc`, Chaos Mesh, AWS FIS, application-level injection
4. **GameDays** — planning, roles, running the exercise, post-mortems, building a chaos culture
5. **Steady State & SLOs** — SLIs, SLOs, error budgets, the policy that connects reliability to engineering decisions
