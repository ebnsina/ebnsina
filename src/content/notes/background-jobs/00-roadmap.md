---
title: "Background Jobs — Roadmap"
subtitle: "Worker loops, Redis and Postgres-backed queues, retries, DLQs, idempotency, cron, and production patterns."
chapter: 0
level: "beginner"
readingTime: "3 min"
topics: ["roadmap"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A post office sorting facility: letters arrive, get sorted into bins (queues), handlers (workers) process each bin, undeliverable mail goes to a holding area (dead-letter queue), and nothing important gets lost if a sorter goes home mid-shift (graceful shutdown).

</Callout>

## What you will learn

Most web apps eventually need work that doesn't belong in an HTTP request — sending emails, processing uploads, syncing data, generating reports. This track covers the full picture: choosing a queue backend, handling failures without data loss, making jobs safe to retry, scheduling recurring work without running it twice, and the operational patterns for running workers reliably in production.

## Chapters in this track

1. **Why Background Jobs** — what belongs in a queue vs inline, worker architecture, choosing a backend
2. **Queue Backends** — BullMQ on Redis vs pg-boss on Postgres, internals, transactional enqueueing
3. **Retries & Backoff** — exponential backoff, jitter, distinguishing transient from permanent errors, DLQs
4. **Idempotency** — at-least-once delivery, making jobs safe to run multiple times, fencing tokens
5. **Cron & Scheduled Jobs** — queue-backed cron, leader election, timezone handling, missed runs
6. **Worker Patterns & Production** — graceful shutdown, priority queues, fan-out, rate limiting, metrics

