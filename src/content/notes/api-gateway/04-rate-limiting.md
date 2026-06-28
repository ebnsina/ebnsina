---
title: 'Rate Limiting at the Gateway'
subtitle: 'Fixed window, sliding window, token bucket — protect your backends from abuse and enforce fair usage without touching service code.'
chapter: 4
level: 'intermediate'
readingTime: '13 min'
topics: ['rate limiting', 'token bucket', 'sliding window', 'Redis', 'throttling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A turnstile at a subway station — it allows one person through at a time, enforces a pace, and doesn't care who you are or where you're going. The platform (your backend) never sees the crowd; it just sees a steady stream.

</Callout>

## Why at the Gateway

Rate limiting in every service is redundant and inconsistent. At the gateway you get:

- One config to change limits globally
- Limits enforced before requests consume any service resources
- Aggregated view: limit per user across all services, not per-service buckets

## Fixed Window

Count requests in a fixed time window (e.g., current minute). Simple but has a burst problem at window edges.

```typescript
class FixedWindowLimiter {
	constructor(
		private redis: RedisClient,
		private limit: number,
		private windowSeconds: number
	) {}

	async isAllowed(key: string): Promise<{ allowed: boolean; remaining: number }> {
		const windowKey = `ratelimit:fw:${key}:${Math.floor(Date.now() / (this.windowSeconds * 1000))}`;

		const count = await this.redis.incr(windowKey);

		if (count === 1) {
			// First request in window — set expiry
			await this.redis.expire(windowKey, this.windowSeconds);
		}

		const allowed = count <= this.limit;
		return { allowed, remaining: Math.max(0, this.limit - count) };
	}
}
```

**The edge burst problem:** With a 60-request/minute limit, a client can send 60 at 11:59 and 60 at 12:00 — 120 requests in 2 seconds. Sliding window fixes this.

## Sliding Window

Count requests in the last N seconds, not in the current calendar window:

```typescript
class SlidingWindowLimiter {
	constructor(
		private redis: RedisClient,
		private limit: number,
		private windowMs: number
	) {}

	async isAllowed(key: string): Promise<{ allowed: boolean; remaining: number }> {
		const now = Date.now();
		const windowStart = now - this.windowMs;
		const redisKey = `ratelimit:sw:${key}`;

		const [, , count] = (await this.redis
			.multi()
			.zRemRangeByScore(redisKey, '-inf', windowStart) // remove old entries
			.zAdd(redisKey, { score: now, value: `${now}-${Math.random()}` })
			.zCard(redisKey)
			.expire(redisKey, Math.ceil(this.windowMs / 1000))
			.exec()) as [unknown, unknown, number, unknown];

		const allowed = count <= this.limit;
		return { allowed, remaining: Math.max(0, this.limit - count) };
	}
}
```

More accurate, but stores one Redis entry per request. For very high traffic keys, the sorted set grows large — cap with `ZREMRANGEBYRANK` to keep only the last N entries.

## Token Bucket

The smoothest algorithm. A bucket fills at a constant rate (refill rate). Each request consumes one token. Bursts are allowed up to the bucket capacity.

```typescript
class TokenBucketLimiter {
	constructor(
		private redis: RedisClient,
		private capacity: number, // max tokens (burst size)
		private refillRate: number // tokens per second
	) {}

	async isAllowed(key: string): Promise<{ allowed: boolean; remaining: number }> {
		const now = Date.now() / 1000; // seconds
		const bucketKey = `ratelimit:tb:${key}`;

		// Lua script for atomicity
		const script = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local requested = tonumber(ARGV[4])

      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1]) or capacity
      local last_refill = tonumber(bucket[2]) or now

      -- Refill tokens based on elapsed time
      local elapsed = now - last_refill
      tokens = math.min(capacity, tokens + elapsed * refill_rate)

      local allowed = 0
      if tokens >= requested then
        tokens = tokens - requested
        allowed = 1
      end

      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('EXPIRE', key, math.ceil(capacity / refill_rate) + 1)

      return { allowed, math.floor(tokens) }
    `;

		const [allowed, remaining] = (await this.redis.eval(
			script,
			1,
			bucketKey,
			this.capacity,
			this.refillRate,
			now,
			1
		)) as [number, number];

		return { allowed: allowed === 1, remaining };
	}
}
```

## Response Headers

Always tell clients their rate limit status:

```typescript
function applyRateLimitHeaders(
	res: Response,
	limit: number,
	remaining: number,
	resetSeconds: number
): void {
	res.set({
		'X-RateLimit-Limit': String(limit),
		'X-RateLimit-Remaining': String(remaining),
		'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + resetSeconds),
		'Retry-After': remaining === 0 ? String(resetSeconds) : undefined
	});
}

// When limited:
res.status(429).json({
	error: 'Too Many Requests',
	retryAfter: resetSeconds
});
```

The `Retry-After` header lets well-behaved clients back off automatically instead of hammering you harder.

## Limit Keys

What you limit on determines the attack surface:

```typescript
function getLimitKey(req: Request): string {
	// Option 1: by authenticated user (most fair)
	if (req.headers['x-user-id']) {
		return `user:${req.headers['x-user-id']}`;
	}

	// Option 2: by API key
	if (req.headers['x-api-key']) {
		return `apikey:${hashApiKey(req.headers['x-api-key'] as string)}`;
	}

	// Option 3: by IP (for unauthenticated routes)
	return `ip:${req.ip}`;
}
```

**Layered limits** — apply multiple limits simultaneously:

```typescript
async function checkRateLimits(req: Request): Promise<void> {
	const userId = req.headers['x-user-id'] as string;

	await Promise.all([
		// Global: 1000 req/min per user
		limiter.check(`global:${userId}`, 1000, 60),
		// Per-route: 100 req/min on expensive endpoints
		limiter.check(`route:${req.path}:${userId}`, 100, 60),
		// Burst: max 20 req/sec
		limiter.check(`burst:${userId}`, 20, 1)
	]);
}
```

## Kong Rate Limiting Plugin

In production, use battle-tested plugins rather than rolling your own:

```yaml
# Kong declarative config (deck)
plugins:
  - name: rate-limiting
    config:
      minute: 1000
      hour: 10000
      policy: redis
      redis_host: redis
      redis_port: 6379
      limit_by: consumer # or ip, credential, header
      hide_client_headers: false
```

Kong handles the Redis atomicity, header injection, and 429 responses. Your job is configuring the limits per route and per consumer tier.
