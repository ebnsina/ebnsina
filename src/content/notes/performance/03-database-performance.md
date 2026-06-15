---
title: "Database Performance"
subtitle: "Query plans, index strategy, N+1 queries, connection pool tuning — the database is almost always the bottleneck."
chapter: 3
level: "intermediate"
readingTime: "12 min"
topics: ["PostgreSQL", "query optimization", "EXPLAIN ANALYZE", "indexes", "N+1", "connection pooling"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A library without a card catalogue: you need a book about quantum mechanics, so you search every shelf in order. A card catalogue (index) tells you exactly which shelf and position. EXPLAIN ANALYZE shows you whether your database is reading every row (sequential scan — no card catalogue) or jumping directly to the data (index scan — catalogue in use).

</Callout>

## EXPLAIN ANALYZE

Every performance investigation starts here:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.*, c.email
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'pending'
  AND o.created_at > NOW() - INTERVAL '24 hours'
ORDER BY o.created_at DESC
LIMIT 100;
```

```
Limit  (cost=0.56..1234.5 rows=100 width=312) (actual time=0.234..45.123 rows=100 loops=1)
  ->  Index Scan Backward using orders_created_at_idx on orders o  (cost=...)
        (actual time=0.218..44.987 rows=100 loops=1)
        Filter: (status = 'pending')
        Rows Removed by Filter: 89432
        Buffers: shared hit=2341 read=12
  ->  Index Scan using customers_pkey on customers c
        (actual time=0.002..0.003 rows=1 loops=100)
        Buffers: shared hit=300
Planning Time: 1.234 ms
Execution Time: 45.456 ms
```

**What to look for:**
- `Seq Scan` on a large table → needs an index
- `Rows Removed by Filter: 89432` → index isn't selective enough (wrong index or wrong column order)
- `loops=100` on an inner scan → N+1 pattern (100 separate queries for 100 customers)
- `read=12` in Buffers → disk reads (cache miss — page not in `shared_buffers`)
- High `actual time` vs low `cost` estimate → outdated statistics (run `ANALYZE`)

## Index Strategy

```sql
-- Basic B-tree index (equality and range queries)
CREATE INDEX orders_status_idx ON orders (status);

-- Partial index (index only the rows you query)
-- Much smaller, faster for specific queries
CREATE INDEX orders_pending_idx ON orders (created_at DESC)
WHERE status = 'pending';

-- Composite index — order matters
-- Supports: WHERE customer_id = X
-- Supports: WHERE customer_id = X AND status = Y
-- Does NOT support: WHERE status = Y (without customer_id)
CREATE INDEX orders_customer_status_idx ON orders (customer_id, status);

-- Covering index — all columns in the query are in the index (no heap lookup)
CREATE INDEX orders_list_idx ON orders (customer_id, created_at DESC)
INCLUDE (status, total_cents);

-- Index for text search
CREATE INDEX products_name_idx ON products USING gin(to_tsvector('english', name));

-- Index for JSONB queries
CREATE INDEX orders_metadata_idx ON orders USING gin(metadata);
-- Supports: WHERE metadata @> '{"source": "mobile"}'
```

**Which columns to index:**
- Foreign keys (JOINs)
- Columns in `WHERE` clauses with high cardinality (status has 3 values = low cardinality = bad candidate alone)
- Columns in `ORDER BY` on large result sets
- Columns used in both `WHERE` and `ORDER BY` — composite index

**Check for missing indexes:**
```sql
-- Tables doing sequential scans that should be indexed
SELECT schemaname, tablename, seq_scan, idx_scan,
       seq_scan::float / NULLIF(seq_scan + idx_scan, 0) AS seq_ratio
FROM pg_stat_user_tables
WHERE seq_scan > 1000
ORDER BY seq_scan DESC;
```

## N+1 Queries

The classic ORM trap: fetch 100 orders, then fetch each order's customer separately.

```typescript
// BAD — N+1
const orders = await db.query('SELECT * FROM orders LIMIT 100');
for (const order of orders) {
  // 100 separate queries
  const customer = await db.query('SELECT * FROM customers WHERE id = $1', [order.customerId]);
  order.customer = customer.rows[0];
}
// Total: 101 queries

// GOOD — JOIN
const orders = await db.query(`
  SELECT o.*, row_to_json(c.*) as customer
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  LIMIT 100
`);
// Total: 1 query

// GOOD — batch fetch (when JOIN isn't appropriate)
const orders = await db.query('SELECT * FROM orders LIMIT 100');
const customerIds = [...new Set(orders.rows.map(o => o.customerId))];
const customers = await db.query(
  'SELECT * FROM customers WHERE id = ANY($1)',
  [customerIds]
);
const customerMap = Object.fromEntries(customers.rows.map(c => [c.id, c]));
orders.rows.forEach(o => o.customer = customerMap[o.customerId]);
// Total: 2 queries
```

Detect N+1 in production:
```typescript
// Log queries with pg (postgres client)
const pool = new Pool({ connectionString: DATABASE_URL });

const originalQuery = pool.query.bind(pool);
let queryCount = 0;

pool.query = async (...args: any[]) => {
  queryCount++;
  const start = Date.now();
  const result = await originalQuery(...args);
  const duration = Date.now() - start;
  
  if (duration > 100) {
    log.warn({ sql: args[0], duration }, 'Slow query');
  }
  return result;
};

// Reset per request, log if > 10 queries
app.use((req, res, next) => {
  queryCount = 0;
  res.on('finish', () => {
    if (queryCount > 10) {
      log.warn({ queryCount, path: req.path }, 'Possible N+1');
    }
  });
  next();
});
```

## Connection Pool Tuning

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,                        // max connections
  min: 5,                         // keep 5 warm
  idleTimeoutMillis: 30_000,      // close idle connections after 30s
  connectionTimeoutMillis: 3_000, // fail fast if pool is exhausted
  statement_timeout: 30_000,      // kill queries running > 30s
  query_timeout: 30_000,
});

pool.on('error', (err) => {
  log.error({ err }, 'Unexpected error on idle client');
});
```

**How many connections?**

```
max_connections = min(
  (server_ram_gb * 1024 / connection_overhead_mb),
  optimal_concurrent_queries
)
```

A Postgres connection uses ~5-10MB. A 4GB server: ~400 connections maximum, but optimal concurrent queries is usually `2 × cpu_cores`. For a 4-core server: 8 optimal. Beyond that, connections queue wait, not execute.

```sql
-- Check current connections
SELECT count(*), state, wait_event_type, wait_event
FROM pg_stat_activity
GROUP BY state, wait_event_type, wait_event
ORDER BY count DESC;

-- Long-running queries
SELECT pid, now() - query_start AS duration, state, query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - INTERVAL '5 seconds'
ORDER BY duration DESC;
```

Use PgBouncer in `transaction` mode to allow thousands of application connections with a small number of actual Postgres connections.

## Slow Query Log

```sql
-- Log queries slower than 100ms
ALTER SYSTEM SET log_min_duration_statement = '100ms';
SELECT pg_reload_conf();

-- Check current settings
SHOW log_min_duration_statement;
```

```bash
# Parse slow query log
pgbadger /var/log/postgresql/postgresql-*.log \
  --format json \
  --outfile slow-queries.json

# Top 10 slowest queries
cat slow-queries.json | jq '.slowest_queries[:10][] | {query, mean_time, count}'
```

## Query Optimization Patterns

**Pagination — avoid OFFSET for deep pages:**
```sql
-- BAD — offset scans all previous rows
SELECT * FROM orders ORDER BY created_at DESC OFFSET 10000 LIMIT 20;

-- GOOD — keyset pagination
SELECT * FROM orders
WHERE created_at < $1   -- last seen created_at from previous page
ORDER BY created_at DESC
LIMIT 20;
```

**Avoid functions on indexed columns:**
```sql
-- BAD — function prevents index use
WHERE DATE(created_at) = '2024-01-15'
WHERE LOWER(email) = 'user@example.com'

-- GOOD
WHERE created_at >= '2024-01-15' AND created_at < '2024-01-16'
WHERE email = LOWER('User@Example.com')   -- normalize before storing

-- Or: functional index
CREATE INDEX orders_date_idx ON orders (DATE(created_at));
CREATE INDEX customers_email_lower_idx ON customers (LOWER(email));
```

**Batch upserts:**
```sql
-- Single roundtrip for 1000 rows
INSERT INTO events (id, type, payload, created_at)
SELECT * FROM unnest($1::uuid[], $2::text[], $3::jsonb[], $4::timestamptz[])
ON CONFLICT (id) DO UPDATE SET
  payload = EXCLUDED.payload,
  updated_at = NOW();
```

```typescript
// Build arrays for batch insert
const ids = events.map(e => e.id);
const types = events.map(e => e.type);
const payloads = events.map(e => JSON.stringify(e.payload));
const timestamps = events.map(e => e.createdAt);

await db.query(
  'INSERT INTO events (id, type, payload, created_at) SELECT * FROM unnest($1::uuid[], $2::text[], $3::jsonb[], $4::timestamptz[]) ON CONFLICT (id) DO NOTHING',
  [ids, types, payloads, timestamps]
);
```

**Materialized views for expensive aggregations:**
```sql
-- Expensive to compute on every request
CREATE MATERIALIZED VIEW order_stats AS
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS order_count,
  SUM(total_cents) AS revenue_cents,
  AVG(total_cents) AS avg_order_cents
FROM orders
GROUP BY 1;

CREATE UNIQUE INDEX order_stats_day_idx ON order_stats (day);

-- Refresh on a schedule or after bulk imports
REFRESH MATERIALIZED VIEW CONCURRENTLY order_stats;
-- CONCURRENTLY: doesn't lock reads during refresh
```

