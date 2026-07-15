---
title: 'LSM Trees'
subtitle: 'B-tree-র write-optimized বিকল্প — RocksDB, Cassandra, আর LevelDB কীভাবে বিশাল write throughput সামলায়।'
chapter: 6
level: 'intermediate'
readingTime: '14 মিনিট'
topics: ['LSM tree', 'compaction', 'memtable', 'SSTable']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

রহিমের মুদি দোকানে সন্ধ্যাবেলা কেনাকাটার ভিড় লেগে যায়। প্রতিটা বিক্রি খাতায় গুছিয়ে-গুছিয়ে সাজিয়ে লিখতে গেলে ক্রেতার লাইন থমকে যাবে। তাই ভিড়ের সময় রহিম প্রতিটা বিক্রি চটজলদি একটা করে ছোট কাগজের স্লিপে লিখে সামনের ট্রে-তে ফেলে দেয় — কে কী নিলো, কত দাম, এইটুকু। লিখতে সেকেন্ডও লাগে না, লাইনও এগোয়। ট্রে ভরে গেলে সে ওটা তুলে রেখে একটা গোছানো বান্ডিল বানিয়ে ফেলে, আর সামনে নতুন খালি ট্রে বসায়।

দিনশেষে দোকান ফাঁকা হলে রহিম কয়েকটা বান্ডিল একসাথে নিয়ে বসে — সব স্লিপ মিলিয়ে একটা পরিষ্কার হিসাবের খাতায় পুরো দিনের বিক্রি গুছিয়ে তোলে, ডুপ্লিকেট বাদ দেয়, একই জিনিসের একাধিক এন্ট্রি এক করে দেয়। এতে লেখার কাজটা রাতভর দ্রুত হয়েছিল ঠিকই, কিন্তু দিনের মাঝখানে কেউ এসে "আজ চিনি কত দরে দিলে?" জিজ্ঞেস করলে রহিমকে সামনের ট্রে থেকে শুরু করে কয়েকটা বান্ডিল উল্টে দেখতে হয় — একটু ধীর।

এই পুরো ব্যাপারটাই আসলে **LSM tree**। সামনের ট্রে হলো in-memory buffer বা **memtable** — নতুন লেখা প্রথমে ওখানেই দ্রুত জমা হয়। ট্রে ভরে গেলে বান্ডিল বানিয়ে তুলে রাখা মানে ওটা ডিস্কে sorted file হিসেবে **flush** হয়ে **SSTable** হয়ে যাওয়া। আর রাতে বান্ডিলগুলো মিলিয়ে এক খাতা বানানোটাই **compaction** — কয়েকটা sorted file merge করে পরিষ্কার একটা করা। এজন্যই LSM tree **write-optimized**: লেখা বিদ্যুৎগতির, পড়ায় কয়েকটা file দেখতে হয় বলে একটু খরচ বেশি। Cassandra, RocksDB আর LevelDB ঠিক এভাবেই বিশাল write throughput সামলায়।

## B-Trees vs LSM Trees

B-tree read-optimized: lookup দ্রুত (3-4 disk read), কিন্তু প্রতিটা write-এর জন্য page-গুলো in place আপডেট করতে হয় — random disk I/O।

LSM tree এই tradeoff উল্টে দেয়: সব write প্রথমে একটা in-memory buffer-এ যায়, তারপর sorted file হিসেবে ডিস্কে flush হয়। Write sequential (দ্রুত), কিন্তু read-এর জন্য একাধিক file চেক করা লাগতে পারে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

যেমন একটা donation drop-off center — দাতারা (write) দ্রুত জিনিস অস্থায়ী bin-এ (memtable) ফেলে যায়। পর্যায়ক্রমে, স্বেচ্ছাসেবকরা bin-গুলো sort ও merge করে গোছানো shelf-এ (SSTable) সাজায়। জমা করা দ্রুত; কিন্তু একটা নির্দিষ্ট জিনিস খুঁজতে একাধিক bin চেক করা লাগে।

</Callout>

## LSM Tree Architecture

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

Memtable যখন ডিস্কে flush হয়, তখন এটা একটা **SSTable** হয়ে যায় — একটা immutable, sorted file:

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

**LSM read-এর জন্য bloom filter অপরিহার্য।** এগুলো ছাড়া, প্রতিটা read প্রতিটা SSTable file চেক করত। একটা bloom filter আপনাকে শূন্য disk I/O-তে বলে দেয় "এই file-এ নিশ্চিতভাবে নেই" — false positive বিরল (~1%) আর শুধু একটা extra disk read মানে।

</Callout>

## Compaction

সময়ের সাথে, LSM tree-তে অনেক SSTable file জমে যায়। **Compaction** এগুলো merge করে read amplification কমায় আর space ফিরিয়ে আনে:

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

|                     | B-Tree                             | LSM Tree                     |
| ------------------- | ---------------------------------- | ---------------------------- |
| Write amplification | ~10x (page split, in-place update) | ~10-30x (compaction rewrite) |
| Read amplification  | 1x (single B-tree lookup)          | ~1-5x (একাধিক level চেক)     |
| Space amplification | ~1.5x (page fill factor)           | ~1.1-2x (অস্থায়ী duplicate) |
| Write throughput    | কম (random I/O)                    | বেশি (sequential I/O)        |
| Read latency        | কম (predictable)                   | বেশি (varies)                |

<Callout type="tip">

**B-tree বেছে নিন** read-heavy workload-এর জন্য (OLTP, সাধারণ web app)। **LSM tree বেছে নিন** write-heavy workload-এর জন্য (time-series, logging, IoT, analytics ingestion)।

</Callout>

## মূল কথাগুলো

1. **LSM tree write-গুলো মেমরিতে buffer করে** আর sorted file ডিস্কে flush করে — সবই sequential I/O
2. **Read একাধিক level চেক করে** — bloom filter আর sparse index disk read কমিয়ে দেয়
3. **Compaction file merge করে** read performance সামলানোর মতো রাখতে আর space ফিরিয়ে আনতে
4. **B-tree read-এ জেতে, LSM tree write-এ জেতে** — আপনার workload অনুযায়ী বেছে নিন
