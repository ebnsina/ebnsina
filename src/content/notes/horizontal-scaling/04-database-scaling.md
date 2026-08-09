---
title: 'Scaling the Database Layer'
subtitle: 'Read replica, connection pooling, এবং কেন ডেটাবেস প্রায় সবসময়ই horizontal scaling-এর bottleneck।'
chapter: 4
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['read replicas', 'connection pooling', 'PgBouncer', 'database bottleneck', 'sharding']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা লাইব্রেরি যেখানে একজন লাইব্রেরিয়ান প্রতিটা লেনদেন সামলায়: আরও পড়ার টেবিল (অ্যাপ সার্ভার) যোগ করলে লাভ নেই যদি লাইব্রেরিয়ান (ডেটাবেস) নিজেই bottleneck হয়। সমাধানগুলো: পড়ার জন্য সহকারী লাইব্রেরিয়ান নিয়োগ দিন (read replica), একটা ঘূর্ণায়মান দরজা বসান যাতে একসাথে অনেকে দ্রুত ঢুকতে-বেরোতে পারে (connection pooling), অথবা একাধিক শাখা খুলুন (sharding)।

</Callout>

## গল্পে বুঝি

সমরকন্দ শহরে জমি-জমার দলিল, বিয়ে, ব্যবসার চুক্তি — সব কিছু সরকারিভাবে সিলমোহর করেন একজনই নোটারি, ইবনে সিনা। তাঁর সামনে বসার জন্য একটাই ডেস্ক। শহরের কেরানিরা বেড়ে গেছে দ্রুত — নতুন কেরানি বসাতে লাগে শুধু একটা টেবিল আর চেয়ার, তাই তারা যত খুশি বাড়ানো যায়। কিন্তু সব কেরানি শেষমেশ ওই একটা নোটারি ডেস্কেই এসে লাইন দেয়। কেরানি বাড়ানোয় কোনো লাভ হয় না, কারণ সবাই আটকে যায় ইবনে সিনার একটামাত্র ডেস্কে। ভিড় সামলাতে না পেরে ইবনে সিনা হিমশিম।

তখন শহর তিনটা বুদ্ধি বের করল। প্রথমত, খেয়াল করা গেল বেশিরভাগ মানুষ আসলে নতুন কিছু নিবন্ধন করতে আসে না — তারা শুধু পুরনো দলিল **পড়তে** চায়। তাই কয়েকটা রিডিং-রুম খোলা হলো, যেখানে প্রতিটা দলিলের সিলমোহর করা নকল রাখা থাকে; যাদের শুধু পড়া দরকার তারা আর নোটারির লাইনে দাঁড়ায় না, রিডিং-রুমে গিয়ে দেখে নেয়। দ্বিতীয়ত, সবচেয়ে বেশি চাওয়া কয়েকটা দলিল আল-খোয়ারিজমি একটা ফ্রন্ট-ডেস্কে মুখস্থ রাখেন — কেউ চাইলেই সঙ্গে সঙ্গে বলে দেন, নকল বের করারও দরকার হয় না। শেষমেশ যখন নিবন্ধনের চাপও একটা অফিসে আর ধরে না, তখন ফাতিমা আল-ফিহরি রেকর্ডগুলো এলাকা অনুযায়ী ভাগ করে আলাদা আলাদা নোটারি অফিসে ছড়িয়ে দেন — উত্তর পাড়ার দলিল এক অফিসে, দক্ষিণ পাড়ারটা আরেক অফিসে।

গল্পটাই আসলে **database scaling**। ইবনে সিনার একটামাত্র ডেস্ক হলো **primary database** — আসল **bottleneck**। রিডিং-রুমের সিলমোহর করা নকলগুলো হলো **read replica** (পড়ার চাপ ছড়িয়ে দেয়), মুখস্থ ফ্রন্ট-ডেস্ক হলো database-এর সামনে বসানো **cache** (সবচেয়ে বেশি চাওয়া read গুলো শোষণ করে), আর এলাকা অনুযায়ী রেকর্ড ভাগ করাটাই **sharding/partitioning** (write-এর চাপও ভাগ করে দেয়)। আর সবচেয়ে জরুরি শিক্ষা — কেরানি (stateless app server) বাড়ানো সহজ, কিন্তু নোটারি ডেস্ক (database) বাড়ানো কঠিন, কারণ সেখানে state থাকে। বাস্তবেও ঠিক তা-ই: Postgres, MySQL-এ read replica, Redis cache আর user ID দিয়ে shard করে বড় সাইটগুলো এভাবেই database-এর চাপ সামলায়।

## কেন ডেটাবেস আগে Bottleneck হয়

অ্যাপ্লিকেশন সার্ভার stateless — আপনি আরও ১০টা যোগ করতে পারেন এবং তারা সবাই সমানভাবে ট্রাফিক সামলায়। ডেটাবেস stateful — আপনি শুধু একটা writer যোগ করতে পারেন (বেশিরভাগ configuration-এ), এবং প্রতিটা অ্যাপ সার্ভারকে সেটায় পৌঁছাতে হয়।

যত অ্যাপ সার্ভার scale করবেন, ডেটাবেস connection সংখ্যা তার সাথে বাড়বে। ৫০টা অ্যাপ সার্ভার প্রতিটায় ১০টা connection নিয়ে থাকলে, আপনার ৫০০টা ডেটাবেস connection হয় — যা এমনকি একটা বড় Postgres instance-এর connection limit শেষ করে দেয় এবং বিশাল overhead তৈরি করে।

## PgBouncer দিয়ে Connection Pooling

PgBouncer অনেক application connection-কে কম সংখ্যক ডেটাবেস connection-এ multiplex করে:

```
50 app servers × 10 connections = 500 connections to PgBouncer
PgBouncer                       →  20 connections to Postgres
```

```ini
# /etc/pgbouncer/pgbouncer.ini
[databases]
mydb = host=postgres.internal port=5432 dbname=mydb

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 5432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

# Pool settings
pool_mode = transaction           # recommended — connection released after each transaction
default_pool_size = 20            # Postgres connections per database/user combination
max_client_conn = 1000            # total app connections PgBouncer accepts
reserve_pool_size = 5             # spare connections for bursts

# Timeouts
client_idle_timeout = 0           # don't close idle app connections
server_idle_timeout = 600         # close idle Postgres connections after 10m
query_timeout = 0                 # no query timeout (set per-query in app)
```

**Pool mode:**

| Mode          | Connection কখন ছাড়ে      | কীসের জন্য সবচেয়ে ভালো                              |
| ------------- | ------------------------- | ---------------------------------------------------- |
| `session`     | Client disconnect হলে     | Stateful session (SET, prepared statement)           |
| `transaction` | প্রতিটা transaction-এর পর | বেশিরভাগ web app — সুপারিশকৃত                        |
| `statement`   | প্রতিটা statement-এর পর   | সুপারিশ করা হয় না — multi-statement flow ভাঙতে পারে |

**Transaction mode-এর সীমাবদ্ধতা:** Session-level state (SET, advisory lock, LISTEN/NOTIFY, prepared statement) PgBouncer transaction জুড়ে টিকে থাকে না। আপনার অ্যাপ যদি `SET LOCAL` বা prepared statement ব্যবহার করে, তাহলে হয় session mode ব্যবহার করুন নয়তো statement-level feature বন্ধ করুন:

```typescript
// WRONG with transaction pooling — SET is lost after transaction
await db.query('SET search_path TO myschema');
const result = await db.query('SELECT * FROM users'); // might not use myschema

// RIGHT — use per-query options or schema-qualify tables
const result = await db.query('SELECT * FROM myschema.users');
```

## Read Replica

Write throughput থেকে স্বাধীনভাবে read throughput scale করতে read replica যোগ করুন:

```typescript
import { Pool } from 'pg';

// Primary: handles writes
const primaryPool = new Pool({
	host: process.env.DB_PRIMARY_HOST,
	max: 5
});

// Replica pool: handles reads
const replicaPool = new Pool({
	host: process.env.DB_REPLICA_HOST, // or a load balancer across multiple replicas
	max: 20 // replicas can handle more connections safely
});

// Route queries by operation type
export async function query(sql: string, params?: unknown[]): Promise<unknown> {
	const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)/i.test(sql);
	const pool = isWrite ? primaryPool : replicaPool;
	return pool.query(sql, params);
}

// Or explicit per call
export const db = {
	primary: (sql: string, params?: unknown[]) => primaryPool.query(sql, params),
	replica: (sql: string, params?: unknown[]) => replicaPool.query(sql, params)
};

// Usage
const orders = await db.replica('SELECT * FROM orders WHERE user_id = $1', [userId]);
await db.primary('INSERT INTO orders (...) VALUES (...)', [...values]);
```

**Replication lag বিবেচনা:** replica-তে read primary থেকে সামান্য পিছিয়ে থাকতে পারে। একটা write-এর পর, সদ্য লেখা ডেটা যদি দরকার হয় তাহলে primary থেকে read করুন:

```typescript
async function createOrderAndFetch(data: OrderData): Promise<Order> {
	// Write to primary
	const {
		rows: [order]
	} = await db.primary('INSERT INTO orders (...) RETURNING *', [...values]);

	// Read from PRIMARY — replica might not have it yet
	const {
		rows: [full]
	} = await db.primary('SELECT * FROM orders WHERE id = $1', [order.id]);
	return full;
}
```

## ডেটাবেস Load কমাতে Caching

Replica যোগ করার আগে, দেখুন caching খরচের একটা ভগ্নাংশে read শোষণ করতে পারে কিনা:

```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

async function getProduct(productId: string): Promise<Product> {
	// Check cache first
	const cached = await redis.get(`product:${productId}`);
	if (cached) return JSON.parse(cached);

	// Cache miss: hit database
	const {
		rows: [product]
	} = await db.replica('SELECT * FROM products WHERE id = $1', [productId]);

	// Cache with TTL
	await redis.setex(`product:${productId}`, 300, JSON.stringify(product)); // 5 min TTL

	return product;
}
```

90% cache hit rate সেই query type-এর জন্য ডেটাবেস load 10x কমিয়ে দেয়। Read replica যোগ করার আগে এটাই প্রায়ই সবচেয়ে সাশ্রয়ী scale operation।

## Scale করার আগে Query Optimization

ডেটাবেস load তৈরি করা একটা slow query-এর প্রায়ই একটা index সমস্যা থাকে, scaling সমস্যা নয়:

```sql
-- Find slow queries
SELECT
  mean_exec_time,
  calls,
  total_exec_time,
  query
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Find missing indexes (sequential scans on large tables)
SELECT
  relname AS table,
  seq_scan,
  idx_scan,
  n_live_tup AS rows
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan
  AND n_live_tup > 10000
ORDER BY seq_scan DESC;

-- Add the missing index
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);
-- CONCURRENTLY: no lock on the table, safe in production
```

একটা মাত্র missing index 100x ডেটাবেস load ঘটাতে পারে। Hardware যোগ করার আগে index ঠিক করুন।

## Instance Size অনুযায়ী Connection Limit

Instance অনুযায়ী Postgres max connection (আনুমানিক):

| AWS RDS Instance | vCPU | RAM  | Max connections |
| ---------------- | ---- | ---- | --------------- |
| db.t3.micro      | 2    | 1GB  | ~15             |
| db.t3.medium     | 2    | 4GB  | ~66             |
| db.m5.large      | 2    | 8GB  | ~125            |
| db.m5.xlarge     | 4    | 16GB | ~250            |
| db.m5.4xlarge    | 16   | 64GB | ~1000           |

PgBouncer ছাড়া, আপনি CPU বা memory limit-এ পৌঁছানোর আগেই connection limit-এ পৌঁছে যান। Managed Postgres-এর সামনে সবসময় PgBouncer চালান।

## কখন Shard করবেন

Sharding (একাধিক primary ডেটাবেস জুড়ে ডেটা partition করা) হলো একদম শেষ উপায়। এটা বিবেচনা করুন যখন:

- Optimized query সত্ত্বেও single primary CPU বা I/O limit-এ থাকে
- Write volume একটা মেশিন যা সামলাতে পারে তার বেশি হয়
- Dataset একটা মেশিনের storage-এর জন্য অনেক বড়

বেশিরভাগ অ্যাপ্লিকেশনের কখনো sharding দরকার হয় না। Shard করার আগে:

1. Query এবং index optimize করুন
2. Read-heavy workload-এর জন্য read replica যোগ করুন
3. আক্রমণাত্মকভাবে cache করুন
4. একটা বড় instance-এ upgrade করুন
5. CQRS ব্যবহার করুন (উদ্দেশ্য-নির্দিষ্ট store-এ আলাদা read model)

যদি shard করতেই হয়, natural distribution key (user ID, tenant ID) দিয়ে partition করুন যা cross-shard join ছাড়াই query route করতে দেয়। Cross-shard join ব্যয়বহুল এবং জটিল — এগুলো এড়াতে ডিজাইন করুন।

## Scaling Stack সারসংক্ষেপ

```
Level 1: Add PgBouncer (connection pooling)
  Cost: free, ~1 hour to deploy
  Effect: handle 10x more app servers with same Postgres

Level 2: Caching (Redis)
  Cost: Redis instance ($20-200/month)
  Effect: 80-95% reduction in read queries for cacheable data

Level 3: Read replicas
  Cost: 1x primary cost per replica
  Effect: linear read throughput scaling

Level 4: Larger instance (vertical scale)
  Cost: 2-4x current instance cost
  Effect: more connections, more memory (better cache hit rate), faster disk

Level 5: Sharding / CQRS
  Cost: significant engineering investment
  Effect: horizontal write scaling (rare requirement)
```

Level-গুলো ক্রমানুসারে কাজ করুন। বেশিরভাগ অ্যাপ্লিকেশন Level 3-এ গিয়ে সর্বোচ্চে পৌঁছায়।
