---
title: 'Kafka'
subtitle: 'Topics, partitions, consumer groups, retention — the distributed log that makes replay and high-throughput event streaming possible.'
chapter: 3
level: 'intermediate'
readingTime: '13 min'
topics: ['Kafka', 'topics', 'partitions', 'consumer groups', 'KafkaJS', 'retention', 'compaction']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

An immutable newspaper archive: every edition is published, stored, and numbered. Any reader can ask for any edition from any date. You can't remove an article after publication. Multiple readers read the same archive simultaneously and independently — one reader being slow doesn't block another. Kafka is that archive for events.

</Callout>

## The Core Model

Kafka is a distributed, persistent, ordered log. Events are written once and kept for a configurable retention period. Consumers read from any position in the log.

```
Topic: "orders"
  Partition 0: [event@0] [event@1] [event@2] ...
  Partition 1: [event@0] [event@1] [event@2] ...
  Partition 2: [event@0] [event@1] [event@2] ...
```

Key properties:

- **Partitions** — unit of parallelism. More partitions = more consumers processing in parallel.
- **Offset** — position of a message within a partition. Monotonically increasing.
- **Consumer group** — group of consumers that coordinate to process partitions. Each partition assigned to one consumer in the group.
- **Retention** — messages kept for N days or N bytes. Not deleted on consumption.

## Kafka vs RabbitMQ

|                     | Kafka                         | RabbitMQ                 |
| ------------------- | ----------------------------- | ------------------------ |
| **Message removal** | Never (retention-based)       | On acknowledgement       |
| **Replay**          | Yes — seek to any offset      | No                       |
| **Ordering**        | Per-partition                 | Per-queue                |
| **Push vs pull**    | Pull (consumer controls rate) | Push                     |
| **Protocol**        | Custom binary                 | AMQP                     |
| **Throughput**      | 1M+ msg/sec                   | 50k msg/sec              |
| **Routing**         | Topic only                    | Exchange + binding rules |
| **Use when**        | Event log, replay, auditing   | Task queues, RPC         |

## Running Kafka

```bash
# Docker Compose — Kafka with KRaft (no Zookeeper since 3.3)
# docker-compose.yml
services:
  kafka:
    image: apache/kafka:3.7.0
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LOG_DIRS: /var/lib/kafka/data
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"
      KAFKA_DEFAULT_REPLICATION_FACTOR: 1
      KAFKA_NUM_PARTITIONS: 3
```

```bash
# Create a topic
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic orders \
  --partitions 6 \
  --replication-factor 3   # for production cluster
```

## Producing with KafkaJS

```typescript
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
	clientId: 'order-service',
	brokers: ['kafka1:9092', 'kafka2:9092', 'kafka3:9092'],
	retry: {
		retries: 8,
		initialRetryTime: 300
	}
});

const producer = kafka.producer({
	allowAutoTopicCreation: false,
	transactionTimeout: 30_000
});

await producer.connect();

// Single message
await producer.send({
	topic: 'orders',
	messages: [
		{
			key: order.customerId, // same customer → same partition → ordered
			value: JSON.stringify(order),
			headers: {
				'event-type': 'order.created',
				'schema-version': '1'
			}
		}
	]
});

// Batch for throughput
await producer.send({
	topic: 'orders',
	messages: orders.map((order) => ({
		key: order.customerId,
		value: JSON.stringify(order)
	}))
});
```

**Partition key matters:** messages with the same key always go to the same partition, preserving order for that key (e.g., all events for customer `42` in order).

## Consuming with KafkaJS

```typescript
const consumer = kafka.consumer({
	groupId: 'payment-service',
	sessionTimeout: 30_000,
	heartbeatInterval: 3_000,
	maxBytesPerPartition: 1_048_576 // 1MB per fetch
});

await consumer.connect();
await consumer.subscribe({ topic: 'orders', fromBeginning: false });

await consumer.run({
	eachMessage: async ({ topic, partition, message }) => {
		const order = JSON.parse(message.value!.toString());
		const offset = message.offset;

		try {
			await processOrder(order);
			// Offset committed automatically after successful return
		} catch (err) {
			// Don't ack — consumer will retry from this offset
			throw err;
		}
	}
});
```

**Consumer group coordination:** if you run 3 instances of `payment-service` all with `groupId: 'payment-service'`, Kafka assigns partitions across the 3. With 6 partitions: each instance handles 2 partitions. Adding instances is your horizontal scaling — up to the partition count.

## Manual Offset Management

By default KafkaJS auto-commits offsets. For exactly-once semantics (process + commit in one transaction), manage manually:

```typescript
await consumer.run({
	autoCommit: false,
	eachMessage: async ({ topic, partition, message, heartbeat }) => {
		const order = JSON.parse(message.value!.toString());

		// Process and persist atomically
		await db.transaction(async (tx) => {
			await processOrderInTx(tx, order);
			// Record the offset so we know where to resume
			await tx.query(
				'INSERT INTO kafka_offsets (topic, partition, offset) VALUES ($1, $2, $3) ON CONFLICT DO UPDATE SET offset = $3',
				[topic, partition, message.offset]
			);
		});

		// Commit only after successful DB write
		await consumer.commitOffsets([
			{
				topic,
				partition,
				offset: (BigInt(message.offset) + 1n).toString()
			}
		]);

		await heartbeat(); // prevent session timeout during long processing
	}
});
```

## Consumer Lag Monitoring

Consumer lag = how far behind the consumer is from the latest offset. Lag growing = consumer can't keep up.

```bash
# Check lag via CLI
kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group payment-service \
  --describe

# Output:
# TOPIC    PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG  CONSUMER-ID
# orders   0          150234          150300          66   payment-1
# orders   1          98421           98500           79   payment-2
```

Alert when lag grows beyond a threshold. Use `kafka_consumer_lag_seconds` in Prometheus (via `kafka_exporter`) — lag in time is more meaningful than lag in messages (a consumer processing 1000 msg/sec with 10k lag = 10 seconds behind, which may be fine).

## Retention and Compaction

**Time-based retention (default):**

```bash
kafka-configs.sh --alter \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name orders \
  --add-config "retention.ms=604800000"  # 7 days
```

**Size-based retention:**

```
--add-config "retention.bytes=10737418240"  # 10GB per partition
```

**Log compaction:** Keep only the latest message per key. Used for change data — a "users" topic where the latest message per user ID is the current state.

```bash
kafka-configs.sh --alter \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name user-state \
  --add-config "cleanup.policy=compact"
```

Compaction is lazy — Kafka runs compaction in the background. Old segments are compacted; recent data is not. Consumers still process in order; they just see fewer historical values.

## Transactional Producers (Exactly-Once)

```typescript
const producer = kafka.producer({
	transactionalId: 'order-processor-1', // unique per producer instance
	idempotent: true
});

await producer.connect();

const transaction = await producer.transaction();

try {
	await transaction.send({
		topic: 'payments',
		messages: [{ key: order.id, value: JSON.stringify(payment) }]
	});

	await transaction.send({
		topic: 'notifications',
		messages: [{ key: order.id, value: JSON.stringify(notification) }]
	});

	await transaction.commit();
} catch (err) {
	await transaction.abort();
	throw err;
}
```

Transactional producers guarantee atomic multi-topic sends. Consumers must set `isolation.level: 'read_committed'` to only see committed transactions.

## 3-Node Kafka Cluster

```bash
# kafka1: server.properties
broker.id=1
listeners=PLAINTEXT://kafka1:9092
advertised.listeners=PLAINTEXT://kafka1:9092
controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
log.dirs=/var/lib/kafka
default.replication.factor=3
min.insync.replicas=2       # require 2 of 3 to ack writes
```

```bash
# kafka2: same with broker.id=2, kafka3 with broker.id=3
```

With `replication-factor=3` and `min.insync.replicas=2`:

- 1 broker can fail without data loss or availability impact
- Writes require 2 brokers to be up (otherwise producer gets `NotEnoughReplicasException`)

This is the production baseline. Never run Kafka with replication factor &lt; 3 for data you care about.
