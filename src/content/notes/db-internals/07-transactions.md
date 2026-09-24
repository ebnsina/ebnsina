---
title: 'Transactions & ACID'
subtitle: 'Atomicity, Consistency, Isolation, Durability — যে গ্যারান্টিগুলো ডেটাবেজকে নির্ভরযোগ্য করে আর কীভাবে সেগুলো implement করা হয়।'
chapter: 7
level: 'intermediate'
readingTime: '14 মিনিট'
topics: ['ACID', 'transactions', 'atomicity', 'isolation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বাজারের হুন্ডি কাউন্টারে সিনা এসেছে — খোয়ারিজমির কাছে টাকা পাঠাবে। কেরানি খাতা খুলে দুটো কাজ করে: সিনার হিসাব থেকে টাকা কাটে, আর খোয়ারিজমির হিসাবে সেই টাকা যোগ করে। এই দুটো কাজ একসাথেই হতে হবে। ধরুন সিনার টাকা কাটার পর হঠাৎ দেখা গেল খোয়ারিজমির লাইন ঠিক নেই বা যোগ করা গেল না — তখন কেরানি সিনার কাটা টাকাটাও ফেরত বসিয়ে দেয়, যেন কিছুই হয়নি। হয় দুটোই হবে, নয়তো একটাও না। মাঝপথে টাকা কোথাও উবে যেতে পারে না।

কাউন্টারে সেদিন ভিড়। একই সময়ে আরেক কেরানি ফাতিমার আরেকটা লেনদেন সামলাচ্ছে। দুজন কেরানি পাশাপাশি কাজ করলেও একজনের অর্ধেক-লেখা হিসাব আরেকজনের খাতায় ঢুকে যায় না — প্রত্যেকের হিসাব আলাদা করে সামলানো হয়, তাই ব্যালেন্স গুলিয়ে যায় না। আর যেই মুহূর্তে কেরানি রসিদে "সম্পন্ন" সিল মেরে দেয়, লেনদেন পাকা — এরপর কারেন্ট চলে গেলেও, খাতা হারিয়ে গেলেও ওই সিল-মারা রসিদ প্রমাণ থেকে যায়।

এই গল্পটাই আসলে **transaction** আর **ACID**। সিনার কাটা আর খোয়ারিজমির যোগ একসাথে হওয়া বা পুরোটা rollback হওয়া — এটাই **atomicity**। খাতায় কখনো টাকা উবে যাওয়া বা দ্বিগুণ হয়ে যাওয়া না দেখানো — **consistency**। দুই কেরানির লেনদেন একে অন্যকে ঘেঁটে না দেওয়া — **isolation**। সিল মারার পর কারেন্ট গেলেও রসিদ টিকে থাকা — **durability**। ব্যাংকের এক অ্যাকাউন্ট থেকে আরেক অ্যাকাউন্টে টাকা পাঠানো বা bKash-এ send money — সব ঠিক এই গ্যারান্টিগুলোর উপরেই দাঁড়িয়ে আছে।

## ACID মানে কী

ACID কোনো feature নয় যেটা আপনি on করেন — এটা চারটা property যা একসাথে ডেটাবেজের নির্ভরযোগ্যতা গ্যারান্টি করে:

```typescript
// Atomicity: all or nothing
// If a transaction has 5 operations and #3 fails,
// operations #1 and #2 are rolled back. No partial changes.

// Consistency: data stays valid
// Constraints (NOT NULL, UNIQUE, FOREIGN KEY, CHECK) are enforced.
// The database moves from one valid state to another.

// Isolation: transactions don't interfere
// Concurrent transactions behave as if they ran sequentially.
// (The isolation LEVEL determines how strictly this is enforced.)

// Durability: committed data survives crashes
// Once COMMIT returns, the data is on disk (WAL + fsync).
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

যেমন একটা bank wire transfer — আপনি যখন $500 পাঠান, হয় আপনার balance কমে যায় এবং receiver-এর balance বাড়ে, নয়তো কোনোটাই ঘটে না। এমন কোনো মাঝামাঝি state নেই যেখানে টাকা উবে যায়। এটাই ACID: সব অথবা কিছুই না।

</Callout>

## Atomicity: Rollback কীভাবে কাজ করে

```typescript
class Transaction {
	private undoLog: UndoRecord[] = [];
	private state: 'active' | 'committed' | 'aborted' = 'active';

	async execute(operation: Operation): Promise<void> {
		// Save undo information before making changes
		const undoRecord = {
			operation: operation.inverse(),
			pageId: operation.pageId,
			beforeImage: await readPage(operation.pageId)
		};
		this.undoLog.push(undoRecord);

		// Apply the change
		await operation.apply();
	}

	async commit(): Promise<void> {
		// Write COMMIT record to WAL
		await wal.append({ type: 'COMMIT', txId: this.id });
		await wal.flush(); // fsync — now it's durable
		this.state = 'committed';
		// Undo log can be discarded
	}

	async rollback(): Promise<void> {
		// Apply undo records in reverse order
		for (const record of this.undoLog.reverse()) {
			await record.operation.apply();
		}
		await wal.append({ type: 'ABORT', txId: this.id });
		this.state = 'aborted';
	}
}
```

## Savepoints

Savepoint আপনাকে একটা transaction-এর মধ্যেই আংশিকভাবে roll back করতে দেয়:

```sql
BEGIN;
INSERT INTO orders (user_id, total) VALUES (1, 100.00);
SAVEPOINT sp1;

INSERT INTO order_items (order_id, product_id) VALUES (1, 999);
-- Oops, product 999 doesn't exist
ROLLBACK TO sp1;

-- The order INSERT is still intact
INSERT INTO order_items (order_id, product_id) VALUES (1, 42);
COMMIT;
```

```typescript
// Implementation: savepoints mark a position in the undo log
class Transaction {
	private savepoints = new Map<string, number>();

	savepoint(name: string): void {
		this.savepoints.set(name, this.undoLog.length);
	}

	rollbackTo(name: string): void {
		const position = this.savepoints.get(name)!;
		// Undo everything after the savepoint
		while (this.undoLog.length > position) {
			const record = this.undoLog.pop()!;
			record.operation.apply();
		}
	}
}
```

## Distributed Transactions: Two-Phase Commit

যখন একটা transaction একাধিক ডেটাবেজ বা service জুড়ে বিস্তৃত হয়:

```typescript
// Phase 1: PREPARE — ask all participants if they can commit
async function prepare(participants: Database[]): Promise<boolean> {
	const votes = await Promise.all(participants.map((p) => p.prepare(transactionId)));
	return votes.every((v) => v === 'YES');
}

// Phase 2: COMMIT or ABORT
async function complete(participants: Database[], allReady: boolean): Promise<void> {
	if (allReady) {
		// Everyone said YES → commit everywhere
		await Promise.all(participants.map((p) => p.commit(transactionId)));
	} else {
		// Someone said NO → abort everywhere
		await Promise.all(participants.map((p) => p.abort(transactionId)));
	}
}
```

<Callout type="warning">

**Two-phase commit একটা blocking protocol।** PREPARE-এর পর কিন্তু COMMIT/ABORT-এর আগে coordinator যদি crash করে, সব participant lock ধরে আটকে থাকে। এই কারণেই microservice-এ distributed transaction এড়িয়ে চলা হয় — এর বদলে saga বা eventual consistency ব্যবহার করুন।

</Callout>

## সাধারণ Transaction Pitfall

```sql
-- 1. Long-running transactions hold locks and block VACUUM
BEGIN;
-- ... do work for 30 minutes ...
COMMIT; -- BAD: holds resources for too long

-- 2. SELECT FOR UPDATE when you mean to modify
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
-- This locks the row — other transactions wait
UPDATE accounts SET balance = balance - 100 WHERE id = 1;

-- 3. Implicit transactions in ORMs
-- Some ORMs wrap every query in a transaction
-- Understand what your ORM does!
```

<Callout type="tip">

**Transaction ছোট রাখুন।** দীর্ঘ transaction lock ধরে রাখে, VACUUM-কে dead row পরিষ্কার করতে বাধা দেয়, আর conflict-এর সম্ভাবনা বাড়ায়। আপনার সব read আর computation transaction-এর বাইরে করুন, তারপর আসল write-এর জন্য একটা ছোট transaction ব্যবহার করুন।

</Callout>

## মূল কথাগুলো

1. **Atomicity undo log ব্যবহার করে** — rollback-এ, সব change ক্রম অনুসারে উল্টে দেয়
2. **Durability WAL ব্যবহার করে** — COMMIT return করার আগে একটা durable log record লেখে
3. **Savepoint একটা transaction-এর মধ্যে আংশিক rollback করতে দেয়**
4. **Distributed transaction (2PC) blocking** — cross-service operation-এর জন্য saga পছন্দ করুন
5. **Transaction ছোট রাখুন** যাতে lock contention আর VACUUM-এর প্রভাব কমে
