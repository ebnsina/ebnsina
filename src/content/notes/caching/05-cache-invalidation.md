---
title: 'Cache Invalidation'
subtitle: 'কম্পিউটার সায়েন্সের সবচেয়ে কঠিন সমস্যা — TTL, event-driven purging, versioned keys, এবং কখন staleness মেনে নিতে হয়।'
chapter: 5
level: 'intermediate'
readingTime: '14 মিনিট'
topics: ['invalidation', 'TTL', 'versioned keys', 'event-driven', 'consistency']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনার মুদি দোকানের সামনে একটা বড় প্রাইস বোর্ড ঝোলানো — চাল, ডাল, তেলের দাম চক দিয়ে লেখা। সকালে পাইকারি বাজারে সয়াবিন তেলের দাম বেড়ে গেল, সিনা গুদামে নতুন দরে তেল কিনল, কিন্তু বোর্ডটা মোছার কথা মনেই থাকল না। খোয়ারিজমি এসে বোর্ডে পুরনো দাম দেখে সেই দামে টাকা বাড়িয়ে ধরল, সিনা বলল "ভাই, দাম তো বেড়ে গেছে" — খোয়ারিজমি চটে গেল, "বোর্ডে তো এটাই লেখা!" বোর্ডটা হলো cache, আর গুদামের আসল দাম হলো source of truth; দুটো আলাদা হয়ে যাওয়াতেই এই staleness, এই ঝামেলা।

সিনা এরপর তিনটা অভ্যাস শিখল। এক — সে ঠিক করল রোজ সকালে বোর্ড মুছে নতুন করে সব দাম লিখবে, দাম বদলাক বা না বদলাক; মাঝের সময়টুকু একটু পুরনো দাম থাকলেও দিনে একবার তো ঠিক হবেই (এটাই TTL, সময় পার হলেই নতুন করে লেখা)। দুই — বড় কোনো পণ্যের দাম বদলালে সে সঙ্গে সঙ্গে ওই লাইনটা মুছে নতুন দাম বসায়, অপেক্ষা করে না (এটাই event-driven purge, উৎস বদলানোর মুহূর্তেই cache মোছা)। তিন — ঈদের সময় ফাতিমা যখন পুরো দামের তালিকা নতুন করে সাজাল, সে পুরনো বোর্ড না মুছে পাশে "১৫ রমজানের নতুন দর" লেখা একটা তারিখ-দেওয়া নতুন বোর্ড টাঙিয়ে দিল, খদ্দেররা নতুনটা দেখে আর পুরনোটা এমনিতেই অগ্রাহ্য হয় (এটাই versioned key, পুরনো key পড়ে থাকে, নতুন key-তে fresh ডেটা)।

গল্পের বোর্ড হলো cache আর গুদামের দাম source of truth — এদের এক রাখাই cache invalidation। রোজ সকালে মোছা মানে TTL, দাম বদলানোর সঙ্গে সঙ্গে মোছা মানে event-driven purge, আর তারিখ-দেওয়া নতুন বোর্ড মানে versioned key; আর কিছু সময় "সকাল পর্যন্ত পুরনো দামই চলবে" মেনে নেওয়াটাই হলো একটু staleness সহ্য করা। বাস্তবে Redis-এ product price বা user profile ঠিক এভাবেই fresh রাখা হয় — সবচেয়ে কঠিন সমস্যা বলেই এখানে কোনো নিখুঁত উত্তর নেই, শুধু tradeoff।

## কেন Cache Invalidation দরকার

প্রতিটি cache আসলে একটা কপি। যেই মুহূর্তে একটা কপি তৈরি হয়, সেটা মূল ডেটা থেকে আলাদা হয়ে যেতে পারে। Invalidation হলো সেই ব্যবস্থা যা ঠিক করে কখন কপিটা ফেলে দিতে হবে।

এটা যে সমস্যা সমাধান করে: fast cached read-গুলোকে slow authoritative write-গুলোর সাথে কীভাবে consistent রাখবেন, প্রতিটা read-কে slow না করে বা প্রতিটা write-কে জটিল না করে?

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা অফিসের whiteboard-এ quarterly target দেখানো আছে। finance টিম spreadsheet আপডেট করে। কেউ যদি whiteboard মুছে নতুন করে না লেখে, তাহলে মানুষ ভুল সংখ্যার ওপর ভিত্তি করে কাজ করবে। Invalidation হলো whiteboard মোছার কাজ — প্রশ্ন হলো এটা কে করে, কখন করে, এবং মাঝের সময়টায় কেউ ভুল ধরতে পারে কিনা।

</Callout>

Phil Karlton-এর বিখ্যাত উক্তিটা এখনও সত্য: _"There are only two hard things in computer science: cache invalidation and naming things."_ কঠিনতাটা মৌলিক — cache আর database দুটোই source of truth, এবং distributed system-এ কোনো নিখুঁত সমাধান নেই, শুধু tradeoff আছে।

## Strategy 1 — TTL (Time-Based Expiry)

সবচেয়ে সহজ উপায়: entry-গুলোকে নিজে থেকে expire হতে দিন। TTL সেকেন্ড পার হওয়ার পরে পরবর্তী read একটা fresh fetch ট্রিগার করে।

```typescript
await redis.setEx(`product:${id}`, 300, JSON.stringify(product)); // 5 min TTL
```

**কখন কাজ করে:** যখন আপনি TTL-এর সময়টুকু stale ডেটা সহ্য করতে পারেন। Product catalog, user profile, config value — বেশিরভাগ অ্যাপ্লিকেশনের বেশিরভাগ জিনিস।

**কখন ব্যর্থ হয়:** যখন staleness-এর প্রতি সহনশীলতা কম। কোনো user যদি তার password বদলায়, তাহলে 5-মিনিটের TTL মানে পুরনো ডেটা আরও 5 মিনিট valid থাকবে।

**TTL tuning গাইড:**

```
User profile:       60s   — changes rarely, staleness rarely matters
Product price:      30s   — price changes have business impact
Config flags:       30s   — want fast feature flag rollouts
Rendered HTML:      300s  — expensive to generate, fine to be stale
Auth session:       match session lifetime exactly
Real-time data:     don't cache, or 1–5s max
```

<Callout type="tip">

**আপনার TTL-গুলোতে jitter দিন।** যদি 10,000 cache entry সব একই সেকেন্ডে expire হয় (cold-start batch load-এর সময় সেট হওয়ায়), তাহলে একটা miss storm তৈরি হয়। random jitter যোগ করুন: `ttl + Math.floor(Math.random() * 30)`.

</Callout>

## Strategy 2 — Invalidate on Write

যখনই underlying ডেটা বদলায় তখনই cache entry-টা delete করুন। পরবর্তী read সেটা আবার populate করবে।

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

**Race condition-টা:** delete আর পরবর্তী repopulation-এর মাঝে একটা write ঢুকে পড়তে পারে।

```
T1: Writer updates DB, deletes cache
T2: Reader misses cache, reads old DB value (replica lag), populates cache with stale data
T3: Writer's new value is in DB but cache has old value
```

সমাধান: **write-এর পরে delete করুন, আগে নয়।** আর critical path-এ cache miss হলে replica-aware read ব্যবহার করুন।

## Strategy 3 — Versioned Keys

Invalidate করার বদলে, key-টাই বদলে দিন। পুরনো key evict না হওয়া পর্যন্ত cache-এ থাকে, নতুন key fresh করে populate হয়।

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

**সুবিধা:** delete আর repopulation-এর মাঝে কোনো race condition নেই। পুরনো reader-রা TTL শেষ না হওয়া পর্যন্ত তাদের version ব্যবহার করতে থাকে।

**অসুবিধা:** eviction না হওয়া পর্যন্ত পুরনো key জমতে থাকে। version number আনার জন্য প্রতি operation-এ একটা বাড়তি Redis call লাগে।

## Strategy 4 — Event-Driven Invalidation

একটা message bus-এর মাধ্যমে invalidation event publish করুন। সব cache node subscribe করে এবং matching key-গুলো purge করে।

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

এটা একাধিক service-এ scale করে। Service A যদি কোনো user আপডেট করে, তাহলে Service B-এর cache নিজে থেকেই invalidate হয়ে যায়।

**Redis Keyspace Notifications দিয়ে** (internal invalidation-এর জন্য):

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

## Strategy 5 — Cache-Aside with Short TTL (বাস্তবসম্মত ডিফল্ট)

বেশিরভাগ অ্যাপ্লিকেশনের জন্য, এই কম্বিনেশনটাই যথেষ্ট:

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

Short TTL (30–60s) + write-এ delete — event বা versioning ছাড়াই 95% invalidation দরকার সামলে নেয়।

## Tag-Based Invalidation

key-গুলোকে logical tag-এর অধীনে গ্রুপ করুন, তারপর একবারে একটা tag-এর সব key invalidate করুন।

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

## Invalidation Strategy নির্বাচন

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

ভুল সিদ্ধান্তটা TTL ব্যবহার করা নয় — ভুলটা হলো _খুব দীর্ঘ_ একটা TTL ব্যবহার করা আর write-এ delete না করা। বেশিরভাগ bug আসে write-এর পরে invalidate করতে ভুলে যাওয়া থেকে, ভুল strategy বেছে নেওয়া থেকে নয়।
