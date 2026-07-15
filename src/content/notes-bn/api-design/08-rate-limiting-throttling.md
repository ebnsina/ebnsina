---
title: 'Rate Limiting ও Throttling'
subtitle: 'token bucket, sliding window, distributed rate limiting, আর retry-after pattern দিয়ে আপনার API-কে অপব্যবহার থেকে রক্ষা করুন।'
chapter: 8
level: 'advanced'
readingTime: '12 মিনিট'
topics: ['rate limiting', 'throttling', 'token bucket', 'sliding window', 'distributed systems']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

পাড়ার নামকরা ডাক্তার — ডাঃ আল-খোয়ারিজমির চেম্বার। রোগীর ভিড় এত বেশি যে সবাইকে একদিনে দেখা অসম্ভব, তাই চেম্বার থেকে প্রতিদিন একটা নির্দিষ্ট সংখ্যক সিরিয়াল টোকেন দেওয়া হয়। কিন্তু সবাই সমান টোকেন পায় না। ফাতিমা আল-ফিহরি নিয়মিত রোগী, তার একটা "মাসিক কার্ড" করা আছে — তাকে দিনে বেশি সিরিয়াল, এমনকি জরুরি হলে আগে দেখার সুযোগ দেওয়া হয়। আর ইবনে সিনা প্রথমবার এসেছে, ওয়াক-ইন রোগী — তার জন্য বরাদ্দ সিরিয়াল অল্প কয়েকটা।

ইবনে সিনা দুপুরে গিয়ে দেখে আজকের সিরিয়াল সব শেষ। রিসেপশনের ভদ্রলোক নম্রভাবে বললেন, "আজকের কোটা শেষ, কাল সকালে আসুন।" ঠিক তখনই দেয়ালে টাঙানো একটা বোর্ডে চোখ পড়ল ইবনে সিনার — সেখানে লেখা আজকের মোট সিরিয়াল, কতগুলো দেওয়া হয়ে গেছে, আর কতগুলো বাকি আছে। বোর্ড দেখেই বোঝা যায় কখন গেলে সিরিয়াল পাওয়া যাবে, শুধু শুধু লাইনে দাঁড়িয়ে সময় নষ্ট করতে হয় না।

এই গল্পটাই আসলে **rate limiting**। প্রতিটা রোগীর দৈনিক সিরিয়াল-বরাদ্দ হলো **per-client quota** — প্রতিটা API client-এর জন্য আলাদা করে বেঁধে দেওয়া সীমা। ফাতিমা আল-ফিহরির বেশি আর ইবনে সিনার কম সিরিয়াল পাওয়া হলো **plan/tier** — free ইউজার কম request পায়, paid ইউজার বেশি। "আজকের কোটা শেষ, কাল আসুন" মানে **429 (quota exceeded)** — সীমা পেরোলে বিনয়ের সাথে ফিরিয়ে দেওয়া, তবে কখন আবার আসতে হবে তা জানিয়ে। আর দেয়ালের বোর্ডটাই হলো **rate-limit header** (`X-RateLimit-Limit`, `X-RateLimit-Remaining`) — কত quota বাকি আছে তা client-কে আগে থেকে জানানো। বাস্তবে GitHub বা OpenAI-এর মতো public API ঠিক এভাবেই কাজ করে — free tier-এ কম, paid tier-এ বেশি quota, আর কোটা শেষ হলে 429।

## Rate Limit কেন করবেন?

rate limiting ছাড়া একটি single client আপনার সব সার্ভার রিসোর্স খেয়ে ফেলতে পারে — ইচ্ছাকৃতভাবে (DDoS attack) বা দুর্ঘটনাবশত (buggy loop যা সেকেন্ডে ১০০০ request পাঠায়)। Rate limiting আপনার API রক্ষা করে, ন্যায্য ব্যবহার নিশ্চিত করে, আর খরচ নিয়ন্ত্রণে রাখে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ATM-এর দৈনিক উত্তোলন লিমিটের মতো — অপব্যবহার ঠেকাতে আপনি প্রতিদিন একটা নির্দিষ্ট পরিমাণই তুলতে পারেন। লিমিটে পৌঁছলে আগামীকাল পর্যন্ত অপেক্ষা করতে হয়।

</Callout>

## Rate Limiting অ্যালগরিদম

### 1. Fixed Window Counter

সবচেয়ে সহজ পদ্ধতি। নির্দিষ্ট সময়-উইন্ডোতে (যেমন প্রতি মিনিটে) request গণনা করুন।

```typescript
import Redis from 'ioredis';

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
		resetAt
	};
}

// Usage: 100 requests per minute
const result = await fixedWindowRateLimit('user_42', 100, 60);
```

**সমস্যা:** দুই উইন্ডোর সীমানায় একটি client লিমিটের 2x request করতে পারে (0:59-তে 100, 1:00-তে 100)।

### 2. Sliding Window Log

প্রতিটি request-এর timestamp ট্র্যাক করুন আর গুনুন কতগুলো উইন্ডোর মধ্যে পড়ে:

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
		remaining: Math.max(0, limit - count - 1)
	};
}
```

**সমস্যা:** মেমরি-নিবিড় — প্রতিটি request-এর timestamp store করে।

### 3. Sliding Window Counter

একটি হাইব্রিড যা দুটি fixed window ব্যবহার করে sliding window-এর কাছাকাছি হিসাব করে:

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
		redis.get(previousKey).then(Number)
	]);

	// Weight the previous window by how much of it overlaps
	const elapsedInWindow = now - currentWindow;
	const previousWeight = 1 - elapsedInWindow / windowSeconds;
	const estimatedCount = Math.floor(previousCount * previousWeight) + currentCount;

	if (estimatedCount >= limit) {
		return {
			allowed: false,
			remaining: 0,
			resetAt: currentWindow + windowSeconds
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
		resetAt: currentWindow + windowSeconds
	};
}
```

### 4. Token Bucket

সবচেয়ে নমনীয় অ্যালগরিদম। একটি bucket-এ token থাকে, প্রতিটি request একটি token খরচ করে, আর একটি ধ্রুব হারে token রিফিল হয়।

```typescript
interface TokenBucket {
	tokens: number;
	lastRefill: number;
}

async function tokenBucketRateLimit(
	clientId: string,
	maxTokens: number, // Bucket capacity (burst size)
	refillRate: number // Tokens added per second
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

	const result = (await redis.eval(luaScript, 1, key, maxTokens, refillRate, now)) as number[];

	return {
		allowed: result[0] === 1,
		remaining: Math.floor(result[1]),
		retryAfter: result[2] > 0 ? Math.ceil(result[2]) : undefined
	};
}

// Example: 100 tokens max, refill 10 tokens/second
// Allows bursts of 100, sustains 10 req/s
const result = await tokenBucketRateLimit('user_42', 100, 10);
```

<Callout type="tip">

**একটি অ্যালগরিদম বেছে নেওয়া**

- **Fixed window** — সবচেয়ে সহজ, বেশিরভাগ API-এর জন্য যথেষ্ট
- **Sliding window counter** — fixed window-এর চেয়ে বেশি নির্ভুল, খুব কম overhead
- **Token bucket** — sustained rate বজায় রেখে burst অনুমোদনের জন্য সেরা
- **Sliding window log** — সবচেয়ে নির্ভুল কিন্তু সর্বোচ্চ মেমরি ব্যবহার

</Callout>

## Rate Limit Header

response header-এ সবসময় rate limit স্ট্যাটাস জানান:

```typescript
function rateLimitMiddleware(limit: number, windowSeconds: number) {
	return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
		const clientId = req.user?.id || req.ip;
		const result = await slidingWindowCounter(clientId, limit, windowSeconds);

		// Set rate limit headers on every response
		res.set('X-RateLimit-Limit', String(limit));
		res.set('X-RateLimit-Remaining', String(result.remaining));
		res.set('X-RateLimit-Reset', String(result.resetAt));

		if (!result.allowed) {
			res.set('Retry-After', String(result.resetAt - Math.floor(Date.now() / 1000)));
			return res.status(429).json({
				error: {
					code: 'RATE_LIMITED',
					message: `Rate limit exceeded. Try again in ${result.resetAt - Math.floor(Date.now() / 1000)} seconds.`,
					retryAfter: result.resetAt
				}
			});
		}

		next();
	};
}

// Apply different limits to different routes
app.use('/api/auth', rateLimitMiddleware(10, 60)); // 10 req/min for auth
app.use('/api/search', rateLimitMiddleware(30, 60)); // 30 req/min for search
app.use('/api', rateLimitMiddleware(1000, 60)); // 1000 req/min default
```

## Backoff-সহ Client-Side Retry

client-এর rate limit মানা উচিত আর সঠিক retry লজিক ইমপ্লিমেন্ট করা উচিত:

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
			throw new Error('Rate limit exceeded after max retries');
		}

		// Respect Retry-After header
		const retryAfter = response.headers.get('Retry-After');
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

	throw new Error('Unreachable');
}

// Usage
const response = await fetchWithRetry('https://api.example.com/data', {
	headers: { Authorization: 'Bearer ...' }
});
```

## Tiered Rate Limit

আলাদা আলাদা API plan আলাদা লিমিট পায়:

```typescript
interface RateLimitTier {
	requestsPerMinute: number;
	requestsPerDay: number;
	burstSize: number;
}

const tiers: Record<string, RateLimitTier> = {
	free: { requestsPerMinute: 60, requestsPerDay: 1000, burstSize: 10 },
	pro: { requestsPerMinute: 600, requestsPerDay: 50000, burstSize: 100 },
	enterprise: { requestsPerMinute: 6000, requestsPerDay: 500000, burstSize: 1000 }
};

async function tieredRateLimit(
	req: express.Request,
	res: express.Response,
	next: express.NextFunction
) {
	const client = req.client; // Set by API key middleware
	const tier = tiers[client.plan] || tiers.free;

	// Check per-minute limit
	const minuteResult = await slidingWindowCounter(client.id, tier.requestsPerMinute, 60);

	// Check daily limit
	const dailyResult = await slidingWindowCounter(`${client.id}:daily`, tier.requestsPerDay, 86400);

	if (!minuteResult.allowed || !dailyResult.allowed) {
		const retryAfter = !minuteResult.allowed
			? minuteResult.resetAt - Math.floor(Date.now() / 1000)
			: dailyResult.resetAt - Math.floor(Date.now() / 1000);

		res.set('Retry-After', String(retryAfter));
		return res.status(429).json({
			error: {
				code: 'RATE_LIMITED',
				message: 'Rate limit exceeded',
				limits: {
					perMinute: { limit: tier.requestsPerMinute, remaining: minuteResult.remaining },
					perDay: { limit: tier.requestsPerDay, remaining: dailyResult.remaining }
				},
				plan: client.plan,
				upgradeUrl: 'https://api.example.com/pricing'
			}
		});
	}

	res.set('X-RateLimit-Limit', String(tier.requestsPerMinute));
	res.set('X-RateLimit-Remaining', String(minuteResult.remaining));
	next();
}
```

<Callout type="warning">

**Rate Limiting-এর ফাঁদ**

- শুধু IP দিয়ে rate limit করবেন না — অনেক ইউজার IP শেয়ার করে (corporate NAT, mobile carrier)
- authentication endpoint rate limit করতে ভুলবেন না — brute force attack login-কে লক্ষ্য করে
- multi-server সেটআপে in-memory counter ব্যবহার করবেন না — Redis বা একটি shared store ব্যবহার করুন
- শুরুতে লিমিট খুব কম রাখবেন না — উদার দিয়ে শুরু করুন আর ডেটার ভিত্তিতে টাইট করুন
- 429 response-এ সবসময় `Retry-After` রাখুন — client-কে জানতে হবে কখন আবার চেষ্টা করবে

</Callout>

## Distributed Rate Limiting

multi-server পরিবেশে আপনার একটি shared counter দরকার:

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

	constructor(
		private redis: Redis,
		private syncIntervalMs = 5000
	) {
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

## মূল কথা

1. **Rate limiting আপনার API রক্ষা করে** অপব্যবহার থেকে, ন্যায্য ব্যবহার নিশ্চিত করে, আর খরচ নিয়ন্ত্রণ করে
2. **Token bucket** সবচেয়ে নমনীয় অ্যালগরিদম — sustained rate বজায় রেখে burst অনুমোদন করে
3. **Sliding window counter** বেশিরভাগ use case-এ নির্ভুলতা আর সরলতার মধ্যে ভারসাম্য রাখে
4. **সবসময় rate limit header রাখুন** (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`)
5. একাধিক সার্ভার জুড়ে distributed rate limiting-এর জন্য **Redis ব্যবহার করুন**
6. আপনার API ন্যায্যভাবে monetize করতে আলাদা API plan-এর জন্য **tiered limit ইমপ্লিমেন্ট করুন**
7. rate limit হলে **client-কে অবশ্যই jitter-সহ exponential backoff ইমপ্লিমেন্ট করতে হবে**
