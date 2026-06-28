---
title: 'Cache Strategies'
subtitle: "Cache-aside, read-through, write-through, write-behind — when to use each and what breaks when you don't."
chapter: 2
level: 'beginner'
readingTime: '14 min'
topics: ['cache-aside', 'read-through', 'write-through', 'write-behind', 'patterns']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A cook who preps ingredients before service (write-through) versus one who grabs from the pantry only when needed (cache-aside) — same kitchen, different rhythm.

</Callout>

## The Four Strategies

Every caching system is built on one of four patterns — or a combination. The choice determines who owns cache population, how stale data appears, and what happens on writes.

| Strategy      | Who reads from DB | Who writes to DB    | Consistency |
| ------------- | ----------------- | ------------------- | ----------- |
| Cache-aside   | Application       | Application         | Eventual    |
| Read-through  | Cache layer       | Application         | Eventual    |
| Write-through | Application       | Cache layer → DB    | Strong      |
| Write-behind  | Application       | Cache layer (async) | Eventual    |

## Cache-Aside (Lazy Loading)

The most common pattern. The application owns all the logic: check cache, miss → fetch from DB, populate cache.

```typescript
class UserService {
	constructor(
		private cache: RedisClient,
		private db: Database
	) {}

	async getUser(id: string): Promise<User> {
		const cacheKey = `user:${id}`;

		// 1. Try cache
		const cached = await this.cache.get(cacheKey);
		if (cached) return JSON.parse(cached);

		// 2. Cache miss — fetch from DB
		const user = await this.db.users.findById(id);
		if (!user) throw new NotFoundError(`User ${id} not found`);

		// 3. Populate cache (TTL: 5 minutes)
		await this.cache.setex(cacheKey, 300, JSON.stringify(user));

		return user;
	}

	async updateUser(id: string, data: Partial<User>): Promise<User> {
		const user = await this.db.users.update(id, data);

		// Invalidate — don't update cache, let next read repopulate
		await this.cache.del(`user:${id}`);

		return user;
	}
}
```

**Pros:** Simple. Only caches what's actually requested. Cache survives Redis restarts (just repopulates from DB on next request).

**Cons:** First request after a miss is slow. Can serve stale data if you forget to invalidate on write.

<Callout type="tip">

Cache-aside is the right default. Use it until you have a specific reason not to.

</Callout>

## Read-Through

The cache layer itself fetches from the database on a miss, transparently to the application. The application only talks to the cache.

```typescript
// The cache wraps the data source
class ReadThroughCache<T> {
	private store = new Map<string, { value: T; expiresAt: number }>();

	constructor(private loader: (key: string) => Promise<T>) {}

	async get(key: string): Promise<T> {
		const entry = this.store.get(key);
		if (entry && Date.now() < entry.expiresAt) {
			return entry.value; // hit
		}

		// miss — load through
		const value = await this.loader(key);
		this.store.set(key, { value, expiresAt: Date.now() + 300_000 });
		return value;
	}
}

// Application just calls get — doesn't know about DB
const userCache = new ReadThroughCache<User>((id) => db.users.findById(id));

const user = await userCache.get('user:123');
```

**Pros:** Simpler application code — one place handles all cache population logic.

**Cons:** Cold start still has latency. Harder to handle cache misses differently (e.g., returning null vs throwing). Libraries like `node-cache-manager` implement this pattern.

## Write-Through

Every write goes through the cache to the database. Cache and DB are always in sync.

```typescript
class WriteThroughUserCache {
	async saveUser(user: User): Promise<void> {
		// Write to DB and cache atomically
		await Promise.all([
			this.db.users.upsert(user),
			this.cache.setex(`user:${user.id}`, 3600, JSON.stringify(user))
		]);
	}

	async getUser(id: string): Promise<User | null> {
		const cached = await this.cache.get(`user:${id}`);
		if (cached) return JSON.parse(cached);

		// Only miss on first access or after eviction
		const user = await this.db.users.findById(id);
		if (user) {
			await this.cache.setex(`user:${id}`, 3600, JSON.stringify(user));
		}
		return user;
	}
}
```

**Pros:** Cache is always fresh — no stale reads. No invalidation logic needed.

**Cons:** Write latency increases (two writes). Cache fills with data that may never be read. Works best with read-through to handle initial loads.

<Callout type="info">

Write-through is often combined with read-through. Together they guarantee the cache is always consistent — but at the cost of write performance and potentially caching rarely-read data.

</Callout>

## Write-Behind (Write-Back)

Writes go to cache immediately, then the cache asynchronously flushes to the database. The application gets fast write acknowledgment.

```typescript
class WriteBehindCache {
	private dirtyKeys = new Set<string>();
	private flushInterval: NodeJS.Timeout;

	constructor(
		private cache: Map<string, unknown>,
		private db: Database,
		flushEveryMs = 1000
	) {
		// Flush dirty keys to DB every second
		this.flushInterval = setInterval(() => this.flush(), flushEveryMs);
	}

	async write(key: string, value: unknown): Promise<void> {
		this.cache.set(key, value); // immediate, synchronous
		this.dirtyKeys.add(key); // mark for async flush
		// Returns immediately — DB write happens later
	}

	private async flush(): Promise<void> {
		const keys = [...this.dirtyKeys];
		this.dirtyKeys.clear();

		await Promise.all(
			keys.map(async (key) => {
				const value = this.cache.get(key);
				if (value !== undefined) {
					await this.db.set(key, value);
				}
			})
		);
	}

	destroy(): void {
		clearInterval(this.flushInterval);
	}
}
```

**Pros:** Lowest write latency. Can batch multiple writes into one DB operation. Great for counters, view counts, analytics.

**Cons:** Data loss risk if cache crashes before flushing. Complex failure handling. Not appropriate for financial or critical data.

<Callout type="warning">

**Never use write-behind for anything where losing a few seconds of writes is unacceptable** — payments, inventory changes, user-generated content. The performance gain isn't worth the data loss risk.

</Callout>

## Refresh-Ahead

Proactively refresh cache before entries expire, based on access patterns.

```typescript
class RefreshAheadCache<T> {
	private store = new Map<
		string,
		{
			value: T;
			expiresAt: number;
			refreshAt: number; // refresh when this passes, before expiry
		}
	>();

	constructor(
		private loader: (key: string) => Promise<T>,
		private ttlMs: number,
		private refreshThreshold = 0.8 // refresh when 80% of TTL has passed
	) {}

	async get(key: string): Promise<T | null> {
		const entry = this.store.get(key);

		if (!entry) return null; // cold miss

		const now = Date.now();

		// Trigger background refresh if nearing expiry
		if (now > entry.refreshAt && now < entry.expiresAt) {
			this.refreshInBackground(key); // don't await
		}

		if (now > entry.expiresAt) return null; // expired

		return entry.value;
	}

	private async refreshInBackground(key: string): Promise<void> {
		const value = await this.loader(key);
		const now = Date.now();
		this.store.set(key, {
			value,
			expiresAt: now + this.ttlMs,
			refreshAt: now + this.ttlMs * this.refreshThreshold
		});
	}
}
```

**Pros:** Eliminates most cache misses. Popular keys are never cold.

**Cons:** Wastes work refreshing keys that won't be read again. Complex to implement correctly. Overkill for most applications.

## Choosing a Strategy

```
Start here:
  Is your read:write ratio > 10:1?
    Yes → Cache-aside. Simple, effective.
    No  → Is write latency critical?
            Yes → Write-behind (accept data loss risk)
            No  → Write-through (if consistency matters)

Do you need zero stale reads?
  Yes → Write-through + short TTL
  No  → Cache-aside with reasonable TTL

Multiple services sharing the same data?
  Yes → Distributed cache (Redis) + cache-aside
  No  → In-process cache, don't bother with Redis
```

## Key Design Rules

**Always expire entries.** A cache with no TTL is a memory leak with extra steps. Even a 24-hour TTL is better than never expiring.

**Make cache keys deterministic.** `user:${id}` not `user_${Date.now()}`. If the same inputs don't produce the same key, you'll never hit.

**Namespace your keys.** Prefix by service or entity type: `auth:session:abc123`, `catalog:product:456`. Prevents collisions when sharing Redis across services.

**Serialize consistently.** `JSON.stringify` produces different output depending on key order in some environments. Use a canonical serializer or be aware of this.

```typescript
// Good: deterministic key
const key = `product:${productId}:v2`;

// Bad: non-deterministic
const key = `product:${productId}:${Date.now()}`;

// Good: namespaced
const key = `catalog:product:${productId}`;

// Canonical JSON for complex keys
import { stringify } from 'fast-json-stable-stringify';
const key = `search:${stringify({ query, page, filters })}`;
```
