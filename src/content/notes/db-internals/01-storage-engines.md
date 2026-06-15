---
title: "Storage Engines"
subtitle: "How databases actually store data on disk — pages, heaps, and the tradeoffs between read and write optimization."
chapter: 1
level: "beginner"
readingTime: "14 min"
topics: ["storage engine", "pages", "heap", "disk I/O"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What is a Storage Engine?

A storage engine is the component that handles how data is physically stored on disk and retrieved into memory. It's the layer between your SQL query and the actual bytes on an SSD.

Different storage engines make different tradeoffs:
- **Read-optimized**: Fast queries, slower writes (B-tree based — PostgreSQL, MySQL InnoDB)
- **Write-optimized**: Fast writes, slower reads (LSM-tree based — RocksDB, Cassandra)

<Callout type="info">

**Real-World Analogy**

Like how different warehouses organize inventory — a fast-food kitchen (write-optimized) dumps ingredients in bins for speed, while a library (read-optimized) keeps everything sorted by category for quick browsing.

</Callout>

## Pages: The Unit of Storage

Databases don't read individual rows — they read **pages** (typically 4KB, 8KB, or 16KB blocks). Every read from disk fetches an entire page, even if you only need one row.

```typescript
// A database page (simplified)
interface Page {
  pageId: number;
  pageType: "data" | "index" | "overflow";
  freeSpace: number;
  itemCount: number;
  items: Row[];        // actual row data
  pageHeader: {
    lsn: number;       // log sequence number (for WAL)
    checksum: number;   // corruption detection
  };
}

// PostgreSQL uses 8KB pages by default
const PAGE_SIZE = 8192; // bytes

// Reading one row = reading one page = 8KB from disk
// This is why indexes matter — they tell you WHICH page to read
```

## Heap vs. Clustered Storage

**Heap storage** (PostgreSQL default): rows are stored in insertion order. The table is a pile of pages with no particular ordering.

**Clustered storage** (MySQL InnoDB): rows are physically ordered by primary key. The table IS the primary key index (a B-tree).

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

**Why this matters**: In a heap, a sequential scan reads pages in order — fast. But finding a specific row requires an index. In clustered storage, the primary key IS the ordering, so PK lookups are always fast, but secondary indexes need an extra lookup.

</Callout>

## Buffer Pool

Reading from disk is ~1000x slower than reading from memory. The **buffer pool** (or page cache) keeps frequently accessed pages in RAM.

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

  private async readFromDisk(pageId: number): Promise<Page> { /* ... */ }
  private writeToDisk(pageId: number, page: Page): void { /* ... */ }
}
```

<Callout type="tip">

**Tune your buffer pool to fit your working set in memory.** If your active data is 10GB, set the buffer pool to at least 10GB. The goal: most reads should hit the cache, not disk. PostgreSQL's `shared_buffers` and MySQL's `innodb_buffer_pool_size` control this.

</Callout>

## Key Takeaways

1. **Pages are the unit of I/O** — databases read/write in page-sized chunks, not individual rows
2. **Heap storage** stores rows in insertion order; **clustered storage** orders by primary key
3. **The buffer pool** is critical — keeping hot pages in RAM avoids disk I/O
4. **Storage engine choice** determines your read/write tradeoff profile

