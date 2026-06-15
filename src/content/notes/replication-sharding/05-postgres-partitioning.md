---
title: "Postgres Table Partitioning"
subtitle: "Range, list, and hash partitioning — the single-server answer to large tables that buys you most of what sharding promises without the operational cost."
chapter: 5
level: "intermediate"
readingTime: "9 min"
topics: ["PostgreSQL", "partitioning", "range partition", "hash partition", "partition pruning", "pg_partman"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A filing cabinet with labeled drawers: all files are in the same cabinet (one database server), but divided into drawers by year. When you need a file from 2023, you only open that drawer — not all of them. Partition pruning is Postgres automatically knowing which drawer to open based on your query.

</Callout>

## Why Partition Before Sharding

Postgres table partitioning gives you:
- **Partition pruning** — queries only scan relevant partitions, not the whole table
- **Faster bulk deletes** — `DROP TABLE partition_name` is instant vs deleting millions of rows
- **Index size** — indexes on each partition are smaller and fit in memory better
- **Vacuum efficiency** — autovacuum works on one partition at a time, less contention

All on one server, with no application changes. The same `INSERT INTO orders` and `SELECT FROM orders` SQL works — Postgres routes internally.

## Range Partitioning (by date)

```sql
-- Create partitioned table
CREATE TABLE orders (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  total_cents INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create partitions (one per month)
CREATE TABLE orders_2024_01 PARTITION OF orders
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE orders_2024_02 PARTITION OF orders
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE orders_2024_03 PARTITION OF orders
  FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

-- Each partition gets its own indexes
CREATE INDEX orders_2024_01_customer_idx ON orders_2024_01 (customer_id);
CREATE INDEX orders_2024_02_customer_idx ON orders_2024_02 (customer_id);
```

```sql
-- Query: Postgres prunes to only 2024_01
EXPLAIN SELECT * FROM orders WHERE created_at >= '2024-01-01' AND created_at < '2024-02-01';
-- Seq Scan on orders_2024_01 (not the other partitions)

-- Insert: Postgres routes to correct partition automatically
INSERT INTO orders (customer_id, total_cents) VALUES ('...', 1999);
-- Goes into orders_2024_01 because created_at = NOW() = January 2024
```

## Default Partition

Catch-all for values that don't fit any defined range:

```sql
CREATE TABLE orders_default PARTITION OF orders DEFAULT;
```

Without a default partition, inserting a row with a `created_at` outside any defined range raises an error. With it, the row lands in `orders_default` — useful during schema evolution.

## Automating Partition Creation (pg_partman)

Creating monthly partitions manually doesn't scale. `pg_partman` automates it:

```sql
-- Install pg_partman
CREATE SCHEMA partman;
CREATE EXTENSION pg_partman SCHEMA partman;

-- Configure automatic partition management
SELECT partman.create_parent(
  p_parent_table  => 'public.orders',
  p_control       => 'created_at',
  p_type          => 'range',
  p_interval      => 'monthly',
  p_premake       => 3          -- create 3 future partitions in advance
);

-- Update config (run in a cron job)
SELECT partman.run_maintenance();
```

```bash
# cron job: run maintenance hourly (creates future partitions, drops old ones per retention)
0 * * * * psql -c "SELECT partman.run_maintenance();"
```

pg_partman handles:
- Creating the next N months of partitions before they're needed
- Dropping old partitions based on retention policy
- Managing the `partman.part_config` table

## Hash Partitioning

Distribute rows evenly across a fixed number of partitions:

```sql
CREATE TABLE user_events (
  id          UUID DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY HASH (user_id);

-- 8 partitions — all data for a user is in the same partition
CREATE TABLE user_events_0 PARTITION OF user_events FOR VALUES WITH (MODULUS 8, REMAINDER 0);
CREATE TABLE user_events_1 PARTITION OF user_events FOR VALUES WITH (MODULUS 8, REMAINDER 1);
CREATE TABLE user_events_2 PARTITION OF user_events FOR VALUES WITH (MODULUS 8, REMAINDER 2);
-- ... up to user_events_7
```

Queries with `WHERE user_id = $1` prune to one partition. Queries without `user_id` scan all 8.

Hash partitioning can't be added to an existing table — must be designed upfront.

## List Partitioning

Partition by discrete values (region, status, tenant):

```sql
CREATE TABLE orders (
  id      UUID DEFAULT gen_random_uuid(),
  region  TEXT NOT NULL,
  -- ...
) PARTITION BY LIST (region);

CREATE TABLE orders_us PARTITION OF orders FOR VALUES IN ('us-east', 'us-west', 'us-central');
CREATE TABLE orders_eu PARTITION OF orders FOR VALUES IN ('eu-west', 'eu-central', 'eu-north');
CREATE TABLE orders_apac PARTITION OF orders FOR VALUES IN ('ap-south', 'ap-east');
CREATE TABLE orders_default PARTITION OF orders DEFAULT;
```

Useful for: multi-tenant data (partition by `tenant_id` for large tenants), regional data (co-locate EU data for GDPR), data with natural groupings.

## Partition Pruning

Check that Postgres actually prunes:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders
WHERE created_at >= '2024-03-01' AND created_at < '2024-04-01';

-- Good output:
-- Seq Scan on orders_2024_03  (not orders_2024_01, not orders_2024_02)
-- Partitions selected: 1

-- Bad output (pruning not working):
-- Append
--   Seq Scan on orders_2024_01
--   Seq Scan on orders_2024_02
--   Seq Scan on orders_2024_03
```

Pruning doesn't work when:
- Using a function on the partition column: `WHERE DATE(created_at) = '2024-03-01'`
- Partition column used in a cast: `WHERE created_at::date = '2024-03-01'`
- `enable_partition_pruning = off` (check with `SHOW enable_partition_pruning`)

## Dropping Old Partitions

The huge advantage over deleting rows:

```sql
-- Delete 1 million old rows: slow, generates WAL, causes bloat
DELETE FROM orders WHERE created_at < '2024-01-01';

-- Drop an entire partition: instant, no WAL, no vacuum needed
DROP TABLE orders_2023_01;

-- Or detach (keep data but stop querying it from parent):
ALTER TABLE orders DETACH PARTITION orders_2023_01;
-- orders_2023_01 is now a standalone table
-- Archive it, then drop at leisure
ALTER TABLE orders_2023_01 RENAME TO orders_2023_01_archived;
```

## Partition-wise Joins

When joining two partitioned tables on their partition keys, Postgres can join matching partitions directly:

```sql
-- Both tables partitioned by customer_id
CREATE TABLE orders (...) PARTITION BY HASH (customer_id);
CREATE TABLE order_items (...) PARTITION BY HASH (customer_id);

-- Enable partition-wise join
SET enable_partitionwise_join = on;

EXPLAIN SELECT o.*, oi.*
FROM orders o
JOIN order_items oi ON oi.order_id = o.id AND oi.customer_id = o.customer_id;

-- Postgres joins partition 0 with partition 0, partition 1 with partition 1, etc.
-- Massively reduces the join space
```

## Limitations

- **No global unique constraints** across partitions (only within a partition). Primary keys must include the partition column.
- **Foreign keys** from non-partitioned tables to partitioned tables: not supported in older Postgres. Supported from Postgres 12+.
- **Adding partitions** doesn't move existing data — `DEFAULT` partition must be split manually.
- **Partition key can't be updated** — you can't `UPDATE orders SET created_at = new_date` across partition boundaries. Must DELETE + INSERT.

```sql
-- Primary key must include the partition column for uniqueness
ALTER TABLE orders ADD PRIMARY KEY (id, created_at);
-- (just 'id' would fail — Postgres can't enforce uniqueness across partitions without it)
```

For most applications that think they need sharding, Postgres partitioning on the right column — plus a larger server and read replicas — will handle the load with a fraction of the operational complexity.

