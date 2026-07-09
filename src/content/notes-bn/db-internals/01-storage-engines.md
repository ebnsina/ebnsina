---
title: 'Storage Engines'
subtitle: 'ডেটাবেজ আসলে কীভাবে ডিস্কে ডেটা রাখে — pages, heaps, এবং read আর write অপটিমাইজেশনের মধ্যকার tradeoff।'
chapter: 1
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['storage engine', 'pages', 'heap', 'disk I/O']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Storage Engine কী?

Storage engine হলো সেই component যা নিয়ন্ত্রণ করে ডেটা কীভাবে ফিজিক্যালি ডিস্কে সংরক্ষিত হয় এবং মেমরিতে রিট্রিভ হয়। এটা আপনার SQL query আর SSD-র উপরের আসল bytes-এর মাঝখানের layer।

ভিন্ন ভিন্ন storage engine ভিন্ন ভিন্ন tradeoff করে:

- **Read-optimized**: দ্রুত query, ধীর write (B-tree based — PostgreSQL, MySQL InnoDB)
- **Write-optimized**: দ্রুত write, ধীর read (LSM-tree based — RocksDB, Cassandra)

<Callout type="info">

**বাস্তব জীবনের উপমা**

যেমন ভিন্ন ভিন্ন warehouse তাদের inventory ভিন্নভাবে সাজায় — একটা fast-food kitchen (write-optimized) গতির জন্য উপকরণগুলো bin-এ ঢেলে দেয়, আর একটা library (read-optimized) সবকিছু category অনুযায়ী সাজিয়ে রাখে যাতে দ্রুত খুঁজে পাওয়া যায়।

</Callout>

## Pages: Storage-এর একক

ডেটাবেজ আলাদা আলাদা row পড়ে না — তারা **pages** পড়ে (সাধারণত 4KB, 8KB, বা 16KB blocks)। ডিস্ক থেকে প্রতিটা read একটা পুরো page নিয়ে আসে, এমনকি আপনার যদি শুধু একটা row দরকার হয় তাহলেও।

```typescript
// A database page (simplified)
interface Page {
	pageId: number;
	pageType: 'data' | 'index' | 'overflow';
	freeSpace: number;
	itemCount: number;
	items: Row[]; // actual row data
	pageHeader: {
		lsn: number; // log sequence number (for WAL)
		checksum: number; // corruption detection
	};
}

// PostgreSQL uses 8KB pages by default
const PAGE_SIZE = 8192; // bytes

// Reading one row = reading one page = 8KB from disk
// This is why indexes matter — they tell you WHICH page to read
```

## Heap vs. Clustered Storage

**Heap storage** (PostgreSQL default): row-গুলো insertion order-এ সংরক্ষিত হয়। টেবিলটা মূলত pages-এর একটা স্তূপ, কোনো নির্দিষ্ট ordering ছাড়াই।

**Clustered storage** (MySQL InnoDB): row-গুলো primary key অনুযায়ী ফিজিক্যালি সাজানো থাকে। টেবিলটাই হলো primary key index (একটা B-tree)।

```typescript
// Heap: rows stored wherever there's space
// Table "users":
// Page 0: [row_id=5, row_id=1, row_id=8]   ← insertion order
// Page 1: [row_id=3, row_id=12, row_id=2]

// Clustered (InnoDB): rows ordered by primary key
// Page 0: [id=1, id=2, id=3]   ← sorted by PK
// Page 1: [id=5, id=8, id=12]

// Consequence: range scans on PK are fast in clustered storage
// SELECT * FROM users WHERE id BETWEEN 1 AND 5
// Heap: might read 3 pages (rows scattered)
// Clustered: reads 1 page (rows are adjacent)
```

<Callout type="info">

**কেন এটা গুরুত্বপূর্ণ**: একটা heap-এ, sequential scan pages-গুলো ক্রম অনুসারে পড়ে — দ্রুত। কিন্তু একটা নির্দিষ্ট row খুঁজে পেতে একটা index লাগে। Clustered storage-এ, primary key-ই হলো ordering, তাই PK lookup সবসময় দ্রুত হয়, কিন্তু secondary index-এর জন্য একটা extra lookup লাগে।

</Callout>

## Buffer Pool

ডিস্ক থেকে পড়া মেমরি থেকে পড়ার চেয়ে ~1000x ধীর। **Buffer pool** (বা page cache) ঘন ঘন access করা pages-গুলো RAM-এ রাখে।

```typescript
class BufferPool {
	private pages = new Map<number, { data: Page; dirty: boolean; pinCount: number }>();
	private maxPages: number;

	constructor(memorySizeMB: number, pageSizeBytes: number) {
		this.maxPages = Math.floor((memorySizeMB * 1024 * 1024) / pageSizeBytes);
	}

	async getPage(pageId: number): Promise<Page> {
		// Cache hit — return from memory
		if (this.pages.has(pageId)) {
			const entry = this.pages.get(pageId)!;
			entry.pinCount++;
			return entry.data;
		}

		// Cache miss — read from disk
		if (this.pages.size >= this.maxPages) {
			this.evict(); // remove least-recently-used page
		}

		const page = await this.readFromDisk(pageId);
		this.pages.set(pageId, { data: page, dirty: false, pinCount: 1 });
		return page;
	}

	markDirty(pageId: number): void {
		const entry = this.pages.get(pageId);
		if (entry) entry.dirty = true;
		// Dirty pages are written back to disk later (by background writer or at checkpoint)
	}

	private evict(): void {
		// LRU or clock sweep — find unpinned page to remove
		for (const [id, entry] of this.pages) {
			if (entry.pinCount === 0) {
				if (entry.dirty) {
					this.writeToDisk(id, entry.data); // flush before evicting
				}
				this.pages.delete(id);
				return;
			}
		}
	}

	private async readFromDisk(pageId: number): Promise<Page> {
		/* ... */
	}
	private writeToDisk(pageId: number, page: Page): void {
		/* ... */
	}
}
```

<Callout type="tip">

**আপনার buffer pool এমনভাবে tune করুন যাতে working set মেমরিতে ধরে।** আপনার active data যদি 10GB হয়, buffer pool কমপক্ষে 10GB-তে সেট করুন। লক্ষ্য: বেশিরভাগ read যেন cache-এ hit করে, ডিস্কে নয়। PostgreSQL-এর `shared_buffers` আর MySQL-এর `innodb_buffer_pool_size` এটা নিয়ন্ত্রণ করে।

</Callout>

## মূল কথাগুলো

1. **Pages হলো I/O-র একক** — ডেটাবেজ page-আকারের chunk-এ read/write করে, আলাদা আলাদা row-তে নয়
2. **Heap storage** row-গুলো insertion order-এ রাখে; **clustered storage** primary key অনুযায়ী সাজায়
3. **Buffer pool** অত্যন্ত গুরুত্বপূর্ণ — hot pages-গুলো RAM-এ রাখলে disk I/O এড়ানো যায়
4. **Storage engine-এর পছন্দ** আপনার read/write tradeoff প্রোফাইল নির্ধারণ করে
