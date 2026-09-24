---
title: 'Eviction Policies'
subtitle: 'LRU, LFU, TTL এবং তাদের সঙ্গীরা — মেমরি ভরে গেলে cache কীভাবে ঠিক করে কোনটা ফেলে দেবে।'
chapter: 3
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['LRU', 'LFU', 'TTL', 'eviction', 'memory management']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import EvictionSim from '$lib/components/content/EvictionSim.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা হোয়াইটবোর্ড যেটার জায়গা ফুরিয়ে আসছে — নতুন কিছু লিখতে হলে পুরনো কিছু মুছতে হয়, আর প্রশ্নটা হলো কোনটা মুছবেন।

</Callout>

## গল্পে বুঝি

খোয়ারিজমির মুদি দোকানের তাক ভরে গেছে, আর আজ পাইকারের কাছ থেকে নতুন মাল এসেছে। জায়গা করতে হলে তাক থেকে কিছু একটা নামাতেই হবে — কিন্তু কোনটা? খোয়ারিজমি প্রথমে তাকিয়ে দেখল কোন প্যাকেটটায় সবচেয়ে বেশিদিন ধরে কেউ হাতই দেয়নি — পেছনের কোণে পড়ে থাকা একটা মশলার কৌটা, মাস দুয়েক কেউ ছোঁয়নি — সেটাই সে নামিয়ে দিল। তার যুক্তি সহজ: যেটা এত দিন কেউ চায়নি, সেটা কালকেও কেউ চাইবে না।

পাশের দোকানের সিনা আবার অন্যভাবে ভাবে। ও দেখে কোন জিনিসটা মোটের উপর সবচেয়ে কম বিক্রি হয় — হোক না সেটা কালকেই একবার বিক্রি হয়েছে, কিন্তু সারা মাসে যদি মাত্র দু-তিনটা যায়, সেই কম-চলা আইটেমটাই তাক থেকে সরায়। আর ফাতিমার দোকানে নিয়ম আরও আলাদা — ও ঘনঘন কিছু চলছে কি চলছে না তা দেখেই না, ও শুধু গায়ের মেয়াদের তারিখ দেখে; দই-পাউরুটির মতো যেগুলোর expiry পেরিয়ে গেছে, বিক্রি বেশি হোক কি কম, সেগুলো আগে ফেলে দেয়।

গল্পের তাকটাই cache, আর নতুন মাল ঢোকাতে পুরনো নামানোই eviction। খোয়ারিজমির "সবচেয়ে বেশিদিন কেউ ছোঁয়নি" নিয়মটা হলো LRU, সিনার "সবচেয়ে কম বিক্রি হয়" নিয়মটা LFU, আর ফাতিমার "মেয়াদ পেরোলেই বিদায়" নিয়মটা TTL। বাস্তবে Redis-এ এই সিদ্ধান্তটাই `maxmemory-policy` দিয়ে ঠিক করে দেওয়া হয় — সাধারণ cache-এ `allkeys-lru`, আর কিছু আইটেম বেশি জনপ্রিয় হলে `allkeys-lfu` — যাতে মেমরি ভরে গেলে ঠিক জিনিসটাই বেরিয়ে যায়, hot data নয়।

## Eviction কেন গুরুত্বপূর্ণ

Cache-এর একটা সীমা থাকে। Cache ভরে গেলে নতুন এন্ট্রির জায়গা করে দিতে তাকে কিছু একটা evict করতেই হয়। ভুল eviction policy hot data ফেলে দিয়ে cold data রেখে দেয় — যা পুরো উদ্দেশ্যটাকেই ব্যর্থ করে দেয়।

সঠিক policy নির্ভর করে আপনার access pattern-এর উপর:

- **Uniform random access** — যেকোনো policy কাজ করে, LRU ঠিক আছে
- **Temporal locality** — সম্প্রতি ব্যবহৃত আইটেমগুলো আবার ব্যবহৃত হওয়ার সম্ভাবনা বেশি → LRU
- **Frequency skew** — অল্প কিছু আইটেম অনেক বেশিবার অ্যাক্সেস হয় → LFU
- **Time-bounded freshness** — ব্যবহার যা-ই হোক, নির্দিষ্ট সময় পর ডেটা মেয়াদোত্তীর্ণ হয় → TTL

## TTL — Time to Live

সবচেয়ে সহজ এবং সবচেয়ে গুরুত্বপূর্ণ কৌশল। প্রতিটি cache এন্ট্রির একটা expiration time থাকে। সেই সময়ের পর এন্ট্রিটা অ্যাক্সেস হয়েছে কিনা তা নির্বিশেষে একটা miss হিসেবে গণ্য হয়।

```typescript
interface CacheEntry<T> {
	value: T;
	expiresAt: number; // unix ms
}

class TTLCache<T> {
	private store = new Map<string, CacheEntry<T>>();

	set(key: string, value: T, ttlSeconds: number): void {
		this.store.set(key, {
			value,
			expiresAt: Date.now() + ttlSeconds * 1000
		});
	}

	get(key: string): T | undefined {
		const entry = this.store.get(key);
		if (!entry) return undefined;

		if (Date.now() > entry.expiresAt) {
			this.store.delete(key); // lazy expiration
			return undefined;
		}

		return entry.value;
	}
}
```

**Lazy vs eager expiration:** বেশিরভাগ cache lazily expire করে — অ্যাক্সেসের সময় TTL চেক করে তখনই পরিষ্কার করে। Redis একটা হাইব্রিড পদ্ধতি ব্যবহার করে: অ্যাক্সেসে lazy, তার সাথে একটা background job যা নিয়মিত স্যাম্পল নিয়ে মেয়াদোত্তীর্ণ key মুছে ফেলে।

<Callout type="tip">

**গাট ফিলিং দিয়ে নয়, সহনীয় staleness-এর ভিত্তিতে TTL বেছে নিন।** Product catalog: 5 মিনিট ঠিক আছে। User profile: 60 সেকেন্ড। Session token: session-এর আয়ুর সাথে মিলিয়ে নিন। Config value: 30 সেকেন্ড। Price data: আপনার SLA-এর উপর নির্ভর করে।

</Callout>

## LRU — Least Recently Used

যে এন্ট্রিটা সবচেয়ে বেশি সময় ধরে অ্যাক্সেস হয়নি সেটাকে evict করে। এই ধারণার উপর কাজ করে যে আপনি সম্প্রতি যা ব্যবহার করেছেন তা শিগগিরই আবার ব্যবহার করবেন।

```typescript
class LRUCache<K, V> {
	private capacity: number;
	private map = new Map<K, V>();

	constructor(capacity: number) {
		this.capacity = capacity;
	}

	get(key: K): V | undefined {
		if (!this.map.has(key)) return undefined;

		// Move to end (most recently used)
		const value = this.map.get(key)!;
		this.map.delete(key);
		this.map.set(key, value);
		return value;
	}

	set(key: K, value: V): void {
		if (this.map.has(key)) {
			this.map.delete(key);
		} else if (this.map.size >= this.capacity) {
			// Delete least recently used (first item in Map)
			const firstKey = this.map.keys().next().value;
			this.map.delete(firstKey);
		}
		this.map.set(key, value);
	}
}

// JavaScript Maps maintain insertion order
// Deleting and re-inserting on access moves item to end
// First item is always LRU
const cache = new LRUCache<string, User>(1000);
```

**LRU কখন ব্যর্থ হয়:** একটা full table scan বা batch job যা অনেক unique key পড়ে, সেটা আপনার hot working set-কে evict করে দেবে, ফলে সাধারণ traffic-এর জন্য cache miss-এর ঝড় তৈরি হবে। একে বলে **cache pollution**।

## LFU — Least Frequently Used

যে এন্ট্রিটা সবচেয়ে কমবার অ্যাক্সেস হয়েছে সেটাকে evict করে। যেসব batch job একবার করে অনেক unique key অ্যাক্সেস করে, তাদের হাত থেকে সত্যিকারের জনপ্রিয় আইটেমগুলোকে রক্ষা করে।

```typescript
class LFUCache<K, V> {
	private capacity: number;
	private keyToVal = new Map<K, V>();
	private keyToFreq = new Map<K, number>();
	private freqToKeys = new Map<number, Set<K>>();
	private minFreq = 0;

	constructor(capacity: number) {
		this.capacity = capacity;
	}

	get(key: K): V | undefined {
		if (!this.keyToVal.has(key)) return undefined;
		this.incrementFreq(key);
		return this.keyToVal.get(key);
	}

	set(key: K, value: V): void {
		if (this.capacity <= 0) return;

		if (this.keyToVal.has(key)) {
			this.keyToVal.set(key, value);
			this.incrementFreq(key);
			return;
		}

		if (this.keyToVal.size >= this.capacity) {
			this.evict();
		}

		this.keyToVal.set(key, value);
		this.keyToFreq.set(key, 1);
		if (!this.freqToKeys.has(1)) this.freqToKeys.set(1, new Set());
		this.freqToKeys.get(1)!.add(key);
		this.minFreq = 1;
	}

	private incrementFreq(key: K): void {
		const freq = this.keyToFreq.get(key)!;
		this.keyToFreq.set(key, freq + 1);
		this.freqToKeys.get(freq)!.delete(key);

		if (this.freqToKeys.get(freq)!.size === 0) {
			this.freqToKeys.delete(freq);
			if (this.minFreq === freq) this.minFreq++;
		}

		if (!this.freqToKeys.has(freq + 1)) {
			this.freqToKeys.set(freq + 1, new Set());
		}
		this.freqToKeys.get(freq + 1)!.add(key);
	}

	private evict(): void {
		const keys = this.freqToKeys.get(this.minFreq)!;
		const evictKey = keys.values().next().value;
		keys.delete(evictKey);
		if (keys.size === 0) this.freqToKeys.delete(this.minFreq);
		this.keyToVal.delete(evictKey);
		this.keyToFreq.delete(evictKey);
	}
}
```

LFU বেশি জটিল এবং এর একটা **উল্টো cache pollution সমস্যা** আছে: নতুন জনপ্রিয় হওয়া আইটেমগুলো frequency 1 দিয়ে শুরু করে এবং নিজেদের যোগ্যতা প্রমাণ করার আগেই evict হয়ে যেতে পারে। এর সমাধান হলো **aging সহ LFU** — নিয়মিতভাবে সব frequency-কে decay করানো, যাতে পুরনো-কিন্তু-একসময়-জনপ্রিয় আইটেমগুলো আধিপত্য বিস্তার করতে না পারে।

## FIFO — First In, First Out

Access frequency নির্বিশেষে সবচেয়ে পুরনো এন্ট্রিটা evict করে। সহজ কিন্তু সাধারণত optimal নয় — 10 মিনিট আগে যোগ হওয়া এবং প্রতি সেকেন্ডে অ্যাক্সেস হওয়া একটা আইটেম, 9 মিনিট আগে যোগ হওয়া এবং কখনও অ্যাক্সেস না হওয়া আইটেমের চেয়ে আগে evict হওয়া উচিত নয়।

যখন আপনি সত্যিই শুধু সাম্প্রতিকতম N-টা আইটেম রাখতে চান, যেমন একটা event log, তখন এটা ব্যবহৃত হয়।

## হাতে-কলমে: কোন policy টিকে থাকে

নিচের cache-এ প্রতিটা ঘর একটা slot। বেশিরভাগ request যায় অল্প কয়েকটা hot key-তে (ভরাট ঘর), বাকিগুলো ছড়ানো লম্বা tail-এ। মাঝে মাঝে একটা batch job চলে, যেটা এক ঝাঁক নতুন key একবার করে পড়ে আর কখনো ফিরে আসে না (দাগকাটা ঘর)। ওপরে যে **cache pollution**-এর কথা বলা হলো, এটাই সেই পরিস্থিতি।

LRU রেখে **Batch scan চালাও** চাপো আর দেখো hot key-গুলোর কী হয়। তারপর একই কাজ LFU আর FIFO দিয়ে করো। চ্যালেঞ্জে মেমরি বাড়িয়ে পার পাওয়া যাবে না।

<EvictionSim />

## Random Replacement

একটা random এন্ট্রি evict করে। বাস্তবে LRU-এর সাথে অবাক করার মতো প্রতিযোগিতামূলক, কারণ এর কোনো overhead নেই — access order ট্র্যাক করার দরকার নেই। কিছু CPU cache-এ অভ্যন্তরীণভাবে ব্যবহৃত হয়।

## Redis Eviction Policies

Redis আটটি eviction policy দেয়, যা `maxmemory-policy` দিয়ে কনফিগার করা হয়:

```
noeviction        — return error when memory limit reached (default)
allkeys-lru       — evict any key using LRU
allkeys-lfu       — evict any key using LFU
allkeys-random    — evict any key randomly
volatile-lru      — evict keys with TTL set, using LRU
volatile-lfu      — evict keys with TTL set, using LFU
volatile-random   — evict keys with TTL set, randomly
volatile-ttl      — evict keys with TTL set, shortest TTL first
```

```bash
# Set in redis.conf or at runtime
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

**কোনটা বেছে নেবেন:**

- **Session store / general cache:** `allkeys-lru` — LRU দিয়ে যেকোনো key evict করে, নিরাপদ ডিফল্ট
- **Skewed access (Pareto traffic):** `allkeys-lfu` — আপনার শীর্ষ 1% key-কে রক্ষা করে
- **Persistent + cached data-এর মিশ্রণ:** `volatile-lru` — শুধু TTL সেট করা এন্ট্রি evict করে, persistent key রেখে দেয়
- **কখনও ডেটা হারাবেন না:** `noeviction` + maxmemory যথেষ্ট বেশি সেট করুন, ভরে যাওয়ার আগে alert দিন

<Callout type="warning">

`noeviction`-এর মানে "কোনো ডেটা হারানো নয়" নয় — এর মানে ভরে গেলে Redis লেখার সময় error রিটার্ন করে। আপনার অ্যাপ্লিকেশনকে সেই error সামলাতে হবে। একটা cache-এর জন্য এটা সাধারণত eviction-এর চেয়েও খারাপ।

</Callout>

## আপনার Cache-এর আকার নির্ধারণ

খুব ছোট cache সারাক্ষণ miss করে। খুব বড়টা মেমরি নষ্ট করে। সঠিক আকার নির্ভর করে আপনার working set-এর উপর — যেসব key আপনার অ্যাপ্লিকেশন আসলে নিয়মিত অ্যাক্সেস করে।

```typescript
// Instrument your cache to find the right size
class InstrumentedCache<K, V> {
	private hits = 0;
	private misses = 0;
	private evictions = 0;
	private inner: LRUCache<K, V>;

	constructor(capacity: number) {
		this.inner = new LRUCache(capacity);
	}

	get(key: K): V | undefined {
		const val = this.inner.get(key);
		if (val !== undefined) {
			this.hits++;
		} else {
			this.misses++;
		}
		return val;
	}

	stats() {
		const total = this.hits + this.misses;
		return {
			hitRatio: total === 0 ? 0 : this.hits / total,
			evictions: this.evictions,
			total
		};
	}
}
```

একটা ভালো শুরুর হিউরিস্টিক: **আপনার পুরো dataset নয়, আপনার working set cache করুন**। যদি আপনার 20% key মোট read-এর 80% হয় (Pareto distribution — খুবই সাধারণ), তাহলে সেই 20% cache করলে আপনি প্রায় 80% hit ratio পাবেন। সবকিছু cache করার দরকার আপনার খুব কমই পড়ে।

## TTL এবং LRU একসাথে ব্যবহার

Production cache দুটোই একসাথে ব্যবহার করে: এন্ট্রি তাদের TTL-এর পর expire হয় (freshness-এর জন্য) এবং LRU policy মেমরির চাপ সামলায়। Redis ঠিক এটাই করে।

```typescript
class TTLLRUCache<K, V> {
	private lru: LRUCache<K, { value: V; expiresAt: number }>;

	constructor(capacity: number) {
		this.lru = new LRUCache(capacity);
	}

	set(key: K, value: V, ttlSeconds: number): void {
		this.lru.set(key, {
			value,
			expiresAt: Date.now() + ttlSeconds * 1000
		});
	}

	get(key: K): V | undefined {
		const entry = this.lru.get(key);
		if (!entry) return undefined;
		if (Date.now() > entry.expiresAt) return undefined; // expired
		return entry.value;
	}
}
```

TTL correctness সামলায় (stale data)। LRU মেমরি সামলায় (চাপের মধ্যে eviction)। Production-এ একা কোনোটাই যথেষ্ট নয়।
