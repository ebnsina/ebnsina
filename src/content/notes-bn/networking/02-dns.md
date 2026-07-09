---
title: 'DNS — ইন্টারনেটের ফোন বুক'
subtitle: 'ডোমেইন নাম কীভাবে IP অ্যাড্রেসে রূপ নেয় — recursive resolver, authoritative server, ক্যাশিং, আর DNS রেকর্ড টাইপ।'
chapter: 2
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['DNS', 'domain names', 'resolvers', 'records']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## DNS কেন দরকার

মানুষ নাম মনে রাখে (`google.com`), কম্পিউটারের দরকার নাম্বার (`142.250.80.46`)। DNS (Domain Name System) এই দুটোর মাঝের ফাঁকটা পূরণ করে — এটা একটা গ্লোবালি ডিস্ট্রিবিউটেড ডেটাবেস যেটা ডোমেইন নামকে IP অ্যাড্রেসে ম্যাপ করে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ফোন নাম্বার খুঁজতে 411 (directory assistance) এ কল করার মতো। আপনি একটা নাম দেন, তারা নাম্বারটা ফেরত দেয়। DNS হলো ইন্টারনেটের ফোন বুক — আপনি "google.com" টাইপ করেন আর DNS IP অ্যাড্রেসটা ফেরত দেয়।

</Callout>

## DNS Resolution প্রক্রিয়া

আপনি যখন ব্রাউজারে `api.example.com` টাইপ করেন:

1. **Browser cache** — প্রথমে এটা চেক করা হয় (আগের লুকআপ থেকে ক্যাশ করা)
2. **OS cache** — আপনার অপারেটিং সিস্টেমের resolver cache
3. **Recursive resolver** — আপনার ISP-এর DNS server (কিংবা `8.8.8.8`, `1.1.1.1`)
4. **Root nameserver** — জানে `.com` কোথায় খুঁজতে হবে
5. **TLD nameserver** — জানে `example.com` কোথায় খুঁজতে হবে
6. **Authoritative nameserver** — আসল উত্তরটা এর কাছে আছে

```typescript
// Simplified DNS resolution
interface DNSRecord {
	name: string;
	type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS';
	value: string;
	ttl: number; // seconds until this record expires
}

async function resolve(domain: string): Promise<string> {
	// Step 1: Check local cache
	const cached = cache.get(domain);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.value;
	}

	// Step 2: Ask recursive resolver
	// The resolver handles the root → TLD → authoritative chain
	const record = await queryResolver(domain, 'A');

	// Step 3: Cache the result
	cache.set(domain, {
		value: record.value,
		expiresAt: Date.now() + record.ttl * 1000
	});

	return record.value;
}
```

## DNS রেকর্ড টাইপ

| Type  | উদ্দেশ্য              | উদাহরণ ভ্যালু                     |
| ----- | --------------------- | --------------------------------- |
| A     | Domain → IPv4 address | `93.184.216.34`                   |
| AAAA  | Domain → IPv6 address | `2606:2800:220:1::`               |
| CNAME | অন্য ডোমেইনের alias   | `www.example.com → example.com`   |
| MX    | ডোমেইনের mail server  | `mail.example.com` (priority: 10) |
| TXT   | যেকোনো টেক্সট         | SPF records, domain verification  |
| NS    | zone-এর nameserver    | `ns1.example.com`                 |

## TTL আর ক্যাশিং

প্রতিটা DNS রেকর্ডের একটা **TTL (Time to Live)** থাকে — resolver-দের এটা কত সেকেন্ড ক্যাশ করে রাখা উচিত। এটা একটা tradeoff:

- **Short TTL (60s)**: পরিবর্তন দ্রুত propagate হয়, কিন্তু বেশি DNS query (ইউজারদের জন্য ধীর)
- **Long TTL (86400s)**: কম query, কিন্তু পরিবর্তন propagate হতে ২৪ ঘণ্টা পর্যন্ত লাগতে পারে

```typescript
// Real-world TTL strategy
const records = {
	// Static infrastructure — cache aggressively
	'cdn.example.com': { type: 'CNAME', value: 'd123.cloudfront.net', ttl: 86400 },

	// API endpoint — moderate cache for flexibility
	'api.example.com': { type: 'A', value: '10.0.1.50', ttl: 300 },

	// Failover record — short TTL for quick switching
	'primary.example.com': { type: 'A', value: '10.0.1.10', ttl: 60 }
};
```

<Callout type="tip">

**DNS propagation** আসলে "propagation" না — এটা cache expiration। আপনি যখন একটা DNS রেকর্ড বদলান, পুরনো রেকর্ডটা সব জায়গায় ক্যাশ হয়ে থাকে যতক্ষণ না এর TTL শেষ হয়। এজন্যই migration-এর _আগে_ TTL কমিয়ে রাখা একটা কমন প্র্যাকটিস।

</Callout>

## DNS একটা Load Balancer হিসেবে

DNS একটা ডোমেইনের জন্য একাধিক IP অ্যাড্রেস ফেরত দিতে পারে। Resolver সেগুলোর মধ্যে ঘুরে ঘুরে (round-robin) ট্রাফিক একাধিক সার্ভারে ছড়িয়ে দেয়:

```typescript
// Round-robin DNS
const responses = [
	{ type: 'A', value: '10.0.1.1', ttl: 60 },
	{ type: 'A', value: '10.0.1.2', ttl: 60 },
	{ type: 'A', value: '10.0.1.3', ttl: 60 }
];

// GeoDNS — return different IPs based on client location
function geoDNS(clientIP: string): string {
	const region = geolocate(clientIP);
	const servers: Record<string, string> = {
		'us-east': '10.0.1.1',
		'eu-west': '10.0.2.1',
		'ap-south': '10.0.3.1'
	};
	return servers[region] || servers['us-east'];
}
```

## সিকিউরিটি: DNS Attack

DNS ডিজাইন করা হয়েছিল সিকিউরিটি ছাড়াই। কমন আক্রমণগুলো:

- **DNS spoofing**: আক্রমণকারী ভুয়া DNS response পাঠায়, ইউজারদের ম্যালিশিয়াস সার্ভারে রিডাইরেক্ট করে
- **DNS amplification DDoS**: আক্রমণকারী DNS server ব্যবহার করে একজন ভিকটিমের দিকে লক্ষ্য করা ট্রাফিক amplify করে
- **DNSSEC**: spoofing ঠেকাতে DNS রেকর্ডে ক্রিপ্টোগ্রাফিক signature (adoption এখনো বাড়ছে)

## মূল শিক্ষা

1. **DNS hierarchical** — root → TLD → authoritative, প্রতিটা লেভেলে ক্যাশিং সহ
2. **TTL ক্যাশিং নিয়ন্ত্রণ করে** — migration-এর আগে কমান, stable রেকর্ডের জন্য বাড়ান
3. **DNS শুধু name→IP-এর চেয়ে বেশি** — এটা mail routing, verification, aliasing, আর load balancing সামলায়
4. **DNS একটা single point of failure** — আপনার DNS ডাউন হলে কিছুই কাজ করে না (একাধিক provider ব্যবহার করুন)
