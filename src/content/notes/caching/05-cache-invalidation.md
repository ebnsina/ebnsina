---
title: 'Cache Invalidation'
subtitle: 'The hardest problem in computer science — TTL, event-driven purging, versioned keys, and when to accept staleness.'
chapter: 5
level: 'intermediate'
readingTime: '14 min'
topics: ['invalidation', 'TTL', 'versioned keys', 'event-driven', 'consistency']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Cache Invalidation Exists

Every cache is a copy. The moment a copy exists, it can diverge from the original. Invalidation is the mechanism that decides when to throw the copy away.

The problem it solves: how do you keep fast cached reads consistent with slow authoritative writes, without making every read slow or every write complicated?

<Callout type="info">

**Real-World Analogy**

A whiteboard in an office shows the quarterly targets. The finance team updates the spreadsheet. Unless someone erases the whiteboard and rewrites it, people will act on wrong numbers. Invalidation is the act of erasing the whiteboard — the question is who does it, when, and whether anyone notices the gap.

</Callout>

Phil Karlton's quip stands: _"There are only two hard things in computer science: cache invalidation and naming things."_ The difficulty is fundamental — cache and database are two sources of truth, and distributed systems have no perfect solution, only tradeoffs.

## Strategy 1 — TTL (Time-Based Expiry)

The simplest approach: let entries expire automatically. After TTL seconds, the next read triggers a fresh fetch.

```typescript
await redis.setEx(`product:${id}`, 300, JSON.stringify(product)); // 5 min TTL
```

**When it works:** When you can tolerate stale data for the TTL duration. Product catalog, user profiles, config values — most things in most applications.

**When it fails:** Low tolerance for staleness. If a user changes their password, a 5-minute TTL means the old data stays valid for 5 more minutes.

**TTL tuning guide:**

```
User profile:       60s   — changes rarely, staleness rarely matters
Product price:      30s   — price changes have business impact
Config flags:       30s   — want fast feature flag rollouts
Rendered HTML:      300s  — expensive to generate, fine to be stale
Auth session:       match session lifetime exactly
Real-time data:     don't cache, or 1–5s max
```

<Callout type="tip">

**Jitter your TTLs.** If 10,000 cache entries all expire at the same second (set during a cold-start batch load), you get a miss storm. Add random jitter: `ttl + Math.floor(Math.random() * 30)`.

</Callout>

## Strategy 2 — Invalidate on Write

Delete the cache entry whenever the underlying data changes. The next read repopulates it.

```typescript
class ProductService {
	async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
		// 1. Write to DB
		const product = await this.db.products.update(id, data);

		// 2. Invalidate cache — next read will repopulate
		await this.redis.del(`product:${id}`);

		return product;
	}

	async getProduct(id: string): Promise<Product> {
		const cached = await this.redis.get(`product:${id}`);
		if (cached) return JSON.parse(cached);

		const product = await this.db.products.findById(id);
		await this.redis.setEx(`product:${id}`, 300, JSON.stringify(product));
		return product;
	}
}
```

**The race condition:** Between the delete and the next repopulation, a write can sneak in.

```
T1: Writer updates DB, deletes cache
T2: Reader misses cache, reads old DB value (replica lag), populates cache with stale data
T3: Writer's new value is in DB but cache has old value
```

The fix: **delete after write, not before**. And use replica-aware reads when cache misses on critical paths.

## Strategy 3 — Versioned Keys

Instead of invalidating, change the key. Old key stays in cache until evicted, new key is populated fresh.

```typescript
class VersionedCache {
	async getVersion(entity: string, id: string): Promise<number> {
		const v = await this.redis.get(`version:${entity}:${id}`);
		return v ? parseInt(v) : 1;
	}

	async bumpVersion(entity: string, id: string): Promise<number> {
		return this.redis.incr(`version:${entity}:${id}`);
	}

	cacheKey(entity: string, id: string, version: number): string {
		return `${entity}:${id}:v${version}`;
	}

	async get<T>(entity: string, id: string): Promise<T | null> {
		const version = await this.getVersion(entity, id);
		const key = this.cacheKey(entity, id, version);
		const cached = await this.redis.get(key);
		return cached ? JSON.parse(cached) : null;
	}

	async set<T>(entity: string, id: string, value: T, ttl: number): Promise<void> {
		const version = await this.getVersion(entity, id);
		const key = this.cacheKey(entity, id, version);
		await this.redis.setEx(key, ttl, JSON.stringify(value));
	}

	async invalidate(entity: string, id: string): Promise<void> {
		// Just bump the version — old keys expire naturally
		await this.bumpVersion(entity, id);
	}
}
```

**Pros:** No race condition between delete and repopulation. Old readers keep using their version until TTL.

**Cons:** Old keys accumulate until eviction. Extra Redis call per operation to fetch version number.

## Strategy 4 — Event-Driven Invalidation

Publish invalidation events via a message bus. All cache nodes subscribe and purge matching keys.

```typescript
// Publisher (in the service that writes)
async function updateUser(id: string, data: Partial<User>): Promise<User> {
	const user = await db.users.update(id, data);
	await eventBus.publish('user.updated', { id, fields: Object.keys(data) });
	return user;
}

// Subscriber (cache invalidation worker)
eventBus.subscribe('user.updated', async ({ id }) => {
	await redis.del(`user:${id}`);
	await redis.del(`user:${id}:permissions`); // invalidate related keys too
	console.log(`Invalidated cache for user:${id}`);
});
```

This scales to multiple services. If Service A updates a user, Service B's cache gets invalidated automatically.

**With Redis Keyspace Notifications** (for internal invalidation):

```bash
# Enable in redis.conf
notify-keyspace-events "KEA"
```

```typescript
const subscriber = redis.duplicate();
await subscriber.connect();

// Notified whenever a key expires or is deleted
await subscriber.subscribe('__keyevent@0__:expired', (key) => {
	console.log(`Key expired: ${key}`);
	// Pre-warm replacement if needed
});
```

## Strategy 5 — Cache-Aside with Short TTL (the pragmatic default)

For most applications, this combination is enough:

```typescript
async function get<T>(key: string, loader: () => Promise<T>, ttl = 60): Promise<T> {
	const cached = await redis.get(key);
	if (cached) return JSON.parse(cached);

	const value = await loader();
	await redis.setEx(key, ttl, JSON.stringify(value));
	return value;
}

// Short TTL handles most staleness without event plumbing
const user = await get(`user:${id}`, () => db.users.findById(id), 30);
```

Short TTL (30–60s) + delete on write handles 95% of invalidation needs without events or versioning.

## Tag-Based Invalidation

Group keys under logical tags, then invalidate all keys with a tag at once.

```typescript
class TaggedCache {
	async set(key: string, value: unknown, tags: string[], ttl: number): Promise<void> {
		await this.redis.setEx(key, ttl, JSON.stringify(value));
		// Register this key under each tag
		for (const tag of tags) {
			await this.redis.sAdd(`tag:${tag}`, key);
		}
	}

	async invalidateTag(tag: string): Promise<void> {
		const keys = await this.redis.sMembers(`tag:${tag}`);
		if (keys.length === 0) return;

		await this.redis.del(...keys); // delete all tagged keys
		await this.redis.del(`tag:${tag}`); // clean up tag set
	}
}

// All user-related cache entries tagged
await cache.set(`user:${id}`, user, [`user:${id}`, 'users'], 300);
await cache.set(`user:${id}:perms`, perms, [`user:${id}`, 'permissions'], 600);

// Invalidate everything for user 123 in one call
await cache.invalidateTag('user:123');
```

## Choosing an Invalidation Strategy

```
Staleness of a few minutes is fine?
  → TTL only. Simple, no extra code.

Staleness of seconds matters on writes?
  → TTL + delete on write.

Multiple services reading same data?
  → Event-driven invalidation.

No DEL race condition acceptable?
  → Versioned keys.

Invalidating groups of related keys?
  → Tag-based invalidation.
```

The wrong choice isn't using TTL — it's using _too long_ a TTL and not deleting on writes. Most bugs come from forgetting to invalidate after a write, not from choosing the wrong strategy.
