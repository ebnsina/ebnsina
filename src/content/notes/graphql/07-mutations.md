---
title: "Mutations, input types, validation"
subtitle: "Writes are not just queries with side effects. They need input types, validation, transactions, idempotency, and a return shape that lets clients update their cache without a second fetch."
chapter: 7
level: "intermediate"
readingTime: "12 min"
topics: ["graphql", "mutations", "input types", "validation", "transactions"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A `Mutation` field is just a resolver that writes. The schema, the executor, the resolver signature — all the same as queries. What changes is everything around the resolver: input shape, validation, transactional scope, error reporting, and what you return so the client can refresh state.

<Callout type="info">

**Real-World Analogy**

A mutation is like a form submission versus a read-only search — mutations change state, queries observe it.

</Callout>

## Mutations vs queries — the actual difference

The GraphQL spec guarantees one thing: when a single request contains multiple top-level mutations, **they run sequentially, in order**. Queries fan out in parallel.

```graphql
mutation {
  createPost(input: { title: "A" }) { id }
  createPost(input: { title: "B" }) { id }
  createPost(input: { title: "C" }) { id }
}
```

A is fully resolved before B starts. That is the only execution-level difference. Everything else is convention — by convention, mutations are the place you put writes; nothing in the engine forces it.

In practice, do not batch many mutations in one request. Make one mutation per write. Network round trips are cheap; concurrency-control bugs are not.

## Input types — verbose but worth it

Mutations should take a single `input: <Verb><Noun>Input!` argument, not a flat list of scalars.

```graphql
# Don't do this
type Mutation {
  createPost(title: String!, body: String!, tags: [String!], publish: Boolean): Post!
}

# Do this
input CreatePostInput {
  title: String!
  body: String!
  tags: [String!]
  publish: Boolean = false
}

type Mutation {
  createPost(input: CreatePostInput!): Post!
}
```

Why bother:

- **Adding fields is cheap.** Add `excerpt: String` to `CreatePostInput` and clients send it whenever they want. With flat args, you would add a positional argument and risk default mismatches.
- **Inputs are typed.** Default values, validation directives, descriptions — all live on the input type definition. Tooling reads it.
- **Reusable.** `UpdatePostInput` can extend `CreatePostInput` patterns. Variants stay disciplined.
- **Reads in clients.** Form code that gathers fields into one object, then submits, is more natural than spreading args.

Apply universally. Even the simplest one-field mutation gets its own input.

## A real mutation, end-to-end

Schema:

```graphql
input CreatePostInput {
  title: String!
  body: String!
  tags: [String!]
  publish: Boolean = false
}

type Mutation {
  createPost(input: CreatePostInput!): Post!
  updatePost(id: ID!, input: UpdatePostInput!): Post!
  deletePost(id: ID!): Boolean!
}

input UpdatePostInput {
  title: String
  body: String
  tags: [String!]
}
```

Resolver, with transaction and validation:

```js
import { z } from "zod";

const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  tags: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,30}$/)).max(10).optional(),
  publish: z.boolean().optional(),
});

const Mutation = {
  createPost: async (_, { input }, ctx) => {
    if (!ctx.userId) throw new Error("Not authenticated");

    const data = CreatePostSchema.parse(input);

    const client = await ctx.db.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `INSERT INTO posts (author_id, title, body, published)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [ctx.userId, data.title, data.body, !!data.publish],
      );
      const post = rows[0];

      if (data.tags?.length) {
        await client.query(
          `INSERT INTO post_tags (post_id, tag)
           SELECT $1, unnest($2::text[])
           ON CONFLICT DO NOTHING`,
          [post.id, data.tags],
        );
      }

      await client.query("COMMIT");
      return post;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
```

A few patterns worth flagging.

**Validate at the boundary.** Use Zod (or Yup, or ajv) on the input. Don't trust GraphQL's type system for business rules — it gives you "is a string", you also need "1–200 chars, not just whitespace, no HTML." Validation is your job.

**Transactions are not optional for multi-statement writes.** Pull a client off the pool, `BEGIN`, do everything, `COMMIT` or `ROLLBACK`. Without this, an error after step 2 leaves step 1 committed. Inconsistent state forever.

**Acquire the client, do not use `pool.query` for the rollback path.** `pool.query` checks out a connection per call. For atomicity you need *one* connection across the whole transaction.

## Validation strategies

Three places to validate:

1. **Schema (free).** GraphQL enforces type, nullability, enum membership. `Boolean!` cannot be `"true"` — the executor rejects before your resolver runs.
2. **Input shape (Zod).** Length, regex, range, conditional logic. Rejects with a usable error.
3. **Business rules in the resolver.** "Cannot publish a post in a deleted org." Goes after the Zod parse, where you have the typed input.

Don't put business rules in Zod. Don't put length checks in the resolver. Layer them where they belong.

## Errors clients can act on

A bare `throw new Error("not found")` becomes a generic message in `errors[]` with no structure. Clients cannot distinguish "validation failed" from "internal server error" from "unauthorized."

Two options.

**1. Typed errors via codes.** graphql-yoga supports `GraphQLError` with extensions:

```js
import { GraphQLError } from "graphql";

throw new GraphQLError("Invalid title", {
  extensions: { code: "VALIDATION_FAILED", field: "title" },
});
```

Clients read `err.extensions.code` and branch on it.

**2. Errors as data (the union pattern).** From chapter 2:

```graphql
union CreatePostResult = Post | ValidationError | NotAuthorizedError
type Mutation {
  createPost(input: CreatePostInput!): CreatePostResult!
}
```

Verbose but watertight. Clients write fragments per case and the schema documents every failure mode.

For a small graph, codes via extensions are fine. For a contract many teams consume, errors-as-data is worth it.

<Callout type="info">

**Hide internals.** A Postgres unique-violation error includes the constraint name, table name, sometimes the offending value. Do not pass it through. Catch it in the resolver, map to a clean error: `throw new GraphQLError("Email already in use", { extensions: { code: "DUPLICATE", field: "email" } })`. Stack traces and SQL belong in your logs, not in client responses.

</Callout>

## Idempotency

Mutations can fail mid-flight — network drops, client retries. Without idempotency, the user clicks "create post" twice and ends up with two posts.

The cleanest fix: clients send a `clientMutationId` (UUID) and the server stores it.

```graphql
input CreatePostInput {
  clientMutationId: ID!
  title: String!
  body: String!
}
```

```sql
CREATE TABLE mutation_idempotency (
  client_id UUID PRIMARY KEY,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

In the resolver, check the table first; if a row exists, return its stored result. If not, do the work, store the result, return.

For low-stakes writes (drafts, comments) this is overkill. For payments, account creation, anything customers care about — non-negotiable.

## Returning enough for the client to update

If `createPost` returns `Boolean`, the client has to refetch `users` and `posts` to update the UI. Wasteful.

Return the new entity, with enough fields for the client to splice into its cache:

```graphql
type Mutation {
  createPost(input: CreatePostInput!): Post!
}
```

Apollo Client and urql will read the returned `Post`, find it by `id` in their normalized cache, and update affiliated lists if you also include them.

For mutations that affect lists, return the parent too:

```graphql
type CreatePostPayload {
  post: Post!
  author: User!  # has updated post count, latest activity, etc.
}
```

Now one mutation request returns everything the client needs. Zero refetches.

## Bulk mutations

Need to create 50 posts? Don't expose `createPostBatch(inputs: [CreatePostInput!]!)`. Sequential top-level mutations work, but they are slow over network.

Better: a single mutation that takes the array, runs in one transaction:

```graphql
type Mutation {
  importPosts(inputs: [CreatePostInput!]!): ImportPostsPayload!
}

type ImportPostsPayload {
  created: [Post!]!
  failures: [ImportFailure!]!
}

type ImportFailure {
  index: Int!
  reason: String!
}
```

One round trip, one transaction, partial-failure reporting. This is also where the union-typed error pattern earns its keep — each item can succeed or fail individually.

## Mutations and DataLoader caches

A mutation that writes to user `42` invalidates the loader cache of any concurrent or following request that loaded user `42`. Since loaders are per-request and short-lived, this is rarely a problem within a single request — but if your resolver mutates and then reads in the *same* mutation, prime or clear the loader after the write:

```js
ctx.loaders.user.clear(post.author_id);
// or
ctx.loaders.user.prime(String(updatedUser.id), updatedUser);
```

Otherwise the post-mutation read returns the stale, pre-mutation row.

## Recap

- Mutations run sequentially when batched. That is the only engine-level difference from queries.
- Always use `input <Verb><Noun>Input!` types. One arg, never flat scalars.
- Validate at the boundary with Zod. Schema gives types, you give rules.
- Wrap multi-statement writes in a real transaction with one connection.
- Error codes via `extensions` for small graphs; errors-as-data unions for big ones.
- Hide internal errors. Map DB constraint names to user-readable messages.
- `clientMutationId` for anything important. Idempotency is a feature, not a fancy.
- Return the changed entity, with enough scope for the client to update its cache.

Next: [Authentication and authorization](/notes/graphql/08-auth) — context, field-level checks, and the directives pattern.

