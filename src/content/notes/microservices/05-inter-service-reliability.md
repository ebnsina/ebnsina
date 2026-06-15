---
title: "Inter-Service Reliability"
subtitle: "Timeouts, retries, circuit breakers, and bulkheads — the patterns that prevent one slow service from cascading into a full outage."
chapter: 5
level: "intermediate"
readingTime: "10 min"
topics: ["circuit breaker", "retry", "timeout", "bulkhead", "resilience", "cascading failure"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Circuit breakers in a building's electrical panel: when one circuit overloads, the breaker trips — cutting power to that circuit only, protecting the rest of the building. Without breakers, one faulty appliance could blow the entire system. The breaker "opens" to protect, then "closes" again once the fault is cleared.

</Callout>

## The Cascading Failure Problem

Service A calls Service B. Service B gets slow (database issue). Service A's request threads pile up waiting for B to respond. Service A's thread pool exhausts. Service A starts returning 503 to clients. Service C (which calls A) starts failing. The database issue in Service B has taken down Service A and C.

This is a cascading failure — the most common failure mode in microservices. It happens because slow is worse than down: a down service gets connection refused immediately; a slow service holds connections open until they time out.

## Timeouts — the First Defense

Every external call must have a timeout. No exceptions.

```typescript
// Without timeout — hangs indefinitely
const response = await fetch('http://payment-service/charge');

// With timeout — fails fast
const response = await fetch('http://payment-service/charge', {
  signal: AbortSignal.timeout(5000),  // 5 second hard limit
});
```

**gRPC deadline propagation:**
```typescript
// Client sets a deadline for the entire call chain
const { order } = await client.createOrder(
  { customerId, items },
  { timeoutMs: 10_000 }
);
```

gRPC propagates deadlines downstream — if Order calls Payment with a 10s deadline, Payment knows it only has (10s - time_elapsed) to complete. It can give up early rather than doing work that won't be used.

**Timeout budget:** set the upstream timeout longer than the downstream timeout chain. If Order → Payment → Stripe, set:
- Stripe: 5s
- Payment service timeout: 6s (Stripe + small buffer)
- Order service timeout: 8s (Payment + buffer)
- Client timeout: 10s

## Retries — Only Where Safe

Retry only on idempotent operations, and only on specific error codes.

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
const order = await withRetry(
  () => client.getOrder({ orderId }),
  {
    retries: 3,
    delay: 100,
    retryOn: [Code.Unavailable, Code.DeadlineExceeded],
  }
);
```

**Never retry:**
- Non-idempotent operations (charging a card — retry = double charge)
- `INVALID_ARGUMENT` — retrying won't fix bad input
- `PERMISSION_DENIED` — retrying won't grant permissions
- When you've already exceeded the deadline — retrying burns more budget

## Circuit Breaker

After N failures, stop trying and fail fast. Periodically probe to see if the service recovered.

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

  get currentState() { return this.state; }
}

// Per-service circuit breaker
const paymentBreaker = new CircuitBreaker(5, 30_000);

async function chargePayment(order: Order) {
  return paymentBreaker.call(() => paymentClient.charge(order));
}
```

In production, use `opossum` (Node.js) or `Resilience4j` (JVM) — they add metrics, events, and fallback support:

```typescript
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(paymentClient.charge.bind(paymentClient), {
  timeout: 5000,          // trigger failure if call takes > 5s
  errorThresholdPercentage: 50,  // open when 50% of calls fail
  resetTimeout: 30000,    // try again after 30s
  volumeThreshold: 10,    // minimum calls before tripping
});

breaker.fallback(() => ({ status: 'pending', message: 'Payment queued for retry' }));
breaker.on('open', () => metrics.increment('circuit_breaker.payment.opened'));
breaker.on('close', () => metrics.increment('circuit_breaker.payment.closed'));

const result = await breaker.fire(order);
```

## Bulkheads

Limit how many concurrent calls you make to each downstream service. If the payment service slows down, it can only exhaust its own connection pool — not the entire application's.

```typescript
import pLimit from 'p-limit';

// Max 20 concurrent calls to payment service
const paymentLimit = pLimit(20);

// Max 10 concurrent calls to inventory service
const inventoryLimit = pLimit(10);

async function processOrder(order: Order) {
  const [payment, inventory] = await Promise.all([
    paymentLimit(() => paymentClient.charge(order)),
    inventoryLimit(() => inventoryClient.reserve(order.items)),
  ]);
}
```

Without bulkheads: if payment service is slow and 1000 orders arrive, 1000 threads/promises are waiting on payment. The application has no capacity for any other requests.

With bulkheads: only 20 requests are waiting on payment. The other 980 fail fast (queue full). The rest of the application continues working.

**Connection pool as bulkhead:**
```typescript
// pg (postgres) — built-in pool
const db = new Pool({
  connectionString: DATABASE_URL,
  max: 20,            // max 20 concurrent queries
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,  // fail fast if pool full
});
```

## Hedged Requests

For latency-critical paths: send the same request to two instances in parallel, use whichever responds first.

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
    requests[0]().then(settle).catch(err => {
      errors.push(err);
      if (errors.length === requests.length) settle(errors[0]);
    });

    // Hedge: if first request isn't done in hedgeAfterMs, start second
    setTimeout(() => {
      if (settled) return;
      requests[1]?.().then(settle).catch(err => {
        errors.push(err);
        if (errors.length === requests.length) settle(errors[0]);
      });
    }, hedgeAfterMs);
  });
}

// Usage: hedge after 100ms (P99 latency)
const order = await hedgedRequest(
  [
    () => client1.getOrder({ orderId }),
    () => client2.getOrder({ orderId }),
  ],
  100
);
```

Hedging trades extra load (up to 2x) for lower tail latency. Use only for reads.

## Putting It Together

A production inter-service call has all layers:

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
      return withRetry(
        () => paymentClient.charge(order, { signal }),
        { retries: 2, delay: 200, retryOn: [Code.Unavailable] }
      );
    });
  });
}
```

Each layer addresses a different failure mode:
- **Timeout:** prevents indefinite blocking
- **Retry:** handles transient failures
- **Circuit breaker:** prevents hammering a failed service
- **Bulkhead:** limits blast radius of a slow service

