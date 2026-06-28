---
title: 'What data modeling is'
subtitle: 'Schema design is the most expensive thing you ship. The columns you pick on day one outlast every framework, every refactor, every rewrite. Modeling well is mostly thinking before typing CREATE TABLE.'
chapter: 1
level: 'beginner'
readingTime: '10 min'
topics: ['data-modeling', 'schemas', 'orms', 'design']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

There are three kinds of code in a typical app: handlers, business logic, and the schema. Handlers get rewritten when frameworks change. Business logic gets refactored when requirements change. The schema stays. A `users` table created in 2018 still has the same primary key in 2026, and you still ship migrations against it on Tuesdays.

That asymmetry is why data modeling is worth doing carefully. A loose model adds friction to every feature for the rest of the project. A tight one disappears.

<Callout type="info">

**Real-World Analogy**

The blueprint for a building — you decide the layout before pouring concrete, because moving walls later is expensive.

</Callout>

## What "data modeling" actually means

Three layers, often confused.

**Conceptual model.** What entities exist in the world your app talks about — users, orders, line items, invoices — and how they relate. No SQL. Lives in a sketch, an ER diagram, or your head.

**Logical model.** Tables, columns, types, keys, relationships. Still abstract — could land in Postgres, MySQL, or SQLite. This is where most "data modeling" decisions actually happen.

**Physical model.** The CREATE TABLE statements that run against your specific database. Indexes, partitioning, vendor-specific types like JSONB and tsvector.

This track focuses on the logical model with one foot in the physical (Postgres). The conceptual layer matters too — chapter 2 — but the leverage is in turning a clear conceptual model into a logical one that holds up under load.

## What it is not

**It is not "designing the ORM models."** Active Record, Sequelize, Prisma — all helpful for _expressing_ a schema in code, but the schema exists with or without them. Designing the ORM first leads to schemas that read well in code and badly in SQL — N+1, polymorphic FK gymnastics, denormalized junk fields nobody can drop.

**It is not "the database the API returns."** Your API response is _projected_ from the schema, but the schema is the source of truth. A common mistake: making the table match the JSON shape the frontend wants today, then discovering tomorrow's frontend wants a different shape and the schema can't easily produce it.

**It is not just "what columns to add."** It is what _invariants_ the schema enforces. A `status` column on `orders` with no constraint is just a string. A `CHECK (status IN ('pending','paid','shipped','canceled'))` is the schema saying _these are the only legal values_. The first lets bugs in; the second forbids them.

## Why schemas outlast everything else

Three forces work against changing a schema:

1. **Data lives in it.** A table with 50 million rows is a thing you migrate carefully, not a thing you replace.
2. **Many readers depend on it.** Your API, batch jobs, analytics queries, the dashboard your CEO loads every Monday — all written against the table names and column names. Renaming a column is a coordination problem.
3. **The shape of the schema shapes the code.** A `subscription` table with one row per subscription leads to one set of code paths; a `subscription_event` table with append-only rows leads to a different set. Each path attracts feature work that assumes its shape. Reversing that assumption is a refactor across the whole app.

Code that consumes the schema can be rewritten in a weekend. The schema itself takes weeks of expand-contract migrations even for small changes (chapter 10). Plan accordingly.

## The four questions a schema answers

A good schema answers these without asking the application code:

**1. What can be stored?** Types, lengths, NOT NULL, regex constraints. The schema rejects bad data at insert time. No `if x.length > 200` in app code; just `varchar(200) NOT NULL`.

**2. What is true at all times?** Foreign keys mean "every order belongs to a user that exists." Unique constraints mean "no two users share an email." CHECK constraints mean "amount > 0." These are _invariants_ — properties of the data that cannot be temporarily broken without an explicit transaction.

**3. How are things related?** Foreign keys spell out one-to-many and many-to-many relationships. The schema is the truth; the application reads it.

**4. How will it change?** Schema evolution is itself a design constraint. Picking surrogate keys (chapter 3) anticipates renames. Picking nullable fields anticipates new optional data. Avoiding wide unique constraints anticipates performance changes. The schema plans for the next ten years, not just today.

## A thought experiment

You are building a marketplace. Users post listings. Buyers favorite listings, then buy them. Orders ship.

Naive first model:

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, email TEXT, name TEXT);
CREATE TABLE listings (id BIGSERIAL PRIMARY KEY, user_id BIGINT, title TEXT, price NUMERIC);
CREATE TABLE orders (id BIGSERIAL PRIMARY KEY, listing_id BIGINT, buyer_id BIGINT, status TEXT);
```

Three tables, looks reasonable. But — what's wrong?

- **`users.email` is not unique.** Two users can sign up with the same email. Login becomes ambiguous.
- **`listings.user_id` has no foreign key.** A listing can reference a user that doesn't exist. Orphans are now possible.
- **`orders.status` is freeform text.** Half the rows say "shipped"; half say "Shipped"; one says "shippped" because somebody fat-fingered it.
- **`listings.price` is `NUMERIC` without scale.** It can store `12.345678` — currency you can't represent.
- **No timestamps anywhere.** You can't answer "show me last month's orders." Worse, you can't tell when bugs were introduced.
- **`listings` has no soft state.** When a seller deletes a listing, what happens to orders that reference it? `ON DELETE CASCADE` deletes order history; `ON DELETE RESTRICT` blocks the seller from deleting; `ON DELETE SET NULL` requires `listings.id` to be nullable on the order side.

A second pass:

```sql
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  email       CITEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id          BIGSERIAL PRIMARY KEY,
  seller_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  price_cents BIGINT NOT NULL CHECK (price_cents > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'canceled');

CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  listing_id  BIGINT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  buyer_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status      order_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Same three tables, but now:

- Email uniqueness enforced. `CITEXT` makes it case-insensitive — `Fatima@Example.com` and `fatima@example.com` are the same row.
- Foreign keys spell out the relationships. Sellers can't be deleted while they have listings; that's a deliberate choice (`RESTRICT`) instead of an accident.
- Status is an enum — only the five legal values are accepted.
- Price is `BIGINT cents`, not floating-point dollars (chapter 3 has the full argument).
- Every table has `created_at`. Hard to overstate how much this helps in production.
- Listings have an `archived_at` for soft delete (chapter 7) instead of being physically removed.

The columns and tables didn't change. The _promises the schema makes_ did. That is what data modeling is.

## Modeling pays the most in the boring cases

Glamorous schema problems — sharding, replication, CRDTs — get the press. The thousand-fold returns come from the boring stuff:

- A `created_at` column that lets ops debug a 3 AM page in 90 seconds instead of 90 minutes.
- A unique constraint that prevents 800 duplicate user rows from being created during a registration bug.
- A foreign key that catches a delete cascade you didn't intend before it shows up in QA.
- A CHECK constraint that rejects negative prices the moment a developer pushes a buggy admin form.

None of these features are clever. All of them save real time, real money, real customer trust. **The schema is your last line of defense against application bugs.**

<Callout type="tip">

**If you can encode an invariant in the schema, do.** Constraint failures are loud — the database refuses to accept the bad data, the app gets a clean error, you fix the bug. Invariants enforced only in app code drift over time, especially across services that share a database.

</Callout>

## When _not_ to model heavily up front

The opposite mistake exists too. Spending two weeks on the perfect schema for an idea that may not survive its first user is wasted work. Three honest cases for moving fast:

1. **Prototypes.** Use a wide table with `data JSONB` and figure out the shape later. Refactor when you actually ship.
2. **Truly schemaless data.** Logs, audit events, telemetry — append-only, mostly read by tools that handle their own typing. Modeling each event type as a strict table is overhead.
3. **Strong domain uncertainty.** When you don't yet know what an "order" is, locking in 12 columns names is premature. Sketch in code, validate the shape, then formalize.

The trap: people who say "I'll formalize later" rarely do. The JSONB pile becomes the permanent schema. Reach for `JSONB` knowing you may have to migrate out — chapter 9 has the full pattern.

## Tools that help

A short list, vendor-neutral:

- **`psql`** for poking at schemas. The `\d table_name` command is your most-used schema tool.
- **`pg_dump --schema-only`** to compare schemas across environments.
- **dbdiagram.io / mermaid** for ER diagrams. Sketches at 10 seconds per minute beat any IDE.
- **sqitch / atlas / golang-migrate** for migration tooling. Pick one and stay with it.
- **`EXPLAIN ANALYZE`** for understanding what the schema costs at query time. Modeling without measuring is guessing.

Postgres-specific power tools — `pg_stat_statements`, `pg_stat_user_indexes`, `auto_explain` — come into play in the **Databases self-hosted** track.

## Recap

- A schema has three layers: conceptual, logical, physical. Most modeling decisions are at the logical layer.
- The schema outlives every framework around it. Treat it accordingly.
- Good schemas answer four questions: what can be stored, what is always true, how things relate, how it will change.
- Invariants belong in the schema (constraints) when possible — last line of defense.
- The wins are mostly boring: timestamps, NOT NULLs, unique constraints, foreign keys.
- Prototypes can use JSONB and figure it out later, with the migration cost in mind.
- Tools: `psql`, ER sketches, a real migration tool, EXPLAIN.

Next: [Entities, attributes, relationships](/notes/data-modeling/02-entities-relationships) — ER thinking, before SQL.
