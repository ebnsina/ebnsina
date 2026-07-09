---
title: 'Cache Stampede ও Thundering Herd'
subtitle: 'একটি জনপ্রিয় cache entry expire হলে এবং একসাথে হাজার হাজার request database-এ আঘাত করলে কী ঘটে — এবং কীভাবে সেটা থামানো যায়।'
chapter: 6
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['stampede', 'thundering herd', 'mutex', 'probabilistic expiry', 'dog pile']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## কেন এটি প্রয়োজন

একটি cache entry expire হলো। ঐ entry-র জন্য দশ হাজার concurrent request একই মুহূর্তে miss খুঁজে পেল। দশ হাজারই database পর্যন্ত পৌঁছে গেল। যে database cache-এর মাধ্যমে আরামসে 100 reads/second সামলাচ্ছিল, সেটি হঠাৎ 10,000 simultaneous query পেল। এটি ভেঙে পড়ল। Cache আর কখনও repopulate হলো না। আপনার outage আরও গভীর হলো।

এটাই হলো **cache stampede** — একে thundering herd বা dog-pile effect-ও বলা হয়।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটি কনসার্ট ভেন্যু একটিমাত্র টিকিট উইন্ডো খুলল। দরজা খুলতেই পাঁচ হাজার মানুষ একসাথে উইন্ডোর দিকে ছুটল। একাকী টিকেটিং এজেন্ট (আপনার database) একসাথে পাঁচ হাজার request প্রসেস করতে পারে না। যদি queue-টা ব্যবস্থাপনা করা হতো — একজন করে ঢুকতে দেওয়া হতো আর বাকিরা অপেক্ষা করত — তাহলে টিকেটিং এজেন্ট দিব্যি সামলে নিত।

</Callout>

সমাধান: নিশ্চিত করুন যে miss-এর সময় শুধু **একটি** request cache populate করে, আর বাকিরা তার জন্য অপেক্ষা করে।

## সমস্যাটি পুনরুৎপাদন করা

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

10,000 RPS এবং 60-second TTL থাকলে, প্রতি 60 সেকেন্ড পর পর এই function database-কে ~600 concurrent request দিয়ে হাতুড়ি পেটায় (10,000 \* 200ms window)। যদি DB 100 সামলাতে পারে, তাহলে আপনার সমস্যা আছে।

## Fix 1 — Mutex Lock (একবারই Repopulation)

শুধু একটি request cache populate করে। বাকিরা তার জন্য অপেক্ষা করে।

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

**সমস্যা:** অপেক্ষমাণ request-গুলো এখনও system-এর উপর চাপ ফেলে। যদি lock holder crash করে, তাহলে lock expire না হওয়া পর্যন্ত থেকে যায় (ঐ key-র জন্য `lockTtl` সেকেন্ড পর্যন্ত downtime)।

## Fix 2 — Probabilistic Early Expiry (XFetch)

Key-টি expire হওয়ার জন্য অপেক্ষা না করে, একটি probabilistic formula-র ভিত্তিতে সক্রিয়ভাবে সেটিকে আগেভাগে refresh করুন। এটি cliff-edge expiry পুরোপুরি প্রতিরোধ করে।

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

**এটি যেভাবে কাজ করে:** যে প্রতিটি request একটি cache entry পড়ে, সেটি probabilistically সিদ্ধান্ত নেয় আগেভাগে refresh করবে কিনা। expiry যত কাছাকাছি আসে এবং entry compute করতে যত বেশি সময় লেগেছিল, probability তত বাড়ে। ব্যয়বহুল entry-গুলো আগেই refresh হয়। একাধিক process স্বাধীনভাবে এই সিদ্ধান্ত নেয়, তাই কোনো coordination ছাড়াই cache গরম (warm) থাকে।

এটি গবেষণাপত্র _"Optimal Probabilistic Cache Stampede Prevention"_-এর XFetch algorithm-এর উপর ভিত্তি করে।

## Fix 3 — Stale-While-Revalidate

stale value সাথে সাথেই return করুন, background-এ refresh করুন।

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

HTTP-র `Cache-Control: stale-while-revalidate` header ঠিক এটাই করে — stale response serve করে, background-এ refresh করে, পরবর্তী request fresh-টা পায়।

## Fix 4 — Cache Warming

Traffic আঘাত করার আগেই cache pre-populate করে cold start প্রতিরোধ করুন।

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

দীর্ঘ TTL-যুক্ত entry-গুলোর জন্য **নির্ধারিত সময়ে পুনরায় re-warming**:

```typescript
// Re-warm every 50 minutes for entries with 1-hour TTL
cron.schedule('*/50 * * * *', async () => {
	const criticalKeys = await db.getCriticalCacheKeys();
	for (const { key, value, ttl } of criticalKeys) {
		await redis.setEx(key, ttl, JSON.stringify(value));
	}
});
```

## একটি Fix বেছে নেওয়া

| পরিস্থিতি                                                        | সমাধান                        |
| ---------------------------------------------------------------- | ----------------------------- |
| একটিমাত্র জনপ্রিয় key, সংক্ষিপ্ত latency spike মেনে নেওয়া যায় | Mutex lock                    |
| High-traffic key, শূন্য latency spike দরকার                      | Probabilistic early expiry    |
| সংক্ষিপ্ত staleness সহ্য করা যায় (বেশিরভাগ ক্ষেত্রে)            | Stale-while-revalidate        |
| অনুমানযোগ্য access pattern                                       | Cache warming                 |
| উপরের সবকিছু, high scale-এ                                       | SWR + warming + probabilistic |

বেশিরভাগ application-এর জন্য: **ছোট SWR window সহ stale-while-revalidate** (5–30 সেকেন্ড) হলো বাস্তবসম্মত সমাধান। এতে কোনো locking লাগে না, কখনও block হয় না, এবং সংক্ষিপ্ত staleness সাধারণত গ্রহণযোগ্য।
