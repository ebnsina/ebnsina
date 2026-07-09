---
title: 'B-Trees & Indexes'
subtitle: 'প্রতিটা relational ডেটাবেজ index-এর পেছনের data structure — B-tree কীভাবে ডেটা sorted রাখে আর query দ্রুত করে।'
chapter: 2
level: 'beginner'
readingTime: '16 মিনিট'
topics: ['B-tree', 'index', 'balanced tree', 'query performance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## B-Trees কেন?

B-tree হলো একটা self-balancing tree যা disk access-এর জন্য অপটিমাইজড। Binary tree-র (প্রতি node-এ 2টা child) মতো নয়, B-tree-র প্রতি node-এ শত শত child থাকে — প্রতিটা node একটা disk page ভরে ফেলে। এর মানে হলো লক্ষ লক্ষ entry থাকা একটা tree মাত্র 3-4 level গভীর।

**3 level = লক্ষ লক্ষের মধ্যে যেকোনো row খুঁজে পেতে 3 disk read।**

<Callout type="info">

**বাস্তব জীবনের উপমা**

যেমন একটা textbook-এর পেছনের index — "binary search" খুঁজতে প্রতিটা page পড়ার বদলে আপনি index দেখেন যা আপনাকে ঠিক page-টা বলে দেয়। প্রতিটা level আপনার search সংকুচিত করে — প্রথমে অক্ষর দিয়ে, তারপর শব্দ দিয়ে, তারপর page।

</Callout>

## B-Tree Structure

```typescript
interface BTreeNode {
	keys: number[]; // sorted keys
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
		let lo = 0,
			hi = node.keys.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (node.keys[mid] <= key) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}
}
```

## বাস্তবে Index কীভাবে কাজ করে

```sql
-- Without index: full table scan (reads EVERY page)
SELECT * FROM users WHERE email = 'fatima@example.com';
-- Reads: ~10,000 pages for a 1M row table

-- With index: B-tree lookup (reads 3-4 pages)
CREATE INDEX idx_users_email ON users (email);
SELECT * FROM users WHERE email = 'fatima@example.com';
-- Reads: 3 pages (B-tree traversal) + 1 page (heap fetch)
```

### Composite Index

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

**Index column-এর ক্রম গুরুত্বপূর্ণ।** high-selectivity column-গুলো আগে রাখুন (যেসব column বেশি row ফিল্টার করে দেয়)। `(country, city)`-র উপর একটা composite index `WHERE city = 'NYC'`-র জন্য অকেজো — এর leftmost prefix লাগে।

</Callout>

## B-Tree Insertion আর Split

যখন একটা node পূর্ণ হয়ে যায়, তখন এটা দুইটা node-এ split হয় আর মাঝের key-টা parent-এর দিকে push করে দেয়:

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

এই কারণেই B-tree balanced থাকে — split উপরের দিকে propagate হয়, আর tree শুধু root-এ গিয়ে উঁচু হয়।

## Index-এর ধরন

| Type   | কীভাবে কাজ করে             | সবচেয়ে ভালো যার জন্য                |
| ------ | -------------------------- | ------------------------------------ |
| B-tree | Sorted tree, range queries | `=`, `<`, `>`, `BETWEEN`, `ORDER BY` |
| Hash   | Hash table lookup          | শুধু `=` (range নয়)                 |
| GIN    | Inverted index             | Full-text search, arrays, JSONB      |
| GiST   | Generalized search tree    | Geometry, nearest-neighbor           |
| BRIN   | Block range index          | বড়, স্বাভাবিকভাবে ordered টেবিল     |

## Index-এর খরচ

Index read দ্রুত করে কিন্তু write ধীর করে দেয়:

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

**অতিরিক্ত index করবেন না।** প্রতিটা index write performance আর disk space খরচ করে। যেসব column WHERE, JOIN, আর ORDER BY clause-এ আসে সেগুলো index করুন। যেসব index ব্যবহার হচ্ছে না সেগুলো সরিয়ে ফেলুন — `pg_stat_user_indexes` index ব্যবহারের stats দেখায়।

</Callout>

## মূল কথাগুলো

1. **B-tree অগভীর** — লক্ষ লক্ষ row থাকলেও 3-4 level গভীর, তাই lookup মাত্র 3-4 disk read
2. **Composite index-এর ক্রম গুরুত্বপূর্ণ** — query-কে leftmost prefix-এর সাথে মিলতে হবে
3. **Index write speed-এর বিনিময়ে read speed দেয়** — প্রতিটা অতিরিক্ত index write ধীর করে দেয়
4. **সঠিক index type বেছে নিন** — range-এর জন্য B-tree, equality-র জন্য hash, full-text-এর জন্য GIN
