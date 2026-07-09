---
title: 'ক্যাশ স্ট্র্যাটেজি'
subtitle: 'Cache-aside, read-through, write-through, write-behind — কোনটা কখন ব্যবহার করবেন আর ভুল করলে কী ভাঙে।'
chapter: 2
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['cache-aside', 'read-through', 'write-through', 'write-behind', 'patterns']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একজন বাবুর্চি যিনি রান্নার আগেই সব উপকরণ প্রস্তুত করে রাখেন (write-through) বনাম আরেকজন যিনি প্রয়োজন হলেই কেবল প্যান্ট্রি থেকে জিনিস নেন (cache-aside) — একই রান্নাঘর, ভিন্ন ছন্দ।

</Callout>

## চারটি স্ট্র্যাটেজি

প্রতিটি ক্যাশিং সিস্টেম এই চারটি প্যাটার্নের কোনো একটির উপর — বা এগুলোর সংমিশ্রণে — তৈরি। এই পছন্দটাই ঠিক করে দেয় ক্যাশ পপুলেট করার দায়িত্ব কার, স্টেল ডেটা কীভাবে দেখা দেয়, এবং write-এর সময় কী ঘটে।

| স্ট্র্যাটেজি  | DB থেকে কে পড়ে | DB-তে কে লেখে        | কনসিস্টেন্সি |
| ------------- | --------------- | -------------------- | ------------ |
| Cache-aside   | অ্যাপ্লিকেশন    | অ্যাপ্লিকেশন         | Eventual     |
| Read-through  | ক্যাশ লেয়ার    | অ্যাপ্লিকেশন         | Eventual     |
| Write-through | অ্যাপ্লিকেশন    | ক্যাশ লেয়ার → DB    | Strong       |
| Write-behind  | অ্যাপ্লিকেশন    | ক্যাশ লেয়ার (async) | Eventual     |

## Cache-Aside (Lazy Loading)

সবচেয়ে প্রচলিত প্যাটার্ন। সব লজিকের মালিক অ্যাপ্লিকেশন নিজেই: ক্যাশ চেক করো, miss হলে → DB থেকে ফেচ করো, ক্যাশ পপুলেট করো।

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

**সুবিধা:** সরল। শুধু যা আসলেই চাওয়া হয় তাই ক্যাশ করে। Redis রিস্টার্ট হলেও ক্যাশ টিকে থাকে (পরের রিকোয়েস্টে DB থেকে আবার পপুলেট হয়ে যায়)।

**অসুবিধা:** miss-এর পরের প্রথম রিকোয়েস্ট ধীর। write-এর সময় invalidate করতে ভুলে গেলে স্টেল ডেটা সার্ভ হতে পারে।

<Callout type="tip">

Cache-aside হলো সঠিক ডিফল্ট। যতক্ষণ না নির্দিষ্ট কোনো কারণ থাকে অন্য কিছু ব্যবহার করার, ততক্ষণ এটাই ব্যবহার করুন।

</Callout>

## Read-Through

miss হলে ক্যাশ লেয়ার নিজেই ডেটাবেস থেকে ফেচ করে, অ্যাপ্লিকেশনের কাছে ব্যাপারটা অদৃশ্য থাকে। অ্যাপ্লিকেশন শুধু ক্যাশের সাথে কথা বলে।

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

**সুবিধা:** অ্যাপ্লিকেশন কোড আরও সরল — সব ক্যাশ পপুলেশন লজিক এক জায়গায় হ্যান্ডল হয়।

**অসুবিধা:** cold start-এ এখনও latency থাকে। cache miss ভিন্নভাবে হ্যান্ডল করা কঠিন (যেমন, null রিটার্ন করা বনাম throw করা)। `node-cache-manager`-এর মতো লাইব্রেরিগুলো এই প্যাটার্ন বাস্তবায়ন করে।

## Write-Through

প্রতিটি write ক্যাশের মধ্য দিয়ে ডেটাবেসে যায়। ক্যাশ ও DB সবসময় সিঙ্কে থাকে।

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

**সুবিধা:** ক্যাশ সবসময় ফ্রেশ — কোনো স্টেল read নেই। কোনো invalidation লজিকের দরকার নেই।

**অসুবিধা:** write latency বাড়ে (দুটো write)। ক্যাশ এমন ডেটায় ভরে যায় যা হয়তো কখনো পড়াই হবে না। প্রাথমিক লোডগুলো হ্যান্ডল করতে read-through-এর সাথে মিলিয়ে সবচেয়ে ভালো কাজ করে।

<Callout type="info">

Write-through প্রায়ই read-through-এর সাথে মিলিয়ে ব্যবহার হয়। একসাথে এরা নিশ্চিত করে ক্যাশ সবসময় কনসিস্টেন্ট থাকে — তবে তার মূল্য হিসেবে write পারফরম্যান্স কমে এবং সম্ভবত খুব কম-পড়া ডেটাও ক্যাশ হয়।

</Callout>

## Write-Behind (Write-Back)

write সাথে সাথে ক্যাশে চলে যায়, তারপর ক্যাশ অ্যাসিনক্রোনাসভাবে ডেটাবেসে ফ্লাশ করে। অ্যাপ্লিকেশন দ্রুত write অ্যাকনলেজমেন্ট পায়।

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

**সুবিধা:** সবচেয়ে কম write latency। একাধিক write-কে একটা DB অপারেশনে ব্যাচ করা যায়। কাউন্টার, ভিউ কাউন্ট, অ্যানালিটিক্সের জন্য চমৎকার।

**অসুবিধা:** ফ্লাশ হওয়ার আগেই ক্যাশ ক্র্যাশ করলে ডেটা হারানোর ঝুঁকি। ফেইলিওর হ্যান্ডলিং জটিল। আর্থিক বা ক্রিটিক্যাল ডেটার জন্য উপযুক্ত নয়।

<Callout type="warning">

**যেখানে কয়েক সেকেন্ডের write হারানো মেনে নেওয়া যায় না, সেখানে কখনোই write-behind ব্যবহার করবেন না** — পেমেন্ট, ইনভেন্টরি পরিবর্তন, ইউজার-জেনারেটেড কন্টেন্ট। পারফরম্যান্সের লাভটা ডেটা হারানোর ঝুঁকির তুলনায় মূল্যহীন।

</Callout>

## Refresh-Ahead

অ্যাক্সেস প্যাটার্নের ভিত্তিতে, এন্ট্রি এক্সপায়ার হওয়ার আগেই আগেভাগে ক্যাশ রিফ্রেশ করা।

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

**সুবিধা:** বেশিরভাগ cache miss দূর করে। জনপ্রিয় key কখনো cold থাকে না।

**অসুবিধা:** যেসব key আর পড়া হবে না সেগুলো রিফ্রেশ করে কাজ নষ্ট করে। সঠিকভাবে বাস্তবায়ন করা জটিল। বেশিরভাগ অ্যাপ্লিকেশনের জন্য অতিরিক্ত।

## একটি স্ট্র্যাটেজি বেছে নেওয়া

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

## মূল ডিজাইন নিয়ম

**সবসময় এন্ট্রি এক্সপায়ার করান।** TTL ছাড়া ক্যাশ হলো বাড়তি ধাপসহ একটা মেমরি লিক। এমনকি ২৪-ঘণ্টার TTL-ও কখনো এক্সপায়ার না হওয়ার চেয়ে ভালো।

**ক্যাশ key ডিটারমিনিস্টিক রাখুন।** `user:${id}`, `user_${Date.now()}` নয়। একই ইনপুট যদি একই key না বানায়, তাহলে আপনি কখনো hit পাবেন না।

**আপনার key namespace করুন।** সার্ভিস বা এন্টিটি টাইপ দিয়ে prefix দিন: `auth:session:abc123`, `catalog:product:456`। একাধিক সার্ভিসে Redis শেয়ার করার সময় collision ঠেকায়।

**একইভাবে সিরিয়ালাইজ করুন।** কিছু পরিবেশে `JSON.stringify` key-এর ক্রম অনুযায়ী ভিন্ন আউটপুট দেয়। একটা ক্যানোনিকাল সিরিয়ালাইজার ব্যবহার করুন বা অন্তত এ ব্যাপারে সচেতন থাকুন।

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
