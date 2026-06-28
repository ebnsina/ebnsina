---
title: 'Rate Limiting'
subtitle: 'Implement token bucket and sliding window rate limiters with Redis for production API protection.'
chapter: 7
level: 'intermediate'
readingTime: '15 min'
topics: ['rate limiting', 'token bucket', 'sliding window', 'Redis', 'middleware']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## Why Rate Limiting?

Without rate limiting, a single user or bot can overwhelm your API, deny service to everyone else, and rack up infrastructure costs. Rate limiting controls how many requests a client can make in a time window.

<Callout type="info">

**Real-World Analogy**

Like an ATM daily withdrawal limit — you can only withdraw a fixed amount per day to prevent abuse. Hit the limit, and you're told to try again tomorrow.

</Callout>

<Mermaid
title="Rate Limiter as Middleware"
code={`graph LR
  C["Client"] --> RL["Rate Limiter<br/>Allow / Deny"] --> S["API Server"]`}
/>

## Algorithms Compared

| Algorithm      | Pros                        | Cons                            |
| -------------- | --------------------------- | ------------------------------- |
| Token Bucket   | Smooth, allows bursts       | Complex to implement right      |
| Sliding Window | Precise, no boundary issues | Higher memory usage             |
| Fixed Window   | Simple                      | Allows 2x burst at window edges |
| Leaky Bucket   | Smooth output rate          | Can't handle legitimate bursts  |

## Production Rate Limiter with Redis

<CodeTabs tsFile="ratelimit.ts" goFile="ratelimit.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// --- Sliding Window Rate Limiter ---
class SlidingWindowRateLimiter {
	constructor(
		private maxRequests: number,
		private windowMs: number
	) {}

	async isAllowed(key: string): Promise<{
		allowed: boolean;
		remaining: number;
		resetAt: number;
		retryAfter: number;
	}> {
		const now = Date.now();
		const windowStart = now - this.windowMs;
		const redisKey = `rl:${key}`;

		// Use a Redis pipeline for atomicity
		const pipeline = redis.pipeline();

		// Remove expired entries
		pipeline.zremrangebyscore(redisKey, 0, windowStart);

		// Count current entries
		pipeline.zcard(redisKey);

		// Add current request (we'll remove it if denied)
		pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);

		// Set TTL on the key
		pipeline.pexpire(redisKey, this.windowMs);

		const results = await pipeline.exec();
		const currentCount = (results?.[1]?.[1] as number) || 0;

		if (currentCount >= this.maxRequests) {
			// Over limit — remove the entry we just added
			await redis.zremrangebyscore(redisKey, now, now);

			// Find when the oldest entry expires
			const oldest = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
			const oldestTime = oldest.length >= 2 ? parseInt(oldest[1]) : now;
			const retryAfter = Math.ceil((oldestTime + this.windowMs - now) / 1000);

			return {
				allowed: false,
				remaining: 0,
				resetAt: oldestTime + this.windowMs,
				retryAfter: Math.max(retryAfter, 1)
			};
		}

		return {
			allowed: true,
			remaining: this.maxRequests - currentCount - 1,
			resetAt: now + this.windowMs,
			retryAfter: 0
		};
	}
}

// --- Token Bucket Rate Limiter ---
class TokenBucketRateLimiter {
	constructor(
		private capacity: number, // max tokens
		private refillRate: number // tokens added per second
	) {}

	async isAllowed(key: string): Promise<{
		allowed: boolean;
		remaining: number;
		retryAfter: number;
	}> {
		const redisKey = `rl:tb:${key}`;
		const now = Date.now();

		// Lua script for atomic token bucket
		const script = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])

      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1])
      local last_refill = tonumber(bucket[2])

      if tokens == nil then
        tokens = capacity
        last_refill = now
      end

      -- Refill tokens based on elapsed time
      local elapsed = (now - last_refill) / 1000
      tokens = math.min(capacity, tokens + (elapsed * refill_rate))
      last_refill = now

      local allowed = 0
      if tokens >= 1 then
        tokens = tokens - 1
        allowed = 1
      end

      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
      redis.call('PEXPIRE', key, math.ceil(capacity / refill_rate) * 1000)

      return {allowed, math.floor(tokens)}
    `;

		const result = (await redis.eval(
			script,
			1,
			redisKey,
			this.capacity,
			this.refillRate,
			now
		)) as number[];

		const allowed = result[0] === 1;
		const remaining = result[1];

		return {
			allowed,
			remaining,
			retryAfter: allowed ? 0 : Math.ceil(1 / this.refillRate)
		};
	}
}

// --- Rate Limit Middleware ---
type RateLimitTier = {
	maxRequests: number;
	windowMs: number;
};

const tiers: Record<string, RateLimitTier> = {
	free: { maxRequests: 100, windowMs: 60 * 60 * 1000 }, // 100/hour
	pro: { maxRequests: 1000, windowMs: 60 * 60 * 1000 }, // 1000/hour
	enterprise: { maxRequests: 10000, windowMs: 60 * 60 * 1000 } // 10000/hour
};

function getUserTier(_req: http.IncomingMessage): string {
	// In production: look up user's plan from auth token
	return 'free';
}

function getClientKey(req: http.IncomingMessage): string {
	// Use API key or IP address
	const apiKey = req.headers['x-api-key'];
	if (apiKey) return `api:${apiKey}`;
	return `ip:${req.socket.remoteAddress}`;
}

async function rateLimitMiddleware(
	req: http.IncomingMessage,
	res: http.ServerResponse
): Promise<boolean> {
	const tier = tiers[getUserTier(req)];
	const limiter = new SlidingWindowRateLimiter(tier.maxRequests, tier.windowMs);
	const key = getClientKey(req);

	const result = await limiter.isAllowed(key);

	// Always set rate limit headers
	res.setHeader('X-RateLimit-Limit', tier.maxRequests);
	res.setHeader('X-RateLimit-Remaining', result.remaining);
	res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

	if (!result.allowed) {
		res.setHeader('Retry-After', result.retryAfter);
		res.writeHead(429, { 'Content-Type': 'application/json' });
		res.end(
			JSON.stringify({
				error: 'Too many requests',
				retryAfter: result.retryAfter
			})
		);
		return false;
	}

	return true;
}

// --- Server ---
const server = http.createServer(async (req, res) => {
	const allowed = await rateLimitMiddleware(req, res);
	if (!allowed) return;

	res.writeHead(200, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ message: 'OK', timestamp: new Date().toISOString() }));
});

server.listen(3000, () => console.log('Server with rate limiting on :3000'));
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

var rdb = redis.NewClient(&redis.Options{Addr: "localhost:6379"})

// --- Sliding Window Rate Limiter ---
type SlidingWindowLimiter struct {
	MaxRequests int
	Window      time.Duration
}

type RateLimitResult struct {
	Allowed    bool
	Remaining  int
	ResetAt    int64
	RetryAfter int
}

func (l *SlidingWindowLimiter) IsAllowed(ctx context.Context, key string) (*RateLimitResult, error) {
	now := time.Now().UnixMilli()
	windowStart := now - l.Window.Milliseconds()
	redisKey := "rl:" + key

	pipe := rdb.Pipeline()
	pipe.ZRemRangeByScore(ctx, redisKey, "0", strconv.FormatInt(windowStart, 10))
	countCmd := pipe.ZCard(ctx, redisKey)
	member := fmt.Sprintf("%d:%d", now, time.Now().UnixNano())
	pipe.ZAdd(ctx, redisKey, redis.Z{Score: float64(now), Member: member})
	pipe.PExpire(ctx, redisKey, l.Window)

	if _, err := pipe.Exec(ctx); err != nil {
		return nil, fmt.Errorf("pipeline: %w", err)
	}

	count := int(countCmd.Val())

	if count >= l.MaxRequests {
		// Over limit — remove entry we just added
		rdb.ZRemRangeByScore(ctx, redisKey, strconv.FormatInt(now, 10), strconv.FormatInt(now, 10))

		// Calculate retry-after from oldest entry
		oldest, _ := rdb.ZRangeWithScores(ctx, redisKey, 0, 0).Result()
		retryAfter := 1
		if len(oldest) > 0 {
			oldestTime := int64(oldest[0].Score)
			retryMs := oldestTime + l.Window.Milliseconds() - now
			retryAfter = int(retryMs/1000) + 1
			if retryAfter < 1 {
				retryAfter = 1
			}
		}

		return &RateLimitResult{
			Allowed: false, Remaining: 0,
			ResetAt: now + l.Window.Milliseconds(), RetryAfter: retryAfter,
		}, nil
	}

	return &RateLimitResult{
		Allowed: true, Remaining: l.MaxRequests - count - 1,
		ResetAt: now + l.Window.Milliseconds(),
	}, nil
}

// --- Token Bucket (Lua-based, atomic) ---
type TokenBucketLimiter struct {
	Capacity   int
	RefillRate float64 // tokens per second
}

var tokenBucketScript = redis.NewScript(`
	local key = KEYS[1]
	local capacity = tonumber(ARGV[1])
	local refill_rate = tonumber(ARGV[2])
	local now = tonumber(ARGV[3])

	local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
	local tokens = tonumber(bucket[1])
	local last_refill = tonumber(bucket[2])

	if tokens == nil then
		tokens = capacity
		last_refill = now
	end

	local elapsed = (now - last_refill) / 1000
	tokens = math.min(capacity, tokens + (elapsed * refill_rate))
	last_refill = now

	local allowed = 0
	if tokens >= 1 then
		tokens = tokens - 1
		allowed = 1
	end

	redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
	redis.call('PEXPIRE', key, math.ceil(capacity / refill_rate) * 1000)

	return {allowed, math.floor(tokens)}
`)

func (l *TokenBucketLimiter) IsAllowed(ctx context.Context, key string) (bool, int, error) {
	result, err := tokenBucketScript.Run(ctx, rdb, []string{"rl:tb:" + key},
		l.Capacity, l.RefillRate, time.Now().UnixMilli(),
	).Int64Slice()
	if err != nil {
		return false, 0, err
	}
	return result[0] == 1, int(result[1]), nil
}

// --- Tier-based middleware ---
type RateLimitTier struct {
	MaxRequests int
	Window      time.Duration
}

var tiers = map[string]RateLimitTier{
	"free":       {MaxRequests: 100, Window: time.Hour},
	"pro":        {MaxRequests: 1000, Window: time.Hour},
	"enterprise": {MaxRequests: 10000, Window: time.Hour},
}

func rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tier := tiers["free"] // In production: from auth token
		limiter := &SlidingWindowLimiter{MaxRequests: tier.MaxRequests, Window: tier.Window}

		// Use API key or IP
		key := r.RemoteAddr
		if apiKey := r.Header.Get("X-API-Key"); apiKey != "" {
			key = "api:" + apiKey
		}

		result, err := limiter.IsAllowed(r.Context(), key)
		if err != nil {
			log.Printf("Rate limit error: %v", err)
			next.ServeHTTP(w, r) // fail open
			return
		}

		w.Header().Set("X-RateLimit-Limit", strconv.Itoa(tier.MaxRequests))
		w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(result.Remaining))
		w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(result.ResetAt/1000, 10))

		if !result.Allowed {
			w.Header().Set("Retry-After", strconv.Itoa(result.RetryAfter))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": "Too many requests", "retryAfter": result.RetryAfter,
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "OK"})
	})

	log.Println("Server with rate limiting on :3000")
	log.Fatal(http.ListenAndServe(":3000", rateLimitMiddleware(mux)))
}
```

</div>
</CodeTabs>

<div class="takeaways">

### Key Takeaways

- Sliding window is the most accurate algorithm — no boundary burst issues
- Token bucket is best when you want to allow short bursts above the average rate
- Use **Lua scripts** for atomic Redis operations — prevents race conditions between check and increment
- Always return `X-RateLimit-*` and `Retry-After` headers so clients can self-throttle
- **Fail open** on rate limiter errors — don't block all traffic because Redis is momentarily down

</div>

<div class="when-to-use">

### Real-World Usage

- **GitHub API** uses 5,000 requests/hour for authenticated users, returns `X-RateLimit-*` headers
- **Stripe** rate limits per API key with tiered limits based on account type
- **Cloudflare** processes rate limiting at their edge network to block abuse before it reaches origin servers
- Every public API needs rate limiting — it's not optional in production

</div>
