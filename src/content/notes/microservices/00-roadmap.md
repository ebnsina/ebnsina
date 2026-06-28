---
title: 'Microservices — Roadmap'
subtitle: 'When to split a monolith, gRPC between services, service discovery with Consul.'
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

A small restaurant vs a food court: one restaurant (monolith) has one kitchen, one bill, one staff — easy to run until the menu explodes and the kitchen can't keep up. A food court (microservices) has specialized stalls that can open and close independently, scale on their own, and fail without closing the whole court. The trade-off is coordination: who takes the order, and how does sushi know the stir-fry is ready?

</Callout>

## What you will learn

Microservices are not a default — they're a trade-off. This track covers the real costs of splitting (distributed transactions, network calls, operational overhead), how to find the right seams before cutting, and the infrastructure that holds services together: gRPC contracts, service discovery, the API gateway pattern, and the reliability patterns (circuit breakers, bulkheads, retries) that prevent one slow service from cascading into a full outage.

## Chapters in this track

1. **Monolith vs Microservices** — when to split, the strangler fig pattern, modular monolith as the middle ground
2. **gRPC Between Services** — Protocol Buffers, code generation, streaming, error handling, schema evolution
3. **Service Discovery** — DNS-based discovery, Consul, client-side vs server-side LB, service mesh
4. **API Gateway** — routing, auth, rate limiting, request transformation, what not to put in the gateway
5. **Inter-Service Reliability** — timeouts, retries, circuit breakers, bulkheads, hedged requests
