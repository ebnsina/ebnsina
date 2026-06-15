---
title: "Keys"
subtitle: "The primary key is the most expensive choice in your schema. Pick wrong and you spend years working around it. Pick right and you forget it exists."
chapter: 3
level: "beginner"
readingTime: "12 min"
topics: ["data-modeling", "primary keys", "ulid", "uuid", "natural keys"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A passport number — it uniquely identifies you across all systems, never changes, and was chosen to be collision-proof at global scale. A bad primary key is like using your name: not unique, changes, and causes chaos the moment two people share it.

</Callout>

Every table needs a primary key. The choice between `BIGSERIAL`, `UUID`, `ULID`, or a natural key is not a style preference — each lands in different places when your app grows past one machine, sends events to other systems, or has to migrate data across environments.

This chapter is the cost/benefit table for the four real options, plus the rules for composite keys, when to expose IDs publicly, and the perennial "natural vs surrogate" debate.

## What a primary key is

A primary key uniquely identifies a row. Two consequences:

1. **No duplicates.** No two rows share the same primary key value.
2. **No NULLs.** Every row has one.

Postgres enforces both automatically and creates a unique B-tree index for fast lookup. That index is also the fundamental access path — every other index references the primary key under the hood (in InnoDB; Postgres is slightly different but behaves similarly in practice).

A primary key is forever. Or at least: it is *as good as* forever. Migrating to a different key is a multi-day operation on any table with significant data, so the choice is high-stakes.

## The four options

### 1. `BIGSERIAL` (integer, auto-incremented)

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  ...
);
```

`BIGSERIAL` is shorthand for `BIGINT NOT NULL DEFAULT nextval('users_id_seq')`. Postgres assigns 1, 2, 3, ... to inserted rows.

**Pros:**
- 8 bytes. Smallest of the surrogate options. Fastest indexes.
- Sequential. New rows land at the end of the index — cache-friendly inserts.
- Easy to read in logs. `user 4271` is something you can ask about.
- Naturally orderable by insertion. `ORDER BY id DESC` returns newest first.

**Cons:**
- Predictable. `/api/users/42` invites enumeration attacks ("can I see user 41? user 43?").
- Single source of truth — you can't generate IDs offline or in another service.
- Hard to merge data from two sources without renumbering.

**Use for:** internal systems, single-database apps, anywhere IDs aren't exposed externally and don't need to be generated outside the DB.

### 2. UUID v4 (random)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);
```

128-bit random number. `gen_random_uuid()` is built into Postgres 13+; before that, install `pgcrypto`.

**Pros:**
- Globally unique. Two services can mint IDs without coordination.
- Unguessable. Public APIs can use them without enumeration risk.
- Mergeable. Two databases' rows can be combined without conflict.

**Cons:**
- 16 bytes — twice the size of `BIGSERIAL`. Indexes are bigger.
- Random. New rows land all over the index — page splits, more I/O.
- Hard to read. `0d6b3e07-2d5d-4aab-9a8e-1bafa20fbb02` is opaque.
- Time-ordering needs a separate column.

**Use for:** distributed systems, multi-source-of-truth, when public IDs need to be unguessable.

### 3. UUID v7 / ULID (time-ordered random)

```sql
-- Postgres 18+ has uuidv7() built in; earlier use an extension or app-side
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  ...
);
```

UUIDv7 is a UUID with the first 48 bits being a millisecond timestamp; the rest random. **ULID** is the same idea with a different encoding — 26 chars of Crockford base32.

**Pros:**
- Globally unique like UUIDv4.
- Time-prefixed: new rows land at the end of the index. Insert-friendly.
- Sortable by creation time without a separate column.
- ULIDs are slightly more readable: `01HF5J7XK4TG6N2VRT9P0M3DZ4`.

**Cons:**
- Still 16 bytes (UUIDv7) or 26 chars (ULID).
- Slightly less random — first 48 bits are predictable (time). Doesn't matter for security in most cases; matters for theoretical privacy in rare ones.
- ULIDs aren't natively typed in Postgres — you store as `text` or `bytea`.

**Use for:** distributed systems where you also want sortable IDs. The modern default for new public-facing systems.

### 4. Natural keys

A "natural" key is a real-world value that uniquely identifies the entity — an email, an ISBN, a country code:

```sql
CREATE TABLE countries (
  code  CHAR(2) PRIMARY KEY,  -- 'US', 'GB', 'JP'
  name  TEXT NOT NULL
);
```

**Pros:**
- No surrogate column needed. Schema is one column smaller.
- Joins are self-explanatory: `WHERE country = 'US'` doesn't need a separate lookup.

**Cons:**
- Real-world values change. Country codes are stable; emails are not. Anything that *could* change is a bad PK.
- Mistakes propagate. A typo in the natural key requires updating every foreign key.
- Composite keys (multiple columns) make joins verbose.

**Use for:** truly stable real-world identifiers — country codes, currency codes, ISO standards. Almost never anything user-supplied.

## The right choice for 90% of tables

For new tables, in 2026:

- **Internal-only data:** `BIGSERIAL`. Smallest, fastest, easiest to debug.
- **Public-facing data:** ULID or UUIDv7. Mergeable, unguessable, sortable.
- **Reference tables (countries, currencies):** natural key.

Don't agonize over this. Pick one default for new tables and move on.

<Callout type="tip">

**The "BIGSERIAL internal + ULID external" pattern.** Some systems use `BIGSERIAL id` as the primary key (best for indexes and joins) plus a separate `public_id ULID` column with a unique constraint, exposed in URLs. You get fast internal joins and unguessable public IDs. Adds one column and one index per table — usually worth it for any user-facing entity.

</Callout>

## Composite primary keys

Sometimes the natural primary key is two (or more) columns:

```sql
CREATE TABLE org_memberships (
  user_id BIGINT NOT NULL REFERENCES users(id),
  org_id  BIGINT NOT NULL REFERENCES orgs(id),
  role    TEXT NOT NULL,
  PRIMARY KEY (user_id, org_id)
);
```

The pair `(user_id, org_id)` is unique — a user is in an org at most once.

**When composite is right:**
- Pure join tables (chapter 2): both FKs together identify the relationship.
- Time-series partitions: `(metric_id, bucket_start)`.
- Append-only logs: `(stream_id, sequence)`.

**When composite is wrong:**
- The table represents an entity with its own life (it grows attributes, gets referenced elsewhere). Add a surrogate ID. Composite keys make foreign keys from other tables verbose.

The rule: if any other table will reference this table, prefer a single surrogate key. Two-column FKs cascade through every related table and become a maintenance burden.

## Exposing IDs to the world

Two questions for public IDs:

**1. Should they be guessable?** A `BIGSERIAL` URL pattern (`/api/orders/42`) lets anyone iterate through your orders. Rate limiting and auth help, but the underlying enumeration risk is real. Use UUID/ULID for public surfaces.

**2. Should they hint at type?** Stripe's IDs (`cus_abc`, `py_xyz`, `sub_def`) prefix the resource type, which makes logs readable and prevents accidentally swapping IDs across types. Easy to add:

```sql
ALTER TABLE customers ADD COLUMN public_id TEXT GENERATED ALWAYS AS ('cus_' || id::text) STORED;
```

Or generate the prefixed ID at insert:

```go
func newID(prefix string) string {
    return prefix + "_" + ulid.Make().String()
}
```

Stripe-style IDs are not just aesthetic. They prevent a common bug: passing a customer ID where a payment ID was expected. The prefix mismatch surfaces the bug at the API boundary.

## When to *not* use a single primary key

Some shapes don't fit "one row, one key":

- **Bitemporal tables.** Rows have both "valid time" and "transaction time"; PK is `(entity_id, valid_from, transaction_from)`.
- **Event-sourced aggregates.** Each event is a row; PK is `(aggregate_id, sequence)`.
- **Wide-column shadow tables.** A change-log table where the PK is `(table_name, row_id, changed_at)`.

These are advanced patterns; chapter 7 touches on temporal data. Default to a simple PK and move to these only when there's a clear reason.

## Sequence vs identity

In Postgres there's a syntactic alternative to `BIGSERIAL`:

```sql
-- legacy
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, ...);

-- modern (SQL standard)
CREATE TABLE users (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ...);
```

`GENERATED ALWAYS AS IDENTITY` is the SQL standard. It does the same thing but slightly more strict — you can't manually `INSERT` an `id` value (with `BY DEFAULT` you can). For new tables, prefer the identity syntax. Behaves identically at runtime.

## Why not just use `email` as the user PK?

A common naïve question. Reasons:

1. **Emails change.** Users update their email; now you have to update every foreign key referencing them.
2. **Emails are PII.** They appear in indexes, logs, replication streams, query plans. A surrogate key doesn't.
3. **Composite-key joins on TEXT are slower** than `BIGINT` joins. Email is variable-length; integer comparison is faster.

The convention "always use a surrogate key for entities" exists because real-world identifiers turn out to be unstable. The schema gets the surrogate; the application enforces uniqueness on the natural attribute.

```sql
CREATE TABLE users (
  id    BIGSERIAL PRIMARY KEY,        -- stable, internal
  email CITEXT NOT NULL UNIQUE,        -- stable, but user can change it
  ...
);
```

## ID type and migration

If you change a primary key type, every foreign key referencing it must change too. The cost grows linearly with the number of related tables.

**Going from `BIGSERIAL` to `UUID`** on an existing table:
1. Add a new `uuid_id` column to the parent.
2. Backfill new UUIDs for every row.
3. Add `uuid_<parent>_id` columns to every child. Backfill via JOIN.
4. Switch app code to use the new IDs.
5. Drop old columns.

This is weeks of work for a busy system. **The right time to pick the right key type is when the table is empty.** Default to ULID/UUIDv7 for any new public-facing table now to avoid this migration in three years.

## What about hashids and short URLs

`hashids`, `nanoid`, and bespoke alphabet IDs (YouTube's 11-char URLs) come up. They are forms of surrogate key with custom encoding. Trade-offs:

- **`nanoid`** — short random IDs in a custom alphabet. Like UUIDv4 but smaller. Fine for non-time-sortable cases.
- **`hashids`** — encodes integers reversibly. Looks short but is just a `BIGSERIAL` in disguise — vulnerable to the same enumeration the integer was. Avoid for security.
- **Custom short codes** (`abc123`) — usually app-generated with retry on collision. Works for non-hot paths.

For most projects, ULID is enough. Custom IDs solve niche problems.

## Indexing and the primary key

The primary key automatically gets a unique B-tree index. You don't add one manually.

For composite PKs, only the leading column gets an index for non-PK queries:

```sql
PRIMARY KEY (user_id, org_id)
-- Index on user_id alone: yes, automatic
-- Index on org_id alone: NO — must add manually
CREATE INDEX ON memberships(org_id);
```

This is the "leftmost prefix rule" of B-tree indexes. Forgetting it leaves half your queries slow.

## Recap

- Every table has a PK. Pick deliberately; it's expensive to change.
- `BIGSERIAL` for internal data; ULID/UUIDv7 for public-facing; natural keys only for stable real-world IDs.
- "BIGSERIAL internal + ULID public" is a good default for user-facing entities.
- Composite PKs only for join tables and time-series — anything with its own life gets a surrogate.
- Public IDs should be unguessable and (optionally) prefixed by type.
- Use `GENERATED AS IDENTITY` over `BIGSERIAL` in new code (SQL standard).
- Email/username/anything-user-typed is not a PK. Surrogate + UNIQUE constraint.
- Composite PKs index only the leading column; add explicit indexes for the rest.

Next: [Normalization](/notes/data-modeling/04-normalization) — 1NF, 2NF, 3NF in plain English with real examples.

