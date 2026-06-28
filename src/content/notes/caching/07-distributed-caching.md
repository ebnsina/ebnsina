---
title: 'Distributed Caching'
subtitle: 'Sharing cache state across multiple servers — consistent hashing, Redis Cluster, and the failure modes that will surprise you.'
chapter: 7
level: 'intermediate'
readingTime: '15 min'
topics: ['Redis Cluster', 'consistent hashing', 'sharding', 'replication', 'distributed systems']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Distributed Caching Exists

A single Redis node runs out of memory. Or it becomes a bottleneck for write throughput. Or you need it to survive a single node failure. Distributed caching solves these by spreading data across multiple nodes.

The problem: when you have N nodes, how do you know which node holds key `user:123`? And what happens when you add or remove a node?

<Callout type="info">

**Real-World Analogy**

A library with one filing cabinet runs out of space. You buy three more cabinets and split the alphabet: A–G in cabinet 1, H–N in cabinet 2, O–Z in cabinet 3. Simple — until you add a 5th cabinet and have to move half the files. Consistent hashing is the system that minimizes how many files you move when the cabinet count changes.

</Callout>

## Naive Sharding: Modulo Hashing

The simple approach: `nodeIndex = hash(key) % numNodes`.

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

**The problem:** Add a node (4 → 5 nodes), and `hash % 5` maps differently from `hash % 4`. Almost every key goes to a new node. Effective cache hit ratio drops to near zero during the transition. Your database gets hammered.

## Consistent Hashing

Map both keys and nodes onto a circular ring (0 to 2³²). Each key is stored on the first node clockwise from its position on the ring.

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

**Virtual nodes** distribute each physical node across 150 positions on the ring, preventing hot spots when node counts are small.

When you add a 4th node, only the keys in its ring segment need to move — roughly 1/4 of all keys. The other 3/4 are unaffected. Your cache hit ratio drops by ~25%, not ~100%.

## Redis Cluster

Redis Cluster is the production-grade distributed Redis, built-in. It uses **hash slots** (not consistent hashing) — 16,384 slots divided among master nodes.

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

**Slot calculation:** `HASH_SLOT = CRC16(key) % 16384`

```bash
redis-cli -c CLUSTER KEYSLOT user:123  # → 8100
redis-cli -c CLUSTER INFO              # cluster state, slots, nodes
redis-cli -c CLUSTER NODES            # topology
```

**Hash tags** force keys to the same slot (needed for multi-key operations):

```bash
# Both keys hash on 'user' → same slot → can use MGET/MSET
SET {user}.123:profile "..."
SET {user}.123:settings "..."
MGET {user}.123:profile {user}.123:settings  # works in cluster
```

<Callout type="warning">

**Multi-key commands require all keys on the same node.** In Redis Cluster, `MGET key1 key2` fails if keys land on different nodes. Use hash tags to co-locate related keys, or restructure to avoid multi-key commands.

</Callout>

## Replication

A Redis Cluster master can have one or more replicas. Replicas serve reads and take over if the master fails.

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

**Replication lag:** Replica data is slightly behind master. For cache reads, this is usually fine. For strong consistency (user just updated their profile and expects to read it back), route reads to the master.

## Failure Modes

**Network partition:** Some clients can't reach some nodes. The cluster may reject writes to maintain consistency (`CLUSTERDOWN` error). Design for this — add retry logic with backoff.

**Node failure:** Redis Cluster automatically promotes a replica to master (within seconds). During the election, writes to that node's slots fail. Build retry logic:

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

**Hot keys:** One key (a trending post, viral product) gets millions of reads per second. All reads go to the same node — it becomes a bottleneck regardless of cluster size.

Solutions for hot keys:

1. **Local in-process cache** — cache the hot key in every app instance's memory for 1–5 seconds
2. **Key fanning** — store copies at `hot-key:0`, `hot-key:1`, ..., `hot-key:N` and read randomly

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

## Deployment Patterns

**Single-node Redis** — development, low traffic. One point of failure.

**Redis Sentinel** — single master + replicas + Sentinel processes that monitor and auto-failover. No data sharding — all data on one master. For HA without horizontal scale.

```bash
# sentinel.conf
sentinel monitor mymaster 127.0.0.1 6379 2  # 2 sentinels must agree before failover
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 10000
```

**Redis Cluster** — automatic sharding across N masters, each with replicas. Horizontal scale + HA. Use this when your dataset exceeds a single node's memory.

**Managed Redis** — AWS ElastiCache, Google Cloud Memorystore, Upstash. Cluster management is handled for you. Almost always the right choice unless you have very specific requirements.
