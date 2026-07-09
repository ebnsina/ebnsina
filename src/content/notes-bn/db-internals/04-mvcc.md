---
title: 'MVCC — Multi-Version Concurrency Control'
subtitle: 'ডেটাবেজ কীভাবে reader আর writer-কে block ছাড়াই একসাথে কাজ করতে দেয় — snapshots, visibility rules, আর isolation levels।'
chapter: 4
level: 'intermediate'
readingTime: '17 মিনিট'
topics: ['MVCC', 'transactions', 'isolation levels', 'snapshots']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Concurrency সমস্যা

Concurrency control ছাড়া, একই row modify করা দুইটা transaction ডেটা নষ্ট করে ফেলতে পারে। সবকিছু lock করলে কাজ হয় কিন্তু performance মেরে ফেলে — reader writer-কে block করে আর উল্টোটাও।

**MVCC** এটা সমাধান করে প্রতিটা row-র একাধিক version রেখে। Reader একটা consistent snapshot দেখে, writer-কে block না করেই।

<Callout type="info">

**বাস্তব জীবনের উপমা**

যেমন review-তে থাকা একটা document — কেউ যখন একটা shared document এডিট করছে, অন্যরা তখনও শেষ save করা version দেখে। নতুন version শুধু তখনই দৃশ্যমান হয় যখন এডিট পুরোপুরি save হয়ে যায়, তাই কেউ অর্ধেক-লেখা content দেখে না।

</Callout>

## MVCC কীভাবে কাজ করে

প্রতিটা row-র লুকানো metadata থাকে যা track করে কোন transaction এটা তৈরি আর delete করেছে:

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

প্রতিটা transaction একটা **snapshot** পায় — একটা জমাট view যে কোন কোন transaction ওটা শুরু হওয়ার সময় committed ছিল।

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

**এই কারণেই PostgreSQL-এর VACUUM লাগে**: পুরনো row version সাথে সাথে সরানো হয় না — অন্য transaction-এর এখনও এগুলো দরকার হতে পারে। VACUUM সেই version-গুলো পরিষ্কার করে যেগুলো কোনো active transaction আর দেখতে পায় না।

</Callout>

## Isolation Levels

SQL চারটা isolation level সংজ্ঞায়িত করে। বেশিরভাগ ডেটাবেজ default হিসেবে Read Committed ব্যবহার করে।

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

যখন দুইটা transaction একই row update করার চেষ্টা করে:

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

**Repeatable Read বা Serializable ব্যবহার করুন** এমন যেকোনো transaction-এর জন্য যা একটা value পড়ে তারপর সেটার উপর ভিত্তি করে write করে (read-modify-write)। Read Committed lost update-কে অনুমতি দেয়। serialization error পেলে, transaction retry করুন — এটাই প্রত্যাশিত আচরণ।

</Callout>

## MVCC vs. Locking

|                             | MVCC          | Locking                 |
| --------------------------- | ------------- | ----------------------- |
| Reader writer-কে block করে? | না            | হ্যাঁ (shared locks)    |
| Writer reader-কে block করে? | না            | হ্যাঁ (exclusive locks) |
| Writer writer-কে block করে? | শুধু একই row  | একই row                 |
| Dead row cleanup            | লাগে (VACUUM) | লাগে না                 |
| জটিলতা                      | বেশি          | কম                      |

## মূল কথাগুলো

1. **MVCC পুরনো row version রাখে** যাতে reader writer-কে block না করেই একটা consistent snapshot দেখে
2. **Update নতুন version তৈরি করে** — পুরনো version পরিষ্কার হয় VACUUM (PostgreSQL) বা purge thread (MySQL) দিয়ে
3. **Isolation level নির্ধারণ করে আপনি কী দেখবেন** — Read Committed প্রতি statement-এ সর্বশেষ committed ডেটা দেখে; Repeatable Read transaction শুরুর একটা snapshot দেখে
4. **Serializable সব anomaly ধরে ফেলে** কিন্তু abort হওয়া transaction-এর জন্য retry logic লাগে
