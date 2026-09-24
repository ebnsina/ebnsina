---
title: 'Kafka'
subtitle: 'Topics, partitions, consumer groups, retention — সেই distributed log যেটা replay আর high-throughput event streaming সম্ভব করে।'
chapter: 3
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['Kafka', 'topics', 'partitions', 'consumer groups', 'KafkaJS', 'retention', 'compaction']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা অপরিবর্তনীয় সংবাদপত্রের আর্কাইভ: প্রতিটা সংস্করণ প্রকাশিত হয়, জমা রাখা হয়, আর নম্বর দেওয়া হয়। যেকোনো পাঠক যেকোনো তারিখের যেকোনো সংস্করণ চাইতে পারেন। প্রকাশের পর কোনো লেখা সরানো যায় না। একাধিক পাঠক একই আর্কাইভ একসাথে এবং স্বাধীনভাবে পড়েন — একজন পাঠক স্লো হলে আরেকজন আটকে যান না। Kafka হলো event-এর জন্য সেই আর্কাইভ।

</Callout>

## গল্পে বুঝি

ফাতিমার বিশাল লাইব্রেরিতে একটা বাঁধাই করা মোটা event-খাতা আছে — নাম "ঘটনাপঞ্জি"। এই লাইব্রেরিতে যা কিছু ঘটে, প্রতিটা ঘটনা ঘটার সাথে সাথে খাতায় ক্রম অনুযায়ী লেখা হয়, প্রতিটা এন্ট্রিতে একটা করে নম্বর বসে। এক নিয়ম — লেখা একবার বসে গেলে আর কখনো মোছা যায় না, শুধু নিচে নতুন এন্ট্রি যোগ হয়। বছরের পর বছর পুরনো এন্ট্রিও খাতায় রয়েই যায়, কেউ পড়ে ফেললেও মোছে না।

খাতাটা পড়েন অনেকজন — গবেষক সিনা, হিসাবরক্ষক খোয়ারিজমি, আরও অনেকে। মজার ব্যাপার, প্রত্যেকের হাতে নিজের একটা করে বুকমার্ক। সিনা হয়তো ৯০ নম্বর এন্ট্রি পর্যন্ত পড়েছেন, খোয়ারিজমি সবে ২০ নম্বরে — যে যার গতিতে এগোয়, একজন ধীর হলে আরেকজন আটকায় না। কেউ চাইলে নিজের বুকমার্ক পিছিয়ে দিয়ে পুরনো এন্ট্রি আবার পড়তে পারেন, কারণ কিছুই তো মোছেনি। আর একটামাত্র খাতা হলে সবাই এসে ভিড় করত, লেখাও আটকে যেত — তাই ঘটনাপঞ্জি বিষয় অনুযায়ী কয়েকটা আলাদা খণ্ডে ভাগ করা: কেনাকাটার খণ্ড, চিঠিপত্রের খণ্ড। ফলে অনেক লেখক আর পাঠক একসাথে সমান্তরালে কাজ করতে পারে।

এই ঘটনাপঞ্জিই আসলে **Kafka**। কখনো না-মোছা, শুধু নিচে-যোগ-হওয়া খাতাটা হলো Kafka-র append-only durable **log** (একটা **topic**); প্রতিটা পাঠকের নিজের বুকমার্ক হলো একেকটা **consumer group**-এর **offset** — যে যার গতিতে স্বাধীনভাবে পড়ে; বুকমার্ক পিছিয়ে পুরনো এন্ট্রি আবার পড়াটাই **replay**; বিষয়-অনুযায়ী আলাদা খণ্ডগুলো হলো **partition**, যা সমান্তরাল throughput দেয়; আর পুরনো এন্ট্রি মোছে না — সেটাই **retention**। বাস্তবেও ঠিক এভাবেই: LinkedIn বা Uber-এ একটা order-event একবার Kafka-তে লেখা হলে billing, analytics, notification — প্রতিটা সিস্টেম নিজের offset ধরে স্বাধীনভাবে সেটা পড়ে, দরকারে গতকালের event replay করে।

## মূল Model

Kafka একটা distributed, persistent, ক্রমানুসারী log। Event একবার লেখা হয় আর একটা configurable retention period পর্যন্ত রাখা হয়। Consumer log-এর যেকোনো position থেকে পড়ে।

```
Topic: "orders"
  Partition 0: [event@0] [event@1] [event@2] ...
  Partition 1: [event@0] [event@1] [event@2] ...
  Partition 2: [event@0] [event@1] [event@2] ...
```

মূল বৈশিষ্ট্য:

- **Partitions** — parallelism-এর একক। বেশি partition = বেশি consumer parallel-ভাবে process করছে।
- **Offset** — একটা partition-এর ভেতরে একটা মেসেজের position। ক্রমাগত বাড়তে থাকে।
- **Consumer group** — consumer-দের একটা group যারা partition process করতে coordinate করে। প্রতিটা partition group-এর একটা consumer-কে assign করা হয়।
- **Retention** — মেসেজ N দিন বা N byte ধরে রাখা হয়। Consume করলেই মুছে যায় না।

## Kafka বনাম RabbitMQ

|                     | Kafka                               | RabbitMQ                |
| ------------------- | ----------------------------------- | ----------------------- |
| **Message removal** | কখনো না (retention-based)           | acknowledgement-এ       |
| **Replay**          | হ্যাঁ — যেকোনো offset-এ seek        | না                      |
| **Ordering**        | Per-partition                       | Per-queue               |
| **Push vs pull**    | Pull (consumer rate নিয়ন্ত্রণ করে) | Push                    |
| **Protocol**        | Custom binary                       | AMQP                    |
| **Throughput**      | 1M+ msg/sec                         | 50k msg/sec             |
| **Routing**         | শুধু Topic                          | Exchange + binding rule |
| **Use when**        | Event log, replay, auditing         | Task queue, RPC         |

## Kafka চালানো

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

## KafkaJS দিয়ে Produce করা

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

**Partition key গুরুত্বপূর্ণ:** একই key-এর মেসেজ সবসময় একই partition-এ যায়, ওই key-এর জন্য order ধরে রাখে (যেমন customer `42`-এর সব event ক্রমানুসারে)।

## KafkaJS দিয়ে Consume করা

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

**Consumer group coordination:** যদি আপনি `payment-service`-এর ৩টা instance চালান, সবগুলো `groupId: 'payment-service'` দিয়ে, Kafka partition-গুলো ৩টার মধ্যে ভাগ করে দেয়। ৬টা partition থাকলে: প্রতিটা instance ২টা করে partition সামলায়। Instance যোগ করাই আপনার horizontal scaling — partition সংখ্যা পর্যন্ত।

## Manual Offset Management

Default-এ KafkaJS offset auto-commit করে। Exactly-once semantics-এর জন্য (এক transaction-এ process + commit), manually manage করুন:

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

Consumer lag = consumer সর্বশেষ offset থেকে কতটা পিছিয়ে আছে। Lag বাড়ছে মানে consumer তাল মেলাতে পারছে না।

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

Lag একটা threshold ছাড়িয়ে গেলে alert দিন। Prometheus-এ `kafka_consumer_lag_seconds` ব্যবহার করুন (`kafka_exporter` দিয়ে) — সময়ের হিসেবে lag মেসেজ সংখ্যার lag-এর চেয়ে বেশি অর্থবহ (একটা consumer যেটা 1000 msg/sec process করে আর 10k lag আছে = 10 second পিছিয়ে, যেটা হয়তো ঠিকই আছে)।

## Retention আর Compaction

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

**Log compaction:** প্রতিটা key-এর শুধু সর্বশেষ মেসেজ রাখা হয়। change data-র জন্য ব্যবহৃত — একটা "users" topic যেখানে প্রতি user ID-র সর্বশেষ মেসেজই বর্তমান state।

```bash
kafka-configs.sh --alter \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name user-state \
  --add-config "cleanup.policy=compact"
```

Compaction lazy — Kafka background-এ compaction চালায়। পুরনো segment compact হয়; সাম্প্রতিক ডেটা হয় না। Consumer এখনো ক্রমানুসারে process করে; তারা শুধু কম historical value দেখে।

## Transactional Producer (Exactly-Once)

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

Transactional producer atomic multi-topic send-এর নিশ্চয়তা দেয়। Consumer-কে শুধু committed transaction দেখতে `isolation.level: 'read_committed'` সেট করতে হবে।

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

`replication-factor=3` আর `min.insync.replicas=2` দিয়ে:

- ডেটা হারানো বা availability-এ প্রভাব ছাড়াই ১টা broker fail করতে পারে
- Write-এর জন্য ২টা broker আপ থাকা দরকার (নাহলে producer `NotEnoughReplicasException` পায়)

এটাই production baseline। যে ডেটা আপনার কাছে গুরুত্বপূর্ণ তার জন্য কখনো replication factor &lt; 3 দিয়ে Kafka চালাবেন না।
