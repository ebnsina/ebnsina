---
title: 'Distributed Caching'
subtitle: 'একাধিক সার্ভারের মধ্যে cache state ভাগ করে নেওয়া — consistent hashing, Redis Cluster, এবং যেসব failure mode আপনাকে চমকে দেবে।'
chapter: 7
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['Redis Cluster', 'consistent hashing', 'sharding', 'replication', 'distributed systems']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

চট্টগ্রামের রিয়াজউদ্দিন বাজার — বিশাল পাইকারি বাজার, হাজার হাজার বস্তা মালামাল। আগে সিনার একটামাত্র গুদাম ছিল, কিন্তু একটা গুদামে আর জায়গা হয় না, তার উপর সেটা ভরে গেলে মাল বের করতে-ঢোকাতে জ্যাম লেগে যায়। তাই সিনা কয়েকটা গুদাম বানাল আর একটা সহজ নিয়ম চালু করল: মালের নামের প্রথম অক্ষর অনুযায়ী কোন গুদামে কী থাকবে সেটা ঠিক করা। খোয়ারিজমি যখন "চিনি" খোঁজে, তাকে সবগুলো গুদামে দৌড়াতে হয় না — নিয়মটা দেখেই সে জানে চিনি কোন গুদামে, সোজা সেখানেই চলে যায়। এই নিয়মটাই সবার জানা, তাই যেকোনো লোক যেকোনো মাল এক চেষ্টাতেই সঠিক গুদামে গিয়ে পায়।

সমস্যা হলো নতুন গুদাম যোগ করা বা কোনোটা বন্ধ হয়ে গেলে। সিনা যদি এমন নিয়ম করে যে "মোট গুদাম সংখ্যা দিয়ে ভাগ করে বাকি" মিলিয়ে গুদাম ঠিক হবে, তাহলে একটা নতুন গুদাম বসালেই প্রায় সব মালের হিসাব বদলে যায় — গোটা বাজারকে মাল সরাতে হয়, বিশাল হুলুস্থুল। তাই সিনা চালাক নিয়ম ব্যবহার করে — এমন একটা চিরকুট-ব্যবস্থা যেখানে গুদাম আর মাল দুটোকেই একই বৃত্তে সাজানো থাকে, আর প্রতিটা মাল তার পাশের গুদামে যায়। এতে নতুন একটা গুদাম বসালে কেবল তার আশপাশের অল্প কিছু মাল সরাতে হয়, ফাতিমার মশলা বা খোয়ারিজমির চিনি — বাকি বেশিরভাগ মাল যেখানে ছিল সেখানেই থাকে।

এই গল্পটাই আসলে **distributed cache**। প্রতিটা গুদাম হলো একটা cache node, নামের প্রথম অক্ষরের চালাক নিয়মটাই **consistent hashing** — যা দিয়ে যেকোনো key কোন node-এ আছে তা এক ধাপেই বের করা যায় এবং একটা node যোগ বা বাদ দিলে সামান্য কিছু key-ই কেবল reshuffle হয়। বাস্তবে **Redis Cluster** ঠিক এভাবেই 16,384-টা slot অনেক node-এ ভাগ করে চালায়, যাতে একটা মেশিনের memory ছাড়িয়ে গেলেও ডেটা ছড়িয়ে রাখা যায় আর node fail করলেও পুরো সিস্টেম টিকে থাকে।

## Distributed Caching কেন দরকার

একটা একক Redis node-এর memory একসময় ফুরিয়ে যায়। কিংবা সেটা write throughput-এর জন্য bottleneck হয়ে দাঁড়ায়। অথবা আপনার দরকার হয় যেন একটা node fail করলেও সিস্টেম টিকে থাকে। Distributed caching এই সমস্যাগুলো সমাধান করে একাধিক node-এর মধ্যে ডেটা ছড়িয়ে দিয়ে।

সমস্যাটা হলো: আপনার কাছে যখন N-টা node আছে, তখন আপনি কীভাবে জানবেন যে `user:123` key-টা কোন node-এ আছে? আর যখন আপনি একটা node যোগ বা বাদ দেন, তখন কী হয়?

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা লাইব্রেরিতে একটামাত্র ফাইলিং ক্যাবিনেট আছে, সেটার জায়গা ফুরিয়ে যায়। আপনি আরও তিনটা ক্যাবিনেট কিনে বর্ণমালা ভাগ করে দিলেন: A–G ক্যাবিনেট 1-এ, H–N ক্যাবিনেট 2-এ, O–Z ক্যাবিনেট 3-এ। সহজ — যতক্ষণ না আপনি 5ম একটা ক্যাবিনেট যোগ করেন আর অর্ধেক ফাইল সরাতে বাধ্য হন। Consistent hashing হলো সেই সিস্টেম যা ক্যাবিনেটের সংখ্যা বদলালে কতগুলো ফাইল সরাতে হবে তা সর্বনিম্ন করে রাখে।

</Callout>

## সরল Sharding: Modulo Hashing

সহজ পদ্ধতিটা হলো: `nodeIndex = hash(key) % numNodes`।

```typescript
class ModuloShardedCache {
	constructor(private nodes: RedisClient[]) {}

	private nodeFor(key: string): RedisClient {
		const hash = murmurhash(key); // deterministic hash
		return this.nodes[hash % this.nodes.length];
	}

	async get(key: string): Promise<string | null> {
		return this.nodeFor(key).get(key);
	}

	async set(key: string, value: string, ttl: number): Promise<void> {
		await this.nodeFor(key).setEx(key, ttl, value);
	}
}
```

**সমস্যাটা:** একটা node যোগ করুন (4 → 5 nodes), আর `hash % 5` তখন `hash % 4`-এর চেয়ে ভিন্নভাবে map হয়। প্রায় প্রতিটা key-ই একটা নতুন node-এ চলে যায়। এই transition-এর সময় কার্যকর cache hit ratio প্রায় শূন্যে নেমে আসে। আপনার database প্রচণ্ড চাপে পড়ে।

## Consistent Hashing

key এবং node দুটোকেই একটা বৃত্তাকার ring-এর উপর map করুন (0 থেকে 2³²)। প্রতিটা key তার ring-এর অবস্থান থেকে ঘড়ির কাঁটার দিকে প্রথম যে node পাওয়া যায়, সেখানে সংরক্ষণ করা হয়।

```typescript
import { createHash } from 'crypto';

class ConsistentHashRing {
	private ring = new Map<number, string>(); // position → node id
	private sortedPositions: number[] = [];
	private virtualNodes: number;

	constructor(virtualNodes = 150) {
		this.virtualNodes = virtualNodes;
	}

	addNode(nodeId: string): void {
		for (let i = 0; i < this.virtualNodes; i++) {
			const hash = this.hash(`${nodeId}:${i}`);
			this.ring.set(hash, nodeId);
		}
		this.sortedPositions = [...this.ring.keys()].sort((a, b) => a - b);
	}

	removeNode(nodeId: string): void {
		for (let i = 0; i < this.virtualNodes; i++) {
			const hash = this.hash(`${nodeId}:${i}`);
			this.ring.delete(hash);
		}
		this.sortedPositions = [...this.ring.keys()].sort((a, b) => a - b);
	}

	getNode(key: string): string {
		const hash = this.hash(key);

		// Find first position >= hash (clockwise on ring)
		for (const pos of this.sortedPositions) {
			if (hash <= pos) return this.ring.get(pos)!;
		}

		// Wrap around — return first node on ring
		return this.ring.get(this.sortedPositions[0])!;
	}

	private hash(input: string): number {
		const buf = createHash('md5').update(input).digest();
		return buf.readUInt32BE(0);
	}
}

const ring = new ConsistentHashRing(150);
ring.addNode('redis-1');
ring.addNode('redis-2');
ring.addNode('redis-3');

console.log(ring.getNode('user:123')); // deterministic: 'redis-2'
console.log(ring.getNode('user:456')); // deterministic: 'redis-1'
```

**Virtual nodes** প্রতিটা physical node-কে ring-এর উপর 150-টা অবস্থানে ছড়িয়ে দেয়, যা node-এর সংখ্যা কম থাকলে hot spot হওয়া ঠেকায়।

যখন আপনি 4র্থ একটা node যোগ করেন, তখন কেবল তার ring segment-এর key-গুলোকেই সরাতে হয় — মোটামুটি সব key-এর 1/4 অংশ। বাকি 3/4 অংশ অপরিবর্তিত থাকে। আপনার cache hit ratio ~100% নয়, বরং ~25% কমে।

## Redis Cluster

Redis Cluster হলো production-grade distributed Redis, একদম বিল্ট-ইন। এটা consistent hashing নয়, বরং **hash slot** ব্যবহার করে — 16,384-টা slot master node-গুলোর মধ্যে ভাগ করা।

```bash
# Create a cluster: 3 masters, 3 replicas
redis-cli --cluster create \
  127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002 \
  127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 \
  --cluster-replicas 1
```

```typescript
import { createCluster } from 'redis';

const cluster = createCluster({
	rootNodes: [
		{ url: 'redis://node1:6379' },
		{ url: 'redis://node2:6379' },
		{ url: 'redis://node3:6379' }
	],
	defaults: {
		socket: { connectTimeout: 500 }
	}
});

await cluster.connect();

// Transparent sharding — client routes to correct node
await cluster.set('user:123', 'alice');
const val = await cluster.get('user:123');
```

**Slot গণনা:** `HASH_SLOT = CRC16(key) % 16384`

```bash
redis-cli -c CLUSTER KEYSLOT user:123  # → 8100
redis-cli -c CLUSTER INFO              # cluster state, slots, nodes
redis-cli -c CLUSTER NODES            # topology
```

**Hash tag** key-গুলোকে একই slot-এ যেতে বাধ্য করে (multi-key অপারেশনের জন্য দরকার):

```bash
# Both keys hash on 'user' → same slot → can use MGET/MSET
SET {user}.123:profile "..."
SET {user}.123:settings "..."
MGET {user}.123:profile {user}.123:settings  # works in cluster
```

<Callout type="warning">

**Multi-key কমান্ডের জন্য সব key একই node-এ থাকা লাগে।** Redis Cluster-এ, key-গুলো ভিন্ন node-এ পড়লে `MGET key1 key2` fail করে। সম্পর্কিত key-গুলো একসাথে রাখতে hash tag ব্যবহার করুন, অথবা multi-key কমান্ড এড়াতে গঠন বদলে ফেলুন।

</Callout>

## Replication

একটা Redis Cluster master-এর এক বা একাধিক replica থাকতে পারে। Replica-গুলো read সার্ভ করে এবং master fail করলে দায়িত্ব নিয়ে নেয়।

```bash
# Replica syncs from master
redis-cli -h replica-host REPLICAOF master-host 6379

# Check replication lag
redis-cli INFO replication | grep lag
```

```typescript
// Read from replica when possible (offloads master)
const clusterWithReplicas = createCluster({
  rootNodes: [...],
  useReplicas: true, // route reads to replicas
});
```

**Replication lag:** Replica-র ডেটা master-এর চেয়ে সামান্য পিছিয়ে থাকে। Cache read-এর ক্ষেত্রে এটা সাধারণত ঠিক আছে। কিন্তু strong consistency দরকার হলে (একজন user মাত্রই তার profile আপডেট করেছে এবং সেটা read করে দেখতে চায়), read-গুলো master-এ পাঠান।

## Failure Mode

**Network partition:** কিছু client কিছু node-এ পৌঁছাতে পারে না। Consistency বজায় রাখতে cluster হয়তো write প্রত্যাখ্যান করবে (`CLUSTERDOWN` error)। এর জন্য ডিজাইন করুন — backoff সহ retry logic যোগ করুন।

**Node failure:** Redis Cluster স্বয়ংক্রিয়ভাবে একটা replica-কে master-এ উন্নীত করে (কয়েক সেকেন্ডের মধ্যে)। এই election চলাকালীন সেই node-এর slot-গুলোতে write fail করে। Retry logic তৈরি করুন:

```typescript
async function resilientSet(key: string, value: string, ttl: number): Promise<void> {
	const maxRetries = 3;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			await cluster.setEx(key, ttl, value);
			return;
		} catch (err) {
			if (attempt === maxRetries - 1) throw err;
			await new Promise((r) => setTimeout(r, 100 * 2 ** attempt)); // exponential backoff
		}
	}
}
```

**Hot key:** একটা key (কোনো ট্রেন্ডিং পোস্ট, ভাইরাল প্রোডাক্ট) সেকেন্ডে লক্ষ লক্ষ read পায়। সব read একই node-এ যায় — cluster-এর আকার যাই হোক, সেটা bottleneck হয়ে দাঁড়ায়।

Hot key-এর সমাধান:

1. **Local in-process cache** — প্রতিটা app instance-এর memory-তে hot key-টা 1–5 সেকেন্ডের জন্য cache করুন
2. **Key fanning** — `hot-key:0`, `hot-key:1`, ..., `hot-key:N`-এ কপি রাখুন এবং র‍্যান্ডমভাবে read করুন

```typescript
// Hot key mitigation: local in-process cache
const localCache = new Map<string, { value: string; expiresAt: number }>();

async function getWithLocalCache(key: string): Promise<string | null> {
	const local = localCache.get(key);
	if (local && Date.now() < local.expiresAt) return local.value;

	const value = await redis.get(key);
	if (value) {
		localCache.set(key, { value, expiresAt: Date.now() + 2000 }); // 2s local cache
	}
	return value;
}
```

## Deployment Pattern

**Single-node Redis** — development, কম ট্র্যাফিক। একটাই failure-এর বিন্দু।

**Redis Sentinel** — single master + replica + Sentinel process যা monitor করে এবং auto-failover করে। কোনো data sharding নেই — সব ডেটা এক master-এ। Horizontal scale ছাড়াই HA-র জন্য।

```bash
# sentinel.conf
sentinel monitor mymaster 127.0.0.1 6379 2  # 2 sentinels must agree before failover
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 10000
```

**Redis Cluster** — N-টা master-এর মধ্যে স্বয়ংক্রিয় sharding, প্রতিটার replica সহ। Horizontal scale + HA। আপনার dataset যখন একটা একক node-এর memory ছাড়িয়ে যায়, তখন এটা ব্যবহার করুন।

**Managed Redis** — AWS ElastiCache, Google Cloud Memorystore, Upstash। Cluster ম্যানেজমেন্ট আপনার হয়ে সামলানো হয়। খুব নির্দিষ্ট কোনো প্রয়োজন না থাকলে প্রায় সবসময়ই এটাই সঠিক পছন্দ।
