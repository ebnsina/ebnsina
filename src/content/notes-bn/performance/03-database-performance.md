---
title: 'Database Performance'
subtitle: 'Query plan, index strategy, N+1 query, connection pool tuning — database প্রায় সবসময়ই bottleneck।'
chapter: 3
level: 'intermediate'
readingTime: '12 মিনিট'
topics:
  ['PostgreSQL', 'query optimization', 'EXPLAIN ANALYZE', 'indexes', 'N+1', 'connection pooling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সরকারি অফিসের এক ব্যস্ত রেকর্ড রুমে বসেন কেরানি ফাতিমা আল-ফিহরি। দিনভর মানুষ এসে পুরনো ফাইল খোঁজে — জমির দলিল, জন্মনিবন্ধন, মামলার কাগজ। শুরুর দিকে ফাতিমা প্রতিটা তাক এক এক করে খুঁজতেন, একটা ফাইল বের করতেই আধা ঘণ্টা। এখন উনি টেবিলের পাশে একটা ছোট বাক্সে সব ফাইলের নাম বর্ণানুক্রমে ইনডেক্স কার্ডে সাজিয়ে রেখেছেন — নাম দেখেই সরাসরি জানেন কোন তাকের কোন খোপে ফাইলটা, পুরো ঘর হাতড়াতে হয় না। আবার আগে যেদিন দশজন দশটা ফাইল চাইত, উনি দশবার আর্কাইভ ঘরে হেঁটে যেতেন; এখন সকালে গোটা দিনের তালিকা এক কাগজে লিখে এক ট্রিপেই সব ফাইল নিয়ে আসেন।

কাজের চাপ সামলাতে উনি আরও দুটো বুদ্ধি খাটান। প্রতিবার নতুন কাজের লোক ভাড়া না করে চার-পাঁচজন রানারকে সবসময় হাতের কাছে রেডি রাখেন — একজনের কাজ শেষ হলেই তাকে পরের কাজে পাঠান, বারবার নতুন লোক জোগাড়ের ঝামেলা নেই। আর কেউ ২০০ পাতার মোটা ফাইল থেকে শুধু দুই পাতা চাইলে ইবনে সিনা পুরো ফাইল কাউন্টারে বয়ে আনেন না — শুধু ওই দুই পাতা ফটোকপি করে হাতে ধরিয়ে দেন।

এই গল্পটাই আসলে **database performance**। ইনডেক্স কার্ডের বাক্স দেখে সরাসরি তাকে যাওয়াটাই **index** ব্যবহার — পুরো ঘর হাতড়ানো মানে **full scan**। দশটা ফাইলের জন্য দশবার না হেঁটে এক ট্রিপে সব আনাটাই **N+1** কোয়েরি এড়িয়ে **batching**। বারবার নতুন লোক না নিয়ে রানারদের পুনর্ব্যবহার করাটাই **connection pool**, আর পুরো ফাইলের বদলে শুধু দরকারি দুই পাতা ফটোকপি করাটাই কেবল প্রয়োজনীয় **column** ফেচ করা। বাস্তবেও PostgreSQL-এ index দিয়ে full scan এড়ানো, ORM-এ N+1 batch করা, connection pool রিইউজ করা আর `SELECT *`-এর বদলে শুধু দরকারি column নেওয়া — এই চারটাই database দ্রুত রাখার সবচেয়ে বড় হাতিয়ার।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

card catalogue ছাড়া একটা library: তোমার quantum mechanics-এর একটা বই দরকার, তাই তুমি প্রতিটা shelf একে একে খোঁজো। একটা card catalogue (index) তোমাকে ঠিক কোন shelf আর কোন জায়গায় সেটা বলে দেয়। EXPLAIN ANALYZE তোমাকে দেখায় তোমার database প্রতিটা row পড়ছে কিনা (sequential scan — কোনো card catalogue নেই) নাকি সরাসরি ডেটায় লাফিয়ে যাচ্ছে (index scan — catalogue ব্যবহৃত হচ্ছে)।

</Callout>

## EXPLAIN ANALYZE

প্রতিটা performance তদন্ত এখান থেকে শুরু হয়:

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

**যা খুঁজবে:**

- বড় table-এ `Seq Scan` → একটা index দরকার
- `Rows Removed by Filter: 89432` → index যথেষ্ট selective না (ভুল index বা ভুল column order)
- inner scan-এ `loops=100` → N+1 pattern (100 customer-এর জন্য 100টা আলাদা query)
- Buffers-এ `read=12` → disk read (cache miss — page `shared_buffers`-এ নেই)
- কম `cost` estimate-এর তুলনায় বেশি `actual time` → পুরনো statistics (`ANALYZE` চালাও)

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

**কোন column index করবে:**

- Foreign key (JOIN)
- উঁচু cardinality-র `WHERE` clause-এর column (status-এর 3টা value আছে = কম cardinality = একা খারাপ candidate)
- বড় result set-এ `ORDER BY`-এর column
- `WHERE` আর `ORDER BY` দুটোতেই ব্যবহৃত column — composite index

**অনুপস্থিত index চেক করা:**

```sql
-- Tables doing sequential scans that should be indexed
SELECT schemaname, tablename, seq_scan, idx_scan,
       seq_scan::float / NULLIF(seq_scan + idx_scan, 0) AS seq_ratio
FROM pg_stat_user_tables
WHERE seq_scan > 1000
ORDER BY seq_scan DESC;
```

## N+1 Query

ক্লাসিক ORM ফাঁদ: 100টা order fetch করো, তারপর প্রতিটা order-এর customer আলাদাভাবে fetch করো।

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
const customerIds = [...new Set(orders.rows.map((o) => o.customerId))];
const customers = await db.query('SELECT * FROM customers WHERE id = ANY($1)', [customerIds]);
const customerMap = Object.fromEntries(customers.rows.map((c) => [c.id, c]));
orders.rows.forEach((o) => (o.customer = customerMap[o.customerId]));
// Total: 2 queries
```

Production-এ N+1 শনাক্ত করা:

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
	max: 20, // max connections
	min: 5, // keep 5 warm
	idleTimeoutMillis: 30_000, // close idle connections after 30s
	connectionTimeoutMillis: 3_000, // fail fast if pool is exhausted
	statement_timeout: 30_000, // kill queries running > 30s
	query_timeout: 30_000
});

pool.on('error', (err) => {
	log.error({ err }, 'Unexpected error on idle client');
});
```

**কতগুলো connection?**

```
max_connections = min(
  (server_ram_gb * 1024 / connection_overhead_mb),
  optimal_concurrent_queries
)
```

একটা Postgres connection ~5-10MB ব্যবহার করে। একটা 4GB server: সর্বোচ্চ ~400 connection, কিন্তু optimal concurrent query সাধারণত `2 × cpu_cores`। একটা 4-core server-এর জন্য: 8 optimal। এর বেশি হলে, connection queue-এ অপেক্ষা করে, execute করে না।

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

অল্প সংখ্যক আসল Postgres connection দিয়ে হাজার হাজার application connection-এর অনুমতি দিতে PgBouncer-কে `transaction` mode-এ ব্যবহার করো।

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

## Query Optimization Pattern

**Pagination — গভীর page-এর জন্য OFFSET এড়াও:**

```sql
-- BAD — offset scans all previous rows
SELECT * FROM orders ORDER BY created_at DESC OFFSET 10000 LIMIT 20;

-- GOOD — keyset pagination
SELECT * FROM orders
WHERE created_at < $1   -- last seen created_at from previous page
ORDER BY created_at DESC
LIMIT 20;
```

**Indexed column-এ function এড়াও:**

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

**Batch upsert:**

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
const ids = events.map((e) => e.id);
const types = events.map((e) => e.type);
const payloads = events.map((e) => JSON.stringify(e.payload));
const timestamps = events.map((e) => e.createdAt);

await db.query(
	'INSERT INTO events (id, type, payload, created_at) SELECT * FROM unnest($1::uuid[], $2::text[], $3::jsonb[], $4::timestamptz[]) ON CONFLICT (id) DO NOTHING',
	[ids, types, payloads, timestamps]
);
```

**ব্যয়বহুল aggregation-এর জন্য Materialized view:**

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
