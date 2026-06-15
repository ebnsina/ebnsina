---
title: "Rate Limiting & Throttling"
subtitle: "Protect your APIs from abuse with token bucket, sliding window, distributed rate limiting, and retry-after patterns."
chapter: 8
level: "advanced"
readingTime: "12 min"
topics: ["rate limiting", "throttling", "token bucket", "sliding window", "distributed systems"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Rate Limit?

Without rate limiting, a single client can consume all your server resources — intentionally (DDoS attack) or accidentally (buggy loop that fires 1000 requests/second). Rate limiting protects your API, ensures fair usage, and keeps costs under control.

<Callout type="info">

**Real-World Analogy**

Like an ATM daily withdrawal limit — you can only withdraw a fixed amount per day to prevent abuse. Hit the limit, and you wait until tomorrow.

</Callout>

## Rate Limiting Algorithms

### 1. Fixed Window Counter

The simplest approach. Count requests in fixed time windows (e.g., per minute).

```typescript
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

async function fixedWindowRateLimit(
  clientId: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const key = `ratelimit:${clientId}:${windowStart}`;

  const current = await redis.incr(key);

  // Set expiry on first request in window
  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }

  const resetAt = windowStart + windowSeconds;
  const remaining = Math.max(0, limit - current);

  return {
    allowed: current <= limit,
    remaining,
    resetAt,
  };
}

// Usage: 100 requests per minute
const result = await fixedWindowRateLimit("user_42", 100, 60);
```

**Problem:** At the boundary between two windows, a client can make 2x the limit (100 at 0:59, 100 at 1:00).

### 2. Sliding Window Log

Track the timestamp of every request and count how many fall within the window:

```typescript
async function slidingWindowLog(
  clientId: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const key = `ratelimit:log:${clientId}`;

  // Use Redis sorted set — score is timestamp
  const pipeline = redis.pipeline();

  // Remove old entries outside the window
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Count entries in current window
  pipeline.zcard(key);

  // Add current request
  pipeline.zadd(key, now, `${now}:${Math.random()}`);

  // Set expiry
  pipeline.expire(key, windowSeconds);

  const results = await pipeline.exec();
  const count = (results?.[1]?.[1] as number) || 0;

  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count - 1),
  };
}
```

**Problem:** Memory-intensive — stores every request timestamp.

### 3. Sliding Window Counter

A hybrid that approximates the sliding window using two fixed windows:

```typescript
async function slidingWindowCounter(
  clientId: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const currentWindow = now - (now % windowSeconds);
  const previousWindow = currentWindow - windowSeconds;

  const currentKey = `ratelimit:${clientId}:${currentWindow}`;
  const previousKey = `ratelimit:${clientId}:${previousWindow}`;

  const [currentCount, previousCount] = await Promise.all([
    redis.get(currentKey).then(Number),
    redis.get(previousKey).then(Number),
  ]);

  // Weight the previous window by how much of it overlaps
  const elapsedInWindow = now - currentWindow;
  const previousWeight = 1 - elapsedInWindow / windowSeconds;
  const estimatedCount = Math.floor(previousCount * previousWeight) + currentCount;

  if (estimatedCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: currentWindow + windowSeconds,
    };
  }

  // Increment current window
  const pipeline = redis.pipeline();
  pipeline.incr(currentKey);
  pipeline.expire(currentKey, windowSeconds * 2);
  await pipeline.exec();

  return {
    allowed: true,
    remaining: limit - estimatedCount - 1,
    resetAt: currentWindow + windowSeconds,
  };
}
```

### 4. Token Bucket

The most flexible algorithm. A bucket holds tokens, each request consumes one token, and tokens are refilled at a constant rate.

```typescript
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

async function tokenBucketRateLimit(
  clientId: string,
  maxTokens: number,      // Bucket capacity (burst size)
  refillRate: number,      // Tokens added per second
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  const key = `ratelimit:bucket:${clientId}`;
  const now = Date.now() / 1000;

  // Atomic operation with Lua script
  const luaScript = `
    local key = KEYS[1]
    local max_tokens = tonumber(ARGV[1])
    local refill_rate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])

    local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
    local tokens = tonumber(bucket[1]) or max_tokens
    local last_refill = tonumber(bucket[2]) or now

    -- Refill tokens based on elapsed time
    local elapsed = now - last_refill
    tokens = math.min(max_tokens, tokens + elapsed * refill_rate)

    if tokens < 1 then
      -- Calculate when next token will be available
      local retry_after = (1 - tokens) / refill_rate
      return {0, tokens, retry_after}
    end

    -- Consume a token
    tokens = tokens - 1
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('EXPIRE', key, math.ceil(max_tokens / refill_rate) * 2)

    return {1, tokens, 0}
  `;

  const result = await redis.eval(luaScript, 1, key, maxTokens, refillRate, now) as number[];

  return {
    allowed: result[0] === 1,
    remaining: Math.floor(result[1]),
    retryAfter: result[2] > 0 ? Math.ceil(result[2]) : undefined,
  };
}

// Example: 100 tokens max, refill 10 tokens/second
// Allows bursts of 100, sustains 10 req/s
const result = await tokenBucketRateLimit("user_42", 100, 10);
```

<Callout type="tip">

**Choosing an Algorithm**

- **Fixed window** — Simplest, good enough for most APIs
- **Sliding window counter** — Better accuracy than fixed window, minimal overhead
- **Token bucket** — Best for allowing bursts while enforcing sustained rate
- **Sliding window log** — Most accurate but highest memory usage

</Callout>

## Rate Limit Headers

Always communicate rate limit status in response headers:

```typescript
function rateLimitMiddleware(limit: number, windowSeconds: number) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const clientId = req.user?.id || req.ip;
    const result = await slidingWindowCounter(clientId, limit, windowSeconds);

    // Set rate limit headers on every response
    res.set("X-RateLimit-Limit", String(limit));
    res.set("X-RateLimit-Remaining", String(result.remaining));
    res.set("X-RateLimit-Reset", String(result.resetAt));

    if (!result.allowed) {
      res.set("Retry-After", String(result.resetAt - Math.floor(Date.now() / 1000)));
      return res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: `Rate limit exceeded. Try again in ${result.resetAt - Math.floor(Date.now() / 1000)} seconds.`,
          retryAfter: result.resetAt,
        },
      });
    }

    next();
  };
}

// Apply different limits to different routes
app.use("/api/auth", rateLimitMiddleware(10, 60));     // 10 req/min for auth
app.use("/api/search", rateLimitMiddleware(30, 60));    // 30 req/min for search
app.use("/api", rateLimitMiddleware(1000, 60));          // 1000 req/min default
```

## Client-Side Retry with Backoff

Clients should respect rate limits and implement proper retry logic:

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status !== 429) {
      return response;
    }

    if (attempt === maxRetries) {
      throw new Error("Rate limit exceeded after max retries");
    }

    // Respect Retry-After header
    const retryAfter = response.headers.get("Retry-After");
    let waitTime: number;

    if (retryAfter) {
      waitTime = Number(retryAfter) * 1000;
    } else {
      // Exponential backoff with jitter
      waitTime = Math.min(
        1000 * Math.pow(2, attempt) + Math.random() * 1000,
        30000 // Max 30 seconds
      );
    }

    console.log(`Rate limited. Retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  throw new Error("Unreachable");
}

// Usage
const response = await fetchWithRetry("https://api.example.com/data", {
  headers: { Authorization: "Bearer ..." },
});
```

## Tiered Rate Limits

Different API plans get different limits:

```typescript
interface RateLimitTier {
  requestsPerMinute: number;
  requestsPerDay: number;
  burstSize: number;
}

const tiers: Record<string, RateLimitTier> = {
  free: { requestsPerMinute: 60, requestsPerDay: 1000, burstSize: 10 },
  pro: { requestsPerMinute: 600, requestsPerDay: 50000, burstSize: 100 },
  enterprise: { requestsPerMinute: 6000, requestsPerDay: 500000, burstSize: 1000 },
};

async function tieredRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const client = req.client; // Set by API key middleware
  const tier = tiers[client.plan] || tiers.free;

  // Check per-minute limit
  const minuteResult = await slidingWindowCounter(
    client.id,
    tier.requestsPerMinute,
    60
  );

  // Check daily limit
  const dailyResult = await slidingWindowCounter(
    `${client.id}:daily`,
    tier.requestsPerDay,
    86400
  );

  if (!minuteResult.allowed || !dailyResult.allowed) {
    const retryAfter = !minuteResult.allowed
      ? minuteResult.resetAt - Math.floor(Date.now() / 1000)
      : dailyResult.resetAt - Math.floor(Date.now() / 1000);

    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Rate limit exceeded",
        limits: {
          perMinute: { limit: tier.requestsPerMinute, remaining: minuteResult.remaining },
          perDay: { limit: tier.requestsPerDay, remaining: dailyResult.remaining },
        },
        plan: client.plan,
        upgradeUrl: "https://api.example.com/pricing",
      },
    });
  }

  res.set("X-RateLimit-Limit", String(tier.requestsPerMinute));
  res.set("X-RateLimit-Remaining", String(minuteResult.remaining));
  next();
}
```

<Callout type="warning">

**Rate Limiting Pitfalls**

- Do not rate limit by IP alone — many users share IPs (corporate NAT, mobile carriers)
- Do not forget to rate limit authentication endpoints — brute force attacks target login
- Do not use in-memory counters in a multi-server setup — use Redis or a shared store
- Do not set limits too low initially — start generous and tighten based on data
- Always include `Retry-After` in 429 responses — clients need to know when to try again

</Callout>

## Distributed Rate Limiting

In a multi-server environment, you need a shared counter:

```typescript
// Option 1: Centralized Redis (most common)
// All servers check the same Redis instance
// Pros: Exact, simple
// Cons: Redis is a single point of failure

// Option 2: Redis Cluster with Lua scripts
// Atomic operations ensure consistency
// (The token bucket Lua script above works for this)

// Option 3: Local + sync (approximate)
// Each server tracks locally, periodically syncs to central store
// Pros: Works if Redis is down temporarily
// Cons: Approximate, can exceed limits briefly

class LocalRateLimiter {
  private counters = new Map<string, { count: number; window: number }>();
  private syncInterval: NodeJS.Timeout;

  constructor(private redis: Redis, private syncIntervalMs = 5000) {
    this.syncInterval = setInterval(() => this.sync(), syncIntervalMs);
  }

  async check(clientId: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const window = now - (now % windowSeconds);
    const key = `${clientId}:${window}`;

    const counter = this.counters.get(key) || { count: 0, window };
    counter.count++;
    this.counters.set(key, counter);

    // Local check (approximate)
    return counter.count <= limit;
  }

  private async sync() {
    for (const [key, counter] of this.counters) {
      await this.redis.incrby(`ratelimit:${key}`, counter.count);
      counter.count = 0;
    }
  }
}
```

## Key Takeaways

1. **Rate limiting protects your API** from abuse, ensures fair usage, and controls costs
2. **Token bucket** is the most flexible algorithm — allows bursts while enforcing sustained rates
3. **Sliding window counter** balances accuracy and simplicity for most use cases
4. **Always include rate limit headers** (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`)
5. **Use Redis** for distributed rate limiting across multiple servers
6. **Implement tiered limits** for different API plans to monetize your API fairly
7. **Clients must implement exponential backoff** with jitter when rate limited

