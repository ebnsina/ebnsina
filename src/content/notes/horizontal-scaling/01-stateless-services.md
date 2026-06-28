---
title: 'Stateless Services'
subtitle: 'Why stateless is the prerequisite for horizontal scaling — and how to extract state from your application so any instance can handle any request.'
chapter: 1
level: 'beginner'
readingTime: '8 min'
topics: ['stateless', 'horizontal scaling', 'sessions', 'shared state', 'twelve-factor']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A fast food chain vs a personal chef: the personal chef remembers your preferences — but you can only have one. A fast food chain works because any location, any employee, can serve any customer using the same menu and systems. Stateless services are your fast food chain — any instance can handle any request.

</Callout>

## What Makes a Service Stateful

A service is stateful when it stores data that's required to handle future requests — and that data lives in the process memory or local disk of a specific instance.

```typescript
// STATEFUL — breaks horizontal scaling
const activeSessions: Map<string, Session> = new Map(); // in-memory

app.post('/login', async (req, res) => {
	const user = await verifyCredentials(req.body);
	const sessionId = crypto.randomUUID();

	activeSessions.set(sessionId, { userId: user.id, createdAt: Date.now() });
	res.cookie('session', sessionId);
	res.json({ ok: true });
});

app.get('/me', (req, res) => {
	const session = activeSessions.get(req.cookies.session); // only works on this instance!
	if (!session) return res.status(401).json({ error: 'Not logged in' });
	res.json({ userId: session.userId });
});
```

With two instances behind a load balancer: login hits instance A (session stored there), next request hits instance B (no session → 401). Users get logged out randomly.

## Making It Stateless

Move state out of the process. Every instance reads and writes from a shared store.

```typescript
// STATELESS — works with any number of instances
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

app.post('/login', async (req, res) => {
	const user = await verifyCredentials(req.body);
	const sessionId = crypto.randomUUID();

	await redis.setex(
		`session:${sessionId}`,
		3600, // TTL: 1 hour
		JSON.stringify({ userId: user.id, createdAt: Date.now() })
	);

	res.cookie('session', sessionId, { httpOnly: true, secure: true });
	res.json({ ok: true });
});

app.get('/me', async (req, res) => {
	const data = await redis.get(`session:${req.cookies.session}`);
	if (!data) return res.status(401).json({ error: 'Not logged in' });

	const session = JSON.parse(data);
	res.json({ userId: session.userId });
});
```

Now any instance can handle any request — they all read from the same Redis.

## The Twelve-Factor App and State

The [twelve-factor app](https://12factor.net) methodology codifies stateless services as a core principle. Factor VI: **Processes — execute the app as one or more stateless processes.**

The rules:

- Never store session state in process memory between requests
- Never store data on the local filesystem that another instance needs
- Store persistent data in a backing service (database, Redis, S3)

**Local disk is also state:**

```typescript
// WRONG — file written on instance A, not readable on instance B
app.post('/upload', upload.single('file'), (req, res) => {
	// File saved to /tmp/uploads on this instance only
	res.json({ path: req.file.path });
});

// RIGHT — upload to shared object storage
app.post('/upload', upload.single('file'), async (req, res) => {
	const key = `uploads/${crypto.randomUUID()}-${req.file.originalname}`;
	await s3.upload({ Bucket: 'my-uploads', Key: key, Body: req.file.buffer }).promise();
	res.json({ key });
});
```

**In-memory cache is also state — but acceptable if it's a cache (not primary source of truth):**

```typescript
// OK — cache miss just causes a DB hit, not a wrong answer
const cache = new Map<string, User>();

async function getUser(userId: string): Promise<User> {
	if (cache.has(userId)) return cache.get(userId)!;
	const user = await db.users.findById(userId);
	cache.set(userId, user);
	return user;
}
```

Different instances having different cache contents is fine — they'll all return correct data, just at different cache hit rates. This is tolerable.

## What Requires Shared State

Extract these to external services before scaling:

| State                         | Extract to                             |
| ----------------------------- | -------------------------------------- |
| Sessions                      | Redis, database                        |
| File uploads                  | S3, GCS, Azure Blob                    |
| Rate limit counters           | Redis                                  |
| Job queues                    | Redis (BullMQ), Postgres (pg-boss)     |
| WebSocket connection registry | Redis Pub/Sub                          |
| Feature flags                 | External flag service                  |
| Application config            | Environment variables, secrets manager |

## Twelve-Factor Config: Environment Variables

Config that varies by environment (dev/staging/prod) goes in environment variables — not in code or config files committed to the repo.

```typescript
// WRONG — config baked into code
const DB_HOST = 'prod-db.internal';
const REDIS_URL = 'redis://prod-redis:6379';

// RIGHT — from environment
const DB_HOST = process.env.DB_HOST!;
const REDIS_URL = process.env.REDIS_URL!;

// Validate at startup — fail fast rather than silently misbehave
function validateConfig(): void {
	const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'S3_BUCKET'];
	const missing = required.filter((k) => !process.env[k]);
	if (missing.length) {
		throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
	}
}

validateConfig(); // called at startup before server starts listening
```

Every instance reads the same environment variables — no per-instance config divergence.

## Sticky Sessions: The Wrong Fix

Sticky sessions (session affinity) tell the load balancer to always route a user to the same instance. This "solves" in-memory session state without requiring Redis.

```nginx
upstream backend {
    ip_hash;    # always route same IP to same backend
    server backend-1:3000;
    server backend-2:3000;
}
```

Don't do this. It:

- Makes instance failures user-visible (their "sticky" instance goes down → session lost)
- Prevents even load distribution (users cluster on specific instances)
- Makes deployments dangerous (rolling restart breaks all sticky users)
- Is a workaround for a design problem, not a solution

Extract state to Redis instead. Sticky sessions delay the problem and make your system harder to reason about.

## Testing Statelessness

Verify that your app is genuinely stateless before scaling:

```bash
# Start two instances on different ports
PORT=3001 node server.js &
PORT=3002 node server.js &

# Login on instance 1
curl -c cookies.txt -X POST http://localhost:3001/login \
  -d '{"email":"user@example.com","password":"pass"}'

# Make authenticated request to instance 2
curl -b cookies.txt http://localhost:3002/me
# If this returns the user: stateless ✓
# If this returns 401: stateful ✗
```

If your app passes this test, it can scale horizontally. Instances can be added, removed, or restarted without affecting users.
