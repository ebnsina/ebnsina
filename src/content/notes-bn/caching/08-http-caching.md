---
title: 'HTTP Caching ও CDN'
subtitle: 'Cache-Control, ETag, এবং CDN edge caching — যে লেয়ারটি স্ট্যাটিক কনটেন্টের জন্য আপনার সার্ভারকে পুরোপুরি অপ্রয়োজনীয় করে দিতে পারে।'
chapter: 8
level: 'intermediate'
readingTime: '14 মিনিট'
topics: ['Cache-Control', 'ETag', 'CDN', 'edge caching', 'HTTP headers']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

করিমের নতুন পত্রিকা পড়ার নেশা। কিন্তু পত্রিকার হেড অফিস আর ছাপাখানা শহরের ঠিক মাঝখানে — বাসা থেকে যেতে-আসতেই দুই ঘণ্টা। প্রতিদিন সকালে হেড অফিস পর্যন্ত হেঁটে গিয়ে একটা কাগজ আনা অসম্ভব। ভাগ্য ভালো, পত্রিকা কোম্পানি প্রতিটা পাড়াতেই একটা করে ছোট এজেন্ট-দোকান বসিয়ে দিয়েছে। ভোরে হেড অফিস থেকে একগাদা কপি প্রতিটা পাড়ার দোকানে পৌঁছে যায়, আর করিম দুই মিনিট হেঁটে মোড়ের দোকান থেকেই আজকের কাগজটা নিয়ে আসে — হেড অফিস পর্যন্ত যেতেই হয় না।

প্রতিটা কপির উপরে ছাপা থাকে তারিখ — "১৫ জুলাই সংস্করণ"। ওই তারিখ পর্যন্ত করিম নিশ্চিন্ত, দোকানের কপিটাই টাটকা, আবার হেড অফিসে খোঁজ নেওয়ার দরকার নেই। কিন্তু একদিন শহরে বড় খবর হলো, করিমের সন্দেহ হলো নতুন সংস্করণ বেরিয়েছে কিনা। সে দোকানে গিয়ে জিজ্ঞেস করল, "নতুন এডিশন এসেছে নাকি?" দোকানদার রহিম হেড অফিসে এক ফোন দিয়ে ফিরে বলল, "না ভাই, এখনো ওই একটাই — এটাই টাটকা।" করিমকে গোটা কাগজ আবার আনতে হলো না, শুধু "এখনো একই আছে" — এই ছোট্ট নিশ্চয়তাটুকুই যথেষ্ট।

এই পুরো ব্যবস্থাটাই **HTTP caching ও CDN**। পাড়ার এজেন্ট-দোকান হলো CDN edge, দূরের হেড অফিস হলো origin server; কাগজে ছাপা তারিখ হলো `Cache-Control: max-age` — যতক্ষণ মেয়াদ আছে ততক্ষণ edge থেকেই পরিবেশন হয়, origin ছোঁয়া লাগে না। আর "নতুন এডিশন এসেছে?" জিজ্ঞেস করে গোটা কাগজ ছাড়াই "একই আছে" জবাব পাওয়া — এটাই `ETag` দিয়ে freshness re-check, যেখানে সার্ভার পুরো বডি না পাঠিয়ে `304 Not Modified` দেয়। বাস্তবে Cloudflare, Fastly-এর মতো CDN ঠিক এভাবেই দুনিয়াজুড়ে ইউজারের কাছের edge থেকে স্ট্যাটিক কনটেন্ট সার্ভ করে origin-এর চাপ প্রায় শূন্যে নামিয়ে আনে।

## HTTP Caching কেন আছে

প্রতিটি HTTP রেসপন্স নিজের সাথে নির্দেশনা বহন করতে পারে যে এটি কীভাবে ক্যাশ করা হবে — ব্রাউজার, প্রক্সি এবং CDN edge node দ্বারা। এই নির্দেশনাগুলো সঠিকভাবে সেট করা থাকলে, একই রিসোর্সের জন্য বারবার আসা রিকোয়েস্ট আর কখনোই আপনার সার্ভার পর্যন্ত পৌঁছায় না।

এটি যে সমস্যাটি সমাধান করে: লাখ লাখ ইউজারকে একই বাইট বারবার পরিবেশন করা অপচয়। একটি একক অরিজিন থেকে 500KB এর একটি JavaScript bundle 10 মিলিয়ন ইউজারকে দিলে সেটা 5TB ট্রান্সফার। HTTP caching মানে এই ইউজারদের বেশিরভাগই কখনো আপনার অরিজিনের সাথে যোগাযোগই করে না।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটি সংবাদপত্রের প্রেস সকালে 100,000 কপি ছাপায়। প্রতিটি কপি একটি ডেলিভারি ডিপোতে (CDN edge node) যায়। পাঠকরা প্রেস থেকে নয়, ডিপো থেকে কপি সংগ্রহ করে। নতুন সংস্করণ থাকলেই কেবল প্রেস চালু হয়। HTTP caching-ও ঠিক একই রকম: আপনার সার্ভার হলো প্রেস, CDN edge হলো ডিপো, আর `Cache-Control` ডিপোকে বলে দেয় আজকের সংস্করণটি ফেলে দেওয়ার আগে কতক্ষণ রাখতে হবে।

</Callout>

## Cache-Control Header

প্রধান কৌশল। এটি নিয়ন্ত্রণ করে কে ক্যাশ করতে পারবে, কতক্ষণের জন্য, এবং কোন শর্তে।

```http
Cache-Control: public, max-age=31536000, immutable
```

**গুরুত্বপূর্ণ ডিরেক্টিভ:**

| Directive                  | অর্থ                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `public`                   | CDN এবং প্রক্সি এটি ক্যাশ করতে পারবে                                                  |
| `private`                  | কেবল ব্রাউজার ক্যাশ করতে পারবে (CDN নয়)                                              |
| `no-store`                 | কোথাও কখনোই ক্যাশ করবে না                                                             |
| `no-cache`                 | ক্যাশ করবে কিন্তু পরিবেশনের আগে রিভ্যালিডেট করবে                                      |
| `max-age=N`                | N সেকেন্ডের জন্য ফ্রেশ                                                                |
| `s-maxage=N`               | CDN-এর ফ্রেশনেস (CDN-এর ক্ষেত্রে max-age ওভাররাইড করে)                                |
| `stale-while-revalidate=N` | রিফ্রেশ করার সময় N সেকেন্ড পর্যন্ত stale পরিবেশন করবে                                |
| `immutable`                | max-age চলাকালে কখনো রিভ্যালিডেট করবে না (ব্রাউজার hint)                              |
| `must-revalidate`          | stale হলে অবশ্যই অরিজিনের সাথে যোগাযোগ করবে, মেয়াদোত্তীর্ণ কিছু কখনো পরিবেশন করবে না |

```typescript
// Express/Node.js — set cache headers
app.get('/api/products/:id', async (req, res) => {
	const product = await getProduct(req.params.id);

	// Public, 5 minute CDN cache, serve stale for 30s while revalidating
	res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=30');
	res.json(product);
});

// Immutable assets (content-hashed filenames)
app.use(
	'/assets',
	express.static('dist/assets', {
		setHeaders: (res) => {
			res.set('Cache-Control', 'public, max-age=31536000, immutable');
		}
	})
);

// Private, user-specific data
app.get('/api/me', authenticate, (req, res) => {
	res.set('Cache-Control', 'private, max-age=60');
	res.json(req.user);
});
```

<Callout type="tip">

**আপনার অ্যাসেট ফাইলনেমকে content-hash করুন।** `app.js?v=1.2.3` ভঙ্গুর — কেউ হয়তো পুরনো ফাইল ক্যাশ করে ভার্সন কোয়েরি উপেক্ষা করবে। `app.a4f8c2b1.js` হলো ফাইল কনটেন্টের হ্যাশ — ফাইল বদলালে URL বদলায়, এবং ব্রাউজার স্বয়ংক্রিয়ভাবে ফ্রেশ কপি ফেচ করে। তখন আপনি নিরাপদে `max-age=31536000` সেট করতে পারেন।

</Callout>

## ETag এবং Conditional Request

একটি ETag হলো রেসপন্স বডির একটি ফিঙ্গারপ্রিন্ট। পরবর্তী রিকোয়েস্টগুলোতে ব্রাউজার এটি ফেরত পাঠায়; সার্ভার তা যাচাই করে এবং হয় ফ্রেশ ডেটা ফেরত দেয় অথবা `304 Not Modified` দেয় (কোনো বডি ছাড়া, ব্যান্ডউইথ বাঁচায়)।

```typescript
import { createHash } from 'crypto';

function generateETag(content: string): string {
	return `"${createHash('md5').update(content).digest('hex')}"`;
}

app.get('/api/config', async (req, res) => {
	const config = await getConfig();
	const body = JSON.stringify(config);
	const etag = generateETag(body);

	// Client sends If-None-Match: "abc123" on repeat requests
	if (req.headers['if-none-match'] === etag) {
		return res.status(304).end(); // Not Modified — no body sent
	}

	res.set('ETag', etag);
	res.set('Cache-Control', 'public, max-age=60, must-revalidate');
	res.json(config);
});
```

**Last-Modified / If-Modified-Since** — পুরনো, টাইমস্ট্যাম্প-ভিত্তিক সমতুল্য:

```typescript
app.get('/api/posts/:id', async (req, res) => {
	const post = await getPost(req.params.id);
	const lastModified = post.updatedAt.toUTCString();

	if (req.headers['if-modified-since'] === lastModified) {
		return res.status(304).end();
	}

	res.set('Last-Modified', lastModified);
	res.set('Cache-Control', 'public, max-age=300');
	res.json(post);
});
```

## CDN Edge Caching

একটি CDN বিশ্বজুড়ে ইউজারদের কাছাকাছি সার্ভার (PoP — points of presence) বসিয়ে দেয়। রিকোয়েস্ট সবচেয়ে কাছের PoP-এ পৌঁছায়। PoP-এর কাছে রেসপন্স ক্যাশ করা থাকলে, সেটি আপনার অরিজিনের সাথে যোগাযোগ না করেই তা পরিবেশন করে।

```
User (London) → Cloudflare London PoP → cached response (2ms)
                                       ↓ cache miss
                                       → Your origin (Frankfurt) → 20ms
```

```typescript
// Cloudflare Cache API (Workers)
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const cacheKey = new Request(request.url, request);
		const cache = caches.default;

		// Check edge cache
		let response = await cache.match(cacheKey);
		if (response) return response;

		// Cache miss — fetch from origin
		response = await fetch(request);

		// Cache the response at the edge
		const responseToCache = new Response(response.body, response);
		responseToCache.headers.set('Cache-Control', 'public, max-age=300');
		await cache.put(cacheKey, responseToCache);

		return response;
	}
};
```

**CDN cache purging** — কনটেন্ট বদলালে CDN ক্যাশ purge করুন:

```typescript
// Cloudflare API purge
async function purgeCloudflare(urls: string[]): Promise<void> {
	await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${CLOUDFLARE_TOKEN}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ files: urls })
	});
}

// On product update, purge CDN cache
async function updateProduct(id: string, data: Partial<Product>): Promise<void> {
	await db.products.update(id, data);
	await purgeCloudflare([
		`https://yoursite.com/api/products/${id}`,
		`https://yoursite.com/products/${id}`
	]);
}
```

## Vary Header

CDN-কে বলে রিকোয়েস্ট হেডারের ভিত্তিতে ভিন্ন ভিন্ন সংস্করণ ক্যাশ করতে:

```typescript
// Different response for mobile vs desktop
res.set('Vary', 'User-Agent'); // ⚠️ terrible — too many variations

// Better: use a normalized hint
res.set('Vary', 'Accept-Encoding'); // compressed vs uncompressed
res.set('Vary', 'Accept'); // JSON vs HTML
```

<Callout type="warning">

**`Vary: User-Agent` এড়িয়ে চলুন।** User-Agent স্ট্রিং প্রায় অসীম। CDN প্রতিটি ভিন্নতার জন্য আলাদা ক্যাশ এন্ট্রি তৈরি করে — আপনার cache hit ratio ধসে পড়ে। ডিভাইস-নির্দিষ্ট কনটেন্ট দরকার হলে সেটি ভিন্ন URL থেকে পরিবেশন করুন অথবা Client Hints ব্যবহার করুন।

</Callout>

## সাধারণ Caching প্যাটার্ন

**স্ট্যাটিক অ্যাসেট (JS, CSS, images):**

```http
Cache-Control: public, max-age=31536000, immutable
```

চিরকালের জন্য ক্যাশ করুন। ফাইল বদলালে URL বদলায় (content hash)।

**API রেসপন্স (ক্যাশযোগ্য):**

```http
Cache-Control: public, max-age=60, stale-while-revalidate=30
```

1 মিনিটের জন্য ফ্রেশ, রিভ্যালিডেট করার সময় অতিরিক্ত 30 সেকেন্ড stale পরিবেশন করুন।

**ইউজার-নির্দিষ্ট API রেসপন্স:**

```http
Cache-Control: private, max-age=30
```

ব্রাউজার ক্যাশ করতে পারবে, CDN পারবে না।

**কখনোই ক্যাশ করবেন না:**

```http
Cache-Control: no-store
```

Mutation, পেমেন্ট, সংবেদনশীল ইউজার ডেটা।

**HTML পেজ (SPA shell):**

```http
Cache-Control: public, max-age=0, must-revalidate
ETag: "abc123"
```

সবসময় রিভ্যালিডেট করুন কিন্তু ETag মিললে ক্যাশ করা সংস্করণ পরিবেশন করুন (304 রেসপন্স)।

## রিসোর্স টাইপ অনুযায়ী Cache-Control কৌশল

```typescript
function getCacheHeaders(resource: 'asset' | 'api' | 'html' | 'user-data'): string {
	switch (resource) {
		case 'asset':
			return 'public, max-age=31536000, immutable';
		case 'api':
			return 'public, max-age=60, stale-while-revalidate=30';
		case 'html':
			return 'public, max-age=0, must-revalidate';
		case 'user-data':
			return 'private, max-age=30';
		default:
			return 'no-store';
	}
}
```

## HTTP Cache ডিবাগ করা

```bash
# Check response headers
curl -I https://yoursite.com/api/products/1

# Check cache status (Cloudflare adds cf-cache-status)
# HIT = served from CDN edge
# MISS = fetched from origin
# EXPIRED = stale, re-fetched
# BYPASS = cache bypassed

# Chrome DevTools → Network → Response Headers → Cache-Control, Age, cf-cache-status
# Age header tells you how old the cached response is (seconds since origin served it)
```

`Age` হেডার আপনার সেরা ডিবাগিং টুল। `Age: 0` হলে, CDN এইমাত্র অরিজিন থেকে ফেচ করেছে। `Age: 240` হলে, এই রেসপন্সটি 4 মিনিট ধরে ক্যাশ করা আছে।
