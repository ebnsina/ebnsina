---
title: 'NATS'
subtitle: 'Core pub/sub, JetStream persistence, KV store, আর একটা 3-node cluster চালানো — Kafka-র জটিলতা ছাড়াই নির্ভরযোগ্য messaging-এর দ্রুততম পথ।'
chapter: 4
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['NATS', 'JetStream', 'pub/sub', 'clustering', 'KV store', 'subjects']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ওয়াকি-টকি বনাম একটা রেকর্ডেড ডিসপ্যাচ সিস্টেম: core NATS হলো ওয়াকি-টকি — তাৎক্ষণিক, হালকা, কিন্তু মেসেজ পাঠানোর সময় আপনি না শুনলে সেটা মিস করবেন। JetStream হলো ডিসপ্যাচ রেকর্ডিং সিস্টেম — মেসেজ জমা রাখা হয়, চাহিদামতো replay হয়, আর গ্রহণের সময় acknowledge করা হয়। একই অন্তর্নিহিত রেডিও নেটওয়ার্ক, তার উপর persistence যোগ করা।

</Callout>

## গল্পে বুঝি

ইবনে সিনার পুরনো ছয়তলা বিল্ডিংয়ে একটা মজার ইন্টারকম বাজার নেটওয়ার্ক বসানো। দেয়ালে সারি সারি লেবেল-করা বোতাম — "ছাদ", "গ্যারেজ", "দারোয়ান", "তিনতলা"। কেউ একটা বোতাম চাপলেই সেই লেবেলে যে যে শুনছে, তাদের ঘরে সঙ্গে সঙ্গে বাজ পড়ে। কোনো তার-জট নেই, কোনো সেটআপ নেই, বিদ্যুৎ খরচ প্রায় শূন্য — বোতাম চাপো, বাজ পড়ে, ব্যস। আল-খোয়ারিজমি নিচে দাঁড়িয়ে "গ্যারেজ" বোতাম চাপলে গ্যারেজে বসা যে কেউ তাৎক্ষণিক শুনে ফেলে।

কিন্তু একটা ব্যাপার আছে — এই বাজার কোনো স্মৃতি নেই। ফাতিমা আল-ফিহরি যদি "দারোয়ান" বোতাম চাপেন আর ঠিক সেই মুহূর্তে দারোয়ান চা খেতে বাইরে থাকেন, বাজটা কেবল হাওয়ায় মিলিয়ে যায় — কোথাও জমা থাকে না, পরে আর শোনা যায় না। যেদিন সত্যিই দরকার যে বার্তা হারানো চলবে না, সেদিন ইবনে সিনা বাজারের সঙ্গে একটা অ্যানসারিং-মেশিন অ্যাটাচমেন্ট জুড়ে দেন — এবার প্রতিটা বাজ রেকর্ড হয়ে জমা থাকে, দারোয়ান ফিরে এসে পরেও শুনে নিতে পারেন।

এই বাজার নেটওয়ার্কটাই আসলে **NATS** — হালকা, ভয়ানক দ্রুত আর সরল। প্রতিটা বোতামের লেবেল হলো একটা **subject**, আর সেই লেবেলে যারা শুনছে তারা হলো ওই subject-এর subscriber — এটাই subject-ভিত্তিক pub/sub। কেউ না শুনলে বাজ হারিয়ে যাওয়াটাই core NATS-এর **fire-and-forget** তথা **at-most-once** ডেলিভারি। আর সেই অ্যানসারিং-মেশিন অ্যাটাচমেন্ট হলো **JetStream** — যখন বার্তা জমা রাখা, replay করা আর acknowledge করা দরকার, তখন একই নেটওয়ার্কের উপরেই persistence যোগ হয়। বাস্তবে internal microservice-এর দ্রুত সিগন্যালিং (health ping, cache invalidation notify) core NATS-এ পাঠানো হয়, আর order event-এর মতো হারানো-চলবে-না জিনিস JetStream stream-এ রাখা হয়।

## NATS কেন

NATS হলো Go-তে লেখা একটা cloud-native messaging system। Server একটা একক ~20MB binary। মূল বৈশিষ্ট্য:

- মাঝারি hardware-এ 1M+ messages/sec
- Sub-millisecond latency
- Subject হলো wildcard সহ string (`>`, `*`)
- Per-message routing config নেই — subject-ই হলো routing
- JetStream এর উপর persistence, at-least-once delivery, আর KV store যোগ করে

NATS ব্যবহার করুন যখন আপনি Kafka-মাত্রার throughput চান নাটকীয়ভাবে সহজতর operation-সহ।

## NATS চালানো

```bash
# Single node — local dev
docker run -d --name nats -p 4222:4222 -p 8222:8222 nats:latest

# With JetStream enabled
docker run -d --name nats -p 4222:4222 -p 8222:8222 nats:latest -js

# 3-node cluster (docker-compose)
services:
  nats1:
    image: nats:latest
    command: -p 4222 -cluster nats://0.0.0.0:6222 -routes nats://nats2:6222,nats://nats3:6222 -js -sd /data
    ports: ["4222:4222"]
    volumes: ["nats1:/data"]

  nats2:
    image: nats:latest
    command: -p 4222 -cluster nats://0.0.0.0:6222 -routes nats://nats1:6222,nats://nats3:6222 -js -sd /data
    ports: ["4223:4222"]
    volumes: ["nats2:/data"]

  nats3:
    image: nats:latest
    command: -p 4222 -cluster nats://0.0.0.0:6222 -routes nats://nats1:6222,nats://nats2:6222 -js -sd /data
    ports: ["4224:4222"]
    volumes: ["nats3:/data"]
```

## Core Pub/Sub

```typescript
import { connect, StringCodec } from 'nats';

const nc = await connect({ servers: 'nats://localhost:4222' });
const sc = StringCodec();

// Subscribe
const sub = nc.subscribe('orders.created');
(async () => {
	for await (const msg of sub) {
		const order = JSON.parse(sc.decode(msg.data));
		console.log('Order received:', order.id);
	}
})();

// Publish
nc.publish(
	'orders.created',
	sc.encode(
		JSON.stringify({
			id: 'ord-123',
			customerId: 'cust-456',
			total: 99.99
		})
	)
);
```

Subject wildcard:

- `orders.*` — `orders.created`, `orders.cancelled` মেলায় কিন্তু `orders.payment.failed` নয়
- `orders.>` — `orders.created`, `orders.payment.failed`, যেকোনো depth মেলায়

Core pub/sub হলো fire-and-forget — publish করার সময় কোনো subscriber না শুনলে মেসেজটা হারিয়ে যায়। Persistence-এর জন্য JetStream ব্যবহার করুন।

## JetStream Stream

JetStream মেসেজ configurable retention সহ stream-এ জমা রাখে:

```typescript
import { connect, JSONCodec, RetentionPolicy, StorageType } from 'nats';

const nc = await connect({ servers: 'nats://localhost:4222' });
const js = nc.jetstream();
const jsm = await nc.jetstreamManager();
const jc = JSONCodec();

// Create stream — subjects it captures
await jsm.streams.add({
	name: 'ORDERS',
	subjects: ['orders.>'],
	retention: RetentionPolicy.Limits,
	storage: StorageType.File,
	max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days in nanoseconds
	max_msgs: -1, // unlimited
	num_replicas: 3, // replicate across 3 nodes
	duplicate_window: 2 * 60 * 1e9 // 2-minute deduplication window
});

// Publish to stream
await js.publish(
	'orders.created',
	jc.encode({ id: 'ord-123', customerId: 'cust-456' }),
	{ msgID: 'ord-123' } // deduplication key
);
```

## JetStream Consumer

```typescript
// Push consumer — server pushes to a subject
const pushConsumer = await jsm.consumers.add('ORDERS', {
	durable_name: 'payment-service', // named = durable = remembers position
	deliver_subject: '_INBOX.payments', // server pushes here
	deliver_policy: DeliverPolicy.New, // start from new messages only
	ack_policy: AckPolicy.Explicit, // must ack each message
	max_deliver: 5, // retry up to 5 times
	ack_wait: 30 * 1e9, // 30s to ack before redeliver
	filter_subject: 'orders.created' // only this subject
});

// Pull consumer — consumer requests batches (preferred for workers)
const pullConsumer = await jsm.consumers.add('ORDERS', {
	durable_name: 'analytics',
	ack_policy: AckPolicy.Explicit,
	filter_subject: 'orders.>'
});

// Pull a batch
const messages = await js.fetch('ORDERS', 'analytics', { batch: 100, expires: 5000 });
for await (const msg of messages) {
	const order = jc.decode(msg.data);
	await processForAnalytics(order);
	msg.ack();
}
```

## Work Queue (Competing Consumers)

JetStream work queue: প্রতিটা মেসেজ group-এর ঠিক একটা consumer-কে deliver করা হয়।

```typescript
// Create work queue stream
await jsm.streams.add({
	name: 'EMAIL_JOBS',
	subjects: ['jobs.email.>'],
	retention: RetentionPolicy.WorkQueue, // delete on ack
	storage: StorageType.File,
	num_replicas: 3
});

// Multiple workers consume from same durable consumer
// Each message goes to exactly one worker
await jsm.consumers.add('EMAIL_JOBS', {
	durable_name: 'email-workers',
	ack_policy: AckPolicy.Explicit,
	max_ack_pending: 50 // max outstanding unacked per consumer
});

// Worker process (run multiple instances)
const consumer = await js.consumers.get('EMAIL_JOBS', 'email-workers');
const iter = await consumer.consume({ max_messages: 10 });

for await (const msg of iter) {
	await sendEmail(jc.decode(msg.data));
	msg.ack();
}
```

## KV Store

JetStream-এ একটা distributed key-value store আছে:

```typescript
const kv = await js.views.kv('config', {
	ttl: 3600 * 1e9, // 1 hour TTL
	replicas: 3
});

// Put
await kv.put('feature-flags', jc.encode({ darkMode: true, newCheckout: false }));

// Get
const entry = await kv.get('feature-flags');
const flags = jc.decode(entry.value);

// Watch for changes (reactive config)
const watcher = await kv.watch({ key: 'feature-flags' });
for await (const entry of watcher) {
	const flags = jc.decode(entry.value);
	updateFeatureFlags(flags);
}
```

এটা distributed config-এর জন্য Consul KV বা Redis-কে প্রতিস্থাপন করে — আপনি change notification, history, আর TTL বিল্ট-ইন পান, সবটাই আপনার messaging যে NATS cluster ব্যবহার করে সেই একই cluster-এ।

## Request-Reply

NATS-এ বিল্ট-ইন request-reply আছে — কোনো setup লাগে না:

```typescript
// Server
nc.subscribe('user.lookup', {
	callback: async (err, msg) => {
		const { userId } = jc.decode(msg.data);
		const user = await db.findUser(userId);
		msg.respond(jc.encode(user));
	}
});

// Client
const response = await nc.request('user.lookup', jc.encode({ userId: '123' }), { timeout: 5000 });
const user = jc.decode(response.data);
```

NATS correlation আর reply routing স্বয়ংক্রিয়ভাবে সামলায়। Server respond করা বা timeout শেষ হওয়া পর্যন্ত client block হয়ে থাকে।

## Monitoring

```bash
# NATS monitoring HTTP API (port 8222)
curl http://localhost:8222/varz      # server stats
curl http://localhost:8222/connz     # connections
curl http://localhost:8222/jsz       # JetStream stats
curl http://localhost:8222/subsz     # subscriptions

# JetStream stream status
nats stream info ORDERS
nats consumer info ORDERS payment-service

# Consumer lag
nats consumer ls ORDERS
# Shows pending messages (lag) per consumer
```

Prometheus metrics `nats-server`-এর বিল্ট-ইন exporter দিয়ে (`-m 8222` দিয়ে enable করুন), `nats_prometheus_exporter` দিয়ে scrape করা।

## কখন Kafka-র বদলে NATS ব্যবহার করবেন

**NATS ব্যবহার করুন যখন:**

- আপনি deploy আর operate করার জন্য একটা single binary চান
- আপনার first-class primitive হিসেবে request-reply দরকার
- আপনার throughput requirement প্রতি node-এ &lt; 1M msg/sec
- আপনি messaging-এর পাশাপাশি config-এর জন্য KV store চান
- Kafka-র ecosystem-এর চেয়ে operational simplicity বেশি গুরুত্বপূর্ণ

**Kafka ব্যবহার করুন যখন:**

- আপনার দীর্ঘমেয়াদি event retention দরকার (সপ্তাহ/মাস)
- আপনি stream processing বানাচ্ছেন (Kafka Streams, Flink)
- আপনার Kafka Connect ecosystem দরকার (শত শত connector)
- আপনার টিম আগে থেকেই Kafka জানে
- Log compaction একটা মূল requirement
