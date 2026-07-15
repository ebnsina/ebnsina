---
title: 'Sharding Concepts'
subtitle: 'যখন replication যথেষ্ট নয়, partition key, shard routing strategy, এবং shard করলে আপনি যে operational জটিলতা মেনে নেন।'
chapter: 3
level: 'intermediate'
readingTime: '10 মিনিট'
topics:
  ['sharding', 'partition key', 'consistent hashing', 'horizontal partitioning', 'shard routing']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটি লাইব্রেরি এক বিল্ডিং ছাড়িয়ে যায়: আপনি সংগ্রহটিকে বিষয় অনুযায়ী একাধিক বিল্ডিংয়ে ভাগ করেন। Fiction যায় বিল্ডিং A-তে, non-fiction বিল্ডিং B-তে, reference বিল্ডিং C-তে। প্রতিটি লাইব্রেরিয়ান তার বিল্ডিংয়ের সংগ্রহ নিবিড়ভাবে জানেন। যখন কোনো পাঠক আসেন, একটি directory (router) তাকে বলে দেয় কোন বিল্ডিংয়ে যেতে হবে। প্রতিটি বিল্ডিংয়ে না গিয়ে সব বিল্ডিং জুড়ে একটি single search করা যায় না — এটাই sharding-এর trade-off।

</Callout>

## গল্পে বুঝি

আল-খোয়ারিজমি একটা বিশাল বিজ্ঞান সম্মেলনের আয়োজক — লাখ লাখ অতিথি, একটা মাত্র রেজিস্ট্রেশন ডেস্ক দিয়ে সামলানো অসম্ভব। তাই তিনি কয়েকটা আলাদা ডেস্ক বসালেন, আর নিয়ম করলেন: অতিথির পদবির (surname) প্রথম অক্ষর দিয়ে ভাগ হবে। A থেকে F যাদের পদবি, তারা যাবে প্রথম ডেস্কে; G থেকে M দ্বিতীয় ডেস্কে; বাকিরা তৃতীয় ডেস্কে। যেহেতু অতিথিদের পদবি হরেক রকম, প্রতিটা ডেস্কে মোটামুটি সমান ভিড় জমে — লাইন দ্রুত এগোয়, প্রত্যেক ডেস্কের লোক শুধু তার নিজের অংশটুকুই সামলায়। চমৎকার কাজ করে।

কিন্তু পরের একটা সম্মেলনে বিপত্তি বাধল। সেবার প্রায় সব অতিথির পদবিই "আনসারি" (Ansari) — মানে সবাই একই ডেস্কের ভাগে পড়ল। ওই একটা ডেস্কের সামনে ভয়ানক লম্বা লাইন, লোকটা ঘামছে, আর বাকি ডেস্কগুলো একদম ফাঁকা, বসে বসে মাছি তাড়াচ্ছে। তার উপর ইবনে সিনা নামের একজনকে খুঁজতে গিয়ে দেখা গেল — তাঁর পদবি কেউ জানে না, তাই কোন ডেস্কে তিনি আছেন সেটাও অজানা। বাধ্য হয়ে একে একে সব ডেস্কে গিয়ে খোঁজ নিতে হলো।

এই গল্পটাই আসলে **sharding**। প্রতিটা রেজিস্ট্রেশন ডেস্ক হলো একেকটা shard (node), আর "পদবির প্রথম অক্ষর দিয়ে ভাগ" — এই নিয়মটাই **shard key**। পদবি যখন হরেক রকম, ভিড় সব ডেস্কে সমানভাবে ছড়িয়ে পড়ে — এটাই ভালো shard key (even distribution)। কিন্তু সবাই "আনসারি" হয়ে গেলে একটা ডেস্ক ডুবে যায় আর বাকিরা অলস বসে থাকে — এটাই খারাপ shard key থেকে তৈরি **hotspot**। আর পদবি না জানা অতিথিকে খুঁজতে সব ডেস্ক ঘুরে দেখাটাই যন্ত্রণাদায়ক **cross-shard query**। বাস্তবে ঠিক এ কারণেই shard key হিসেবে `country_code`-এর মতো অসম বা `status`-এর মতো low-cardinality কলাম বাছলে বিপদ — কোনো একটা shard-এ চাপ জমে বাকিরা খালি পড়ে থাকে, তাই এমন key বাছুন যা load-টা সব node-এ সমানভাবে ছড়ায়।

## কখন Shard করবেন

Sharding শেষ উপায়। এটি উল্লেখযোগ্য operational জটিলতা যোগ করে। Shard করার আগে:

1. **Query optimize করুন** — index, query rewriting, batching
2. **Vertical scale** — বড় server (PostgreSQL শক্তিশালী hardware-এ ভালো scale করে)
3. **Read replica** — read load ভাগ করুন
4. **Caching** — database থেকে পুনরাবৃত্তিমূলক read সরিয়ে দিন
5. **Partitioning** — Postgres table partitioning (single-server, application-এর কাছে transparent)
6. **Application-level archival** — পুরনো data hot table থেকে সরিয়ে নিন

Shard করুন যখন: write গুলো এক server-এর সামর্থ্য ছাড়িয়ে যায়, অথবা data volume এক server-এর disk-এর ধারণক্ষমতা ছাড়িয়ে যায়, এবং আপনি উপরের বিকল্পগুলো নিঃশেষ করেছেন।

বাস্তবে: বেশিরভাগ application-এর কখনও shard করার দরকার হয় না। Instagram বছরের পর বছর PostgreSQL-এ চলেছে। GitHub বিশাল scale-এ MySQL চালায়। Database খুব কমই প্রথম bottleneck হয়।

## Sharding vs Partitioning

**Table partitioning (Postgres native):** একটি database, একাধিক physical table, query-র কাছে transparent। Postgres partition key-এর ভিত্তিতে internally route করে। কোনো application পরিবর্তন লাগে না।

```sql
-- Postgres range partitioning by date — single server
CREATE TABLE orders (
  id UUID,
  customer_id UUID,
  created_at TIMESTAMPTZ,
  total_cents INT
) PARTITION BY RANGE (created_at);

CREATE TABLE orders_2024_q1 PARTITION OF orders
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

CREATE TABLE orders_2024_q2 PARTITION OF orders
  FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');

-- Query still uses `orders` — Postgres routes to the right partition
SELECT * FROM orders WHERE created_at > '2024-03-01';
```

**Sharding:** একাধিক database server জুড়ে data। Application-কে জানতে হবে কোন server-এর সাথে কথা বলতে হবে।

```
Shard 1 (server A): customers 0–333k
Shard 2 (server B): customers 333k–666k
Shard 3 (server C): customers 666k–1M
```

## Shard Key নির্বাচন

সবচেয়ে গুরুত্বপূর্ণ সিদ্ধান্ত। ভুল করলে আপনার hotspot হবে, সর্বত্র cross-shard query হবে, এবং rebalancing একটা দুঃস্বপ্ন হয়ে যাবে।

**ভালো shard key-এর বৈশিষ্ট্য:**

- High cardinality (অনেক distinct value)
- সমানভাবে distributed (কোনো hotspot নেই)
- Stable (তৈরির পরে বদলায় না)
- বেশিরভাগ query-তে থাকে (scatter-gather এড়ায়)

**সাধারণ পছন্দ:**

- `customer_id` — একজন customer-এর সব data এক shard-এ; বেশিরভাগ query-তে customer_id থাকে
- `tenant_id` — multi-tenant SaaS-এর জন্য; সব tenant data এক shard-এ
- `user_id` — একই pattern

**খারাপ shard key:**

- `created_at` — সব নতুন write সর্বশেষ shard-এ যায় (hotspot)
- `status` — low cardinality (কম distinct value → অসম distribution)
- `country_code` — অসম distribution (US-এ Luxembourg-এর চেয়ে 100x বেশি data)

```typescript
// Shard key must appear in every query
// GOOD: customer_id in every query
SELECT * FROM orders WHERE customer_id = $1 AND status = 'pending';
// Routes to exactly one shard

// BAD: query without shard key
SELECT * FROM orders WHERE status = 'pending' AND total > 10000;
// Must query ALL shards (scatter-gather) — O(N shards) cost
```

## Range Sharding

প্রতিটি shard-কে key value-র একটি range assign করুন:

```
Shard 1: customer_id 1–1,000,000
Shard 2: customer_id 1,000,001–2,000,000
Shard 3: customer_id 2,000,001–3,000,000
```

**সুবিধা:** সরল routing, shard key-এর উপর range query এক shard-এ hit করে।

**অসুবিধা:** নতুন customer সবসময় শেষ shard-এ যায় (write-এর জন্য hotspot)। Rebalancing-এর জন্য server-এর মধ্যে data range সরাতে হয়।

```typescript
function getShardForCustomer(customerId: number): number {
	if (customerId <= 1_000_000) return 1;
	if (customerId <= 2_000_000) return 2;
	return 3;
}
```

## Hash Sharding

Shard key-কে hash করুন এবং shard বাছতে modulo ব্যবহার করুন:

```typescript
import { createHash } from 'crypto';

const SHARD_COUNT = 4;

function getShardForCustomer(customerId: string): number {
	const hash = createHash('sha256').update(customerId).digest('hex');
	const hashInt = parseInt(hash.slice(0, 8), 16);
	return hashInt % SHARD_COUNT;
}

// customer "cust-123" → always goes to shard 2
// customer "cust-456" → always goes to shard 0
```

**সুবিধা:** সমান distribution, কোনো hotspot নেই।

**অসুবিধা:** range query সব shard জুড়ে scatter হয়। Shard যোগ করলে সব data rehash করতে হয় (এটি কমাতে consistent hashing ব্যবহার করুন)।

## Consistent Hashing

Shard যোগ/অপসারণের সময় data movement কমায়। `hash % N`-এর বদলে, data ও shard দুটোকেই একটি ring-এ রাখুন; data যায় ঘড়ির কাঁটার দিকে নিকটতম shard-এ।

```typescript
class ConsistentHashRing {
	private ring = new Map<number, string>();
	private sortedKeys: number[] = [];
	private readonly virtualNodes = 150; // multiple points per shard for balance

	addShard(shardId: string) {
		for (let i = 0; i < this.virtualNodes; i++) {
			const hash = this.hash(`${shardId}:${i}`);
			this.ring.set(hash, shardId);
		}
		this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
	}

	removeShard(shardId: string) {
		for (let i = 0; i < this.virtualNodes; i++) {
			const hash = this.hash(`${shardId}:${i}`);
			this.ring.delete(hash);
		}
		this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
	}

	getShard(key: string): string {
		const hash = this.hash(key);
		// Find first shard clockwise from this position
		for (const ringKey of this.sortedKeys) {
			if (ringKey >= hash) {
				return this.ring.get(ringKey)!;
			}
		}
		return this.ring.get(this.sortedKeys[0])!; // wrap around
	}

	private hash(key: string): number {
		const h = createHash('md5').update(key).digest('hex');
		return parseInt(h.slice(0, 8), 16);
	}
}

const ring = new ConsistentHashRing();
ring.addShard('shard-1');
ring.addShard('shard-2');
ring.addShard('shard-3');

ring.getShard('customer-123'); // → 'shard-2'
// Adding shard-4: only ~25% of keys move (vs 75% with hash-mod)
```

## Cross-Shard Query

Sharding-এর সবচেয়ে যন্ত্রণাদায়ক অংশ। যে query-তে shard key নেই সেটিকে সব shard-এ hit করতে হয়:

```typescript
// Single-shard: fast
async function getCustomerOrders(customerId: string): Promise<Order[]> {
	const shard = ring.getShard(customerId);
	const db = getConnection(shard);
	return db.query('SELECT * FROM orders WHERE customer_id = $1', [customerId]);
}

// Cross-shard scatter-gather: expensive
async function getRecentOrders(since: Date): Promise<Order[]> {
	// Must query all shards
	const results = await Promise.all(
		ALL_SHARDS.map((shard) =>
			getConnection(shard).query(
				'SELECT * FROM orders WHERE created_at > $1 ORDER BY created_at DESC LIMIT 100',
				[since]
			)
		)
	);

	// Merge and re-sort results from all shards
	return results
		.flatMap((r) => r.rows)
		.sort((a, b) => b.created_at - a.created_at)
		.slice(0, 100);
}
```

Scatter-gather query যদি সাধারণ হয়, তাহলে shard key ভুল। অথবা আপনার একটি secondary index দরকার (একটি আলাদা data store যা non-shard-key attribute গুলোকে shard location-এ map করে)।

## Directory-Based Sharding

একটি lookup table key গুলোকে shard-এ map করে:

```sql
-- Shard directory (in a separate, small database)
CREATE TABLE shard_directory (
  customer_id UUID PRIMARY KEY,
  shard_id    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

```typescript
async function getShardForCustomer(customerId: string): Promise<string> {
	const cached = shardCache.get(customerId);
	if (cached) return cached;

	const result = await directory.query(
		'SELECT shard_id FROM shard_directory WHERE customer_id = $1',
		[customerId]
	);

	const shardId = result.rows[0].shard_id;
	shardCache.set(customerId, shardId);
	return shardId;
}
```

**সুবিধা:** নমনীয় — একটি row আপডেট করে আপনি একজন customer-কে অন্য shard-এ সরাতে পারেন। কোনো rehashing নেই।

**অসুবিধা:** directory একটি bottleneck এবং single point of failure। আক্রমণাত্মকভাবে cache করতে হবে। Directory নিজেই highly available হতে হবে।

## Operational বাস্তবতা

Sharding যা নিয়ে আসে:

- **Distributed transaction** — ভিন্ন shard-এ থাকা দুই customer জড়িত একটি order একটি single DB transaction ব্যবহার করতে পারে না। Saga বা 2PC দরকার।
- **Schema পরিবর্তন** — সব shard-এ apply করতে হবে (deployment সাবধানে coordinate করুন)
- **Rebalancing** — capacity যোগ করার সময় shard-এর মধ্যে data সরানো (ব্যয়বহুল, ধীর)
- **Shard জুড়ে foreign key নেই** — referential integrity application-এ enforce করতে হয়
- **Backup জটিলতা** — সব shard consistently backup করতে হবে

এই খরচগুলো সচেতনভাবে মেনে নিন। বেশিরভাগ team application-level sharding-এর চেয়ে Postgres table partitioning + একটি বড় server দিয়ে ভালো থাকবে।
