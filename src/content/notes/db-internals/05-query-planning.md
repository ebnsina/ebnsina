---
title: "Query Planning & Execution"
subtitle: "How the database turns your SQL into an execution plan — parsing, optimization, and why EXPLAIN is your best friend."
chapter: 5
level: "intermediate"
readingTime: "15 min"
topics: ["query planner", "EXPLAIN", "optimization", "execution plan"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Query Pipeline

Your SQL query goes through several stages before returning results:

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

**Real-World Analogy**

Like a GPS planning your route — it could go through downtown (full table scan) or take the highway (index scan). The query planner picks the fastest route based on real-time traffic data (table statistics).

</Callout>

## The Planner's Job

The planner evaluates different strategies and picks the cheapest one based on **cost estimation**:

```typescript
interface PlanNode {
  type: "SeqScan" | "IndexScan" | "NestedLoop" | "HashJoin" | "MergeJoin" | "Sort" | "Aggregate";
  estimatedCost: number;    // arbitrary units (roughly: page reads)
  estimatedRows: number;    // expected output rows
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

## Reading EXPLAIN Output

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

**Look for**: `Seq Scan` on large tables (missing index?), large gaps between estimated and actual rows (stale statistics?), `Sort` with high cost (can an index provide ordering?), and `Nested Loop` with large outer table (should be a Hash Join?).

</Callout>

## Join Strategies

The planner chooses between three join algorithms:

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

## Statistics and Cost Estimation

The planner relies on **table statistics** to estimate costs:

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

**Run ANALYZE after bulk data changes** (large imports, deletes, schema changes). Autovacuum does this periodically, but it may lag behind. Stale statistics are the #1 cause of bad query plans.

</Callout>

## Common Optimization Patterns

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

## Key Takeaways

1. **The planner picks the cheapest plan** based on cost estimates from table statistics
2. **EXPLAIN ANALYZE shows actual execution** — always use it for performance debugging
3. **Stale statistics cause bad plans** — run ANALYZE after bulk changes
4. **Join strategy matters** — nested loop for small/indexed, hash join for large unindexed, merge join for pre-sorted

