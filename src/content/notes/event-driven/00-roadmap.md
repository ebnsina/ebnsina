---
title: 'Event-Driven & Streaming — Roadmap'
subtitle: "Pub/sub patterns, CDC with Debezium, event sourcing, and schema evolution that doesn't break your consumers."
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

A newspaper vs a phone call: a phone call (synchronous request/response) demands immediate attention from both parties. A newspaper (event stream) publishes facts once; readers consume them on their own schedule, and new readers can go back and read old editions. Event-driven systems give you the newspaper model — loose coupling, independent scaling, and a permanent record of what happened.

</Callout>

## What you will learn

Events are how loosely coupled systems communicate. This track covers the vocabulary (events vs commands vs queries), the patterns for delivering events reliably (pub/sub, fan-out, consumer groups), how to capture database changes without touching application code (CDC with Debezium), the event sourcing pattern for audit-first systems, and how to evolve schemas over time without breaking deployed consumers.

## Chapters in this track

1. **Events vs Commands vs Queries** — three message types with different semantics, CQRS, naming conventions
2. **Pub/Sub Patterns** — topics, consumer groups, fan-out, delivery guarantees, Kafka vs SNS/SQS
3. **Change Data Capture** — Debezium, logical replication, the outbox pattern, monitoring slot lag
4. **Event Sourcing** — append-only event store, aggregates, projections, snapshots, when to use it
5. **Schema Evolution** — backward compatibility, Schema Registry, Avro, consumer-driven contracts
