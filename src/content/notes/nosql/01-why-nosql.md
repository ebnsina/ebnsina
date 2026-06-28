---
title: 'Why NoSQL'
subtitle: 'Where relational databases strain at scale, the four NoSQL families, ACID vs BASE, and the cases where NoSQL is the wrong answer.'
chapter: 1
level: 'beginner'
readingTime: '10 min'
topics: ['nosql', 'base', 'cap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A small-town post office sorts every letter by hand against a master address book — accurate, consistent, perfect for a town. Now imagine routing every letter on Earth through that one clerk and book. The system isn't wrong; it just doesn't scale. NoSQL is what happens when you accept that no single clerk can hold the whole world, so you split the work across many offices — and accept that two offices might briefly disagree about a forwarding address.

</Callout>

## Where Relational Hits Limits

Relational databases are excellent. They give you a flexible query language, strong consistency, and decades of tooling. The problems appear at the extremes of **scale** and at the boundaries of the **relational model itself**.

**Write throughput on a single primary.** Replication scales reads, not writes. Every write still funnels through one primary node. When a single machine can no longer absorb the write volume, you must shard — and SQL databases make sharding painful because cross-shard joins and transactions are hard.

**Rigid schema.** Changing a column on a billion-row table can lock it for a long time. Applications that evolve fast, or that store heterogeneous records, fight the schema constantly.

**The object-relational mismatch.** Your application thinks in nested objects; the relational model thinks in flat, normalized tables. Reassembling one logical object can mean joining five tables on every read.

**Some data is not tabular.** Deeply connected data (social graphs, recommendation networks) turns into recursive join nightmares. Time-series and append-heavy logs strain row-oriented storage.

NoSQL databases trade away parts of the relational model — joins, a rich query language, strong consistency, or a fixed schema — to win back **horizontal scalability**, **flexible structure**, or **specialized access patterns**.

## The Four Families

NoSQL is an umbrella over four genuinely different designs.

| Family      | Data shape                                    | Lookup by                  | Examples                      | Best for                       |
| ----------- | --------------------------------------------- | -------------------------- | ----------------------------- | ------------------------------ |
| Key-value   | Opaque value behind a key                     | Exact key                  | Redis, DynamoDB, Memcached    | Cache, sessions, counters      |
| Document    | Self-contained JSON document                  | Key or indexed fields      | MongoDB, Couchbase, Firestore | Evolving entities, content     |
| Wide-column | Rows of dynamic columns, grouped by partition | Partition + clustering key | Cassandra, Bigtable, ScyllaDB | Massive writes, time-series    |
| Graph       | Nodes connected by edges                      | Traversal from a node      | Neo4j, Neptune, JanusGraph    | Relationships, recommendations |

A key distinction: key-value, document, and wide-column stores are **aggregate-oriented**. They store a self-contained chunk of data per key and are happy as long as you access by that key. Graph databases are the opposite — they are built entirely around the connections _between_ records.

## ACID vs BASE

Relational databases promise **ACID** transactions:

- **Atomicity** — a transaction fully completes or fully rolls back.
- **Consistency** — every transaction moves the database from one valid state to another (constraints hold).
- **Isolation** — concurrent transactions don't see each other's partial work.
- **Durability** — once committed, data survives crashes.

Many distributed NoSQL stores instead embrace **BASE**, which is less a rigorous definition and more a philosophy:

- **Basically Available** — the system answers requests even during partial failure, possibly with stale data.
- **Soft state** — state can change over time even without new writes, as replicas converge.
- **Eventually consistent** — given no new writes, all replicas will eventually agree.

The reason for this trade-off is the **CAP theorem**: when a network partition splits your cluster (the `P`, which you cannot avoid in a distributed system), you must choose between **Consistency** (reject requests rather than serve stale data) and **Availability** (keep serving, accept temporary disagreement). ACID systems lean toward consistency; classic BASE systems lean toward availability.

<Callout type="tip">

**Note:** Modern NoSQL is rarely all-or-nothing. DynamoDB, Cassandra, and MongoDB all offer _tunable_ consistency — you choose per operation whether you want a fast, possibly-stale read or a slower, strongly-consistent one. CAP is a constraint, not a permanent product label. We cover tunable consistency in depth in chapter 7.

</Callout>

## A Worked Trade-off

Imagine a global shopping cart. With strong consistency, a user in Tokyo and a server in Virginia always see the identical cart — but the Tokyo user waits for a cross-Pacific round trip on every read. With eventual consistency, the Tokyo read hits a nearby replica instantly, at the risk that an item added one second ago in another tab hasn't propagated yet.

```text
Strongly consistent read:   correct now, ~150ms cross-region latency
Eventually consistent read: ~5ms local latency, may be a few seconds stale
```

For a shopping cart, eventual consistency is usually fine — a "merge carts" step at checkout fixes any divergence. For the final "charge this card" step, you want strong consistency. The lesson: consistency is a _per-operation_ business decision, not a database-wide religion.

## When NOT to Use NoSQL

NoSQL is not a default upgrade. Reach for relational when:

- **Your data is genuinely relational and queries are ad hoc.** If you need to slice data by arbitrary combinations of columns and you can't predict the questions in advance, SQL's query planner is exactly the tool you want.
- **You need multi-record ACID transactions.** Transferring money between two accounts, decrementing inventory while creating an order — these want true atomic transactions. Some NoSQL stores now offer limited transactions, but SQL does this best.
- **Your scale is moderate.** A well-indexed PostgreSQL instance handles tens of thousands of transactions per second and terabytes of data. Most applications never outgrow it. Adopting NoSQL "to be ready for scale" often just adds operational pain you never needed.
- **Strong consistency and referential integrity matter more than write throughput.** Foreign keys, unique constraints, and `CHECK` clauses catch bugs at the database layer that NoSQL pushes into your application code.

<Callout type="warning">

**Warning:** The most common NoSQL failure is adopting a document or wide-column store and then trying to use it like a relational database — emulating joins in application code, querying on unindexed fields, and expecting ad-hoc flexibility. You inherit all the constraints of NoSQL and none of the benefits. If you don't know your access patterns up front, that is a strong signal you should stay relational for now.

</Callout>

## The Real Decision

The honest framing is not "SQL or NoSQL" but "**which store fits this specific workload?**" A single product often uses several: PostgreSQL for orders, Redis for sessions, Elasticsearch for search, Neo4j for the recommendation graph. That is **polyglot persistence**, and it is the subject of the final chapter. For now, internalize one rule: choose the store after you understand the workload, never before.
