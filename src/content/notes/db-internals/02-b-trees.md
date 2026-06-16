---
title: "B-Trees & Indexes"
subtitle: "The data structure behind every relational database index — how B-trees keep data sorted and queries fast."
chapter: 2
level: "beginner"
readingTime: "16 min"
topics: ["B-tree", "index", "balanced tree", "query performance"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why B-Trees?

A B-tree is a self-balancing tree optimized for disk access. Unlike binary trees (2 children per node), B-trees have hundreds of children per node — each node fills one disk page. This means a tree with millions of entries is only 3-4 levels deep.

**3 levels = 3 disk reads to find any row among millions.**

<Callout type="info">

**Real-World Analogy**

Like the index at the back of a textbook — instead of reading every page to find "binary search", you check the index which tells you the exact page. Each level narrows your search — first by letter, then by word, then the page.

</Callout>

## B-Tree Structure

```typescript
interface BTreeNode {
  keys: number[];           // sorted keys
  values: (Row | number)[]; // row data (leaf) or child page IDs (internal)
  isLeaf: boolean;
  // In a node with N keys, there are N+1 children
  // keys:     [10,    20,    30]
  // children: [<10] [10-20] [20-30] [>30]
}

class BTree {
  private root: BTreeNode;
  private order: number; // max keys per node (typically 100-500)

  search(key: number): Row | null {
    let node = this.root;

    while (!node.isLeaf) {
      // Binary search within the node (in-memory, fast)
      const idx = this.findChildIndex(node, key);
      node = this.readPage(node.values[idx] as number);
      // Each iteration = 1 disk read
    }

    // At leaf — find the key
    const idx = node.keys.indexOf(key);
    return idx >= 0 ? (node.values[idx] as Row) : null;
  }

  private findChildIndex(node: BTreeNode, key: number): number {
    // Binary search: O(log N) within node, but N is small (~200)
    let lo = 0, hi = node.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (node.keys[mid] <= key) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
```

## How Indexes Work in Practice

```sql
-- Without index: full table scan (reads EVERY page)
SELECT * FROM users WHERE email = 'fatima@example.com';
-- Reads: ~10,000 pages for a 1M row table

-- With index: B-tree lookup (reads 3-4 pages)
CREATE INDEX idx_users_email ON users (email);
SELECT * FROM users WHERE email = 'fatima@example.com';
-- Reads: 3 pages (B-tree traversal) + 1 page (heap fetch)
```

### Composite Indexes

```sql
-- Composite index: ordered by (country, city, name)
CREATE INDEX idx_location ON users (country, city, name);

-- Uses the index (leftmost prefix match):
SELECT * FROM users WHERE country = 'US';                        -- ✓
SELECT * FROM users WHERE country = 'US' AND city = 'NYC';      -- ✓
SELECT * FROM users WHERE country = 'US' AND city = 'NYC' AND name = 'Fatima'; -- ✓

-- Cannot use the index:
SELECT * FROM users WHERE city = 'NYC';              -- ✗ (skips country)
SELECT * FROM users WHERE name = 'Fatima';            -- ✗ (skips country, city)
```

<Callout type="tip">

**Index column order matters.** Put high-selectivity columns first (columns that filter out more rows). A composite index on `(country, city)` is useless for `WHERE city = 'NYC'` — it needs the leftmost prefix.

</Callout>

## B-Tree Insertions and Splits

When a node is full, it splits into two nodes and pushes the middle key up to the parent:

```typescript
insert(key: number, value: Row): void {
  const leaf = this.findLeaf(key);

  if (leaf.keys.length < this.order) {
    // Space available — insert directly
    this.insertIntoNode(leaf, key, value);
  } else {
    // Node full — split
    const [leftNode, rightNode, medianKey] = this.splitNode(leaf, key, value);
    // Push medianKey up to parent
    // Parent might also split → cascades up
    this.insertIntoParent(leaf.parent, medianKey, leftNode, rightNode);
  }
}
```

This is why B-trees stay balanced — splits propagate upward, and the tree only grows taller at the root.

## Index Types

| Type | How it works | Best for |
|------|-------------|----------|
| B-tree | Sorted tree, range queries | `=`, `<`, `>`, `BETWEEN`, `ORDER BY` |
| Hash | Hash table lookup | `=` only (no ranges) |
| GIN | Inverted index | Full-text search, arrays, JSONB |
| GiST | Generalized search tree | Geometry, nearest-neighbor |
| BRIN | Block range index | Large, naturally ordered tables |

## The Cost of Indexes

Indexes speed up reads but slow down writes:

```typescript
// Every INSERT/UPDATE/DELETE must also update all indexes
// Table with 5 indexes:
// INSERT → 1 heap write + 5 index writes = 6 writes

// Index maintenance costs:
// - Write amplification: each data write triggers multiple index writes
// - Space: indexes can be larger than the table itself
// - Vacuum overhead (PostgreSQL): dead index entries need cleanup
```

<Callout type="warning">

**Don't over-index.** Each index costs write performance and disk space. Index columns that appear in WHERE, JOIN, and ORDER BY clauses. Remove indexes that aren't being used — `pg_stat_user_indexes` shows index usage stats.

</Callout>

## Key Takeaways

1. **B-trees are shallow** — 3-4 levels deep even with millions of rows, so lookups are 3-4 disk reads
2. **Composite index order matters** — queries must match the leftmost prefix
3. **Indexes trade write speed for read speed** — each additional index slows down writes
4. **Choose the right index type** — B-tree for ranges, hash for equality, GIN for full-text

