---
title: 'RabbitMQ'
subtitle: 'Exchanges, queues, bindings, dead letter exchange — AMQP model আর নির্ভরযোগ্য task processing-এ এটা কীভাবে ব্যবহার করবেন।'
chapter: 2
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['RabbitMQ', 'AMQP', 'exchanges', 'queues', 'dead letter', 'acknowledgements']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

সর্টিং বিভাগসহ একটা পোস্ট অফিস: চিঠি পোস্ট অফিসে (exchange) এসে পৌঁছায়, ধরন বা গন্তব্য অনুযায়ী সর্ট করা হয় (routing key), আর প্রাপকের (consumer) তুলে নেওয়ার জন্য সঠিক মেইলবক্সে (queue) রাখা হয়। DLX হলো অবিতরণকৃত ডাক বিভাগ — যেসব মেসেজ deliver করা যায়নি সেগুলো ওখানে পড়ে থাকে যতক্ষণ না কেউ সেগুলো সামলায়।

</Callout>

## AMQP Model

RabbitMQ-এর routing model-এ তিনটা স্তর আছে:

```
Producer → Exchange → Binding → Queue → Consumer
```

- **Exchange:** Producer-দের কাছ থেকে মেসেজ পায়। কোন queue-তে route করবে তা ঠিক করে।
- **Binding:** একটা exchange-কে একটা queue-এর সাথে যুক্ত করার নিয়ম (ঐচ্ছিক routing key সহ)।
- **Queue:** buffer যেখানে মেসেজ consumer-এর জন্য অপেক্ষা করে।

Producer কখনো সরাসরি queue-তে publish করে না — তারা exchange-এ publish করে।

## Exchange Type

**Direct:** সেসব queue-তে route করে যেখানে binding key ঠিক routing key-এর সাথে মেলে।

```
Exchange (direct) → binding key "orders" → orders-queue
                  → binding key "emails" → email-queue
```

**Fanout:** routing key উপেক্ষা করে সব bound queue-তে route করে।

```
Exchange (fanout) → all bound queues get a copy
```

**Topic:** wildcard pattern দিয়ে route করে।

```
Exchange (topic) → binding "orders.#" → matches orders.created, orders.cancelled
                 → binding "*.created" → matches orders.created, users.created
```

`*` একটা word মেলায়। `#` শূন্য বা একাধিক word মেলায়।

**Headers:** routing key-এর বদলে message header-এর ভিত্তিতে route করে (কদাচিৎ ব্যবহৃত)।

## RabbitMQ Setup করা

```bash
# Docker for local dev
docker run -d \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=admin \
  -e RABBITMQ_DEFAULT_PASS=secret \
  rabbitmq:3-management

# Management UI: http://localhost:15672
```

Production setup (সেলফ-হোস্টেড):

```bash
# Install on Ubuntu
apt install rabbitmq-server

# Enable management plugin
rabbitmq-plugins enable rabbitmq_management

# Create user with admin privileges
rabbitmqctl add_user myapp mysecretpassword
rabbitmqctl set_user_tags myapp administrator
rabbitmqctl set_permissions -p / myapp ".*" ".*" ".*"
```

## Publish আর Consume করা (amqplib)

```typescript
import amqp from 'amqplib';

async function setup() {
	const conn = await amqp.connect('amqp://admin:secret@localhost');
	const ch = await conn.createChannel();

	// Declare exchange (idempotent — safe to run on every startup)
	await ch.assertExchange('orders', 'direct', { durable: true });

	// Declare queue
	await ch.assertQueue('order-processing', {
		durable: true, // survives broker restart
		arguments: {
			'x-dead-letter-exchange': 'orders.dlx', // failed messages go here
			'x-message-ttl': 300_000 // 5 min TTL
		}
	});

	// Bind queue to exchange
	await ch.bindQueue('order-processing', 'orders', 'created');

	return ch;
}

// Producer
async function publishOrder(order: Order) {
	const ch = await setup();

	ch.publish(
		'orders', // exchange
		'created', // routing key
		Buffer.from(JSON.stringify(order)),
		{
			persistent: true, // survives broker restart
			contentType: 'application/json',
			messageId: order.id // for deduplication
		}
	);
}

// Consumer
async function startConsumer() {
	const ch = await setup();

	// Prefetch: max 10 unacked messages per consumer
	ch.prefetch(10);

	ch.consume('order-processing', async (msg) => {
		if (!msg) return;

		const order = JSON.parse(msg.content.toString());

		try {
			await processOrder(order);
			ch.ack(msg); // remove from queue
		} catch (err) {
			// Requeue once; if already redelivered, send to DLX
			const shouldRequeue = !msg.fields.redelivered;
			ch.nack(msg, false, shouldRequeue);
		}
	});
}
```

## Dead Letter Exchange

মেসেজ DLX-এ চলে যায় যখন:

- `requeue=false` সহ `nack` করা হয়
- TTL শেষ হয়
- Queue length limit ছাড়িয়ে যায়

```typescript
// Setup DLX
await ch.assertExchange('orders.dlx', 'direct', { durable: true });
await ch.assertQueue('orders.dead', { durable: true });
await ch.bindQueue('orders.dead', 'orders.dlx', 'created');

// Main queue routes failed messages to DLX
await ch.assertQueue('order-processing', {
	durable: true,
	arguments: {
		'x-dead-letter-exchange': 'orders.dlx',
		'x-dead-letter-routing-key': 'created' // same routing key
	}
});
```

Dead letter queue হলো যেখানে আপনি failure তদন্ত করেন — মেসেজ পরীক্ষা করেন, bug ঠিক করেন, replay করেন।

**DLX থেকে Replay:**

```typescript
// Move DLX messages back to main queue (after fixing the bug)
ch.consume('orders.dead', async (msg) => {
	if (!msg) return;

	ch.publish('orders', 'created', msg.content, {
		persistent: true,
		headers: { 'x-retried-at': new Date().toISOString() }
	});
	ch.ack(msg);
});
```

## Exponential Backoff সহ Retry

delay বানানোর জন্য TTL সহ per-attempt queue ব্যবহার করুন:

```typescript
async function setupRetryQueues(ch: Channel) {
	const delays = [5000, 30000, 300000]; // 5s, 30s, 5min

	for (const delay of delays) {
		// A "wait" queue with TTL — messages expire back to main queue
		await ch.assertQueue(`orders.wait.${delay}`, {
			durable: true,
			arguments: {
				'x-message-ttl': delay,
				'x-dead-letter-exchange': 'orders',
				'x-dead-letter-routing-key': 'created'
			}
		});
	}
}

async function retryWithDelay(ch: Channel, msg: Message, attempt: number) {
	const delays = [5000, 30000, 300000];
	const delay = delays[attempt] ?? delays[delays.length - 1];

	const headers = {
		...msg.properties.headers,
		'x-attempt': attempt + 1
	};

	if (attempt >= delays.length) {
		// Exhausted retries — send to DLX permanently
		ch.publish('orders.dlx', 'created', msg.content, { headers });
		ch.ack(msg);
		return;
	}

	// Publish to wait queue — expires back to main queue after `delay`
	ch.publish('', `orders.wait.${delay}`, msg.content, {
		persistent: true,
		headers
	});
	ch.ack(msg);
}
```

## RPC Pattern

RabbitMQ-এর উপর request-reply:

```typescript
// Client
async function rpcCall(payload: object): Promise<any> {
	const ch = await conn.createChannel();
	const { queue: replyQueue } = await ch.assertQueue('', { exclusive: true });
	const correlationId = crypto.randomUUID();

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('RPC timeout')), 10_000);

		ch.consume(
			replyQueue,
			(msg) => {
				if (msg?.properties.correlationId === correlationId) {
					clearTimeout(timeout);
					resolve(JSON.parse(msg.content.toString()));
					ch.close();
				}
			},
			{ noAck: true }
		);

		ch.publish('', 'rpc-queue', Buffer.from(JSON.stringify(payload)), {
			correlationId,
			replyTo: replyQueue
		});
	});
}

// Server
ch.consume('rpc-queue', async (msg) => {
	if (!msg) return;
	const request = JSON.parse(msg.content.toString());

	const result = await handleRequest(request);

	ch.publish('', msg.properties.replyTo, Buffer.from(JSON.stringify(result)), {
		correlationId: msg.properties.correlationId
	});
	ch.ack(msg);
});
```

এই pattern মিতব্যয়ীভাবে ব্যবহার করুন — synchronous request-reply-এর জন্য HTTP সহজতর। Messaging-এর উপর RPC তখন কাজে লাগে যখন server একটা firewall-এর পেছনে থাকে বা আপনার একাধিক server instance-এ বিনামূল্যে load balancing দরকার।

## HA-র জন্য Clustering

Single-node RabbitMQ একটা single point of failure। ৩টা node দিয়ে cluster করুন:

```bash
# On node2 and node3, join node1
rabbitmqctl stop_app
rabbitmqctl join_cluster rabbit@node1
rabbitmqctl start_app
```

**Quorum queue** (RabbitMQ 3.8+) — node জুড়ে replicated, node failure-এও টিকে থাকে:

```typescript
await ch.assertQueue('orders', {
	durable: true,
	arguments: {
		'x-queue-type': 'quorum'
	}
});
```

Classic queue (default) replicate করে না — একটা node fail করলে সেই queue-এর মেসেজ হারায়। যেকোনো গুরুত্বপূর্ণ queue-এর জন্য quorum queue ব্যবহার করুন।

Classic queue-এর জন্য **Mirror policy** (legacy):

```bash
rabbitmqctl set_policy ha-all ".*" '{"ha-mode":"all"}' --priority 0 --apply-to queues
```

৩টা node আর quorum queue দিয়ে: cluster ডেটা হারানো ছাড়াই ১টা node failure সহ্য করে। এর বেশি HA-র জন্য আপনার ৫টা node লাগবে।
