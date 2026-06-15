---
title: "The N+1 problem"
subtitle: "Your GraphQL server runs eleven SQL queries when it should run two. Every backend team learns this the hard way. This chapter is the diagnosis — chapter 6 is the cure."
chapter: 5
level: "intermediate"
readingTime: "11 min"
topics: ["graphql", "n+1", "performance", "sql", "postgres"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

GraphQL's flexibility comes from a tree of resolver calls. That tree is also a trap. The trap has a name: **N+1**. If you take only one lesson from this whole track, take this one.

<Callout type="info">

**Real-World Analogy**

The N+1 problem is like asking a librarian for 100 book titles, then making 100 separate trips to the shelf — versus getting all the books in one cart.

</Callout>

## Reproducing the problem

Use the server from chapter 3. Add SQL logging so you can see what is happening:

```js
// server.js
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("connect", (c) => {
  const orig = c.query.bind(c);
  c.query = (text, ...rest) => {
    console.log("[sql]", typeof text === "string" ? text : text.text);
    return orig(text, ...rest);
  };
});
```

Now run this query in GraphiQL:

```graphql
{
  users {
    name
    posts {
      title
    }
  }
}
```

Watch the log:

```
[sql] SELECT * FROM users ORDER BY id
[sql] SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC
[sql] SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC
```

Two users, three queries. One for users, two for posts. Scale to a hundred users — 101 queries. To a thousand — 1001. That is the **N+1 problem**: 1 query for the parents, N queries for the children, one per parent.

## Why it happens

Look back at chapter 4. The executor walks every node of the tree. For each user, it calls `User.posts(parent=user)`. Each call independently fires its SQL.

```js
User: {
  posts: async (u) => {
    const { rows } = await pool.query(
      "SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC",
      [u.id],
    );
    return rows;
  },
}
```

Resolvers do not know about siblings. They cannot see "ten users were resolved together; let me batch their post fetches." They are isolated functions.

## What does this cost

A single round trip to a DB on the same machine is maybe **0.5 ms**. To a DB across a region is **5–20 ms**. So:

| Users | Local DB | Remote DB |
|---|---|---|
| 10 | ~5 ms | ~50–200 ms |
| 100 | ~50 ms | ~500 ms–2 s |
| 1000 | ~500 ms | unusable |

That is just SQL latency. Connection pool contention makes it worse — a single GraphQL request can hold ten or twenty connections at once, blocking other requests.

The same query as **two SQL queries** (one for users, one for posts):

```sql
SELECT * FROM users ORDER BY id;
SELECT * FROM posts WHERE author_id = ANY($1::bigint[]);
```

Is in the millisecond range regardless of N. The shape of the data is identical. The problem is purely how the resolvers are written.

## Why is GraphQL famous for this when REST is not

REST hides the problem. A REST endpoint `GET /users-with-posts` is one handler — a backend engineer writes one SQL `JOIN` and ships it. The handler is custom for that endpoint.

GraphQL clients drive shape. If a client adds `posts {}` to a query, the server's resolvers fire the next day. There is no opportunity for a backend engineer to write a JOIN — the engineer never knew the client was about to ask.

So GraphQL needs a *general* solution that batches arbitrary children at runtime. The general solution is **DataLoader** (chapter 6). But before we use it, see two simpler fixes that work in narrower cases.

## Fix 1: hand-write a JOIN

If you know a particular field is nearly always queried with its parent, fetch them together at the parent.

```js
Query: {
  users: async () => {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.name, u.email, u.created_at,
        COALESCE(
          json_agg(
            json_build_object('id', p.id, 'title', p.title, 'created_at', p.created_at)
            ORDER BY p.created_at DESC
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) AS posts
      FROM users u
      LEFT JOIN posts p ON p.author_id = u.id
      GROUP BY u.id
      ORDER BY u.id
    `);
    return rows;
  },
},

User: {
  posts: (u) => u.posts, // already joined; no extra query
}
```

One SQL query for `{ users { posts {} } }`. Fast.

The downside: you eagerly load posts even when the client did *not* ask for them. The client sends `{ users { name } }` and you still pay the JOIN.

A common compromise — **selection-aware queries** — uses the `info` argument to detect whether `posts` is in the selection set and only JOINs when it is. Powerful but verbose. ORMs like Prisma, Drizzle's relations, and `objection.js` automate this.

<Callout type="tip">

**Hand-written JOINs are a great first move.** They beat any abstraction for the top three or four queries. Use them on the hot paths; reach for DataLoader for the rest.

</Callout>

## Fix 2: aggregate in the parent resolver

If the children are deeply nested, refactor so the parent resolver fetches everything in one go and stuffs it into context for child resolvers to read.

```js
Query: {
  users: async (_, __, ctx) => {
    const { rows: users } = await ctx.db.query("SELECT * FROM users");
    const ids = users.map(u => u.id);
    const { rows: posts } = await ctx.db.query(
      "SELECT * FROM posts WHERE author_id = ANY($1::bigint[])",
      [ids],
    );

    const postsByUser = new Map();
    for (const p of posts) {
      if (!postsByUser.has(p.author_id)) postsByUser.set(p.author_id, []);
      postsByUser.get(p.author_id).push(p);
    }

    return users.map(u => ({ ...u, posts: postsByUser.get(u.id) || [] }));
  },
},
```

Two SQL queries, no JOIN. Same outcome. The pattern — `ANY($1::bigint[])` plus a `Map` keyed by parent ID — is the *exact* operation DataLoader will do for you in chapter 6, just generalized.

## Fix 3: don't expose the dangerous field

Sometimes the cleanest answer is to remove a field from the schema. If `User.allPosts` returns thousands of rows and was never paginated, deprecate it and replace with `User.posts(first: Int!)` or a separate `Query.posts(authorId: ID!)` connection.

This is not a cop-out. Schema design is performance design. A schema that lets clients write a quadratic query will eventually have someone write the quadratic query.

## Where N+1 hides beyond posts

It is not just child arrays. Singletons N+1 too:

```graphql
{ posts { author { name } } }
```

Ten posts, each calls `Post.author` → ten SQL queries for users, often **the same user**. No batching, no caching.

```graphql
{ users { posts { comments { author { name } } } } }
```

Three layers of N+1. Easy to put a graph into the second-per-request range with twenty rows of data.

Permission checks N+1 too:

```graphql
{ posts { canEdit } }
```

If `Post.canEdit` calls a permissions service, that is N service calls per request.

## Diagnostics — finding N+1 in the wild

Three tools, in order of usefulness:

**1. SQL logs in development.** The simplest. If you see the same query 50 times in one request, you have N+1.

**2. Postgres `pg_stat_statements`.** Production-grade. Aggregates query frequency and total time. The query that runs 100,000× per minute is your hot spot.

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;
```

**3. APM tracing (OpenTelemetry, etc.).** Per-request flame charts. You see the resolver tree visually and the SQL spans nested under each resolver.

For self-hosted: `pg_stat_statements` is free, fast, and ships with Postgres. Turn it on in the **observability** chapter (later in the path).

## Recap

- Resolvers cannot see siblings. Each child fires its own fetch.
- 1 + N queries is the default for `{ parents { children {} } }`.
- Three fixes: JOIN at the parent, aggregate-and-distribute, or DataLoader (next).
- N+1 hides in singletons, deep nesting, and permission checks too.
- Find it with SQL logs locally and `pg_stat_statements` in prod.
- The schema itself can be the problem. Pagination is a fix.

Next: [DataLoader](/notes/graphql/06-dataloader) — the general fix that batches and caches, per request, with no schema changes.

