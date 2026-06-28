---
title: 'Idempotency'
subtitle: 'Design jobs so running them twice is the same as running them once — because at-least-once delivery guarantees you will run them twice.'
chapter: 4
level: 'intermediate'
readingTime: '10 min'
topics: ['idempotency', 'at-least-once', 'exactly-once', 'deduplication', 'distributed systems']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

An elevator button: pressing it once summons the elevator. Pressing it five more times does nothing extra — the elevator still comes exactly once. That's idempotency: repeated application of an operation produces the same result as applying it once.

</Callout>

## At-Least-Once Delivery

Most queue systems guarantee **at-least-once delivery** — a job will run at least once, but might run more. This happens when:

- A worker processes a job and crashes before acknowledging completion
- The queue's heartbeat times out during a long-running job
- Network partition causes the queue to redeliver a job the worker already processed
- A bug causes the queue to retry a job that actually succeeded

You cannot prevent this in a distributed system without significant coordination overhead. The pragmatic approach: accept at-least-once delivery and write idempotent handlers.

**Exactly-once** delivery is theoretically possible but expensive — it requires distributed transactions across the queue and your application state, with significant performance cost. For most use cases, at-least-once + idempotency is the right trade.

## Making Operations Idempotent

The pattern: check if the work was already done before doing it, or use the database's conflict handling to prevent duplicates.

**Pattern 1: Existence check**

```typescript
async function sendWelcomeEmail(job: Job<{ userId: string }>): Promise<void> {
	const { userId } = job.data;

	// Check if already sent
	const alreadySent = await db.emailLog.findOne({
		where: { type: 'welcome', userId }
	});

	if (alreadySent) {
		logger.info({ userId, jobId: job.id }, 'Welcome email already sent, skipping');
		return; // idempotent — do nothing
	}

	await sendEmail(userId, 'welcome');

	// Record that we sent it
	await db.emailLog.insert({ type: 'welcome', userId, sentAt: new Date() });
}
```

**Pattern 2: Database upsert**

```typescript
async function updateSearchIndex(job: Job<{ productId: string }>): Promise<void> {
	const product = await db.products.findById(job.data.productId);
	if (!product) return; // deleted since job was enqueued — OK to skip

	await searchIndex.upsert({
		id: product.id, // upsert by ID — safe to run multiple times
		name: product.name,
		price: product.price,
		updatedAt: product.updatedAt
	});
}
```

**Pattern 3: Idempotency keys with external APIs**

```typescript
async function chargeCustomer(job: Job<{ orderId: string; amount: number }>): Promise<void> {
	const { orderId, amount } = job.data;

	await stripe.paymentIntents.create(
		{
			amount,
			currency: 'usd',
			customer: job.data.customerId,
			metadata: { orderId }
		},
		{
			// Stripe deduplicates requests with the same idempotency key
			// Job ID is stable across retries — safe to use
			idempotencyKey: `order-charge-${orderId}`
		}
	);
}
```

Most well-designed APIs accept idempotency keys — Stripe, Twilio, Braintree, and many others. Check the docs before assuming an API is safe to call multiple times.

## Deduplication at Enqueue Time

Prevent the same logical job from being added to the queue multiple times:

```typescript
// BullMQ — jobId as deduplication key
await queue.add(
	'send-welcome-email',
	{ userId: user.id },
	{
		jobId: `welcome-${user.id}` // if this job already exists in queue, skip
	}
);

// pg-boss — singleton key
await boss.sendOnce(
	'send-welcome-email',
	{ userId: user.id },
	{},
	`welcome-${user.id}` // deduplication key
);
```

This prevents the queue from accumulating duplicate jobs when the enqueue operation itself is retried (e.g., if your API handler runs twice due to a client retry).

## The Job ID as Stable Idempotency Key

Job IDs are stable across retries — the same job object is presented to the worker on each attempt. Use the job ID to track work done:

```typescript
async function generateReport(job: Job<{ reportId: string }>): Promise<void> {
	const { reportId } = job.data;

	// Use job.id (not reportId) as idempotency key for external operations
	// This way, if the same reportId is queued twice (two different jobs),
	// each job handles its own idempotency independently

	const lockKey = `report-generation:${job.id}`;

	// Distributed lock: only one worker handles this job
	const locked = await redis.set(lockKey, '1', 'NX', 'EX', 300);
	if (!locked) {
		// Another worker is already processing this job — skip
		return;
	}

	try {
		// Check if already completed (in case of crash after completion)
		const existing = await db.reports.findOne({
			where: { jobId: job.id }
		});

		if (existing) return; // already done

		const data = await gatherReportData(reportId);
		const pdf = await renderPdf(data);

		await db.reports.insert({
			reportId,
			jobId: job.id, // link to job for dedup
			url: await uploadToS3(pdf),
			createdAt: new Date()
		});
	} finally {
		await redis.del(lockKey);
	}
}
```

## Non-Idempotent Operations and Fencing

Some operations are inherently non-idempotent (email sends with no dedup API, webhook deliveries). Use a **fencing token** to prevent duplicate execution:

```typescript
interface JobFence {
	jobId: string;
	startedAt: Date;
	completedAt?: Date;
	result?: unknown;
}

async function withFence<T>(jobId: string, work: () => Promise<T>): Promise<T | null> {
	// Try to claim exclusive execution right
	const inserted = await db.jobFences.insertIfNotExists({
		jobId,
		startedAt: new Date()
	});

	if (!inserted) {
		// Another worker already started (or completed) this job
		const existing = await db.jobFences.findByJobId(jobId);
		if (existing?.completedAt) {
			return existing.result as T; // already done, return cached result
		}

		// In-progress elsewhere — skip
		logger.warn({ jobId }, 'Job already in progress, skipping');
		return null;
	}

	try {
		const result = await work();
		await db.jobFences.update(jobId, { completedAt: new Date(), result });
		return result;
	} catch (err) {
		await db.jobFences.delete(jobId); // release the fence on failure — allow retry
		throw err;
	}
}

// Usage
async function sendNotificationEmail(job: Job): Promise<void> {
	await withFence(job.id, async () => {
		await emailProvider.send({
			to: job.data.email,
			subject: job.data.subject,
			body: job.data.body
		});
	});
}
```

## Testing for Idempotency

Make idempotency part of your test suite:

```typescript
describe('sendWelcomeEmail job', () => {
	it('sends email exactly once when job runs twice', async () => {
		const emailSpy = jest.spyOn(emailService, 'send');
		const job = createMockJob({ userId: 'u_123' });

		// Run twice — simulates retry
		await sendWelcomeEmailHandler(job);
		await sendWelcomeEmailHandler(job);

		// Email sent exactly once
		expect(emailSpy).toHaveBeenCalledTimes(1);
	});

	it('handles already-completed job gracefully', async () => {
		// Pre-insert the email log record
		await db.emailLog.insert({ type: 'welcome', userId: 'u_123' });

		const job = createMockJob({ userId: 'u_123' });

		// Should not throw, should not send
		await expect(sendWelcomeEmailHandler(job)).resolves.not.toThrow();
		expect(emailService.send).not.toHaveBeenCalled();
	});
});
```

Run these tests against a real database (not mocks) — idempotency logic often involves upserts and conflict handling that only works with real SQL semantics.
