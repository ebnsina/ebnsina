---
title: "NATS"
subtitle: "Core pub/sub, JetStream persistence, KV store, and running a 3-node cluster — the fast path to reliable messaging without Kafka complexity."
chapter: 4
level: "intermediate"
readingTime: "10 min"
topics: ["NATS", "JetStream", "pub/sub", "clustering", "KV store", "subjects"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Walkie-talkies vs a recorded dispatch system: core NATS is walkie-talkies — instant, lightweight, but if you're not listening when the message is sent, you miss it. JetStream is the dispatch recording system — messages are stored, replayed on demand, and acknowledged on receipt. Same underlying radio network, with persistence layered on.

</Callout>

## Why NATS

NATS is a cloud-native messaging system written in Go. The server is a single ~20MB binary. Core characteristics:
- 1M+ messages/sec on modest hardware
- Sub-millisecond latency
- Subjects are strings with wildcards (`>`, `*`)
- No per-message routing config — subjects are the routing
- JetStream adds persistence, at-least-once delivery, and KV store on top

Use NATS when you want Kafka-level throughput with dramatically simpler operations.

## Running NATS

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
nc.publish('orders.created', sc.encode(JSON.stringify({
  id: 'ord-123',
  customerId: 'cust-456',
  total: 99.99,
})));
```

Subject wildcards:
- `orders.*` — matches `orders.created`, `orders.cancelled` but not `orders.payment.failed`
- `orders.>` — matches `orders.created`, `orders.payment.failed`, any depth

Core pub/sub is fire-and-forget — if no subscriber is listening when you publish, the message is gone. Use JetStream for persistence.

## JetStream Streams

JetStream stores messages in streams with configurable retention:

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
  max_age: 7 * 24 * 60 * 60 * 1e9,   // 7 days in nanoseconds
  max_msgs: -1,                         // unlimited
  num_replicas: 3,                      // replicate across 3 nodes
  duplicate_window: 2 * 60 * 1e9,       // 2-minute deduplication window
});

// Publish to stream
await js.publish(
  'orders.created',
  jc.encode({ id: 'ord-123', customerId: 'cust-456' }),
  { msgID: 'ord-123' }   // deduplication key
);
```

## JetStream Consumers

```typescript
// Push consumer — server pushes to a subject
const pushConsumer = await jsm.consumers.add('ORDERS', {
  durable_name: 'payment-service',     // named = durable = remembers position
  deliver_subject: '_INBOX.payments',  // server pushes here
  deliver_policy: DeliverPolicy.New,   // start from new messages only
  ack_policy: AckPolicy.Explicit,      // must ack each message
  max_deliver: 5,                      // retry up to 5 times
  ack_wait: 30 * 1e9,                  // 30s to ack before redeliver
  filter_subject: 'orders.created',    // only this subject
});

// Pull consumer — consumer requests batches (preferred for workers)
const pullConsumer = await jsm.consumers.add('ORDERS', {
  durable_name: 'analytics',
  ack_policy: AckPolicy.Explicit,
  filter_subject: 'orders.>',
});

// Pull a batch
const messages = await js.fetch('ORDERS', 'analytics', { batch: 100, expires: 5000 });
for await (const msg of messages) {
  const order = jc.decode(msg.data);
  await processForAnalytics(order);
  msg.ack();
}
```

## Work Queues (Competing Consumers)

JetStream work queues: each message delivered to exactly one consumer in the group.

```typescript
// Create work queue stream
await jsm.streams.add({
  name: 'EMAIL_JOBS',
  subjects: ['jobs.email.>'],
  retention: RetentionPolicy.WorkQueue,  // delete on ack
  storage: StorageType.File,
  num_replicas: 3,
});

// Multiple workers consume from same durable consumer
// Each message goes to exactly one worker
await jsm.consumers.add('EMAIL_JOBS', {
  durable_name: 'email-workers',
  ack_policy: AckPolicy.Explicit,
  max_ack_pending: 50,   // max outstanding unacked per consumer
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

JetStream includes a distributed key-value store:

```typescript
const kv = await js.views.kv('config', {
  ttl: 3600 * 1e9,   // 1 hour TTL
  replicas: 3,
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

This replaces Consul KV or Redis for distributed config — you get change notifications, history, and TTL built in, all on the same NATS cluster your messaging uses.

## Request-Reply

NATS has built-in request-reply — no setup needed:

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
const response = await nc.request(
  'user.lookup',
  jc.encode({ userId: '123' }),
  { timeout: 5000 }
);
const user = jc.decode(response.data);
```

NATS handles the correlation and reply routing automatically. The client blocks until the server responds or the timeout fires.

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

Prometheus metrics via `nats-server` built-in exporter (enable with `-m 8222`), scraped by `nats_prometheus_exporter`.

## When to Use NATS Over Kafka

**Use NATS when:**
- You want a single binary to deploy and operate
- You need request-reply as a first-class primitive
- Your throughput requirements are &lt; 1M msg/sec per node
- You want the KV store for config alongside messaging
- Operational simplicity matters more than Kafka's ecosystem

**Use Kafka when:**
- You need long-term event retention (weeks/months)
- You're building stream processing (Kafka Streams, Flink)
- You need the Kafka Connect ecosystem (hundreds of connectors)
- Your team already knows Kafka
- Log compaction is a primary requirement

