---
title: 'Change Data Capture'
subtitle: 'Stream every database write as an event using Debezium and PostgreSQL logical replication — without touching application code.'
chapter: 3
level: 'intermediate'
readingTime: '11 min'
topics: ['CDC', 'Debezium', 'logical replication', 'outbox pattern', 'event streaming']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A stenographer who records every spoken word in a courtroom: they don't interrupt proceedings or change what happens — they capture everything as it occurs and produce a complete record. CDC does the same for your database: it reads the transaction log and turns every INSERT, UPDATE, and DELETE into an event stream, without touching your application.

</Callout>

## What CDC Solves

Publishing events from application code has a fundamental problem:

```typescript
// Typical approach — has a consistency problem
async function createOrder(data: OrderData): Promise<Order> {
	const order = await db.orders.create(data);

	// If this fails after the DB write: order exists but no event was published
	// If this is called twice: duplicate events
	await eventBus.publish({ type: 'OrderCreated', data: { orderId: order.id } });

	return order;
}
```

The database write and the event publish are two separate operations. Between them, anything can fail — crash, network error, OOM. You end up with data that exists in the database but no event was published, or vice versa.

CDC solves this by reading the database's own transaction log. If a write committed, the CDC system will eventually publish an event. The database is the source of truth for both.

## How CDC Works

PostgreSQL's logical replication decodes WAL into row-level changes. Debezium reads this stream and publishes changes to Kafka:

```
Application → writes to PostgreSQL
PostgreSQL  → writes to WAL (write-ahead log)
Debezium    → reads WAL via logical replication slot
Debezium    → publishes INSERT/UPDATE/DELETE events to Kafka
Consumers   → read from Kafka
```

No application code changes. Every committed write automatically becomes an event.

## Debezium Setup

**Enable logical replication in PostgreSQL:**

```ini
# postgresql.conf
wal_level = logical
max_replication_slots = 4    # one slot per Debezium connector
max_wal_senders = 4
```

**Create a replication user:**

```sql
CREATE USER debezium WITH REPLICATION LOGIN PASSWORD 'debeziumpass';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium;
-- For Postgres 10+, also need:
GRANT USAGE ON SCHEMA public TO debezium;
```

**Debezium PostgreSQL connector config:**

```json
{
	"name": "orders-connector",
	"config": {
		"connector.class": "io.debezium.connector.postgresql.PostgresConnector",
		"database.hostname": "postgres",
		"database.port": "5432",
		"database.user": "debezium",
		"database.password": "debeziumpass",
		"database.dbname": "mydb",
		"database.server.name": "mydb",
		"table.include.list": "public.orders,public.order_items",
		"plugin.name": "pgoutput",
		"slot.name": "debezium_slot",
		"publication.name": "debezium_publication",
		"tombstones.on.delete": "false",
		"transforms": "unwrap",
		"transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
		"transforms.unwrap.drop.tombstones": "false",
		"transforms.unwrap.delete.handling.mode": "rewrite"
	}
}
```

**Deploy with Docker Compose:**

```yaml
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [zookeeper]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  kafka-connect:
    image: debezium/connect:2.4
    depends_on: [kafka]
    ports:
      - '8083:8083'
    environment:
      BOOTSTRAP_SERVERS: kafka:9092
      GROUP_ID: debezium
      CONFIG_STORAGE_TOPIC: connect_configs
      OFFSET_STORAGE_TOPIC: connect_offsets
      STATUS_STORAGE_TOPIC: connect_statuses

# Register connector:
# curl -X POST http://localhost:8083/connectors \
#   -H 'Content-Type: application/json' \
#   -d @connector-config.json
```

## The Event Structure

Debezium produces events in this shape:

```json
{
	"before": {
		// row state before change (null for INSERT)
		"id": 123,
		"status": "pending",
		"total": 9999
	},
	"after": {
		// row state after change (null for DELETE)
		"id": 123,
		"status": "shipped",
		"total": 9999
	},
	"op": "u", // operation: c=create, u=update, d=delete, r=read (snapshot)
	"ts_ms": 1705000000000, // timestamp of commit
	"source": {
		"db": "mydb",
		"table": "orders",
		"lsn": 12345678, // WAL position
		"txId": 987654 // transaction ID
	}
}
```

Consumer maps this to domain events:

```typescript
interface DebeziumEvent {
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
	op: 'c' | 'u' | 'd' | 'r';
	ts_ms: number;
	source: { db: string; table: string; txId: number };
}

function toOrderEvent(raw: DebeziumEvent): OrderEvent | null {
	const { op, after, before } = raw;

	if (op === 'c' && after) {
		return { type: 'OrderCreated', data: after as OrderRow };
	}

	if (op === 'u' && after && before) {
		// Detect specific state transitions
		if (before.status !== 'shipped' && after.status === 'shipped') {
			return { type: 'OrderShipped', data: after as OrderRow };
		}
		if (before.status !== 'cancelled' && after.status === 'cancelled') {
			return { type: 'OrderCancelled', data: after as OrderRow };
		}
	}

	if (op === 'd' && before) {
		return { type: 'OrderDeleted', data: { id: before.id } };
	}

	return null; // uninteresting change — filter out
}
```

## The Outbox Pattern

An alternative to CDC when you want semantic events (not raw row changes) but still need atomicity. Write events to an `outbox` table in the same transaction as your business data. A separate process (or CDC) reads and publishes them.

```typescript
// Application: writes order + outbox event atomically
await db.transaction(async (tx) => {
	const order = await tx.orders.create(data);

	// Outbox: same transaction = guaranteed consistency
	await tx.outbox.insert({
		id: crypto.randomUUID(),
		aggregateId: order.id,
		aggregateType: 'Order',
		eventType: 'OrderPlaced',
		payload: JSON.stringify({
			orderId: order.id,
			userId: order.userId,
			totalAmount: order.totalAmount
		}),
		createdAt: new Date(),
		publishedAt: null // null = not yet published
	});
});
```

```sql
-- Outbox table
CREATE TABLE outbox (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id    TEXT NOT NULL,
  aggregate_type  TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ           -- null until published
);

CREATE INDEX ON outbox (created_at) WHERE published_at IS NULL;
```

**Outbox publisher (polling approach):**

```typescript
async function publishOutboxEvents(): Promise<void> {
	while (true) {
		const events = await db.outbox.findAll({
			where: { publishedAt: null },
			orderBy: { createdAt: 'asc' },
			limit: 100
		});

		for (const event of events) {
			await eventBus.publish({
				type: event.eventType,
				data: event.payload
			});

			await db.outbox.update(event.id, { publishedAt: new Date() });
		}

		if (events.length === 0) await sleep(1000); // poll every 1s when idle
	}
}
```

Or use Debezium to capture outbox table changes and forward them to Kafka — the "transactional outbox with Debezium" pattern avoids the polling and gives you sub-second event delivery.

## CDC vs Outbox: Choosing

|                     | Raw CDC                  | Outbox Pattern             |
| ------------------- | ------------------------ | -------------------------- |
| Application changes | None                     | Must write to outbox table |
| Event semantics     | Raw row changes          | Domain events you control  |
| Filtering           | In consumer              | In application code        |
| Schema coupling     | Consumer knows DB schema | Consumer sees event schema |
| Setup complexity    | Debezium + Kafka         | Simpler (just a table)     |

**Use raw CDC when:** You don't control the application code, or you need to stream data to another system (data warehouse, search index) and raw row changes are fine.

**Use outbox when:** You want to emit semantic domain events, control the schema, and have the application code you're changing.

## Monitoring CDC Health

```bash
# Check Debezium connector status
curl http://kafka-connect:8083/connectors/orders-connector/status
# {
#   "name": "orders-connector",
#   "connector": { "state": "RUNNING" },
#   "tasks": [{ "state": "RUNNING", "id": 0 }]
# }

# Check replication slot lag (WAL bytes not yet consumed)
SELECT
  slot_name,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS lag
FROM pg_replication_slots
WHERE slot_name = 'debezium_slot';
```

**Alert on:**

- Connector state not RUNNING
- Replication slot lag growing (Debezium falling behind, WAL accumulating)
- Consumer group lag on Kafka (consumers not keeping up)
- DLQ messages growing (events failing to process)

Replication slots hold WAL indefinitely until consumed — if Debezium stops, your WAL grows without bound, potentially filling disk. Monitor slot lag and alert aggressively.
