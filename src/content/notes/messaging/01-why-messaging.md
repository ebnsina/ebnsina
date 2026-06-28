---
title: 'Why Messaging Systems'
subtitle: 'The problems direct HTTP calls create at scale — and how async messaging solves coupling, backpressure, and reliability.'
chapter: 1
level: 'beginner'
readingTime: '8 min'
topics: ['messaging', 'queues', 'async', 'decoupling', 'backpressure', 'pub/sub']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A postal system vs a phone call: a phone call requires both parties available simultaneously — if either hangs up, the conversation fails. A letter is deposited, survives the sender going offline, survives the recipient being busy, and is delivered when the recipient is ready. Messaging systems are the postal system for software services.

</Callout>

## The Problem with Direct Calls

When Service A calls Service B directly over HTTP:

```
OrderService → HTTP POST /process → PaymentService
```

Three things must be true simultaneously:

1. PaymentService must be up
2. PaymentService must respond within A's timeout
3. The network must be reliable

When any of these fail, the order fails. The services are **temporally coupled** — they must both be available at the same time.

## What Breaks at Scale

**Thundering herd:** Batch of orders arrives simultaneously. PaymentService gets 10,000 HTTP calls at once. It can handle 500/sec. The rest fail with 503. You've lost orders.

**Cascading failure:** PaymentService is slow (database issue). OrderService requests pile up waiting for responses. OrderService's thread pool exhausts. OrderService starts returning 503 to users. EmailService (which calls OrderService) starts failing. The slowness in one service propagates up.

**Tight coupling:** Adding a new service (analytics, fraud detection) that needs order events requires modifying OrderService to call it. Every new consumer = a new direct dependency.

## The Messaging Solution

```
OrderService → [Queue] → PaymentService
                       → FraudDetection (same events)
                       → Analytics (same events)
```

OrderService deposits the message and continues immediately. PaymentService processes at its own pace. If PaymentService goes down, messages accumulate in the queue — they're not lost. When it comes back up, it processes the backlog.

**Temporal decoupling:** Producer and consumer don't need to be up at the same time.

**Rate limiting / backpressure:** The queue absorbs traffic spikes. Consumers process at a sustainable rate. No thundering herd.

**Fan-out:** Multiple consumers read the same events without the producer knowing about them.

## Messaging Primitives

**Queue:** Point-to-point. One producer, one consumer group. Each message consumed once.

```
Producer → [Queue] → Consumer A processes it
                     (Consumer B never sees it)
```

**Pub/Sub:** One-to-many. Publisher sends to a topic; all subscribers receive a copy.

```
Producer → [Topic] → Consumer A gets a copy
                   → Consumer B gets a copy
                   → Consumer C gets a copy
```

**Stream:** Ordered, persistent log. Consumers can replay from any position. Messages retained after consumption.

```
Producer → [Stream: offset 0, 1, 2, 3...]
             Consumer A reads from offset 0
             Consumer B reads from offset 2 (started later)
             Consumer A re-reads from offset 0 after a bug fix
```

## Delivery Guarantees

**At-most-once:** Message is delivered zero or one time. Fire and forget. Fast; some messages lost.

**At-least-once:** Message is delivered one or more times. Consumer must be idempotent (handle duplicates). The default for reliable systems.

**Exactly-once:** Message delivered exactly once. Requires coordination (transactions or idempotency keys). Expensive; only worth it for financial operations.

```typescript
// At-least-once consumer — must handle duplicates
async function processOrder(message: Message) {
	const { orderId } = message.body;

	// Idempotency: if already processed, skip without error
	const existing = await db.query('SELECT id FROM processed_orders WHERE order_id = $1', [orderId]);
	if (existing.rows.length > 0) {
		await message.ack(); // acknowledge without reprocessing
		return;
	}

	await processPayment(orderId);
	await db.query('INSERT INTO processed_orders (order_id) VALUES ($1)', [orderId]);
	await message.ack();
}
```

## Backpressure

The consumer signals the producer to slow down when it can't keep up.

Without backpressure:

- Producer sends 1000 msg/sec
- Consumer handles 100 msg/sec
- Queue grows 900 msg/sec indefinitely
- Eventually: OOM, disk full, or message expiry

With backpressure:

- RabbitMQ: `prefetch` limits how many unacked messages a consumer holds
- Kafka: consumer controls its own read rate (pull model)
- NATS JetStream: max-pending limits

```typescript
// RabbitMQ: consumer pulls max 10 messages at a time
channel.prefetch(10);

// Process each before pulling more
channel.consume('orders', async (msg) => {
	await processOrder(msg);
	channel.ack(msg);
});
```

With `prefetch(10)`, the broker won't deliver message 11 until at least one of the first 10 is acknowledged. Consumer controls its own rate.

## Choosing a System

|                | RabbitMQ         | NATS                                     | Kafka                                        |
| -------------- | ---------------- | ---------------------------------------- | -------------------------------------------- |
| **Model**      | Queue + pub/sub  | Pub/sub + streams                        | Distributed log                              |
| **Retention**  | Until consumed   | Until consumed (JetStream: configurable) | Configurable (days/weeks)                    |
| **Throughput** | ~50k msg/sec     | ~1M msg/sec                              | ~1M+ msg/sec                                 |
| **Replay**     | No (queues)      | JetStream: yes                           | Yes (primary feature)                        |
| **Ordering**   | Per-queue        | Per-subject                              | Per-partition                                |
| **Complexity** | Low-medium       | Low                                      | High                                         |
| **Best for**   | Task queues, RPC | High-throughput events, IoT              | Event sourcing, audit log, stream processing |

**Start with RabbitMQ** if you need reliable task queues and your team knows HTTP/REST. **Move to Kafka** when you need replay, long retention, or high-throughput event streams. **NATS** for high-throughput with simple ops.
