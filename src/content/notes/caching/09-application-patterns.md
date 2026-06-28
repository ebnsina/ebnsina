---
title: 'Application Caching Patterns'
subtitle: 'Fragment caching, query result caching, session stores, computed value memoization — practical patterns for real applications.'
chapter: 9
level: 'intermediate'
readingTime: '13 min'
topics: ['fragment caching', 'query cache', 'session store', 'memoization', 'patterns']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Application-Level Caching

HTTP caching protects your server from repeat requests for the same URL. Database caching stores query results. But there's a middle layer — within your application — where expensive computation happens that doesn't map cleanly to either.

The problem: function calls are expensive. Whether it's a database query that joins five tables, a third-party API call, a rendered HTML fragment, or a computed permission check — calling it 1000 times when the result doesn't change is waste.

<Callout type="info">

**Real-World Analogy**

A tax accountant who recalculates your entire tax return every time you ask a question is slow and expensive. One who writes the intermediate results on a scratch pad — and only recalculates when the underlying numbers change — is fast. Application caching is the scratch pad.

</Callout>

## Query Result Caching

Cache the result of expensive database queries:

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

**Key composition for parameterized queries:**

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

Sessions are a classic cache use case: small, frequently read, tied to a TTL.

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

Cache the result of a pure function keyed by its arguments. Works for in-process or distributed:

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

**Async memoization with Redis:**

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

Cache partial outputs — rendered HTML snippets, partial API payloads — rather than full responses.

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

This is more granular than full-response caching — different fragments have different TTLs matching their actual rate of change.

## Computed Values and Aggregations

Pre-compute and cache values that are expensive to derive on demand:

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

When real-time accuracy matters more, maintain the leaderboard incrementally:

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

Prevent processing the same event twice (idempotency):

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

Cache the fact that something doesn't exist, preventing repeated DB lookups for non-existent keys:

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

**Use short TTLs for negative caches.** If a user signs up, you don't want other services to keep getting a negative cache response for minutes. 30–60 seconds is usually enough to protect the database without causing visible inconsistency.

</Callout>
