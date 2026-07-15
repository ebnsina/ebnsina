---
title: 'ক্যাশিং কেন দরকার'
subtitle: 'মেমরি, ডিস্ক আর নেটওয়ার্কের মধ্যকার latency-র ফারাক — আর কেন প্রতিটি দ্রুত সিস্টেম সেটাকে কাজে লাগায়।'
chapter: 1
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['latency', 'memory hierarchy', 'cache fundamentals', 'performance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

রহিম বাসায় বসে কাজ করছে। কলমটা তার শার্টের পকেটেই — হাত বাড়ালেই, চোখের পলকে পাওয়া যায়। একটু বেশি দরকারি জিনিস, যেমন স্ট্যাপলার বা কাঁচি, ওগুলো টেবিলের পাশের ড্রয়ারে; সেগুলো নিতে হলে ড্রয়ার টেনে খুঁজতে দু-এক সেকেন্ড লাগে। এবার যদি পুরনো একটা ফাইল লাগে, যেটা পাশের ঘরের আলমারিতে, তাহলে চেয়ার ছেড়ে উঠে হেঁটে গিয়ে আলমারি খুলে আনতে হয় — মিনিটখানেক তো যাবেই।

আর যদি এমন কিছু লাগে যা বাসায় নেই, ধরুন একটা নতুন প্রিন্টার কার্তুজ, তখন তো রহিমকে রিকশা নিয়ে বাজারে যেতে হবে, দোকান খুঁজতে হবে, আবার ফিরে আসতে হবে — আধা ঘণ্টা, এক ঘণ্টা লেগে যায়। তাই রহিম বুদ্ধি করে যেটা বারবার লাগে সেটা পকেটে রাখে, মাঝেমধ্যে লাগেরটা ড্রয়ারে; বাজার পর্যন্ত সে যত কম যেতে হয় ততই তার কাজ দ্রুত এগোয়।

এই দূরত্বগুলোই আসলে একটা কম্পিউটারের **memory hierarchy**। পকেট হলো CPU cache আর RAM (ন্যানোসেকেন্ড — একদম হাতের নাগালে), পাশের ড্রয়ার-আর-আলমারি হলো disk/SSD (মাইক্রোসেকেন্ড — উঠে গিয়ে আনতে হয়), আর বাজারে যাওয়াটা হলো একটা **network** কল (মিলিসেকেন্ড — সবচেয়ে ধীর)। **caching** মানেই বারবার-লাগা জিনিসটাকে সবচেয়ে কাছের জায়গায় রাখা, যাতে দূরে যেতে না হয় — Redis, CDN থেকে শুরু করে ব্রাউজারের cache পর্যন্ত সব দ্রুত সিস্টেম ঠিক এই দূরত্বের ফারাকটাকেই কাজে লাগায়।

## স্পিডের ফারাক

আপনার CPU L1 cache থেকে পড়তে পারে মাত্র **0.5 ন্যানোসেকেন্ডে**। RAM থেকে পড়তে লাগে ~100ns। লোকাল SSD-তে হিট করতে ~100 মাইক্রোসেকেন্ড। একই ডেটাসেন্টারের ডেটাবেস সার্ভারে একটা নেটওয়ার্ক রাউন্ড-ট্রিপ? ~500 মাইক্রোসেকেন্ড থেকে কয়েক মিলিসেকেন্ড। এক মহাদেশ পেরিয়ে গেলে: 100ms+।

মানে L1 cache আর একটা ট্রান্সআটলান্টিক রিকোয়েস্টের মধ্যে ছয় অর্ডার অফ ম্যাগনিটিউডের ফারাক।

| স্টোরেজ                | Latency | আপেক্ষিক     |
| ---------------------- | ------- | ------------ |
| L1 CPU cache           | 0.5 ns  | 1x           |
| L2 CPU cache           | 5 ns    | 10x          |
| RAM                    | 100 ns  | 200x         |
| NVMe SSD               | 100 µs  | 200,000x     |
| Network (same DC)      | 500 µs  | 1,000,000x   |
| Network (cross-region) | 100 ms  | 200,000,000x |

ক্যাশিং হলো **যেখানে দরকার তার কাছাকাছি ফলাফল জমা রাখার** শিল্প — সময়ের বিনিময়ে মেমরি স্পেস খরচ করা।

<Callout type="info">

**বাস্তব জীবনের উপমা**

যে শেফ প্রতিবার লবণ দরকার হলেই গুদামঘরে হেঁটে যায়, সে ধীর হবে। যে একটা ছোট কৌটা কাউন্টারে রেখে দেয়, সে দ্রুত। প্যান্ট্রি হলো RAM, গুদামঘর হলো ডেটাবেস, কাউন্টার হলো cache। আপনি সব কিছু কাউন্টারে রাখেন না — শুধু যেটা বারবার হাতে নিতে হয়।

</Callout>

## কোন জিনিস cache করার যোগ্য

সব কিছু cache করা উচিত নয়। ভালো cache প্রার্থী হলো:

- **কম্পিউট করা ব্যয়বহুল** — ডেটাবেস অ্যাগ্রিগেশন, ML inference, রেন্ডারিং
- **ঘন ঘন পড়া হয়** — ইউজার প্রোফাইল, প্রোডাক্ট ক্যাটালগ, কনফিগারেশন
- **কদাচিৎ পরিবর্তন হয়** — বা এমনভাবে বদলায় যা আগে থেকে ধারণা করে invalidate করা যায়
- **সামান্য পুরনো হলেও চলে** — বেশিরভাগ read 1s, 1m, এমনকি 1h পুরনো ডেটাও মেনে নিতে পারে

খারাপ cache প্রার্থী:

- যে ডেটা রিয়েল-টাইম হতেই হবে (স্টকের দাম, লাইভ ইনভেন্টরি কাউন্ট)
- প্রতি রিকোয়েস্টে ইউনিক, পুনরাবৃত্তি নেই এমন ডেটা
- যে ডেটা প্রতি write-এ বদলায় আর একবারই পড়া হয়

## Cache Hit Ratio

মৌলিক মেট্রিক। 100টা রিকোয়েস্টের মধ্যে 95টা যদি cache থেকে দেওয়া হয়, তাহলে আপনার hit ratio 95%। ratio যত বেশি, আপনার ডেটাবেসের কাজ তত কম।

```typescript
class CacheMetrics {
	private hits = 0;
	private misses = 0;

	recordHit() {
		this.hits++;
	}
	recordMiss() {
		this.misses++;
	}

	hitRatio(): number {
		const total = this.hits + this.misses;
		if (total === 0) return 0;
		return this.hits / total;
	}

	// A 95% hit ratio means your DB sees 1/20th the read load
	effectiveDbLoad(): number {
		return 1 - this.hitRatio();
	}
}
```

95% hit ratio শুনতে ভালোই লাগে। 95% থেকে 99%-এ গেলে ডেটাবেস লোড আরও 80% কমে যায়। স্কেলে শেষ কয়েক শতাংশ পয়েন্টও দারুণ গুরুত্বপূর্ণ।

## Cache Miss-এর গঠন

প্রতিটি cache miss-এর একটা খরচ আছে: origin থেকে fetch করার সময় প্লাস cache পপুলেট করার সময়।

```typescript
async function getUser(id: string): Promise<User> {
	// 1. Check cache (~0.5ms)
	const cached = await cache.get(`user:${id}`);
	if (cached) return JSON.parse(cached); // cache hit — done

	// 2. Cache miss — fall through to DB (~5ms)
	const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);

	// 3. Populate cache for next time
	await cache.set(`user:${id}`, JSON.stringify(user), { ttl: 300 });

	return user;
}
```

প্রথম কলার পুরো খরচটা দেয়। পরের কলাররা প্রায় কিছুই দেয় না।

## Cache কোথায় থাকে

একটা সিস্টেমের প্রতিটি স্তরে cache থাকে:

**Browser** — HTTP cache (`Cache-Control`, `ETag`)। বারবার ভিজিটে সার্ভারে শূন্য খরচ।

**CDN** — Cloudflare, Fastly, Akamai। অ্যাসেট আর API রেসপন্স নেটওয়ার্ক এজে, ইউজারের কাছাকাছি cache করা হয়।

**Application** — ইন-প্রসেস ডিকশনারি/LRU (`Map`, `lru-cache`)। কোনো নেটওয়ার্ক হপ নেই। রিস্টার্টে হারিয়ে যায়।

**Distributed cache** — Redis, Memcached। সব অ্যাপ ইনস্ট্যান্সে শেয়ার করা। রিস্টার্টেও টিকে থাকে। ইন-প্রসেসের চেয়ে সামান্য ধীর।

**Database query cache** — কিছু ডেটাবেস কোয়েরির ফলাফল ভেতরে ভেতরে cache করে। Postgres v16-তে এটা বাদ দিয়েছে; MySQL-এ আছে। সাধারণত অনির্ভরযোগ্য — সাধারণত অ্যাপ্লিকেশন স্তরে cache করাই ভালো।

```
User → Browser cache
     → CDN edge cache
     → Load balancer
     → App server (in-process cache)
     → Redis (distributed cache)
     → Database
```

<Callout type="tip">

**ইন-প্রসেস ক্যাশিং দিয়ে শুরু করুন।** একটা TTL সহ সাধারণ `Map`-ই read-ভারী ওয়ার্কলোডে ডেটাবেস লোডের 80% দূর করতে প্রায়ই যথেষ্ট। Redis শুধু তখনই যোগ করুন যখন cache-টা একাধিক অ্যাপ ইনস্ট্যান্সে শেয়ার করা দরকার।

</Callout>

## সবচেয়ে সহজ Cache

```typescript
interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

class SimpleCache<T> {
	private store = new Map<string, CacheEntry<T>>();

	set(key: string, value: T, ttlSeconds: number): void {
		this.store.set(key, {
			value,
			expiresAt: Date.now() + ttlSeconds * 1000
		});
	}

	get(key: string): T | null {
		const entry = this.store.get(key);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return null;
		}
		return entry.value;
	}

	delete(key: string): void {
		this.store.delete(key);
	}
}

// Usage
const cache = new SimpleCache<User>();

async function getUser(id: string): Promise<User> {
	const cached = cache.get(`user:${id}`);
	if (cached) return cached;

	const user = await db.findUser(id);
	cache.set(`user:${id}`, user, 60); // cache for 60s
	return user;
}
```

বেশিরভাগ অ্যাপ্লিকেশনের এখান থেকেই শুরু করা উচিত। কোনো ডিপেন্ডেন্সি নেই, কোনো ops-এর ঝামেলা নেই, সঙ্গে সঙ্গে প্রভাব।

## যখন ক্যাশিং ভুল পথে যায়

ক্যাশিং জটিলতা নিয়ে আসে। যে দুটো failure mode সবাইকেই কামড়ায়:

**Stale data** — অন্তর্নিহিত ডেটা বদলে যাওয়ার পরও আপনি একটা cache করা মান পরিবেশন করেন। ইউজার তার ইউজারনেম আপডেট করার পরেও এক মিনিট ধরে পুরনোটাই দেখে।

**Cache stampede** — একটা জনপ্রিয় key-এর cache expire হয়ে যায়, আর 1000টা একসাথে আসা রিকোয়েস্ট সবগুলো miss করে একই সঙ্গে ডেটাবেসে হিট করে, সেটাকে নাকানিচুবানি খাইয়ে ছাড়ে।

দুটোই সমাধানযোগ্য। পরের অধ্যায়গুলো এগুলো গভীরভাবে আলোচনা করে। আপাতত জেনে রাখুন, ক্যাশিং বিনামূল্যে নয় — এটা consistency-র বিনিময়ে performance দেয়, আর সেই বিনিময়টা আপনাকে সচেতনভাবে সামলাতে হবে।

<Callout type="warning">

**Cache হলো ধীর ডেটাবেসের বিকল্প নয়।** আপনার কোয়েরি যদি index না থাকার কারণে বা full table scan করার কারণে ধীর হয়, আগে কোয়েরিগুলো ঠিক করুন। Cache সমস্যাটা ঢেকে রাখতে পারে, কিন্তু একটা cache flush কিংবা cache miss করা ট্রাফিক স্পাইকে টিকবে না।

</Callout>

## সারসংক্ষেপ

- RAM আর নেটওয়ার্কের মধ্যে latency-র ফারাক বিশাল — ক্যাশিং সেটাকে কাজে লাগায়
- ভালো cache প্রার্থী: ব্যয়বহুল, read-ভারী, সামান্য পুরনো হলেও গ্রহণযোগ্য
- Hit ratio হলো মূল মেট্রিক — এমনকি 99%-ও 95%-এর চেয়ে অর্থপূর্ণভাবে ভালো
- প্রতিটি স্তরে cache থাকে: browser, CDN, application, distributed, database
- সহজ দিয়ে শুরু করুন (ইন-প্রসেস Map), শেয়ার করা state দরকার হলে Redis যোগ করুন
