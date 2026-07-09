---
title: 'Postgres Table Partitioning'
subtitle: 'Range, list, এবং hash partitioning — বড় table-এর single-server উত্তর, যা sharding-এর প্রতিশ্রুত বেশিরভাগ সুবিধা operational খরচ ছাড়াই এনে দেয়।'
chapter: 5
level: 'intermediate'
readingTime: '9 মিনিট'
topics:
  [
    'PostgreSQL',
    'partitioning',
    'range partition',
    'hash partition',
    'partition pruning',
    'pg_partman'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

লেবেলযুক্ত ড্রয়ারসহ একটি ফাইলিং কেবিনেট: সব ফাইল একই কেবিনেটে (একটি database server), কিন্তু বছর অনুযায়ী ড্রয়ারে ভাগ করা। 2023-এর কোনো ফাইল দরকার হলে, আপনি শুধু সেই ড্রয়ারটাই খোলেন — সবগুলো নয়। Partition pruning হলো Postgres স্বয়ংক্রিয়ভাবে আপনার query-র ভিত্তিতে জানা কোন ড্রয়ার খুলতে হবে।

</Callout>

## Shard করার আগে কেন Partition করবেন

Postgres table partitioning আপনাকে দেয়:

- **Partition pruning** — query শুধু প্রাসঙ্গিক partition scan করে, পুরো table নয়
- **দ্রুত bulk delete** — `DROP TABLE partition_name` তাৎক্ষণিক, লক্ষ লক্ষ row delete করার তুলনায়
- **Index size** — প্রতিটি partition-এর index ছোট এবং memory-তে ভালো fit করে
- **Vacuum efficiency** — autovacuum একবারে একটি partition-এ কাজ করে, কম contention

সবকিছু এক server-এ, কোনো application পরিবর্তন ছাড়াই। একই `INSERT INTO orders` এবং `SELECT FROM orders` SQL কাজ করে — Postgres internally route করে।

## Range Partitioning (তারিখ অনুযায়ী)

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

কোনো defined range-এ fit না করা value গুলোর জন্য catch-all:

```sql
CREATE TABLE orders_default PARTITION OF orders DEFAULT;
```

Default partition ছাড়া, কোনো defined range-এর বাইরে `created_at` সহ একটি row insert করলে error হয়। এটি থাকলে, row-টি `orders_default`-এ নামে — schema evolution-এর সময় কাজে লাগে।

## Partition তৈরি স্বয়ংক্রিয় করা (pg_partman)

মাসিক partition manually তৈরি করা scale করে না। `pg_partman` এটি স্বয়ংক্রিয় করে:

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

pg_partman যা সামলায়:

- দরকার হওয়ার আগেই পরবর্তী N মাসের partition তৈরি করা
- retention policy অনুযায়ী পুরনো partition drop করা
- `partman.part_config` table পরিচালনা করা

## Hash Partitioning

একটি নির্দিষ্ট সংখ্যক partition জুড়ে row গুলো সমানভাবে distribute করুন:

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

`WHERE user_id = $1` সহ query এক partition-এ prune হয়। `user_id` ছাড়া query সব 8টি scan করে।

Hash partitioning একটি existing table-এ যোগ করা যায় না — শুরুতেই design করতে হবে।

## List Partitioning

Discrete value (region, status, tenant) অনুযায়ী partition:

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

কাজে লাগে: multi-tenant data (বড় tenant-এর জন্য `tenant_id` অনুযায়ী partition), regional data (GDPR-এর জন্য EU data একসাথে রাখা), স্বাভাবিক grouping সহ data।

## Partition Pruning

Postgres আসলেই prune করছে কিনা যাচাই করুন:

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

Pruning কাজ করে না যখন:

- Partition column-এ একটি function ব্যবহার করা হয়: `WHERE DATE(created_at) = '2024-03-01'`
- Partition column একটি cast-এ ব্যবহার করা হয়: `WHERE created_at::date = '2024-03-01'`
- `enable_partition_pruning = off` (`SHOW enable_partition_pruning` দিয়ে যাচাই করুন)

## পুরনো Partition Drop করা

Row delete করার তুলনায় বিশাল সুবিধা:

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

## Partition-wise Join

দুটি partitioned table-কে তাদের partition key-এর উপর join করার সময়, Postgres মিলে যাওয়া partition গুলো সরাসরি join করতে পারে:

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

## সীমাবদ্ধতা

- **Partition জুড়ে global unique constraint নেই** (শুধু একটি partition-এর মধ্যে)। Primary key-তে partition column থাকতে হবে।
- **Non-partitioned table থেকে partitioned table-এ Foreign key**: পুরনো Postgres-এ supported নয়। Postgres 12+ থেকে supported।
- **Partition যোগ করলে** existing data সরে না — `DEFAULT` partition manually split করতে হবে।
- **Partition key আপডেট করা যায় না** — আপনি partition boundary জুড়ে `UPDATE orders SET created_at = new_date` করতে পারবেন না। DELETE + INSERT করতে হবে।

```sql
-- Primary key must include the partition column for uniqueness
ALTER TABLE orders ADD PRIMARY KEY (id, created_at);
-- (just 'id' would fail — Postgres can't enforce uniqueness across partitions without it)
```

যেসব application মনে করে তাদের sharding দরকার, তাদের বেশিরভাগের জন্য সঠিক column-এ Postgres partitioning — সাথে একটি বড় server এবং read replica — operational জটিলতার একটি ভগ্নাংশ দিয়ে load সামলে নেবে।
