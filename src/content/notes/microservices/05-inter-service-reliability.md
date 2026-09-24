---
title: 'Inter-Service Reliability'
subtitle: 'Timeouts, retries, circuit breakers, আর bulkheads — যে pattern গুলো একটা slow service-কে পুরো outage-এ cascade হওয়া থেকে ঠেকায়।'
chapter: 5
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['circuit breaker', 'retry', 'timeout', 'bulkhead', 'resilience', 'cascading failure']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমার একটা রেস্টুরেন্ট, আর তার সিগনেচার ডিশটার জন্য একটা বিশেষ পনির দরকার — যেটা আসে বাইরের একটা supplier থেকে। এক সন্ধ্যায় সেই supplier-এর ডেলিভারি দেরি করতে শুরু করল। ফাতিমা কিন্তু হাঁ করে সারা রাত বসে থাকে না; সে ঠিক করে রেখেছে ডেলিভারির জন্য বড়জোর দশ মিনিট অপেক্ষা করবে, এর বেশি নয়। সময় পেরিয়ে গেলে সে ধরে নেয় এবারের অর্ডার আসেনি, আর আবার ফোন করে অর্ডার দেয়। প্রথমবার না হলে সে সঙ্গে সঙ্গে হুড়মুড় করে দশবার ফোন করে না — একবার দিয়ে একটু অপেক্ষা করে, না হলে আর একটু বেশি অপেক্ষা করে, ধীরে ধীরে ধৈর্যের সময় বাড়িয়ে আবার চেষ্টা করে।

কিন্তু কয়েকবার চেষ্টার পর যখন বোঝা গেল supplier-টার গুদাম আজ পুরোপুরি বন্ধ, ফাতিমা প্রতিটা অর্ডারের সময় ওদের ফোন করে করে সময় নষ্ট করা বন্ধ করে দিল — কিছুক্ষণের জন্য ওই supplier-কে সে তালিকা থেকেই বাদ রাখল, মাঝেমধ্যে শুধু একবার দেখে নেয় ওরা আবার চালু হয়েছে কিনা। এদিকে রান্নাঘর তো থেমে থাকতে পারে না — তাই সে একটা backup supplier-এর কাছ থেকে আনা বিকল্প পনির দিয়ে কাছাকাছি একটা ডিশ বানিয়ে খদ্দেরদের খাওয়াতে থাকল। খদ্দেররা টেবিলে খাবার পেল, রেস্টুরেন্ট চলতে থাকল।

এই গল্পটাই inter-service reliability। ডেলিভারির জন্য শুধু দশ মিনিট অপেক্ষা করাটা হলো request **timeout**; প্রথমবার না হলে ধৈর্যের সময় বাড়িয়ে আবার অর্ডার দেওয়াটা হলো **retry with backoff**; স্পষ্টতই বন্ধ supplier-কে বারবার ফোন করা থামিয়ে দেওয়াটা হলো **circuit breaker** open হয়ে যাওয়া; আর backup supplier-এর বিকল্প ডিশটাই হলো **fallback** — যা খদ্দেরদের খাওয়ানো চালু রাখে, মানে একটা supplier-এর ব্যর্থতাকে পুরো রেস্টুরেন্টের বন্ধ হয়ে যাওয়ায়, অর্থাৎ **cascading failure**-এ পরিণত হতে দেয় না। বাস্তবেও ঠিক এভাবেই একটা service অন্য service-কে call করার সময় timeout, retry, circuit breaker আর fallback দিয়ে নিজেকে বাঁচায় — যাতে একটা slow বা down হওয়া service গোটা system-কে টেনে না নামায়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা বাড়ির electrical panel-এর circuit breaker: যখন একটা circuit overload হয়, breaker trip করে — শুধু ওই circuit-এর power কেটে দেয়, বাকি বাড়িটাকে রক্ষা করে। breaker ছাড়া, একটা ত্রুটিপূর্ণ appliance পুরো system উড়িয়ে দিতে পারত। fault দূর হওয়ার পর breaker রক্ষা করতে "open" হয়, তারপর আবার "close" হয়।

</Callout>

## Cascading Failure-এর সমস্যা

Service A, Service B-কে call করে। Service B slow হয়ে যায় (database সমস্যা)। Service A-র request thread গুলো B-এর জবাবের অপেক্ষায় জমতে থাকে। Service A-র thread pool নিঃশেষ হয়ে যায়। Service A client-দের 503 ফেরত দিতে শুরু করে। Service C (যা A-কে call করে) fail করতে শুরু করে। Service B-এর database সমস্যা Service A আর C-কে নামিয়ে ফেলেছে।

এটা একটা cascading failure — microservices-এ সবচেয়ে সাধারণ failure mode। এটা ঘটে কারণ slow হওয়া down হওয়ার চেয়ে খারাপ: একটা down service সাথে সাথে connection refused দেয়; একটা slow service connection গুলো time out না হওয়া পর্যন্ত খোলা রাখে।

## Timeouts — প্রথম প্রতিরক্ষা

প্রতিটা external call-এর একটা timeout থাকতেই হবে। কোনো ব্যতিক্রম নেই।

```typescript
// Without timeout — hangs indefinitely
const response = await fetch('http://payment-service/charge');

// With timeout — fails fast
const response = await fetch('http://payment-service/charge', {
	signal: AbortSignal.timeout(5000) // 5 second hard limit
});
```

**gRPC deadline propagation:**

```typescript
// Client sets a deadline for the entire call chain
const { order } = await client.createOrder({ customerId, items }, { timeoutMs: 10_000 });
```

gRPC deadline গুলো downstream-এ propagate করে — যদি Order 10s deadline সহ Payment-কে call করে, Payment জানে এর হাতে complete করতে শুধু (10s - time_elapsed) আছে। যে কাজ ব্যবহার হবে না তা করার বদলে এটা আগেই হাল ছেড়ে দিতে পারে।

**Timeout budget:** upstream timeout-টা downstream timeout chain-এর চেয়ে দীর্ঘ করে সেট করুন। যদি Order → Payment → Stripe, তাহলে সেট করুন:

- Stripe: 5s
- Payment service timeout: 6s (Stripe + সামান্য buffer)
- Order service timeout: 8s (Payment + buffer)
- Client timeout: 10s

## Retries — শুধু যেখানে নিরাপদ

শুধু idempotent operation-এ retry করুন, আর শুধু নির্দিষ্ট error code-এ।

```typescript
async function withRetry<T>(
	fn: () => Promise<T>,
	opts: { retries: number; delay: number; retryOn: number[] }
): Promise<T> {
	let lastError: Error;

	for (let attempt = 0; attempt <= opts.retries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err as Error;

			// Only retry on specified status codes
			const status = (err as any).code;
			if (!opts.retryOn.includes(status)) throw err;

			if (attempt < opts.retries) {
				// Exponential backoff with jitter
				const backoff = opts.delay * 2 ** attempt;
				const jitter = Math.random() * backoff * 0.2;
				await sleep(backoff + jitter);
			}
		}
	}

	throw lastError!;
}

// Only retry on transient errors (UNAVAILABLE, DEADLINE_EXCEEDED)
// Never retry on INVALID_ARGUMENT, NOT_FOUND, PERMISSION_DENIED
const order = await withRetry(() => client.getOrder({ orderId }), {
	retries: 3,
	delay: 100,
	retryOn: [Code.Unavailable, Code.DeadlineExceeded]
});
```

**কখনো retry করবেন না:**

- Non-idempotent operation (একটা card charge করা — retry = double charge)
- `INVALID_ARGUMENT` — retry করলে খারাপ input ঠিক হবে না
- `PERMISSION_DENIED` — retry করলে permission মিলবে না
- যখন আপনি ইতিমধ্যে deadline ছাড়িয়ে গেছেন — retry আরও budget পোড়ায়

## Circuit Breaker

N বার failure-এর পর, চেষ্টা বন্ধ করুন আর দ্রুত fail করুন। Service recover করেছে কিনা দেখতে পর্যায়ক্রমে probe করুন।

```typescript
type CircuitState = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
	private state: CircuitState = 'closed';
	private failures = 0;
	private lastFailureTime = 0;

	constructor(
		private readonly threshold: number = 5,
		private readonly cooldownMs: number = 30_000,
		private readonly halfOpenRequests: number = 1
	) {}

	async call<T>(fn: () => Promise<T>): Promise<T> {
		if (this.state === 'open') {
			const elapsed = Date.now() - this.lastFailureTime;
			if (elapsed < this.cooldownMs) {
				throw new Error('Circuit breaker OPEN — service unavailable');
			}
			this.state = 'half-open';
		}

		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (err) {
			this.onFailure();
			throw err;
		}
	}

	private onSuccess() {
		this.failures = 0;
		this.state = 'closed';
	}

	private onFailure() {
		this.failures++;
		this.lastFailureTime = Date.now();
		if (this.failures >= this.threshold) {
			this.state = 'open';
		}
	}

	get currentState() {
		return this.state;
	}
}

// Per-service circuit breaker
const paymentBreaker = new CircuitBreaker(5, 30_000);

async function chargePayment(order: Order) {
	return paymentBreaker.call(() => paymentClient.charge(order));
}
```

Production-এ, `opossum` (Node.js) বা `Resilience4j` (JVM) ব্যবহার করুন — এগুলো metrics, event, আর fallback support যোগ করে:

```typescript
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(paymentClient.charge.bind(paymentClient), {
	timeout: 5000, // trigger failure if call takes > 5s
	errorThresholdPercentage: 50, // open when 50% of calls fail
	resetTimeout: 30000, // try again after 30s
	volumeThreshold: 10 // minimum calls before tripping
});

breaker.fallback(() => ({ status: 'pending', message: 'Payment queued for retry' }));
breaker.on('open', () => metrics.increment('circuit_breaker.payment.opened'));
breaker.on('close', () => metrics.increment('circuit_breaker.payment.closed'));

const result = await breaker.fire(order);
```

## Bulkheads

প্রতিটা downstream service-এ আপনি কতগুলো concurrent call করবেন সীমিত করুন। payment service যদি slow হয়ে যায়, এটা শুধু নিজের connection pool নিঃশেষ করতে পারবে — পুরো application-এরটা নয়।

```typescript
import pLimit from 'p-limit';

// Max 20 concurrent calls to payment service
const paymentLimit = pLimit(20);

// Max 10 concurrent calls to inventory service
const inventoryLimit = pLimit(10);

async function processOrder(order: Order) {
	const [payment, inventory] = await Promise.all([
		paymentLimit(() => paymentClient.charge(order)),
		inventoryLimit(() => inventoryClient.reserve(order.items))
	]);
}
```

Bulkhead ছাড়া: payment service slow হলে আর 1000টা order এলে, 1000টা thread/promise payment-এর জন্য অপেক্ষা করছে। Application-এর অন্য কোনো request-এর জন্য কোনো capacity নেই।

Bulkhead সহ: শুধু 20টা request payment-এর জন্য অপেক্ষা করছে। বাকি 980টা দ্রুত fail করে (queue full)। Application-এর বাকি অংশ কাজ করতে থাকে।

**Bulkhead হিসেবে connection pool:**

```typescript
// pg (postgres) — built-in pool
const db = new Pool({
	connectionString: DATABASE_URL,
	max: 20, // max 20 concurrent queries
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 3000 // fail fast if pool full
});
```

## Hedged Requests

Latency-critical path-এর জন্য: একই request দুটো instance-এ সমান্তরালে পাঠান, যেটা আগে জবাব দেয় সেটা ব্যবহার করুন।

```typescript
async function hedgedRequest<T>(
	requests: Array<() => Promise<T>>,
	hedgeAfterMs: number
): Promise<T> {
	return new Promise((resolve, reject) => {
		const errors: Error[] = [];
		let settled = false;

		const settle = (result: T | Error) => {
			if (settled) return;
			settled = true;
			if (result instanceof Error) reject(result);
			else resolve(result);
		};

		// First request
		requests[0]()
			.then(settle)
			.catch((err) => {
				errors.push(err);
				if (errors.length === requests.length) settle(errors[0]);
			});

		// Hedge: if first request isn't done in hedgeAfterMs, start second
		setTimeout(() => {
			if (settled) return;
			requests[1]?.()
				.then(settle)
				.catch((err) => {
					errors.push(err);
					if (errors.length === requests.length) settle(errors[0]);
				});
		}, hedgeAfterMs);
	});
}

// Usage: hedge after 100ms (P99 latency)
const order = await hedgedRequest(
	[() => client1.getOrder({ orderId }), () => client2.getOrder({ orderId })],
	100
);
```

Hedging কম tail latency-র বিনিময়ে বাড়তি load (2x পর্যন্ত) নেয়। শুধু read-এর জন্য ব্যবহার করুন।

## সব একসাথে জোড়া

একটা production inter-service call-এ সব layer থাকে:

```typescript
const paymentBreaker = new CircuitBreaker(5, 30_000);
const paymentLimit = pLimit(20);

async function chargePayment(order: Order): Promise<Payment> {
	// Bulkhead: max 20 concurrent
	return paymentLimit(async () => {
		// Circuit breaker: fail fast if service is down
		return paymentBreaker.call(async () => {
			// Timeout: never hang indefinitely
			const signal = AbortSignal.timeout(5_000);

			// Retry: only on transient errors, with backoff
			return withRetry(() => paymentClient.charge(order, { signal }), {
				retries: 2,
				delay: 200,
				retryOn: [Code.Unavailable]
			});
		});
	});
}
```

প্রতিটা layer একটা ভিন্ন failure mode সামলায়:

- **Timeout:** অনির্দিষ্টকালের blocking ঠেকায়
- **Retry:** transient failure সামলায়
- **Circuit breaker:** একটা fail হওয়া service-কে বারবার আঘাত করা ঠেকায়
- **Bulkhead:** একটা slow service-এর blast radius সীমিত করে
