---
title: 'Retries & Backoff'
subtitle: 'Exponential backoff, jitter, max attempts, এবং কখন retry বন্ধ করে হাল ছেড়ে দিতে হবে তা জানা।'
chapter: 3
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['retries', 'exponential backoff', 'jitter', 'dead-letter queue', 'error handling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব উদাহরণ**

একটি ব্যস্ত ফোন নম্বরে বারবার ডায়াল করা: আপনি প্রতি সেকেন্ডে কল করেন না — একটু অপেক্ষা করেন, তারপর আরেকটু বেশি, তারপর আরও বেশি। আর অন্য কেউ ঠিক একই মিলিসেকেন্ডে কল করলেও, আপনার কলগুলো এলোমেলোভাবে যথেষ্ট ব্যবধানে থাকে যাতে বারবার সংঘর্ষ না হয়। Jitter সহ exponential backoff job retry-র জন্য ঠিক এটাই করে।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরি তার বন্ধু ইবনে সিনাকে ল্যান্ডলাইন ফোনে ধরার চেষ্টা করছেন — কিন্তু লাইন engaged, বারবার সেই খ্যাঁচ-খ্যাঁচ ব্যস্ত টোন। তিনি জানেন ইবনে সিনা বাসাতেই আছেন, একটু পরেই ফোন রেখে দেবেন, তাই এটা সাময়িক সমস্যা। এখন ফাতিমা যদি প্রতি সেকেন্ডে পাগলের মতো রিডায়াল করতে থাকেন, তাতে লাইন আরও জ্যাম হয়ে থাকবে, ইবনে সিনার কল শেষ করাটাও কঠিন হবে। তাই তিনি বুদ্ধি করে অন্যভাবে চেষ্টা করেন।

প্রথমবার engaged পেয়ে তিনি দশ সেকেন্ড অপেক্ষা করেন, তারপর আবার ডায়াল — এখনও engaged। এবার তিনি প্রায় আধা মিনিট থামেন, তারপর আরও বেশি, প্রতিবার আগের চেয়ে লম্বা বিরতি নিয়ে। আবার তিনি ঘড়ির কাঁটা ধরে ঠিক গোল সময়ে ডায়াল করেন না — একটু এদিক-ওদিক করে সময় বদলে দেন, যাতে ওই একই লাইনে চেষ্টা করা আর সবার সঙ্গে ঠিক একই মুহূর্তে তার কলটা গিয়ে না লাগে। এভাবে কয়েকবার চেষ্টার পরও লাইন না খুললে ফাতিমা হাল ছেড়ে দেন — আজ আর নয়, কাল আবার দেখা যাবে।

এই গল্পটাই আসলে **retries with exponential backoff**। engaged লাইনটা হলো একটা transient-ভাবে fail করা job বা service, প্রতিটা রিডায়াল হলো একটা retry। প্রতিবার আগের চেয়ে বেশি সময় অপেক্ষা করাটা হলো **exponential backoff**, আর ডায়ালের ঠিক মুহূর্তটা একটু এলোমেলো করে দেওয়াটা হলো **jitter** — যাতে সবাই একসাথে হুমড়ি খেয়ে না পড়ে। প্রতি সেকেন্ডে রিডায়াল না করাটাই হলো একটা ধুঁকতে থাকা service-কে বারবার আঘাত না করা, আর কয়েকবার পর থেমে যাওয়াটা হলো **max attempts** limit (তারপর job চলে যায় dead-letter queue-তে)। বাস্তবেও ঠিক এভাবেই — একটা webhook বা external API 429/500 ফেরত দিলে সিস্টেম সঙ্গে সঙ্গে হাল ছাড়ে না, আবার অন্ধভাবে চেষ্টাও করতে থাকে না।

## Job কেন Fail করে

Job দুটো কারণে fail করে — এবং আপনার retry strategy আলাদা হওয়া উচিত:

**Transient failure** (retry করা মূল্যবান):

- একটি external API call করার সময় network timeout
- Database connection error
- Third-party rate limit (429)
- অস্থায়ীভাবে resource না পাওয়া

**Permanent failure** (retry করা অর্থহীন):

- Invalid job data (required field নেই)
- Business logic violation (job চলার আগেই user মুছে গেছে)
- External API 400 রিটার্ন করে (bad request — একই input আবার fail করবে)
- Code bug

একটি naive retry সবকিছু retry করে, permanent failure-এ attempt নষ্ট করে আর transient-গুলোতে কখনো হাল ছাড়ে না।

## Exponential Backoff

প্রতিটি failure-এর পরে বেশি সময় অপেক্ষা করুন। একটি ধুঁকতে থাকা dependency-কে বারবার আঘাত না করার জন্য delay exponentially বাড়ে:

```typescript
function calculateDelay(attempt: number, baseDelayMs = 1000): number {
	// attempt 1: 1000ms
	// attempt 2: 2000ms
	// attempt 3: 4000ms
	// attempt 4: 8000ms
	return baseDelayMs * Math.pow(2, attempt - 1);
}
```

**Thundering herd সমস্যা:** যদি 1000টি job একই সময়ে fail করে এবং ঠিক 2 সেকেন্ড পরে retry করে, তবে তারা সবাই একসাথে আবার আপনার dependency-তে আঘাত করে — একই failure ঘটিয়ে। এদের ছড়িয়ে দিতে jitter যোগ করুন:

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

## BullMQ-তে Retry কনফিগার করা

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

## Transient থেকে Permanent Error আলাদা করা

retry behavior সংকেত দিতে ভিন্ন error type throw করুন:

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

## Dead-Letter Queue

একটি job যখন সব attempt শেষ করে ফেলে, তখন সেটা dead-letter queue-তে (DLQ) চলে যায়। DLQ কোনো ময়লার ঝুড়ি নয় — এটি মানুষের তদন্ত ও manual reprocessing-এর জন্য একটি হোল্ডিং এরিয়া।

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

**যেসব DLQ অপারেশন আপনার দরকার:**

1. **Inspect**: failed job ব্রাউজ করা, error message ও payload দেখা
2. **Replay**: মূল সমস্যা ঠিক করা, তারপর job আবার প্রসেস করা
3. **Discard**: কিছু job সত্যিই expired এবং drop করে দেওয়া উচিত

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

## Retry-র সময় Idempotency

একটি job retry হলে, সেটা আংশিক-সম্পূর্ণ কাজ আবার execute করতে পারে। Handler-কে একাধিকবার চালানোর জন্য নিরাপদ করে ডিজাইন করুন:

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

idempotency key হিসেবে job ID ব্যবহার করুন — এটি retry জুড়ে stable থাকে। Database অপারেশনের জন্য `INSERT ... ON CONFLICT DO NOTHING` ব্যবহার করুন অথবা insert করার আগে existence চেক করুন:

```typescript
async function createInvoice(job: Job): Promise<void> {
	await db.invoices.upsert({
		where: { jobId: job.id }, // idempotency check
		create: { ...job.data, jobId: job.id },
		update: {} // already created — no-op
	});
}
```

## Retry Pattern-এ Alerting

Retry করা স্বাভাবিক। বড় পরিসরে বা অনির্দিষ্টকাল ধরে retry করা একটি সংকেত:

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
