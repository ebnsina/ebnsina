---
title: 'Messaging & Queues — Roadmap'
subtitle: 'Self-host RabbitMQ or NATS. Then run a Kafka cluster across 3 VPS.'
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

A postal system for services: instead of every service calling every other service directly (phone calls that fail if either party is busy), services deposit messages and pick them up when ready. RabbitMQ is the local post office, Kafka is the national archive that stores every letter ever sent.

</Callout>

## What you will learn

Direct HTTP calls couple services in time — if the downstream is down, the upstream fails. This track covers when async messaging solves that problem, how to choose between RabbitMQ, Kafka, and NATS, how each works internally, and the patterns (outbox, saga, inbox) that make distributed systems reliable despite partial failure.

## Chapters in this track

1. **Why Messaging Systems** — coupling, backpressure, delivery guarantees, when to use each system
2. **RabbitMQ** — AMQP model, exchanges, dead letter queues, retry with backoff, clustering
3. **Kafka** — topics, partitions, consumer groups, retention, transactional producers
4. **NATS** — core pub/sub, JetStream streams, KV store, request-reply, clustering
5. **Messaging Patterns** — outbox, inbox, choreography vs orchestration, saga, poison pills
