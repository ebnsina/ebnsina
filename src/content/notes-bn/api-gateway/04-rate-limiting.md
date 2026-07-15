---
title: 'Rate Limiting at the Gateway'
subtitle: 'Fixed window, sliding window, token bucket — service code-এ হাত না দিয়েই আপনার backend-কে abuse থেকে বাঁচান আর fair usage enforce করুন।'
chapter: 4
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['rate limiting', 'token bucket', 'sliding window', 'Redis', 'throttling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

সাবওয়ে স্টেশনের একটা turnstile — এটা একবারে একজনকে যেতে দেয়, একটা গতি বজায় রাখে, আর আপনি কে বা কোথায় যাচ্ছেন তা নিয়ে মাথা ঘামায় না। প্ল্যাটফর্ম (আপনার backend) কখনো ভিড় দেখে না; সে শুধু একটা স্থির স্রোত দেখে।

</Callout>

## গল্পে বুঝি

শহরের সবচেয়ে বড় অ্যামিউজমেন্ট পার্ক চালান আল-খোয়ারিজমি। ভেতরে রোলার কোস্টার, খাবারের স্টল, বাথরুম — সব আছে, কিন্তু পুরো পার্কে ঢোকার রাস্তা মাত্র একটাই, সামনের মেইন গেট। ছুটির দিনে যদি হাজার হাজার লোক একসাথে হুড়মুড়িয়ে ঢুকে পড়ে, তাহলে প্রতিটা রাইডে বিপজ্জনক ভিড় জমে, খাবারের লাইন গেটের বাইরে চলে যায়, বাথরুম উপচে পড়ে — পুরো পার্ক অচল। তাই আল-খোয়ারিজমি একটা সহজ নিয়ম বসালেন: মেইন গেট দিয়ে ঘণ্টায় সর্বোচ্চ এত হাজার লোককেই ঢুকতে দেওয়া হবে, তার বেশি নয়।

গেটের দারোয়ান ফাতিমা আল-ফিহরি একটা কাউন্টার হাতে দাঁড়িয়ে থাকেন। কোটা পূর্ণ হয়ে গেলে বাড়তি ভিজিটরদের হয় বাইরে অপেক্ষা করতে বলা হয়, নয়তো "এই ঘণ্টায় আর জায়গা নেই, একটু পরে আসুন" বলে ফিরিয়ে দেওয়া হয়। মজার ব্যাপার — ভেতরের কোনো রাইড অপারেটরকে আর আলাদা করে ভিড় সামলাতে হয় না। একটা গেটে ভিড় থামালেই ভেতরের সব রাইড, সব স্টল, সব বাথরুম একসাথে বেঁচে যায়।

এই গল্পটাই হলো gateway-তে **rate limiting**। একটাই মেইন গেট = আপনার API gateway, যেখান দিয়ে সব traffic ঢোকে। ঘণ্টায় ভিজিটর ক্যাপ করা = প্রতি client-এর request rate limit করা। ভেতরের কোনো রাইড অতিরিক্ত ভিড়ে না ভাঙা = সব backend service একসাথে overload থেকে বাঁচা। কোটার বেশি ভিজিটরকে অপেক্ষা করানো বা ফিরিয়ে দেওয়া = gateway থেকে throttle করা বা **429** (Too Many Requests) ফেরত দেওয়া। বাস্তবে Cloudflare, Kong বা AWS API Gateway ঠিক এভাবেই একটা জায়গায় limit বসিয়ে পেছনের ডজনখানেক service-কে একসাথে abuse আর traffic spike থেকে রক্ষা করে — প্রতিটা service-এ আলাদা করে পাহারা বসানোর দরকার পড়ে না।

## কেন Gateway-তে

প্রতিটা সার্ভিসে rate limiting অতিরিক্ত আর অসামঞ্জস্যপূর্ণ। gateway-তে করলে আপনি পান:

- limit globally বদলানোর একটাই config
- request কোনো service resource খরচ করার আগেই enforce হওয়া limit
- একত্রিত ভিউ: সব সার্ভিস মিলিয়ে per-user limit, per-service bucket নয়

## Fixed Window

একটা fixed time window-এ (যেমন চলতি মিনিট) request গোনা। সহজ, তবে window-এর প্রান্তে একটা burst সমস্যা আছে।

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

**edge burst সমস্যা:** মিনিটে 60-request limit থাকলে, একটা client 11:59-এ 60টা আর 12:00-এ 60টা পাঠাতে পারে — 2 সেকেন্ডে 120টা request। sliding window এটা ঠিক করে।

## Sliding Window

চলতি ক্যালেন্ডার window-এ নয়, শেষ N সেকেন্ডে request গোনা:

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

বেশি নির্ভুল, তবে প্রতিটা request-এর জন্য একটা করে Redis entry রাখে। খুব বেশি traffic-এর key-র জন্য sorted set বড় হয়ে যায় — শুধু শেষ N entry রাখতে `ZREMRANGEBYRANK` দিয়ে cap করুন।

## Token Bucket

সবচেয়ে মসৃণ algorithm। একটা bucket একটা স্থির হারে (refill rate) ভরে। প্রতিটা request একটা token খরচ করে। bucket capacity পর্যন্ত burst অনুমোদিত।

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

## Response Header

সবসময় client-কে তাদের rate limit status জানান:

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

`Retry-After` header ভালো-আচরণের client-কে আপনাকে আরও জোরে হাতুড়ি না মেরে নিজে থেকেই পিছিয়ে যেতে দেয়।

## Limit Key

আপনি কীসের উপর limit বসান তা attack surface ঠিক করে দেয়:

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

**Layered limit** — একসাথে একাধিক limit বসানো:

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

production-এ নিজের বানানোর চেয়ে battle-tested plugin ব্যবহার করুন:

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

Kong Redis atomicity, header injection আর 429 response সামলায়। আপনার কাজ হলো per route আর per consumer tier limit configure করা।
