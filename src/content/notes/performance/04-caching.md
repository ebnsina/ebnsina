---
title: 'Caching'
subtitle: 'Cache level, eviction policy, cache stampede, cache invalidation — আর কেন caching হলো সবচেয়ে বেশি প্রয়োগ করা আর সবচেয়ে কম ভাবা optimization।'
chapter: 4
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['caching', 'Redis', 'CDN', 'cache invalidation', 'cache stampede', 'LRU', 'TTL']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন শেফের mise en place: আজ রাতের খাবারের উপকরণ প্রস্তুত করে হাতের নাগালে রাখা হয় (cache)। প্যান্ট্রিতে (database) সবকিছু আছে, কিন্তু service-এর মাঝে সেখান থেকে আনতে সময় লাগে। mise en place দ্রুত কিন্তু সীমিত — এটা শুধু সেটাই ধরে রাখে যা প্রস্তুত করা হয়েছিল, সময়ের সাথে বাসি হয়ে যায়, আর menu বদলালে সেটা নতুন করে করতে হয়।

</Callout>

## গল্পে বুঝি

সিনার রেস্তোরাঁয় সন্ধ্যার service শুরু হওয়ার আগে হেড শেফ খোয়ারিজমি একটা রুটিন মেনে চলেন — যে ডিশগুলোর অর্ডার সবচেয়ে বেশি আসে, সেগুলোর উপকরণ আগেভাগেই কেটেকুটে, মেপে, বাটিতে সাজিয়ে চুলার ঠিক পাশে হাতের নাগালে রেখে দেন। এটাই তাঁর mise en place। কাবাবের অর্ডার এলে তিনি আর পেছনের প্যান্ট্রি পর্যন্ত হাঁটেন না, স্টোর থেকে পেঁয়াজ এনে খোসা ছাড়ান না — প্রস্তুত উপকরণ তুলে সরাসরি চুলায়। অর্ডার সেকেন্ডে বেরিয়ে যায়, রান্নাঘরে লাইন জমে না।

কিন্তু চুলার পাশের জায়গা তো সীমিত, সব ডিশের প্রস্তুতি তো আর রাখা যায় না। তাই শুধু সবচেয়ে বেশি অর্ডার হওয়া ডিশগুলোর উপকরণই সেখানে থাকে। কেউ যদি হঠাৎ এমন একটা ডিশ চায় যেটা কালেভদ্রে অর্ডার হয়, খোয়ারিজমিকে তখন পুরো পথ প্যান্ট্রি পর্যন্ত হেঁটে গিয়ে গোড়া থেকে সব কাটাকুটি-প্রস্তুতি করতে হয় — সময় লাগে অনেক বেশি। আবার কেটে রাখা উপকরণও তো কয়েক ঘণ্টা পর শুকিয়ে বা নেতিয়ে বাসি হয়ে যায়, তখন পুরনোটা ফেলে টাটকা করে প্রস্তুতি ঢেলে সাজাতে হয়।

এই mise en place-ই আসলে **caching**। চুলার পাশে রেখে দেওয়া প্রস্তুত উপকরণ হলো cached result, আর সবচেয়ে বেশি অর্ডার হওয়া ডিশগুলো হলো hot/frequent request — প্রস্তুত জিনিস তুলে সরাসরি রান্না করা মানে **cache hit**, খরুচে কাজটা (গোড়া থেকে কাটাকুটি) পুরোপুরি এড়িয়ে যাওয়া। কালেভদ্রে অর্ডার হওয়া ডিশের জন্য প্যান্ট্রি পর্যন্ত হেঁটে গোড়া থেকে প্রস্তুতিই হলো **cache miss** — পুরো expensive কাজটা তখন আবার করতে হয়। প্রস্তুত জিনিস কতবার সরাসরি কাজে লাগল, সেটাই **hit rate** — যত বেশি, রান্নাঘর তত দ্রুত। আর কেটে রাখা উপকরণ বাসি হওয়ার আগেই টাটকা করে ঢেলে সাজানোটাই **TTL** দিয়ে stale ডেটা refresh করার tradeoff। বাস্তবে Redis বা CDN ঠিক এভাবেই ঘনঘন লাগা, খরুচে-হিসাবের ডেটা মেমরিতে ready রেখে database-এর উপর চাপ কমায় — Stack Overflow থেকে Twitter পর্যন্ত সবাই এই কৌশলেই sub-10ms রেসপন্স দেয়।

## Cache Level

দ্রুততম থেকে ধীরতম:

```
L1/L2/L3 CPU cache     ~1-10ns   — managed by CPU
Process memory          ~100ns    — your in-process Map/LRU
Redis/Memcached         ~0.5ms    — network hop to cache server
Database                ~5-50ms   — disk or buffer cache
CDN edge                ~10-50ms  — geographically close edge node
```

ডেটার বৈশিষ্ট্য অনুযায়ী সঠিক level বেছে নাও:

- **In-process:** দ্রুততম, কোনো network নেই, কিন্তু restart-এ হারিয়ে যায়, instance-এর মধ্যে share হয় না
- **Redis:** সব instance-এর মধ্যে share হয়, restart survive করে, সামান্য ধীর
- **CDN:** পাবলিক static content-এর জন্য — origin-কে পুরোপুরি offload করে

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

**কখন ব্যবহার করবে:** reference data যা কদাচিৎ বদলায় (user role, feature flag, config)। যে ডেটা fetch করা ব্যয়বহুল কিন্তু memory-তে ধরার মতো যথেষ্ট ছোট।

**কখন ব্যবহার করবে না:** যে ডেটা ঘন ঘন বদলায়, যে ডেটার stale read গ্রহণযোগ্য না, একটা stateless service-এ request-এর মধ্যে share হওয়া ডেটা (instance-এর মধ্যে inconsistent হবে)।

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

**Cache warming:** traffic আসার আগে cache pre-populate করো:

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

Cache expire হয়। 1000টা concurrent request সবাই cache miss দেখে আর সবাই একসাথে database-এ আঘাত করে।

```
Time T:   cache expires
T+0ms:    request 1 sees miss, starts DB query
T+0ms:    request 2 sees miss, starts DB query
T+0ms:    request 1000 sees miss, starts DB query
T+50ms:   1000 DB queries complete, all populate cache
```

1টার বদলে 1000টা DB query।

### Fix 1: Mutex (Single Flight)

শুধু একটা request fetch করে, বাকিরা অপেক্ষা করে:

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

বাকি TTL-এর ভিত্তিতে expire হওয়ার আগে randomly cache refresh করো:

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

"computer science-এ কঠিন জিনিস মাত্র দুটো: cache invalidation আর জিনিসের নামকরণ।"

**Time-based (TTL):** সবচেয়ে সহজ। TTL সেকেন্ড পর্যন্ত stale। বেশিরভাগ ক্ষেত্রে ঠিক আছে।

**Event-based:** write-এ invalidate করো। কোনো staleness নেই, কিন্তু প্রতিটা write path-এর সাথে cache coordinate করতে হয়।

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

পাবলিক content-এর জন্য (product page, image, static asset):

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

`stale-while-revalidate=60`: background-এ refresh করার সময় 60 সেকেন্ডের জন্য stale content সার্ভ করো। refresh-এ zero latency।

**Update-এ purge করা:**

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

## যা Cache করবে না

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

Cache hit rate 80%-এর নিচে হলে প্রায়ই মানে তুমি ভুল জিনিস cache করছ, অথবা TTL খুব ছোট। আরও cache যোগ করার আগে cache miss profile করো।
