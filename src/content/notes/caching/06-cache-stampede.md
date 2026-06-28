---
title: 'Cache Stampede & Thundering Herd'
subtitle: 'What happens when a popular cache entry expires and a thousand requests hit the database simultaneously — and how to stop it.'
chapter: 6
level: 'intermediate'
readingTime: '13 min'
topics: ['stampede', 'thundering herd', 'mutex', 'probabilistic expiry', 'dog pile']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why This Exists

A cache entry expires. Ten thousand concurrent requests for that entry all find a miss at the same moment. All ten thousand fall through to the database. The database, which was handling a comfortable 100 reads/second through the cache, suddenly gets 10,000 simultaneous queries. It falls over. The cache never repopulates. Your outage deepens.

This is the **cache stampede** — also called the thundering herd or dog-pile effect.

<Callout type="info">

**Real-World Analogy**

A concert venue opens a single ticket window. The doors open and five thousand people rush the window at once. The lone ticketing agent (your database) cannot process five thousand requests simultaneously. If the queue had been managed — one person let through at a time while others wait — the ticketing agent would have coped fine.

</Callout>

The fix: ensure only **one** request populates the cache on a miss, while the rest wait for it.

## Reproducing the Problem

```typescript
async function getHomepage(): Promise<Page> {
	const cached = await redis.get('homepage');
	if (cached) return JSON.parse(cached);

	// Every concurrent request reaches here simultaneously
	// All of them hit the DB
	const page = await db.renderHomepage(); // expensive: 200ms, heavy query
	await redis.setEx('homepage', 60, JSON.stringify(page));
	return page;
}
```

With 10,000 RPS and a 60-second TTL, every 60 seconds this function hammers the database with ~600 concurrent requests (10,000 \* 200ms window). If the DB can handle 100, you have a problem.

## Fix 1 — Mutex Lock (Single Repopulation)

Only one request populates the cache. Others wait for it.

```typescript
import { createClient } from 'redis';

const redis = createClient();

async function getWithMutex<T>(key: string, loader: () => Promise<T>, ttl: number): Promise<T> {
	// 1. Try cache
	const cached = await redis.get(key);
	if (cached) return JSON.parse(cached);

	const lockKey = `lock:${key}`;
	const lockTtl = 10; // seconds — max time to hold lock

	// 2. Try to acquire lock (SET NX = only if not exists)
	const acquired = await redis.set(lockKey, '1', {
		NX: true,
		EX: lockTtl
	});

	if (acquired) {
		try {
			// We hold the lock — fetch and populate
			const value = await loader();
			await redis.setEx(key, ttl, JSON.stringify(value));
			return value;
		} finally {
			await redis.del(lockKey); // release lock
		}
	}

	// 3. Lock held by someone else — poll until cache is populated
	return waitForCache(key, loader);
}

async function waitForCache<T>(key: string, fallback: () => Promise<T>): Promise<T> {
	const maxWait = 5000; // ms
	const interval = 50; // ms
	let waited = 0;

	while (waited < maxWait) {
		await new Promise((r) => setTimeout(r, interval));
		waited += interval;

		const cached = await redis.get(key);
		if (cached) return JSON.parse(cached);
	}

	// Timeout — fall through to DB (last resort)
	return fallback();
}
```

**Problem:** Waiting requests still stress the system. If the lock holder crashes, the lock stays until it expires (up to `lockTtl` seconds of downtime for that key).

## Fix 2 — Probabilistic Early Expiry (XFetch)

Instead of waiting for the key to expire, proactively refresh it early based on a probabilistic formula. Prevents the cliff-edge expiry entirely.

```typescript
interface CacheEntry<T> {
	value: T;
	delta: number; // time it took to compute (ms)
	expiry: number; // unix ms when this entry expires
}

class ProbabilisticCache<T> {
	constructor(
		private redis: ReturnType<typeof createClient>,
		private beta = 1.0 // higher = refresh sooner
	) {}

	async get(key: string, loader: () => Promise<T>, ttl: number): Promise<T> {
		const raw = await this.redis.get(key);

		if (raw) {
			const entry: CacheEntry<T> = JSON.parse(raw);
			const now = Date.now();

			// XFetch formula: should we early-recompute?
			const shouldRecompute =
				now - entry.delta * this.beta * Math.log(Math.random()) >= entry.expiry;

			if (!shouldRecompute) {
				return entry.value; // use cached value
			}
			// Fall through to recompute
		}

		const start = Date.now();
		const value = await loader();
		const delta = Date.now() - start;

		const entry: CacheEntry<T> = {
			value,
			delta,
			expiry: Date.now() + ttl * 1000
		};

		await this.redis.setEx(key, ttl, JSON.stringify(entry));
		return value;
	}
}
```

**How it works:** Each request that reads a cache entry decides probabilistically whether to refresh early. The probability increases as expiry approaches and as the entry took longer to compute. Expensive entries get refreshed earlier. Multiple processes independently make this decision, so the cache stays warm without coordination.

This is based on the XFetch algorithm from the research paper _"Optimal Probabilistic Cache Stampede Prevention"_.

## Fix 3 — Stale-While-Revalidate

Return the stale value immediately, refresh in the background.

```typescript
interface SWREntry<T> {
	value: T;
	expiresAt: number;
	staleUntil: number; // can serve stale until this time
}

class StaleWhileRevalidate<T> {
	private refreshing = new Set<string>();

	async get(
		key: string,
		loader: () => Promise<T>,
		ttl: number,
		staleTtl: number // serve stale for up to this many extra seconds
	): Promise<T | null> {
		const raw = await this.redis.get(key);

		if (!raw) return null; // cold miss — no stale to serve

		const entry: SWREntry<T> = JSON.parse(raw);
		const now = Date.now();

		if (now > entry.staleUntil) {
			// Too stale to serve — force fresh fetch
			return this.refresh(key, loader, ttl, staleTtl);
		}

		if (now > entry.expiresAt && !this.refreshing.has(key)) {
			// Stale but servable — background refresh
			this.refreshing.add(key);
			this.refresh(key, loader, ttl, staleTtl).finally(() => this.refreshing.delete(key));
		}

		return entry.value;
	}

	private async refresh(
		key: string,
		loader: () => Promise<T>,
		ttl: number,
		staleTtl: number
	): Promise<T> {
		const value = await loader();
		const now = Date.now();
		const entry: SWREntry<T> = {
			value,
			expiresAt: now + ttl * 1000,
			staleUntil: now + (ttl + staleTtl) * 1000
		};
		await this.redis.setEx(key, ttl + staleTtl, JSON.stringify(entry));
		return value;
	}
}
```

This is what HTTP's `Cache-Control: stale-while-revalidate` header does — serve the stale response, refresh in the background, next request gets the fresh one.

## Fix 4 — Cache Warming

Prevent cold starts by pre-populating the cache before traffic hits.

```typescript
async function warmCache(): Promise<void> {
	console.log('Warming cache...');

	// Load top 1000 products by traffic
	const topProducts = await db.products.findTopByViews(1000);
	await Promise.all(
		topProducts.map((p) => redis.setEx(`product:${p.id}`, 3600, JSON.stringify(p)))
	);

	// Load all active users' sessions
	const sessions = await db.sessions.findActive();
	await Promise.all(sessions.map((s) => redis.setEx(`session:${s.id}`, 3600, JSON.stringify(s))));

	console.log(`Cache warmed: ${topProducts.length} products, ${sessions.length} sessions`);
}

// Run on deploy, before taking traffic
await warmCache();
server.listen(3000);
```

**Scheduled re-warming** for entries with long TTLs:

```typescript
// Re-warm every 50 minutes for entries with 1-hour TTL
cron.schedule('*/50 * * * *', async () => {
	const criticalKeys = await db.getCriticalCacheKeys();
	for (const { key, value, ttl } of criticalKeys) {
		await redis.setEx(key, ttl, JSON.stringify(value));
	}
});
```

## Choosing a Fix

| Scenario                                           | Solution                      |
| -------------------------------------------------- | ----------------------------- |
| Single popular key, can accept brief latency spike | Mutex lock                    |
| High-traffic key, need zero latency spikes         | Probabilistic early expiry    |
| Can tolerate brief staleness (most cases)          | Stale-while-revalidate        |
| Predictable access patterns                        | Cache warming                 |
| All of the above, high scale                       | SWR + warming + probabilistic |

For most applications: **stale-while-revalidate with a short SWR window** (5–30 seconds) is the pragmatic solution. It requires no locking, never blocks, and the brief staleness is usually acceptable.
