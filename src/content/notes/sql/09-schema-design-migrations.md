---
title: "Schema Design & Migrations"
subtitle: "Constraints, normalization, generated columns, and the expand/contract pattern for zero-downtime change."
chapter: 9
level: "mastery"
readingTime: "18 min"
topics: ["schema", "constraints", "migrations"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Schema Is Your Contract

The schema is the most expensive thing to get wrong, because everything downstream — queries, application code, integrations — depends on it, and data accumulates inside it. A well-designed schema makes invalid states *impossible to represent*; a poor one lets bad data creep in and forces every reader to defend against it. This chapter is about designing schemas that enforce their own invariants, and changing them without breaking production.

## Constraints: Push Rules into the Database

Constraints let the database reject invalid data regardless of which application or script writes it. Defending data integrity in application code alone is hopeless — there's always another writer.

```sql
CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers (id),
  status      text   NOT NULL DEFAULT 'pending',
  amount      numeric(12, 2) NOT NULL CHECK (amount >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, created_at)
);
```

The constraint types:

- **`PRIMARY KEY`** — the unique, non-null identifier for each row. Every table should have one. Prefer a surrogate key (an `IDENTITY` integer or `uuid`) unless a natural key is truly stable.
- **`FOREIGN KEY`** (`REFERENCES`) — guarantees `customer_id` points at a real `customers` row, preventing orphans. Choose `ON DELETE` behavior deliberately: `RESTRICT` (block), `CASCADE` (delete children too), or `SET NULL`.
- **`UNIQUE`** — forbids duplicate values (single column or a combination).
- **`CHECK`** — an arbitrary boolean rule, like `amount >= 0` or `status IN ('pending','shipped','cancelled')`.
- **`NOT NULL`** — the most underused constraint; if a value is always required, say so, and eliminate a whole class of null-handling bugs.

<Callout type="tip">

**A constraint is documentation that can't lie.** `CHECK (status IN ('pending','shipped','cancelled'))` tells every future developer the exact set of valid statuses *and* enforces it. Comments drift out of date; constraints can't. Encode every invariant you can express.

</Callout>

## Normalization in Practice

Normalization organizes data to eliminate redundancy, so each fact lives in exactly one place. You don't need to memorize the formal normal forms to apply the practical core:

- **1NF** — each column holds a single atomic value; no comma-separated lists or repeating groups stuffed into one field.
- **2NF / 3NF** — every non-key column depends on *the whole key, and nothing but the key*. In plain terms: don't store a customer's name and address on every order row — store `customer_id` and keep the name in `customers`. Otherwise updating an address means updating thousands of order rows, and they'll inevitably disagree (an *update anomaly*).

The payoff is consistency: one source of truth per fact. The cost is more joins at read time. As chapter 8 covered, you **denormalize back** only where a measured read bottleneck justifies it — normalize first, denormalize as a deliberate, measured exception.

A quick smell test: if updating one real-world fact requires changing many rows, you're under-normalized. If answering a common question requires joining six tables every time, you may be over-normalized for that access pattern.

## Generated Columns

A **generated column** is computed from other columns in the same row and stored automatically — you never write to it, and it can never drift:

```sql
CREATE TABLE line_items (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quantity  integer NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  total     numeric(12, 2)
            GENERATED ALWAYS AS (quantity * unit_price) STORED
);
```

`total` is always exactly `quantity * unit_price` — the database recomputes it on every write, so it's impossible to get out of sync the way a denormalized column maintained in app code would. You can even index a generated column. (PostgreSQL currently supports `STORED` generated columns; the value is physically stored, not computed on read.)

## Evolving Schemas Safely

Schemas must change as requirements do — but a live system means data exists and traffic is flowing. The core tool is a **migration**: a versioned, ordered script that transforms the schema, checked into source control and run by a migration tool (Flyway, Alembic, Prisma Migrate, golang-migrate, and so on).

Principles for safe migrations:

- **Each migration is small, ordered, and forward-only in spirit.** Many tools support a `down`/rollback, but rolling *forward* with a fix is usually safer than rolling back once data has changed under the new schema.
- **Migrations are code review artifacts.** Review the SQL, not just the application diff. A careless `ALTER` can lock a table for minutes.
- **Separate schema changes from data backfills.** A migration that both alters structure *and* rewrites millions of rows holds locks far too long.

<Callout type="warning">

**Some DDL takes table-level locks.** In PostgreSQL, operations like adding a `NOT NULL` column with a non-constant default (on older versions), changing a column type, or adding a foreign key can take an `ACCESS EXCLUSIVE` lock that blocks *all* reads and writes while it runs. On a large, busy table that's an outage. Always check whether a migration locks, and for how long — and use `CREATE INDEX CONCURRENTLY` to build indexes without blocking writes.

</Callout>

## Zero-Downtime Migrations: Expand / Contract

The safe way to make a *breaking* change while old and new application code run simultaneously (as they do during a rolling deploy) is the **expand/contract** pattern — also called parallel change. It has three phases:

1. **Expand.** Add the new structure *additively and backward-compatibly*. Old code keeps working because nothing it relies on was removed. Add a new nullable column, a new table, a new index (concurrently).
2. **Migrate & dual-write.** Backfill existing rows in batches, and update application code to write *both* the old and new shapes. Deploy this code; now every write keeps both in sync. Switch reads over to the new shape once the backfill is verified complete.
3. **Contract.** Once no running code reads or writes the old structure, remove it — drop the old column, the old table, the compatibility shims.

Concretely, renaming a column `email` to `email_address` without downtime:

```sql
-- Phase 1 (Expand): add the new column, nullable, no default rewrite
ALTER TABLE users ADD COLUMN email_address text;

-- Phase 2 (Migrate): backfill in batches, app writes BOTH columns
UPDATE users SET email_address = email
WHERE email_address IS NULL AND id BETWEEN 1 AND 10000;   -- repeat in chunks

-- ...deploy app that reads email_address, writes both...
-- ...add NOT NULL once backfill complete (validate separately)...

-- Phase 3 (Contract): once nothing uses the old column
ALTER TABLE users DROP COLUMN email;
```

The key insight: **never do a breaking change in a single step** while code is deployed in a rolling fashion. At every moment, the currently-running mix of old and new application versions must find the schema in a state it understands. Expand/contract guarantees that by overlapping the old and new shapes for the duration of the transition.

<Callout type="info">

**Adding a `NOT NULL` column safely takes two steps.** Add it nullable (or with a constant default — modern Postgres makes that instant via metadata), backfill values, then add the `NOT NULL` constraint with `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` followed by `VALIDATE CONSTRAINT`, which scans without holding a blocking lock. The same `NOT VALID` then `VALIDATE` two-step makes adding foreign keys to large tables non-blocking.

</Callout>

## A Schema Design Checklist

- Every table has a primary key.
- Foreign keys enforce every real relationship, with a deliberate `ON DELETE` rule.
- Required columns are `NOT NULL`; enumerated values are guarded by `CHECK` or a lookup table.
- Derived values are generated columns or maintained by triggers, not hand-synced.
- Each fact lives in one place (normalized), with denormalization only where measured reads demand it.
- Every schema change ships as a reviewed migration, designed to be non-blocking, using expand/contract for anything breaking.

## Recap

A good schema enforces its own invariants through constraints, stores each fact once through normalization, and computes derived values with generated columns. Evolve it through small, reviewed, lock-aware migrations — and make breaking changes safe with the expand/contract pattern, overlapping old and new shapes so every running version always finds a schema it understands. That completes the track: you can now write, optimize, and safely evolve real relational systems. Revisit the db-internals and data-modeling tracks to go deeper on the machinery and the modeling craft underneath.
