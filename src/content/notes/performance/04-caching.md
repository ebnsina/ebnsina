---
title: 'Caching'
subtitle: 'Cache levels, eviction policies, cache stampede, cache invalidation — and why caching is the most over-applied and under-thought optimization.'
chapter: 4
level: 'intermediate'
readingTime: '10 min'
topics: ['caching', 'Redis', 'CDN', 'cache invalidation', 'cache stampede', 'LRU', 'TTL']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A chef's mise en place: ingredients for tonight's dishes are prepped and placed within arm's reach (cache). The pantry (database) has everything, but fetching from it mid-service takes time. The mise en place is fast but limited — it only holds what was prepped, goes stale over time, and needs to be refreshed when the menu changes.

</Callout>

## Cache Levels

From fastest to slowest:

```
L1/L2/L3 CPU cache     ~1-10ns   — managed by CPU
Process memory          ~100ns    — your in-process Map/LRU
Redis/Memcached         ~0.5ms    — network hop to cache server
Database                ~5-50ms   — disk or buffer cache
CDN edge                ~10-50ms  — geographically close edge node
```

Pick the right level for the data's characteristics:

- **In-process:** fastest, no network, but lost on restart, not shared across instances
- **Redis:** shared across all instances, survives restart, slightly slower
- **CDN:** for public static content — offloads origin entirely

## In-Process LRU Cache

```typescript
import LRU from 'lru-cache';

const userCache = new LRU<string, User>({
	max: 1000, // max 1000 entries
	ttl: 5 * 60 * 1000, // 5 minute TTL
	updateAgeOnGet: false // TTL doesn't reset on read
});

async function getUser(userId: string): Promise<User> {
	const cached = userCache.get(userId);
	if (cached) return cached;

	const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
	if (user) userCache.set(userId, user.rows[0]);
	return user.rows[0];
}
```

**When to use:** reference data that changes rarely (user roles, feature flags, config). Data that's expensive to fetch but small enough to fit in memory.

**When NOT to use:** data that changes frequently, data where stale reads are unacceptable, data shared between requests in a stateless service (will be inconsistent across instances).

## Redis Caching

```typescript
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

async function getCachedOrder(orderId: string): Promise<Order | null> {
	const cached = await redis.get(`order:${orderId}`);
	if (cached) return JSON.parse(cached);

	const order = await db.findOrder(orderId);
	if (order) {
		await redis.setEx(
			`order:${orderId}`,
			300, // 5 minute TTL
			JSON.stringify(order)
		);
	}
	return order;
}

// Invalidate on update
async function updateOrder(orderId: string, data: Partial<Order>): Promise<Order> {
	const order = await db.updateOrder(orderId, data);
	await redis.del(`order:${orderId}`); // invalidate cache
	return order;
}
```

**Cache warming:** pre-populate cache before traffic hits:

```typescript
async function warmCache() {
	const topProducts = await db.query('SELECT * FROM products ORDER BY view_count DESC LIMIT 1000');

	await Promise.all(
		topProducts.rows.map((product) =>
			redis.setEx(`product:${product.id}`, 3600, JSON.stringify(product))
		)
	);
}
```

## Cache Stampede (Thundering Herd)

Cache expires. 1000 concurrent requests all see a cache miss and all hit the database simultaneously.

```
Time T:   cache expires
T+0ms:    request 1 sees miss, starts DB query
T+0ms:    request 2 sees miss, starts DB query
T+0ms:    request 1000 sees miss, starts DB query
T+50ms:   1000 DB queries complete, all populate cache
```

1000 DB queries instead of 1.

### Fix 1: Mutex (Single Flight)

Only one request fetches, others wait:

```typescript
import pLimit from 'p-limit';

const fetchLocks = new Map<string, Promise<any>>();

async function getWithLock<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
	const cached = await redis.get(key);
	if (cached) return JSON.parse(cached);

	// If another request is already fetching, wait for it
	if (fetchLocks.has(key)) {
		await fetchLocks.get(key);
		const result = await redis.get(key);
		return result ? JSON.parse(result) : fetcher();
	}

	// I'm the one fetching
	const fetchPromise = fetcher().then(async (data) => {
		await redis.setEx(key, ttl, JSON.stringify(data));
		fetchLocks.delete(key);
		return data;
	});

	fetchLocks.set(key, fetchPromise);
	return fetchPromise;
}
```

### Fix 2: Probabilistic Early Expiration

Randomly refresh the cache before it expires, based on remaining TTL:

```typescript
async function getWithEarlyExpiry<T>(
	key: string,
	fetcher: () => Promise<T>,
	ttl: number
): Promise<T> {
	const cached = await redis.get(key);
	const ttlRemaining = await redis.ttl(key);

	if (cached) {
		// Probabilistically refresh when less than 20% TTL remains
		const shouldEarlyRefresh = ttlRemaining < ttl * 0.2 && Math.random() < 0.1;

		if (!shouldEarlyRefresh) return JSON.parse(cached);
		// Fall through to refresh (current user sees cached value)
		fetcher().then((data) => redis.setEx(key, ttl, JSON.stringify(data)));
		return JSON.parse(cached);
	}

	const data = await fetcher();
	await redis.setEx(key, ttl, JSON.stringify(data));
	return data;
}
```

### Fix 3: Redis Lock

```typescript
async function getWithRedisLock<T>(
	key: string,
	fetcher: () => Promise<T>,
	ttl: number
): Promise<T> {
	const cached = await redis.get(key);
	if (cached) return JSON.parse(cached);

	const lockKey = `lock:${key}`;
	const acquired = await redis.set(lockKey, '1', { NX: true, EX: 10 });

	if (!acquired) {
		// Someone else is fetching — wait and retry
		await sleep(100);
		const retried = await redis.get(key);
		return retried ? JSON.parse(retried) : getWithRedisLock(key, fetcher, ttl);
	}

	try {
		const data = await fetcher();
		await redis.setEx(key, ttl, JSON.stringify(data));
		return data;
	} finally {
		await redis.del(lockKey);
	}
}
```

## Cache Invalidation

"There are only two hard things in computer science: cache invalidation and naming things."

**Time-based (TTL):** simplest. Stale for up to TTL seconds. Fine for most cases.

**Event-based:** invalidate on write. No staleness, but requires coordinating cache with every write path.

```typescript
// Pattern: write-through cache
async function updateProduct(productId: string, data: Partial<Product>): Promise<Product> {
	const product = await db.updateProduct(productId, data);

	// Update cache immediately (write-through)
	await redis.setEx(`product:${productId}`, 3600, JSON.stringify(product));

	// Also invalidate any list caches that include this product
	await redis.del('products:featured');
	await redis.del(`products:category:${product.categoryId}`);

	return product;
}
```

**Tag-based invalidation:**

```typescript
// Associate cache keys with tags
async function setCached(key: string, value: any, ttl: number, tags: string[]) {
	await redis.setEx(key, ttl, JSON.stringify(value));
	for (const tag of tags) {
		await redis.sAdd(`tag:${tag}`, key);
		await redis.expire(`tag:${tag}`, ttl + 60); // tag lives a bit longer
	}
}

// Invalidate all keys with a tag
async function invalidateTag(tag: string) {
	const keys = await redis.sMembers(`tag:${tag}`);
	if (keys.length > 0) {
		await redis.del(...keys, `tag:${tag}`);
	}
}

// Usage
await setCached('products:electronics', products, 3600, ['products', 'electronics']);
await setCached('products:featured', featured, 1800, ['products']);

// When any product changes:
await invalidateTag('products'); // invalidates both cache keys
```

## CDN Caching

For public content (product pages, images, static assets):

```typescript
// Express — set cache headers
app.get('/products/:id', async (req, res) => {
	const product = await getProduct(req.params.id);

	res.set({
		'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
		Vary: 'Accept-Encoding',
		ETag: `"${product.updatedAt.getTime()}"`
	});

	// Check ETag
	if (req.headers['if-none-match'] === `"${product.updatedAt.getTime()}"`) {
		return res.sendStatus(304); // not modified
	}

	res.json(product);
});
```

`stale-while-revalidate=60`: serve stale content for 60 seconds while refreshing in background. Zero latency on refresh.

**Purge on update:**

```typescript
async function updateProduct(productId: string, data: Partial<Product>) {
	const product = await db.updateProduct(productId, data);

	// Purge CDN cache (Cloudflare example)
	await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${CF_TOKEN}` },
		body: JSON.stringify({ files: [`https://api.example.com/products/${productId}`] })
	});

	return product;
}
```

## What Not to Cache

```
✗ Data that changes faster than your TTL (real-time prices, live inventory)
✗ Data that must be consistent (account balances, order totals after payment)
✗ Data personalized per user at high cardinality (1M users × 100 products = 100M cache entries)
✗ Security-sensitive queries (permissions checks, rate limit state)
✓ Reference data (product catalog, config, localization strings)
✓ Expensive aggregations (daily stats, leaderboards)
✓ External API responses (weather, exchange rates)
✓ Session data (already in Redis anyway)
```

Cache hit rate below 80% often means you're caching the wrong things, or TTLs are too short. Profile cache misses before adding more cache.
