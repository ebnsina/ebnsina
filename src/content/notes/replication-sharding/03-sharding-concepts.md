---
title: "Sharding Concepts"
subtitle: "When replication isn't enough, partition keys, shard routing strategies, and the operational complexity you accept when you shard."
chapter: 3
level: "intermediate"
readingTime: "10 min"
topics: ["sharding", "partition key", "consistent hashing", "horizontal partitioning", "shard routing"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A library outgrows one building: you split the collection across multiple buildings by subject. Fiction goes to building A, non-fiction to B, reference to C. Each librarian knows their building's collection intimately. When a patron arrives, a directory (the router) tells them which building to visit. You can't do a single search across all buildings without visiting each — that's the trade-off of sharding.

</Callout>

## When to Shard

Sharding is a last resort. It adds significant operational complexity. Before sharding:

1. **Optimize queries** — indexes, query rewriting, batching
2. **Vertical scale** — bigger server (PostgreSQL scales well on beefy hardware)
3. **Read replicas** — distribute read load
4. **Caching** — remove repetitive reads from the database
5. **Partitioning** — Postgres table partitioning (single-server, transparent to application)
6. **Application-level archival** — move old data out of hot tables

Shard when: writes exceed what one server can handle, OR data volume exceeds what one server's disk can hold, AND you've exhausted the above options.

In practice: most applications never need to shard. Instagram ran on PostgreSQL for years. GitHub runs MySQL at massive scale. The database is rarely the first bottleneck.

## Sharding vs Partitioning

**Table partitioning (Postgres native):** one database, multiple physical tables, transparent to queries. Postgres routes internally based on partition key. No application changes.

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

**Sharding:** data across multiple database servers. Application must know which server to talk to.

```
Shard 1 (server A): customers 0–333k
Shard 2 (server B): customers 333k–666k
Shard 3 (server C): customers 666k–1M
```

## Shard Key Selection

The most consequential decision. Get it wrong and you have hotspots, cross-shard queries everywhere, and a rebalancing nightmare.

**Good shard key properties:**
- High cardinality (many distinct values)
- Evenly distributed (no hotspots)
- Stable (doesn't change after creation)
- Appears in most queries (avoids scatter-gather)

**Common choices:**
- `customer_id` — all data for a customer is on one shard; most queries include customer_id
- `tenant_id` — for multi-tenant SaaS; all tenant data on one shard
- `user_id` — same pattern

**Bad shard keys:**
- `created_at` — all new writes go to the latest shard (hotspot)
- `status` — low cardinality (few distinct values → uneven distribution)
- `country_code` — uneven distribution (US has 100x more data than Luxembourg)

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

Assign a range of key values to each shard:

```
Shard 1: customer_id 1–1,000,000
Shard 2: customer_id 1,000,001–2,000,000
Shard 3: customer_id 2,000,001–3,000,000
```

**Pros:** simple routing, range queries on the shard key hit one shard.

**Cons:** new customers always go to the last shard (hotspot for writes). Rebalancing requires moving data ranges between servers.

```typescript
function getShardForCustomer(customerId: number): number {
  if (customerId <= 1_000_000) return 1;
  if (customerId <= 2_000_000) return 2;
  return 3;
}
```

## Hash Sharding

Hash the shard key and use modulo to pick a shard:

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

**Pros:** even distribution, no hotspots.

**Cons:** range queries scatter across all shards. Adding shards requires rehashing all data (use consistent hashing to mitigate).

## Consistent Hashing

Reduces data movement when adding/removing shards. Instead of `hash % N`, place both data and shards on a ring; data goes to the nearest clockwise shard.

```typescript
class ConsistentHashRing {
  private ring = new Map<number, string>();
  private sortedKeys: number[] = [];
  private readonly virtualNodes = 150;  // multiple points per shard for balance

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
    return this.ring.get(this.sortedKeys[0])!;  // wrap around
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

ring.getShard('customer-123')  // → 'shard-2'
// Adding shard-4: only ~25% of keys move (vs 75% with hash-mod)
```

## Cross-Shard Queries

The most painful part of sharding. A query that doesn't include the shard key must hit all shards:

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
    ALL_SHARDS.map(shard =>
      getConnection(shard).query(
        'SELECT * FROM orders WHERE created_at > $1 ORDER BY created_at DESC LIMIT 100',
        [since]
      )
    )
  );

  // Merge and re-sort results from all shards
  return results
    .flatMap(r => r.rows)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 100);
}
```

If scatter-gather queries are common, the shard key is wrong. Or you need a secondary index (a separate data store that maps non-shard-key attributes to shard locations).

## Directory-Based Sharding

A lookup table maps keys to shards:

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

**Pros:** flexible — you can move a customer to a different shard by updating one row. No rehashing.

**Cons:** the directory is a bottleneck and single point of failure. Must cache aggressively. The directory itself must be highly available.

## Operational Reality

Sharding introduces:

- **Distributed transactions** — an order involving two customers on different shards can't use a single DB transaction. Need sagas or 2PC.
- **Schema changes** — must be applied to all shards (coordinate deployments carefully)
- **Rebalancing** — moving data between shards when adding capacity (expensive, slow)
- **No foreign keys across shards** — referential integrity is application-enforced
- **Backup complexity** — must backup all shards consistently

Accept these costs consciously. Most teams would be better served by Postgres table partitioning + a bigger server than by application-level sharding.

