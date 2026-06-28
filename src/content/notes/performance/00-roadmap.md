---
title: 'Performance Engineering — Roadmap'
subtitle: 'Profiling with pprof and perf, flamegraphs, latency budgets, p99 thinking.'
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

A race car pit crew: every tenth of a second matters, so they measure everything, profile the car's performance data, and fix only what the data says is slow — not what feels slow. Performance engineering is the same discipline applied to software: measure first, profile to find the real bottleneck, then optimize exactly that.

</Callout>

## What you will learn

Most performance problems are in the database. Most developers guess it's the application code. This track teaches the discipline: how to think about latency (percentiles, budgets, tail latency), how to profile Node.js and Go applications with flamegraphs, how to read and act on query plans, how caching helps and when it hides problems, and how to load test in a way that actually reflects production.

## Chapters in this track

1. **Latency Thinking** — P50 vs P99, tail latency, latency budgets, Little's Law
2. **Profiling** — Node.js --prof, Go pprof, Linux perf, flamegraphs, continuous profiling
3. **Database Performance** — EXPLAIN ANALYZE, index strategy, N+1 queries, connection pooling
4. **Caching** — cache levels, Redis patterns, stampede prevention, invalidation, CDN
5. **Load Testing** — k6, autocannon, finding the breaking point, realistic test data
