---
title: 'Schema Evolution ও Event Versioning'
subtitle: 'Events চিরস্থায়ী — consumer না ভেঙে schema কীভাবে evolve করাবেন, আর যে registry সবাইকে সমন্বয়ে রাখে।'
chapter: 5
level: 'advanced'
readingTime: '9 মিনিট'
topics:
  ['schema evolution', 'Avro', 'Schema Registry', 'backward compatibility', 'event versioning']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা আইনি চুক্তি সংশোধন করা: মূল চুক্তিতে যা লেখা ছিল আপনি ফিরে গিয়ে তা পাল্টাতে পারেন না — অন্য পক্ষরা সেটায় সই করেছে আর তার উপর নির্ভর করেছে। আপনি একটা addendum জারি করেন যা মূলটিকে স্পষ্ট করে বা বাড়ায়। Event schema ঠিক একইভাবে কাজ করে: বিদ্যমান consumer বর্তমান format-এর উপর নির্ভর করে, তাই আপনি replace না করে extend করেন, আর সব consumer migrate না হওয়া পর্যন্ত পুরনো version বৈধ থাকে।

</Callout>

## গল্পে বুঝি

জেলা রেকর্ড অফিসে একটা জমি-রেজিস্ট্রেশন ফর্ম পঞ্চাশ বছর ধরে চলছে। ইবনে সিনা সেখানকার পুরনো কেরানি — তাঁর আলমারিভরা ড্রয়ারে লক্ষ লক্ষ পুরনো ভরা ফর্ম জমা, আর নিয়ম হলো এই আর্কাইভের প্রতিটা কপি চিরকাল পড়ার যোগ্য থাকতে হবে। এখন সরকার চাইছে নতুন করে "মোবাইল নম্বর" তথ্যটাও নেওয়া হোক। আল-খোয়ারিজমি প্রস্তাব দিলেন পুরনো "টেলিগ্রাম ঠিকানা" ঘরটাকেই মোবাইল নম্বরের জন্য কাজে লাগিয়ে দিতে। ইবনে সিনা মাথা নাড়লেন — তাহলে আর্কাইভের প্রতিটা পুরনো ফর্মের ওই ঘরের মানে হঠাৎ বদলে যাবে, লক্ষ লক্ষ কপি ভুল অর্থ বইতে শুরু করবে।

তার বদলে তাঁরা ফর্মের নিচে একটা নতুন ঘর জুড়ে দিলেন — খালি থাকলেও চলবে, বাধ্যতামূলক নয়। পুরনো ফর্মগুলোতে এই ঘরটা নেই, কিন্তু সেগুলো এখনও পুরোপুরি বৈধ। প্রতিটা ফর্মের কোণে একটা ভার্সন স্ট্যাম্প বসানো — "সংস্করণ ৩", "সংস্করণ ৪"। কোনো পুরনো "সংস্করণ ২" ফর্ম নতুন কাউন্টারে এলে ফাতিমা আল-ফিহরি সেটা হাতে নিয়ে নতুন লেআউটে "অনুবাদ" করে দেন — খালি নতুন ঘরটায় ডিফল্ট বসিয়ে, বাকি সব ঘর যেমন আছে রেখে।

এই গল্পটাই **schema evolution**। চিরকাল আর্কাইভে থাকা ফর্ম = চিরকাল স্টোর হওয়া events, যেগুলো পুরনো আর নতুন দুই ধরনের consumer-ই পড়ে। শুধু নতুন **optional field** জোড়া (নতুন খালি ঘর) = **backward compatibility** — পুরনো events ভাঙে না। কোনো ঘর কখনও repurpose বা মুছে না ফেলা = existing field না ভাঙা (নাহলে forward compatibility নষ্ট হয়)। কোণের ভার্সন স্ট্যাম্প = **event versioning**, আর পুরনো ফর্মকে নতুন লেআউটে অনুবাদ করা = **upcasting** — পড়ার সময় পুরনো event-কে নতুন shape-এ তুলে আনা। বাস্তবে Kafka/Avro-তে ঠিক এভাবেই schema registry নতুন field-কে optional-with-default রাখতে বাধ্য করে, যাতে বছর-পুরনো events আর আজকের consumer পাশাপাশি টিকে থাকে।

## Schema Evolution কেন কঠিন

Events durable। একবার Kafka বা S3-তে publish হলে, সেগুলো বছরের পর বছর ধরে রাখা হতে পারে। একবার একটা consumer deploy হয়ে গেলে যেটা একটা event-এর version 1 পড়ে, আপনি নিরাপদে version 1-এর schema পাল্টাতে পারবেন না — deploy করা consumer ভেঙে যাবে।

একটা schema পাল্টানোর দরকার হলে আপনার সামনে তিনটা option থাকে:

1. একটা backward-compatible পরিবর্তন করুন (optional field যোগ করুন — নিরাপদ)
2. একটা forward-compatible পরিবর্তন করুন (field সরান — ঝুঁকিপূর্ণ)
3. একটা নতুন version তৈরি করে দুটোই সমান্তরালে চালান (নিরাপদ, কিন্তু জটিল)

## Compatibility Rules

**Backward compatible** (নতুন consumer পুরনো events পড়তে পারে):

```typescript
// V1 event — already deployed and in Kafka
{ type: 'OrderPlaced', orderId: '123', userId: 'u_1', amount: 9999 }

// Adding a new optional field is backward compatible
// Old events without 'currency' can be read by new consumers (default to 'USD')
{ type: 'OrderPlaced', orderId: '123', userId: 'u_1', amount: 9999, currency: 'EUR' }
```

**Backward compatible নয়** (deploy করা consumer ভাঙে):

```typescript
// BREAKING: removing a field
{ type: 'OrderPlaced', orderId: '123', amount: 9999 }
// Consumer expecting 'userId' crashes

// BREAKING: renaming a field
{ type: 'OrderPlaced', orderId: '123', customerId: 'u_1', amount: 9999 }
// Consumer expecting 'userId' gets null

// BREAKING: changing a type
{ type: 'OrderPlaced', orderId: '123', userId: 'u_1', amount: '99.99' }
// Consumer expecting number gets string
```

## নিরাপদ Evolution কৌশল

**Default-সহ optional field যোগ করুন:**

```typescript
// V1 — deployed
interface OrderPlacedV1 {
	type: 'OrderPlaced';
	orderId: string;
	userId: string;
	amount: number;
}

// V1.1 — safe to deploy
interface OrderPlacedV1_1 {
	type: 'OrderPlaced';
	orderId: string;
	userId: string;
	amount: number;
	currency?: string; // optional, consumers default to 'USD' if absent
	discountCode?: string; // optional
}
```

Consumer পুরনো ও নতুন দুটোই handle করে:

```typescript
function handleOrderPlaced(event: OrderPlacedV1_1): void {
	const currency = event.currency ?? 'USD'; // default for old events
	processOrder({ ...event, currency });
}
```

**Explicit versioning — সমান্তরাল events:**

```typescript
// Keep publishing V1 for old consumers
await publish({ type: 'OrderPlaced', version: 1, ...v1Data });

// Also publish V2 for new consumers
await publish({ type: 'OrderPlaced', version: 2, ...v2Data });

// Or use separate event types entirely
await publish({ type: 'OrderPlacedV2', ...newData });

// Old consumers ignore 'OrderPlacedV2' — unsubscribed
// New consumers ignore 'OrderPlaced' (v1) after migration period
// Deprecate and remove V1 once all consumers migrated
```

**Transitional period-সহ rename করা:**

```typescript
// Step 1: Publish both old and new field name
{
  userId: 'u_123',        // old name — for existing consumers
  customerId: 'u_123',    // new name — for new consumers
}

// Step 2: After all consumers migrated to new name:
{
  customerId: 'u_123',    // old name removed
}
```

## Schema Registry

একটা schema registry events publish হওয়ার আগে compatibility নিয়ম প্রয়োগ করে। Kafka-র জন্য Confluent Schema Registry হলো standard:

```typescript
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';

const registry = new SchemaRegistry({ host: 'http://schema-registry:8081' });

// Register schema (fails if not compatible with previous version)
const { id: schemaId } = await registry.register(
	{
		type: SchemaType.AVRO,
		schema: JSON.stringify({
			type: 'record',
			name: 'OrderPlaced',
			namespace: 'com.myapp.orders',
			fields: [
				{ name: 'orderId', type: 'string' },
				{ name: 'userId', type: 'string' },
				{ name: 'amount', type: 'long' },
				{ name: 'currency', type: ['null', 'string'], default: null } // optional
			]
		})
	},
	{ subject: 'order-events-value' }
);

// Producer: encode with schema
const encodedEvent = await registry.encode(schemaId, {
	orderId: order.id,
	userId: order.userId,
	amount: order.totalAmount,
	currency: order.currency
});

await producer.send({
	topic: 'order-events',
	messages: [{ value: encodedEvent }]
});

// Consumer: decode (schema fetched from registry by ID embedded in message)
const decoded = await registry.decode(message.value);
```

Registry তিনটা compatibility mode-এর একটা প্রয়োগ করে:

- **BACKWARD:** নতুন schema পুরনো ডেটা পড়তে পারে (নতুন consumer পুরনো events handle করে)
- **FORWARD:** পুরনো schema নতুন ডেটা পড়তে পারে (পুরনো consumer নতুন events handle করে)
- **FULL:** দুটোই — সবচেয়ে নিরাপদ, সবচেয়ে কড়া

## Avro vs JSON

JSON events নমনীয় কিন্তু untyped — একটা field rename নীরবে consumer ভেঙে ফেলে। Avro একটা binary format দেয় যেখানে প্রতিটি message-এ একটা schema embedded থাকে:

```json
// Avro schema
{
	"type": "record",
	"name": "OrderPlaced",
	"fields": [
		{ "name": "orderId", "type": "string" },
		{ "name": "userId", "type": "string" },
		{ "name": "amount", "type": "long" },
		{
			"name": "currency",
			"type": ["null", "string"],
			"default": null
		}
	]
}
```

**Avro-র সুবিধা:**

- Schema message-এর সাথে encode করা — consumer সবসময় schema জানে
- Registry publish-এর আগে compatibility প্রয়োগ করে
- Compact binary format (JSON-এর চেয়ে ছোট)
- Strongly typed — rename runtime-এ নয়, schema registration-এই ধরা পড়ে

**JSON-এর সুবিধা:**

- Human readable — debug করা সহজ
- কোনো toolchain লাগে না
- নমনীয় — early-stage-এর জন্য ভালো যেখানে schema দ্রুত পাল্টায়

JSON events + একটা versioning convention দিয়ে শুরু করুন। যখন একাধিক team events consume করছে আর schema drift একটা সত্যিকারের সমস্যা হয়ে দাঁড়ায় তখন Avro + Schema Registry গ্রহণ করুন।

## Consumer-Driven Contract Testing

Producer-দের অনুমান করার বদলে consumer-দের আসলে যা দরকার তার বিপরীতে test করা উচিত। Consumer-driven contract test consumer-দের তাদের প্রত্যাশা ঘোষণা করতে দেয় আর producer যাচাই করে তারা সেগুলো পূরণ করছে কিনা।

```typescript
// Consumer defines its contract (what it needs from the event)
// consumer.contract.ts
export const orderPlacedContract = {
	type: 'OrderPlaced',
	required: ['orderId', 'userId', 'amount'],
	optional: ['currency', 'discountCode']
};

// Producer runs contract tests in CI
describe('OrderPlaced event contract', () => {
	it('includes all required fields from notification-service contract', () => {
		const event = buildOrderPlacedEvent(mockOrder);

		for (const field of orderPlacedContract.required) {
			expect(event).toHaveProperty(field);
			expect(event[field]).not.toBeUndefined();
		}
	});
});
```

Pact-এর মতো tool এটা স্বয়ংক্রিয় করে — consumer-রা তাদের contract একটা broker-এ publish করে, আর producer deploy করার আগে সেগুলোর বিপরীতে যাচাই করে।

## Event Versioning চেকলিস্ট

```
□ Every event has a 'version' field in the envelope
□ Schema changes documented with migration notes
□ New optional fields have defaults (no consumer changes required)
□ Breaking changes use a new event type or incremented major version
□ Consumers handle unknown fields gracefully (ignore, don't crash)
□ Schema Registry enforces BACKWARD_TRANSITIVE compatibility
□ Deprecation notice in Slack/docs before removing old event version
□ At least 2 sprint migration window before removing deprecated version
□ Consumer tests explicitly test handling of old event versions
```

**Unknown field সাবধানে handle করা:**

```typescript
// WRONG — crashes on new fields
function parseEvent(raw: unknown): OrderPlaced {
	const { orderId, userId, amount } = raw as Record<string, unknown>;
	return { orderId: orderId as string, userId: userId as string, amount: amount as number };
}

// RIGHT — extract what you need, ignore the rest
function parseEvent(raw: unknown): OrderPlaced {
	const data = raw as Record<string, unknown>;
	return {
		orderId: String(data.orderId),
		userId: String(data.userId),
		amount: Number(data.amount),
		currency: typeof data.currency === 'string' ? data.currency : 'USD'
		// unknown future fields are silently ignored
	};
}
```

Consumer শুধু যা দরকার তা-ই extract করে। Producer-এর যোগ করা নতুন field উপেক্ষা করা হয়। Producer-এর সরানো পুরনো required field শুধু তখনই একটা error ঘটায় যদি consumer সেটার উপর নির্ভর করছিল — যা deploy-এর আগেই contract test দিয়ে ধরা পড়ে।
