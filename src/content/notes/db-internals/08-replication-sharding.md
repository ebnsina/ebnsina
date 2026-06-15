---
title: "Replication & Sharding"
subtitle: "Scaling databases beyond a single machine — leader-follower replication, consensus, and horizontal partitioning."
chapter: 8
level: "advanced"
readingTime: "18 min"
topics: ["replication", "sharding", "partitioning", "consensus"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Replicate?

A single database server is a single point of failure. Replication copies data to multiple machines for:
- **High availability**: if one server dies, another takes over
- **Read scaling**: spread read traffic across replicas
- **Geographic distribution**: put data close to users

<Callout type="info">

**Real-World Analogy**

Like a bank with branches — Replication: every branch has a copy of your account (if one branch is down, another still works). Sharding: accounts are divided by region — West Coast accounts at one branch, East Coast at another, for faster local access.

</Callout>

## Leader-Follower Replication

The most common model. One leader accepts writes, followers replicate from the leader.

```typescript
class ReplicationManager {
  private leader: Database;
  private followers: Database[];

  // Writes always go to the leader
  async write(query: string): Promise<void> {
    const walRecord = await this.leader.execute(query);

    // Stream WAL to followers
    await Promise.allSettled(
      this.followers.map(f => f.applyWAL(walRecord))
    );
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

**Replication lag** causes read-after-write inconsistency: you write to the leader, then read from a follower that hasn't received the write yet. Solutions: read your own writes from the leader, or use causal consistency tokens.

</Callout>

## Failover

When the leader dies, a follower must be promoted:

```typescript
async function failover(deadLeader: Database, followers: Database[]): Promise<Database> {
  // 1. Detect failure (heartbeat timeout)
  // 2. Choose the most up-to-date follower
  const candidates = await Promise.all(
    followers.map(async f => ({
      follower: f,
      lag: await f.getReplicationLag(),
    }))
  );

  const newLeader = candidates
    .sort((a, b) => a.lag - b.lag)[0].follower;

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

When data outgrows a single machine, split it across multiple databases by a **shard key**:

```typescript
class ShardRouter {
  private shards: Database[];

  constructor(shardCount: number) {
    this.shards = Array.from({ length: shardCount }, (_, i) =>
      connectToShard(i)
    );
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
    const results = await Promise.all(
      this.shards.map(s => s.execute(sql))
    );
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

### Choosing a Shard Key

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

**Sharding is a last resort.** It adds massive complexity: cross-shard queries, distributed transactions, rebalancing, operational overhead. First try: read replicas, better indexes, caching, query optimization. Only shard when you've exhausted single-node optimizations.

</Callout>

## Key Takeaways

1. **Replication** provides availability and read scaling — async is faster but risks stale reads
2. **Failover** promotes a follower to leader when the leader dies — automate it
3. **Sharding** splits data across machines by a shard key — choose keys that distribute evenly
4. **Avoid sharding until necessary** — it adds complexity to every operation

