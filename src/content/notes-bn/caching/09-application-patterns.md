---
title: 'অ্যাপ্লিকেশন ক্যাশিং প্যাটার্ন'
subtitle: 'Fragment caching, query result caching, session store, computed value memoization — বাস্তব অ্যাপ্লিকেশনের জন্য কাজে লাগার মতো প্যাটার্ন।'
chapter: 9
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['fragment caching', 'query cache', 'session store', 'memoization', 'patterns']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

করিমের দর্জির দোকানে সকাল থেকে ভিড়। ও লক্ষ্য করেছে, প্রায় প্রতিটা পাঞ্জাবিতে একই ধরনের কলার আর হাতার কাফ লাগে। তাই ও ফাঁকা সময়ে কয়েক ডজন কলার আর কাফ আগেই কেটে-সেলাই করে একটা বাক্সে রেখে দেয়। নতুন অর্ডার এলে পুরো পাঞ্জাবি শূন্য থেকে বানায় না — শুধু শরীরের কাপড়টা সেলাই করে, আর বাক্স থেকে বানানো কলার-কাফ বসিয়ে দেয়। এই আগে থেকে বানানো টুকরোগুলো বারবার কাজে লাগানোই হলো fragment caching। আবার রহিম ভাই যখন দ্বিতীয়বার আসেন, করিম নতুন করে ফিতা দিয়ে মাপ নেয় না — খাতা খুলে গতবারের বুক-কোমর-হাতার মাপ দেখে নেয়। একই মানুষের একই মাপ বারবার না মেপে আগের হিসাবটা মনে রাখা — এটাই memoization।

দোকানের এক কোণে করিমের একটা ড্রয়ার আছে, যেখানে প্রতিটা নিয়মিত খদ্দেরের আলাদা ফাইল — ফাতেমা খালার পছন্দের কাপড়, রহিমের মাপ, আগের বকেয়া। যতক্ষণ মানুষটা নিয়মিত আসেন ততক্ষণ ফাইল থাকে, অনেকদিন না এলে ফাইল সরিয়ে দেওয়া হয় — ঠিক TTL-এর মতো। এটাই session store। আর দেয়ালে ঝোলানো একটা কাগজে করিম বড় করে লিখে রেখেছে যে সবাই বারবার জিজ্ঞেস করে: "কাফটিং চার্জ কত, ডেলিভারি কবে।" প্রতিবার মুখে উত্তর না দিয়ে ও কাগজটা দেখিয়ে দেয় — এটাই query-result cache, একটা বারবার আসা প্রশ্নের উত্তর একবার হিসাব করে জমিয়ে রাখা।

গল্পের বাক্সভরা আগে-বানানো কলার-কাফ হলো **fragment caching** (রেন্ডার করা টুকরো আলাদা করে জমানো), খাতায় রাখা পুরনো মাপ হলো **memoization** (একই ইনপুটের ব্যয়বহুল হিসাব আর না করা), খদ্দেরের ফাইল-ড্রয়ার হলো **session store**, আর দেয়ালের প্রশ্ন-উত্তরের কাগজ হলো **query cache**। বাস্তব অ্যাপে ঠিক এভাবেই আমরা HTML টুকরো, ইউজারের সেশন, বারবার আসা কোয়েরির ফলাফল আর ব্যয়বহুল কম্পিউটেশন আলাদা আলাদা TTL দিয়ে ক্যাশ করি — যাতে সার্ভার প্রতিবার শূন্য থেকে সব বানাতে না হয়।

## অ্যাপ্লিকেশন-লেভেল ক্যাশিং কেন

HTTP caching আপনার সার্ভারকে একই URL-এর বারবার রিকোয়েস্ট থেকে রক্ষা করে। Database caching কোয়েরির ফলাফল জমা রাখে। কিন্তু এদের মাঝখানে একটা স্তর আছে — আপনার অ্যাপ্লিকেশনের ভেতরে — যেখানে ব্যয়বহুল কম্পিউটেশন ঘটে যা এই দুটোর কোনোটার সাথেই পরিষ্কারভাবে খাপ খায় না।

সমস্যাটা হলো: ফাংশন কল ব্যয়বহুল। সেটা পাঁচটা টেবিল জয়েন করা একটা database query হোক, একটা third-party API কল হোক, একটা রেন্ডার করা HTML fragment হোক, কিংবা একটা computed permission check হোক — যখন ফলাফল বদলায় না তখন সেটা 1000 বার কল করা নিছক অপচয়।

<Callout type="info">

**বাস্তব-জীবনের উপমা**

যে ট্যাক্স অ্যাকাউন্ট্যান্ট আপনার প্রতিটা প্রশ্নের জন্য পুরো ট্যাক্স রিটার্ন নতুন করে হিসাব করে, সে ধীর ও ব্যয়বহুল। যিনি মাঝপথের ফলাফলগুলো একটা খসড়া কাগজে লিখে রাখেন — এবং শুধু তখনই পুনরায় হিসাব করেন যখন নিচের সংখ্যাগুলো বদলায় — তিনি দ্রুত। অ্যাপ্লিকেশন ক্যাশিং হলো সেই খসড়া কাগজ।

</Callout>

## Query Result Caching

ব্যয়বহুল database query-র ফলাফল ক্যাশ করুন:

```typescript
class QueryCache {
	constructor(private redis: RedisClient) {}

	async query<T>(key: string, queryFn: () => Promise<T>, ttl = 60): Promise<T> {
		const cached = await this.redis.get(key);
		if (cached) return JSON.parse(cached);

		const result = await queryFn();
		await this.redis.setEx(key, ttl, JSON.stringify(result));
		return result;
	}
}

const qc = new QueryCache(redis);

// Cache expensive aggregate query for 5 minutes
const stats = await qc.query(
	'stats:dashboard:2026-05',
	() =>
		db.query(`
    SELECT
      COUNT(*) AS total_orders,
      SUM(amount) AS revenue,
      AVG(amount) AS avg_order
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '30 days'
  `),
	300
);
```

**প্যারামিটারাইজড কোয়েরির জন্য key composition:**

```typescript
import { stringify } from 'fast-json-stable-stringify';

function queryKey(name: string, params: object): string {
	return `query:${name}:${stringify(params)}`;
}

const users = await qc.query(
	queryKey('users.search', { role: 'admin', page: 1, limit: 20 }),
	() => db.users.search({ role: 'admin', page: 1, limit: 20 }),
	60
);
```

## Session Store

Session হলো ক্যাশের একটা ক্লাসিক ব্যবহার: ছোট, বারবার পড়া হয়, এবং একটা TTL-এর সাথে বাঁধা।

```typescript
import { randomBytes } from 'crypto';

interface Session {
	userId: string;
	roles: string[];
	createdAt: number;
}

class SessionStore {
	private TTL = 86400; // 24 hours

	constructor(private redis: RedisClient) {}

	async create(userId: string, roles: string[]): Promise<string> {
		const sessionId = randomBytes(32).toString('hex');
		const session: Session = { userId, roles, createdAt: Date.now() };
		await this.redis.setEx(`session:${sessionId}`, this.TTL, JSON.stringify(session));
		return sessionId;
	}

	async get(sessionId: string): Promise<Session | null> {
		const raw = await this.redis.get(`session:${sessionId}`);
		return raw ? JSON.parse(raw) : null;
	}

	async touch(sessionId: string): Promise<void> {
		// Reset TTL on each request (sliding expiry)
		await this.redis.expire(`session:${sessionId}`, this.TTL);
	}

	async destroy(sessionId: string): Promise<void> {
		await this.redis.del(`session:${sessionId}`);
	}
}

// Middleware
async function sessionMiddleware(req, res, next): Promise<void> {
	const sessionId = req.cookies?.sessionId;
	if (!sessionId) return next();

	const session = await sessions.get(sessionId);
	if (!session) return next();

	await sessions.touch(sessionId); // sliding expiry
	req.session = session;
	next();
}
```

## Memoization

একটা pure function-এর ফলাফল তার আর্গুমেন্ট দিয়ে key করে ক্যাশ করুন। ইন-প্রসেস কিংবা ডিস্ট্রিবিউটেড — দুটোতেই কাজ করে:

```typescript
// In-process memoization (survives only in this process)
function memoize<TArgs extends unknown[], TReturn>(
	fn: (...args: TArgs) => TReturn,
	keyFn: (...args: TArgs) => string = (...args) => JSON.stringify(args)
): (...args: TArgs) => TReturn {
	const cache = new Map<string, TReturn>();

	return (...args: TArgs): TReturn => {
		const key = keyFn(...args);
		if (cache.has(key)) return cache.get(key)!;

		const result = fn(...args);
		cache.set(key, result);
		return result;
	};
}

// Memoize a permission check
const canAccess = memoize(
	(userId: string, resource: string): boolean => {
		return computePermissions(userId, resource);
	},
	(userId, resource) => `${userId}:${resource}`
);
```

**Redis দিয়ে async memoization:**

```typescript
function memoizeAsync<TArgs extends unknown[], TReturn>(
	fn: (...args: TArgs) => Promise<TReturn>,
	options: { ttl: number; keyFn?: (...args: TArgs) => string }
) {
	const { ttl, keyFn = (...args) => JSON.stringify(args) } = options;

	return async (...args: TArgs): Promise<TReturn> => {
		const key = `memo:${fn.name}:${keyFn(...args)}`;

		const cached = await redis.get(key);
		if (cached) return JSON.parse(cached);

		const result = await fn(...args);
		await redis.setEx(key, ttl, JSON.stringify(result));
		return result;
	};
}

const getPermissions = memoizeAsync(async (userId: string) => db.permissions.forUser(userId), {
	ttl: 300,
	keyFn: (userId) => userId
});
```

## Fragment Caching

পুরো রেসপন্সের বদলে আংশিক আউটপুট ক্যাশ করুন — রেন্ডার করা HTML স্নিপেট, আংশিক API payload।

```typescript
// Cache just the expensive part of a response
async function getProductPage(productId: string): Promise<ProductPage> {
	const [product, cachedRelated, cachedReviews] = await Promise.all([
		getProduct(productId), // always fresh
		cache.get(`related:${productId}`) as Promise<Product[] | null>, // cached
		cache.get(`reviews:${productId}`) as Promise<Review[] | null> // cached
	]);

	const related =
		cachedRelated ??
		(await fetchAndCache(
			`related:${productId}`,
			() => getRelatedProducts(productId),
			600 // 10 min — related products change slowly
		));

	const reviews =
		cachedReviews ??
		(await fetchAndCache(
			`reviews:${productId}`,
			() => getRecentReviews(productId),
			60 // 1 min — reviews can change frequently
		));

	return { product, related, reviews };
}
```

এটা পুরো-রেসপন্স ক্যাশিংয়ের চেয়ে আরও সূক্ষ্ম — প্রতিটা fragment-এর আলাদা TTL, যা তাদের আসল পরিবর্তনের হারের সাথে মেলে।

## Computed Values ও Aggregation

যেসব মান চাহিদামাফিক বের করা ব্যয়বহুল, সেগুলো আগে থেকে হিসাব করে ক্যাশ করে রাখুন:

```typescript
class Leaderboard {
	private CACHE_KEY = 'leaderboard:top100';
	private TTL = 60; // rebuild every minute

	async getTop100(): Promise<LeaderboardEntry[]> {
		const cached = await redis.get(this.CACHE_KEY);
		if (cached) return JSON.parse(cached);

		// Expensive: scans millions of user records
		const entries = await db.query(`
      SELECT user_id, SUM(points) AS total
      FROM point_events
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY user_id
      ORDER BY total DESC
      LIMIT 100
    `);

		await redis.setEx(this.CACHE_KEY, this.TTL, JSON.stringify(entries));
		return entries;
	}

	async addPoints(userId: string, points: number): Promise<void> {
		await db.pointEvents.insert({ userId, points });
		// Don't invalidate — let TTL handle it
		// Leaderboard can be 1 minute stale — that's fine
	}
}
```

যখন রিয়েল-টাইম নির্ভুলতা বেশি জরুরি, তখন leaderboard-টা ইনক্রিমেন্টালভাবে মেইনটেইন করুন:

```typescript
// Use a sorted set — O(log N) updates, O(1) rank queries
async function addPoints(userId: string, points: number): Promise<void> {
	await redis.zIncrBy('leaderboard:live', points, userId);
}

async function getTop100(): Promise<Array<{ userId: string; score: number }>> {
	return redis.zRangeWithScores('leaderboard:live', 0, 99, { REV: true });
}
```

## Deduplication Cache

একই event দুইবার প্রসেস হওয়া ঠেকান (idempotency):

```typescript
class IdempotencyCache {
	async processOnce<T>(
		idempotencyKey: string,
		handler: () => Promise<T>,
		ttl = 86400 // 24h
	): Promise<T> {
		const existingResult = await redis.get(`idempotent:${idempotencyKey}`);
		if (existingResult) {
			return JSON.parse(existingResult); // return cached result
		}

		const result = await handler();
		await redis.setEx(`idempotent:${idempotencyKey}`, ttl, JSON.stringify(result));
		return result;
	}
}

// Webhook handler — safe to retry
app.post('/webhooks/payment', async (req, res) => {
	const { idempotencyKey, payload } = req.body;

	const result = await idempotencyCache.processOnce(idempotencyKey, () => processPayment(payload));

	res.json(result);
});
```

## Negative Caching

কোনো জিনিস যে অস্তিত্বহীন, সেই তথ্যটাই ক্যাশ করুন — এতে অস্তিত্বহীন key-এর জন্য বারবার DB lookup ঠেকানো যায়:

```typescript
const CACHE_NULL = '__NULL__';

async function getUser(id: string): Promise<User | null> {
	const cached = await redis.get(`user:${id}`);

	if (cached === CACHE_NULL) return null; // cached non-existence
	if (cached) return JSON.parse(cached);

	const user = await db.users.findById(id);

	if (!user) {
		// Cache the miss for 60s — prevents DB hammering for bogus IDs
		await redis.setEx(`user:${id}`, 60, CACHE_NULL);
		return null;
	}

	await redis.setEx(`user:${id}`, 300, JSON.stringify(user));
	return user;
}
```

<Callout type="warning">

**Negative cache-এর জন্য ছোট TTL ব্যবহার করুন।** কোনো ইউজার সাইন আপ করলে, আপনি চাইবেন না যে অন্য সার্ভিসগুলো কয়েক মিনিট ধরে negative cache রেসপন্স পেতে থাকুক। ডেটাবেসকে রক্ষা করতে অথচ দৃশ্যমান অসামঞ্জস্য এড়াতে সাধারণত 30–60 সেকেন্ডই যথেষ্ট।

</Callout>
