---
title: 'Write-Ahead Logging (WAL)'
subtitle: 'ডেটাবেজ কীভাবে ডেটা না হারিয়ে crash থেকে টিকে যায় — log-first strategy যা ACID সম্ভব করে।'
chapter: 3
level: 'beginner'
readingTime: '13 মিনিট'
topics: ['WAL', 'durability', 'crash recovery', 'checkpoints']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

মুদি দোকানদার সিনার হাতে দুটো খাতা। একটা হলো টেবিলের কোণে পড়ে থাকা এবড়োখেবড়ো রাফ খাতা, আর অন্যটা হলো সুন্দর করে সাজানো মূল হিসাবের খাতা। এখন সিনার নিয়ম একটাই — যেই মুহূর্তে কোনো বিক্রি হয়, ঠিক তক্ষুনি সে রাফ খাতায় এক লাইনে টুকে ফেলে "৩ কেজি চাল, ২৪০ টাকা"। এই টোকাটা লাগে এক সেকেন্ড, কারণ সে শুধু পরপর নিচের দিকে লিখে যায়, কোথায় কী বসাতে হবে সেই হিসাব করতে হয় না। এই টোকা শেষ হওয়ার আগে সে ক্রেতার হাতে জিনিস ছাড়ে না।

টোকা হয়ে গেলে, পরে ফুরসত মতো সিনা এই রাফ খাতা দেখে দেখে মূল খাতায় সুন্দর করে খাতাওয়ারি হিসাব বসায় — কোন পণ্যের ঘরে কত, দিনের মোট কত। এখন ধরুন এই সুন্দর করে বসানোর মাঝপথেই দোকানের কারেন্ট চলে গেল, বা কেউ ডাক দেওয়ায় সিনা উঠে গেল। সমস্যা নেই — কারণ প্রতিটা বিক্রি তো আগেই রাফ খাতায় পাকাপাকি লেখা আছে। সিনা শুধু আবার রাফ খাতার শুরু থেকে দেখে দেখে মূল খাতায় বসানো শেষ করে। একটা বিক্রিও হারায় না।

এই গল্পটাই আসলে **write-ahead logging (WAL)**। রাফ খাতা হলো WAL — আসল ডেটা পেজে (মূল খাতা) হাত দেওয়ার আগেই প্রতিটা change আগে ওই sequential log-এ লিখে ফেলা, এটাই **log-before-apply**। টোকা শেষ না হওয়া পর্যন্ত ক্রেতাকে জিনিস না দেওয়া মানে **commit** = WAL flush; log ডিস্কে গেলেই কাজটা **durable**। আর মাঝপথে কারেন্ট চলে গেলে রাফ খাতা আবার শুরু থেকে দেখে মূল খাতা মিলিয়ে নেওয়াটাই **crash recovery by replay**। বাস্তবে PostgreSQL ঠিক এভাবেই কাজ করে — প্রতিটা লেখা আগে WAL-এ append হয়, তারপর data page-এ apply হয়, আর crash-এর পর startup-এ WAL replay করে কিছুই না হারিয়ে ডেটাবেজ আবার দাঁড়িয়ে যায়।

## Durability সমস্যা

আপনি যখন একটা row `INSERT` করেন, ডেটাবেজ buffer pool-এ (RAM) একটা page modify করে। ওই dirty page ডিস্কে লেখার আগেই যদি server crash করে, আপনার ডেটা হারিয়ে যায়। প্রতিটা change সরাসরি ডিস্কে লেখা অনেক ধীর — random disk write ব্যয়বহুল।

**WAL এটা সমাধান করে**: আগে change-গুলোর একটা sequential log লেখো, তারপর পরে data file-এ change apply করো।

<Callout type="info">

**বাস্তব জীবনের উপমা**

যেমন একটা ব্যস্ত দোকানে ক্যাশিয়ারের notepad — মূল ledger আপডেট করার আগে, প্রতিটা লেনদেন প্রথমে notepad-এ টুকে রাখা হয়। বিদ্যুৎ চলে গেলে, তারা সব লেনদেন recover করতে notepad-টা আবার replay করে।

</Callout>

## WAL কীভাবে কাজ করে

```typescript
interface WALRecord {
	lsn: number; // Log Sequence Number (monotonically increasing)
	transactionId: number;
	operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'COMMIT' | 'ABORT';
	tableId: number;
	pageId: number;
	offset: number;
	beforeImage?: Uint8Array; // old data (for undo)
	afterImage: Uint8Array; // new data (for redo)
}

class WriteAheadLog {
	private lsn = 0;
	private logFile: FileHandle;
	private buffer: WALRecord[] = [];

	async append(record: Omit<WALRecord, 'lsn'>): Promise<number> {
		const walRecord: WALRecord = { ...record, lsn: ++this.lsn };
		this.buffer.push(walRecord);
		return walRecord.lsn;
	}

	// Force WAL to disk — called on COMMIT
	async flush(): Promise<void> {
		const data = this.serialize(this.buffer);
		await this.logFile.write(data);
		await this.logFile.sync(); // fsync — guarantees data is on disk
		this.buffer = [];
	}
}
```

মূল নিয়ম: **dirty data page ডিস্কে লেখার আগেই WAL record ডিস্কে থাকতে হবে।** এটাই "write-ahead" গ্যারান্টি।

## Write Path

```typescript
async function executeInsert(table: string, row: Row): Promise<void> {
	// 1. Write WAL record (in memory buffer)
	const lsn = await wal.append({
		transactionId: currentTx,
		operation: 'INSERT',
		tableId: getTableId(table),
		pageId: targetPage,
		offset: slotOffset,
		afterImage: serialize(row)
	});

	// 2. Modify the page in buffer pool (RAM only)
	const page = await bufferPool.getPage(targetPage);
	page.items.push(row);
	page.pageHeader.lsn = lsn; // track which WAL record this page reflects
	bufferPool.markDirty(targetPage);

	// 3. On COMMIT: flush WAL to disk (fsync)
	await wal.flush();
	// Data page is NOT written to disk yet!
	// It will be flushed later by the background writer or at checkpoint

	// 4. Return success to client
	// Even if we crash now, the WAL has the data
}
```

<Callout type="info">

**Sequential write কেন দ্রুত**: WAL হলো append-only — প্রতিটা write ফাইলের শেষে যায়। Sequential disk write, random write-এর চেয়ে 100-1000x দ্রুত। এই কারণেই WAL ডেটাবেজকে দ্রুত আর সেইসাথে durable করে।

</Callout>

## Crash Recovery

crash-এর পর startup-এ, ডেটাবেজ WAL replay করে:

```typescript
async function recover(): Promise<void> {
	// Find the last checkpoint (known-good state)
	const checkpoint = await findLastCheckpoint();

	// Replay all WAL records after the checkpoint
	const records = await readWALFrom(checkpoint.lsn);

	for (const record of records) {
		const page = await readPageFromDisk(record.pageId);

		if (page.pageHeader.lsn < record.lsn) {
			// Page is stale — apply the WAL record (REDO)
			applyRecord(page, record);
			await writePageToDisk(page);
		}
		// If page.lsn >= record.lsn, the change was already applied
	}

	// Undo any uncommitted transactions
	await rollbackUncommitted();
}
```

## Checkpoints

Checkpoint ছাড়া, recovery-কে শুরু থেকে পুরো WAL replay করতে হতো। Checkpoint সব dirty page ডিস্কে flush করে, একটা known-good শুরুর পয়েন্ট তৈরি করে।

```typescript
async function checkpoint(): Promise<void> {
	// 1. Record checkpoint start in WAL
	const checkpointLSN = await wal.append({ operation: 'CHECKPOINT_START' });

	// 2. Flush all dirty pages to disk
	for (const [pageId, entry] of bufferPool.dirtyPages()) {
		await writePageToDisk(entry.data);
		entry.dirty = false;
	}

	// 3. Record checkpoint end in WAL
	await wal.append({ operation: 'CHECKPOINT_END' });

	// 4. WAL segments before this checkpoint can be recycled
	await wal.truncateBefore(checkpointLSN);
}

// PostgreSQL runs checkpoints every 5 minutes or every 1GB of WAL
```

<Callout type="tip">

**Checkpoint tuning**: খুব ঘন ঘন = অতিরিক্ত I/O। খুব কম = ধীর recovery আর বিশাল WAL ফাইল। PostgreSQL-এর `checkpoint_timeout` (default 5min) আর `max_wal_size` (default 1GB) এটা নিয়ন্ত্রণ করে।

</Callout>

## মূল কথাগুলো

1. **WAL data page modify করার আগে একটা sequential log-এ change লেখে** — দ্রুত write + crash safety
2. **COMMIT = WAL flush (fsync)** — log ডিস্কে চলে গেলে transaction durable হয়ে যায়
3. **Crash recovery WAL replay করে** শেষ checkpoint থেকে, committed কাজ redo করে আর uncommitted কাজ undo করে
4. **Checkpoint recovery-র সময় সীমিত করে** পর্যায়ক্রমে dirty page ডিস্কে flush করে
