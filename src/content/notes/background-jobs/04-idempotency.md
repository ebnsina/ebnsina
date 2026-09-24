---
title: 'Idempotency'
subtitle: 'Job এমনভাবে ডিজাইন করুন যাতে দুবার চালানো একবার চালানোর সমান হয় — কারণ at-least-once delivery নিশ্চিত করে যে আপনি সেগুলো দুবার চালাবেন।'
chapter: 4
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['idempotency', 'at-least-once', 'exactly-once', 'deduplication', 'distributed systems']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

পুরনো ঢাকার এক পাড়ায় বিল আদায় করেন খোয়ারিজমি। প্রতিটা বিলের গায়ে আগে থেকেই একটা ইউনিক নম্বর ছাপানো থাকে। কারও বিল আদায় হয়ে গেলেই তিনি ঠিক ওই নম্বরসহ বিলটার গায়ে লাল কালিতে "PAID" সিল মেরে দেন, আর নিজের খাতায় নম্বরটা টুকে রাখেন — অমুক নম্বরের বিল আদায় হয়ে গেছে। কাজটা এক সেকেন্ডেই শেষ।

এখন হয় কী, ডাক-ব্যবস্থার গোলমালে বা গ্রাহকের ভুলে একই নম্বরের বিলের একটা ডুপ্লিকেট কপি আবার তাঁর হাতে চলে আসে, কিংবা ফাতিমা নিজের পুরনো বিলটা নিয়ে আরেকবার হাজির হন। খোয়ারিজমি টাকা চাওয়ার আগে খাতা আর সিলটা এক নজর দেখে নেন — নম্বরটা তো আগেই "PAID" হয়ে আছে! তাই তিনি আর টাকা নেন না, ভদ্রভাবে বলেন "এটা তো মিটে গেছে"। বিল যতবারই ঘুরে আসুক, গ্রাহকের পকেট থেকে টাকা যায় ঠিক একবারই।

এই গল্পটাই আসলে **idempotency**। বিলের ইউনিক নম্বর হলো **idempotency key**, খাতায় "PAID" টুকে রাখাটা হলো এই key-র job একবার চলে গেছে সেটা রেকর্ড করা, আর ডুপ্লিকেট চিনে টাকা না নেওয়াটাই **dedup** — মানে একই job আবার চললেও ফলাফল একবার চালানোর সমানই থাকে (same effect on re-run), কারও ডাবল-চার্জ হয় না। বাস্তবে queue-গুলো **at-least-once** delivery দেয় বলে retry-তে একই job দুবার-তিনবার চলতেই পারে; তাই Stripe-এ payment করা বা welcome email পাঠানোর মতো কাজে আগে থেকেই একটা idempotency key দিয়ে "এটা কি আগেই হয়েছে?" চেক করে নিলে দুবার চললেও গ্রাহক ঠিক একবারই চার্জ হন।

<Callout type="info">

**বাস্তব উদাহরণ**

একটি এলিভেটরের বোতাম: একবার চাপলে এলিভেটর আসে। আরও পাঁচবার চাপলে বাড়তি কিছু হয় না — এলিভেটর তখনো ঠিক একবারই আসে। এটাই idempotency: একটি অপারেশন বারবার প্রয়োগ করলে যে ফলাফল হয়, একবার প্রয়োগ করলেও সেই একই ফলাফল হয়।

</Callout>

## At-Least-Once Delivery

বেশিরভাগ queue system **at-least-once delivery** গ্যারান্টি দেয় — একটি job অন্তত একবার চলবে, কিন্তু বেশিবারও চলতে পারে। এটা ঘটে যখন:

- একটি worker একটি job প্রসেস করে এবং completion acknowledge করার আগেই crash করে
- একটি long-running job-এর সময় queue-এর heartbeat time out হয়
- Network partition-এর কারণে queue এমন একটি job আবার deliver করে যা worker আগেই প্রসেস করেছে
- একটি bug-এর কারণে queue এমন একটি job retry করে যা আসলে সফল হয়েছিল

উল্লেখযোগ্য coordination overhead ছাড়া distributed system-এ আপনি এটা ঠেকাতে পারবেন না। ব্যবহারিক পন্থা: at-least-once delivery মেনে নিন এবং idempotent handler লিখুন।

**Exactly-once** delivery তাত্ত্বিকভাবে সম্ভব কিন্তু ব্যয়বহুল — এর জন্য queue ও আপনার application state জুড়ে distributed transaction দরকার, যার উল্লেখযোগ্য performance খরচ আছে। বেশিরভাগ use case-এর জন্য at-least-once + idempotency-ই সঠিক trade।

## অপারেশনকে Idempotent বানানো

প্যাটার্নটা হলো: কাজটা করার আগে চেক করুন সেটা আগেই হয়ে গেছে কিনা, অথবা duplicate ঠেকাতে database-এর conflict handling ব্যবহার করুন।

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

**Pattern 3: External API-র সাথে idempotency key**

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

বেশিরভাগ ভালোভাবে ডিজাইন করা API idempotency key নেয় — Stripe, Twilio, Braintree, এবং আরও অনেকে। একটি API একাধিকবার call করা নিরাপদ ধরে নেওয়ার আগে docs চেক করুন।

## Enqueue করার সময় Deduplication

একই logical job যাতে queue-তে একাধিকবার যুক্ত না হয় তা ঠেকান:

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

enqueue অপারেশনটাই retry হলে (যেমন client retry-র কারণে আপনার API handler দুবার চললে) এটি queue-তে duplicate job জমা হওয়া ঠেকায়।

## Stable Idempotency Key হিসেবে Job ID

Job ID retry জুড়ে stable — প্রতিটি attempt-এ worker-কে একই job object দেওয়া হয়। কাজ হয়ে গেছে কিনা track করতে job ID ব্যবহার করুন:

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

## Non-Idempotent অপারেশন ও Fencing

কিছু অপারেশন স্বভাবতই non-idempotent (dedup API নেই এমন email send, webhook delivery)। duplicate execution ঠেকাতে একটি **fencing token** ব্যবহার করুন:

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

## Idempotency-র জন্য Testing

idempotency-কে আপনার test suite-এর অংশ বানান:

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

এই test-গুলো একটি সত্যিকারের database-এর বিপরীতে চালান (mock নয়) — idempotency logic-এ প্রায়ই upsert ও conflict handling জড়িত থাকে, যা শুধু সত্যিকারের SQL semantics-এই কাজ করে।
