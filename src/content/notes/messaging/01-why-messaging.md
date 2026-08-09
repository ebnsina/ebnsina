---
title: 'Messaging Systems কেন লাগে'
subtitle: 'স্কেলে সরাসরি HTTP call যেসব সমস্যা তৈরি করে — আর async messaging কীভাবে coupling, backpressure ও reliability সামলায়।'
chapter: 1
level: 'beginner'
readingTime: '8 মিনিট'
topics: ['messaging', 'queues', 'async', 'decoupling', 'backpressure', 'pub/sub']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ডাকঘর বনাম ফোন কল: একটা ফোন কলের জন্য দুই পক্ষকেই একসাথে উপস্থিত থাকতে হয় — যেকোনো একজন লাইন কেটে দিলে কথোপকথন ফেল করে। একটা চিঠি জমা রাখা হয়, প্রেরক অফলাইনে চলে গেলেও টিকে থাকে, প্রাপক ব্যস্ত থাকলেও টিকে থাকে, আর প্রাপক প্রস্তুত হলে পৌঁছে যায়। Messaging system হলো সফটওয়্যার সার্ভিসের জন্য ডাকঘর ব্যবস্থা।

</Callout>

## গল্পে বুঝি

ইবনে সিনার একটা ছোট কুরিয়ার ব্যবসা — সারাদিন সে শহরের এ-মাথা ও-মাথা পার্সেল নিয়ে ছোটে। আগে সে প্রতিটা পার্সেল সরাসরি প্রাপকের হাতে দিতে চাইত, কিন্তু ঝামেলা হতো — আল-খোয়ারিজমি বাসায় না থাকলে ইবনে সিনাকে দাঁড়িয়ে অপেক্ষা করতে হতো, নয়তো পার্সেল ফেরত নিয়ে আসতে হতো। দুজনকেই একই সময়ে হাজির থাকতে হতো, নাহলে ডেলিভারি ফেল।

তাই পাড়ার মোড়ে একটা তালাবন্ধ ড্রপ-বক্স (parcel locker) বসানো হলো। এখন ইবনে সিনা যখন খুশি এসে পার্সেল বাক্সে ঢুকিয়ে সঙ্গে সঙ্গে পরের ডেলিভারিতে চলে যায় — প্রাপকের জন্য এক সেকেন্ডও দাঁড়ায় না। আল-খোয়ারিজমি সারাদিন বাইরে থাকলেও সমস্যা নেই; সন্ধ্যায় ফিরে যখন সময় হয়, তখন বাক্স খুলে পার্সেল নিয়ে যায় — জিনিস বাক্সে নিরাপদেই পড়ে থাকে। এমনকি উৎসবের দিন হঠাৎ একগাদা পার্সেল এলে সেগুলো বাক্সে সারি বেঁধে জমে থাকে, কেউ চাপে পিষে যায় না।

এই গল্পটাই আসলে **messaging**। ইবনে সিনা হলো **producer**, ড্রপ-বক্স হলো **message queue** বা **broker**, আর আল-খোয়ারিজমি হলো **consumer**। কেউ কারো জন্য অপেক্ষা করে না — এটাই **decouple** করা, async কাজ। প্রাপক সারাদিন অনুপস্থিত থাকলেও পার্সেল টিকে থাকে — এটাই **buffering** আর consumer down থাকলেও reliability। বাস্তবে RabbitMQ, Kafka বা NATS ঠিক এই ড্রপ-বক্সের কাজটাই করে — producer আর consumer-কে আলাদা রাখে, ট্রাফিকের ঢল queue-তে জমিয়ে রাখে, আর একটা সার্ভিস ডাউন থাকলেও মেসেজ হারাতে দেয় না।

## সরাসরি Call-এর সমস্যা

যখন Service A সরাসরি HTTP দিয়ে Service B-কে call করে:

```
OrderService → HTTP POST /process → PaymentService
```

তিনটা জিনিস একসাথে সত্য হতে হবে:

1. PaymentService-কে আপ থাকতে হবে
2. PaymentService-কে A-এর timeout-এর মধ্যে respond করতে হবে
3. network নির্ভরযোগ্য হতে হবে

এগুলোর যেকোনো একটা ফেল করলে order-টাও ফেল করে। সার্ভিসগুলো **temporally coupled** — দুটোকেই একই সময়ে available থাকতে হয়।

## স্কেলে কী ভেঙে পড়ে

**Thundering herd:** একগাদা order একসাথে চলে আসে। PaymentService একবারে ১০,০০০ HTTP call পায়। এটা ৫০০/sec সামলাতে পারে। বাকিগুলো 503 দিয়ে ফেল করে। আপনি order হারালেন।

**Cascading failure:** PaymentService স্লো (database সমস্যা)। OrderService-এর request response-এর জন্য অপেক্ষা করতে করতে জমতে থাকে। OrderService-এর thread pool শেষ হয়ে যায়। OrderService ব্যবহারকারীদের 503 ফেরত দিতে শুরু করে। EmailService (যেটা OrderService-কে call করে) ফেল করতে শুরু করে। এক সার্ভিসের স্লো-ভাব উপরের দিকে ছড়িয়ে পড়ে।

**Tight coupling:** একটা নতুন সার্ভিস (analytics, fraud detection) যোগ করতে গেলে যেটার order event দরকার, সেটার জন্য OrderService-কে modify করে সেই সার্ভিসকে call করাতে হয়। প্রতিটা নতুন consumer = একটা নতুন সরাসরি dependency।

## Messaging সমাধান

```
OrderService → [Queue] → PaymentService
                       → FraudDetection (same events)
                       → Analytics (same events)
```

OrderService মেসেজটা জমা রাখে আর সাথে সাথে এগিয়ে যায়। PaymentService নিজের গতিতে process করে। PaymentService ডাউন হলে মেসেজ queue-তে জমতে থাকে — সেগুলো হারায় না। যখন আবার আপ হয়, তখন জমে থাকা backlog process করে।

**Temporal decoupling:** Producer আর consumer-কে একই সময়ে আপ থাকতে হয় না।

**Rate limiting / backpressure:** queue traffic spike শুষে নেয়। Consumer একটা টেকসই গতিতে process করে। কোনো thundering herd নেই।

**Fan-out:** একাধিক consumer একই event পড়ে, producer সেগুলোর ব্যাপারে কিছু না জেনেই।

## Messaging Primitives

**Queue:** Point-to-point। এক producer, এক consumer group। প্রতিটা মেসেজ একবারই consume হয়।

```
Producer → [Queue] → Consumer A processes it
                     (Consumer B never sees it)
```

**Pub/Sub:** One-to-many। Publisher একটা topic-এ পাঠায়; সব subscriber একটা করে copy পায়।

```
Producer → [Topic] → Consumer A gets a copy
                   → Consumer B gets a copy
                   → Consumer C gets a copy
```

**Stream:** ক্রমানুসারী, persistent log। Consumer যেকোনো position থেকে replay করতে পারে। Consume করার পরেও মেসেজ ধরে রাখা হয়।

```
Producer → [Stream: offset 0, 1, 2, 3...]
             Consumer A reads from offset 0
             Consumer B reads from offset 2 (started later)
             Consumer A re-reads from offset 0 after a bug fix
```

## Delivery Guarantee

**At-most-once:** মেসেজ শূন্য বা একবার deliver হয়। Fire and forget। দ্রুত; কিছু মেসেজ হারায়।

**At-least-once:** মেসেজ এক বা একাধিকবার deliver হয়। Consumer-কে idempotent হতে হবে (duplicate সামলাতে হবে)। নির্ভরযোগ্য সিস্টেমের জন্য default।

**Exactly-once:** মেসেজ ঠিক একবার deliver হয়। এর জন্য coordination লাগে (transaction বা idempotency key)। খরচসাপেক্ষ; শুধু financial operation-এর জন্যই এটা মূল্যবান।

```typescript
// At-least-once consumer — must handle duplicates
async function processOrder(message: Message) {
	const { orderId } = message.body;

	// Idempotency: if already processed, skip without error
	const existing = await db.query('SELECT id FROM processed_orders WHERE order_id = $1', [orderId]);
	if (existing.rows.length > 0) {
		await message.ack(); // acknowledge without reprocessing
		return;
	}

	await processPayment(orderId);
	await db.query('INSERT INTO processed_orders (order_id) VALUES ($1)', [orderId]);
	await message.ack();
}
```

## Backpressure

Consumer যখন তাল মেলাতে পারে না, তখন producer-কে ধীরে করার সংকেত দেয়।

Backpressure ছাড়া:

- Producer পাঠায় 1000 msg/sec
- Consumer সামলায় 100 msg/sec
- Queue অনির্দিষ্টকাল ধরে 900 msg/sec হারে বাড়ে
- শেষমেশ: OOM, disk full, বা message expiry

Backpressure সহ:

- RabbitMQ: `prefetch` সীমিত করে একটা consumer কতগুলো unacked মেসেজ ধরে রাখবে
- Kafka: consumer নিজের read rate নিয়ন্ত্রণ করে (pull model)
- NATS JetStream: max-pending limit

```typescript
// RabbitMQ: consumer pulls max 10 messages at a time
channel.prefetch(10);

// Process each before pulling more
channel.consume('orders', async (msg) => {
	await processOrder(msg);
	channel.ack(msg);
});
```

`prefetch(10)` থাকলে, প্রথম ১০টার মধ্যে অন্তত একটা acknowledge না হওয়া পর্যন্ত broker ১১ নম্বর মেসেজ deliver করবে না। Consumer নিজের গতি নিজে নিয়ন্ত্রণ করে।

## একটা সিস্টেম বাছাই করা

|                | RabbitMQ              | NATS                                            | Kafka                                        |
| -------------- | --------------------- | ----------------------------------------------- | -------------------------------------------- |
| **Model**      | Queue + pub/sub       | Pub/sub + streams                               | Distributed log                              |
| **Retention**  | consume হওয়া পর্যন্ত | consume হওয়া পর্যন্ত (JetStream: configurable) | Configurable (দিন/সপ্তাহ)                    |
| **Throughput** | ~50k msg/sec          | ~1M msg/sec                                     | ~1M+ msg/sec                                 |
| **Replay**     | না (queue)            | JetStream: হ্যাঁ                                | হ্যাঁ (মূল feature)                          |
| **Ordering**   | Per-queue             | Per-subject                                     | Per-partition                                |
| **Complexity** | কম-মাঝারি             | কম                                              | বেশি                                         |
| **Best for**   | Task queue, RPC       | High-throughput event, IoT                      | Event sourcing, audit log, stream processing |

**RabbitMQ দিয়ে শুরু করুন** যদি আপনার নির্ভরযোগ্য task queue দরকার হয় আর আপনার টিম HTTP/REST জানে। **Kafka-তে যান** যখন replay, দীর্ঘ retention, বা high-throughput event stream দরকার। **NATS** নিন high-throughput চাইলে অথচ সহজ ops-এর জন্য।
