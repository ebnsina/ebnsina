---
title: 'WebSockets & Shared State at Scale'
subtitle: 'How to handle persistent connections, pub/sub fan-out, and the Redis adapter that makes Socket.io work across instances.'
chapter: 5
level: 'intermediate'
readingTime: '8 min'
topics: ['WebSockets', 'Socket.io', 'Redis adapter', 'pub/sub', 'sticky sessions']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A walkie-talkie network: each device (instance) has its own radio, but to broadcast to all devices, you need a repeater (Redis) that relays your signal to every radio on the network. Without the repeater, your message only reaches devices within direct range of yours.

</Callout>

## The Problem with WebSockets and Multiple Instances

HTTP is stateless — each request is independent. WebSockets are stateful — a connection persists on a specific instance.

With one app server, every WebSocket message from any client goes to the right place. With multiple instances, a message sent to instance A cannot natively reach clients connected to instance B.

```
Instance A:  [user-1, user-3, user-5 connected]
Instance B:  [user-2, user-4, user-6 connected]

user-1 sends message → arrives at Instance A
Instance A wants to broadcast to all users in user-1's room
→ Instance A knows about user-3 and user-5 (connected to it)
→ Instance A does NOT know about user-2, user-4, user-6
→ They miss the message
```

## Socket.io with Redis Adapter

The Redis adapter uses Redis Pub/Sub to relay events across all instances:

```typescript
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const httpServer = createServer(app);
const io = new Server(httpServer, {
	cors: { origin: 'https://myapp.com' }
});

// Two Redis clients: one for publishing, one for subscribing
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

// Wire up the adapter — now io.to().emit() works across all instances
io.adapter(createAdapter(pubClient, subClient));

// This now fans out to ALL instances, not just this one
io.to('room-123').emit('message', { text: 'Hello everyone' });
```

**What the Redis adapter does:**

```
Instance A emits to room-123
  → publishes to Redis channel "socket.io#room-123#"
  → Instance B, C subscribed to that channel receive it
  → Instance B, C deliver to their local room-123 sockets
```

## Architecture

```
Client 1  ──── WebSocket ──→  Instance A  ──→  Redis Pub/Sub
Client 2  ──── WebSocket ──→  Instance B  ──→  Redis Pub/Sub
Client 3  ──── WebSocket ──→  Instance A      ↑
                                               │
                              Instance B ──────┘ (subscribes, relays to Client 2)
```

Every instance subscribes to Redis. When any instance publishes a room event, all instances receive it and deliver to their locally-connected clients.

## Sticky Sessions as a Temporary Measure

Socket.io requires the HTTP upgrade handshake and subsequent WebSocket frames to hit the same instance. Without sticky sessions, the handshake might go to instance A, but the first WebSocket frame hits instance B (which has no record of the handshake) and fails.

```nginx
upstream socketio {
    ip_hash;   # route same client IP to same instance
    server instance-1:3000;
    server instance-2:3000;
}
```

Sticky sessions are acceptable here — unlike application state, WebSocket connections naturally "belong" to one instance. The problem is failure: if an instance dies, its clients disconnect and reconnect (to another instance). This is expected behavior for WebSockets, not a data integrity issue.

**AWS ALB sticky sessions:**

```bash
aws elbv2 modify-target-group-attributes \
  --target-group-arn arn:... \
  --attributes '[
    {"Key": "stickiness.enabled", "Value": "true"},
    {"Key": "stickiness.type", "Value": "lb_cookie"},
    {"Key": "stickiness.lb_cookie.duration_seconds", "Value": "86400"}
  ]'
```

## Presence and Connection Registry

Track which users are currently connected across all instances:

```typescript
// On connection: register in Redis
io.on('connection', async (socket) => {
	const userId = socket.handshake.auth.userId;

	// Mark user as online with TTL (auto-expires if instance crashes)
	await redis.setex(`presence:${userId}`, 30, socket.id);

	// Refresh TTL periodically to handle long connections
	const refreshInterval = setInterval(async () => {
		await redis.expire(`presence:${userId}`, 30);
	}, 10_000);

	socket.on('disconnect', async () => {
		clearInterval(refreshInterval);
		await redis.del(`presence:${userId}`);
		// Notify others this user went offline
		io.to(`friends-of-${userId}`).emit('user-offline', { userId });
	});
});

// Check if a user is online (from any instance)
async function isUserOnline(userId: string): Promise<boolean> {
	return (await redis.exists(`presence:${userId}`)) === 1;
}

// Get all online users
async function getOnlineUsers(userIds: string[]): Promise<string[]> {
	const keys = userIds.map((id) => `presence:${id}`);
	const results = await redis.mget(...keys);
	return userIds.filter((_, i) => results[i] !== null);
}
```

## Scaling Limits

Each WebSocket connection consumes a file descriptor on the server. Linux default limit is 1024 per process — but this is easily raised:

```bash
# Check current limits
ulimit -n   # file descriptors per process

# Raise for the node process
ulimit -n 65536

# Or in /etc/security/limits.conf (permanent)
# * soft nofile 65536
# * hard nofile 65536

# Kernel-level socket backlog
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_max_syn_backlog=65535
```

Practical limits per instance with Node.js:

- ~10,000 concurrent WebSocket connections (comfortable)
- ~50,000 with tuning
- Beyond that: scale out (add more instances + Redis adapter handles fan-out)

## When to Not Use WebSockets

WebSockets have real overhead. Consider cheaper alternatives:

**Server-Sent Events (SSE):** One-way push from server to client. Simpler, lower overhead, HTTP/2-compatible. Right for notifications, live feeds, dashboard updates.

```typescript
app.get('/events', (req, res) => {
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');

	const send = (data: unknown) => {
		res.write(`data: ${JSON.stringify(data)}\n\n`);
	};

	const sub = redis.subscribe('notifications', (message) => {
		const event = JSON.parse(message);
		if (event.userId === req.user.id) send(event);
	});

	req.on('close', () => sub.unsubscribe());
});
```

**Long-polling:** Client makes a request, server holds it open until there's data, client immediately re-requests. Works anywhere HTTP works. Worse for high-frequency updates but simpler operationally.

**Webhook push:** Server pushes to a client-provided URL when events occur. Right for integrations, not user-facing realtime.

Use WebSockets when you need bidirectional communication (chat, collaborative editing, multiplayer games). For one-way server push, SSE is usually simpler and sufficient.
