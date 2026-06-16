---
title: "What GraphQL is and when to use it"
subtitle: "GraphQL is not a database, not a transport, and not a replacement for HTTP. It is a query language and a typed contract — and that distinction shapes every decision you make from here on."
chapter: 1
level: "beginner"
readingTime: "10 min"
topics: ["graphql", "rest", "api design", "schema"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

You have used REST. You know what `GET /api/users/42` returns: whatever the server decides to return. If you wanted only the user's name, you got the whole object anyway. If you wanted the user *and* their last five posts, you made two requests. If a mobile screen needed seven things, you made seven requests or built a custom `/api/mobile/dashboard` endpoint that nobody else used.

GraphQL is the answer to "what if the client could just ask for what it needs, in one round trip, over a typed contract." That is the entire pitch. Everything else — schemas, resolvers, federation — is plumbing in service of that idea.

<Callout type="info">

**Real-World Analogy**

GraphQL is like ordering exactly what you want from a menu versus getting a fixed meal — you specify the shape of the data you need.

</Callout>

## A request worth looking at

Here is a GraphQL request. It is just a `POST` to `/graphql` with a JSON body:

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ user(id: 42) { name posts(last: 5) { title createdAt } } }"
  }'
```

The response:

```json
{
  "data": {
    "user": {
      "name": "Sumayya",
      "posts": [
        { "title": "Why I left Kubernetes", "createdAt": "2026-04-12" },
        { "title": "Self-hosting is a skill", "createdAt": "2026-04-08" }
      ]
    }
  }
}
```

One round trip. Exactly the fields asked for. The response shape mirrors the query shape — that is not an accident, that is the whole language.

## What GraphQL is, technically

A **query language** with a **type system**. That is it. The server publishes a schema (the contract), the client sends queries written against that schema, and an execution engine resolves each requested field by calling code you wrote.

GraphQL does **not** replace:

- **HTTP** — it runs on top. Almost always `POST /graphql`. Sometimes `GET` for cacheable queries. Subscriptions ride on WebSockets.
- **Your database** — GraphQL has no opinion about storage. Resolvers call whatever (Postgres, Redis, another HTTP API).
- **Authentication** — there is no `auth` keyword. You wire it in via context, same as REST middleware.
- **Caching** — no built-in HTTP caching layer. You add it (persisted queries, CDN, client cache).

It is a contract layer. Knowing what it is *not* will save you a lot of arguments later.

## REST vs GraphQL — the honest comparison

| | REST | GraphQL |
|---|---|---|
| Endpoints | many, one per resource | one (`/graphql`) |
| Over-fetching | common | impossible by design |
| Versioning | `/v1` `/v2` | additive schema evolution |
| Caching | HTTP, free | manual, harder |
| Tooling | curl, browser dev tools | Apollo Studio, GraphiQL |
| Ramp-up | one afternoon | one weekend |
| Failure modes | 500s, 4xx | always 200, errors in body |

That last row trips people. GraphQL almost always returns HTTP 200 even when the resolver threw — the actual error is inside `errors[]` in the JSON body. Your monitoring needs to know this.

## When GraphQL is the right choice

- **Multiple consumers with different shapes.** Web, iOS, Android, third parties — each wants slightly different fields. REST collapses into custom endpoints; GraphQL stays one schema.
- **Deeply nested or related data.** A dashboard query that pulls user → org → projects → tasks → assignees in one shot, with each client picking depth.
- **A frontend team that ships fast.** Schema is the contract; once the field exists, the client uses it without a backend change.
- **Federation across services.** A unified graph stitched from many backends (more on this in chapter 10).

## When REST is the right choice

- **Public APIs.** Caching, rate limiting, CDN-friendliness, SDK generation — REST wins. GitHub, Stripe, AWS — all REST-first for a reason.
- **File uploads and downloads.** Streaming binary through GraphQL is awkward; HTTP does it natively.
- **Simple CRUD with one client.** Adding a query language to a five-endpoint admin panel is overkill.
- **Aggressive caching needs.** HTTP cache semantics are 30 years of accumulated wisdom. GraphQL throws most of that away.

<Callout type="warn">

"GraphQL is faster than REST" is wrong. GraphQL trades round trips for resolver complexity. A naive GraphQL server will be slower than a tuned REST server on the same data. The win is *flexibility*, not raw speed. Performance comes from DataLoader, persisted queries, and smart resolvers — chapters 5, 6, and 10.

</Callout>

## The runtime you will use

For this track, the server is **graphql-yoga** running on Node. Three reasons:

1. The reference implementation (`graphql-js`) is JavaScript, so the ecosystem is deepest there.
2. graphql-yoga is the modern, batteries-included runtime — handles HTTP, subscriptions, file uploads, plugins out of the box. Replaces older Apollo Server boilerplate.
3. It is a couple of hundred kilobytes and runs anywhere Node runs. Self-hosting is one binary plus systemd.

If you write Go, the equivalent is **gqlgen** — code generation from schema to Go structs, very fast. If you write Python, it is **Strawberry** — decorator-based, type-hint-driven. Same ideas, different syntax. Every concept in this track maps directly.

```bash
mkdir my-graphql && cd my-graphql
npm init -y
npm install graphql graphql-yoga
```

That is the whole setup. We start writing code in chapter 3.

## What "self-hosted" means here

The whole track stays vendor-neutral. No "use AWS AppSync" or "deploy to Apollo's hosted service." We will run graphql-yoga on a VPS behind nginx, with Postgres as the only data dependency. If you finish the track you will know how to ship a real production GraphQL service for ten dollars a month, with nothing managed.

## Recap

- GraphQL is a query language with a type system, not a transport or a database.
- One endpoint, one round trip, exactly the fields you asked for.
- It runs on top of HTTP, with WebSockets for subscriptions.
- Right call for many consumers, deep relations, fast-iterating frontends.
- Wrong call for public APIs, file streaming, simple CRUD, aggressive caching.
- Returns HTTP 200 even on errors — your monitoring must read the body.

Next: [Schema-first design](/notes/graphql/02-schema-first-design) — types, queries, mutations, and the nullability decisions that haunt you for years if you get them wrong.

