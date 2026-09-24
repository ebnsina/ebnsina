---
title: 'Replication & Sharding'
subtitle: 'একটা মেশিনের বাইরে ডেটাবেজ scale করা — leader-follower replication, consensus, আর horizontal partitioning।'
chapter: 8
level: 'advanced'
readingTime: '18 মিনিট'
topics: ['replication', 'sharding', 'partitioning', 'consensus']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

শহরের পাবলিক লাইব্রেরি নেটওয়ার্কে অনেকগুলো শাখা — মিরপুর, ধানমন্ডি, উত্তরা। একটা জনপ্রিয় উপন্যাস সবাই একসাথে পড়তে চায়, তাই লাইব্রেরিয়ান ফাতিমা প্রতিটা শাখায় ওই একই বইয়ের হুবহু কয়েকটা কপি রাখেন। ফলে সিনা মিরপুরে, খোয়ারিজমি ধানমন্ডিতে — একই সময়ে দুজনেই বই ধার নিতে পারে, কাউকে অন্য শাখা পর্যন্ত দৌড়াতে হয় না। আর একটা শাখায় একটা কপি ছিঁড়ে বা হারিয়ে গেলেও সমস্যা নেই, বাকি কপিগুলো থেকেই পাঠক পড়তে পারে।

কিন্তু পুরো সংগ্রহটা এত বিশাল যে কোনো একটা বিল্ডিংয়ে সব বই আঁটে না। তাই ফাতিমা পুরো collection-টাকে বিষয় ধরে ভাগ করে দেন — বিজ্ঞানের সব বই মিরপুর শাখায়, ইতিহাসের সব বই ধানমন্ডিতে, সাহিত্য উত্তরায়। কেউ ইতিহাসের বই খুঁজলে তাকে সরাসরি ধানমন্ডিতে পাঠিয়ে দেওয়া হয়; প্রতিটা শাখা তখন গোটা সংগ্রহের একটা আলাদা টুকরো সামলায়, কোনো শাখাই একা পুরো বোঝা টানে না।

এই দুই কৌশলই এই chapter-এর মূল কথা। একই বইয়ের হুবহু কপি সব শাখায় রাখা হলো **replication** — প্রতিটা replica-তে পুরো ডেটার একই কপি, তাই read একাধিক node-এ ছড়িয়ে যায় (read-scaling) আর একটা node মরে গেলেও আরেকটা কাজ চালিয়ে নেয় (failover)। আর বিষয় ধরে সংগ্রহ ভাগ করাটা হলো **sharding** — একটা shard key (এখানে "বিষয়") ধরে ডেটাকে আলাদা আলাদা disjoint টুকরোয় ভাগ করা, যাতে ডেটা যত বড়ই হোক এক মেশিনে না আঁটার সমস্যা মেটে (size/write-scaling)। বাস্তবে PostgreSQL read replica দিয়ে read scale করে, আর Instagram বা Discord ব্যবহারকারীর id-কে shard key ধরে বিলিয়ন সারির টেবিল অনেক node-এ ভাগ করে চালায়।

## Replicate কেন?

একটা মাত্র ডেটাবেজ server একটা single point of failure। Replication ডেটা একাধিক মেশিনে কপি করে এর জন্য:

- **High availability**: একটা server মরে গেলে, আরেকটা দায়িত্ব নেয়
- **Read scaling**: read traffic replica-গুলোর মধ্যে ছড়িয়ে দেওয়া
- **Geographic distribution**: ডেটা user-দের কাছে রাখা

<Callout type="info">

**বাস্তব জীবনের উপমা**

যেমন শাখাসহ একটা bank — Replication: প্রতিটা শাখায় আপনার account-এর একটা কপি থাকে (একটা শাখা বন্ধ থাকলে, আরেকটা এখনও কাজ করে)। Sharding: account-গুলো region অনুযায়ী ভাগ করা — West Coast account এক শাখায়, East Coast আরেক শাখায়, দ্রুত local access-এর জন্য।

</Callout>

## Leader-Follower Replication

সবচেয়ে সাধারণ model। একটা leader write গ্রহণ করে, follower-রা leader থেকে replicate করে।

```typescript
class ReplicationManager {
	private leader: Database;
	private followers: Database[];

	// Writes always go to the leader
	async write(query: string): Promise<void> {
		const walRecord = await this.leader.execute(query);

		// Stream WAL to followers
		await Promise.allSettled(this.followers.map((f) => f.applyWAL(walRecord)));
	}

	// Reads can go to any replica
	async read(query: string): Promise<Row[]> {
		const target = this.selectReplica();
		return target.execute(query);
	}

	private selectReplica(): Database {
		// Round-robin, least-connections, or random
		return this.followers[Math.floor(Math.random() * this.followers.length)];
	}
}
```

### Sync vs Async Replication

```typescript
// Synchronous: leader waits for follower ACK before confirming commit
// + Strong consistency (follower has the data)
// - Higher write latency (network round-trip)
// - Leader blocks if follower is slow/down

// Asynchronous: leader confirms immediately, follower catches up later
// + Lower write latency
// + Leader isn't affected by follower issues
// - Replication lag: follower may serve stale data
// - Data loss risk: if leader dies before follower catches up

// Semi-synchronous (PostgreSQL synchronous_commit):
// Wait for at least one follower, rest are async
// Compromise between safety and performance
```

<Callout type="info">

**Replication lag** read-after-write inconsistency তৈরি করে: আপনি leader-এ write করেন, তারপর এমন একটা follower থেকে read করেন যে এখনও write-টা পায়নি। সমাধান: নিজের write leader থেকে read করুন, বা causal consistency token ব্যবহার করুন।

</Callout>

## Failover

Leader মরে গেলে, একটা follower-কে promote করতে হয়:

```typescript
async function failover(deadLeader: Database, followers: Database[]): Promise<Database> {
	// 1. Detect failure (heartbeat timeout)
	// 2. Choose the most up-to-date follower
	const candidates = await Promise.all(
		followers.map(async (f) => ({
			follower: f,
			lag: await f.getReplicationLag()
		}))
	);

	const newLeader = candidates.sort((a, b) => a.lag - b.lag)[0].follower;

	// 3. Promote to leader
	await newLeader.promote();

	// 4. Redirect all other followers to new leader
	for (const f of followers) {
		if (f !== newLeader) {
			await f.followNewLeader(newLeader);
		}
	}

	// 5. Update connection routing
	await updateDNS(newLeader.address);

	return newLeader;
}
```

## Sharding (Horizontal Partitioning)

ডেটা যখন একটা মেশিনের চেয়ে বড় হয়ে যায়, তখন একটা **shard key** দিয়ে এটা একাধিক ডেটাবেজে ভাগ করুন:

```typescript
class ShardRouter {
	private shards: Database[];

	constructor(shardCount: number) {
		this.shards = Array.from({ length: shardCount }, (_, i) => connectToShard(i));
	}

	// Hash-based sharding
	getShard(key: string): Database {
		const hash = this.hashKey(key);
		const shardIndex = hash % this.shards.length;
		return this.shards[shardIndex];
	}

	// Range-based sharding
	getShardByRange(userId: number): Database {
		if (userId < 1_000_000) return this.shards[0];
		if (userId < 2_000_000) return this.shards[1];
		return this.shards[2];
	}

	async query(key: string, sql: string): Promise<Row[]> {
		const shard = this.getShard(key);
		return shard.execute(sql);
	}

	// Cross-shard queries are expensive — avoid them
	async queryAll(sql: string): Promise<Row[]> {
		const results = await Promise.all(this.shards.map((s) => s.execute(sql)));
		return results.flat(); // merge results from all shards
	}

	private hashKey(key: string): number {
		// Consistent hashing for better rebalancing
		let hash = 0;
		for (const char of key) {
			hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
		}
		return Math.abs(hash);
	}
}
```

### একটা Shard Key বেছে নেওয়া

```typescript
// Good shard key: evenly distributes data AND queries
// user_id    → good for user-centric apps
// tenant_id  → good for multi-tenant SaaS

// Bad shard key: causes hotspots
// country    → US shard gets 50% of traffic
// created_at → latest shard gets all writes
// auto_increment → same problem

// Compound shard key:
// (tenant_id, created_at) → distributes by tenant,
//   allows range queries on time within a tenant
```

<Callout type="warning">

**Sharding হলো শেষ উপায়।** এটা বিশাল জটিলতা যোগ করে: cross-shard query, distributed transaction, rebalancing, operational overhead। প্রথমে চেষ্টা করুন: read replica, ভালো index, caching, query optimization। শুধু তখনই shard করুন যখন single-node optimization-এর সব উপায় শেষ করে ফেলেছেন।

</Callout>

## মূল কথাগুলো

1. **Replication** availability আর read scaling দেয় — async দ্রুত কিন্তু stale read-এর ঝুঁকি থাকে
2. **Failover** leader মরে গেলে একটা follower-কে leader-এ promote করে — এটা automate করুন
3. **Sharding** একটা shard key দিয়ে ডেটা মেশিনগুলোর মধ্যে ভাগ করে — এমন key বেছে নিন যা সমানভাবে distribute করে
4. **প্রয়োজন না হওয়া পর্যন্ত sharding এড়িয়ে চলুন** — এটা প্রতিটা operation-এ জটিলতা যোগ করে
