---
title: 'Scaling the Database Layer'
subtitle: 'Read replicas, connection pooling, and why the database is almost always the horizontal scaling bottleneck.'
chapter: 4
level: 'intermediate'
readingTime: '9 min'
topics: ['read replicas', 'connection pooling', 'PgBouncer', 'database bottleneck', 'sharding']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A library with one librarian handling every transaction: adding more reading tables (app servers) doesn't help if the librarian (database) is the bottleneck. The solutions: hire assistant librarians for reading (read replicas), install a revolving door so multiple people can check in and out quickly (connection pooling), or open multiple branches (sharding).

</Callout>

## Why the Database Bottlenecks First

Application servers are stateless — you can add 10 more and they all serve traffic equally. The database is stateful — you can only add one writer (in most configurations), and every app server must reach it.

As you scale app servers, the database connection count grows with them. At 50 app servers with 10 connections each, you have 500 database connections — which exhausts even a large Postgres instance's connection limit and creates enormous overhead.

## Connection Pooling with PgBouncer

PgBouncer multiplexes many application connections onto fewer database connections:

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

**Pool modes:**

| Mode          | Connection released    | Best for                                          |
| ------------- | ---------------------- | ------------------------------------------------- |
| `session`     | On client disconnect   | Stateful sessions (SET, prepared statements)      |
| `transaction` | After each transaction | Most web apps — recommended                       |
| `statement`   | After each statement   | Not recommended — can break multi-statement flows |

**Transaction mode limitations:** Session-level state (SET, advisory locks, LISTEN/NOTIFY, prepared statements) doesn't survive across PgBouncer transactions. If your app uses `SET LOCAL` or prepared statements, either use session mode or disable statement-level features:

```typescript
// WRONG with transaction pooling — SET is lost after transaction
await db.query('SET search_path TO myschema');
const result = await db.query('SELECT * FROM users'); // might not use myschema

// RIGHT — use per-query options or schema-qualify tables
const result = await db.query('SELECT * FROM myschema.users');
```

## Read Replicas

Add read replicas to scale read throughput independently from write throughput:

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

**Replication lag consideration:** Reads on replicas might be slightly behind the primary. After a write, read from primary if you need the just-written data:

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

## Caching to Reduce Database Load

Before adding replicas, check if caching can absorb reads at a fraction of the cost:

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

A 90% cache hit rate reduces database load by 10x for that query type. This is often the most cost-effective scale operation before adding read replicas.

## Query Optimization Before Scaling

A slow query causing database load often has an index problem, not a scaling problem:

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

A single missing index can cause 100x database load. Fix indexes before adding hardware.

## Connection Limits by Instance Size

Postgres max connections by instance (approximate):

| AWS RDS Instance | vCPU | RAM  | Max connections |
| ---------------- | ---- | ---- | --------------- |
| db.t3.micro      | 2    | 1GB  | ~15             |
| db.t3.medium     | 2    | 4GB  | ~66             |
| db.m5.large      | 2    | 8GB  | ~125            |
| db.m5.xlarge     | 4    | 16GB | ~250            |
| db.m5.4xlarge    | 16   | 64GB | ~1000           |

Without PgBouncer, you hit the connection limit before you hit CPU or memory limits. Always run PgBouncer in front of managed Postgres.

## When to Shard

Sharding (partitioning data across multiple primary databases) is a last resort. Consider it when:

- Single primary is at CPU or I/O limit even with optimized queries
- Write volume exceeds what one machine can handle
- Dataset is too large for one machine's storage

Most applications never need sharding. Before sharding:

1. Optimize queries and indexes
2. Add read replicas for read-heavy workloads
3. Cache aggressively
4. Upgrade to a larger instance
5. Use CQRS (separate read models in purpose-built stores)

If you must shard, partition by the natural distribution key (user ID, tenant ID) that lets you route queries without cross-shard joins. Cross-shard joins are expensive and complex — design to avoid them.

## Scaling Stack Summary

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

Work through the levels in order. Most applications max out at Level 3.
