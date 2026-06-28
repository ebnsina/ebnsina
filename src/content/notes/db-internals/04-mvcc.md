---
title: 'MVCC — Multi-Version Concurrency Control'
subtitle: 'How databases let readers and writers work simultaneously without blocking — snapshots, visibility rules, and isolation levels.'
chapter: 4
level: 'intermediate'
readingTime: '17 min'
topics: ['MVCC', 'transactions', 'isolation levels', 'snapshots']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Concurrency Problem

Without concurrency control, two transactions modifying the same row can corrupt data. Locking everything works but kills performance — readers block writers and vice versa.

**MVCC** solves this by keeping multiple versions of each row. Readers see a consistent snapshot without blocking writers.

<Callout type="info">

**Real-World Analogy**

Like a document under review — when someone is editing a shared document, others still see the last saved version. The new version only becomes visible after the edit is fully saved, so no one sees half-written content.

</Callout>

## How MVCC Works

Every row has hidden metadata tracking which transactions created and deleted it:

```typescript
interface MVCCRow {
	// Visible data
	data: Record<string, unknown>;

	// Hidden MVCC fields
	xmin: number; // transaction ID that created this version
	xmax: number; // transaction ID that deleted/updated this version (0 = alive)
	ctid: string; // physical location (page, offset)
}

// UPDATE doesn't modify in place — it creates a NEW version
// UPDATE users SET name = 'Omar' WHERE id = 1;
//
// Old version: { data: {id:1, name:'Fatima'}, xmin: 100, xmax: 200 }
// New version: { data: {id:1, name:'Omar'},   xmin: 200, xmax: 0   }
```

## Snapshot Isolation

Each transaction gets a **snapshot** — a frozen view of which transactions were committed at the time it started.

```typescript
interface Snapshot {
	xmin: number; // oldest active transaction at snapshot time
	xmax: number; // next transaction ID to be assigned
	activeXids: number[]; // transactions in progress at snapshot time
}

function isVisible(row: MVCCRow, snapshot: Snapshot): boolean {
	// Row was created by a committed transaction before our snapshot
	const createdBeforeSnapshot = row.xmin < snapshot.xmax && !snapshot.activeXids.includes(row.xmin);

	// Row hasn't been deleted, OR was deleted by a transaction
	// that started after our snapshot (so we can still see it)
	const notDeleted =
		row.xmax === 0 || row.xmax >= snapshot.xmax || snapshot.activeXids.includes(row.xmax);

	return createdBeforeSnapshot && notDeleted;
}
```

<Callout type="info">

**This is why PostgreSQL needs VACUUM**: Old row versions aren't immediately removed — other transactions might still need them. VACUUM cleans up versions that no active transaction can see.

</Callout>

## Isolation Levels

SQL defines four isolation levels. Most databases default to Read Committed.

```typescript
// Read Committed (PostgreSQL default)
// Each STATEMENT sees the latest committed data
// Same query in same transaction can return different results

// Repeatable Read (MySQL InnoDB default)
// Transaction sees a snapshot from its START
// Same query always returns the same results

// Serializable
// Transactions behave AS IF they ran one at a time
// Database detects conflicts and aborts one transaction

// Example: lost update problem
// Account balance: $100
// TX1: read balance (100), add 50, write 150
// TX2: read balance (100), add 30, write 130
// Result: $130 (TX1's update is lost!)

// Read Committed: allows this
// Repeatable Read: depends on database
// Serializable: TX2 would be aborted and retried
```

## Write Conflicts

When two transactions try to update the same row:

```typescript
// PostgreSQL approach (first-updater-wins):
async function updateRow(txId: number, rowId: number, newData: Row): Promise<void> {
	const row = await findRow(rowId);

	if (row.xmax !== 0) {
		// Someone else already modified this row
		const otherTx = row.xmax;

		if (isCommitted(otherTx)) {
			// Other transaction committed — we see conflict
			if (isolationLevel === 'SERIALIZABLE') {
				throw new SerializationError('could not serialize access');
			}
			// Read Committed: re-read and retry
		} else if (isActive(otherTx)) {
			// Other transaction still running — wait for it
			await waitForTransaction(otherTx);
			// Then check again
		}
	}

	// Create new version
	row.xmax = txId; // mark old version as deleted by us
	await insertNewVersion({ ...newData, xmin: txId, xmax: 0 });
}
```

<Callout type="tip">

**Use Repeatable Read or Serializable** for any transaction that reads a value and then writes based on it (read-modify-write). Read Committed allows lost updates. If you get serialization errors, retry the transaction — that's the expected behavior.

</Callout>

## MVCC vs. Locking

|                        | MVCC            | Locking               |
| ---------------------- | --------------- | --------------------- |
| Readers block writers? | No              | Yes (shared locks)    |
| Writers block readers? | No              | Yes (exclusive locks) |
| Writers block writers? | Same row only   | Same row              |
| Dead row cleanup       | Needed (VACUUM) | Not needed            |
| Complexity             | Higher          | Lower                 |

## Key Takeaways

1. **MVCC keeps old row versions** so readers see a consistent snapshot without blocking writers
2. **Updates create new versions** — old versions are cleaned up by VACUUM (PostgreSQL) or purge thread (MySQL)
3. **Isolation level determines what you see** — Read Committed sees latest committed data per statement; Repeatable Read sees a snapshot from transaction start
4. **Serializable catches all anomalies** but requires retry logic for aborted transactions
