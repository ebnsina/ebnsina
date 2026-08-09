---
title: 'Network Security'
subtitle: 'CORS, CSP, MITM attack, firewall — network layer-এ প্র্যাকটিক্যাল সিকিউরিটি যা প্রতিটি ডেভেলপারের বোঝা উচিত।'
chapter: 8
level: 'advanced'
readingTime: '16 মিনিট'
topics: ['CORS', 'CSP', 'firewall', 'MITM', 'security headers']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনা থাকে একটা গেটেড আবাসিক এলাকায়। পুরো এলাকা ঘিরে উঁচু একটা বাউন্ডারি ওয়াল, ভেতরে ঢোকা-বেরোনোর একটাই গেট। সেই গেটে একজন দারোয়ান বসে থাকে — কে ঢুকতে পারবে, কে বেরোতে পারবে, কোন গাড়ি ভেতরে যাবে, সব সে নিয়ম মিলিয়ে যাচাই করে। বাইরের অচেনা কেউ এলে লিস্টে নাম না থাকলে তাকে ফিরিয়ে দেয়। আবার এলাকার ভেতরটাও পুরো খোলা নয় — আলাদা আলাদা ব্লক, প্রতিটার নিজের তালা দেওয়া গেট, একটা ব্লকের চাবি দিয়ে পাশের ব্লকে ঢোকা যায় না।

আল-খোয়ারিজমিকে একদিন শহরের একটা বিপজ্জনক এলাকা পার হয়ে অফিসে যেতে হয়। কমিউনিটি তাকে একটা ঢাকা, সিল করা প্রাইভেট ভ্যানে তুলে দেয় — বাইরের কেউ দেখতেও পায় না ভেতরে কে বসে আছে, ছিনতাইকারীও বুঝতে পারে না গাড়িতে কী যাচ্ছে। এদিকে পুরো এলাকা জুড়ে CCTV আর ফাতিমা আল-ফিহরি নামের এক সতর্ক নাইট-গার্ড আছে — কেউ সন্দেহজনকভাবে দেয়াল টপকাতে গেলে বা অচেনা কেউ ঘোরাঘুরি করলে সে সাথে সাথে টের পায় আর তাকে থামায়।

এই গল্পটাই আসলে **network security**। গেটে দারোয়ানের নিয়ম মিলিয়ে ঢোকা-বেরোনো যাচাই করাটা হলো **firewall** — সীমানায় বসে ট্রাফিক filter করা। আল-খোয়ারিজমির ঢাকা সিল করা ভ্যানটা হলো **VPN encrypted tunnel** — বিপজ্জনক নেটওয়ার্ক পেরিয়েও ভেতরের ডেটা কেউ দেখতে পায় না। CCTV আর ফাতিমা আল-ফিহরির সতর্ক নজর হলো **IDS/IPS** — সন্দেহজনক নড়াচড়া detect করা (IDS) আর সেটা থামিয়ে দেওয়া (IPS)। আর আলাদা তালা দেওয়া ব্লকগুলো হলো **network segmentation** — এক ব্লকে সিঁধ কাটলেও পুরো এলাকা খুলে যায় না। বাস্তবে ঠিক এভাবেই একটা কোম্পানি firewall, VPN, IDS/IPS আর segmentation একসাথে সাজিয়ে defense-in-depth বানায় — কোনো একটা লেয়ার ফাঁকি দিলেও বাকিগুলো ধরে ফেলে।

## CORS — Cross-Origin Resource Sharing

CORS হলো ব্রাউজারের জিজ্ঞেস করার উপায়: "এই frontend-টা কি এই API কল করার অনুমতি পেয়েছে?"

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

অনেকটা এয়ারপোর্টের সিকিউরিটি লেয়ারগুলোর মতো — firewall (প্রবেশ গেটে চেক), packet inspection (ব্যাগেজ স্ক্যানার), authentication (পাসপোর্ট কন্ট্রোল), এবং encryption (সিল করা কূটনৈতিক থলে)। ডিফেন্সের একাধিক লেয়ার।

</Callout>

যখন `app.example.com` থেকে `api.example.com`-এ একটা request যায়, ব্রাউজার একটা **preflight** request পাঠায়:

```typescript
// Browser sends preflight (automatically):
// OPTIONS /api/users
// Origin: https://app.example.com
// Access-Control-Request-Method: POST
// Access-Control-Request-Headers: Content-Type, Authorization

// Server must respond with:
// Access-Control-Allow-Origin: https://app.example.com
// Access-Control-Allow-Methods: GET, POST, PUT, DELETE
// Access-Control-Allow-Headers: Content-Type, Authorization
// Access-Control-Max-Age: 86400

// Express middleware
import cors from 'cors';

app.use(
	cors({
		origin: ['https://app.example.com', 'https://staging.example.com'],
		methods: ['GET', 'POST', 'PUT', 'DELETE'],
		allowedHeaders: ['Content-Type', 'Authorization'],
		credentials: true, // allow cookies
		maxAge: 86400 // cache preflight for 24h
	})
);
```

<Callout type="warning">

**`credentials: true`-এর সাথে কখনো `Access-Control-Allow-Origin: *` ব্যবহার করবেন না**। এটা যেকোনো ওয়েবসাইটকে আপনার API-তে authenticated request পাঠানোর সুযোগ দেয়। সবসময় নির্দিষ্ট origin whitelist করুন।

</Callout>

## Security Headers

```typescript
// Essential security headers for any web application
const securityHeaders = {
	// Prevent clickjacking (embedding your site in an iframe)
	'X-Frame-Options': 'DENY',

	// Prevent MIME type sniffing
	'X-Content-Type-Options': 'nosniff',

	// Force HTTPS for 1 year
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

	// Control what the browser can load
	'Content-Security-Policy': [
		"default-src 'self'",
		"script-src 'self' 'nonce-abc123'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"connect-src 'self' https://api.example.com",
		"frame-ancestors 'none'"
	].join('; '),

	// Control what info is sent in Referer header
	'Referrer-Policy': 'strict-origin-when-cross-origin',

	// Opt into browser security features
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
```

## Content Security Policy (CSP)

CSP ব্রাউজারকে ঠিক ঠিক বলে দেয় আপনার page কোন কোন resource লোড করার অনুমতি পেয়েছে। এটা XSS attack ঠেকায় — attacker যদি একটা script tag inject-ও করে ফেলে, ব্রাউজার সেটা execute করবে না।

```typescript
// Without CSP: injected <script> runs freely
// With CSP: browser blocks scripts not in the whitelist

// Nonce-based CSP (recommended)
// Server generates a random nonce for each request
import crypto from 'node:crypto';

function generateCSP(): { header: string; nonce: string } {
	const nonce = crypto.randomBytes(16).toString('base64');

	return {
		nonce,
		header: [
			"default-src 'self'",
			`script-src 'nonce-${nonce}' 'strict-dynamic'`,
			"style-src 'self' 'unsafe-inline'",
			"object-src 'none'",
			"base-uri 'self'"
		].join('; ')
	};
}

// In your HTML template:
// <script nonce="<%= nonce %>">...</script>
// Scripts without the matching nonce are blocked
```

## Man-in-the-Middle (MITM) Attack

Attacker নিজেকে client আর server-এর মাঝখানে বসিয়ে দেয়, ট্রাফিক intercept বা modify করে।

**ডিফেন্স:**

- **সর্বত্র TLS** — encrypted ট্রাফিক পড়া বা modify করা যায় না
- **HSTS** — SSL stripping (HTTPS-কে HTTP-তে ডাউনগ্রেড করা) ঠেকায়
- **Certificate pinning** — mobile app শুধু chain নয়, ঠিক নির্দিষ্ট certificate-টাই verify করে
- **DNSSEC** — DNS spoofing ঠেকায় যা ট্রাফিক redirect করে দিতে পারত

## Network Layer-এ Rate Limiting

```typescript
// Simple token bucket rate limiter
class RateLimiter {
	private tokens: Map<string, { count: number; resetAt: number }> = new Map();

	constructor(
		private maxRequests: number,
		private windowMs: number
	) {}

	isAllowed(clientIP: string): boolean {
		const now = Date.now();
		const bucket = this.tokens.get(clientIP);

		if (!bucket || bucket.resetAt < now) {
			this.tokens.set(clientIP, { count: 1, resetAt: now + this.windowMs });
			return true;
		}

		if (bucket.count >= this.maxRequests) {
			return false; // 429 Too Many Requests
		}

		bucket.count++;
		return true;
	}
}

// Usage: 100 requests per minute per IP
const limiter = new RateLimiter(100, 60_000);
```

<Callout type="info">

**Defense in depth**: কোনো একটামাত্র সিকিউরিটি ব্যবস্থা যথেষ্ট নয়। TLS + security headers + CSP + rate limiting + input validation একসাথে ব্যবহার করুন। প্রতিটা লেয়ার সেটাই ধরে যা বাকিগুলো মিস করে।

</Callout>

## মূল শিক্ষা

1. **CORS একটা ব্রাউজার ফিচার**, server-এর সিকিউরিটি ব্যবস্থা নয় — API এখনো non-browser client থেকে কল করা যায়
2. **Security headers হলো সস্তা বিমা** — প্রতিটা response-এ এগুলো যোগ করুন
3. **CSP XSS ঠেকায়** — এমনকি আপনার কোডে injection দুর্বলতা থাকলেও
4. **TLS + HSTS একসাথে** MITM আর SSL stripping ঠেকায়
5. **Network layer-এ rate limiting** হলো অপব্যবহারের বিরুদ্ধে আপনার প্রথম প্রতিরক্ষা লাইন
