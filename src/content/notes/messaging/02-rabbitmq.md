---
title: 'RabbitMQ'
subtitle: 'Exchanges, queues, bindings, dead letter exchanges — the AMQP model and how to use it for reliable task processing.'
chapter: 2
level: 'beginner'
readingTime: '12 min'
topics: ['RabbitMQ', 'AMQP', 'exchanges', 'queues', 'dead letter', 'acknowledgements']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A post office with sorting departments: mail arrives at the post office (exchange), is sorted by type or destination (routing key), and placed in the right mailbox (queue) for the recipient (consumer) to collect. The DLX is the unclaimed mail department — messages that couldn't be delivered sit there until someone deals with them.

</Callout>

## The AMQP Model

RabbitMQ's routing model has three layers:

```
Producer → Exchange → Binding → Queue → Consumer
```

- **Exchange:** Receives messages from producers. Decides which queues to route to.
- **Binding:** Rule connecting an exchange to a queue (with optional routing key).
- **Queue:** Buffer where messages wait for consumers.

Producers never publish directly to queues — they publish to exchanges.

## Exchange Types

**Direct:** Routes to queues where the binding key exactly matches the routing key.

```
Exchange (direct) → binding key "orders" → orders-queue
                  → binding key "emails" → email-queue
```

**Fanout:** Routes to all bound queues, ignoring the routing key.

```
Exchange (fanout) → all bound queues get a copy
```

**Topic:** Routes using wildcard patterns.

```
Exchange (topic) → binding "orders.#" → matches orders.created, orders.cancelled
                 → binding "*.created" → matches orders.created, users.created
```

`*` matches one word. `#` matches zero or more words.

**Headers:** Routes based on message headers instead of routing key (rarely used).

## Setting Up RabbitMQ

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

Production setup (self-hosted):

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

## Publishing and Consuming (amqplib)

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

## Dead Letter Exchanges

Messages move to a DLX when:

- `nack`'d with `requeue=false`
- TTL expires
- Queue length limit exceeded

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

Dead letter queue is where you investigate failures — inspect messages, fix the bug, replay.

**Replay from DLX:**

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

## Retry with Exponential Backoff

Use per-attempt queues with TTL to implement delays:

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

Request-reply over RabbitMQ:

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

Use this pattern sparingly — HTTP is simpler for synchronous request-reply. RPC over messaging is useful when the server is behind a firewall or you need load balancing across multiple server instances for free.

## Clustering for HA

Single-node RabbitMQ is a single point of failure. Cluster with 3 nodes:

```bash
# On node2 and node3, join node1
rabbitmqctl stop_app
rabbitmqctl join_cluster rabbit@node1
rabbitmqctl start_app
```

**Quorum queues** (RabbitMQ 3.8+) — replicated across nodes, survive node failure:

```typescript
await ch.assertQueue('orders', {
	durable: true,
	arguments: {
		'x-queue-type': 'quorum'
	}
});
```

Classic queues (default) don't replicate — a node failure loses messages in that queue. Use quorum queues for any queue that matters.

**Mirror policy** for classic queues (legacy):

```bash
rabbitmqctl set_policy ha-all ".*" '{"ha-mode":"all"}' --priority 0 --apply-to queues
```

With 3 nodes and quorum queues: the cluster tolerates 1 node failure without data loss. For HA beyond that, you need 5 nodes.
