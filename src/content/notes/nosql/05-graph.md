---
title: "Graph Databases"
subtitle: "Nodes, edges, and properties as first-class citizens. Neo4j and Cypher, traversals, and the queries where graphs leave joins in the dust."
chapter: 5
level: "advanced"
readingTime: "11 min"
topics: ["graph", "neo4j", "traversal"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A detective's corkboard: photos of people pinned up, strings connecting them — "knows," "called," "paid." To answer "who connects the suspect to the victim?" the detective doesn't flip through a card catalog cross-referencing tables; they follow the strings from one photo to the next. A graph database stores data exactly like that board. The connections are not computed on demand from foreign keys — they are physical links the engine walks directly, which is why following relationships is its superpower.

</Callout>

## Nodes, Edges, Properties

A graph database models data as a **property graph** with three elements:

- **Nodes** — the entities (a person, a product, an account). Nodes carry **labels** (their type) and **properties** (key-value attributes).
- **Edges** (relationships) — typed, **directed** connections between nodes. Edges are first-class: they have a type, a direction, and their own properties.
- **Properties** — key-value data on either nodes or edges.

```text
(Person {name: "Zubaida"})  -[:FOLLOWS {since: 2024}]->  (Person {name: "Idris"})
(Person {name: "Zubaida"})  -[:PURCHASED {date: ...}]->  (Product {sku: "BK-101"})
```

The defining feature is **index-free adjacency**: each node stores direct pointers to its neighbor nodes. Hopping from one node to its neighbors costs the same no matter how large the overall graph is — you follow pointers, you don't search an index. This is what makes deep relationship queries fast where SQL would grind.

## Why Graphs Beat Joins

In a relational database, a relationship is a foreign key, and traversing it is a **join**. One join is cheap. But "friends of friends of friends" is three joins, each multiplying intermediate rows, and the cost grows explosively with depth. A query five or six hops deep can be effectively un-runnable on a relational schema.

```text
Relational "friends of friends of friends":
   JOIN friendships f1 ... JOIN friendships f2 ... JOIN friendships f3 ...
   cost grows with the size of the tables at every hop

Graph equivalent:
   start at one node, follow FOLLOWS edges out 3 times
   cost grows only with the number of neighbors actually visited
```

The rule of thumb: a graph database wins when your queries are about the **connections between data**, especially **variable-depth** or **path-finding** queries, rather than about filtering and aggregating flat records. For one- or two-hop relationships on tabular data, a relational database is usually simpler and just as fast — don't reach for a graph store prematurely.

## Neo4j and Cypher

Neo4j is the most widely used graph database. Its query language, **Cypher**, is built around ASCII-art patterns: nodes in parentheses, relationships in square brackets with arrows showing direction.

```text
// Create nodes and a relationship
CREATE (m:Person {name: "Zubaida"})
CREATE (a:Person {name: "Idris"})
CREATE (m)-[:FOLLOWS {since: 2024}]->(a)

// Find who Zubaida follows
MATCH (m:Person {name: "Zubaida"})-[:FOLLOWS]->(target)
RETURN target.name

// Friends-of-friends Zubaida does NOT already follow (recommendation)
MATCH (m:Person {name: "Zubaida"})-[:FOLLOWS]->()-[:FOLLOWS]->(fof)
WHERE NOT (m)-[:FOLLOWS]->(fof) AND fof <> m
RETURN fof.name, count(*) AS mutuals
ORDER BY mutuals DESC
```

Read the patterns left to right as a sentence: "match a Person named Zubaida, who follows someone, who follows a friend-of-friend." The arrow direction matters — `-[:FOLLOWS]->` is not the same as `<-[:FOLLOWS]-`. This declarative, visual style makes traversal queries dramatically clearer than the equivalent nested SQL joins.

## Traversals and Path Finding

Beyond fixed-depth patterns, graphs shine at **variable-length** traversals and shortest-path queries — exactly the questions that are painful or impossible in SQL.

```text
// Variable depth: anyone reachable from Zubaida within 1 to 4 FOLLOWS hops
MATCH (m:Person {name: "Zubaida"})-[:FOLLOWS*1..4]->(reachable)
RETURN DISTINCT reachable.name

// Shortest path between two people through any relationship
MATCH p = shortestPath(
  (a:Person {name: "Zubaida"})-[*]-(b:Person {name: "Bilal"})
)
RETURN p
```

The `*1..4` syntax says "follow this relationship between one and four times." Expressing that in SQL means either an unbounded recursive CTE or a fixed cascade of self-joins — both awkward, both slow. The graph engine walks pointers and stops when it arrives, so cost tracks the paths actually explored, not the size of the tables.

<Callout type="tip">

**Note:** A graph database's advantage is *local* traversal, not *global* scanning. "Find the recommendation path from this user to that product" is a graph's sweet spot. "Sum revenue by region for last quarter" is an analytical aggregation — a columnar/SQL warehouse does that far better. Use the graph for connectedness questions, not for bulk number-crunching.

</Callout>

## When Graphs Win

Three domains where graph databases are the natural fit:

**Recommendations.** "People who bought what you bought also bought…" is a two-hop traversal: from you, to your purchases, to other buyers, to *their* purchases. Collaborative filtering is a graph walk.

**Fraud detection.** Fraud rings share devices, addresses, and cards. A single transaction looks clean; the *pattern of connections* — many accounts funneling through one device — is the signal. Graph queries surface those rings by following shared-attribute edges in real time.

**Social networks and access control.** Friend graphs, "mutual connections," and "who can reach this document through a chain of permissions" are inherently relationship queries. Network and dependency graphs (microservice call maps, package dependencies) fit the same shape.

<Callout type="warning">

**Warning:** Graph databases are specialists. They are not built for high-volume key lookups, bulk analytics, or storing large opaque blobs, and they generally don't scale horizontally as effortlessly as wide-column stores — partitioning a graph across machines while keeping traversals fast is genuinely hard. Introduce a graph database for the part of your system that is *about* relationships, and keep the rest of your data in whatever store fits it best. That mix-and-match approach is polyglot persistence, the subject of chapter 8.

</Callout>

The mental test is simple: if the most valuable questions you ask start with "how is X connected to Y?" or "what's the path from A to B?", a graph database will answer them faster and far more legibly than any pile of joins.
