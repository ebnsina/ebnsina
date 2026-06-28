---
title: 'Retries & Backoff'
subtitle: 'Exponential backoff, jitter, max attempts, and knowing when to stop retrying and give up.'
chapter: 3
level: 'intermediate'
readingTime: '9 min'
topics: ['retries', 'exponential backoff', 'jitter', 'dead-letter queue', 'error handling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Redailing a busy phone number: you don't call back every second — you wait a bit, then a bit longer, then longer still. And if someone else calls at the same millisecond, your calls are spaced randomly enough that you don't collide repeatedly. Exponential backoff with jitter does exactly this for job retries.

</Callout>

## Why Jobs Fail

Jobs fail for two reasons — and your retry strategy should differ:

**Transient failures** (worth retrying):

- Network timeout calling an external API
- Database connection error
- Third-party rate limit (429)
- Temporary resource unavailability

**Permanent failures** (not worth retrying):

- Invalid job data (missing required field)
- Business logic violation (user deleted before job ran)
- External API returns 400 (bad request — same input will fail again)
- Code bug

A naive retry retries everything, wasting attempts on permanent failures and never giving up on transient ones.

## Exponential Backoff

Wait longer after each failure. The delay grows exponentially to avoid hammering a struggling dependency:

```typescript
function calculateDelay(attempt: number, baseDelayMs = 1000): number {
	// attempt 1: 1000ms
	// attempt 2: 2000ms
	// attempt 3: 4000ms
	// attempt 4: 8000ms
	return baseDelayMs * Math.pow(2, attempt - 1);
}
```

**The thundering herd problem:** If 1000 jobs all fail at the same time and retry after exactly 2 seconds, they all hit your dependency simultaneously again — causing the same failure. Add jitter to spread them out:

```typescript
function calculateDelayWithJitter(
	attempt: number,
	baseDelayMs = 1000,
	maxDelayMs = 30_000
): number {
	const exponential = baseDelayMs * Math.pow(2, attempt - 1);
	const capped = Math.min(exponential, maxDelayMs);

	// Full jitter: random value between 0 and the cap
	return Math.random() * capped;
}

// Or decorrelated jitter (better distribution):
function decorrelatedJitter(attempt: number, baseMs = 1000, maxMs = 30_000): number {
	const prev = attempt === 1 ? baseMs : decorrelatedJitter(attempt - 1, baseMs, maxMs);
	return Math.min(maxMs, Math.random() * (prev * 3 - baseMs) + baseMs);
}
```

## Configuring Retries in BullMQ

```typescript
await queue.add(
	'send-webhook',
	{ url, payload },
	{
		attempts: 5,
		backoff: {
			type: 'exponential',
			delay: 2000 // base delay 2s
			// Effective delays: 2s, 4s, 8s, 16s, 32s
		}
	}
);

// Custom backoff strategy
const worker = new Worker('webhooks', handler, {
	connection,
	settings: {
		backoffStrategies: {
			// Custom: use Retry-After header value if present
			'respect-retry-after': (attemptsMade, err) => {
				if (err instanceof RateLimitError && err.retryAfter) {
					return err.retryAfter * 1000;
				}
				return Math.min(30_000, 2000 * Math.pow(2, attemptsMade));
			}
		}
	}
});

// Use custom strategy on specific job
await queue.add('call-api', data, {
	attempts: 10,
	backoff: { type: 'respect-retry-after' }
});
```

## Distinguishing Transient from Permanent Errors

Throw different error types to signal retry behavior:

```typescript
class PermanentError extends Error {
	readonly permanent = true;
}

class TransientError extends Error {
	readonly permanent = false;
	constructor(
		message: string,
		readonly retryAfterMs?: number
	) {
		super(message);
	}
}

// Handler
async function sendWebhook(job: Job): Promise<void> {
	const response = await fetch(job.data.url, {
		method: 'POST',
		body: JSON.stringify(job.data.payload)
	});

	if (response.status === 400) {
		// Bad request — retrying won't help
		throw new PermanentError(`Bad request: ${await response.text()}`);
	}

	if (response.status === 429) {
		const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
		throw new TransientError('Rate limited', retryAfter * 1000);
	}

	if (response.status >= 500) {
		throw new TransientError('Server error');
	}

	if (!response.ok) {
		throw new PermanentError(`Unexpected status: ${response.status}`);
	}
}

// In worker
const worker = new Worker('webhooks', async (job) => {
	try {
		await sendWebhook(job);
	} catch (err) {
		if (err instanceof PermanentError) {
			// Move straight to DLQ — don't retry
			await job.moveToFailed(err, worker.token!, true);
			return;
		}
		throw err; // let BullMQ handle retry
	}
});
```

## Dead-Letter Queues

When a job exhausts all attempts, it goes to the dead-letter queue (DLQ). The DLQ is not a trash can — it's a holding area for human investigation and manual reprocessing.

```typescript
// Set up a separate DLQ queue
const dlq = new Queue('dead-letter', { connection });

// Move failed jobs to DLQ instead of just marking failed
worker.on('failed', async (job, err) => {
	if (!job) return;

	if (job.attemptsMade >= job.opts.attempts!) {
		// Final failure — send to DLQ with context
		await dlq.add('failed-job', {
			originalQueue: 'webhooks',
			originalJobId: job.id,
			originalData: job.data,
			error: err.message,
			failedAt: new Date().toISOString(),
			attempts: job.attemptsMade
		});
	}
});
```

**DLQ operations you need:**

1. **Inspect**: browse failed jobs, see error messages and payloads
2. **Replay**: fix the underlying issue, then reprocess the job
3. **Discard**: some jobs are genuinely expired and should be dropped

```typescript
// Replay all DLQ jobs for a specific error type
const dlqJobs = await dlq.getJobs(['waiting']);

for (const job of dlqJobs) {
	if (job.data.error.includes('Rate limited')) {
		const originalQueue = new Queue(job.data.originalQueue, { connection });
		await originalQueue.add(job.name, job.data.originalData, {
			attempts: 5,
			backoff: { type: 'exponential', delay: 5000 }
		});
		await job.remove();
	}
}
```

## Idempotency During Retries

If a job is retried, it might execute partially-completed work again. Design handlers to be safe to run multiple times:

```typescript
// NOT idempotent — charges customer twice on retry
async function processPayment(job: Job): Promise<void> {
	await stripe.charges.create({
		amount: job.data.amount,
		customer: job.data.customerId
	});
}

// Idempotent — idempotency key prevents duplicate charge
async function processPayment(job: Job): Promise<void> {
	await stripe.charges.create(
		{ amount: job.data.amount, customer: job.data.customerId },
		{ idempotencyKey: `charge-${job.id}` } // job.id is stable across retries
	);
}
```

Use the job ID as an idempotency key — it's stable across retries. For database operations, use `INSERT ... ON CONFLICT DO NOTHING` or check existence before inserting:

```typescript
async function createInvoice(job: Job): Promise<void> {
	await db.invoices.upsert({
		where: { jobId: job.id }, // idempotency check
		create: { ...job.data, jobId: job.id },
		update: {} // already created — no-op
	});
}
```

## Alerting on Retry Patterns

Retrying is normal. Retrying at scale or indefinitely is a signal:

```typescript
worker.on('failed', async (job, err) => {
	if (!job) return;

	// Alert if a job type is consistently failing
	const recentFailures = await queue.getFailedCount();
	if (recentFailures > 100) {
		await alertOncall(`Job queue ${queue.name} has ${recentFailures} failures`);
	}

	// Alert on first attempt to indicate a new error pattern
	if (job.attemptsMade === 1) {
		logger.error({ jobType: job.name, error: err.message, jobId: job.id }, 'Job first failure');
	}

	// Alert on final failure
	if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
		logger.error({ jobType: job.name, error: err.message, jobId: job.id }, 'Job exhausted retries');
		metrics.increment('jobs.exhausted', { type: job.name });
	}
});
```
