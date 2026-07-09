---
title: 'Queue Backends'
subtitle: 'BullMQ দিয়ে Redis-backed queue, pg-boss দিয়ে Postgres-backed — internals, trade-off, এবং কোনটা কখন মানানসই।'
chapter: 2
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['BullMQ', 'pg-boss', 'Redis', 'PostgreSQL', 'queue internals']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব উদাহরণ**

একটি ticketing system: Redis queue হলো কনসার্ট ভেন্যুর দ্রুত-এগোনো লাইন, যেখানে একজন বাউন্সার একটা বিন থেকে দ্রুত টিকিট টেনে নেয়। Postgres queue হলো ধীরস্থির DMV কাউন্টার — ধীর, কিন্তু প্রতিটি transaction রেকর্ড হয়, auditable, আর বিল্ডিংয়ের বিদ্যুৎ চলে গেলেও কখনো হারায় না।

</Callout>

## BullMQ (Redis-backed)

BullMQ হলো সবচেয়ে জনপ্রিয় Node.js queue library। এটি job-এর state transition track করতে Redis sorted set ও list ব্যবহার করে।

**BullMQ-তে job state:**

```
waiting → active → completed
                 → failed → (retry) → waiting
                          → dead-letter
```

**Setup:**

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

// Producer (your API server)
const emailQueue = new Queue('emails', { connection });

await emailQueue.add(
	'send-welcome',
	{ userId: 'u_123', email: 'user@example.com' },
	{
		attempts: 3, // retry up to 3 times
		backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
		removeOnComplete: { count: 1000 }, // keep last 1000 completed
		removeOnFail: { count: 5000 } // keep last 5000 failed
	}
);

// Consumer (your worker process)
const worker = new Worker(
	'emails',
	async (job) => {
		const { userId, email } = job.data;
		await sendEmail(email, 'Welcome!');
		return { sent: true };
	},
	{
		connection,
		concurrency: 10 // 10 simultaneous jobs
	}
);

worker.on('completed', (job, result) => {
	console.log(`Job ${job.id} done:`, result);
});

worker.on('failed', (job, err) => {
	console.error(`Job ${job?.id} failed:`, err.message);
});
```

**BullMQ যেসব Redis data structure ব্যবহার করে:**

- `bull:emails:wait` — waiting job-দের sorted set (score = priority)
- `bull:emails:active` — এই মুহূর্তে প্রসেস হচ্ছে এমন job-দের set
- `bull:emails:completed` — completed job-দের sorted set
- `bull:emails:failed` — failed job-দের sorted set
- `bull:emails:delayed` — ভবিষ্যতের job-দের sorted set (score = run timestamp)

## pg-boss (PostgreSQL-backed)

Redis-এর দরকার নেই। Job হলো একটি Postgres টেবিলের row। আপনি ACID transaction পান — "যে transaction record তৈরি করে সেই একই transaction-এর অংশ হিসেবে job enqueue করা"-র জন্য নিখুঁত:

```typescript
import PgBoss from 'pg-boss';

const boss = new PgBoss(process.env.DATABASE_URL!);
await boss.start();

// Producer — can be inside a transaction
await db.transaction(async (trx) => {
	const user = await trx.users.create(userData);

	// Job is created atomically with the user — no chance of user-without-job
	await boss.sendOnce(
		'send-welcome-email',
		{ userId: user.id },
		{ retryLimit: 3, retryDelay: 30, expireInHours: 24 },
		user.id // deduplication key
	);
});

// Consumer
await boss.work('send-welcome-email', { teamSize: 5 }, async (job) => {
	await sendEmail(job.data.userId);
});
```

**pg-boss যে schema তৈরি করে:**

```sql
CREATE TABLE pgboss.job (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  data        JSONB,
  state       TEXT NOT NULL DEFAULT 'created', -- created/retry/active/completed/expired/cancelled/failed
  retryLimit  INT NOT NULL DEFAULT 0,
  retryCount  INT NOT NULL DEFAULT 0,
  retryDelay  INT NOT NULL DEFAULT 0,
  startAfter  TIMESTAMPTZ NOT NULL DEFAULT now(),
  startedOn   TIMESTAMPTZ,
  singletonKey TEXT, -- deduplication
  expireIn    INTERVAL NOT NULL DEFAULT '15 minutes',
  createdOn   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completedOn TIMESTAMPTZ
);
```

Worker এই টেবিলটি `SELECT ... FOR UPDATE SKIP LOCKED` দিয়ে poll করে — এটি একটি Postgres প্যাটার্ন যা একাধিক worker-কে conflict ছাড়াই নিরাপদে job claim করতে দেয়:

```sql
-- What pg-boss does internally on each poll
UPDATE pgboss.job
SET state = 'active', startedOn = now()
WHERE id IN (
  SELECT id FROM pgboss.job
  WHERE name = 'send-welcome-email'
    AND state = 'created'
    AND startAfter <= now()
  ORDER BY createdOn
  LIMIT 5
  FOR UPDATE SKIP LOCKED -- skip rows locked by other workers
)
RETURNING *;
```

`FOR UPDATE SKIP LOCKED` হলো মূল ব্যাপার — একাধিক worker একসাথে poll করতে পারে একে অপরকে block না করে বা একই job claim না করে।

## দুটোর মধ্যে বাছাই

**BullMQ (Redis) ব্যবহার করুন যখন:**

- real-time job pickup দরকার (sub-second)
- High throughput (সেকেন্ডে হাজার হাজার job)
- আপনার built-in job progress tracking, প্রতি queue-তে rate limiting, বা priority queue দরকার
- আপনি আগে থেকেই Redis চালাচ্ছেন

**pg-boss (Postgres) ব্যবহার করুন যখন:**

- আপনি একটি DB write-এর সাথে atomically enqueue করতে চান (enqueue fail করলে job হারানোর ঝুঁকি নেই)
- আপনি Redis চালাতে চান না
- আপনার job history-র পূর্ণ auditability দরকার
- আপনার throughput মাঝারি (&lt;100 job/সেকেন্ড)
- আপনি সহজতর ops চান (একটা কম infra component)

**Transactional enqueueing-এর সুবিধা:**

```typescript
// BullMQ — NOT transactional
await db.users.create(user);
// If this crashes, user exists but no welcome email is ever sent
await emailQueue.add('send-welcome', { userId: user.id });

// pg-boss — transactional
await db.transaction(async (trx) => {
	await trx.users.create(user);
	await boss.send('send-welcome', { userId: user.id }); // same transaction
	// If either fails, both are rolled back — consistent state
});
```

যেসব অপারেশনে "record লেখা + job enqueue করা" atomic হতেই হবে, তাদের জন্য এটি একটি বড় সুবিধা।

## Delayed ও Scheduled Job

**Delayed (একবার চলবে, ভবিষ্যতে):**

```typescript
// BullMQ
await queue.add(
	'send-trial-expiry-email',
	{ userId },
	{
		delay: 14 * 24 * 60 * 60 * 1000 // 14 days from now
	}
);

// pg-boss
await boss.send(
	'send-trial-expiry-email',
	{ userId },
	{
		startAfter: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
	}
);
```

**Recurring (cron-এর মতো):**

```typescript
// BullMQ — repeatable jobs
await queue.add(
	'cleanup-expired-sessions',
	{},
	{
		repeat: { cron: '0 3 * * *' } // 3am every day
	}
);

// pg-boss — schedules
await boss.schedule('cleanup-expired-sessions', '0 3 * * *', {});
await boss.work('cleanup-expired-sessions', async () => {
	await db.sessions.deleteExpired();
});
```

## Queue Health মনিটর করা

track করার মূল metric:

```typescript
// BullMQ counts
const [waiting, active, completed, failed] = await Promise.all([
	queue.getWaitingCount(),
	queue.getActiveCount(),
	queue.getCompletedCount(),
	queue.getFailedCount()
]);

console.log({ waiting, active, completed, failed });
```

**Alert threshold:**

- `waiting > 1000`: queue জমছে, worker যোগ করুন
- `failed > 0 and growing`: job type-এ bug আছে অথবা dependency down
- `active == workerCount and waiting > 0`: worker capacity-তে পৌঁছেছে, scale out করুন
- `oldest waiting job > 5 minutes`: job pickup SLA ভেঙে গেছে

**Bull Board** — BullMQ-র জন্য visual UI:

```typescript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
	queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(pdfQueue)],
	serverAdapter
});

app.use('/admin/queues', serverAdapter.getRouter());
```

auth-এর পেছনে mount করুন — এটি job payload দেখায় যাতে sensitive data থাকতে পারে।
