---
title: "Resolvers and the execution tree"
subtitle: "A resolver is a function that returns a value. Stack them in a tree, and that tree is your API. Once you see the walk, every weird GraphQL bug becomes obvious."
chapter: 4
level: "beginner"
readingTime: "12 min"
topics: ["graphql", "resolvers", "execution", "context"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

In chapter 3 you wrote resolvers without thinking too hard about what they were. This chapter slows down. If you can picture the executor walking your query, you stop being surprised by GraphQL — performance issues, error propagation, weird `null` paths all become readable.

<Callout type="info">

**Real-World Analogy**

A GraphQL resolver is like a waiter who coordinates between your order and the kitchen, the wine cellar, and the dessert trolley — each independently fetched.

</Callout>

## A resolver is a function with four arguments

```js
fieldName: (parent, args, context, info) => returnValue
```

That is the signature for every resolver, in every GraphQL server, in every language.

- **`parent`** — the value returned by the *parent* resolver. For root types (`Query`, `Mutation`), parent is `undefined` (or whatever you pass as `rootValue`). For `User.name`, parent is the user object.
- **`args`** — arguments declared on the field. `posts(last: 10)` arrives as `{ last: 10 }`.
- **`context`** — request-scoped object. The DB pool, the current user, a DataLoader instance, the trace ID. Every resolver in one request shares it.
- **`info`** — metadata about the execution. Field name, return type, the path you are at, the entire AST, all variables. Most resolvers ignore it; advanced ones use it for projection (selecting only requested DB columns).

You almost always use `parent`, `args`, and `context`. `info` is for the 5% case.

## The execution tree

Look at this query:

```graphql
{
  user(id: 1) {
    name
    posts {
      title
      author {
        name
      }
    }
  }
}
```

The executor builds a tree of resolver calls:

```
Query.user(id: 1)                    -> { id: 1, name: "Sumayya", ... }
  User.name(parent={id:1,...})       -> "Sumayya"
  User.posts(parent={id:1,...})      -> [post1, post2]
    Post.title(parent=post1)         -> "Why I left K8s"
    Post.author(parent=post1)        -> { id: 1, name: "Sumayya", ... }
      User.name(parent={id:1,...})   -> "Sumayya"
    Post.title(parent=post2)         -> "Self-hosting..."
    Post.author(parent=post2)        -> { id: 1, name: "Sumayya", ... }
      User.name(parent={id:1,...})   -> "Sumayya"
```

Every field is a function call. Sibling fields run in parallel. Children wait for their parent.

For that one query, that is 1 + 1 + 1 + 4 + 4 = 11 resolver invocations. The author field gets called twice and resolves to the same user — no caching by default. That is the seed of the N+1 problem (chapter 5).

## Default resolvers

You did not write `User.name` in chapter 3. You did not need to. The default resolver for a field is:

```js
parent => parent[fieldName]
```

If `parent` is `{ name: "Sumayya", email: "..." }` and the field is `name`, the default resolver returns `parent.name`. So the only fields that need explicit resolvers are:

- Root fields (`Query.*`, `Mutation.*`) — there is no parent yet.
- Fields where the parent property name does not match the schema field — `created_at` vs `createdAt`.
- Fields that need to fetch — `User.posts` runs a SQL query, it cannot just be a property access.
- Fields that compute — a virtual field like `User.fullName` that joins `firstName` and `lastName`.

Everything else is implicit. Your resolver map ends up small.

## Returning the right shape

A resolver returns whatever the next layer of resolvers can use as their `parent`. Two common patterns:

**1. Return the full row.** `Query.user` returns `{ id, name, email, created_at }`. Field resolvers on `User` either use defaults (`name`, `email`) or read properties (`createdAt: u => u.created_at`).

**2. Return a partial object, fetch the rest lazily.** `Query.user` returns `{ id }`, and every other field on `User` (`name`, `email`, `posts`) has its own resolver that fetches what it needs. Wasteful unless the client only ever asks for one or two fields.

In practice, return what the SQL gave you and let resolvers handle joins and computation.

## Async, parallelism, and you

Resolvers can return promises. The executor awaits them. Sibling fields are awaited concurrently — `User.name` and `User.posts` are not sequential.

```js
User: {
  name: u => u.name,                                         // sync
  email: u => u.email,                                       // sync
  posts: async u => pool.query("...", [u.id]),               // async, in parallel
  followers: async u => pool.query("...", [u.id]),           // async, in parallel
}
```

For one user, `posts` and `followers` fire at roughly the same time. Two parallel queries — about as fast as one.

Children block on their parent. `Post.title` cannot run until `User.posts` has resolved.

<Callout type="warn">

**Sibling parallelism is real but breaks under naive resolvers.** If `User.posts` runs ten times in parallel for ten users, that is ten parallel SQL queries hammering Postgres. Cache misses, connection pool exhaustion, the works. The fix — DataLoader — is chapter 6.

</Callout>

## Context — the lifeline

Context is created once per request and passed to every resolver. It is the *only* legitimate way to share state across resolvers in one query.

```js
const yoga = createYoga({
  schema,
  context: ({ request }) => ({
    db: pool,
    userId: getUserIdFromAuth(request),
    requestId: crypto.randomUUID(),
  }),
});
```

Then any resolver can:

```js
posts: async (_, args, ctx) => {
  if (!ctx.userId) throw new Error("Not authenticated");
  return ctx.db.query("SELECT * FROM posts WHERE author_id = $1", [ctx.userId]);
}
```

Things that belong in context:

- DB connection / pool / transaction handle
- Current user / auth state
- DataLoaders (chapter 6) — this is critical, must be per-request
- Tracing / request ID
- Loaders for permissions, feature flags, tenant info

Things that **do not** belong in context:

- Per-field state — use the resolver tree, not context.
- Mutable shared state across requests — context is per-request, do not break that.

## Errors and how they propagate

A resolver can throw. The executor catches the throw, attaches the error to the response's `errors[]` array, and sets that field to `null`.

If the field is nullable, the response continues with `null` for that field:

```json
{ "data": { "user": { "name": "Sumayya", "bio": null } }, "errors": [...] }
```

If the field is non-null, the `null` propagates up to the nearest nullable parent:

```graphql
type Query {
  user(id: ID!): User      # nullable
}
type User {
  id: ID!
  name: String!            # non-null
}
```

If `User.name` throws, `name` cannot be `null`, so the `null` bubbles up to `User`, which is nullable on `Query`, so the whole `user` field becomes `null`. The error is in `errors[]`, the data still parses.

If you ever see "the entire response collapsed to null because one nested field threw," that is non-null propagation. Avoidable by being honest about which fields are truly always present.

## `info` and selection projection

The fourth resolver argument is the one you usually ignore. But for one specific optimization — fetching only the columns the client asked for — it is gold.

```js
import { fieldsList } from "graphql-fields-list";

users: async (_, __, ___, info) => {
  const fields = fieldsList(info); // ["id", "name"] if client asked for those
  const cols = ["id", ...fields].join(", ");
  const { rows } = await pool.query(`SELECT ${cols} FROM users`);
  return rows;
}
```

Skip until performance demands it. Premature in chapter 4.

## Common mistakes

**1. Doing the lookup in the wrong resolver.** If `User.posts` always needs the user's posts, do not stash a SQL query in `Query.user` — that pulls posts even when the client did not ask. Resolvers run lazily; lean on that.

**2. Putting per-request state in module scope.** A DataLoader created at module scope is shared across requests, leaks data between users, and never frees memory. Always per-request, always in context.

**3. Forgetting field resolvers exist.** If a column is computed (`fullName`, `slug`), it does not need to be in SQL. Add a field resolver, compute it from the parent.

**4. Returning the wrong type.** If `User.posts` returns `[Post!]!` and your resolver returns `null`, you get a non-null violation. The error is clear; but only if you read it.

## Recap

- Resolver signature: `(parent, args, context, info) => value`. Memorize.
- The executor walks the query as a tree. Siblings parallel, children sequential.
- Defaults read `parent[fieldName]`. Only write resolvers when needed.
- Context is per-request. DB pool, auth, DataLoaders go there.
- Promises work; sibling resolvers run concurrently.
- Errors fail the field. Non-null fields propagate the failure up.
- `info` is for selection-aware optimizations later.

Next: [The N+1 problem](/notes/graphql/05-n-plus-one) — why your first GraphQL server is slow, and what is actually happening at the SQL layer.

