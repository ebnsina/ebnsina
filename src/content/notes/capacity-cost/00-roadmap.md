---
title: 'Capacity & Cost — Roadmap'
subtitle: 'Sizing from first principles, cloud vs bare metal economics, database cost, redundancy pricing, and optimization that actually saves money.'
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

Building a factory before you know your output volume: size too small and you're bottlenecked on day one; size too large and you're burning capital on empty floor space. Capacity planning is the engineering discipline of getting this right — and adjusting it as you learn.

</Callout>

## What you will learn

Cloud bills grow faster than user counts because teams make infrastructure decisions without understanding the cost model behind them. This track gives you the mental models to make deliberate choices: how to derive resource requirements from request load, when managed services pay for themselves, what each availability tier actually costs, and where waste hides in a real AWS bill.

## Chapters in this track

1. **Sizing Fundamentals** — request cost model, Little's Law, CPU/memory/IOPS/network estimation
2. **Cloud vs Bare Metal vs VPS** — unit economics, true cost of AWS, when each model wins
3. **Database Cost & Sizing** — IOPS, storage tiers, connection pooling, read replica math
4. **The Cost of Redundancy** — N+1, multi-AZ, active-active — what each buys and what it costs
5. **Cost Optimization in Practice** — finding waste, rightsizing, reserved instances, FinOps culture
