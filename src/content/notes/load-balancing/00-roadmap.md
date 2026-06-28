---
title: 'Load Balancing — Roadmap'
subtitle: 'HAProxy and nginx. L4 vs L7, health checks, sticky sessions, weighted routing.'
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

A traffic cop at a busy intersection: they see every vehicle, decide which road each should take, and instantly redirect around accidents. A load balancer does the same for HTTP requests — seeing every connection and routing it intelligently while keeping dead servers out of rotation.

</Callout>

## What you will learn

One server has a ceiling. Load balancers remove it — but only if you understand what they can and can't see. This track covers the full picture: the difference between L4 and L7 routing, the algorithms that decide which server gets each request, how health checks keep dead backends out of rotation, SSL termination, and the HAProxy internals that make production-grade routing possible.

## Chapters in this track

1. **L4 vs L7 Load Balancing** — what each layer can inspect, routing by IP vs routing by URL
2. **Algorithms** — round-robin, least connections, IP hash, weighted, consistent hashing
3. **Health Checks** — active vs passive detection, thresholds, connection draining
4. **SSL Termination** — TLS at the LB, cert automation, end-to-end encryption, SNI
5. **HAProxy in Depth** — frontends, backends, ACLs, stats page, runtime API, rate limiting
6. **Advanced Patterns** — blue-green deployments, global load balancing, GeoDNS, anycast
