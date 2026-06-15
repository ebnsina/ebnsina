---
title: "Database Cost & Sizing"
subtitle: "IOPS, storage tiers, connection limits, and the read-replica math that changes your cost curve."
chapter: 3
level: "intermediate"
readingTime: "9 min"
topics: ["database sizing", "IOPS", "read replicas", "connection pooling", "storage tiers"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A library's circulation desk: one librarian (primary) handles all returns (writes). Readers (read queries) can go to any of the reference assistants (read replicas) who have copies of the catalog. More queries, more assistants — but only one desk handles new books coming in.

</Callout>

## Why Databases Are Expensive

Databases are expensive for three reasons that compound each other:

1. **Storage cost** grows monotonically — you almost never delete data faster than you add it
2. **IOPS** cost is high on cloud — managed NVMe performance is priced at a premium
3. **Memory** determines your cache hit rate — undersized RAM means expensive disk reads on every cache miss

Getting database sizing wrong is the most common way cloud bills grow out of control.

## Storage Tiers

Not all data needs fast storage. Tier your data:

```
Hot (NVMe SSD):
  Active tables, indexes, WAL
  Recent partitions (last 30-90 days)
  Cost: $0.10-0.25/GB-month (AWS io2/gp3)

Warm (HDD or slow SSD):
  Historical partitions, audit logs
  Accessed occasionally (weekly queries)
  Cost: $0.025/GB-month (AWS st1)

Cold (Object storage):
  Backups, archives, exports
  Rarely accessed
  Cost: $0.023/GB-month (S3 Standard), $0.004 (Glacier)
```

**PostgreSQL table partitioning by date:**
```sql
-- Partition orders by month — move old partitions to slower storage
CREATE TABLE orders (
  id BIGINT,
  user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);

-- Active partition: fast NVMe
CREATE TABLE orders_2024_01
  PARTITION OF orders
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01')
  TABLESPACE fast_nvme;

-- Historical partition: slower HDD tablespace
CREATE TABLE orders_2023_01
  PARTITION OF orders
  FOR VALUES FROM ('2023-01-01') TO ('2023-02-01')
  TABLESPACE slow_hdd;
```

## IOPS Planning

AWS gp3 volumes give 3000 IOPS and 125 MB/s baseline for free. Beyond that, you pay:

```
gp3 baseline: 3000 IOPS, 125 MB/s — included in storage price
gp3 extra:    +$0.005 per provisioned IOPS (up to 16,000)
              +$0.04 per MB/s (up to 1000 MB/s)

io2:          $0.065/GB/month + $0.065/IOPS-month
              Very expensive but predictable
```

**Measure your actual IOPS before provisioning:**
```bash
# On RDS: check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReadIOPS \
  --dimensions Name=DBInstanceIdentifier,Value=mydb \
  --period 3600 \
  --statistics Average Maximum

# On self-hosted: watch with iostat
iostat -x 1 5
# Look at: r/s (reads/sec), w/s (writes/sec), await (ms per operation)
```

If your database IOPS usage stays under 3000, gp3 baseline is free — don't provision extra.

## Memory as Cache

PostgreSQL's `shared_buffers` and OS page cache determine how much of your data fits in RAM. More RAM = higher cache hit rate = fewer disk reads = cheaper IOPS.

```
Rule of thumb: shared_buffers = 25% of total RAM
               effective_cache_size = 75% of total RAM

For a 32GB instance:
  shared_buffers = 8GB
  effective_cache_size = 24GB (helps query planner make better decisions)
```

**Cache hit ratio:**
```sql
-- Check your Postgres buffer hit rate
SELECT
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) AS cache_hit_ratio
FROM pg_statio_user_tables;

-- Target: > 0.99 (99% of reads served from cache)
-- If below 0.90: add RAM or reduce working set size
```

If your cache hit rate is 90%, 10% of reads go to disk. At 10,000 read queries/second, that's 1000 disk IOPS. Doubling RAM might take that to 99%, cutting disk reads to 100 IOPS — a 10x reduction in IOPS cost.

## Connection Limits and Pooling

Postgres creates one OS process per connection. Too many connections = too much RAM + CPU overhead:

```
Postgres max_connections: 100 (default), 200 (common), 500 (high)
Memory per connection: ~5-10MB

At 500 connections: 2.5-5GB RAM just for connection overhead
```

**PgBouncer** sits between your app and Postgres, multiplexing many app connections onto fewer Postgres connections:

```ini
# pgbouncer.ini
[databases]
mydb = host=postgres port=5432 dbname=mydb

[pgbouncer]
pool_mode = transaction  # connection released after each transaction
max_client_conn = 1000   # your app can open 1000 connections to PgBouncer
default_pool_size = 20   # PgBouncer uses 20 Postgres connections total

# Result: 1000 app connections → 20 Postgres connections
```

This is essential on cloud where managed Postgres instance sizes have hard connection limits. A `db.t3.medium` RDS instance has a max of ~66 connections. Without a pooler, a modest Node.js app exhausts this instantly.

## Read Replicas

Add read replicas to distribute query load and increase read capacity:

```
Write throughput:
  Primary handles all writes → vertical scaling only

Read throughput:
  Reads distributed across N replicas → linear scaling
  3 replicas = 3x read capacity

Cost:
  Each replica costs the same as the primary
  Trade-off: linear cost vs linear read capacity
```

**Route reads to replicas in your application:**
```typescript
import { Pool } from 'pg';

const primaryPool = new Pool({ host: 'primary.db.internal' });
const replicaPool = new Pool({
  host: 'replica.db.internal', // or a load balancer across replicas
});

// Write operations → primary
async function createOrder(data: OrderData): Promise<Order> {
  const { rows } = await primaryPool.query(
    'INSERT INTO orders (...) VALUES (...) RETURNING *',
    [...values],
  );
  return rows[0];
}

// Read operations → replica
async function getOrderHistory(userId: string): Promise<Order[]> {
  const { rows } = await replicaPool.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return rows;
}
```

**Replication lag:** Replicas are slightly behind the primary (usually milliseconds, occasionally seconds under heavy write load). Don't use replicas for reads that immediately follow a write:

```typescript
async function createAndFetchOrder(data: OrderData): Promise<Order> {
  const order = await createOrder(data); // writes to primary

  // Read from PRIMARY — replica might not have this yet
  return fetchOrder(order.id, { useReplica: false });
}
```

## Managed vs Self-Hosted Cost

For a production Postgres setup (primary + 1 replica, 4 vCPU / 16GB):

```
AWS RDS (db.m5.xlarge, Multi-AZ):
  Instance: $380/month × 2 = $760/month
  Storage (500GB gp3): $57/month
  Backup storage: $25/month
  Total: ~$840/month

Self-hosted on Hetzner (2× AX52 dedicated servers):
  Servers: $80/month × 2 = $160/month
  Managed Postgres (Patroni): your ops time
  Backups to Hetzner S3: $5/month
  Total: ~$170/month + ops cost

Break-even: if your ops time costs more than ~$670/month, RDS wins
```

Managed databases are worth it until you have dedicated infrastructure engineers. After that, the cost savings at scale justify self-hosting.

## Cost Reduction Checklist

```
□ Partition large tables by date — archive old partitions to slow/cold storage
□ Enable pg_partman for automated partition management
□ Use PgBouncer (transaction mode) — don't provision RAM for idle connections
□ Cache hit ratio > 99% — if not, add RAM before adding IOPS
□ Check for unused indexes (bloat storage, slow writes)
□ Vacuum analyze scheduled — prevent table bloat
□ Read replicas for read-heavy workloads
□ Reserved instances for primary DB (1-3yr commit)
□ S3 for backups (not EBS snapshots — 10x cheaper)
□ Delete or archive data you don't need — storage cost is forever
```

**Finding unused indexes:**
```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,           -- times this index was used
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan < 100  -- rarely used
ORDER BY pg_relation_size(indexrelid) DESC;
```

Every unused index wastes storage and slows writes. Drop them.

