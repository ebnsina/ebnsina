---
title: 'Entities, attributes, relationships'
subtitle: 'Before SQL, before ORMs, draw the boxes and lines. ER thinking is twenty minutes that saves a year of refactoring.'
chapter: 2
level: 'beginner'
readingTime: '11 min'
topics: ['data-modeling', 'er-diagrams', 'relationships', 'cardinality']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

The cheapest debugging tool in data modeling is a pencil. Before you write `CREATE TABLE`, draw a sketch — boxes for things, lines between them, arrowheads for direction, words for cardinality. Twenty minutes of sketching uncovers ambiguities that two months of code can't fix.

This chapter is the small vocabulary you need to think in entities and relationships, plus the four shapes of relationship that cover 95% of real models.

<Callout type="info">

**Real-World Analogy**

A social network in real life — people (entities) connected by relationships like "works with" or "is married to".

</Callout>

## The vocabulary

**Entity** — a thing the system knows about. _User_, _Order_, _Listing_, _Comment_. In SQL, usually a table.

**Attribute** — a property of an entity. _email_, _name_, _created_at_. In SQL, a column.

**Relationship** — how two entities relate. _A user has many orders._ _A listing belongs to one seller._ In SQL, foreign keys (or a join table).

**Cardinality** — how many of one side relate to how many of the other. The four shapes:

| Cardinality | Example                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| 1 : 1       | a `user` has exactly one `user_settings` row                                  |
| 1 : N       | a `user` has many `orders`; each order has one `user`                         |
| N : 1       | flip of 1 : N                                                                 |
| N : M       | a `user` favorites many `listings`; each listing is favorited by many `users` |

That's the whole vocabulary. Five terms.

## Drawing it

Two pragmatic notations.

**ER diagram (formal).** Boxes with attributes inside; lines between with crow's-foot symbols for cardinality.

**Mermaid (in-code).** Markdown-friendly:

```
erDiagram
  USER ||--o{ ORDER : places
  USER ||--o{ LISTING : sells
  LISTING ||--o{ ORDER : "ordered as"
  USER }o--o{ LISTING : favorites
```

Read: `||--o{` is one-to-many; `}o--o{` is many-to-many. The arrows aren't important — the symbols at each end are.

**Whiteboard sketch (fastest).** Just boxes, lines, and "1" or "N" labels. No tooling required. For 80% of design conversations, this is what you actually use.

Pick one and use it consistently. The sketch is for _you_ and the people you're designing with. It's not deliverable; it's a thinking aid.

## Identifying entities — the test

Two ways to know something is an entity vs an attribute.

**Test 1: Does it have its own life?** A user logs in, gets emailed, has settings. Independent existence → entity. A user's _birthday_ doesn't have settings or get emailed; it's just a date attached to the user → attribute.

**Test 2: Will it have its own children?** An _address_ sounds like an attribute on a user. But what if a user has multiple addresses (shipping, billing)? Now `address` has its own children — it's an entity (`addresses` table) with `user_id` foreign key.

When in doubt, start as an attribute. Promoting to an entity later is a one-step migration; demoting an entity to an attribute is rarely the right move.

## The four shapes

### 1 : 1 — used sparingly

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, ...);
CREATE TABLE user_settings (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  ...
);
```

`user_settings.user_id` is both the primary key _and_ the foreign key. Each user has exactly one row in `user_settings`. Why split:

- **Performance / row width.** A `users` table with 30 columns and one of them is a 50KB JSON blob queried rarely — split the blob into a separate table.
- **Optionality.** Settings exist only after the user opens the settings page. The presence/absence of a row signals state.
- **Different access patterns.** Settings are read once per session; user identity is read on every request.

Most 1:1 relationships are a sign you should just add columns to the parent table. Reach for separate tables only when one of the three reasons applies.

### 1 : N — the workhorse

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, ...);
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  buyer_id BIGINT NOT NULL REFERENCES users(id),
  ...
);
```

The foreign key lives on the "many" side. One user, many orders.

The decision points:

- **`ON DELETE` behavior.** Choose deliberately (chapter 6 covers this).
- **Indexed?** Yes — always index the foreign key. `CREATE INDEX ON orders(buyer_id);`. Without it, "find all orders for user 42" is a full table scan.
- **Required or optional?** `NOT NULL` says every order must have a buyer. Nullable says some orders are buyer-less ("guest checkout"). Be explicit.

### N : 1 — same shape, different question

`N : 1` is just `1 : N` viewed from the many side. "An order belongs to one user" vs "a user has many orders" is the same relationship.

The question this framing surfaces: **how do I get the parent from the child?** A SQL JOIN by the foreign key. If that's a hot path, the foreign key index is the difference between a 1ms query and a 1s query.

### N : M — needs a join table

There's no way to express "many-to-many" as a single foreign key. You need a third table.

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, ...);
CREATE TABLE listings (id BIGSERIAL PRIMARY KEY, ...);

CREATE TABLE user_listing_favorites (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
```

The join table:

- **Composite primary key** of both foreign keys ensures no duplicate favorites.
- **`ON DELETE CASCADE` on both sides** — when either user or listing is deleted, favorites disappear. Usually the right choice.
- **Often gets its own attributes.** `created_at` is normal. Sometimes a `note` field. The join table starts as glue and grows into its own entity.

Index both foreign keys (Postgres only auto-indexes the leading column of the composite PK):

```sql
CREATE INDEX ON user_listing_favorites(listing_id);
```

Without this index, "who favorited this listing?" is a full scan.

<Callout type="tip">

**Always name N:M tables explicitly.** `user_listing_favorites` reads better than `users_listings`. Including the verb makes the intent clear and avoids name conflicts when the same pair has multiple relationships ("favorites" vs "blocks" vs "follows").

</Callout>

## When relationships need their own attributes

Sometimes the relationship itself has properties that don't belong on either entity.

```sql
CREATE TABLE org_memberships (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      BIGINT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner','admin','member','guest')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by  BIGINT REFERENCES users(id),
  PRIMARY KEY (user_id, org_id)
);
```

`role` doesn't belong on `users` (a user can have different roles in different orgs) or on `orgs` (an org has many roles, one per member). It belongs on the _membership_ — the relationship itself.

When the join table starts to feel like a real entity, give it its own surrogate key (chapter 3) and let it grow:

```sql
CREATE TABLE org_memberships (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      BIGINT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);
```

Now memberships have their own ID, and the unique constraint preserves "no duplicates." Both forms are valid; the second is more flexible.

## Polymorphic relationships — usually a smell

A common temptation:

```sql
CREATE TABLE comments (
  id BIGSERIAL PRIMARY KEY,
  commentable_type TEXT NOT NULL,  -- 'post', 'photo', 'video'
  commentable_id   BIGINT NOT NULL,
  body TEXT NOT NULL
);
```

"A comment can attach to a post, a photo, or a video." Looks elegant. Has three problems:

1. **No foreign key constraint.** `commentable_id` references a different table depending on `commentable_type`. The DB cannot enforce that the row exists. Orphan comments accumulate.
2. **Hard to query.** "All commented-on items" needs a UNION across multiple tables, joined back to comments.
3. **Indexes are awkward.** A `(commentable_type, commentable_id)` index works but loses some optimizer awareness.

Better: a comment table per parent type, or one table with explicit nullable FKs:

```sql
CREATE TABLE comments (
  id BIGSERIAL PRIMARY KEY,
  body TEXT NOT NULL,
  post_id  BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  photo_id BIGINT REFERENCES photos(id) ON DELETE CASCADE,
  video_id BIGINT REFERENCES videos(id) ON DELETE CASCADE,
  CHECK (
    (post_id IS NOT NULL)::int +
    (photo_id IS NOT NULL)::int +
    (video_id IS NOT NULL)::int = 1
  )
);
```

Three nullable FKs; CHECK enforces exactly one is set. Real foreign keys, real cascade behavior. Slightly more columns; correct.

For very dynamic systems (many parent types added at runtime), a single-table polymorphic design with rigorous app-level checks may be the only option. But avoid it as the default.

## Self-referencing relationships

A user follows another user. A folder contains other folders. A reply belongs to a parent comment. The trick: the foreign key points to the same table.

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  ...
);

CREATE TABLE follows (
  follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
```

Two columns referencing the same table; CHECK prevents self-follows.

For tree structures — categories with subcategories, comment threads — a `parent_id` self-FK is the simple shape:

```sql
CREATE TABLE comments (
  id        BIGSERIAL PRIMARY KEY,
  parent_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
  ...
);
```

This is a classic adjacency list. Fine for trees up to a few thousand nodes. Deeper or wider trees benefit from path-based or recursive-CTE patterns covered in advanced data-modeling material.

## Modeling tips that pay off

**Name relationships clearly.** `seller_id` reads better than `user_id` when a listing belongs to a "seller." If a user can be both buyer and seller, both names communicate intent.

**Two FKs to the same table need different names.** `order` having `buyer_id` and `seller_id` (both → `users.id`) is the standard shape. Don't reuse `user_id`.

**Don't denormalize FKs into both ends.** A common trap: putting `latest_order_id` on `users` so you don't have to query the orders table. Now you have two sources of truth that drift. Denormalize only when you measure a real read-pattern win (chapter 5).

**Keep the cardinality honest.** If you mark a relationship as 1:1 but later need 1:N, the migration is painful. Defaulting to 1:N (extra table) for unclear cases gives you flexibility.

## Recap

- Five terms: entity, attribute, relationship, cardinality, primary key.
- Four shapes: 1:1, 1:N, N:1, N:M. Sketch them before writing SQL.
- 1:1 is rare and usually wrong — combine into one table unless there's a real reason.
- 1:N is the workhorse. Foreign key on the many side. Always indexed.
- N:M needs a join table; composite PK; index both columns.
- Join tables that grow attributes become real entities with their own ID.
- Polymorphic FKs are usually a smell — prefer multiple typed FKs.
- Self-references are a CHECK away from broken — guard against `id = parent_id`.
- Naming and explicit cardinality save you the most rework.

Next: [Keys](/notes/data-modeling/03-keys) — picking the identifier that ages well.
