---
title: "Transactions & ACID"
subtitle: "Atomicity, Consistency, Isolation, Durability — the guarantees that make databases reliable and how they're implemented."
chapter: 7
level: "intermediate"
readingTime: "14 min"
topics: ["ACID", "transactions", "atomicity", "isolation"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What ACID Means

ACID isn't a feature you turn on — it's four properties that together guarantee database reliability:

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

**Real-World Analogy**

Like a bank wire transfer — when you send $500, either your balance decreases AND the receiver's balance increases, or neither happens. No in-between state where money disappears. That's ACID: all or nothing.

</Callout>

## Atomicity: How Rollback Works

```typescript
class Transaction {
  private undoLog: UndoRecord[] = [];
  private state: "active" | "committed" | "aborted" = "active";

  async execute(operation: Operation): Promise<void> {
    // Save undo information before making changes
    const undoRecord = {
      operation: operation.inverse(),
      pageId: operation.pageId,
      beforeImage: await readPage(operation.pageId),
    };
    this.undoLog.push(undoRecord);

    // Apply the change
    await operation.apply();
  }

  async commit(): Promise<void> {
    // Write COMMIT record to WAL
    await wal.append({ type: "COMMIT", txId: this.id });
    await wal.flush(); // fsync — now it's durable
    this.state = "committed";
    // Undo log can be discarded
  }

  async rollback(): Promise<void> {
    // Apply undo records in reverse order
    for (const record of this.undoLog.reverse()) {
      await record.operation.apply();
    }
    await wal.append({ type: "ABORT", txId: this.id });
    this.state = "aborted";
  }
}
```

## Savepoints

Savepoints let you partially roll back within a transaction:

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

When a transaction spans multiple databases or services:

```typescript
// Phase 1: PREPARE — ask all participants if they can commit
async function prepare(participants: Database[]): Promise<boolean> {
  const votes = await Promise.all(
    participants.map(p => p.prepare(transactionId))
  );
  return votes.every(v => v === "YES");
}

// Phase 2: COMMIT or ABORT
async function complete(participants: Database[], allReady: boolean): Promise<void> {
  if (allReady) {
    // Everyone said YES → commit everywhere
    await Promise.all(participants.map(p => p.commit(transactionId)));
  } else {
    // Someone said NO → abort everywhere
    await Promise.all(participants.map(p => p.abort(transactionId)));
  }
}
```

<Callout type="warning">

**Two-phase commit is a blocking protocol.** If the coordinator crashes after PREPARE but before COMMIT/ABORT, all participants are stuck holding locks. This is why distributed transactions are avoided in microservices — use sagas or eventual consistency instead.

</Callout>

## Common Transaction Pitfalls

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

**Keep transactions short.** Long transactions hold locks, prevent VACUUM from cleaning dead rows, and increase the chance of conflicts. Do all your reads and computation outside the transaction, then use a short transaction for the actual writes.

</Callout>

## Key Takeaways

1. **Atomicity uses undo logs** — on rollback, reverse all changes in order
2. **Durability uses WAL** — COMMIT writes a durable log record before returning
3. **Savepoints enable partial rollbacks** within a transaction
4. **Distributed transactions (2PC) are blocking** — prefer sagas for cross-service operations
5. **Keep transactions short** to minimize lock contention and VACUUM impact

