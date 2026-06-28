---
title: 'LSM Trees'
subtitle: 'The write-optimized alternative to B-trees — how RocksDB, Cassandra, and LevelDB handle massive write throughput.'
chapter: 6
level: 'intermediate'
readingTime: '14 min'
topics: ['LSM tree', 'compaction', 'memtable', 'SSTable']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## B-Trees vs LSM Trees

B-trees are read-optimized: lookups are fast (3-4 disk reads), but every write requires updating pages in place — random disk I/O.

LSM trees flip this tradeoff: all writes go to an in-memory buffer first, then flush to disk as sorted files. Writes are sequential (fast), but reads may need to check multiple files.

<Callout type="info">

**Real-World Analogy**

Like a donation drop-off center — donors (writes) rapidly drop items into temporary bins (memtable). Periodically, volunteers sort and merge bins into organized shelves (SSTables). Collecting is fast; finding a specific item requires checking multiple bins.

</Callout>

## The LSM Tree Architecture

```typescript
class LSMTree {
	private memtable: SortedMap<string, Row>; // in-memory, sorted
	private immutableMemtables: SortedMap<string, Row>[] = []; // being flushed
	private levels: SSTable[][] = [[], [], [], []]; // L0, L1, L2, L3

	// WRITE: always goes to memtable (RAM) — blazing fast
	async put(key: string, value: Row): Promise<void> {
		// 1. Write to WAL (for durability)
		await this.wal.append(key, value);

		// 2. Insert into memtable (in-memory sorted structure)
		this.memtable.set(key, value);

		// 3. If memtable is full, flush to disk
		if (this.memtable.size >= this.maxMemtableSize) {
			this.immutableMemtables.push(this.memtable);
			this.memtable = new SortedMap();
			await this.flush();
		}
	}

	// READ: check memtable first, then each level
	async get(key: string): Promise<Row | null> {
		// 1. Check active memtable
		if (this.memtable.has(key)) return this.memtable.get(key)!;

		// 2. Check immutable memtables (being flushed)
		for (const mem of this.immutableMemtables) {
			if (mem.has(key)) return mem.get(key)!;
		}

		// 3. Check SSTable levels (L0 first, then L1, L2, ...)
		for (const level of this.levels) {
			for (const sst of level) {
				const result = await sst.get(key);
				if (result !== null) return result;
			}
		}

		return null;
	}
}
```

## SSTables (Sorted String Tables)

When the memtable flushes to disk, it becomes an **SSTable** — an immutable, sorted file:

```typescript
interface SSTable {
  // Metadata
  minKey: string;
  maxKey: string;
  bloomFilter: BloomFilter; // quick "definitely not here" check
  index: Map<string, number>; // sparse index: key → file offset

  // Data
  dataBlocks: DataBlock[]; // sorted key-value pairs

  // Lookup
  async get(key: string): Promise<Row | null> {
    // 1. Check bloom filter — fast rejection
    if (!this.bloomFilter.mightContain(key)) return null;

    // 2. Binary search the sparse index
    const blockOffset = this.findBlock(key);

    // 3. Read and search the data block
    const block = await this.readBlock(blockOffset);
    return block.find(key);
  }
}
```

<Callout type="info">

**Bloom filters are crucial for LSM reads.** Without them, every read would check every SSTable file. A bloom filter tells you "definitely not in this file" with zero disk I/O — false positives are rare (~1%) and just mean one extra disk read.

</Callout>

## Compaction

Over time, LSM trees accumulate many SSTable files. **Compaction** merges them to reduce read amplification and reclaim space:

```typescript
// Level-based compaction (used by LevelDB, RocksDB)
async function compact(level: number): Promise<void> {
	// Pick overlapping SSTables from this level and the next
	const source = selectSSTables(level);
	const target = findOverlapping(level + 1, source);

	// Merge-sort all entries
	const merged = mergeSorted([...source, ...target]);

	// Write new SSTables to level + 1
	const newSSTables = await writeNewSSTables(merged, level + 1);

	// Remove old SSTables
	await deleteOldSSTables([...source, ...target]);
}

// Size-tiered compaction (used by Cassandra)
// Merge SSTables of similar size into larger ones
// Simpler but uses more space during compaction
```

## Tradeoffs: Read/Write/Space Amplification

|                     | B-Tree                               | LSM Tree                       |
| ------------------- | ------------------------------------ | ------------------------------ |
| Write amplification | ~10x (page splits, in-place updates) | ~10-30x (compaction rewrites)  |
| Read amplification  | 1x (single B-tree lookup)            | ~1-5x (check multiple levels)  |
| Space amplification | ~1.5x (page fill factor)             | ~1.1-2x (temporary duplicates) |
| Write throughput    | Lower (random I/O)                   | Higher (sequential I/O)        |
| Read latency        | Lower (predictable)                  | Higher (varies)                |

<Callout type="tip">

**Choose B-trees** for read-heavy workloads (OLTP, typical web apps). **Choose LSM trees** for write-heavy workloads (time-series, logging, IoT, analytics ingestion).

</Callout>

## Key Takeaways

1. **LSM trees buffer writes in memory** and flush sorted files to disk — all sequential I/O
2. **Reads check multiple levels** — bloom filters and sparse indexes minimize disk reads
3. **Compaction merges files** to keep read performance manageable and reclaim space
4. **B-trees win on reads, LSM trees win on writes** — pick based on your workload
