---
title: 'Schema Evolution & Event Versioning'
subtitle: 'Events are forever — how to evolve schemas without breaking consumers, and the registry that keeps everyone coordinated.'
chapter: 5
level: 'advanced'
readingTime: '9 min'
topics:
  ['schema evolution', 'Avro', 'Schema Registry', 'backward compatibility', 'event versioning']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Amending a legal contract: you can't go back and change what the original contract said — other parties signed it and relied on it. You issue an addendum that clarifies or extends the original. Event schemas work the same way: existing consumers depend on the current format, so you extend rather than replace, and old versions remain valid until all consumers migrate.

</Callout>

## Why Schema Evolution Is Hard

Events are durable. Once published to Kafka or S3, they may be retained for years. Once a consumer is deployed that reads version 1 of an event, you can't safely change version 1's schema — the deployed consumer will break.

You have three options when a schema needs to change:

1. Make a backward-compatible change (add optional fields — safe)
2. Make a forward-compatible change (remove fields — risky)
3. Create a new version and run both in parallel (safe, but complex)

## Compatibility Rules

**Backward compatible** (new consumers can read old events):

```typescript
// V1 event — already deployed and in Kafka
{ type: 'OrderPlaced', orderId: '123', userId: 'u_1', amount: 9999 }

// Adding a new optional field is backward compatible
// Old events without 'currency' can be read by new consumers (default to 'USD')
{ type: 'OrderPlaced', orderId: '123', userId: 'u_1', amount: 9999, currency: 'EUR' }
```

**Not backward compatible** (breaks deployed consumers):

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

## Safe Evolution Strategies

**Add optional fields with defaults:**

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

Consumer handles both old and new:

```typescript
function handleOrderPlaced(event: OrderPlacedV1_1): void {
	const currency = event.currency ?? 'USD'; // default for old events
	processOrder({ ...event, currency });
}
```

**Explicit versioning — parallel events:**

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

**Rename with transitional period:**

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

A schema registry enforces compatibility rules before events are published. Confluent Schema Registry is the standard for Kafka:

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

The registry enforces one of three compatibility modes:

- **BACKWARD:** New schema can read old data (new consumers handle old events)
- **FORWARD:** Old schema can read new data (old consumers handle new events)
- **FULL:** Both — the safest, most restrictive

## Avro vs JSON

JSON events are flexible but untyped — a field rename silently breaks consumers. Avro provides a binary format with a schema embedded in every message:

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

**Avro advantages:**

- Schema encoded with message — consumer always knows the schema
- Registry enforces compatibility before publish
- Compact binary format (smaller than JSON)
- Strongly typed — rename detected at schema registration, not at runtime

**JSON advantages:**

- Human readable — easier to debug
- No toolchain required
- Flexible — good for early-stage where schemas change rapidly

Start with JSON events + a versioning convention. Adopt Avro + Schema Registry when you have multiple teams consuming events and schema drift becomes a real problem.

## Consumer-Driven Contract Testing

Producers should test against what consumers actually need — not guess. Consumer-driven contract tests let consumers declare their expectations and producers verify they meet them.

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

Tools like Pact automate this — consumers publish their contracts to a broker, and producers verify against them before deploying.

## Event Versioning Checklist

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

**Handling unknown fields defensively:**

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

The consumer only extracts what it needs. New fields added by the producer are ignored. Old required fields removed by the producer cause an error only if the consumer was relying on them — which is caught by contract tests before deployment.
