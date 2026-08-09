---
title: 'Change Data Capture'
subtitle: 'Debezium আর PostgreSQL logical replication দিয়ে প্রতিটি database write-কে event হিসেবে stream করুন — application code না ছুঁয়ে।'
chapter: 3
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['CDC', 'Debezium', 'logical replication', 'outbox pattern', 'event streaming']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন stenographer যিনি আদালতে বলা প্রতিটি শব্দ লিখে রাখেন: তিনি কার্যক্রমে বাধা দেন না বা কী ঘটছে তা পাল্টান না — যা ঘটছে সব হুবহু ধরে রাখেন আর একটা সম্পূর্ণ রেকর্ড তৈরি করেন। CDC আপনার database-এর জন্য ঠিক তা-ই করে: এটা transaction log পড়ে আর প্রতিটি INSERT, UPDATE ও DELETE-কে একটা event stream-এ পরিণত করে, আপনার application না ছুঁয়ে।

</Callout>

## গল্পে বুঝি

বাগদাদের বড় বাণিজ্য-দপ্তরে একটাই মাস্টার লেজার — শহরের সব লেনদেন, মজুদ আর হিসাব ওখানেই লেখা হয়। আগে যা হতো, স্টকরুম, নোটিশ বোর্ড আর হিসাব-অফিসের লোকজন সারাদিন পরপর দৌড়ে এসে মাস্টার লেজার উল্টে দেখত কিছু বদলাল কিনা — বেশিরভাগ সময় দেখত কিছুই বদলায়নি, স্রেফ খাটুনি বৃথা। তাই আল-খোয়ারিজমি একটা নতুন নিয়ম চালু করলেন: একজন নিবেদিত কেরানি সারাক্ষণ মাস্টার লেজারের পাশেই বসে থাকবে।

সেই কেরানির কাজ একটাই — লেজারে যে মুহূর্তে কোনো নতুন এন্ট্রি লেখা হয়, কোনো লাইন বদলানো হয় বা কেটে দেওয়া হয়, ঠিক সেই মুহূর্তে সে একটা ছোট "পরিবর্তন-চিরকুট" লিখে ফেলে — হুবহু কী বদলাল সেটুকুই। তারপর সেই চিরকুটের কপি সে স্টকরুম, নোটিশ বোর্ড আর হিসাব-অফিসে পাঠিয়ে দেয়। এখন আর কাউকে দৌড়ে এসে লেজার উল্টাতে হয় না — চিরকুট এলেই প্রত্যেকে নিজের খাতা মাস্টার লেজারের সাথে হুবহু মিলিয়ে রাখে, একদম আপনা-আপনি।

এই কেরানিই আসলে **Change Data Capture (CDC)**। মাস্টার লেজার হলো source database, আর কেরানির প্রতিটি write/change/strike-out পড়ে ফেলাটাই CDC-র database change log (**WAL**/**binlog**) পড়া। যে "পরিবর্তন-চিরকুট" সে পাঠায় সেটাই একটা **change event**, আর যে department-গুলো লেজার বারবার না উল্টেই তাল মিলিয়ে থাকে সেটাই cache, search index আর analytics-এর **polling** ছাড়াই **sync** থাকা। বাস্তবে **Debezium** ঠিক এই কেরানির ভূমিকাটাই পালন করে — PostgreSQL-এর WAL পড়ে প্রতিটি row-change কে Kafka-তে event হিসেবে stream করে দেয়।

## CDC কী সমস্যা সমাধান করে

Application code থেকে events publish করার একটা মৌলিক সমস্যা আছে:

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

Database write আর event publish দুটো আলাদা অপারেশন। এদের মাঝখানে যেকোনো কিছু fail করতে পারে — crash, network error, OOM। শেষমেশ আপনার হাতে থাকে এমন ডেটা যা database-এ আছে কিন্তু কোনো event publish হয়নি, বা উল্টোটা।

CDC এটা সমাধান করে database-এর নিজের transaction log পড়ে। একটা write যদি commit হয়, CDC সিস্টেম শেষ পর্যন্ত একটা event publish করবেই। দুটোর জন্যই database হলো source of truth।

## CDC কীভাবে কাজ করে

PostgreSQL-এর logical replication WAL-কে row-level পরিবর্তনে decode করে। Debezium এই stream পড়ে আর পরিবর্তনগুলো Kafka-তে publish করে:

```
Application → writes to PostgreSQL
PostgreSQL  → writes to WAL (write-ahead log)
Debezium    → reads WAL via logical replication slot
Debezium    → publishes INSERT/UPDATE/DELETE events to Kafka
Consumers   → read from Kafka
```

কোনো application code পরিবর্তন নেই। প্রতিটি commit হওয়া write স্বয়ংক্রিয়ভাবে একটা event হয়ে যায়।

## Debezium Setup

**PostgreSQL-এ logical replication চালু করুন:**

```ini
# postgresql.conf
wal_level = logical
max_replication_slots = 4    # one slot per Debezium connector
max_wal_senders = 4
```

**একটা replication user তৈরি করুন:**

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

**Docker Compose দিয়ে deploy করুন:**

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

## Event Structure

Debezium এই আকারে events তৈরি করে:

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

Consumer এটাকে domain event-এ map করে:

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

## Outbox Pattern

CDC-র একটা বিকল্প যখন আপনি semantic event চান (raw row change নয়) কিন্তু তখনও atomicity দরকার। আপনার business data-র একই transaction-এ একটা `outbox` table-এ events লিখুন। একটা আলাদা process (বা CDC) সেগুলো পড়ে ও publish করে।

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

**Outbox publisher (polling পদ্ধতি):**

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

অথবা Debezium ব্যবহার করে outbox table-এর পরিবর্তন capture করে সেগুলো Kafka-তে forward করুন — "transactional outbox with Debezium" প্যাটার্নটা polling এড়িয়ে যায় আর আপনাকে sub-second event delivery দেয়।

## CDC vs Outbox: বেছে নেওয়া

|                     | Raw CDC                 | Outbox Pattern                  |
| ------------------- | ----------------------- | ------------------------------- |
| Application changes | নেই                     | Outbox table-এ লিখতেই হবে       |
| Event semantics     | Raw row changes         | আপনার নিয়ন্ত্রণে domain events |
| Filtering           | Consumer-এ              | Application code-এ              |
| Schema coupling     | Consumer DB schema জানে | Consumer event schema দেখে      |
| Setup complexity    | Debezium + Kafka        | সহজ (শুধু একটা table)           |

**Raw CDC ব্যবহার করুন যখন:** আপনি application code নিয়ন্ত্রণ করেন না, অথবা আপনাকে অন্য একটা সিস্টেমে (data warehouse, search index) ডেটা stream করতে হবে আর raw row change-ই যথেষ্ট।

**Outbox ব্যবহার করুন যখন:** আপনি semantic domain event emit করতে চান, schema নিয়ন্ত্রণ করতে চান, আর যে application code পাল্টাচ্ছেন সেটা আপনার হাতে আছে।

## CDC Health মনিটর করা

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

**যেসবে alert দিন:**

- Connector state RUNNING না থাকলে
- Replication slot lag বেড়ে চললে (Debezium পিছিয়ে পড়ছে, WAL জমছে)
- Kafka-তে consumer group lag (consumer তাল মেলাতে পারছে না)
- DLQ message বেড়ে চললে (events process-এ fail করছে)

Replication slot consume না হওয়া পর্যন্ত WAL অসীম সময় ধরে রাখে — Debezium থেমে গেলে আপনার WAL সীমাহীনভাবে বাড়তে থাকে, সম্ভবত disk ভরে ফেলে। Slot lag মনিটর করুন আর আক্রমণাত্মকভাবে alert দিন।
