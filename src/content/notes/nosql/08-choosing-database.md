---
title: "Choosing the Right Database"
subtitle: "A decision framework, polyglot persistence, SQL vs each NoSQL family, the common mistakes, and how to match a workload to a store."
chapter: 8
level: "mastery"
readingTime: "12 min"
topics: ["polyglot", "decision", "tradeoffs"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

You don't own one vehicle for every trip. A bicycle for the corner shop, a sedan for the commute, a van for moving house, a truck for freight. Each is "best" only relative to a journey. Picking a database is the same: there is no universally best store, only the best fit for *this* workload's shape, scale, and consistency needs. The expert's skill is reading the journey before choosing the vehicle.

</Callout>

## Start With the Workload, Not the Database

Every database conversation that begins "should we use MongoDB / Cassandra / Postgres?" is starting in the wrong place. The right first questions are about the **workload**:

- **Access patterns** — do you query by known keys, or do you need ad-hoc filtering across arbitrary fields?
- **Relationships** — flat records, nested entities, or a densely connected graph?
- **Scale** — gigabytes and thousands of operations per second, or petabytes and millions?
- **Consistency** — must reads always be exact, or is brief staleness acceptable?
- **Read/write mix** — read-heavy, write-heavy, or append-only?
- **Query flexibility** — are the queries known in advance, or will analysts slice the data in unpredictable ways?

Only after answering these does a store suggest itself. The database is the *conclusion* of the analysis, never its premise.

## A Decision Framework

Walk the workload through these gates:

```text
1. Do you need ad-hoc queries, multi-record ACID transactions,
   and strong referential integrity, at moderate scale?
       → Relational (PostgreSQL). Default. Don't overthink it.

2. Is the data a densely connected graph, and are your key
   questions about paths and relationships (recommendations, fraud)?
       → Graph (Neo4j).

3. Do you have massive write volume and predictable, key-based
   access patterns, needing linear horizontal scale (time-series, logs)?
       → Wide-column (Cassandra / Bigtable).

4. Are your entities self-contained nested documents that evolve
   fast, read mostly by id or indexed field?
       → Document (MongoDB).

5. Do you need the simplest, fastest possible lookup by a known
   key — cache, sessions, counters, ephemeral data?
       → Key-value (Redis / DynamoDB).
```

The ordering is deliberate: **start at relational and move away only when a concrete requirement forces you.** "We might need scale someday" is not a requirement; "we ingest 500k writes per second of telemetry today" is.

## SQL vs Each NoSQL Family

| Need | Relational | Key-value | Document | Wide-column | Graph |
|---|---|---|---|---|---|
| Ad-hoc queries | Excellent | None | Good | Poor | Poor |
| Joins / relationships | Excellent | None | Manual | None | Excellent (traversal) |
| Horizontal write scale | Hard | Excellent | Good | Excellent | Hard |
| Flexible / evolving schema | Rigid | N/A | Excellent | Flexible | Flexible |
| Strong consistency | Excellent | Varies | Tunable | Tunable | Good |
| Lookup latency by key | Good | Excellent | Good | Good | N/A |
| Best at | Integrity + flexibility | Speed + simplicity | Whole-entity reads | Write volume + scale | Connectedness |

No row is all "Excellent" — every store trades something. Reading this table the right way means noticing which weaknesses your workload *doesn't care about*. A telemetry pipeline shrugs at "no ad-hoc queries"; a graph store's shaky horizontal scaling is irrelevant if your graph fits comfortably on a few nodes.

## Polyglot Persistence

Mature systems rarely use one database. **Polyglot persistence** means deliberately using several stores, each for the part of the workload it fits. A single e-commerce platform might run:

```text
PostgreSQL    → orders, payments, inventory   (ACID, integrity)
Redis         → sessions, cart, rate limits   (speed, TTL)
MongoDB       → product catalog                (flexible, nested)
Elasticsearch → product search                 (full-text, relevance)
Cassandra     → clickstream / event log        (write volume, scale)
Neo4j         → "customers also bought"        (recommendation graph)
```

The benefit is using the best tool for each job; the cost is real **operational complexity** — more systems to run, monitor, back up, and keep in sync — plus the hard problem of consistency *across* stores (often solved with event streaming or change-data-capture rather than distributed transactions).

<Callout type="tip">

**Note:** Polyglot persistence is a destination, not a starting point. A new product should usually launch on a single, well-understood database (almost always PostgreSQL) and adopt a second store only when a specific workload demonstrably outgrows the first. Every additional database is permanent operational weight — add it because a real pain forces you to, not because the architecture diagram looks impressive.

</Callout>

## Common Mistakes

**Choosing NoSQL for scale you don't have.** A tuned PostgreSQL instance handles enormous load. Most products never approach its limits, yet adopt NoSQL "to be ready" and inherit operational pain and modeling constraints for a problem they never had.

**Using a NoSQL store like a relational one.** Normalizing into many collections and emulating joins in application code throws away the NoSQL advantage and pays distributed-join costs SQL engines handle far better. If you want joins, you wanted SQL.

**Modeling before knowing access patterns.** NoSQL demands access-pattern-first design. Picking a document or wide-column store without knowing your queries leads to data you physically cannot query efficiently later.

**Ignoring consistency implications.** Reaching for an eventually-consistent store and then writing logic that assumes read-your-writes produces intermittent, maddening bugs. Match each operation's consistency level to what it actually needs.

**Over-fragmenting too early.** Six databases for a product with a thousand users is not sophistication; it is six things that can break at 3 a.m.

<Callout type="warning">

**Warning:** "We chose NoSQL because it's web-scale / modern / what the big companies use" is not an engineering reason. The big companies adopted these stores to solve specific, extreme problems — and they kept relational databases for everything else. Cargo-culting their database choices without their workloads gives you their complexity without their problems. Choose for *your* workload.

</Callout>

## Matching Workload to Store: Quick Cases

- **User accounts, billing, orders** — relational. Integrity and transactions are the whole point.
- **Session and cache layer** — key-value (Redis). Fast, ephemeral, TTL-driven.
- **Product catalog / CMS** — document (MongoDB). Nested, evolving, read by id.
- **IoT / metrics / event logs** — wide-column (Cassandra) or a time-series database. Append-heavy at scale.
- **Recommendations / fraud / social graph** — graph (Neo4j). Relationship-first questions.
- **Full-text search** — a search engine (Elasticsearch / OpenSearch). Relevance ranking, not a general database.

## The Mastery Mindset

You have come full circle from chapter 1. The question was never "is NoSQL better than SQL?" — it was always "**what does this specific workload need, and which store delivers it with the fewest trade-offs?**" Default to relational, reach for a NoSQL family when a concrete requirement forces the move, model around your access patterns, set consistency per operation, and combine stores only when the workload truly demands it. Do that, and you will choose databases like an engineer instead of a follower of trends.
