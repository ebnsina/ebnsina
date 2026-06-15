---
title: "JSONB and the schemaless trap"
subtitle: "JSONB is one of Postgres's best features. Used well, it's how you stop fighting your schema. Used badly, it's how you end up with a schemaless mess inside a relational database."
chapter: 9
level: "advanced"
readingTime: "12 min"
topics: ["data-modeling", "jsonb", "postgres", "schemaless"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

JSONB lets you store arbitrary JSON inside a column. It's tempting — you skip the schema design, you ship faster, you never have to migrate. Most teams reach for it once or twice and learn the same lesson: JSONB is a powerful tool that becomes a permanent disaster if used as a substitute for thinking.

This chapter is the legitimate uses, the anti-uses, the indexing patterns that make JSONB queries fast, and the migration plan when JSONB grows up into real columns.

<Callout type="info">

**Real-World Analogy**

A filing cabinet drawer that accepts both structured folders and loose papers — rigid and flexible storage in the same place.

</Callout>

## What JSONB is

`JSONB` (Postgres-specific) is binary JSON storage. Insert any valid JSON; query with operators like `->`, `->>`, `@>`. Indexed with GIN (Generalized Inverted Index) for membership-style queries.

```sql
CREATE TABLE events (
  id   BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  data JSONB NOT NULL
);

INSERT INTO events(type, data) VALUES
  ('user.signup', '{"user_id": 42, "plan": "pro", "source": "blog"}'),
  ('user.login',  '{"user_id": 42, "ip": "1.2.3.4"}');

SELECT data->>'user_id' AS uid FROM events WHERE type = 'user.signup';
SELECT * FROM events WHERE data @> '{"plan": "pro"}';
```

The `JSONB` type vs `JSON`: `JSON` stores the text as-is (including whitespace and key order); `JSONB` stores a parsed binary representation. Always use `JSONB` for new code — operators are faster, indexing only works on JSONB.

## Three legitimate uses

### 1. Genuinely variable shape per row

When the data structure is fundamentally different across rows, columns can't represent it. Webhook event payloads are the canonical case:

```sql
CREATE TABLE webhook_events (
  id    BIGSERIAL PRIMARY KEY,
  type  TEXT NOT NULL,           -- 'payment.succeeded', 'user.created', ...
  data  JSONB NOT NULL,           -- shape depends on type
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

A `payment.succeeded` event has different fields than a `user.created`. Modeling each event type as its own table would mean dozens of tables; modeling as one wide table would mean dozens of mostly-NULL columns. JSONB is right.

The keys of `data` are stable per `type`. You can document each type's payload separately, and consumers know what to expect.

### 2. Genuinely user-defined shape

Custom fields on a CRM record, form responses, key-value preferences:

```sql
CREATE TABLE form_submissions (
  id          BIGSERIAL PRIMARY KEY,
  form_id     BIGINT NOT NULL REFERENCES forms(id),
  responses   JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Every form has different fields. The customer designs the form; the schema can't know in advance. JSONB is right.

### 3. Sparse, opaque metadata

Tag-like or label-like data that the application sometimes sets, sometimes reads, but the database mostly stores:

```sql
CREATE TABLE products (
  id       BIGSERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  price_cents BIGINT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'
);
```

The `metadata` column holds anything the app or integrations want to attach. It's not queried often; it's not indexed; it's not validated. Treat it as opaque storage.

This is exactly the role Stripe's `metadata` field plays — a place customers can stash bookkeeping IDs without you needing to model them.

## The anti-pattern: JSONB as schema

The trap: putting structured, queryable data inside JSONB to "skip schema design."

```sql
-- BAD
CREATE TABLE users (
  id    BIGSERIAL PRIMARY KEY,
  data  JSONB NOT NULL  -- contains email, name, plan, role, ...
);
```

Now:

- **No type safety.** `email` could be an int. `plan` could be missing. The DB doesn't care.
- **No NOT NULL.** Even if you "always set" a field, nothing stops a buggy insert from omitting it.
- **No FK to other tables.** `data->>'org_id'` references `orgs.id`? Maybe. The DB has no idea.
- **No clean indexes.** GIN indexes work for some queries, not for `ORDER BY data->>'created_at'` style scans.
- **Hard to reason about.** "What fields does a user have?" Look at the code, hope it's complete.

You've reinvented MongoDB inside Postgres, with the worst of both — Mongo's lack of structure and Postgres's reluctance to be schemaless.

The shape of the rule: **if the data has a known, common structure across rows, use columns**. JSONB is for genuinely variable, opaque, or dynamic data — not for "I haven't decided the columns yet."

<Callout type="warn">

**The JSONB-as-schema bug compounds.** Every new feature reads from `data->>'something'`. Every new feature could be reading the wrong type. Two years in, the JSONB column is the schema, and a "real" migration is impossible without rewriting the world.

</Callout>

## Indexing JSONB

Three index types for JSONB, in order of common use.

### GIN on the whole column

```sql
CREATE INDEX events_data_gin ON events USING GIN (data);
```

Supports membership queries:

```sql
-- "events whose data contains this object"
SELECT * FROM events WHERE data @> '{"user_id": 42}';

-- "events with this top-level key"
SELECT * FROM events WHERE data ? 'plan';

-- "events with any of these keys"
SELECT * FROM events WHERE data ?| ARRAY['plan', 'tier'];
```

The index is large (often 2-3× the data) but versatile. Right when you don't know in advance which paths you'll filter on.

### GIN with `jsonb_path_ops`

A more compact but more limited variant:

```sql
CREATE INDEX events_data_gin_path ON events USING GIN (data jsonb_path_ops);
```

Smaller index; only supports the `@>` containment operator. If `@>` is the only operator you use, this is faster and lighter than the default GIN.

### B-tree on a specific path

For one specific field that's queried by equality or range:

```sql
CREATE INDEX events_user_id ON events ((data->>'user_id'));

-- now this is fast
SELECT * FROM events WHERE data->>'user_id' = '42';
```

You can also create indexes on expressions that cast — `((data->>'user_id')::bigint)` — for proper integer comparisons.

For most apps with structured-but-flexible JSONB columns, **two indexes work well:** a GIN for general queries, plus B-tree expression indexes on the most-filtered fields.

## Generated columns from JSONB

A pattern that gives you the best of both worlds:

```sql
CREATE TABLE events (
  id      BIGSERIAL PRIMARY KEY,
  type    TEXT NOT NULL,
  data    JSONB NOT NULL,
  user_id BIGINT GENERATED ALWAYS AS ((data->>'user_id')::bigint) STORED,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX events_user_id ON events(user_id);
```

`user_id` is automatically derived from JSONB at write time, stored as a real column, indexed normally. Application code can use `WHERE user_id = $1` cleanly. The JSONB stays the source of truth; the column is a fast access path.

Use this when a JSONB field is queried often enough to deserve its own index, but you don't want to extract it to a fully separate column.

## Validation

JSONB itself doesn't validate structure. Two layers:

**Application-level**: parse the JSONB into a typed struct and validate on the way in. Standard practice; the only line of defense in many apps.

**Schema-level CHECK constraints**: surprisingly powerful.

```sql
ALTER TABLE webhook_events
  ADD CONSTRAINT data_has_required_keys
  CHECK (data ? 'event_id' AND data ? 'type');

ALTER TABLE webhook_events
  ADD CONSTRAINT data_event_id_is_string
  CHECK (jsonb_typeof(data->'event_id') = 'string');
```

For critical structure (every row must have these keys, of these types), CHECK constraints catch the bug at insert time. Don't try to validate every nested field — keep it to the top-level invariants.

For richer validation, **JSON Schema** can be applied via the `pg_jsonschema` extension (or app-side validators). Worth it for high-stakes data.

## Migrating out of JSONB

Eventually a JSONB field becomes a "real" field. The migration:

```sql
-- 1. add the new column
ALTER TABLE events ADD COLUMN user_id BIGINT;

-- 2. backfill from JSONB
UPDATE events SET user_id = (data->>'user_id')::bigint;

-- 3. add NOT NULL + index
ALTER TABLE events ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX events_user_id ON events(user_id);

-- 4. update app code to write to both old and new (during transition)

-- 5. eventually, remove the field from data on writes; backfill remaining

-- 6. optionally, drop JSONB or keep for legacy data
```

Plan for this from the start. The JSONB is your prototyping ground; the columns are the production schema. The migration is normal. Painful only if the JSONB has been growing organically for years without anyone watching.

## Storage and performance notes

- **JSONB is parsed.** `INSERT` parses and re-encodes; `SELECT data->>'k'` is a fast lookup.
- **TOAST.** Large JSONB blobs (>2KB) get TOAST-ed (compressed and stored out-of-line). Reading the whole row pulls them back in; reading a specific path can avoid it for some queries.
- **Comparing JSONB equality is exact.** Whitespace doesn't matter (it was normalized), but key order is preserved on read.
- **No partial updates by default.** `UPDATE events SET data = jsonb_set(data, '{k}', '"v"')` reads, modifies, writes the whole JSONB. For a 100KB blob, this rewrites 100KB.

## When NOT to use JSONB at all

- **For relational data.** Joining JSONB fields against other tables is awkward. If the data has FKs to other tables, columns are right.
- **For numeric data you'll aggregate.** `SUM(data->>'amount'::numeric)` is slow and ugly.
- **For data subject to type-driven query optimization.** The optimizer is much better with typed columns.
- **For data you'll constantly migrate.** Each `jsonb_set` rewrites the column; columns are atomic updates.

## Recap

- JSONB is great for genuinely variable shape (webhook payloads), user-defined fields (forms), and opaque metadata.
- Anti-pattern: using JSONB as a substitute for schema design.
- Indexes: GIN for general; `jsonb_path_ops` for `@>`-only; B-tree expression indexes for specific paths.
- Generated columns let you derive a real column from JSONB at write time.
- Validate at the application layer always; CHECK constraints for top-level invariants.
- Plan the migration from JSONB to columns. It's normal — JSONB is the prototyping ground.
- Don't use for: relational data with FKs, numeric aggregations, hot updates of small fields.

Next: [Schema evolution](/notes/data-modeling/10-schema-evolution) — expand/contract migrations, zero-downtime changes, backfills.

