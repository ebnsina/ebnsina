---
title: 'Pub/Sub Patterns'
subtitle: 'Topics, consumer groups, fan-out, filtering, আর সেই delivery guarantee-গুলো যা ঠিক করে দেয় আপনার subscriber কীসের উপর নির্ভর করতে পারবে।'
chapter: 2
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['pub/sub', 'consumer groups', 'fan-out', 'Kafka', 'SNS', 'delivery guarantees']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা রেডিও broadcast: স্টেশন (publisher) একবার একটা frequency-তে (topic) সম্প্রচার করে। যার রিসিভার সেই frequency-তে টিউন করা (subscriber) সে-ই পায় — স্টেশন জানে না বা পরোয়া করে না কতজন শুনছে। একটা consumer group হলো একটা পরিবারের মতো যেখানে একটাই রেডিও: পরিবারের সবাই একই broadcast একবারই শোনে, প্রতি ব্যক্তির জন্য একবার করে নয়।

</Callout>

## গল্পে বুঝি

সিনার একটা ম্যাগাজিন প্রকাশনা আছে। প্রতি মাসে সে আলাদা আলাদা বিষয়ে ইস্যু ছাপে — একটা খেলার ম্যাগাজিন, একটা রান্নার ম্যাগাজিন, একটা বিজ্ঞানের ম্যাগাজিন। ছাপা হয়ে গেলে সে শুধু কপিগুলো ডিস্ট্রিবিউটরের কাছে জমা দিয়ে দেয়, ব্যস। কে পড়বে, কতজন পড়বে, কোথায় বসে পড়বে — এসব নিয়ে সিনা মাথাই ঘামায় না। তার কাজ শুধু বিষয় অনুযায়ী ইস্যু বের করা।

অন্যদিকে পাঠকরা যার যেটা পছন্দ সেই বিষয়ে সাবস্ক্রাইব করে রাখে। খোয়ারিজমি খেলা আর বিজ্ঞান — দুটোতেই সাবস্ক্রাইব করা, তাই দুই বিষয়ের নতুন ইস্যু বেরোলেই তার কাছে চলে আসে। ফাতিমা শুধু রান্নার ম্যাগাজিন নিয়েছে, সে কেবল রান্নার ইস্যু পায়। কেউ চাইলে যেকোনো সময় নতুন বিষয়ে সাবস্ক্রাইব করতে পারে, আবার মন উঠে গেলে আনসাবস্ক্রাইবও করে দিতে পারে — সিনাকে জানানোরও দরকার নেই। নতুন কোনো ইস্যু বেরোলে ডিস্ট্রিবিউটর সেটার প্রতিটা বর্তমান সাবস্ক্রাইবারের কাছে আপনাআপনি পৌঁছে দেয়।

এই গল্পটাই আসলে **pub/sub**। সিনা হলো **publisher** — সে পাঠকদের চেনেও না, তাদের কথা ভাবেও না, মানে producer পুরোপুরি consumer থেকে **decouple** করা। প্রতিটা ম্যাগাজিনের বিষয় হলো একেকটা **topic**, আর পাঠকরা যার যেই বিষয় পছন্দ সেই topic-এ **subscriber** হয়ে থাকে। একটা নতুন ইস্যু যখন তার সব সাবস্ক্রাইবারের কাছে একসাথে পৌঁছায় — সেটাই **fan-out**। বাস্তবে Kafka, SNS/SQS ঠিক এভাবেই কাজ করে: publisher একটা topic-এ event ছাড়ে, কে শুনছে না জেনেই, আর সিস্টেম সেই event প্রতিটা subscriber-এর কাছে fan-out করে দেয়।

## মূল ধারণাগুলো

**Publisher:** একটা topic-এ events তৈরি করে। Subscriber সম্পর্কে কিছুই জানে না।

**Topic:** নাম দেওয়া channel। Messages কোনো নির্দিষ্ট subscriber-এর কাছে নয়, একটা topic-এ পাঠানো হয়।

**Subscriber:** এক বা একাধিক topic থেকে events consume করে। আগ্রহ প্রকাশ করে, মিলে যাওয়া events পায়।

**Consumer Group:** একই subscriber-এর একাধিক instance যারা processing-এর load ভাগ করে নেয়। প্রতিটি message group-এর ঠিক একজন সদস্যের কাছে পৌঁছায়।

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

একই topic-এ দুটো consumer group প্রতিটি message-এর আলাদা কপি পায়। একই group-এর তিনটা instance load ভাগ করে নেয় — প্রতিটি message তাদের যেকোনো একজনের কাছে যায়।

## Delivery Guarantee

প্রতিটি pub/sub সিস্টেম কী guarantee করবে সেটা নিয়ে একটা সিদ্ধান্ত নেয়:

**At-most-once:** Message শূন্য বা একবার delivered হয়। হারিয়ে যেতে পারে। সবচেয়ে দ্রুত। ব্যবহার করুন: metrics, telemetry, real-time dashboard যেখানে একটা point বাদ পড়া মেনে নেওয়া যায়।

**At-least-once:** Message এক বা একাধিকবার delivered হয়। duplicate হতে পারে। সবচেয়ে প্রচলিত। ব্যবহার করুন: যা কিছু idempotent বানানো যায় (বেশিরভাগ business event)।

**Exactly-once:** Message ঠিক একবারই delivered হয়। সবচেয়ে ব্যয়বহুল। ব্যবহার করুন: financial transaction, inventory deduction যেখানে duplicate সত্যিকারের ক্ষতি করে।

বেশিরভাগ সিস্টেম at-least-once দেয় আর consumer-দের deduplication handle করতে বলে:

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

একটা event → অনেক subscriber, প্রত্যেকে আলাদা কাজ করছে:

```
OrderPlaced
  ├── notifications-service: send confirmation email
  ├── inventory-service: reserve items
  ├── analytics-service: update sales dashboard
  ├── fraud-service: check for suspicious patterns
  └── loyalty-service: award points
```

প্রতিটি subscriber স্বাধীনভাবে handle করে, স্বাধীনভাবে fail করে, স্বাধীনভাবে scale করে। একটা নতুন subscriber যোগ করতে (যেমন একটা নতুন loyalty program) order service-এ শূন্য পরিবর্তন লাগে।

**SNS + SQS দিয়ে fan-out তৈরি করা (AWS):**

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

Subscriber শুধু সেই events পেতে filter করতে পারে যেগুলো নিয়ে তারা আগ্রহী — অপ্রাসঙ্গিক events পেয়ে ফেলে দেওয়ার দরকার নেই:

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

Kafka শুধু একটা message queue নয় — এটা একটা persistent log। Messages ধরে রাখা হয় (configurable, প্রায়ই 7-30 দিন) আর consumer যেকোনো offset থেকে replay করতে পারে। এটা যা সম্ভব তা পাল্টে দেয়:

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

**Kafka-র মূল বৈশিষ্ট্যগুলো:**

- **Ordering:** একই partition key-সহ messages কঠোরভাবে ordered থাকে
- **Durability:** Messages disk-এ persist করা হয়, broker-দের মধ্যে replicate করা হয়
- **Replay:** Consumer যেকোনো offset-এ গিয়ে ইতিহাস আবার process করতে পারে
- **Throughput:** সাধারণ hardware-এ প্রতি সেকেন্ডে লক্ষ লক্ষ message

**কখন SNS/SQS-এর বদলে Kafka:**

- একটা partition-এর ভেতর message ordering দরকার
- Events replay করা দরকার (একটা consumer-এর bug ঠিক করা, historical data আবার process করা)
- ভিন্ন retention চাহিদাসহ team/system-দের মধ্যে events শেয়ার করা দরকার
- Throughput এত বেশি যে managed queue দিয়ে অর্থনৈতিকভাবে handle করা যায় না

## Ordering Guarantee

Ordering শুধু একটা partition-এর ভেতর (Kafka) বা একটা single FIFO queue-এর ভেতর (SQS FIFO) guaranteed। Cross-partition ordering guaranteed নয়।

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

বেশিরভাগ business event-এর জন্য per-entity ordering (order_123-এর সব event ঠিক ক্রমে) যথেষ্ট আর অর্জনযোগ্য। সব event জুড়ে global ordering সাধারণত দরকার হয় না আর throughput-এর খরচ দিয়ে সেটা করার মূল্য নেই।

## Dead-Letter Topics

Retry-র পরেও যে messages process-এ fail করে সেগুলো তদন্তের জন্য একটা dead-letter topic-এ যায়:

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

DLQ-র গভীরতা মনিটর করুন — বেড়ে চলা DLQ একটা consumer bug বা producer আর consumer-এর মধ্যে schema mismatch-এর ইঙ্গিত দেয়।
