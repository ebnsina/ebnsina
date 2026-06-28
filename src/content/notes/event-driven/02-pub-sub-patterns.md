---
title: 'Pub/Sub Patterns'
subtitle: 'Topics, consumer groups, fan-out, filtering, and the delivery guarantees that determine what your subscribers can depend on.'
chapter: 2
level: 'intermediate'
readingTime: '11 min'
topics: ['pub/sub', 'consumer groups', 'fan-out', 'Kafka', 'SNS', 'delivery guarantees']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A radio broadcast: the station (publisher) transmits once on a frequency (topic). Anyone with a receiver tuned to that frequency (subscriber) gets it — the station doesn't know or care how many people are listening. A consumer group is like a household with one radio: everyone in the household hears the same broadcast once, not once per person.

</Callout>

## Core Concepts

**Publisher:** Produces events to a topic. Knows nothing about subscribers.

**Topic:** Named channel. Messages are sent to a topic, not to a specific subscriber.

**Subscriber:** Consumes events from one or more topics. Declares interest, receives matching events.

**Consumer Group:** Multiple instances of the same subscriber sharing the processing load. Each message is delivered to exactly one member of the group.

```
Topic: order-events
  ↓
┌─────────────────────────────────────┐
│     Consumer Group: notifications   │   ← one instance processes each message
│  [notification-service-1]           │
│  [notification-service-2]           │
│  [notification-service-3]           │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│     Consumer Group: analytics       │   ← separate group gets its own copy
│  [analytics-service-1]              │
└─────────────────────────────────────┘
```

Two consumer groups on the same topic get independent copies of every message. Three instances within the same group share the load — each message goes to one of them.

## Delivery Guarantees

Every pub/sub system makes a choice about what it guarantees:

**At-most-once:** Message delivered zero or one times. Can be lost. Fastest. Use for: metrics, telemetry, real-time dashboards where dropping a point is acceptable.

**At-least-once:** Message delivered one or more times. May be duplicated. Most common. Use for: anything that can be made idempotent (most business events).

**Exactly-once:** Message delivered exactly once. Most expensive. Use for: financial transactions, inventory deductions where duplicates cause real harm.

Most systems offer at-least-once and require consumers to handle deduplication:

```typescript
async function handleOrderPlaced(event: EventEnvelope<OrderPlaced>): Promise<void> {
	// Idempotent: check if we already processed this event
	const alreadyProcessed = await db.processedEvents.exists(event.id);
	if (alreadyProcessed) {
		logger.info({ eventId: event.id }, 'Duplicate event, skipping');
		return;
	}

	await db.transaction(async (tx) => {
		// Process the event
		await tx.notifications.create({ userId: event.data.userId, type: 'order-placed' });

		// Mark as processed — atomic with the processing
		await tx.processedEvents.insert({ id: event.id, processedAt: new Date() });
	});
}
```

## Fan-Out

One event → many subscribers, each doing different work:

```
OrderPlaced
  ├── notifications-service: send confirmation email
  ├── inventory-service: reserve items
  ├── analytics-service: update sales dashboard
  ├── fraud-service: check for suspicious patterns
  └── loyalty-service: award points
```

Each subscriber handles independently, fails independently, scales independently. Adding a new subscriber (e.g., a new loyalty program) requires zero changes to the order service.

**Implementing fan-out with SNS + SQS (AWS):**

```typescript
import { SNS, SQS } from 'aws-sdk';

const sns = new SNS();
const sqs = new SQS();

// Publisher: sends to SNS topic
async function publishOrderPlaced(order: Order): Promise<void> {
	await sns
		.publish({
			TopicArn: process.env.ORDER_EVENTS_TOPIC_ARN!,
			Message: JSON.stringify({
				id: crypto.randomUUID(),
				type: 'OrderPlaced',
				version: 1,
				timestamp: new Date().toISOString(),
				data: {
					orderId: order.id,
					userId: order.userId,
					totalAmount: order.totalAmount
				}
			}),
			MessageAttributes: {
				eventType: {
					DataType: 'String',
					StringValue: 'OrderPlaced'
				}
			}
		})
		.promise();
}

// Each subscriber has its own SQS queue subscribed to the SNS topic
// SNS automatically delivers to all subscribed queues
// Subscribers poll their own queue independently
async function processNotificationQueue(): Promise<void> {
	while (true) {
		const { Messages } = await sqs
			.receiveMessage({
				QueueUrl: process.env.NOTIFICATIONS_QUEUE_URL!,
				MaxNumberOfMessages: 10,
				WaitTimeSeconds: 20 // long polling
			})
			.promise();

		for (const message of Messages ?? []) {
			const event = JSON.parse(JSON.parse(message.Body!).Message);
			await handleOrderPlaced(event);

			await sqs
				.deleteMessage({
					QueueUrl: process.env.NOTIFICATIONS_QUEUE_URL!,
					ReceiptHandle: message.ReceiptHandle!
				})
				.promise();
		}
	}
}
```

## Message Filtering

Subscribers can filter to only receive events they care about — no need to receive and discard irrelevant events:

```typescript
// SNS filter policy: only receive OrderPlaced with amount > $100
const filterPolicy = {
	eventType: ['OrderPlaced']
	// Can't filter on nested fields with SNS filter policies directly
	// Use message attributes for filterable fields
};

// Publish with filterable attributes
await sns
	.publish({
		TopicArn: TOPIC_ARN,
		Message: JSON.stringify(event),
		MessageAttributes: {
			eventType: { DataType: 'String', StringValue: 'OrderPlaced' },
			orderAmount: { DataType: 'Number', StringValue: String(order.totalAmount) },
			plan: { DataType: 'String', StringValue: user.plan }
		}
	})
	.promise();

// Subscription filter: VIP orders to a dedicated queue
// {
//   "plan": ["enterprise", "pro"],
//   "orderAmount": [{ "numeric": [">=", 1000] }]
// }
```

## Kafka: Durable, Ordered, Replayable

Kafka is not just a message queue — it's a persistent log. Messages are retained (configurable, often 7-30 days) and consumers can replay from any offset. This changes what's possible:

```typescript
import { Kafka, Consumer, Producer } from 'kafkajs';

const kafka = new Kafka({
	clientId: 'order-service',
	brokers: ['kafka:9092']
});

// Producer
const producer: Producer = kafka.producer();
await producer.connect();

await producer.send({
	topic: 'order-events',
	messages: [
		{
			key: order.userId, // partition by user — ordering per user guaranteed
			value: JSON.stringify(event),
			headers: { eventType: 'OrderPlaced' }
		}
	]
});

// Consumer
const consumer: Consumer = kafka.consumer({ groupId: 'notifications-service' });
await consumer.connect();
await consumer.subscribe({ topic: 'order-events', fromBeginning: false });

await consumer.run({
	eachMessage: async ({ topic, partition, message }) => {
		const event = JSON.parse(message.value!.toString());

		try {
			await handleEvent(event);
			// Kafka commits offset after successful processing
			// On restart, consumer picks up from committed offset
		} catch (err) {
			// Don't commit — message will be redelivered
			logger.error({ event, err }, 'Failed to process event');
			throw err;
		}
	}
});
```

**Kafka's key properties:**

- **Ordering:** Messages with the same partition key are strictly ordered
- **Durability:** Messages persisted to disk, replicated across brokers
- **Replay:** Consumers can seek to any offset and reprocess history
- **Throughput:** Millions of messages/second on modest hardware

**When Kafka over SNS/SQS:**

- Need message ordering within a partition
- Need to replay events (fix a bug in a consumer, reprocess historical data)
- Need to share events across teams/systems with different retention needs
- Throughput exceeds what managed queues handle economically

## Ordering Guarantees

Ordering is only guaranteed within a partition (Kafka) or within a single FIFO queue (SQS FIFO). Cross-partition ordering is not guaranteed.

```typescript
// Kafka: partition by user ID for per-user ordering
await producer.send({
	topic: 'user-events',
	messages: [
		{
			key: userId, // all events for this user go to the same partition → ordered
			value: JSON.stringify(event)
		}
	]
});

// If you need global ordering: use a single partition
// Trade-off: single partition = single-threaded consumers = limited throughput
```

For most business events, per-entity ordering (all events for order_123 in order) is sufficient and achievable. Global ordering across all events usually isn't needed and isn't worth the throughput cost.

## Dead-Letter Topics

Messages that fail processing after retries go to a dead-letter topic for investigation:

```typescript
// Consumer with DLQ
await consumer.run({
	eachMessage: async ({ topic, partition, message }) => {
		const event = JSON.parse(message.value!.toString());

		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				await handleEvent(event);
				return;
			} catch (err) {
				if (attempt === 3) {
					// Send to DLQ after 3 failures
					await dlqProducer.send({
						topic: `${topic}.dlq`,
						messages: [
							{
								key: message.key,
								value: message.value,
								headers: {
									...message.headers,
									'x-original-topic': topic,
									'x-failure-reason': String(err),
									'x-failed-at': new Date().toISOString()
								}
							}
						]
					});
					return; // don't rethrow — let consumer continue
				}
				await sleep(1000 * Math.pow(2, attempt));
			}
		}
	}
});
```

Monitor DLQ depth — a growing DLQ signals a consumer bug or a schema mismatch between producer and consumer.
