---
title: 'Worker Patterns & Production'
subtitle: 'Graceful shutdown, concurrency limits, priority queues, fan-out, and the operational checklist for running jobs in production.'
chapter: 6
level: 'advanced'
readingTime: '10 min'
topics: ['graceful shutdown', 'priority queues', 'fan-out', 'worker pools', 'production']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A hospital triage system: incoming patients aren't handled first-come-first-served — critical cases go immediately to surgery while routine checkups wait. A patient being treated mid-examination isn't abandoned when shift changes — care continues until a clean handoff. Production workers need the same: priority handling and graceful handoffs.

</Callout>

## Graceful Shutdown

Workers must finish their current jobs before stopping. An abrupt shutdown (SIGKILL) mid-job leaves your data in an inconsistent state.

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

**Container deployment:** Set `terminationGracePeriodSeconds` in Kubernetes to be longer than your longest expected job:

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

## Priority Queues

Some jobs are more urgent than others. Implement multiple queues with dedicated workers per priority tier, or use BullMQ's built-in priority:

**Multiple queues (explicit control):**

```typescript
const criticalQueue = new Queue('critical', { connection });
const defaultQueue = new Queue('default', { connection });
const bulkQueue = new Queue('bulk', { connection });

// More workers on critical queue
const criticalWorker = new Worker('critical', handler, { connection, concurrency: 20 });
const defaultWorker = new Worker('default', handler, { connection, concurrency: 5 });
const bulkWorker = new Worker('bulk', handler, { connection, concurrency: 2 });
```

**BullMQ priority (single queue, ordered by priority value):**

```typescript
// Lower number = higher priority
await queue.add('send-alert', { userId }, { priority: 1 }); // picked first
await queue.add('send-report', { userId }, { priority: 10 });
await queue.add('sync-data', { userId }, { priority: 100 }); // picked last
```

BullMQ priority uses sorted sets — workers always pick the lowest-priority-number job next. This works well but can starve lower-priority jobs during sustained high load. For that, use weighted round-robin across multiple queues instead.

## Fan-Out Pattern

One job spawns many child jobs. Useful for bulk operations where you want per-item retries and concurrency:

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

Fan-out gives you:

- Independent retry per item (one bad order doesn't block others)
- Parallelism (many workers handle children simultaneously)
- Progress visibility (see completed/failed counts per child)

## Flow Control: Job Dependencies

BullMQ Flows let you define parent-child job trees with automatic progression:

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

## Rate Limiting Workers

Prevent hammering external APIs:

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

BullMQ also supports queue-level rate limiting:

```typescript
const worker = new Worker('api-sync', handler, {
	connection,
	limiter: {
		max: 10, // max 10 jobs
		duration: 1000 // per 1000ms
	}
});
```

## Worker Health Monitoring

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

**Key production metrics:**

- `job.duration` p50/p95/p99 per job type
- `job.completed` and `job.failed` rates
- Queue depth (waiting count) per queue
- Worker active count vs concurrency limit
- Stalled job count

## Production Checklist

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

**Job payload size discipline:**

```typescript
// WRONG — large payload in queue
await queue.add('process-upload', {
	fileContents: Buffer.from(file).toString('base64') // MB of data
});

// RIGHT — store large data separately, pass reference
const s3Key = await s3.upload(file);
await queue.add('process-upload', { s3Key }); // tiny payload
```

Job payloads live in Redis/Postgres — keep them small. Aim for under 1KB. If you need more, store it in S3 or a DB table and reference it by ID.
