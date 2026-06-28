---
title: 'Time and soft delete'
subtitle: "Timestamps that survive time zones, soft delete that doesn't poison every query, and history tables that answer 'what did this look like last Tuesday?'"
chapter: 7
level: 'intermediate'
readingTime: '12 min'
topics: ['data-modeling', 'timestamps', 'soft-delete', 'history', 'time-zones']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Two properties of time make it the source of more schema bugs than any other data type. First, time zones — you can store the same instant five different ways and three of them will be wrong. Second, the past — most apps eventually need to know "what was true last week," and naïve schemas can't answer that.

This chapter covers the patterns that work: `TIMESTAMPTZ` everywhere, three useful timestamp columns by default, soft delete done right, and history tables.

<Callout type="info">

**Real-World Analogy**

An archive folder instead of permanent delete — the email is gone from your inbox but still recoverable.

</Callout>

## Timestamps — `TIMESTAMPTZ`, always

Postgres has two timestamp types:

- `TIMESTAMP` (without time zone): a wall-clock value with no zone. _Looks_ like a moment in time but isn't.
- `TIMESTAMPTZ` (with time zone): a UTC instant.

**Always use `TIMESTAMPTZ`.** Even when you "know" the data is in a single time zone. Even when you don't display time zones in the UI.

```sql
CREATE TABLE events (
  id          BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  ...
);
```

`TIMESTAMPTZ` stores 8 bytes representing UTC seconds + microseconds. When you read it, Postgres converts to your session's time zone. When you write a value, Postgres converts to UTC. The storage is canonical; the display is local.

A common confusion: `TIMESTAMPTZ` does **not** store the time zone the data was written in. It only stores UTC. The "with time zone" part of the name refers to the fact that it accepts time-zoned input and converts.

If you also need to know the user's original time zone (e.g. for booking apps where "9 AM Tokyo time" must stay "9 AM Tokyo time" even when DST shifts), store the zone separately:

```sql
CREATE TABLE bookings (
  id            BIGSERIAL PRIMARY KEY,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  scheduled_tz  TEXT NOT NULL,  -- 'Asia/Tokyo'
  ...
);
```

Now you have UTC for storage/sorting and the zone for display.

<Callout type="warn">

**Never use `TIMESTAMP` without time zone for new data.** It's a footgun that "works" until the first daylight-saving boundary or the first time you deploy across regions. The 8 bytes are the same; the correctness isn't.

</Callout>

## The three default timestamps

Almost every entity table benefits from three timestamps:

```sql
CREATE TABLE posts (
  id          BIGSERIAL PRIMARY KEY,
  ...
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
```

**`created_at`** — when the row was first inserted. Set once, never changes.

**`updated_at`** — when the row was last changed. Updated on every UPDATE.

**`deleted_at`** — soft-delete marker (more below). NULL means active.

Maintenance for `updated_at`:

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_set_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
```

Now every UPDATE on `posts` automatically refreshes `updated_at`. Apply this trigger to every entity table — one-line copy per table.

Application-level alternative: every UPDATE in app code includes `updated_at = now()`. Works, but easy to forget.

The benefit of all three timestamps:

- "When did this go wrong?" → `created_at`.
- "Has this been touched recently?" → `updated_at`.
- "Why don't I see this anymore?" → `deleted_at`.

In production debugging, these three columns answer the first question 80% of the time.

## Soft delete

A soft delete marks a row as deleted without physically removing it.

```sql
ALTER TABLE posts ADD COLUMN deleted_at TIMESTAMPTZ;

-- "deleting"
UPDATE posts SET deleted_at = now() WHERE id = 42;

-- "active" rows
SELECT * FROM posts WHERE deleted_at IS NULL;
```

Reasons to soft-delete:

- **Recovery.** "Undelete" is a single UPDATE.
- **Audit.** Row history is preserved for compliance, debugging, analytics.
- **Foreign key safety.** A deleted row that's still referenced by FKs from other tables doesn't cause cascade chaos.
- **Cross-system replication.** Downstream caches and analytics can see the deletion as a state change rather than a missing row.

The cost: every query has to remember `WHERE deleted_at IS NULL`. Forget once, and your "list posts" includes deleted ones. Worse, "count posts" double-counts; "look up post by slug" can return the deleted version.

### The soft-delete trap

The trap is real. Three failure modes:

**1. Forgetful queries.** A new endpoint returns deleted rows because the developer forgot the filter. Common, hard to test (deleted rows are uncommon in dev).

**2. Unique constraints break.** `email UNIQUE` doesn't allow a deleted user with email `a@b.com` to coexist with a new user with the same email. Either user can't sign up, or you have to allow it on the deleted side.

**3. Performance drag.** Indexes include the deleted rows. Queries scan more pages. For a heavily-deleted table, this adds up.

Mitigations for each:

**For forgetful queries:** use a view.

```sql
CREATE VIEW posts_active AS SELECT * FROM posts WHERE deleted_at IS NULL;
```

App code queries `posts_active` for display. Admin tools query `posts` directly. The default is correct; you opt into deleted data explicitly.

**For unique constraints:** partial unique index.

```sql
CREATE UNIQUE INDEX users_email_active
ON users(email)
WHERE deleted_at IS NULL;
```

Email is unique among active users; deleted users can hold their old email forever (or you can wipe it).

**For performance:** partial indexes everywhere.

```sql
CREATE INDEX posts_created_active
ON posts(created_at DESC)
WHERE deleted_at IS NULL;
```

The index only covers active rows. Lookups on the active set are fast; deleted rows aren't in the index.

For very heavy delete rates, consider **archiving** to a cold table:

```sql
-- nightly job
INSERT INTO posts_archive SELECT * FROM posts WHERE deleted_at < now() - interval '90 days';
DELETE FROM posts WHERE deleted_at < now() - interval '90 days';
```

Active table stays small; deleted history lives in archive. Compliance lookups query the archive.

## When NOT to soft-delete

- **Sensitive data with deletion compliance.** GDPR's "right to be forgotten" requires actual deletion of personal data. Soft-delete + hard-delete-on-request is a valid pattern, but the hard delete must really erase.
- **Append-only logs.** Already historical; "deleting" doesn't make sense.
- **Truly transient data.** Notifications older than 30 days, ephemeral session tokens. Hard delete.
- **Privacy-sensitive joins.** A `user_messages` table where the user is deleted — keeping their messages soft-deleted may be a leak. Hard-delete or anonymize.

## History tables

Soft delete preserves "what was deleted." History tables preserve "what changed and when."

A simple pattern: a parallel `_history` table that captures every state.

```sql
CREATE TABLE customers (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      CITEXT NOT NULL UNIQUE,
  plan       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers_history (
  history_id  BIGSERIAL PRIMARY KEY,
  id          BIGINT NOT NULL,
  name        TEXT NOT NULL,
  email       CITEXT NOT NULL,
  plan        TEXT NOT NULL,
  valid_from  TIMESTAMPTZ NOT NULL,
  valid_to    TIMESTAMPTZ
);
```

A trigger captures changes:

```sql
CREATE OR REPLACE FUNCTION customers_archive() RETURNS TRIGGER AS $$
BEGIN
  -- close out previous version
  UPDATE customers_history
  SET valid_to = now()
  WHERE id = OLD.id AND valid_to IS NULL;

  -- insert new version (the post-update snapshot)
  INSERT INTO customers_history(id, name, email, plan, valid_from)
  VALUES (NEW.id, NEW.name, NEW.email, NEW.plan, now());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_archive_trigger
AFTER INSERT OR UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION customers_archive();
```

Now `customers_history` answers "what was customer 42's plan on 2026-04-01?":

```sql
SELECT plan FROM customers_history
WHERE id = 42
  AND valid_from <= '2026-04-01'
  AND (valid_to IS NULL OR valid_to > '2026-04-01');
```

Pattern variants:

- **Append-only history table.** Every UPDATE inserts a new row; old rows have `valid_to`. As above.
- **Audit log.** Less structured: `change_log` table with `(table_name, row_id, action, changed_at, payload JSONB)`. More flexible, less queryable.
- **PostgreSQL temporal tables (extension `temporal_tables`).** Manages history automatically. Worth knowing about; depends on your tolerance for extensions.

For most apps, an append-only history per critical table is the simple, correct shape. Don't try to history-track every table — just the ones where "what was true at this moment" matters (compliance, billing, legal).

## Time-range columns

Postgres has `TSTZRANGE` for time ranges:

```sql
CREATE TABLE rentals (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id BIGINT NOT NULL,
  during TSTZRANGE NOT NULL,
  EXCLUDE USING GIST (vehicle_id WITH =, during WITH &&)
);
```

The `during` column captures both start and end in one column, with native support for "overlaps", "contains", "adjacent" operators. Combined with EXCLUDE constraints (chapter 6), it prevents booking conflicts at the schema level.

If you currently have `start_at` and `end_at` columns and routinely write queries like `WHERE start_at &lt; $1 AND end_at > $2` — that's a sign `TSTZRANGE` will be cleaner.

## Common time mistakes

**1. Mixing seconds and milliseconds.** `created_at_ms` BIGINT vs `created_at_sec` INT. Pick one — milliseconds — for all integer timestamps. Or just use `TIMESTAMPTZ` everywhere.

**2. Storing local time as `TIMESTAMP`.** "It's just a timestamp, why does it matter?" It matters when DST happens, when the server moves regions, when a user crosses time zones.

**3. Comparing timestamps with `=`.** `WHERE created_at = '2026-01-01'` casts to midnight UTC. The user meant "anywhere on Jan 1." Use ranges: `WHERE created_at >= '2026-01-01' AND created_at &lt; '2026-01-02'`.

**4. Trusting client clocks.** `INSERT INTO events(occurred_at) VALUES ($client_timestamp)` lets a buggy or malicious client insert events in the past or future. For events the server controls, use `now()`. For events the client reports (with verification), set both `occurred_at` (client) and `received_at` (server).

**5. Forgetting `NOT NULL` on `created_at`.** "Created at NULL" means "we don't know when this was created" — almost always a bug. NOT NULL DEFAULT now() makes it impossible.

## Recap

- `TIMESTAMPTZ` everywhere. `TIMESTAMP` (without zone) is a footgun.
- Three default timestamps: `created_at`, `updated_at`, `deleted_at`.
- `updated_at` via trigger so app code can't forget.
- Soft delete pattern: `deleted_at TIMESTAMPTZ` nullable, view for active, partial indexes for performance and uniqueness.
- Don't soft-delete sensitive data subject to deletion compliance.
- History tables for "what was true and when" — append-only, with `valid_from`/`valid_to`.
- `TSTZRANGE` + EXCLUDE for booking-style overlap prevention.
- Common bugs: mixing seconds/ms, equality on timestamps, trusting client clocks, allowing NULL on `created_at`.

Next: [Multi-tenancy](/notes/data-modeling/08-multi-tenancy) — single-DB, schema-per-tenant, row-level security.
