---
title: "Data Modeling for NoSQL"
subtitle: "Access-pattern-first design, deliberate denormalization, single-table design in DynamoDB, and relationships when there are no joins."
chapter: 6
level: "advanced"
readingTime: "13 min"
topics: ["access patterns", "single-table", "denormalization"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A library can shelve books by subject *or* by author *or* by publication year — but only one at a time on the physical shelf. To make every kind of search fast, librarians build card catalogs: pre-sorted index cards, one drawer per way you might search. NoSQL modeling is the same move. You can't reshuffle the shelf per query, so you decide up front every way you'll look things up and physically arrange (and duplicate) the data to make each lookup a single grab.

</Callout>

## Access-Pattern-First Design

Relational modeling starts with the *data*: identify entities, normalize them, and trust the query planner to assemble any question later. NoSQL modeling inverts this. You start with the *questions* and arrange storage so each one is a direct lookup, because there is no general-purpose join engine to lean on.

The process:

1. **Enumerate every access pattern.** Write them as concrete sentences: "get a user by id," "list a user's orders newest-first," "get an order with its line items," "find all orders containing SKU X."
2. **Note the frequency and latency budget of each.** The hot path deserves the most design effort.
3. **Design storage so the hot patterns are single-key (or single-partition) reads.** Shape documents, partition keys, and duplicated tables to match.
4. **Add secondary indexes for the rarer patterns.**

If you cannot list your access patterns, you are not ready to model in NoSQL — that uncertainty is precisely what a relational database's flexibility is for.

## Denormalization and Duplication

Relational modeling prizes normalization: store each fact once, reference it everywhere. NoSQL deliberately does the opposite — it **duplicates** data so reads don't have to join.

Consider showing an order with the customer's name. Normalized, the order holds only `customerId` and you fetch the customer separately. Denormalized, you copy the name into the order:

```json
{
  "orderId": "8841",
  "customerId": "cust_42",
  "customerName": "Mira",
  "total": 35
}
```

Now rendering the order is one read. The cost surfaces on writes: if Mira renames herself, every order carrying `customerName` is stale until you update it. You accept that trade because, for most workloads, reads vastly outnumber that kind of write, and a slightly stale display name is harmless.

Denormalization is a deliberate exchange: **cheaper reads and write fan-out, in return for write amplification and the burden of keeping copies in sync.** The skill is choosing *which* fields to duplicate — copy the small, hot, display-only fields; reference the large, volatile, or rarely-shown ones.

<Callout type="tip">

**Note:** Duplicate data you read often and update rarely. A user's display name (read on every order, changed almost never) is a great duplication candidate. A user's account balance (changes constantly, must be exact) is a terrible one — never duplicate the source of truth for something that must stay strictly correct.

</Callout>

## Single-Table Design (DynamoDB)

DynamoDB's most powerful and counterintuitive pattern is putting *multiple entity types in one table*. Because a query can only hit one table and one partition efficiently, the way to fetch related entities together is to make them **share a partition**.

The trick is overloaded, generic keys — `PK` (partition) and `SK` (sort) — whose meaning is encoded by a prefix:

```json
{ "PK": "USER#42", "SK": "PROFILE",      "name": "Mira", "tier": "gold" }
{ "PK": "USER#42", "SK": "ORDER#8841",   "total": 35,    "status": "shipped" }
{ "PK": "USER#42", "SK": "ORDER#8842",   "total": 12,    "status": "pending" }
{ "PK": "USER#42", "SK": "ADDRESS#home", "city": "Dhaka" }
```

All of user 42's items live in one partition. Now a single query answers several questions at once:

```text
# Everything about user 42 (profile, orders, addresses) — one query
Query: PK = "USER#42"

# Just user 42's orders — one query, using the SK prefix
Query: PK = "USER#42" AND begins_with(SK, "ORDER#")

# Just the profile — one item
GetItem: PK = "USER#42", SK = "PROFILE"
```

For access patterns that don't start from the partition key — say "all `pending` orders across every user" — you add a **Global Secondary Index (GSI)** that re-partitions the same items by a different key (here, `status`). Each GSI is, in effect, another card-catalog drawer over the same data.

Single-table design is dense and unintuitive, and it is justified only when single-digit-millisecond latency at massive scale matters. For smaller systems it is over-engineering — but understanding it reveals the core NoSQL lesson: **the key structure *is* the data model.**

## Relationships Without Joins

Without a `JOIN` keyword, you model relationships structurally. The right technique depends on cardinality.

**One-to-few (bounded):** embed the children in the parent.

```json
{ "orderId": "8841", "items": [ { "sku": "BK-101", "qty": 1 }, { "sku": "PN-007", "qty": 3 } ] }
```

**One-to-many (unbounded):** keep children as separate items sharing the parent's partition (single-table), or reference by id and query a secondary index.

```json
{ "PK": "USER#42", "SK": "ORDER#8841" }
{ "PK": "USER#42", "SK": "ORDER#8842" }
```

**Many-to-many:** store the link as its own item(s), often duplicated so the relationship is fast to read from *both* directions.

```json
// "student 7 is enrolled in course 9" — written both ways for two-direction reads
{ "PK": "STUDENT#7", "SK": "COURSE#9" }
{ "PK": "COURSE#9", "SK": "STUDENT#7" }
```

The pattern repeats across families: in MongoDB you choose embed-vs-reference; in Cassandra you build one table per direction of the relationship; in DynamoDB you co-locate by partition. In all of them, **the relationship is something you physically arrange and maintain, not something the database derives on the fly.**

## A Worked Modeling Session

Suppose a SaaS app needs: get a workspace; list a workspace's projects; list a project's tasks; and "show me all tasks assigned to me across all projects."

The first three are a clean hierarchy — co-locate them by workspace and project so each is a single-partition read:

```json
{ "PK": "WS#acme",            "SK": "META",            "name": "Acme" }
{ "PK": "WS#acme",            "SK": "PROJ#web",        "name": "Website" }
{ "PK": "WS#acme#PROJ#web",   "SK": "TASK#101",        "title": "Fix nav", "assignee": "u_42" }
{ "PK": "WS#acme#PROJ#web",   "SK": "TASK#102",        "title": "Add auth", "assignee": "u_19" }
```

The fourth pattern cuts *across* the hierarchy — it doesn't start from a workspace or project, so no partition serves it. That is the textbook case for a secondary index keyed by assignee:

```text
GSI:  PK = ASSIGNEE#u_42   →   returns every task assigned to u_42, any project
```

Notice the rhythm: hierarchical reads fall out of the key design; cross-cutting reads each get an index. You did not write a single join — you arranged the data so the questions answer themselves.

<Callout type="warning">

**Warning:** The cardinal sin of NoSQL modeling is reproducing a normalized relational schema and then emulating joins in application code — fetching a list of ids, then looping to fetch each one (the "N+1" pattern across the network). It is slow, fragile, and throws away the reason you chose NoSQL. If your design needs joins on every read, either denormalize so the read is one lookup, or admit the workload wanted a relational database and use one.

</Callout>

Model around how you read, duplicate what you read often and change rarely, and make every relationship a deliberate structure. Do that and NoSQL gives you predictable performance at any scale. Skip it and you build a slower, buggier relational database with none of the guardrails.
