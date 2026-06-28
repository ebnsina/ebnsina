---
title: 'Messaging Patterns'
subtitle: 'Saga, inbox/outbox, event-driven choreography vs orchestration — the patterns that make distributed systems reliable despite partial failure.'
chapter: 5
level: 'intermediate'
readingTime: '11 min'
topics:
  ['saga', 'outbox', 'choreography', 'orchestration', 'idempotency', 'transactional messaging']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A multi-department approval process: you submit a request, it moves through HR, Finance, and Legal sequentially (orchestration — a coordinator tracks state), or each department gets a copy and acts independently while publishing their own decisions (choreography — no central coordinator). The saga pattern handles what happens when Finance approves but Legal rejects: compensate what already happened.

</Callout>

## The Dual-Write Problem

The most common reliability mistake: writing to a database AND publishing an event in two separate operations.

```typescript
// WRONG — dual write
async function createOrder(order: Order) {
	await db.insert('orders', order); // succeeds
	await kafka.publish('orders', order); // crash here → event never sent
	// OR:
	await kafka.publish('orders', order); // succeeds
	await db.insert('orders', order); // crash here → event sent but no DB record
}
```

If the process crashes between the two operations, you have an inconsistency: DB and message broker are out of sync.

## Outbox Pattern

Write the event to the database in the same transaction as the business data. A separate process reads undelivered events and publishes them.

```sql
-- outbox table
CREATE TABLE outbox (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       TEXT NOT NULL,
  key         TEXT,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ   -- NULL until delivered
);
```

```typescript
// Atomic: business write + event write in one transaction
async function createOrder(order: Order) {
	await db.transaction(async (tx) => {
		await tx.query('INSERT INTO orders (id, customer_id, total) VALUES ($1, $2, $3)', [
			order.id,
			order.customerId,
			order.total
		]);

		await tx.query('INSERT INTO outbox (topic, key, payload) VALUES ($1, $2, $3)', [
			'orders',
			order.id,
			JSON.stringify({ event: 'order.created', ...order })
		]);
	});
}

// Outbox publisher — runs separately, polls for undelivered events
async function publishOutbox() {
	while (true) {
		const rows = await db.query(
			`SELECT * FROM outbox
       WHERE published_at IS NULL
       ORDER BY created_at
       LIMIT 100
       FOR UPDATE SKIP LOCKED`
		);

		for (const row of rows.rows) {
			await kafka.publish(row.topic, { key: row.key, value: row.payload });

			await db.query('UPDATE outbox SET published_at = NOW() WHERE id = $1', [row.id]);
		}

		await sleep(1000);
	}
}
```

`FOR UPDATE SKIP LOCKED` lets multiple publisher instances run without duplicate publishing — each row is claimed by one publisher.

**Cleanup:** delete published rows after a retention window:

```sql
DELETE FROM outbox WHERE published_at < NOW() - INTERVAL '7 days';
```

Use Debezium for the publisher instead of polling — CDC watches the Postgres WAL and publishes outbox rows to Kafka automatically (zero polling delay).

## Inbox Pattern

Prevent duplicate processing when a consumer receives the same message twice (at-least-once delivery):

```sql
CREATE TABLE inbox (
  message_id  TEXT PRIMARY KEY,
  topic       TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```typescript
async function handleOrder(msg: KafkaMessage) {
	const messageId = `${msg.topic}-${msg.partition}-${msg.offset}`;

	await db.transaction(async (tx) => {
		// Check if already processed
		const result = await tx.query(
			'INSERT INTO inbox (message_id, topic) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING message_id',
			[messageId, msg.topic]
		);

		// No rows returned = conflict = already processed
		if (result.rows.length === 0) return;

		const order = JSON.parse(msg.value!.toString());
		await processOrder(tx, order);
	});
}
```

The `ON CONFLICT DO NOTHING` combined with `RETURNING` makes the duplicate check atomic. No separate SELECT needed.

## Choreography

Services react to events from other services — no central coordinator.

```
OrderService publishes order.created
  → PaymentService (subscribes) charges card, publishes payment.completed
    → FulfillmentService (subscribes) ships order, publishes order.shipped
      → NotificationService (subscribes) sends email
```

**Pros:** loose coupling, no SPOF coordinator, easy to add new services.

**Cons:** hard to trace a saga across services, hard to answer "what's the current state of order 123?", failure recovery requires each service to handle compensating events.

```typescript
// Each service is autonomous
class PaymentService {
	async onOrderCreated(event: OrderCreated) {
		try {
			const payment = await chargeCard(event.customerId, event.total);
			await publish('payment.completed', { orderId: event.orderId, paymentId: payment.id });
		} catch {
			await publish('payment.failed', { orderId: event.orderId, reason: 'card_declined' });
		}
	}

	async onOrderCancelled(event: OrderCancelled) {
		// Compensation: refund if payment was taken
		await refundPayment(event.orderId);
	}
}
```

## Orchestration (Saga)

A central coordinator (the saga) tracks the state of a distributed transaction and directs each step.

```typescript
// Saga state machine
interface OrderSagaState {
	orderId: string;
	step: 'payment' | 'inventory' | 'fulfillment' | 'completed' | 'failed';
	paymentId?: string;
	compensations: Array<() => Promise<void>>;
}

class OrderSaga {
	async execute(order: Order): Promise<void> {
		const state: OrderSagaState = {
			orderId: order.id,
			step: 'payment',
			compensations: []
		};

		try {
			// Step 1: Payment
			const payment = await paymentClient.charge(order);
			state.paymentId = payment.id;
			state.compensations.push(() => paymentClient.refund(payment.id));

			// Step 2: Reserve inventory
			await inventoryClient.reserve(order.items);
			state.compensations.push(() => inventoryClient.release(order.items));

			// Step 3: Fulfill
			await fulfillmentClient.ship(order);
			state.step = 'completed';
		} catch (err) {
			state.step = 'failed';
			// Run compensations in reverse order
			for (const compensate of state.compensations.reverse()) {
				await compensate().catch(console.error); // best-effort
			}
			throw err;
		}
	}
}
```

**Pros:** clear state, easy to reason about, one place to handle failures.

**Cons:** the saga coordinator is a SPOF (mitigated by persisting state), tighter coupling to step order.

For durable sagas (survive process restart), persist state to a database:

```sql
CREATE TABLE sagas (
  id         UUID PRIMARY KEY,
  type       TEXT NOT NULL,
  state      JSONB NOT NULL,
  status     TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Temporal (temporal.io) is a purpose-built durable workflow engine that makes saga implementation with automatic replay, retries, and state persistence trivial.

## Competing Consumers

Scale message processing by running multiple worker instances against the same queue:

```
Queue: [msg1, msg2, msg3, msg4, msg5]
  Worker 1 processes: msg1, msg3, msg5
  Worker 2 processes: msg2, msg4
```

Works automatically with:

- RabbitMQ: multiple consumers on the same queue
- Kafka: multiple consumers in the same consumer group (up to partition count)
- NATS JetStream: multiple pull consumers on same durable

The key invariant: each message processed by exactly one worker. Guaranteed by the broker's locking semantics.

## Fan-Out

One event consumed by multiple independent services:

**Per-consumer queues (RabbitMQ):**

```typescript
// Exchange with one binding per service
await ch.assertExchange('orders', 'topic', { durable: true });

// Each service gets its own queue
await ch.assertQueue('orders.payment', { durable: true });
await ch.assertQueue('orders.analytics', { durable: true });
await ch.assertQueue('orders.notifications', { durable: true });

await ch.bindQueue('orders.payment', 'orders', 'created');
await ch.bindQueue('orders.analytics', 'orders', 'created');
await ch.bindQueue('orders.notifications', 'orders', 'created');
```

**Kafka:** multiple consumer groups automatically achieve fan-out. Each group reads all messages independently.

```typescript
// payment-service group — reads all messages
const paymentConsumer = kafka.consumer({ groupId: 'payment-service' });

// analytics-service group — reads same messages independently
const analyticsConsumer = kafka.consumer({ groupId: 'analytics-service' });
```

## Poison Pills

A message that always causes consumer failure, blocking the queue.

Detection:

```typescript
ch.consume('orders', async (msg) => {
	const attempt = (msg.properties.headers['x-attempt'] || 0) as number;

	try {
		await processOrder(JSON.parse(msg.content.toString()));
		ch.ack(msg);
	} catch (err) {
		if (attempt >= 3) {
			// Poison pill — move to DLQ with diagnostic headers
			ch.publish('orders.dlx', 'created', msg.content, {
				headers: {
					...msg.properties.headers,
					'x-failed-reason': err.message,
					'x-failed-at': new Date().toISOString()
				}
			});
			ch.ack(msg);
		} else {
			// Retry
			ch.publish('orders', 'created', msg.content, {
				headers: { 'x-attempt': attempt + 1 }
			});
			ch.ack(msg);
		}
	}
});
```

Always have a DLQ. A queue without a DLQ eventually blocks on a poison pill indefinitely.
