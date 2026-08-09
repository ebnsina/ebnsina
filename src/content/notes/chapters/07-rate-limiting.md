---
title: 'রেট লিমিটিং'
subtitle: 'প্রোডাকশন API সুরক্ষার জন্য Redis দিয়ে token bucket আর sliding window rate limiter বানান।'
chapter: 7
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['rate limiting', 'token bucket', 'sliding window', 'Redis', 'middleware']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

রমজানে মহল্লার মসজিদের সামনে ইফতার বিতরণ। ভিড় সামলাতে ফাতিমা আল-ফিহরি একটা সহজ নিয়ম বের করেছেন — লাইনে দাঁড়ানো প্রতিজনের হাতে একটা কার্ডে কিছু টোকেন থাকে, আর একটা টোকেন খরচ করলে এক প্যাকেট খাবার মেলে। টোকেন আবার জমাও হয়, তবে ধীরে — প্রতি কয়েক মিনিটে একটা করে ফাতিমা আল-ফিহরি কার্ডে টোকেন বসিয়ে দেন। ইবনে সিনা দেরিতে এসেছিল বলে তার কার্ডে কয়েকটা টোকেন জমে গিয়েছিল, তাই সে একবারেই তিন প্যাকেট নিয়ে পরিবারের জন্য চলে গেল — এই burst-টুকু নিয়মে আটকায় না।

কিন্তু আল-খোয়ারিজমি লোভী। প্যাকেট নিতে নিতে তার কার্ডের সব টোকেন শেষ, তবু সে বারবার লাইনে এসে হাত বাড়ায়। ফাতিমা আল-ফিহরি তখন শান্তভাবে বলেন — "তোমার টোকেন তো নেই, একটু দাঁড়াও, কার্ডে আবার টোকেন জমুক তারপর এসো।" ফাঁকা কার্ড মানেই তাকে অপেক্ষা করতে হবে, রিফিলের গতির চেয়ে বেশি জোরে সে কিছুতেই নিতে পারবে না। এভাবে একজন লোভী মানুষ পুরো ইফতার সাবাড় করে দিতে পারে না, বাকিদের ভাগও থাকে।

এই গল্পটাই আসলে **token bucket** দিয়ে **rate limiting**। কার্ডের টোকেন হলো একটা ক্লায়েন্টের request allowance, ফাতিমা আল-ফিহরির ধীরে ধীরে টোকেন বসানো হলো নির্দিষ্ট rate limit (refill rate), জমানো টোকেন একবারে খরচ করা হলো অনুমোদিত burst, আর টোকেন ফুরিয়ে গেলে "দাঁড়াও" বলাটাই throttle করা — HTTP-তে যেটা **429 Too Many Requests**। বাস্তবে API gateway, login throttling বা পাবলিক API-র abuse ঠেকাতে ঠিক এভাবেই প্রতি ক্লায়েন্টকে একটা bucket দিয়ে তার request-এর হার নিয়ন্ত্রণ করা হয়।

## রেট লিমিটিং কেন?

রেট লিমিটিং ছাড়া একজন ইউজার বা একটা bot আপনার API-কে ভাসিয়ে দিতে পারে, বাকি সবার সেবা বন্ধ করে দিতে পারে আর ইনফ্রাস্ট্রাকচার খরচ বাড়িয়ে দিতে পারে। রেট লিমিটিং নিয়ন্ত্রণ করে একটা ক্লায়েন্ট একটা টাইম উইন্ডোতে কতগুলো রিকোয়েস্ট করতে পারবে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা ATM-এর দৈনিক উত্তোলন সীমার মতো — অপব্যবহার ঠেকাতে আপনি দিনে একটা নির্দিষ্ট পরিমাণই তুলতে পারেন। সীমায় পৌঁছালে আপনাকে আগামীকাল আবার চেষ্টা করতে বলা হয়।

</Callout>

<Mermaid
title="Rate Limiter as Middleware"
code={`graph LR
  C["Client"] --> RL["Rate Limiter<br/>Allow / Deny"] --> S["API Server"]`}
/>

## অ্যালগরিদমের তুলনা

| অ্যালগরিদম     | সুবিধা                      | অসুবিধা                        |
| -------------- | --------------------------- | ------------------------------ |
| Token Bucket   | মসৃণ, burst অনুমোদন করে     | ঠিকভাবে implement করা জটিল     |
| Sliding Window | নিখুঁত, boundary সমস্যা নেই | বেশি মেমরি ব্যবহার             |
| Fixed Window   | সহজ                         | উইন্ডোর প্রান্তে 2x burst দেয় |
| Leaky Bucket   | মসৃণ output rate            | বৈধ burst সামলাতে পারে না      |

## Redis দিয়ে প্রোডাকশন রেট লিমিটার

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

### মূল শিক্ষা

- Sliding window সবচেয়ে নিখুঁত অ্যালগরিদম — কোনো boundary burst সমস্যা নেই
- Token bucket সবচেয়ে ভালো যখন আপনি গড় rate-এর উপরে ছোট burst অনুমোদন করতে চান
- atomic Redis অপারেশনের জন্য **Lua script** ব্যবহার করুন — check আর increment-এর মধ্যে race condition ঠেকায়
- সবসময় `X-RateLimit-*` আর `Retry-After` হেডার ফেরত দিন যাতে ক্লায়েন্ট নিজেই throttle করতে পারে
- rate limiter এরর হলে **fail open** করুন — Redis ক্ষণিকের জন্য ডাউন বলে সব ট্রাফিক আটকে দেবেন না

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **GitHub API** অথেনটিকেটেড ইউজারদের জন্য 5,000 রিকোয়েস্ট/ঘণ্টা ব্যবহার করে, `X-RateLimit-*` হেডার ফেরত দেয়
- **Stripe** অ্যাকাউন্ট টাইপের ভিত্তিতে tiered লিমিট সহ প্রতি API key-তে rate limit করে
- **Cloudflare** তাদের edge network-এ rate limiting প্রসেস করে যাতে অপব্যবহার origin সার্ভারে পৌঁছানোর আগেই আটকানো যায়
- প্রতিটা পাবলিক API-র rate limiting দরকার — প্রোডাকশনে এটা optional নয়

</div>
