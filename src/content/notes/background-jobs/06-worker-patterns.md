---
title: 'Worker Patterns & Production'
subtitle: 'Graceful shutdown, concurrency limit, priority queue, fan-out, এবং প্রোডাকশনে job চালানোর অপারেশনাল চেকলিস্ট।'
chapter: 6
level: 'advanced'
readingTime: '10 মিনিট'
topics: ['graceful shutdown', 'priority queues', 'fan-out', 'worker pools', 'production']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব উদাহরণ**

একটি হাসপাতালের triage system: আসা রোগীদের first-come-first-served ভিত্তিতে সামলানো হয় না — critical কেস সঙ্গে সঙ্গে সার্জারিতে যায় আর রুটিন চেকআপ অপেক্ষা করে। পরীক্ষার মাঝপথে থাকা কোনো রোগীকে শিফট বদলের সময় ফেলে যাওয়া হয় না — পরিচ্ছন্ন হস্তান্তর না হওয়া পর্যন্ত সেবা চলতে থাকে। প্রোডাকশন worker-এরও একই দরকার: priority handling এবং graceful handoff।

</Callout>

## গল্পে বুঝি

ফাতিমার একটা কাঠের কারখানা। সামনে দেয়ালে একটা লোহার স্পাইকে গেঁথে রাখা থাকে কাজের স্লিপ — প্রতিটা স্লিপে একটা করে অর্ডার। সিনা, খোয়ারিজমি সহ কয়েকজন কারিগর পাশাপাশি বসে কাজ করে; কেউ একটা স্লিপ শেষ করলেই স্পাইক থেকে পরের স্লিপটা টেনে নিয়ে শুরু করে দেয়। কেউ কারও জন্য বসে থাকে না — সবাই একসাথে, যে যার গতিতে অর্ডার সামলায়। কিন্তু একটা সমস্যা: হঠাৎ যদি সব কারিগর একসাথে পেছনের কাটিং-রুমে ঢুকে পড়ে, ভিড়ে মেশিন জ্যাম হয়ে যায়। তাই ফাতিমা নিয়ম করে দিয়েছেন — একসাথে বড়জোর চারজন পেছনে কাজ করবে, বাকিরা সামনে অপেক্ষা করবে।

একদিন একটা স্লিপ বেঁকে-চুরে গেছে; যেই কারিগর সেটা নিয়ে মেশিনে বসায়, সেটা আটকে যায়, কাজ থেমে যায়। প্রথমে সিনা চেষ্টা করল, আটকে গেল; খোয়ারিজমি চেষ্টা করল, আবার আটকে গেল। এভাবে চললে ওই একটা স্লিপই পুরো লাইন বসিয়ে দেবে। ফাতিমা তাই স্লিপটা স্পাইক থেকে তুলে পাশের একটা আলাদা "সমস্যা-ট্রে"-তে রেখে দিলেন — পরে ধীরেসুস্থে দেখা যাবে, এখন বাকি সবাই আবার স্বাভাবিক গতিতে কাজ চালিয়ে যাক। আর দেয়ালে ঝোলানো একটা বোর্ডে তিনি দাগ কেটে রাখেন — কতগুলো অর্ডার শেষ হলো, কতগুলো আটকাল — যেন এক নজরেই কারখানার অবস্থা বোঝা যায়।

গল্পের কারিগরদের দল, যারা একই স্পাইক থেকে পরের স্লিপ টেনে নিয়ে একসাথে কাজ করছে — এটাই **worker pool**। যেই বাঁকা স্লিপটা বারবার আটকে যাচ্ছিল সেটা **poison message/job**, আর সেটা তুলে আলাদা "সমস্যা-ট্রে"-তে রাখা মানে failed job-কে **dead-letter queue (DLQ)**-তে সরিয়ে দেওয়া — যাতে সেটা পুরো লাইন ব্লক না করে। একসাথে সর্বোচ্চ চারজনকে পেছনে ঢুকতে দেওয়া হলো **concurrency limit**, আর দেয়ালের done/failed বোর্ডটা হলো **monitoring**। বাস্তবে BullMQ-তে ঠিক এভাবেই হয় — একটা worker `concurrency` সেট করে একাধিক job সমান্তরালে টানে, সব retry শেষেও fail করা poison job DLQ-তে জমা হয়, আর `completed`/`failed` event থেকে metric তুলে queue depth ও error rate-এর ওপর নজর রাখা হয়।

## Graceful Shutdown

Worker-কে থামার আগে তাদের চলতি job শেষ করতে হবে। কোনো job-এর মাঝপথে হঠাৎ shutdown (SIGKILL) হলে আপনার data একটি inconsistent state-এ থেকে যায়।

```typescript
import { Worker } from 'bullmq';

const worker = new Worker('jobs', jobHandler, { connection, concurrency: 10 });

// Graceful shutdown handler
async function shutdown(): Promise<void> {
	logger.info('Shutting down worker...');

	// Stop picking up new jobs
	await worker.pause();

	// Wait for in-progress jobs to complete (up to 30s)
	const timeout = setTimeout(async () => {
		logger.warn('Shutdown timeout — forcing close');
		await worker.close(true); // force close
		process.exit(1);
	}, 30_000);

	await worker.close(); // waits for active jobs to finish
	clearTimeout(timeout);

	logger.info('Worker shutdown complete');
	process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

**Container deployment:** Kubernetes-এ `terminationGracePeriodSeconds`-কে আপনার সবচেয়ে দীর্ঘ প্রত্যাশিত job-এর চেয়ে বেশি করে সেট করুন:

```yaml
spec:
  containers:
    - name: worker
      lifecycle:
        preStop:
          exec:
            command: ['sleep', '5'] # give SIGTERM time to propagate
  terminationGracePeriodSeconds: 60 # matches your 30s worker timeout + buffer
```

## Priority Queue

কিছু job অন্যদের চেয়ে বেশি জরুরি। প্রতি priority tier-এ dedicated worker সহ একাধিক queue প্রয়োগ করুন, অথবা BullMQ-র built-in priority ব্যবহার করুন:

**একাধিক queue (explicit control):**

```typescript
const criticalQueue = new Queue('critical', { connection });
const defaultQueue = new Queue('default', { connection });
const bulkQueue = new Queue('bulk', { connection });

// More workers on critical queue
const criticalWorker = new Worker('critical', handler, { connection, concurrency: 20 });
const defaultWorker = new Worker('default', handler, { connection, concurrency: 5 });
const bulkWorker = new Worker('bulk', handler, { connection, concurrency: 2 });
```

**BullMQ priority (একটি single queue, priority value অনুযায়ী সাজানো):**

```typescript
// Lower number = higher priority
await queue.add('send-alert', { userId }, { priority: 1 }); // picked first
await queue.add('send-report', { userId }, { priority: 10 });
await queue.add('sync-data', { userId }, { priority: 100 }); // picked last
```

BullMQ priority sorted set ব্যবহার করে — worker সবসময় পরে সবচেয়ে কম priority-number-এর job তুলে নেয়। এটি ভালো কাজ করে কিন্তু টানা high load-এর সময় কম-priority-র job-কে অভুক্ত রাখতে পারে। সেক্ষেত্রে বরং একাধিক queue জুড়ে weighted round-robin ব্যবহার করুন।

## Fan-Out Pattern

একটি job অনেকগুলো child job তৈরি করে। bulk অপারেশনের জন্য উপকারী যেখানে আপনি per-item retry ও concurrency চান:

```typescript
// Parent job: dispatch work to children
async function processOrderBatch(job: Job<{ orderIds: string[] }>): Promise<void> {
	const { orderIds } = job.data;

	// Fan out — one child per order
	await Promise.all(
		orderIds.map((orderId) =>
			childQueue.add(
				'process-order',
				{ orderId },
				{
					attempts: 3,
					backoff: { type: 'exponential', delay: 1000 }
				}
			)
		)
	);

	logger.info({ count: orderIds.length }, 'Dispatched order processing jobs');
}

// Child job: handles one order, retried independently if it fails
async function processOrder(job: Job<{ orderId: string }>): Promise<void> {
	const order = await db.orders.findById(job.data.orderId);
	if (!order) return; // already deleted — skip

	await fulfillOrder(order);
	await sendConfirmationEmail(order);
}
```

Fan-out আপনাকে দেয়:

- প্রতি item-এ independent retry (একটি খারাপ order অন্যগুলোকে block করে না)
- Parallelism (অনেক worker একসাথে child সামলায়)
- Progress visibility (প্রতি child-এর completed/failed count দেখা)

## Flow Control: Job Dependency

BullMQ Flow আপনাকে automatic progression সহ parent-child job tree সংজ্ঞায়িত করতে দেয়:

```typescript
import { FlowProducer } from 'bullmq';

const flowProducer = new FlowProducer({ connection });

// Parent runs only after all children complete
await flowProducer.add({
	name: 'generate-invoice',
	queueName: 'invoicing',
	data: { invoiceId: 'inv_123' },
	children: [
		{
			name: 'fetch-line-items',
			queueName: 'data',
			data: { invoiceId: 'inv_123' }
		},
		{
			name: 'calculate-tax',
			queueName: 'data',
			data: { invoiceId: 'inv_123' }
		},
		{
			name: 'apply-discounts',
			queueName: 'data',
			data: { invoiceId: 'inv_123' }
		}
	]
});

// Parent handler receives results from all children
const invoicingWorker = new Worker('invoicing', async (job) => {
	const childResults = await job.getChildrenValues();
	// childResults: { 'fetch-line-items': [...], 'calculate-tax': {...}, ... }

	const invoice = buildInvoice(childResults);
	await db.invoices.update(job.data.invoiceId, invoice);
});
```

## Worker-এ Rate Limiting

external API-তে বারবার আঘাত ঠেকান:

```typescript
import { RateLimiter } from 'limiter';

// 10 requests per second to external API
const rateLimiter = new RateLimiter({ tokensPerInterval: 10, interval: 'second' });

const worker = new Worker(
	'api-sync',
	async (job) => {
		await rateLimiter.removeTokens(1); // blocks until token available
		await externalApi.sync(job.data);
	},
	{ connection, concurrency: 20 }
); // 20 concurrent, but rate-limited to 10/s
```

BullMQ queue-level rate limiting-ও সাপোর্ট করে:

```typescript
const worker = new Worker('api-sync', handler, {
	connection,
	limiter: {
		max: 10, // max 10 jobs
		duration: 1000 // per 1000ms
	}
});
```

## Worker Health মনিটরিং

```typescript
// Emit metrics for each job
worker.on('completed', (job, result) => {
	metrics.histogram('job.duration', Date.now() - job.processedOn!, {
		type: job.name
	});
	metrics.increment('job.completed', { type: job.name });
});

worker.on('failed', (job, err) => {
	metrics.increment('job.failed', { type: job?.name ?? 'unknown' });
	logger.error({ jobId: job?.id, error: err.message, type: job?.name }, 'Job failed');
});

// Stalled job detection (BullMQ auto-detects these)
worker.on('stalled', (jobId) => {
	logger.warn({ jobId }, 'Job stalled — worker may have crashed mid-job');
	metrics.increment('job.stalled');
});
```

**মূল প্রোডাকশন metric:**

- প্রতি job type-এ `job.duration` p50/p95/p99
- `job.completed` ও `job.failed` rate
- প্রতি queue-তে queue depth (waiting count)
- Worker active count বনাম concurrency limit
- Stalled job count

## প্রোডাকশন চেকলিস্ট

```
□ Graceful shutdown on SIGTERM — drain active jobs before exit
□ terminationGracePeriodSeconds >= max job duration + buffer
□ Concurrency tuned per job type (I/O vs CPU bound)
□ Priority queues for time-sensitive vs bulk jobs
□ DLQ configured — failed jobs held for inspection, not silently dropped
□ Job payloads small — store large data in S3/DB, pass ID in job
□ Sensitive data not stored in job payloads (logs and UIs expose them)
□ Metrics exported: duration, throughput, error rate, queue depth
□ Alert on: queue depth spike, sustained failure rate, stalled jobs
□ Worker restarts don't lose jobs (queue is the source of truth)
□ Idempotency tested for all job handlers
□ Job timeouts set (don't let a job hang forever)
```

**Job payload size-এর নিয়ম:**

```typescript
// WRONG — large payload in queue
await queue.add('process-upload', {
	fileContents: Buffer.from(file).toString('base64') // MB of data
});

// RIGHT — store large data separately, pass reference
const s3Key = await s3.upload(file);
await queue.add('process-upload', { s3Key }); // tiny payload
```

Job payload Redis/Postgres-এ থাকে — সেগুলো ছোট রাখুন। 1KB-এর নিচে রাখার চেষ্টা করুন। বেশি লাগলে সেটা S3-তে বা একটি DB টেবিলে রাখুন এবং ID দিয়ে reference করুন।
