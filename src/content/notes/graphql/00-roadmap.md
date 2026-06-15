---
title: "GraphQL Building — Roadmap"
subtitle: "Ten chapters that go from 'a query is just a string' to a self-hosted GraphQL server with batched resolvers, auth, subscriptions, and depth limits behind nginx."
chapter: 0
level: "beginner"
readingTime: "5 min"
topics: ["roadmap", "graphql", "schema", "resolvers", "dataloader", "federation"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What you will be able to do at the end

You will be able to design a real GraphQL schema, run a self-hosted server (graphql-yoga on Node — the same patterns translate to Go's `gqlgen` and Python's Strawberry), explain why your first version is slow and fix it with DataLoader, wire authentication into the resolver context, ship subscriptions over WebSockets, and deploy the whole thing behind nginx with depth and complexity limits that survive a hostile client.

<Callout type="info">

**Prereqs:** finish **REST API building** first. GraphQL is not a replacement for HTTP — it runs on top of it. You should also know basic Node (or whatever language you pick) and have a Postgres database to query. The **Web Server Fundamentals** track is helpful for the deployment chapter.

</Callout>

## The 10 chapters, in order

**Foundations**

1. **What GraphQL is and when to use it** — query language vs API style, vs REST
2. **Schema-first design** — types, queries, mutations, scalars, nullability
3. **Running your first server** — graphql-yoga end-to-end, in 60 lines
4. **Resolvers and the execution tree** — how a query becomes calls

**The classic problems**

5. **The N+1 problem** — why your first GraphQL server is 50× slower than REST
6. **DataLoader** — batching and per-request caching that actually fixes it
7. **Mutations, input types, validation** — writes done properly
8. **Authentication and authorization** — context, field-level checks, directives

**Production**

9. **Subscriptions over WebSockets** — realtime done right, on graphql-ws
10. **Production hardening and self-host** — depth/complexity limits, persisted queries, federation overview, behind nginx

## How to use this track

Read in order. The early chapters are conceptual; from chapter 3 onward you are running real servers and curling them. By chapter 6 you should be sceptical of any GraphQL article that does not mention DataLoader. Total reading time: ~2.5 hours. Hands-on time, the first time you build it all: a long weekend.

You need Node 20+, Postgres, and a domain pointed at a VPS for the deployment chapter. Everything else runs on `localhost`.

