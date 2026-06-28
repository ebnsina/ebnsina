---
title: 'Write-Ahead Logging (WAL)'
subtitle: 'How databases survive crashes without losing data — the log-first strategy that makes ACID possible.'
chapter: 3
level: 'beginner'
readingTime: '13 min'
topics: ['WAL', 'durability', 'crash recovery', 'checkpoints']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Durability Problem

When you `INSERT` a row, the database modifies a page in the buffer pool (RAM). If the server crashes before that dirty page is written to disk, your data is lost. Writing every change directly to disk is too slow — random disk writes are expensive.

**WAL solves this**: write a sequential log of changes first, then apply changes to data files later.

<Callout type="info">

**Real-World Analogy**

Like a cashier's notepad at a busy shop — before updating the main ledger, every transaction is first jotted on the notepad. If the power goes out, they replay the notepad to recover all transactions.

</Callout>

## How WAL Works

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

The key rule: **the WAL record must be on disk BEFORE the dirty data page is written to disk.** This is the "write-ahead" guarantee.

## The Write Path

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

**Why sequential writes are fast**: The WAL is append-only — each write goes to the end of the file. Sequential disk writes are 100-1000x faster than random writes. This is why WAL makes databases fast AND durable.

</Callout>

## Crash Recovery

On startup after a crash, the database replays the WAL:

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

Without checkpoints, recovery would replay the entire WAL from the beginning of time. Checkpoints flush all dirty pages to disk, creating a known-good starting point.

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

**Checkpoint tuning**: Too frequent = excessive I/O. Too infrequent = slow recovery and huge WAL files. PostgreSQL's `checkpoint_timeout` (default 5min) and `max_wal_size` (default 1GB) control this.

</Callout>

## Key Takeaways

1. **WAL writes changes to a sequential log before modifying data pages** — fast writes + crash safety
2. **COMMIT = WAL flush (fsync)** — once the log is on disk, the transaction is durable
3. **Crash recovery replays the WAL** from the last checkpoint, redoing committed and undoing uncommitted work
4. **Checkpoints limit recovery time** by periodically flushing dirty pages to disk
