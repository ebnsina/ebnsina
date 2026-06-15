---
title: "Schema evolution"
subtitle: "Every schema change against live data is a deploy. The expand/contract pattern is how you change tables that have a million rows and a thousand concurrent writers without downtime."
chapter: 10
level: "advanced"
readingTime: "13 min"
topics: ["data-modeling", "migrations", "expand-contract", "zero-downtime"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A schema migration on a small dev database takes 50 milliseconds. The same migration against 100 million rows can take hours and lock the table for the duration. The difference between "ran my migration" and "operated my migration" is the difference between a junior and senior engineer.

This chapter is the patterns for changing a live schema without taking the app down: expand/contract, careful ALTERs, online indexes, and the boring discipline that makes it routine.

<Callout type="info">

**Real-World Analogy**

Renovating a house while people are still living in it — you can't just tear everything down and start over.

</Callout>

## What "live" means

Two assumptions for the rest of this chapter:

1. **The application is reading and writing to the database while the migration runs.** No "stop the world" maintenance window. Big enough projects can never afford one.
2. **The migration must be able to roll back.** If something breaks, you must be able to revert app code without re-running the migration backwards.

These two assumptions ban most "natural" schema changes:

- `DROP COLUMN` — old code might still be reading it.
- `ALTER COLUMN ... TYPE` — different binary format, possibly long table rewrite.
- `ADD COLUMN ... NOT NULL` — fails if the column has no default and the table has rows.
- `RENAME COLUMN` — old code is referencing the old name.

The fix: every change is a sequence of small, individually safe steps. **Expand → migrate → contract.**

## The expand/contract pattern

For any structural change, three phases:

**1. Expand.** Add the new shape *alongside* the old. Both work. Old code continues using the old; new code starts using the new.

**2. Migrate.** Backfill, dual-write, switch reads. The new shape is now the source of truth.

**3. Contract.** Remove the old shape. Old code is gone; old reads have been redirected.

Each phase is a separate deploy. Between phases, the system is always in a consistent state.

## Worked example: rename a column

Old:

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, full_name TEXT NOT NULL);
```

You want to rename `full_name` to `display_name`.

Naive: `ALTER TABLE users RENAME COLUMN full_name TO display_name`. Instant, but breaks every running query that references `full_name` until the new app version is deployed.

Expand/contract version:

```sql
-- Step 1 (deploy A): add new column, backfill, dual-write
ALTER TABLE users ADD COLUMN display_name TEXT;
UPDATE users SET display_name = full_name WHERE display_name IS NULL;
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
```

App code is updated to write to both columns:
```go
INSERT INTO users(full_name, display_name) VALUES($1, $1)
UPDATE users SET full_name = $1, display_name = $1 WHERE id = $2
```

Reads still come from `full_name`. Both columns stay synchronised.

```sql
-- Step 2 (deploy B): switch reads
```

App code is updated to read from `display_name`. `full_name` is now redundant; we keep the dual-write a bit longer in case of rollback.

```sql
-- Step 3 (deploy C): stop writing to old column
```

App code drops the dual-write. `full_name` is now unused.

```sql
-- Step 4 (deploy D): drop the column
ALTER TABLE users DROP COLUMN full_name;
```

Four deploys for one rename. Painful — but each step is reversible, and at no point does the app crash. For a feature that customers depend on, the slow approach is the only approach.

For lower-stakes systems, you can compress this to two deploys (expand + dual-write together; later contract + drop).

## ALTER TABLE locks

Every `ALTER TABLE` takes some kind of lock. Knowing which is critical:

| Operation | Lock level | Blocks |
|---|---|---|
| `ADD COLUMN` (no default) | ACCESS EXCLUSIVE | reads + writes |
| `ADD COLUMN ... DEFAULT` (constant) | ACCESS EXCLUSIVE | reads + writes — but Postgres 11+ does this as metadata only |
| `ADD COLUMN ... DEFAULT` (volatile) | ACCESS EXCLUSIVE + table rewrite | full lock for hours |
| `DROP COLUMN` | ACCESS EXCLUSIVE | brief — metadata only |
| `ALTER COLUMN ... SET NOT NULL` | ACCESS EXCLUSIVE | full table scan |
| `ALTER COLUMN ... TYPE` | ACCESS EXCLUSIVE + rewrite | hours on big tables |
| `CREATE INDEX` | SHARE | writes (reads work) |
| `CREATE INDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | nothing |
| `ADD CONSTRAINT FOREIGN KEY` | SHARE ROW EXCLUSIVE | writes briefly |
| `ADD CONSTRAINT ... NOT VALID` | ACCESS EXCLUSIVE briefly | writes briefly |

The two everyone needs to internalize:

1. **`CREATE INDEX CONCURRENTLY`** for index creation on big tables. Slower than the locking version, but doesn't block writes.
2. **`ADD CONSTRAINT ... NOT VALID`** then `VALIDATE CONSTRAINT` for adding constraints to big tables. The two-step pattern from chapter 6.

## Adding a column safely

```sql
-- BAD on big tables: forces a table rewrite to set defaults
ALTER TABLE big_table ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- GOOD: small, safe steps
ALTER TABLE big_table ADD COLUMN status TEXT;          -- instant (Postgres 11+)
UPDATE big_table SET status = 'pending' WHERE status IS NULL;  -- batched, see below
ALTER TABLE big_table ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE big_table ADD CONSTRAINT status_not_null CHECK (status IS NOT NULL) NOT VALID;
ALTER TABLE big_table VALIDATE CONSTRAINT status_not_null;
ALTER TABLE big_table ALTER COLUMN status SET NOT NULL;
ALTER TABLE big_table DROP CONSTRAINT status_not_null;
```

Postgres 11+ made `ADD COLUMN ... DEFAULT <constant>` near-instant — it stores the default as metadata, doesn't rewrite existing rows. Earlier versions need the multi-step dance always. Even on 11+, **avoid volatile defaults** like `DEFAULT now()` — those force a rewrite.

## Backfilling at scale

The naïve backfill is one SQL statement:

```sql
UPDATE big_table SET status = 'pending' WHERE status IS NULL;
```

For a 100M-row table this:

- Holds a row lock on every updated row.
- Generates ~100M WAL entries.
- Possibly triggers replication lag.
- Takes hours.

The better pattern: batch by primary key range, with sleeps and progress tracking.

```sql
DO $$
DECLARE
  batch_size INT := 10000;
  max_id BIGINT;
  cur BIGINT := 0;
BEGIN
  SELECT max(id) INTO max_id FROM big_table;
  WHILE cur < max_id LOOP
    UPDATE big_table SET status = 'pending'
    WHERE id > cur AND id <= cur + batch_size AND status IS NULL;
    cur := cur + batch_size;
    COMMIT;
    PERFORM pg_sleep(0.05);  -- breathe
  END LOOP;
END;
$$;
```

Or write the loop in application code so you can monitor and cancel:

```go
func backfill(ctx context.Context, db *sql.DB) error {
    var maxID int64
    db.QueryRow(`SELECT max(id) FROM big_table`).Scan(&maxID)

    const batch = 10000
    for cur := int64(0); cur <= maxID; cur += batch {
        _, err := db.ExecContext(ctx,
            `UPDATE big_table SET status = 'pending'
             WHERE id > $1 AND id <= $2 AND status IS NULL`,
            cur, cur+batch,
        )
        if err != nil { return err }
        time.Sleep(50 * time.Millisecond)
    }
    return nil
}
```

Backfills are jobs, not migrations. Run them outside the migration framework, with progress monitoring and the ability to pause.

## Adding a NOT NULL constraint to existing data

The classic mistake:

```sql
ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ NOT NULL;
-- ERROR: column "onboarded_at" of relation "users" contains null values
```

The safe sequence:

```sql
-- 1. add nullable
ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ;

-- 2. backfill (batched)
UPDATE users SET onboarded_at = created_at WHERE onboarded_at IS NULL;

-- 3. add as CHECK constraint NOT VALID (instant, applies to new writes)
ALTER TABLE users ADD CONSTRAINT users_onboarded_at_not_null
  CHECK (onboarded_at IS NOT NULL) NOT VALID;

-- 4. validate (slow but doesn't block writes)
ALTER TABLE users VALIDATE CONSTRAINT users_onboarded_at_not_null;

-- 5. promote to real NOT NULL (fast — uses the validated CHECK as proof)
ALTER TABLE users ALTER COLUMN onboarded_at SET NOT NULL;

-- 6. drop the redundant CHECK
ALTER TABLE users DROP CONSTRAINT users_onboarded_at_not_null;
```

In Postgres 12+, step 5 is fast because Postgres can skip the table scan when a valid CHECK constraint already proves NOT NULL.

## Indexes online

For any non-trivial index:

```sql
CREATE INDEX CONCURRENTLY ON big_table(some_column);
```

`CONCURRENTLY` builds the index without taking a write lock. Slower (multiple passes), but the table is read-write throughout.

Caveats:

- **Cannot run inside a transaction.** Migration tools must support out-of-transaction statements (most do; some require flagging).
- **Can fail mid-build.** If the build fails, you're left with an `INVALID` index that must be dropped manually:
  ```sql
  DROP INDEX CONCURRENTLY some_invalid_index;
  ```
- **Slower than the locking version.** Plan for hours on huge tables.

For unique indexes, also concurrent:

```sql
CREATE UNIQUE INDEX CONCURRENTLY ON users(email);
```

## Adding a foreign key

```sql
-- BAD: locks the referenced table briefly + scans the new FK column
ALTER TABLE orders ADD CONSTRAINT orders_user_fk
  FOREIGN KEY (user_id) REFERENCES users(id);

-- GOOD: NOT VALID first, then validate
ALTER TABLE orders ADD CONSTRAINT orders_user_fk
  FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_user_fk;
```

Same pattern as CHECKs. `NOT VALID` makes the FK apply to new writes immediately; `VALIDATE` checks existing rows in the background.

## Changing a column type

The most painful operation. `ALTER COLUMN ... TYPE` rewrites the table for most type changes.

Two strategies:

**A. Compatible cast (no rewrite).** Some changes are metadata-only:
- Increasing `VARCHAR(50)` to `VARCHAR(100)` — no rewrite.
- `INTEGER` to `BIGINT` — rewrite (different size).
- Changing `TEXT` ↔ `VARCHAR` — no rewrite (both stored the same way).

**B. New column, dual-write, switch.** For incompatible types:

```sql
-- 1. add new column
ALTER TABLE invoices ADD COLUMN amount_cents_v2 BIGINT;

-- 2. backfill (batched)
UPDATE invoices SET amount_cents_v2 = (amount_dollars * 100)::bigint;

-- 3. dual-write in app code

-- 4. switch reads to new column

-- 5. eventually drop old column
ALTER TABLE invoices DROP COLUMN amount_dollars;
ALTER TABLE invoices RENAME COLUMN amount_cents_v2 TO amount_cents;
```

The expand/contract dance again.

## Migration tooling

Three categories.

**Source-of-truth migration tools.** `golang-migrate`, `flyway`, `dbmate`, `sqitch`. Each migration is a numbered file. Tool tracks which have run.

```
migrations/
  001_create_users.up.sql
  001_create_users.down.sql
  002_add_email_unique.up.sql
  002_add_email_unique.down.sql
```

Pros: simple, language-agnostic, easy to review.
Cons: no schema diffing — you write each migration by hand.

**Schema-as-code tools.** `atlas`, `prisma migrate`, `liquibase`. Define the desired schema; tool generates the migration to get there.

Pros: less repetitive for simple changes.
Cons: generated migrations need careful review (especially for big-table changes — auto-generated `ALTER TABLE ... TYPE` will break).

**ORM-managed migrations.** Active Record, Django migrations, Sequelize, GORM. Migrations live with the model code.

Pros: tight coupling with the ORM model.
Cons: ORM-flavored migrations sometimes hide what's actually running, which is dangerous on big tables.

For a self-hosted backend, **`golang-migrate` or `dbmate` with hand-written SQL** is the boring, correct choice. You see exactly what runs against the DB.

## Deploy alongside the migration

Three patterns for sequencing migrations and deploys.

**Migration before deploy.** New schema is in place when the new app comes up. Required when the new schema is *required* by the new code (e.g., the new code reads a column that didn't exist).

**Deploy before migration.** New app code can handle both old and new schemas. Migration runs after, the code adapts. Required for some expand/contract phases.

**Migration with deploy (interleaved).** Some teams orchestrate this — migration A, deploy A, migration B, deploy B. The full expand/contract dance.

In practice, multi-step deploys for big schema changes is the right rhythm. Trying to do "migration + deploy + cleanup" in one shot is how outages happen.

<Callout type="warn">

**Always test the migration on a copy of production data.** A migration that takes 50ms in dev with 100 rows takes 4 hours in prod with 100M rows. The lock contention is also different. A staging environment with a recent prod restore is non-negotiable for any schema change against a busy table.

</Callout>

## Rollback strategy

A well-designed migration should be reversible — you write the `down` migration too. But in practice:

- **Some migrations cannot be reversed without data loss.** Dropping a column means the data is gone. The "down" migration recreates the column structurally, but the data isn't coming back without a backup.
- **Reverting an already-deployed change is risky.** App code may have started writing the new shape. Reverting reverts the schema; the app crashes.

Practical rollback strategy: **don't roll back; roll forward.** If a migration breaks production, write a new migration to fix it. This is faster, safer, and forces you to keep moving.

Reserve down migrations for the case "I haven't deployed yet; I want to undo on staging."

## Recap

- Expand → migrate → contract. Three phases, each safe by itself.
- Most renames take 4 deploys. Worth it for live systems.
- Know lock levels: `CREATE INDEX CONCURRENTLY`, `NOT VALID` constraints.
- Adding a column: nullable + backfill + NOT NULL via CHECK + promotion.
- Backfills are jobs, not migrations. Batch by ID range, sleep, monitor.
- `CREATE INDEX CONCURRENTLY` for big tables; can fail and leave INVALID indexes.
- FKs: `NOT VALID` then `VALIDATE`.
- Type changes: usually new column + dual-write + switch.
- Tooling: prefer hand-written SQL migrations (`golang-migrate`, `dbmate`); review auto-generated migrations carefully.
- Test against prod-sized data on a staging restore.
- Roll forward, not back.

That is the full Backend Engineering Path's data modeling track. Next topic in the path: [Auth & security](/notes/auth-security) — sessions, password hashing, OAuth flows, and rate-limiting patterns done by hand.

