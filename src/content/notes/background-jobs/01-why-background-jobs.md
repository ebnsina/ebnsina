---
title: "Why Background Jobs"
subtitle: "What belongs in a job queue, what belongs in the request cycle, and why mixing them breaks both."
chapter: 1
level: "beginner"
readingTime: "7 min"
topics: ["background jobs", "queues", "async processing", "request lifecycle"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A restaurant kitchen: the waiter takes your order and confirms it immediately — they don't stand there while the chef cooks your meal. The order goes to the kitchen (a queue), and the waiter goes back to take more orders. Background jobs are the kitchen.

</Callout>

## The Problem with Doing Everything in the Request

A typical HTTP request should respond in under a few hundred milliseconds. Users notice anything slower. But many real operations take longer: sending emails, resizing images, syncing with third-party APIs, generating PDFs, processing uploads.

Doing slow work inline has two failure modes:

1. **Timeout:** The request takes too long, the client disconnects, the work is half-done.
2. **Backpressure:** Slow requests pile up, exhausting your server's connection pool and degrading everything else.

```typescript
// WRONG — email sending blocks the response
app.post('/register', async (req, res) => {
  const user = await db.users.create(req.body);

  // This might take 2-5 seconds — user waits, request might timeout
  await sendWelcomeEmail(user.email);
  await sendSlackNotification(user);
  await updateCRM(user);

  res.status(201).json({ user }); // responds after ALL of that finishes
});
```

If the email provider is slow, every registration is slow. If it's down, registrations fail entirely — even though the user was created successfully.

```typescript
// RIGHT — enqueue the work, respond immediately
app.post('/register', async (req, res) => {
  const user = await db.users.create(req.body);

  // Fire and continue — these run outside the request
  await queue.add('send-welcome-email', { userId: user.id });
  await queue.add('notify-slack', { userId: user.id });
  await queue.add('sync-crm', { userId: user.id });

  res.status(201).json({ user }); // responds in ~50ms
});
```

## What Goes in a Queue

**Good candidates:**
- Email/SMS notifications
- Image/video processing (resize, transcode)
- PDF generation
- Third-party API calls (Stripe, Twilio, Salesforce)
- Search index updates
- Report generation
- Webhook delivery
- Data exports/imports
- Cache warming
- Cleanup tasks (delete expired sessions, soft-deleted records)

**Bad candidates:**
- Data that the response depends on (user needs the result immediately)
- Short operations (&lt;10ms) — queue overhead exceeds the work
- Operations that need transactional consistency with the request

The test: "Does the user need this result before I can respond?" If yes, do it inline. If no, queue it.

## The Anatomy of a Job

```typescript
interface Job<T = unknown> {
  id: string;         // unique identifier
  type: string;       // what kind of work to do
  data: T;            // input for the worker
  attempts: number;   // how many times we've tried
  maxAttempts: number;// give up after this many failures
  delay: number;      // wait this many ms before first attempt
  priority: number;   // higher = picked first
  createdAt: Date;
  scheduledAt: Date;  // when to run (allows delayed jobs)
}

interface JobResult {
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number; // ms
}
```

## Worker Architecture

Workers are processes (or threads) that pull jobs from a queue and execute them:

```typescript
// Single worker — processes one job at a time
class Worker {
  constructor(
    private queue: Queue,
    private handlers: Map<string, JobHandler>,
  ) {}

  async start(): Promise<void> {
    while (true) {
      const job = await this.queue.dequeue();
      if (!job) {
        await sleep(1000); // poll interval when queue is empty
        continue;
      }

      await this.process(job);
    }
  }

  private async process(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      await this.queue.fail(job.id, 'Unknown job type');
      return;
    }

    const start = Date.now();
    try {
      await handler(job.data);
      await this.queue.complete(job.id, { duration: Date.now() - start });
    } catch (err) {
      await this.queue.fail(job.id, String(err));
    }
  }
}

// Register handlers
const worker = new Worker(queue, new Map([
  ['send-welcome-email', sendWelcomeEmailHandler],
  ['notify-slack', notifySlackHandler],
  ['sync-crm', syncCrmHandler],
]));
```

## Scaling Workers

Workers are stateless — you can run as many as your queue and database support:

```
Queue (Redis or Postgres)
     ↓           ↓           ↓
 Worker 1    Worker 2    Worker 3
```

Each worker picks up the next available job. Horizontal scaling is just starting more worker processes. Scale workers independently from your web servers — if you have a sudden spike in email jobs, spin up more email workers without touching your API tier.

## Concurrency Within a Worker

A single worker process can run multiple jobs in parallel:

```typescript
import Queue from 'bull';

const queue = new Queue('jobs', { redis: redisConfig });

// Process up to 10 jobs concurrently within this worker process
queue.process('send-email', 10, async (job) => {
  await sendEmail(job.data);
});

queue.process('generate-pdf', 2, async (job) => {
  // CPU-intensive — fewer concurrent
  await generatePdf(job.data);
});
```

Match concurrency to the nature of the work: I/O-bound jobs (network calls) can run many in parallel; CPU-bound jobs should be limited to the number of cores.

## Choosing a Queue Backend

| Backend | Pros | Cons | Best for |
|---------|------|------|----------|
| Redis (Bull/BullMQ) | Fast, feature-rich, great tooling | Extra infra dependency | High throughput, real-time |
| PostgreSQL (pg-boss) | No extra infra, ACID guarantees | Slower than Redis | Teams already using Postgres |
| In-memory | Zero infra | Lost on restart | Dev/test only |
| SQS/Cloud queues | Managed, durable | Cost, cold start | AWS-native apps |

If you're already running Postgres and don't need sub-second job pickup, **pg-boss** is the pragmatic choice — no Redis to operate. If you need high throughput or real-time job processing, **BullMQ** on Redis.

