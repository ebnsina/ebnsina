---
title: 'Query Planning & Execution'
subtitle: 'ডেটাবেজ কীভাবে আপনার SQL-কে একটা execution plan-এ পরিণত করে — parsing, optimization, আর কেন EXPLAIN আপনার সবচেয়ে ভালো বন্ধু।'
chapter: 5
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['query planner', 'EXPLAIN', 'optimization', 'execution plan']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

আল-খোয়ারিজমির একটা ছোট কুরিয়ার কোম্পানি। সকালে ম্যানেজার ফাতিমা আল-ফিহরি তার হাতে একটা লিস্ট ধরিয়ে দেয় — আজ মিরপুর, ধানমন্ডি, উত্তরা আর গুলশানে দশটা প্যাকেট পৌঁছাতে হবে। এই একই লিস্ট, কিন্তু পৌঁছানোর রাস্তা তো অনেকগুলো। আল-খোয়ারিজমি চাইলে আগে উত্তরা গিয়ে ঘুরে আসতে পারে, আবার চাইলে ধানমন্ডি দিয়ে শুরু করতে পারে। প্রতিটা রুটের জন্য সময় আর তেল খরচ আলাদা।

আল-খোয়ারিজমি হুট করে সামনের রাস্তা ধরে না। মনে মনে সে কয়েকটা রুট হিসাব করে — এই সময়ে মিরপুর রোডে জ্যাম থাকে, কিন্তু ভোরের দিকে বিমানবন্দর সড়ক ফাঁকা। এই যে "কোন রাস্তায় এখন জ্যাম, কোনটা ফাঁকা" — এই জানাশোনাটাই তার আসল হাতিয়ার। কয়েকটা সম্ভাব্য রুটের আন্দাজি সময় আর তেল খরচ তুলনা করে সে সবচেয়ে কম খরচেরটা বেছে নেয়, তারপর বের হয়।

এই গল্পটাই আসলে **query planner** (বা optimizer)। ফাতিমা আল-ফিহরির দেওয়া প্যাকেটের লিস্ট হলো আপনার একটা SQL query — একই কাজ, কিন্তু সেটা চালানোর অনেকগুলো **execution plan** আছে (কোন index ধরে যাবে নাকি পুরো টেবিল **scan** করবে, কোন টেবিল আগে **join** করবে)। আল-খোয়ারিজমির জ্যামের জানাশোনা হলো database-এর **table statistics**, আর রুটের আন্দাজি খরচ তুলনা করাটাই **cost estimation**। planner প্রতিটা সম্ভাব্য plan-এর cost আন্দাজ করে সবচেয়ে সস্তাটা বেছে নেয় — ঠিক যেমন আল-খোয়ারিজমি কম খরচের রুট বাছে। বাস্তবে PostgreSQL বা MySQL-এ `EXPLAIN` চালালে আপনি এই বাছাই করা রুটটাই — মানে planner শেষমেশ কোন plan-টা বেছে নিয়েছে — চোখের সামনে দেখতে পান।

## Query Pipeline

আপনার SQL query রেজাল্ট ফেরত দেওয়ার আগে কয়েকটা ধাপের মধ্য দিয়ে যায়:

```typescript
// SQL → Parse → Analyze → Rewrite → Plan → Execute

// 1. Parser: SQL text → Abstract Syntax Tree
// SELECT * FROM users WHERE age > 25
// → { type: "SELECT", table: "users", where: { op: ">", col: "age", val: 25 } }

// 2. Analyzer: validate tables/columns exist, resolve types
// 3. Rewriter: apply views, rules
// 4. Planner: choose the best execution strategy
// 5. Executor: run the plan and return results
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

যেমন একটা GPS আপনার route পরিকল্পনা করে — এটা downtown দিয়ে যেতে পারে (full table scan) বা highway ধরতে পারে (index scan)। Query planner real-time traffic data (table statistics) অনুযায়ী দ্রুততম route বেছে নেয়।

</Callout>

## Planner-এর কাজ

Planner ভিন্ন ভিন্ন strategy মূল্যায়ন করে আর **cost estimation**-এর ভিত্তিতে সবচেয়ে সস্তাটা বেছে নেয়:

```typescript
interface PlanNode {
	type: 'SeqScan' | 'IndexScan' | 'NestedLoop' | 'HashJoin' | 'MergeJoin' | 'Sort' | 'Aggregate';
	estimatedCost: number; // arbitrary units (roughly: page reads)
	estimatedRows: number; // expected output rows
	children: PlanNode[];
}

// For: SELECT * FROM users WHERE email = 'fatima@example.com'

// Option A: Sequential Scan
// Read ALL pages, check every row
// Cost: ~10,000 (for a 1M row table)

// Option B: Index Scan on idx_users_email
// B-tree lookup → fetch row from heap
// Cost: ~4 (3 index pages + 1 heap page)

// Planner picks Option B
```

## EXPLAIN Output পড়া

```sql
-- Always use EXPLAIN ANALYZE to see actual execution
EXPLAIN ANALYZE
SELECT u.name, COUNT(o.id)
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE u.country = 'US'
GROUP BY u.name;

-- Output (simplified):
-- HashAggregate (cost=1250..1260 rows=100) (actual time=45.2..45.8 rows=95)
--   → Hash Join (cost=350..1200 rows=5000) (actual time=12.1..42.3 rows=4800)
--       Hash Cond: (o.user_id = u.id)
--       → Seq Scan on orders (cost=0..800 rows=50000) (actual time=0.01..15.2 rows=50000)
--       → Hash (cost=300..300 rows=2000) (actual time=8.5..8.5 rows=1950)
--           → Index Scan on idx_users_country (cost=0..300 rows=2000) (actual time=0.03..6.2 rows=1950)
--               Index Cond: (country = 'US')
```

```typescript
// How to read it (bottom-up):
// 1. Index Scan: find US users using index (1950 rows, 6.2ms)
// 2. Hash: build hash table of US users (8.5ms)
// 3. Seq Scan: read all orders (50000 rows, 15.2ms)
// 4. Hash Join: match orders to US users (4800 matches, 42.3ms)
// 5. HashAggregate: group by name, count (95 groups, 45.8ms)
```

<Callout type="tip">

**এগুলো খুঁজুন**: বড় টেবিলে `Seq Scan` (index missing?), estimated আর actual row-এর মধ্যে বড় ফারাক (stale statistics?), high cost-সহ `Sort` (কোনো index কি ordering দিতে পারে?), আর বড় outer table-সহ `Nested Loop` (এটা কি Hash Join হওয়া উচিত?)।

</Callout>

## Join Strategies

Planner তিনটা join algorithm-এর মধ্যে বেছে নেয়:

```typescript
// Nested Loop: for each row in A, scan B
// Best when: one table is small, inner table has an index
// Cost: O(N × M) without index, O(N × log M) with index

// Hash Join: build hash table from smaller table, probe with larger
// Best when: no useful indexes, both tables are large
// Cost: O(N + M) but needs memory for hash table

// Merge Join: sort both tables, merge
// Best when: both tables are already sorted (from indexes)
// Cost: O(N log N + M log M) for sorting + O(N + M) for merge
```

## Statistics আর Cost Estimation

Planner cost estimate করতে **table statistics**-এর উপর নির্ভর করে:

```sql
-- PostgreSQL collects statistics via ANALYZE
ANALYZE users;

-- What it tracks:
-- pg_class: row count, page count
-- pg_stats: column-level stats
--   - null_frac: fraction of NULLs
--   - n_distinct: number of distinct values
--   - most_common_vals: frequent values and their frequencies
--   - histogram_bounds: value distribution

-- Stale statistics = bad plans!
-- If the planner thinks a table has 100 rows but it has 10M,
-- it might choose a nested loop instead of a hash join
```

<Callout type="warning">

**Bulk data change-এর পর ANALYZE চালান** (বড় import, delete, schema change)। Autovacuum এটা পর্যায়ক্রমে করে, কিন্তু এটা পিছিয়ে থাকতে পারে। Stale statistics হলো bad query plan-এর #1 কারণ।

</Callout>

## সাধারণ Optimization Pattern

```sql
-- 1. Cover your queries with indexes
-- An index that includes all needed columns avoids heap fetches
CREATE INDEX idx_users_covering ON users (country) INCLUDE (name, email);

-- 2. Avoid functions on indexed columns
WHERE LOWER(email) = 'fatima@example.com'  -- ✗ can't use index
WHERE email = 'fatima@example.com'          -- ✓ uses index

-- 3. Use partial indexes for filtered queries
CREATE INDEX idx_active_users ON users (email) WHERE active = true;

-- 4. Avoid SELECT * — fetch only needed columns
SELECT name, email FROM users WHERE ...  -- reads less data
```

## মূল কথাগুলো

1. **Planner সবচেয়ে সস্তা plan বেছে নেয়** table statistics থেকে পাওয়া cost estimate-এর ভিত্তিতে
2. **EXPLAIN ANALYZE আসল execution দেখায়** — performance debugging-এর জন্য সবসময় এটা ব্যবহার করুন
3. **Stale statistics bad plan-এর কারণ** — bulk change-এর পর ANALYZE চালান
4. **Join strategy গুরুত্বপূর্ণ** — ছোট/indexed-এর জন্য nested loop, বড় unindexed-এর জন্য hash join, আগে থেকে sorted-এর জন্য merge join
