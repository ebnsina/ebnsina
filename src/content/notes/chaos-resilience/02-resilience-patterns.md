---
title: 'Resilience Patterns'
subtitle: 'Timeouts, retries, circuit breakers, bulkheads, এবং graceful degradation — সেই বিল্ডিং ব্লক যা failure-কে আটকে রাখে।'
chapter: 2
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['circuit breaker', 'bulkhead', 'timeout', 'retry', 'graceful degradation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import RetryStormSim from '$lib/components/content/RetryStormSim.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

জাহাজের watertight compartment: যদি একটা অংশে পানি ঢুকে যায়, bulkhead সেই পানিকে ওই compartment-এই আটকে রাখে। জাহাজ চলতে থাকে। Compartment না থাকলে একটা ছিদ্রই সবকিছু ডুবিয়ে দেয়। Resilience patterns হলো আপনার সিস্টেমের watertight compartment।

</Callout>

## গল্পে বুঝি

সিনার পুরনো বাড়িতে একদিন রান্নাঘরের একটা তারে শর্ট সার্কিট হলো। আগের আমলে হলে হয়তো পুরো বাড়িতে আগুন ধরে যেত। কিন্তু ফাতিমা নামের ইলেকট্রিশিয়ান বছরখানেক আগে বাড়ির মেইন বোর্ডে একটা circuit breaker বসিয়ে গিয়েছিলেন। শর্ট হওয়ার সাথে সাথে breaker টিক করে ট্রিপ করল — ওই লাইনে বিদ্যুৎ যাওয়া পুরো বন্ধ করে দিল। কিছুক্ষণ পর তার ঠান্ডা হলে, সিনা breaker আবার তুলে দেখলেন সব ঠিক কিনা; ঠিক থাকলে লাইন আবার চালু, না হলে আবার ট্রিপ।

মজার ব্যাপার হলো, রান্নাঘরের এই গোলমালে বেডরুম বা পড়ার ঘরের বাতি একটুও নেভেনি — কারণ ফাতিমা প্রতিটা ঘরের জন্য আলাদা আলাদা fuse বসিয়েছিলেন। এক ঘরের সমস্যা অন্য ঘরে ছড়ায় না। আর যে কয়েক সেকেন্ড ওই লাইন বন্ধ ছিল, তখনও সিনা অন্ধকারে পড়েননি — দেয়ালে বসানো emergency lantern মেইন বিদ্যুৎ বন্ধ হতেই নিজে থেকে জ্বলে উঠেছিল। পূর্ণ আলো নয়, কিন্তু কাজ চালানোর মতো যথেষ্ট।

এই বাড়ির নিরাপত্তা ব্যবস্থাটাই আসলে এই chapter-এর resilience patterns। শর্ট হওয়া লাইনে বিদ্যুৎ কেটে recover করার সময় দেওয়া breaker হলো **circuit breaker** — একটা fail করা dependency-কে বারবার call না করে কিছুক্ষণ থামিয়ে রাখা। প্রতি ঘরের আলাদা fuse হলো **bulkhead** isolation — এক resource pool ডুবলেও বাকিগুলো বাঁচে। আর মেইন গেলে জ্বলে ওঠা lantern হলো **fallback** তথা graceful degradation — মূল সেবা না পেলে একটা কম-ক্ষমতার কিন্তু কার্যকর বিকল্প। breaker আবার তোলার আগে তার ঠান্ডা হওয়ার অপেক্ষা করাটা **timeout**, আর ঠিক আছে কিনা দেখতে দুয়েকবার চেষ্টা করাটা **retry**। বাস্তবে payment বা database service fail করলে ঠিক এভাবেই — circuit breaker, bulkhead pool আর fallback response দিয়ে — পুরো সিস্টেমকে "আগুন ধরে যাওয়া" থেকে বাঁচানো হয়।

## Timeouts: ভিত্তি

প্রতিটা outbound call-এর একটা timeout দরকার। এটা ছাড়া, একটা ধীর dependency অসীম সময় ধরে connection খুলে রাখে — শেষ পর্যন্ত আপনার connection pool নিঃশেষ করে আর আপনার পুরো service নামিয়ে ফেলে।

```typescript
// WRONG — hangs forever if service is slow
const response = await fetch('https://payment-service/charge', {
	method: 'POST',
	body: JSON.stringify(payload)
});

// RIGHT — fail fast, release the connection
const response = await fetch('https://payment-service/charge', {
	method: 'POST',
	body: JSON.stringify(payload),
	signal: AbortSignal.timeout(3000) // 3 second timeout
});
```

**Timeout hierarchy:** প্রতিটা layer-এ timeout সেট করুন:

```typescript
const TIMEOUTS = {
	connect: 1000, // time to establish TCP connection
	request: 3000, // time to send request + receive first byte
	response: 10000 // total time for full response body
};

// Axios example with all three
const client = axios.create({
	timeout: TIMEOUTS.response,
	httpAgent: new http.Agent({ keepAlive: true })
});
```

**Timeout budget:** যখন service A, B-কে call করে যে C-কে call করে, মোট latency হলো A + B + C। Timeout এমনভাবে সেট করুন যাতে ভেতরের call-গুলো বাইরের call-এর জন্য budget রেখে দেয়:

```
Client timeout: 10s
Service A timeout on B: 5s
Service B timeout on C: 2s

Each call has room to fail and retry without blowing the client's timeout.
```

## Retries

Transient failure (network blip, সাময়িক overload) প্রায়ই retry-তে ঠিক হয়ে যায়। কিন্তু naive-ভাবে retry করলে আপনি ইতিমধ্যেই ধুঁকতে থাকা dependency-র উপর load বাড়িয়ে দেন।

```typescript
async function withRetry<T>(
	fn: () => Promise<T>,
	opts: { maxAttempts: number; baseDelayMs: number }
): Promise<T> {
	let lastError: Error;

	for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err as Error;

			if (attempt === opts.maxAttempts) break;

			// Exponential backoff with jitter
			const delay = opts.baseDelayMs * Math.pow(2, attempt - 1);
			const jitter = Math.random() * delay * 0.2; // ±20%
			await sleep(delay + jitter);
		}
	}

	throw lastError!;
}

// Usage
const result = await withRetry(() => fetch('https://api.service/data'), {
	maxAttempts: 3,
	baseDelayMs: 500
});
```

**শুধু idempotent operation retry করুন।** একটা POST যা record তৈরি করে সেটা retry-তে duplicate তৈরি করবে, যদি না সেটা idempotent হয়। Idempotency key ব্যবহার করুন:

```typescript
// Safe to retry with same key
const response = await fetch('https://payments/charge', {
	method: 'POST',
	headers: { 'Idempotency-Key': `charge-${orderId}` },
	body: JSON.stringify({ amount, customerId })
});
```

**সঠিক error-এ retry করুন:**

```typescript
function isRetryable(err: unknown): boolean {
	if (err instanceof TypeError) return false; // network error — retryable
	if (!(err instanceof Response)) return true;

	// 429: rate limited — retry with backoff
	if (err.status === 429) return true;

	// 502, 503, 504: upstream issues — retryable
	if (err.status >= 502 && err.status <= 504) return true;

	// 400, 401, 403, 404: client errors — not retryable
	if (err.status < 500) return false;

	return false; // default: don't retry 500 (might be our fault)
}
```

## Circuit Breaker

যখন একটা dependency ধারাবাহিকভাবে fail করছে, retry করলে সেটা আরও খারাপ হয়। একটা circuit breaker failure rate ট্র্যাক করে আর "open" হয় — সব call বন্ধ করে দেয় — যাতে dependency-কে recover করার সময় দেয়।

```typescript
type CircuitState = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
	private state: CircuitState = 'closed';
	private failures = 0;
	private successes = 0;
	private lastFailureTime = 0;

	constructor(
		private readonly threshold: number = 5, // failures to open
		private readonly resetTimeMs: number = 30_000, // open duration
		private readonly halfOpenRequests: number = 3 // test requests
	) {}

	async call<T>(fn: () => Promise<T>): Promise<T> {
		if (this.state === 'open') {
			if (Date.now() - this.lastFailureTime > this.resetTimeMs) {
				this.state = 'half-open';
				this.successes = 0;
			} else {
				throw new Error('Circuit open — dependency unavailable');
			}
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

	private onSuccess(): void {
		this.failures = 0;
		if (this.state === 'half-open') {
			this.successes++;
			if (this.successes >= this.halfOpenRequests) {
				this.state = 'closed'; // recovered
			}
		}
	}

	private onFailure(): void {
		this.failures++;
		this.lastFailureTime = Date.now();
		if (this.failures >= this.threshold || this.state === 'half-open') {
			this.state = 'open';
		}
	}

	get isOpen(): boolean {
		return this.state === 'open';
	}
}
```

Production-এ নিজেরটা বানানোর বদলে [opossum](https://nodeshift.dev/opossum/) ব্যবহার করুন:

```typescript
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(callPaymentService, {
	timeout: 3000,
	errorThresholdPercentage: 50, // open if 50% of requests fail
	resetTimeout: 30_000, // try again after 30s
	volumeThreshold: 10 // need at least 10 calls to calculate error rate
});

breaker.on('open', () => logger.warn('Payment circuit OPEN'));
breaker.on('halfOpen', () => logger.info('Payment circuit HALF-OPEN'));
breaker.on('close', () => logger.info('Payment circuit CLOSED'));

// Provide a fallback when circuit is open
breaker.fallback(() => ({ status: 'pending', message: 'Payment queued for processing' }));
```

## হাতে-কলমে: retry storm থামাও

নিচের সিমুলেটরে user-রা সেকেন্ডে 80টা request পাঠায়, আর পেছনের dependency সেকেন্ডে মোটামুটি 100টা সামলাতে পারে। মানে স্বাভাবিক দিনে হাতে জায়গা আছে। এবার "Outage দাও" চাপো: dependency কয়েক সেকেন্ডের জন্য ধীর হয়ে যায়, request timeout হতে থাকে, আর প্রতিটা timeout একটা নতুন retry পাঠায়। খেয়াল করো outage শেষ হওয়ার পরেও load বার capacity-র রেখার ওপরে থেকে যায় কিনা।

ধরো ফাতিমার payment service এই dependency-কে call করে। Outage চলে গেছে, dependency আবার পুরো গতিতে, তবুও সিস্টেম ঠিক হচ্ছে না। কেন? চ্যালেঞ্জ চালিয়ে বের করো, তারপর retry, timeout, backoff আর circuit breaker দিয়ে সেটা ঠিক করো।

<RetryStormSim />

## Bulkheads

Resource আলাদা করে রাখুন যাতে একটা ধীর consumer সব consumer-এর resource নিঃশেষ করতে না পারে। জাহাজের compartment-এর নামে নামকরণ।

**Thread/connection pool isolation:**

```typescript
// Without bulkheads: one pool for all downstream services
const sharedPool = new ConnectionPool({ max: 20 });

// With bulkheads: separate pools, failure in one doesn't affect others
const paymentPool = new ConnectionPool({ max: 5 }); // max 5 connections to payments
const inventoryPool = new ConnectionPool({ max: 5 }); // max 5 to inventory
const emailPool = new ConnectionPool({ max: 2 }); // non-critical — fewer resources
```

যদি payment service ধীর হয়ে `paymentPool` saturate করে, inventory আর email call প্রভাবিত হয় না। Bulkhead ছাড়া, payment latency shared pool নিঃশেষ করত আর সব service-এ cascade হতো।

**Queue-based bulkheads:**

```typescript
// Separate queues per job type — high priority jobs don't wait behind low priority
const criticalQueue = new Queue('critical-ops', { concurrency: 20 });
const bulkQueue = new Queue('bulk-exports', { concurrency: 2 });

// Bulk export job surge doesn't block critical operations
```

## Graceful Degradation

যখন একটা non-critical dependency fail করে, hard error দেওয়ার বদলে একটা degraded কিন্তু কার্যকর response দিন।

```typescript
async function getProductPage(productId: string): Promise<ProductPage> {
	// Critical: product data — required
	const product = await productService.get(productId);

	// Non-critical: recommendations — degrade gracefully
	const recommendations = await recommendationService.get(productId).catch((err) => {
		logger.warn({ productId, err: err.message }, 'Recommendations unavailable');
		return []; // empty, not an error
	});

	// Non-critical: reviews — show cached or empty
	const reviews = await reviewService.get(productId).catch(async () => {
		return cache.get(`reviews:${productId}`) ?? { items: [], total: 0 };
	});

	return { product, recommendations, reviews };
}
```

আপনার UI এমনভাবে ডিজাইন করুন যাতে non-critical section-এর জন্য empty state সামলাতে পারে। Recommendation ছাড়া একটা product page ঠিক আছে। কিন্তু recommendation timeout হওয়ায় error দেওয়া একটা product page ঠিক নয়।

**Graceful degradation-এর জন্য Feature flags:**

```typescript
async function checkout(cart: Cart): Promise<CheckoutResult> {
	const result = await processPayment(cart);

	// Fraud check: non-blocking — fail open if service is down
	if (await featureFlags.isEnabled('fraud-check')) {
		const fraudSignal = await fraudService
			.check(cart, result)
			.catch(() => ({ score: 0, block: false })); // fail open

		if (fraudSignal.block) {
			await refundPayment(result.chargeId);
			throw new Error('Order flagged for review');
		}
	}

	return result;
}
```

## Hedged Requests

একই request একসাথে দুটো backend-এ পাঠান, যেটা আগে সাড়া দেয় সেটা ব্যবহার করুন। দ্বিগুণ load-এর বিনিময়ে tail latency কমায়।

```typescript
async function hedgedRequest<T>(
	primary: () => Promise<T>,
	secondary: () => Promise<T>,
	hedgeAfterMs: number // delay before sending second request
): Promise<T> {
	return new Promise((resolve, reject) => {
		let settled = false;

		const settle = (result: T | Error) => {
			if (settled) return;
			settled = true;
			if (result instanceof Error) reject(result);
			else resolve(result);
		};

		// Start primary immediately
		primary()
			.then(settle)
			.catch((err) => {
				if (!settled) settle(err);
			});

		// Start secondary after hedge delay
		setTimeout(() => {
			if (!settled) {
				secondary()
					.then(settle)
					.catch((err) => {
						if (!settled) settle(err);
					});
			}
		}, hedgeAfterMs);
	});
}

// Usage: hedge after 100ms — if primary doesn't respond in 100ms,
// fire secondary request. Use whichever answers first.
const data = await hedgedRequest(
	() => fetchFromPrimary(id),
	() => fetchFromReplica(id),
	100
);
```

Hedged request কার্যকরভাবে p99 latency-কে p50 latency-র দিকে নামিয়ে আনে, ধীর percentile request-এ ~2x request volume-এর বিনিময়ে।

## Pattern-গুলো একসাথে ব্যবহার

Production-এ এগুলো একসাথে ব্যবহার করুন:

```typescript
const paymentBreaker = new CircuitBreaker(callPaymentService, {
	timeout: 3000,
	errorThresholdPercentage: 50,
	resetTimeout: 30_000
});

async function chargeCustomer(order: Order): Promise<PaymentResult> {
	try {
		// Circuit breaker wraps retry-with-timeout
		return await paymentBreaker.fire(async () => {
			return await withRetry(
				() =>
					paymentPool.call(() =>
						// bulkhead
						fetchWithTimeout('https://payments/charge', order, 2500)
					),
				{ maxAttempts: 2, baseDelayMs: 500 }
			);
		});
	} catch (err) {
		if (paymentBreaker.opened) {
			// Circuit open — queue for async retry
			await paymentQueue.add('retry-payment', { orderId: order.id });
			return { status: 'queued', message: 'Payment processing — you will be notified' };
		}
		throw err;
	}
}
```

Timeout → Retry → Circuit Breaker → Bulkhead → Graceful Degradation: প্রতিটা layer আলাদা একটা failure mode সামলায়। একসাথে এগুলো সিস্টেমকে বিপর্যয়করভাবে না ফেলে gracefully fail করতে সাহায্য করে।
