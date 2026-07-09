---
title: 'Database Cost & Sizing'
subtitle: 'IOPS, storage tier, connection limit, আর read-replica-র সেই হিসাব যা আপনার cost curve বদলে দেয়।'
chapter: 3
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['database sizing', 'IOPS', 'read replicas', 'connection pooling', 'storage tiers']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা library-র circulation desk: একজন librarian (primary) সব ফেরত (write) সামলায়। পাঠক (read query) যেকোনো reference assistant-এর (read replica) কাছে যেতে পারে যাদের কাছে catalog-এর কপি আছে। বেশি query, বেশি assistant — কিন্তু নতুন বই আসা (write) শুধু একটা desk-ই সামলায়।

</Callout>

## Database কেন ব্যয়বহুল

Database তিনটা কারণে ব্যয়বহুল, যেগুলো একে অপরকে বাড়িয়ে তোলে:

1. **Storage cost** monotonically বাড়ে — আপনি প্রায় কখনোই data যোগ করার চেয়ে দ্রুত মুছেন না
2. **IOPS** cost cloud-এ বেশি — managed NVMe performance-এর দাম premium
3. **Memory** আপনার cache hit rate নির্ধারণ করে — কম RAM মানে প্রতিটা cache miss-এ ব্যয়বহুল disk read

Database sizing ভুল করা হলো cloud bill নিয়ন্ত্রণের বাইরে চলে যাওয়ার সবচেয়ে সাধারণ উপায়।

## Storage Tier

সব data-র দ্রুত storage লাগে না। আপনার data-কে tier করুন:

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

**তারিখ অনুযায়ী PostgreSQL table partitioning:**

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

AWS gp3 volume free-তে 3000 IOPS আর 125 MB/s baseline দেয়। এর বেশি হলে pay করতে হয়:

```
gp3 baseline: 3000 IOPS, 125 MB/s — included in storage price
gp3 extra:    +$0.005 per provisioned IOPS (up to 16,000)
              +$0.04 per MB/s (up to 1000 MB/s)

io2:          $0.065/GB/month + $0.065/IOPS-month
              Very expensive but predictable
```

**Provision করার আগে আপনার আসল IOPS measure করুন:**

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

যদি আপনার database-এর IOPS usage 3000-এর নিচে থাকে, gp3 baseline free — বাড়তি provision করবেন না।

## Cache হিসেবে Memory

PostgreSQL-এর `shared_buffers` আর OS page cache নির্ধারণ করে আপনার কতটা data RAM-এ ধরবে। বেশি RAM = higher cache hit rate = কম disk read = সস্তা IOPS।

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

যদি আপনার cache hit rate 90% হয়, 10% read disk-এ যায়। প্রতি সেকেন্ডে 10,000 read query-তে সেটা 1000 disk IOPS। RAM দ্বিগুণ করলে সেটা 99%-এ যেতে পারে, disk read কমিয়ে 100 IOPS-এ নামায় — IOPS cost-এ 10x কমতি।

## Connection Limit আর Pooling

Postgres প্রতি connection-এ একটা OS process তৈরি করে। খুব বেশি connection = খুব বেশি RAM + CPU overhead:

```
Postgres max_connections: 100 (default), 200 (common), 500 (high)
Memory per connection: ~5-10MB

At 500 connections: 2.5-5GB RAM just for connection overhead
```

**PgBouncer** আপনার app আর Postgres-এর মাঝে বসে, অনেক app connection-কে কম সংখ্যক Postgres connection-এ multiplex করে:

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

Cloud-এ এটা অপরিহার্য যেখানে managed Postgres instance size-এর hard connection limit থাকে। একটা `db.t3.medium` RDS instance-এর max ~66 connection। Pooler ছাড়া একটা মাঝারি Node.js app এটা সাথে সাথে নিঃশেষ করে ফেলে।

## Read Replica

Query load বণ্টন করতে আর read capacity বাড়াতে read replica যোগ করুন:

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

**আপনার application-এ read-গুলোকে replica-তে route করুন:**

```typescript
import { Pool } from 'pg';

const primaryPool = new Pool({ host: 'primary.db.internal' });
const replicaPool = new Pool({
	host: 'replica.db.internal' // or a load balancer across replicas
});

// Write operations → primary
async function createOrder(data: OrderData): Promise<Order> {
	const { rows } = await primaryPool.query('INSERT INTO orders (...) VALUES (...) RETURNING *', [
		...values
	]);
	return rows[0];
}

// Read operations → replica
async function getOrderHistory(userId: string): Promise<Order[]> {
	const { rows } = await replicaPool.query(
		'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
		[userId]
	);
	return rows;
}
```

**Replication lag:** Replica primary-র চেয়ে সামান্য পিছিয়ে থাকে (সাধারণত millisecond, মাঝে মাঝে heavy write load-এ second)। write-এর পরপরই যে read হয় তার জন্য replica ব্যবহার করবেন না:

```typescript
async function createAndFetchOrder(data: OrderData): Promise<Order> {
	const order = await createOrder(data); // writes to primary

	// Read from PRIMARY — replica might not have this yet
	return fetchOrder(order.id, { useReplica: false });
}
```

## Managed vs Self-Hosted খরচ

একটা production Postgres setup-এর জন্য (primary + 1 replica, 4 vCPU / 16GB):

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

Managed database ততক্ষণ পর্যন্ত যোগ্য যতক্ষণ আপনার dedicated infrastructure engineer না থাকে। এর পরে, scale-এ cost savings self-hosting-কে justify করে।

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

**অব্যবহৃত index খুঁজে বের করা:**

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

প্রতিটা অব্যবহৃত index storage নষ্ট করে আর write ধীর করে দেয়। এগুলো drop করুন।
