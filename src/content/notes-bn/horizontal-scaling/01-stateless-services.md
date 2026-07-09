---
title: 'Stateless Services'
subtitle: 'Horizontal scaling-এর জন্য stateless কেন পূর্বশর্ত — এবং কীভাবে আপনার অ্যাপ্লিকেশন থেকে state বের করে আনবেন যাতে যেকোনো instance যেকোনো request সামলাতে পারে।'
chapter: 1
level: 'beginner'
readingTime: '8 মিনিট'
topics: ['stateless', 'horizontal scaling', 'sessions', 'shared state', 'twelve-factor']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা ফাস্ট ফুড চেইন বনাম ব্যক্তিগত শেফ: ব্যক্তিগত শেফ আপনার পছন্দ মনে রাখে — কিন্তু আপনি শুধু একজনকেই পেতে পারেন। একটা ফাস্ট ফুড চেইন কাজ করে কারণ যেকোনো শাখা, যেকোনো কর্মী, একই মেনু ও সিস্টেম ব্যবহার করে যেকোনো গ্রাহককে সেবা দিতে পারে। Stateless সার্ভিস হলো আপনার ফাস্ট ফুড চেইন — যেকোনো instance যেকোনো request সামলাতে পারে।

</Callout>

## একটা সার্ভিসকে কী Stateful বানায়

একটা সার্ভিস তখন stateful হয় যখন এটি এমন ডেটা জমা রাখে যা ভবিষ্যতের request সামলাতে দরকার হয় — এবং সেই ডেটা থাকে একটা নির্দিষ্ট instance-এর process memory বা local disk-এ।

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

একটা load balancer-এর পেছনে দুইটা instance থাকলে: login যায় instance A-তে (session সেখানে জমা হয়), পরের request যায় instance B-তে (কোনো session নেই → 401)। ব্যবহারকারীরা এলোমেলোভাবে logged out হয়ে যায়।

## এটাকে Stateless বানানো

State-কে process-এর বাইরে সরান। প্রতিটা instance একটা shared store থেকে পড়ে এবং সেখানে লেখে।

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

এখন যেকোনো instance যেকোনো request সামলাতে পারে — তারা সবাই একই Redis থেকে পড়ে।

## Twelve-Factor App এবং State

[twelve-factor app](https://12factor.net) পদ্ধতি stateless সার্ভিসকে একটা মূল নীতি হিসেবে নির্ধারণ করে। Factor VI: **Processes — অ্যাপটিকে এক বা একাধিক stateless process হিসেবে চালান।**

নিয়মগুলো:

- Request-এর মাঝে কখনো process memory-তে session state জমা রাখবেন না
- Local filesystem-এ এমন ডেটা কখনো জমা রাখবেন না যা অন্য একটা instance-এর দরকার হয়
- Persistent ডেটা একটা backing service-এ (database, Redis, S3) জমা রাখুন

**Local disk-ও state:**

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

**In-memory cache-ও state — কিন্তু গ্রহণযোগ্য যদি এটা একটা cache হয় (primary source of truth না হয়):**

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

আলাদা আলাদা instance-এর আলাদা cache content থাকা ঠিক আছে — তারা সবাই সঠিক ডেটাই ফেরত দেবে, শুধু আলাদা আলাদা cache hit rate-এ। এটা সহনীয়।

## কীসের জন্য Shared State দরকার

Scale করার আগে এগুলোকে external service-এ বের করে আনুন:

| State                         | যেখানে বের করবেন                       |
| ----------------------------- | -------------------------------------- |
| Sessions                      | Redis, database                        |
| File uploads                  | S3, GCS, Azure Blob                    |
| Rate limit counters           | Redis                                  |
| Job queues                    | Redis (BullMQ), Postgres (pg-boss)     |
| WebSocket connection registry | Redis Pub/Sub                          |
| Feature flags                 | External flag service                  |
| Application config            | Environment variables, secrets manager |

## Twelve-Factor Config: Environment Variables

যে config পরিবেশভেদে (dev/staging/prod) বদলায় তা environment variable-এ রাখুন — code-এ বা repo-তে commit করা config file-এ নয়।

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

প্রতিটা instance একই environment variable পড়ে — কোনো per-instance config বিচ্যুতি নেই।

## Sticky Sessions: ভুল সমাধান

Sticky session (session affinity) load balancer-কে বলে দেয় যেন একজন ব্যবহারকারীকে সবসময় একই instance-এ পাঠায়। এটা Redis ছাড়াই in-memory session state-এর সমস্যা "সমাধান" করে।

```nginx
upstream backend {
    ip_hash;    # always route same IP to same backend
    server backend-1:3000;
    server backend-2:3000;
}
```

এটা করবেন না। এটা:

- Instance failure-কে ব্যবহারকারীর কাছে দৃশ্যমান করে (তাদের "sticky" instance বন্ধ হলে → session হারায়)
- সমান load distribution আটকায় (ব্যবহারকারীরা নির্দিষ্ট instance-এ জমা হয়)
- Deployment-কে বিপজ্জনক করে (rolling restart সব sticky ব্যবহারকারীকে ভাঙে)
- এটা একটা design সমস্যার workaround, সমাধান নয়

তার বদলে state-কে Redis-এ বের করে আনুন। Sticky session সমস্যাটাকে পিছিয়ে দেয় আর আপনার সিস্টেমকে বোঝা কঠিন করে তোলে।

## Statelessness পরীক্ষা করা

Scale করার আগে যাচাই করুন যে আপনার অ্যাপ সত্যিই stateless:

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

আপনার অ্যাপ যদি এই পরীক্ষায় পাশ করে, তাহলে এটা horizontal scale করতে পারবে। ব্যবহারকারীদের প্রভাবিত না করেই instance যোগ করা, সরানো, বা restart করা যাবে।
