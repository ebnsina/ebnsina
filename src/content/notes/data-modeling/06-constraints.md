---
title: 'Constraints'
subtitle: 'The schema is your last line of defense against application bugs. Constraints encode the rules that should always be true — Postgres enforces them whether your app remembers to or not.'
chapter: 6
level: 'intermediate'
readingTime: '12 min'
topics: ['data-modeling', 'constraints', 'foreign-keys', 'check', 'unique']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A constraint is a promise the database makes about the data it accepts. Promises that hold across every code path, every microservice, every developer who joined last week. Promises that hold even when somebody runs a one-off SQL update at 2 AM.

Most data quality bugs can be traced to a missing constraint. This chapter is the toolkit.

<Callout type="info">

**Real-World Analogy**

A form that won't submit without a valid email — the database enforces rules so application code doesn't have to.

</Callout>

## The six constraint types

```
NOT NULL    — column must have a value
UNIQUE      — values across rows are unique
PRIMARY KEY — both NOT NULL and UNIQUE, plus indexed
FOREIGN KEY — value must reference an existing row in another table
CHECK       — value must satisfy an expression
EXCLUDE     — values across rows must not overlap (e.g. time ranges)
```

Postgres also has GENERATED columns (chapter 4), which aren't strictly constraints but enforce a similar invariant.

## NOT NULL — the cheapest insurance

```sql
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  email       CITEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Default to NOT NULL on every column. Only allow NULL when "no value yet" or "not applicable" is a meaningful state.

The discipline: when adding a nullable column, ask _what does NULL mean here?_ If the answer is "I don't know, it's just optional", make it NOT NULL with a sensible default.

A few common cases where NULL is right:

- **`deleted_at`**: NULL means "not deleted." (Chapter 7.)
- **`accepted_at`** on an invitation: NULL means "still pending."
- **`canceled_at`** on a subscription: NULL means "active."

Three values become a state machine: NULL means one thing; presence means another, with the timestamp telling you when.

## UNIQUE — preventing duplicates

```sql
CREATE TABLE users (
  ...
  email CITEXT NOT NULL UNIQUE
);
```

Two rows can't share the email. Enforced at write time; violation is a clean error.

For multi-column uniqueness:

```sql
CREATE TABLE org_memberships (
  user_id BIGINT NOT NULL REFERENCES users(id),
  org_id  BIGINT NOT NULL REFERENCES orgs(id),
  ...
  UNIQUE (user_id, org_id)
);
```

The pair is unique — a user is in an org at most once.

**Partial unique indexes** are a Postgres power tool:

```sql
-- only one active subscription per user
CREATE UNIQUE INDEX one_active_subscription
ON subscriptions(user_id)
WHERE canceled_at IS NULL;
```

This says "across all rows where `canceled_at IS NULL`, `user_id` is unique." Lets you have many historical canceled subscriptions per user but only one active. Hard to express with a regular UNIQUE; trivial with a partial index.

UNIQUE creates an index automatically — usually a B-tree, exactly the same as `CREATE UNIQUE INDEX`. You get the lookup performance for free.

## PRIMARY KEY

Already covered in chapter 3. Worth repeating: a primary key is `NOT NULL UNIQUE` plus a clustered/canonical index. Every table has exactly one. Some databases let you skip it; Postgres lets you, but you really should not.

## FOREIGN KEY — relational integrity

```sql
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES users(id),
  ...
);
```

`orders.customer_id` must reference a row that exists in `users`. Insert with a non-existent ID → error. Try to delete a user that has orders → blocked (default behavior).

The four `ON DELETE` policies:

```sql
ON DELETE NO ACTION  -- default: error if children exist
ON DELETE RESTRICT   -- same as NO ACTION but checked immediately
ON DELETE CASCADE    -- delete the children too
ON DELETE SET NULL   -- nullify the FK in children (column must be nullable)
ON DELETE SET DEFAULT
```

The choice matters and should be deliberate per relationship:

- **CASCADE** for owned data: comments belong to a post — delete post, delete comments.
- **RESTRICT** for shared references: don't let a user be deleted if they have orders. Force the app to handle it.
- **SET NULL** for soft references: a `created_by_user_id` on an audit row — when the user is deleted, keep the audit but null the reference.

Skipping foreign keys "for performance" is a bad trade. The cost of FK validation on insert is small; the cost of orphan rows in the wild is enormous. Always index the FK column (Postgres does not auto-index FKs):

```sql
CREATE INDEX ON orders(customer_id);
```

Without that index, "find all orders for user X" is a full table scan, _and_ deleting a user is a full table scan to check for orphans.

<Callout type="warn">

**Always index foreign key columns.** Postgres does not create the index automatically (unlike for primary keys). A missing FK index turns every reference check into a scan. Run this query periodically: `SELECT conrelid::regclass, conname FROM pg_constraint WHERE contype = 'f';` and verify each has a covering index.

</Callout>

## CHECK — domain constraints

```sql
CREATE TABLE products (
  id          BIGSERIAL PRIMARY KEY,
  price_cents BIGINT NOT NULL CHECK (price_cents > 0),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200)
);
```

CHECK constraints accept any boolean expression. Common patterns:

```sql
-- range
CHECK (age BETWEEN 0 AND 150)

-- enum-like (alternative to CREATE TYPE ... AS ENUM)
CHECK (status IN ('pending', 'paid', 'shipped', 'canceled'))

-- format
CHECK (email ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$')

-- relationship
CHECK (end_date > start_date)

-- cross-column
CHECK ((shipped_at IS NULL) OR (shipped_at >= created_at))

-- exactly-one polymorphic FK (chapter 2)
CHECK (
  (post_id IS NOT NULL)::int +
  (photo_id IS NOT NULL)::int +
  (video_id IS NOT NULL)::int = 1
)
```

CHECK constraints can reference any column in the same row but not other rows. For "this row's value must satisfy a condition involving another table," use triggers or application-level validation.

A common debate: **CHECK vs ENUM**.

```sql
-- ENUM type
CREATE TYPE order_status AS ENUM ('pending','paid','shipped','canceled');
CREATE TABLE orders (..., status order_status NOT NULL);

-- vs CHECK
CREATE TABLE orders (..., status TEXT NOT NULL CHECK (status IN ('pending','paid','shipped','canceled')));
```

Trade-offs:

- ENUM is more compact (4 bytes vs variable-length text).
- ENUM enforces the same vocabulary across the whole database.
- ENUM has clunkier evolution: adding a value requires `ALTER TYPE`; removing or reordering values is hard.
- CHECK is easier to evolve but allows accidental "shipped " (trailing space) until you `TRIM`.

For statuses you'll add to over time, prefer CHECK. For truly fixed vocabularies (currency codes, ISO country codes), ENUM is fine.

## EXCLUDE — overlap prevention

EXCLUDE is the constraint you reach for when UNIQUE isn't quite the right shape.

```sql
CREATE EXTENSION btree_gist;

CREATE TABLE bookings (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL,
  during  TSTZRANGE NOT NULL,
  EXCLUDE USING GIST (room_id WITH =, during WITH &&)
);
```

The constraint reads: "no two rows where `room_id` is the same AND `during` overlaps." Try to insert a booking for room 1 from 9am to 10am when there's already one from 9:30am to 10:30am — error. Database enforces it.

EXCLUDE is unique for ranges and geometric data. Without it, you'd write application-level checks that race under concurrency.

It's underused. If you have time-range, range-of-numbers, or spatial data with non-overlap rules, EXCLUDE is the cleanest answer.

## Generated columns (revisited)

Not technically a constraint, but enforces an invariant:

```sql
CREATE TABLE invoices (
  id        BIGSERIAL PRIMARY KEY,
  subtotal  NUMERIC NOT NULL,
  tax_rate  NUMERIC NOT NULL,
  total     NUMERIC GENERATED ALWAYS AS (subtotal * (1 + tax_rate)) STORED
);
```

The DB recomputes `total` on every INSERT or UPDATE. It cannot drift. Good for derived values that always come from the same row's other columns.

Postgres has STORED (computed at write time) and (in newer versions) VIRTUAL (computed at read time). STORED is more common — small storage cost, no read overhead.

## Where to enforce a rule — schema vs app vs both

A common question: should this validation live in the schema or in app code?

**Schema** when:

- The rule is universal (every code path must obey).
- The rule can be expressed in SQL (range, format, FK, uniqueness).
- The rule is about "what is true," not "what should happen."

**Application** when:

- The rule needs context the DB doesn't have (current user, feature flags, business rules).
- The rule produces friendly error messages with multiple field-level violations.
- The rule cross-references external services.

**Both** when stakes are high. Application-level validation gives nice UX (form errors at field level); schema constraints catch bugs in code paths the validation missed.

The trap: validating only in app code, then a manual SQL update or an unrelated service breaks the invariant. Production data goes bad in ways that are hard to detect and harder to fix.

## Naming constraints

Always name your constraints. Postgres generates names like `users_email_key1` or `orders_check5` by default — useful for one query, terrible for migrations.

```sql
ALTER TABLE orders
  ADD CONSTRAINT orders_status_valid
  CHECK (status IN ('pending','paid','shipped','canceled'));
```

Now you can `ALTER TABLE orders DROP CONSTRAINT orders_status_valid;` later. Without naming, you'd have to look up the auto-generated name.

Convention: `<table>_<column(s)>_<type>`. `users_email_unique`, `orders_status_check`, `payments_amount_positive_check`.

## Deferred constraints

By default, constraints are checked at the end of each statement. Sometimes you need to defer until commit:

```sql
ALTER TABLE A ADD CONSTRAINT a_b_fk FOREIGN KEY (b_id) REFERENCES B(id) DEFERRABLE INITIALLY IMMEDIATE;

BEGIN;
SET CONSTRAINTS a_b_fk DEFERRED;
-- now insert into A and B in either order
INSERT INTO A ...;
INSERT INTO B ...;
COMMIT; -- check all constraints now
```

Useful for circular FK dependencies — A references B, B references A — where you must insert both rows before any FK can validate.

Most schemas don't need this. Reach for deferred constraints when you have a real circular reference.

## Big-table constraint addition

Adding a NOT NULL or CHECK constraint to a billion-row table is a long-running operation that holds an exclusive lock. Postgres has a workaround for CHECK:

```sql
-- step 1: add constraint NOT VALID — does not check existing rows
ALTER TABLE big_table
  ADD CONSTRAINT big_table_x_check CHECK (x > 0) NOT VALID;

-- step 2: validate (slow, but doesn't block writes)
ALTER TABLE big_table VALIDATE CONSTRAINT big_table_x_check;
```

`NOT VALID` makes the constraint apply to _new_ writes immediately while existing rows are not checked. `VALIDATE` then scans existing rows without holding an exclusive lock. Two-step migration; zero downtime.

For NOT NULL, the same idea works via a CHECK first, then promoting:

```sql
-- step 1
ALTER TABLE big_table ADD CONSTRAINT big_table_x_not_null CHECK (x IS NOT NULL) NOT VALID;
ALTER TABLE big_table VALIDATE CONSTRAINT big_table_x_not_null;

-- step 2 (fast, uses the CHECK as a witness)
ALTER TABLE big_table ALTER COLUMN x SET NOT NULL;
ALTER TABLE big_table DROP CONSTRAINT big_table_x_not_null;
```

Chapter 10 covers more of these expand/contract patterns.

## What constraints don't do

- **They don't replace input validation.** Users get friendly errors from the app layer; the schema is the safety net.
- **They don't prevent every bug.** A constraint can't say "the right person is approving this." Logic-level rules belong in code.
- **They don't always enforce performance.** A CHECK that calls an expensive function on every insert is a foot-gun.

## Recap

- Six constraint types: NOT NULL, UNIQUE, PRIMARY KEY, FOREIGN KEY, CHECK, EXCLUDE.
- Default to NOT NULL; allow NULL only when its meaning is explicit.
- UNIQUE creates an index. Partial unique indexes solve "one active per user" cleanly.
- FK ON DELETE: CASCADE for owned data, RESTRICT for shared, SET NULL for soft references. Always index the FK column.
- CHECK for ranges, formats, enum-like, cross-column. Easier to evolve than ENUM types.
- EXCLUDE for non-overlap rules — time ranges, geometric data.
- Generated columns prevent drift on derived values.
- Name your constraints. Convention: `<table>_<col>_<type>`.
- Big tables: add CHECKs as `NOT VALID` then `VALIDATE` to avoid blocking.
- Constraints are the last line; layer with app validation for UX and edge cases.

Next: [Time and soft delete](/notes/data-modeling/07-time-soft-delete) — timestamps, time zones, history, and the soft-delete trap.
