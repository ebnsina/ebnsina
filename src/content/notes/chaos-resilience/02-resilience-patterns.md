---
title: 'Resilience Patterns'
subtitle: 'Timeouts, retries, circuit breakers, bulkheads, and graceful degradation — the building blocks that keep failures contained.'
chapter: 2
level: 'intermediate'
readingTime: '12 min'
topics: ['circuit breaker', 'bulkhead', 'timeout', 'retry', 'graceful degradation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A ship's watertight compartments: if one section floods, the bulkheads contain the water to that compartment. The ship keeps sailing. Without compartments, one breach sinks everything. Resilience patterns are your system's watertight compartments.

</Callout>

## Timeouts: The Foundation

Every outbound call needs a timeout. Without one, a slow dependency holds connections open indefinitely — eventually exhausting your connection pool and taking down your entire service.

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

**Timeout hierarchy:** Set timeouts at every layer:

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

**Timeout budget:** When service A calls B which calls C, total latency is A + B + C. Set timeouts so inner calls leave budget for outer calls:

```
Client timeout: 10s
Service A timeout on B: 5s
Service B timeout on C: 2s

Each call has room to fail and retry without blowing the client's timeout.
```

## Retries

Transient failures (network blip, brief overload) often resolve on retry. But retry naively and you amplify load on an already-struggling dependency.

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

**Only retry idempotent operations.** A POST that creates a record will create duplicates on retry unless it's idempotent. Use idempotency keys:

```typescript
// Safe to retry with same key
const response = await fetch('https://payments/charge', {
	method: 'POST',
	headers: { 'Idempotency-Key': `charge-${orderId}` },
	body: JSON.stringify({ amount, customerId })
});
```

**Retry on the right errors:**

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

When a dependency is failing consistently, retrying just makes it worse. A circuit breaker tracks failure rate and "opens" — stopping all calls — to give the dependency time to recover.

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

Use [opossum](https://nodeshift.dev/opossum/) in production rather than rolling your own:

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

## Bulkheads

Isolate resources so that one slow consumer can't exhaust resources for all consumers. Named after ship compartments.

**Thread/connection pool isolation:**

```typescript
// Without bulkheads: one pool for all downstream services
const sharedPool = new ConnectionPool({ max: 20 });

// With bulkheads: separate pools, failure in one doesn't affect others
const paymentPool = new ConnectionPool({ max: 5 }); // max 5 connections to payments
const inventoryPool = new ConnectionPool({ max: 5 }); // max 5 to inventory
const emailPool = new ConnectionPool({ max: 2 }); // non-critical — fewer resources
```

If payment service becomes slow and saturates `paymentPool`, inventory and email calls are unaffected. Without bulkheads, payment latency would exhaust the shared pool and cascade to all services.

**Queue-based bulkheads:**

```typescript
// Separate queues per job type — high priority jobs don't wait behind low priority
const criticalQueue = new Queue('critical-ops', { concurrency: 20 });
const bulkQueue = new Queue('bulk-exports', { concurrency: 2 });

// Bulk export job surge doesn't block critical operations
```

## Graceful Degradation

When a non-critical dependency fails, serve a degraded but functional response rather than a hard error.

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

Design your UI to handle empty states for non-critical sections. A product page without recommendations is fine. A product page that errors because recommendations timed out is not.

**Feature flags for graceful degradation:**

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

Send the same request to two backends simultaneously, use whichever responds first. Reduces tail latency at the cost of double load.

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

Hedged requests effectively reduce p99 latency toward p50 latency at the cost of ~2x request volume to the slower percentile requests.

## Combining Patterns

In production, use these together:

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

Timeout → Retry → Circuit Breaker → Bulkhead → Graceful Degradation: each layer handles a different failure mode. Together they make the system fail gracefully instead of catastrophically.
