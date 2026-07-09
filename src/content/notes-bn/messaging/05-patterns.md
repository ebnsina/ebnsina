---
title: 'Messaging Patterns'
subtitle: 'Saga, inbox/outbox, event-driven choreography বনাম orchestration — সেসব pattern যা partial failure সত্ত্বেও distributed system-কে নির্ভরযোগ্য করে।'
chapter: 5
level: 'intermediate'
readingTime: '11 মিনিট'
topics:
  ['saga', 'outbox', 'choreography', 'orchestration', 'idempotency', 'transactional messaging']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা multi-department অনুমোদন প্রক্রিয়া: আপনি একটা request জমা দেন, সেটা ধারাবাহিকভাবে HR, Finance, আর Legal-এর মধ্য দিয়ে যায় (orchestration — একটা coordinator state ট্র্যাক করে), অথবা প্রতিটা বিভাগ একটা করে copy পায় আর স্বাধীনভাবে কাজ করে নিজেদের সিদ্ধান্ত publish করতে করতে (choreography — কোনো কেন্দ্রীয় coordinator নেই)। Saga pattern সামলায় তখন যা ঘটে যখন Finance অনুমোদন করে কিন্তু Legal প্রত্যাখ্যান করে: যা ইতিমধ্যে ঘটে গেছে তা compensate করা।

</Callout>

## Dual-Write সমস্যা

সবচেয়ে সাধারণ reliability ভুল: একটা database-এ লেখা এবং একটা event publish করা দুটো আলাদা operation-এ।

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

দুটো operation-এর মাঝখানে process crash করলে, আপনার একটা inconsistency তৈরি হয়: DB আর message broker আউট অফ সিঙ্ক।

## Outbox Pattern

business data-র সাথে একই transaction-এ event-টা database-এ লিখুন। একটা আলাদা process undelivered event পড়ে সেগুলো publish করে।

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

`FOR UPDATE SKIP LOCKED` একাধিক publisher instance-কে duplicate publishing ছাড়াই চলতে দেয় — প্রতিটা row একটা publisher claim করে।

**Cleanup:** একটা retention window পরে published row মুছে ফেলুন:

```sql
DELETE FROM outbox WHERE published_at < NOW() - INTERVAL '7 days';
```

polling-এর বদলে publisher-এর জন্য Debezium ব্যবহার করুন — CDC Postgres WAL দেখে আর outbox row স্বয়ংক্রিয়ভাবে Kafka-তে publish করে (শূন্য polling delay)।

## Inbox Pattern

একটা consumer যখন একই মেসেজ দুবার পায় (at-least-once delivery) তখন duplicate processing প্রতিরোধ করুন:

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

`RETURNING`-এর সাথে মিলিয়ে `ON CONFLICT DO NOTHING` duplicate check-টাকে atomic করে তোলে। কোনো আলাদা SELECT লাগে না।

## Choreography

সার্ভিসগুলো অন্য সার্ভিসের event-এ react করে — কোনো কেন্দ্রীয় coordinator নেই।

```
OrderService publishes order.created
  → PaymentService (subscribes) charges card, publishes payment.completed
    → FulfillmentService (subscribes) ships order, publishes order.shipped
      → NotificationService (subscribes) sends email
```

**সুবিধা:** loose coupling, কোনো SPOF coordinator নেই, নতুন সার্ভিস যোগ করা সহজ।

**অসুবিধা:** সার্ভিস জুড়ে একটা saga trace করা কঠিন, "order 123-এর বর্তমান state কী?" উত্তর দেওয়া কঠিন, failure recovery-র জন্য প্রতিটা সার্ভিসকে compensating event সামলাতে হয়।

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

একটা কেন্দ্রীয় coordinator (saga) একটা distributed transaction-এর state ট্র্যাক করে আর প্রতিটা step নির্দেশ করে।

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

**সুবিধা:** পরিষ্কার state, সহজে বোঝা যায়, failure সামলানোর একটাই জায়গা।

**অসুবিধা:** saga coordinator একটা SPOF (state persist করে প্রশমিত করা যায়), step order-এর সাথে বেশি coupling।

durable saga-র জন্য (process restart-এও টিকে থাকে), state একটা database-এ persist করুন:

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

Temporal (temporal.io) একটা বিশেষভাবে তৈরি durable workflow engine যেটা automatic replay, retry, আর state persistence সহ saga implementation-কে খুবই সহজ করে তোলে।

## Competing Consumers

একই queue-এর বিরুদ্ধে একাধিক worker instance চালিয়ে message processing scale করুন:

```
Queue: [msg1, msg2, msg3, msg4, msg5]
  Worker 1 processes: msg1, msg3, msg5
  Worker 2 processes: msg2, msg4
```

এটা স্বয়ংক্রিয়ভাবে কাজ করে:

- RabbitMQ: একই queue-তে একাধিক consumer
- Kafka: একই consumer group-এ একাধিক consumer (partition সংখ্যা পর্যন্ত)
- NATS JetStream: একই durable-এ একাধিক pull consumer

মূল invariant: প্রতিটা মেসেজ ঠিক একটা worker process করে। Broker-এর locking semantics দিয়ে নিশ্চিত করা।

## Fan-Out

একটা event একাধিক স্বাধীন সার্ভিস consume করে:

**Per-consumer queue (RabbitMQ):**

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

**Kafka:** একাধিক consumer group স্বয়ংক্রিয়ভাবে fan-out অর্জন করে। প্রতিটা group স্বাধীনভাবে সব মেসেজ পড়ে।

```typescript
// payment-service group — reads all messages
const paymentConsumer = kafka.consumer({ groupId: 'payment-service' });

// analytics-service group — reads same messages independently
const analyticsConsumer = kafka.consumer({ groupId: 'analytics-service' });
```

## Poison Pill

একটা মেসেজ যেটা সবসময় consumer failure ঘটায়, queue আটকে দেয়।

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

সবসময় একটা DLQ রাখুন। DLQ ছাড়া একটা queue শেষমেশ একটা poison pill-এ অনির্দিষ্টকাল আটকে যায়।
