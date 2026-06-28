---
title: 'Horizontal Scaling — Roadmap'
subtitle: 'Stateless services, load balancers, auto-scaling, database bottlenecks, and WebSocket fan-out across instances.'
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

Adding checkout lanes at a grocery store: one lane works fine until the queue gets long, then you open more. Horizontal scaling does the same for software — add more instances behind a load balancer. The prerequisite is that each lane (instance) can serve any customer independently, with no hidden state that ties a customer to a specific lane.

</Callout>

## What you will learn

Vertical scaling (bigger server) has a ceiling. Horizontal scaling (more servers) doesn't — but it requires your application to be designed for it. This track covers the full picture: making services truly stateless, load balancing traffic across instances, auto-scaling based on real demand, handling the database bottleneck that emerges when app servers scale, and keeping WebSocket connections working across a multi-instance fleet.

## Chapters in this track

1. **Stateless Services** — the twelve-factor prerequisite, extracting sessions and files, testing statelessness
2. **Load Balancers** — L4 vs L7, algorithms, health checks, connection draining, SSL termination
3. **Auto-Scaling** — target tracking, scheduled scaling, HPA, KEDA for queue-driven workers
4. **Scaling the Database Layer** — PgBouncer, read replicas, caching, when to shard
5. **WebSockets & Shared State** — Redis adapter, presence tracking, sticky sessions, SSE as an alternative
