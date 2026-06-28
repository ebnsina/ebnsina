---
title: 'Queue Backends'
subtitle: 'Redis-backed queues with BullMQ, Postgres-backed with pg-boss — internals, trade-offs, and when each fits.'
chapter: 2
level: 'intermediate'
readingTime: '11 min'
topics: ['BullMQ', 'pg-boss', 'Redis', 'PostgreSQL', 'queue internals']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A ticketing system: Redis queues are the fast-moving line at a concert venue where a bouncer pulls tickets rapidly from a bin. Postgres queues are the methodical DMV counter — slower, but every transaction is recorded, auditable, and never lost even if the building loses power.

</Callout>

## BullMQ (Redis-backed)

BullMQ is the most popular Node.js queue library. It uses Redis sorted sets and lists to track job state transitions.

**Job states in BullMQ:**

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

**Redis data structures BullMQ uses:**

- `bull:emails:wait` — sorted set of waiting jobs (score = priority)
- `bull:emails:active` — set of jobs currently being processed
- `bull:emails:completed` — sorted set of completed jobs
- `bull:emails:failed` — sorted set of failed jobs
- `bull:emails:delayed` — sorted set of future jobs (score = run timestamp)

## pg-boss (PostgreSQL-backed)

No Redis needed. Jobs are rows in a Postgres table. You get ACID transactions — perfect for "enqueue job as part of the same transaction that creates the record":

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

**The schema pg-boss creates:**

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

Workers poll this table with `SELECT ... FOR UPDATE SKIP LOCKED` — a Postgres pattern that lets multiple workers safely claim jobs without conflicts:

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

`FOR UPDATE SKIP LOCKED` is the key — multiple workers can poll simultaneously without blocking each other or claiming the same job.

## Choosing Between Them

**Use BullMQ (Redis) when:**

- You need real-time job pickup (sub-second)
- High throughput (thousands of jobs/second)
- You need built-in job progress tracking, rate limiting per queue, or priority queues
- You already run Redis

**Use pg-boss (Postgres) when:**

- You want to enqueue atomically with a DB write (no chance of job lost if enqueue fails)
- You don't want to run Redis
- You need full auditability of job history
- Your throughput is modest (&lt;100 jobs/second)
- You want simpler ops (one fewer infra component)

**The transactional enqueueing advantage:**

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

This is a significant advantage for operations where "write record + enqueue job" must be atomic.

## Delayed and Scheduled Jobs

**Delayed (run once, in the future):**

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

**Recurring (cron-like):**

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

## Monitoring Queue Health

Key metrics to track:

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

**Alert thresholds:**

- `waiting > 1000`: queue is backing up, add workers
- `failed > 0 and growing`: job type has a bug or dependency is down
- `active == workerCount and waiting > 0`: at worker capacity, scale out
- `oldest waiting job > 5 minutes`: job pickup SLA is broken

**Bull Board** — visual UI for BullMQ:

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

Mount behind auth — this shows job payloads which may contain sensitive data.
