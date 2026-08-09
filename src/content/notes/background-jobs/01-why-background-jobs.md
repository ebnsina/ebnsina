---
title: 'Why Background Jobs'
subtitle: 'কী job queue-তে থাকা উচিত, কী request cycle-এ থাকা উচিত, এবং দুটো মেশালে কেন দুটোই ভেঙে পড়ে।'
chapter: 1
level: 'beginner'
readingTime: '7 মিনিট'
topics: ['background jobs', 'queues', 'async processing', 'request lifecycle']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব উদাহরণ**

একটি রেস্তোরাঁর রান্নাঘর: ওয়েটার আপনার অর্ডার নিয়ে সঙ্গে সঙ্গে সেটা কনফার্ম করে — শেফ আপনার খাবার রান্না করার সময়টা সে দাঁড়িয়ে থাকে না। অর্ডার রান্নাঘরে (একটি queue) চলে যায়, আর ওয়েটার আরও অর্ডার নিতে ফিরে যায়। Background job হলো সেই রান্নাঘর।

</Callout>

## গল্পে বুঝি

ইবনে সিনা এক বিকেলে ফটো স্টুডিওতে গেলেন এক রোল ফিল্ম ডেভেলপ করাতে। কাউন্টারে বসা আল-খোয়ারিজমি ফিল্মের রোলটা হাতে নিয়ে একটা নম্বর লেখা টোকেন ধরিয়ে দিলেন — "সন্ধ্যায় আসেন, প্রিন্ট রেডি থাকবে।" ইবনে সিনাকে কাউন্টারে দাঁড়িয়ে ঘণ্টার পর ঘণ্টা ফিল্ম ডেভেলপ হওয়া দেখতে হলো না; টোকেন নিয়ে তিনি সঙ্গে সঙ্গে বেরিয়ে গিয়ে নিজের বাকি কাজ সেরে ফেললেন।

এদিকে স্টুডিওর পেছনের ঘরে টেকনিশিয়ান ফাতিমা আল-ফিহরি ধীরেসুস্থে ফিল্মটা ডেভেলপ করছেন — এই ধীর কাজটা সামনের কাউন্টারকে একটুও আটকে রাখেনি, তাই লাইনের পরের গ্রাহকও দ্রুত টোকেন পেয়ে গেলেন। সন্ধ্যায় ইবনে সিনা ফিরে এসে টোকেন দেখিয়ে তাঁর তৈরি হয়ে যাওয়া প্রিন্টগুলো নিয়ে গেলেন।

এই গল্পটাই **background job**। ফিল্ম জমা দিয়ে সঙ্গে সঙ্গে টোকেন নিয়ে বেরিয়ে যাওয়া হলো ইউজারকে instant response ফেরত দেওয়া — ধীর কাজটাকে request path থেকে সরিয়ে দেওয়া। পেছনের ঘরের ডেভেলপিং হলো async-এ চলা সেই slow work, আর টেকনিশিয়ান হলেন background worker; সন্ধ্যায় প্রিন্ট নিতে আসা মানে পরে গিয়ে ফলাফল সংগ্রহ করা। বাস্তবে welcome email পাঠানো, upload করা image resize করা, বা মাসিক report generate করা — এগুলো ঠিক এভাবেই queue-তে দিয়ে দেওয়া হয় যাতে request সঙ্গে সঙ্গে respond করে আর worker পেছনে কাজটা সেরে ফেলে।

## সবকিছু Request-এর মধ্যে করার সমস্যা

একটি সাধারণ HTTP request কয়েকশো মিলিসেকেন্ডের মধ্যে respond করা উচিত। এর চেয়ে ধীর কিছু ইউজার টের পেয়ে যায়। কিন্তু অনেক বাস্তব অপারেশন এর চেয়ে বেশি সময় নেয়: email পাঠানো, image resize করা, third-party API-র সাথে sync করা, PDF তৈরি করা, upload প্রসেস করা।

ধীর কাজ inline করার দুটো failure mode আছে:

1. **Timeout:** Request-এ বেশি সময় লাগে, client disconnect হয়ে যায়, কাজ অর্ধেক হয়ে থাকে।
2. **Backpressure:** ধীর request-গুলো জমতে থাকে, আপনার server-এর connection pool শেষ করে ফেলে এবং বাকি সবকিছুকে ধীর করে দেয়।

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

email provider ধীর হলে প্রতিটি registration ধীর হয়। সেটা down থাকলে registration একদম fail করে — যদিও user সফলভাবে তৈরি হয়ে গিয়েছিল।

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

## কী Queue-তে যায়

**ভালো candidate:**

- Email/SMS notification
- Image/video প্রসেসিং (resize, transcode)
- PDF তৈরি
- Third-party API call (Stripe, Twilio, Salesforce)
- Search index update
- Report তৈরি
- Webhook delivery
- Data export/import
- Cache warming
- Cleanup task (expired session, soft-deleted record মুছে ফেলা)

**খারাপ candidate:**

- এমন data যার উপর response নির্ভর করে (user-এর সাথে সাথে ফলাফল দরকার)
- ছোট অপারেশন (&lt;10ms) — queue-এর overhead-ই কাজের চেয়ে বেশি হয়ে যায়
- এমন অপারেশন যার request-এর সাথে transactional consistency দরকার

পরীক্ষাটা হলো: "respond করার আগে user-এর কি এই ফলাফলটা দরকার?" হ্যাঁ হলে inline করুন। না হলে queue-তে দিন।

## একটি Job-এর গঠন

```typescript
interface Job<T = unknown> {
	id: string; // unique identifier
	type: string; // what kind of work to do
	data: T; // input for the worker
	attempts: number; // how many times we've tried
	maxAttempts: number; // give up after this many failures
	delay: number; // wait this many ms before first attempt
	priority: number; // higher = picked first
	createdAt: Date;
	scheduledAt: Date; // when to run (allows delayed jobs)
}

interface JobResult {
	success: boolean;
	output?: unknown;
	error?: string;
	duration: number; // ms
}
```

## Worker Architecture

Worker হলো এমন process (বা thread) যারা queue থেকে job টেনে নিয়ে সেগুলো execute করে:

```typescript
// Single worker — processes one job at a time
class Worker {
	constructor(
		private queue: Queue,
		private handlers: Map<string, JobHandler>
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
const worker = new Worker(
	queue,
	new Map([
		['send-welcome-email', sendWelcomeEmailHandler],
		['notify-slack', notifySlackHandler],
		['sync-crm', syncCrmHandler]
	])
);
```

## Worker Scale করা

Worker stateless — আপনার queue ও database যতগুলো সাপোর্ট করে ততগুলো চালাতে পারেন:

```
Queue (Redis or Postgres)
     ↓           ↓           ↓
 Worker 1    Worker 2    Worker 3
```

প্রতিটি worker পরের available job তুলে নেয়। Horizontal scaling মানে শুধু আরও বেশি worker process চালু করা। আপনার web server থেকে আলাদাভাবে worker scale করুন — email job-এ হঠাৎ spike এলে API tier-এ হাত না দিয়েই আরও email worker চালু করুন।

## একটি Worker-এর ভেতরে Concurrency

একটি single worker process একসাথে একাধিক job parallel-এ চালাতে পারে:

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

কাজের ধরন অনুযায়ী concurrency মেলান: I/O-bound job (network call) অনেকগুলো parallel-এ চলতে পারে; CPU-bound job কোরের সংখ্যার মধ্যে সীমিত রাখা উচিত।

## Queue Backend বাছাই করা

| Backend              | Pros                               | Cons                      | Best for                             |
| -------------------- | ---------------------------------- | ------------------------- | ------------------------------------ |
| Redis (Bull/BullMQ)  | দ্রুত, feature-rich, দারুণ tooling | অতিরিক্ত infra dependency | High throughput, real-time           |
| PostgreSQL (pg-boss) | অতিরিক্ত infra নেই, ACID guarantee | Redis-এর চেয়ে ধীর        | যারা আগে থেকেই Postgres ব্যবহার করছে |
| In-memory            | Zero infra                         | restart-এ হারিয়ে যায়    | শুধু dev/test                        |
| SQS/Cloud queue      | Managed, durable                   | খরচ, cold start           | AWS-native app                       |

আপনি যদি আগে থেকেই Postgres চালাচ্ছেন এবং sub-second job pickup না লাগে, তাহলে **pg-boss** হলো ব্যবহারিক পছন্দ — Redis চালানোর ঝামেলা নেই। High throughput বা real-time job processing দরকার হলে Redis-এ **BullMQ**।
