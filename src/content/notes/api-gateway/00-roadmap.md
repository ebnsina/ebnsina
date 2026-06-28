---
title: 'API Gateway — Roadmap'
subtitle: 'Build your own with nginx, Kong, or Envoy. Auth, rate limit, route, transform.'
chapter: 0
level: 'beginner'
readingTime: '5 min'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A hotel concierge desk: every guest goes through one point of contact that handles directions, reservations, security checks, and special requests — so none of the individual hotel departments have to deal with these concerns themselves. An API gateway is that concierge: one entry point in front of your services that handles routing, authentication, rate limiting, and request transformation, so your backends stay focused on domain logic.

</Callout>

## What you will learn

An API gateway is the single door into your system. Done well, it centralizes cross-cutting concerns — auth, rate limiting, routing, observability — so every backend service doesn't have to reimplement them. This track starts with what a gateway actually is and when you need one, then builds up to routing rules, JWT/API-key auth at the edge, rate limiting algorithms, request transformation, and the observability and operational patterns that keep a gateway reliable in production.

## Chapters in this track

1. **What Is an API Gateway** — single entry point, what it handles, nginx vs Kong vs Envoy, when not to use one
2. **Routing & Load Balancing** — path matching, header-based routing, weighted splits, health-aware balancing
3. **Auth at the Gateway** — JWT verification, API key validation, OAuth token introspection, forwarding identity to backends
4. **Rate Limiting at the Gateway** — fixed window, sliding window, token bucket, per-user and per-endpoint limits
5. **Request & Response Transformation** — header manipulation, payload reshaping, protocol translation REST→gRPC
6. **Observability & Production Gateway** — access logs, distributed tracing, circuit breakers, operational checklist
