---
title: "Document Databases"
subtitle: "Store whole entities as JSON documents. MongoDB, the embedding vs referencing decision, indexing, and designing schemas around how you read."
chapter: 3
level: "intermediate"
readingTime: "12 min"
topics: ["document", "mongodb", "embedding"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A relational database is a stack of forms in separate drawers: the customer form here, the order forms there, the line-item slips somewhere else. To understand one purchase you walk to several drawers and staple copies together. A document database keeps a manila folder per customer with everything tucked inside — the order, its line items, the shipping note — so one pull gives you the whole story. The trade-off: if the customer's address appears in twelve folders, updating it means opening all twelve.

</Callout>

## The Document Model

A document database stores data as **documents** — self-describing, nested records, usually JSON (MongoDB stores a binary form called BSON). Unlike a key-value store, the database *understands* the document's structure and can index and query fields inside it.

```json
{
  "_id": "order_8841",
  "customer": { "id": "cust_42", "name": "Mira", "tier": "gold" },
  "items": [
    { "sku": "BK-101", "title": "NoSQL Notes", "qty": 1, "price": 29 },
    { "sku": "PN-007", "title": "Gel Pen", "qty": 3, "price": 2 }
  ],
  "total": 35,
  "status": "shipped",
  "createdAt": "2026-06-15T10:00:00Z"
}
```

Notice how much lives in one document: customer summary, every line item, totals. In a relational design this would be three or four tables joined together. Here it is a single read. Documents are **schema-flexible** — two documents in the same collection can have different fields — which makes evolving an application painless: add a field to new documents and backfill old ones lazily.

## MongoDB Basics

MongoDB is the dominant document database. Documents live in **collections** (loosely, "tables"), and you query with a JSON-shaped filter language.

```javascript
// Insert a document
db.orders.insertOne({ customer: { id: "cust_42" }, total: 35, status: "shipped" });

// Find with a filter — note querying into nested fields with dot notation
db.orders.find({ "customer.id": "cust_42", status: "shipped" });

// Query an array element and project specific fields
db.orders.find(
  { "items.sku": "BK-101" },
  { total: 1, status: 1 }
);

// Update one field without touching the rest of the document
db.orders.updateOne(
  { _id: "order_8841" },
  { $set: { status: "delivered" } }
);
```

MongoDB also has an **aggregation pipeline** for grouping, joining (`$lookup`), and transforming documents — powerful, but if you lean on it constantly your data may be modeled wrong for your access pattern.

## Embedding vs Referencing

This is *the* central decision in document modeling. You either **embed** related data inside the parent document, or **reference** it by storing an id and fetching it separately.

**Embedding** — nest the child inside the parent:

```json
{
  "_id": "post_9",
  "title": "Why NoSQL",
  "comments": [
    { "author": "alex", "text": "great post" },
    { "author": "sam", "text": "thanks!" }
  ]
}
```

One read returns the post and its comments. Embedding wins when the child data is **owned by, read with, and bounded relative to** the parent.

**Referencing** — store an id and fetch separately:

```json
{ "_id": "post_9", "title": "Why NoSQL", "authorId": "user_42" }
{ "_id": "user_42", "name": "Mira", "tier": "gold" }
```

Referencing wins when the related data is **shared, large, or unbounded**.

| Choose | When |
|---|---|
| Embed | One-to-few, read together, child has no life of its own, bounded size |
| Reference | One-to-many/unbounded, shared across documents, large, queried independently |

<Callout type="tip">

**Note:** Documents in MongoDB have a 16 MB size limit, which makes "embed everything" dangerous. A blog post can embed its first handful of comments, but a viral post with 200,000 comments would blow the limit and make every read enormous. Embed the bounded, hot data; reference the unbounded tail.

</Callout>

## Worked Example: The Author Problem

Consider posts and authors. If you embed the author's full profile inside every post, reads are fast and self-contained — but when the author renames themselves, you must update every post they ever wrote. If you reference the author by id, the rename touches one document, but rendering a post now needs a second lookup.

The right answer depends on the ratio of reads to that kind of write, and how stale the duplicated data may be. A common middle path is to **embed a snapshot of just the fields you display** (name, avatar) and reference the id for everything else — accepting that the snapshot may lag a profile edit by a little. This duplication-for-read-speed pattern is at the heart of NoSQL modeling, covered fully in chapter 6.

## Indexing

Without indexes, a query scans every document in the collection — fine for hundreds of documents, fatal for millions. An index is a sorted structure (a B-tree) that turns a scan into a fast lookup, exactly like in SQL.

```javascript
// Single-field index
db.orders.createIndex({ "customer.id": 1 });

// Compound index — supports queries filtering on status then sorting by date
db.orders.createIndex({ status: 1, createdAt: -1 });

// See whether a query used an index or scanned the collection
db.orders.find({ status: "shipped" }).explain("executionStats");
```

Two rules carry most of the weight. First, **every field you filter or sort on in a frequent query needs an index** — check with `explain` and watch for a full `COLLSCAN`. Second, compound index order matters: a `{ status, createdAt }` index helps queries that filter by `status` (optionally then sorting by `createdAt`), but does *not* efficiently serve a query that filters only by `createdAt`. Indexes cost write throughput and storage, so index for your real queries, not hypothetical ones.

## Schema Design by Access Pattern

The biggest mindset shift from relational: in SQL you normalize first and query later; in document modeling you start from the **access pattern**. Ask "what does the screen need to render in one read?" and shape the document to answer that in a single query.

A worked progression:

1. **List your queries.** "Show an order with its line items." "Show a user's last 20 orders." "Show all orders containing SKU X."
2. **Shape documents so the hottest query is one read.** Order with line items embedded satisfies query one with zero joins.
3. **Add indexes for the secondary queries.** An index on `customer.id` plus `createdAt` serves query two; an index on `items.sku` serves query three.
4. **Decide what to duplicate.** Embed the display-name snapshot if rendering needs it; accept the update cost.

<Callout type="warning">

**Warning:** The classic document-database antipattern is treating MongoDB like a relational database — many small, fully-normalized collections stitched together with `$lookup` joins on every request. You lose the document model's main advantage (the single-read whole entity) and pay distributed-join costs SQL engines are far better optimized for. If your design has joins everywhere, either embed more aggressively or ask whether you wanted a relational database all along.

</Callout>

Done right, a document database gives you the developer ergonomics of working with objects, schema flexibility for fast iteration, and single-read access to whole entities. The price is that you, not the database, are now responsible for managing duplication and relationships.
