---
title: 'WebSockets & Shared State at Scale'
subtitle: 'কীভাবে persistent connection, pub/sub fan-out, এবং যে Redis adapter Socket.io-কে একাধিক instance জুড়ে কাজ করায় তা সামলাবেন।'
chapter: 5
level: 'intermediate'
readingTime: '8 মিনিট'
topics: ['WebSockets', 'Socket.io', 'Redis adapter', 'pub/sub', 'sticky sessions']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা walkie-talkie নেটওয়ার্ক: প্রতিটা ডিভাইসের (instance) নিজের রেডিও আছে, কিন্তু সব ডিভাইসে broadcast করতে হলে আপনার একটা repeater (Redis) দরকার যা আপনার signal নেটওয়ার্কের প্রতিটা রেডিওতে relay করে। Repeater ছাড়া, আপনার বার্তা শুধু আপনার সরাসরি range-এর মধ্যে থাকা ডিভাইসগুলোতে পৌঁছায়।

</Callout>

## WebSocket এবং একাধিক Instance-এর সমস্যা

HTTP stateless — প্রতিটা request স্বাধীন। WebSocket stateful — একটা connection একটা নির্দিষ্ট instance-এ টিকে থাকে।

একটা অ্যাপ সার্ভার থাকলে, যেকোনো client থেকে আসা প্রতিটা WebSocket বার্তা সঠিক জায়গায় যায়। একাধিক instance থাকলে, instance A-তে পাঠানো একটা বার্তা স্বাভাবিকভাবে instance B-তে যুক্ত client-দের কাছে পৌঁছাতে পারে না।

```
Instance A:  [user-1, user-3, user-5 connected]
Instance B:  [user-2, user-4, user-6 connected]

user-1 sends message → arrives at Instance A
Instance A wants to broadcast to all users in user-1's room
→ Instance A knows about user-3 and user-5 (connected to it)
→ Instance A does NOT know about user-2, user-4, user-6
→ They miss the message
```

## Redis Adapter সহ Socket.io

Redis adapter সব instance জুড়ে event relay করতে Redis Pub/Sub ব্যবহার করে:

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

**Redis adapter যা করে:**

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

প্রতিটা instance Redis-এ subscribe করে। যখন যেকোনো instance একটা room event publish করে, সব instance সেটা পায় এবং তাদের স্থানীয়ভাবে যুক্ত client-দের কাছে পৌঁছে দেয়।

## অস্থায়ী ব্যবস্থা হিসেবে Sticky Sessions

Socket.io-এর দরকার হয় যে HTTP upgrade handshake এবং পরবর্তী WebSocket frame-গুলো একই instance-এ পৌঁছায়। Sticky session ছাড়া, handshake হয়তো instance A-তে যায়, কিন্তু প্রথম WebSocket frame instance B-তে পৌঁছায় (যার handshake-এর কোনো রেকর্ড নেই) এবং ব্যর্থ হয়।

```nginx
upstream socketio {
    ip_hash;   # route same client IP to same instance
    server instance-1:3000;
    server instance-2:3000;
}
```

Sticky session এখানে গ্রহণযোগ্য — application state-এর বিপরীতে, WebSocket connection স্বাভাবিকভাবেই একটা instance-এর "অন্তর্ভুক্ত"। সমস্যা হলো failure: একটা instance মারা গেলে, তার client-রা disconnect হয়ে reconnect করে (অন্য একটা instance-এ)। এটা WebSocket-এর জন্য প্রত্যাশিত আচরণ, কোনো data integrity সমস্যা নয়।

**AWS ALB sticky session:**

```bash
aws elbv2 modify-target-group-attributes \
  --target-group-arn arn:... \
  --attributes '[
    {"Key": "stickiness.enabled", "Value": "true"},
    {"Key": "stickiness.type", "Value": "lb_cookie"},
    {"Key": "stickiness.lb_cookie.duration_seconds", "Value": "86400"}
  ]'
```

## Presence এবং Connection Registry

সব instance জুড়ে বর্তমানে কোন কোন ব্যবহারকারী যুক্ত আছে তা track করুন:

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

## Scaling Limit

প্রতিটা WebSocket connection সার্ভারে একটা file descriptor খরচ করে। Linux-এর default limit প্রতি process 1024 — কিন্তু এটা সহজেই বাড়ানো যায়:

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

Node.js দিয়ে প্রতি instance বাস্তব limit:

- ~10,000 concurrent WebSocket connection (স্বাচ্ছন্দ্যে)
- tuning করে ~50,000
- তার বেশি হলে: scale out করুন (আরও instance যোগ করুন + Redis adapter fan-out সামলায়)

## কখন WebSocket ব্যবহার করবেন না

WebSocket-এর বাস্তব overhead আছে। সস্তা বিকল্প বিবেচনা করুন:

**Server-Sent Events (SSE):** সার্ভার থেকে client-এ এক-মুখী push। সহজ, কম overhead, HTTP/2-সঙ্গতিপূর্ণ। notification, live feed, dashboard update-এর জন্য উপযুক্ত।

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

**Long-polling:** Client একটা request করে, সার্ভার ডেটা না আসা পর্যন্ত সেটা খোলা রাখে, client সঙ্গে সঙ্গে আবার request করে। HTTP যেখানে কাজ করে সেখানেই কাজ করে। উচ্চ-ফ্রিকোয়েন্সি update-এর জন্য খারাপ কিন্তু পরিচালনার দিক থেকে সহজ।

**Webhook push:** event ঘটলে সার্ভার একটা client-সরবরাহকৃত URL-এ push করে। integration-এর জন্য উপযুক্ত, ব্যবহারকারী-মুখী realtime-এর জন্য নয়।

WebSocket ব্যবহার করুন যখন আপনার দ্বি-মুখী যোগাযোগ দরকার (chat, collaborative editing, multiplayer game)। এক-মুখী server push-এর জন্য, SSE সাধারণত সহজ এবং যথেষ্ট।
