---
title: "Transactions & Isolation Levels"
subtitle: "ACID, the four isolation levels, MVCC, and the locks and deadlocks that keep concurrent writes correct."
chapter: 6
level: "advanced"
readingTime: "18 min"
topics: ["acid", "isolation", "mvcc", "locking"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What a Transaction Is

A **transaction** groups several statements into one all-or-nothing unit. The canonical example is a bank transfer: debit one account, credit another. If the system crashes between the two, you must *not* end up with money debited but never credited. A transaction guarantees both happen or neither does.

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;     -- both changes become permanent together
```

If anything goes wrong before `COMMIT`, you `ROLLBACK` and the database is as if nothing happened:

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  -- ...check fails, abort...
ROLLBACK;   -- the debit is undone
```

## ACID

Transactions provide four guarantees, abbreviated **ACID**:

- **Atomicity** — all statements commit together or none do. No partial transactions.
- **Consistency** — a transaction moves the database from one valid state to another; constraints (foreign keys, checks) are never left violated.
- **Isolation** — concurrent transactions don't step on each other; each runs *as if* it had the database to itself (the degree of this is the *isolation level*).
- **Durability** — once `COMMIT` returns, the data survives crashes and power loss (Postgres achieves this with a write-ahead log, covered in db-internals).

Isolation is the subtle one, because perfect isolation (every transaction truly serial) is expensive. SQL defines weaker levels that trade some isolation for concurrency.

## Concurrency Anomalies

Weaker isolation permits specific *anomalies* — surprising results caused by interleaving transactions. The SQL standard names three:

- **Dirty read** — you read a row another transaction has modified but *not yet committed*. If that transaction rolls back, you acted on data that never officially existed.
- **Non-repeatable read** — you read a row, another transaction commits an *update* to it, you read it again in the *same* transaction and get a different value.
- **Phantom read** — you run a query (`WHERE status = 'pending'`), another transaction *inserts* a new matching row and commits, you re-run the query and a new "phantom" row appears.

A fourth, **lost update**, occurs when two transactions read a value, both modify it, and the second overwrites the first's change.

## The Four Isolation Levels

Each level *forbids* progressively more anomalies. From weakest to strongest:

| Level              | Dirty read | Non-repeatable read | Phantom read |
|--------------------|-----------|---------------------|--------------|
| `READ UNCOMMITTED` | possible* | possible            | possible     |
| `READ COMMITTED`   | no        | possible            | possible     |
| `REPEATABLE READ`  | no        | no                  | possible**   |
| `SERIALIZABLE`     | no        | no                  | no           |

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
  -- ...
COMMIT;
```

A few PostgreSQL-specific notes (marked above):

- *Postgres has no true `READ UNCOMMITTED` — it treats it as `READ COMMITTED`, so dirty reads never happen at all.
- **At `REPEATABLE READ`, Postgres's MVCC implementation actually *also* prevents phantom reads (it gives you a stable snapshot), so it's stronger than the standard requires.
- `READ COMMITTED` is the **default**, and a fine choice for most applications.
- `SERIALIZABLE` in Postgres uses Serializable Snapshot Isolation (SSI): it lets transactions run concurrently but aborts one with a serialization error if their combination *could not* have happened in some serial order. You must be ready to retry.

<Callout type="info">

**`READ COMMITTED` means each statement sees a fresh snapshot.** Within one transaction at this level, two identical `SELECT`s can return different data if another transaction committed in between. If you need a consistent view across multiple statements (a report, a multi-step calculation), use `REPEATABLE READ` so the whole transaction sees one frozen snapshot.

</Callout>

## MVCC: How Postgres Avoids Read Locks

PostgreSQL implements isolation with **MVCC** — Multi-Version Concurrency Control. Instead of locking rows for reads, it keeps *multiple versions* of each row. An `UPDATE` doesn't overwrite in place; it writes a new row version and marks the old one as expired. Each transaction sees the version that was current as of its snapshot.

The headline benefit: **readers never block writers, and writers never block readers.** A long analytics query sees a consistent snapshot while writes continue around it. The cost is *bloat* — dead row versions accumulate and must be cleaned up by the `VACUUM` process (autovacuum runs automatically, but heavily-updated tables need attention).

```text
Time →
  T1: BEGIN (snapshot taken) ... SELECT balance  → sees 100 (old version)
  T2:        UPDATE balance=150; COMMIT          → writes new version
  T1: SELECT balance again (REPEATABLE READ)     → still sees 100
```

## Locks for Writes

Reads use MVCC, but *writes* still need locks to prevent two transactions from modifying the same row simultaneously. When you `UPDATE` or `DELETE` a row, Postgres takes a **row-level lock**; a second transaction trying to write the same row *waits* until the first commits or rolls back.

You can lock rows explicitly to coordinate read-modify-write sequences and avoid lost updates:

```sql
BEGIN;
  SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;  -- lock the row
  -- compute new balance in app code...
  UPDATE accounts SET balance = :new WHERE id = 1;
COMMIT;
```

`FOR UPDATE` blocks other writers (and other `FOR UPDATE` readers) on that row until you commit, serializing the critical section. `FOR SHARE` is a weaker, shared lock.

<Callout type="tip">

**Prefer letting the database compute, when you can.** `UPDATE accounts SET balance = balance - 100 WHERE id = 1` is atomic at the row level and avoids the read-then-write race entirely — no explicit lock needed. Reach for `FOR UPDATE` only when the new value depends on logic that must live in application code.

</Callout>

## Deadlocks

A **deadlock** happens when two transactions each hold a lock the other needs, forming a cycle:

```text
T1: locks row A ... wants row B
T2: locks row B ... wants row A
   → neither can proceed
```

Postgres detects deadlocks automatically and kills one transaction with a `deadlock detected` error so the other can continue. The victim must retry. To *prevent* deadlocks:

- **Acquire locks in a consistent order.** If every transaction locks rows in ascending id order, no cycle can form.
- **Keep transactions short.** The less time a transaction holds locks, the smaller the window for conflict.
- **Touch fewer rows, and lock late.** Do read-only work first, take write locks as close to `COMMIT` as possible.

<Callout type="warning">

**Always be prepared to retry.** Both `SERIALIZABLE` serialization failures and deadlock victims surface as errors your application must catch and retry. Wrap transaction logic in a retry loop with a small backoff. Code that assumes a transaction always succeeds on the first try will fail intermittently under load.

</Callout>

## Practical Guidance

- Start with the default `READ COMMITTED`; move to `REPEATABLE READ` when a transaction needs a stable multi-statement view, and `SERIALIZABLE` when correctness under concurrency is paramount and you've added retries.
- Keep transactions as short as possible — never hold one open across a network call or user think-time.
- Never leave a `BEGIN` without a matching `COMMIT`/`ROLLBACK`; an idle-in-transaction connection holds locks and blocks `VACUUM`.

## Recap

Transactions give you ACID: atomic, consistent, isolated, durable units of work. Isolation levels trade concurrency for protection against dirty, non-repeatable, and phantom reads. Postgres uses MVCC so reads never block writes, takes row locks for writes, and detects deadlocks — leaving you to acquire locks in order, keep transactions short, and retry on conflict. Next we add analytical power with window functions.
