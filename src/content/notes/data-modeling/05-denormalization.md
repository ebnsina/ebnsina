---
title: "Denormalization"
subtitle: "Sometimes the same fact lives in two places on purpose. Done well, it makes hot queries fly. Done badly, it creates the exact drift normalization was designed to prevent."
chapter: 5
level: "intermediate"
readingTime: "11 min"
topics: ["data-modeling", "denormalization", "performance", "caching"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Chapter 4 said: every fact lives in exactly one place. That's the right default. This chapter is about when to break it on purpose, and how to keep the lie consistent so it doesn't bite you later.

<Callout type="info">

**Real-World Analogy**

Putting a sticky note with your flight number on your boarding pass — duplicated data, but you don't need to look it up every time.

</Callout>

## Why denormalize at all

Three legitimate motivations.

**1. Read performance.** A 5-table JOIN is correct but expensive. If a hot query runs millions of times a day, denormalizing a few fields can cut latency by 10×.

**2. Historical accuracy.** Some data must reflect "what was true at the time." Order line items should preserve the price the customer paid, not the current product price.

**3. Atomic invariants.** Sometimes you need a value to stay consistent with another even if the source is unreachable (cross-service eventual consistency, derived denormalization).

Each is a real win. Each comes with a cost — keeping the duplicates in sync. Most of this chapter is about that bookkeeping.

## Read-performance denormalization

The classic example: showing a list of posts with author names.

Strict 3NF:

```sql
SELECT p.id, p.title, u.name AS author_name, COUNT(c.id) AS comment_count
FROM posts p
JOIN users u ON u.id = p.user_id
LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id, u.name
ORDER BY p.created_at DESC
LIMIT 20;
```

Two joins, an aggregation. Fine for hundreds of posts; slow for millions. The author's name is fetched again for every post; the comment count is recomputed every query.

Denormalized:

```sql
ALTER TABLE posts ADD COLUMN author_name TEXT;
ALTER TABLE posts ADD COLUMN comment_count INT NOT NULL DEFAULT 0;

-- backfill once
UPDATE posts SET author_name = u.name FROM users u WHERE u.id = posts.user_id;

-- query becomes
SELECT id, title, author_name, comment_count
FROM posts
ORDER BY created_at DESC
LIMIT 20;
```

No JOINs, no aggregation. The query is now a simple index scan + LIMIT.

The cost: every change to a user's name must update every post they wrote. Every comment insert/delete must update the parent post's counter.

## Bookkeeping options

Three patterns for keeping the denormalized data in sync.

### 1. Application code

```go
func (s *Service) UpdateUserName(ctx context.Context, userID int64, newName string) error {
    tx, _ := s.db.BeginTx(ctx, nil)
    defer tx.Rollback()

    _, err := tx.Exec(`UPDATE users SET name = $1 WHERE id = $2`, newName, userID)
    if err != nil {
        return err
    }
    _, err = tx.Exec(`UPDATE posts SET author_name = $1 WHERE user_id = $2`, newName, userID)
    if err != nil {
        return err
    }
    return tx.Commit()
}
```

Pros: explicit, easy to read, all in one transaction.
Cons: every code path that updates the source must remember to update the duplicate. Miss one → drift. Across multiple services, this gets very hard.

### 2. Triggers

```sql
CREATE OR REPLACE FUNCTION update_post_author_name() RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts SET author_name = NEW.name WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_name_change
AFTER UPDATE OF name ON users
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name)
EXECUTE FUNCTION update_post_author_name();
```

Pros: enforced at the database level. Application code can't forget. Single source of truth for the bookkeeping rule.
Cons: triggers are invisible to most developers — the SQL UPDATE that "just works" is doing more than it appears. Hard to debug. Hard to disable for bulk operations.

### 3. Materialized views

```sql
CREATE MATERIALIZED VIEW post_listing AS
SELECT p.id, p.title, u.name AS author_name, COUNT(c.id) AS comment_count
FROM posts p
JOIN users u ON u.id = p.user_id
LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id, u.name;

CREATE UNIQUE INDEX ON post_listing(id);

-- refresh on schedule
REFRESH MATERIALIZED VIEW CONCURRENTLY post_listing;
```

Pros: no application changes; refresh decoupled from writes. Good for analytics or "near-real-time" dashboards.
Cons: data is stale between refreshes. `REFRESH` can be expensive on large datasets.

For most product features, application-level bookkeeping inside the same transaction is the cleanest. Triggers and materialized views earn their place when the bookkeeping spans many tables or you need to insulate writes from the cost.

## Counter columns

A specific case worth covering: keeping a count.

```sql
CREATE TABLE posts (
  id            BIGSERIAL PRIMARY KEY,
  ...
  comment_count INT NOT NULL DEFAULT 0
);
```

Application code maintains it:

```go
func (s *Service) AddComment(ctx context.Context, postID int64, body string) error {
    tx, _ := s.db.BeginTx(ctx, nil)
    defer tx.Rollback()

    _, err := tx.Exec(`INSERT INTO comments(post_id, body) VALUES($1, $2)`, postID, body)
    if err != nil { return err }

    _, err = tx.Exec(`UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1`, postID)
    if err != nil { return err }

    return tx.Commit()
}
```

Two writes per comment, one transaction. Beats `SELECT COUNT(*)` on a 10M-row comments table.

Caveats:

- **Concurrency.** Two simultaneous comment inserts must both increment correctly. Postgres handles this with row locks on the `posts` row during the UPDATE; both succeed serially.
- **Drift recovery.** If the counter ever goes wrong (a bug, a manual delete that skipped the trigger), you need a reconciliation job: `UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = posts.id);`. Run periodically.
- **Don't denormalize counts you don't display.** If `comment_count` only shows on a per-post page where you can `SELECT COUNT(*) WHERE post_id = ?` cheaply, the denormalization is overhead you don't need.

## Historical denormalization

The other major case: snapshotting data because the source might change.

```sql
CREATE TABLE order_items (
  order_id     BIGINT NOT NULL REFERENCES orders(id),
  product_id   BIGINT NOT NULL REFERENCES products(id),
  quantity     INT NOT NULL,
  unit_price_cents BIGINT NOT NULL,    -- snapshot, not FK
  product_name TEXT NOT NULL,           -- snapshot
  PRIMARY KEY (order_id, product_id)
);
```

`unit_price_cents` and `product_name` look like 3NF violations — the canonical price and name live on `products`. They are deliberate snapshots.

When the seller changes the product price six months from now, this order's history doesn't change. The customer paid `4200`; the receipt says `4200`. The ledger is permanent.

This is the right answer for any *event*, *transaction*, or *historical record*. Snapshot the relevant fields at write time. The source-of-truth tables can change freely.

The bookkeeping rule: **historical denormalization is write-once.** Once the order is created, those columns never update. No triggers needed.

## Cross-service denormalization

In a multi-service architecture, normalization across service boundaries isn't even possible — the canonical user data lives in the User Service; your Orders Service can't JOIN against it cheaply.

The pattern: subscribe to events from the source-of-truth service and maintain a local copy.

```sql
-- In the orders database
CREATE TABLE customers_cache (
  id          BIGINT PRIMARY KEY,        -- matches user service's id
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL
);
```

The orders service subscribes to a user.updated event stream from the user service. Each event updates this cache. Local joins to `customers_cache` are fast and don't require a network hop.

This is fundamentally the same pattern as the GraphQL track's chapter on N+1 — duplicate the data, accept the eventual consistency, get the fast read.

The trade-off here is real: data is *eventually* consistent. A user who renames themselves will have orders with the old name for some seconds (or minutes). Acceptable for display; not acceptable for billing or compliance.

## Things people denormalize wrong

**1. "I'll just denormalize for performance" without measurement.** Premature denormalization. The JOIN was probably fine. Profile first.

**2. Denormalizing every column.** When the duplicate set grows past 2-3 fields, consider whether the source table belongs in this query at all — sometimes the read pattern wants its own table (a real materialized view, an indexed view, or a separate cache like Redis).

**3. Storing the whole record.** A `posts.author_data JSONB` with the full user blob means every user change updates every post. If the access pattern doesn't actually need the full user, snapshot only the fields used (`author_name`, `author_avatar`).

**4. Forgetting reconciliation.** Denormalized data drifts in any system that runs long enough — a bug, a missed event, a developer error during a migration. Always have a script that recomputes from source-of-truth and compares.

```sql
-- Reconcile post.comment_count
SELECT
  p.id,
  p.comment_count AS stored,
  COUNT(c.id) AS actual
FROM posts p
LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id, p.comment_count
HAVING p.comment_count <> COUNT(c.id);
```

Run weekly. Alert if it returns rows.

<Callout type="warn">

**Denormalization is a debt.** You are committing to keeping two copies of a fact in sync, forever. If the team shipping a new feature doesn't know the duplicate exists, they'll forget to update it. Document every denormalization in the schema (column comments, ADRs, ARCHITECTURE.md), and write reconciliation queries.

</Callout>

## When to skip denormalization entirely

Pure 3NF is fine when:

- Read patterns don't need the JOIN to be fast (admin pages, occasional dashboards).
- Indexes already make the JOIN fast (`SELECT * FROM posts WHERE user_id = ?` with FK index).
- The duplicate would change frequently. Sync cost > read win.
- A cache (Redis, CDN) handles the hot read path. Caches have invalidation, but it's localized — not a permanent schema commitment.

Reach for denormalization only when:

- A specific query is provably slow.
- The "right" fix isn't an index.
- You can write a clean reconciliation check.

## Postgres-specific tools

A few features that change the calculus:

**Generated columns.** Computed at write time, stored automatically. Lets you have denormalization without manual bookkeeping.

```sql
ALTER TABLE invoices ADD COLUMN total NUMERIC GENERATED ALWAYS AS (subtotal * (1 + tax_rate)) STORED;
```

**`pg_partman` partitioning.** When a table is huge, partitioning by date or tenant can give you the read performance benefit without denormalizing data.

**`tsvector` columns.** A denormalized search index, indexable with GIN. Used for full-text search without an external index.

**Arrays.** A `tags TEXT[]` column with a GIN index can be a 1NF-bending shortcut for "find posts with tag X." Good for tags and labels; bad for relations with their own attributes.

## Recap

- Default is 3NF. Denormalize only with a measured reason.
- Three motivations: read performance, historical accuracy, cross-service.
- Three sync mechanisms: app code, triggers, materialized views.
- Counter columns are the most common. Keep them in the same transaction; have a reconciliation job.
- Historical denormalization is write-once — snapshot at creation, never update.
- Cross-service caches are eventually consistent. Don't use for billing, compliance.
- Anti-patterns: denormalizing without profiling, copying whole records, no reconciliation.
- Postgres tools — generated columns, partitions, arrays, tsvector — give you denormalization with less risk.

Next: [Constraints](/notes/data-modeling/06-constraints) — the schema's last line of defense.

