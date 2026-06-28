---
title: 'DataLoader'
subtitle: 'DataLoader is a tiny library that fixes the N+1 problem by batching loads inside an event loop tick, and caching by key for the duration of one request. Once you wire it in, your resolvers stay clean and the SQL graph collapses.'
chapter: 6
level: 'intermediate'
readingTime: '13 min'
topics: ['graphql', 'dataloader', 'batching', 'performance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

The fix for N+1 is to batch. The principle is simple — collect every "fetch user 1, fetch user 2, fetch user 3" into one trip — but doing that by hand for every relationship is grim. DataLoader does it generically.

<Callout type="info">

**Real-World Analogy**

DataLoader is like a school bus that waits until it's full before leaving — batching all the kids rather than making one trip per child.

</Callout>

## What DataLoader actually does

A `DataLoader` is created with a **batch function**: a function that takes an array of keys and returns an array of values, in the same order.

```js
import DataLoader from 'dataloader';

const userLoader = new DataLoader(async (ids) => {
	const { rows } = await pool.query('SELECT * FROM users WHERE id = ANY($1::bigint[])', [ids]);
	const byId = new Map(rows.map((u) => [String(u.id), u]));
	return ids.map((id) => byId.get(String(id)) || null);
});
```

Then anywhere in your code:

```js
const aoife = await userLoader.load('1');
const niamh = await userLoader.load('2');
```

DataLoader does three things in concert:

1. **Coalesces calls within a microtask.** Both `load()` calls in the same tick (one resolver call returns a promise, sibling resolvers await theirs in parallel) are queued, the batch function is called once with `["1", "2"]`, the rows are sliced back to each caller.
2. **Caches by key.** Calling `userLoader.load("1")` again returns the cached promise. No second SQL trip.
3. **Returns ordered results.** Your batch function must return values in the same order as the input keys (or `null` for misses). DataLoader uses index alignment to dispatch.

That is the whole library. ~200 lines of code. The genius is using JavaScript's microtask queue to gather work without changing the resolver API.

## Wiring DataLoader into the chapter 3 server

The critical rule from chapter 4: **DataLoaders are per-request**. Create them in `context`, never in module scope.

```js
// loaders.js
import DataLoader from 'dataloader';

export function buildLoaders(pool) {
	return {
		user: new DataLoader(async (ids) => {
			const { rows } = await pool.query('SELECT * FROM users WHERE id = ANY($1::bigint[])', [ids]);
			const byId = new Map(rows.map((u) => [String(u.id), u]));
			return ids.map((id) => byId.get(String(id)) || null);
		}),

		postsByAuthor: new DataLoader(async (authorIds) => {
			const { rows } = await pool.query(
				`SELECT * FROM posts
         WHERE author_id = ANY($1::bigint[])
         ORDER BY created_at DESC`,
				[authorIds]
			);
			const byAuthor = new Map(authorIds.map((id) => [String(id), []]));
			for (const p of rows) byAuthor.get(String(p.author_id)).push(p);
			return authorIds.map((id) => byAuthor.get(String(id)));
		})
	};
}
```

```js
// server.js (changed bits)
import { buildLoaders } from './loaders.js';

const yoga = createYoga({
	schema: createSchema({ typeDefs, resolvers }),
	context: () => ({ loaders: buildLoaders(pool) }),
	graphiql: true
});
```

Then update resolvers:

```js
const resolvers = {
	Query: {
		user: (_, { id }, ctx) => ctx.loaders.user.load(id),
		users: async () => (await pool.query('SELECT * FROM users ORDER BY id')).rows
	},

	User: {
		createdAt: (u) => u.created_at,
		posts: (u, _, ctx) => ctx.loaders.postsByAuthor.load(u.id)
	},

	Post: {
		createdAt: (p) => p.created_at,
		author: (p, _, ctx) => ctx.loaders.user.load(p.author_id)
	}
};
```

Now run the same query:

```graphql
{
	users {
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

SQL log:

```
[sql] SELECT * FROM users ORDER BY id
[sql] SELECT * FROM posts WHERE author_id = ANY($1::bigint[]) ORDER BY created_at DESC
[sql] SELECT * FROM users WHERE id = ANY($1::bigint[])
```

Three queries for arbitrary N. The post-author lookup hits the user loader, which had already cached user 1, 2 from `Query.users` … wait, no. `Query.users` did not go through the loader. So `Post.author` does fire — but it batches all post authors into one query. Two improvements possible:

1. Have `Query.users` prime the loader cache on the way out.
2. Use `loader.load()` for everything and never write raw SQL outside loaders.

Both are common. Priming on the way out:

```js
Query: {
  users: async (_, __, ctx) => {
    const { rows } = await pool.query("SELECT * FROM users ORDER BY id");
    for (const u of rows) ctx.loaders.user.prime(String(u.id), u);
    return rows;
  },
}
```

Now the post-author lookup is a cache hit on every key — zero extra SQL.

## Two batch shapes

There are two patterns and you will use both.

**Pattern A: load one by key.** `userLoader.load(id)` returns one user.

- Batch function: `(ids) => [user0, user1, user2]` — same length and order.
- Use for: lookup-by-PK, lookup-by-unique-key.

**Pattern B: load many by key.** `postsByAuthor.load(authorId)` returns an array of posts.

- Batch function: `(authorIds) => [[posts0], [posts1], [posts2]]` — same length, each element is the matching array.
- Use for: child arrays in a 1-to-many relationship.

Both pull the same `ANY($1::bigint[])` SQL. The difference is how you fold the rows back into batches.

<Callout type="warn">

**The order of the returned array must match the input keys.** If you return `byId.get(id)` and a key is missing, that slot has to be `null` or `[]`, not skipped. Misaligning by even one index gives clients the wrong row attached to the wrong parent. This is the most common DataLoader bug.

</Callout>

## Loaders for things that are not databases

DataLoader is unaware of databases. Anywhere you have "function that takes a key, returns a value, with batchable equivalent" — DataLoader works.

- **Permissions API** that supports `POST /permissions?ids=1,2,3`: one loader per resource type.
- **Redis MGET** for cached entities: `redis.mget(keys)`.
- **gRPC service** with a `BatchGet` method: pass the array of IDs.

For any external dependency you call inside resolvers, ask: "does this dependency have a batch endpoint?" If yes, write a DataLoader. If no, fix the dependency or add a small batch shim in front of it.

## What about caching across requests

DataLoader caches _per loader instance_. Per-request loaders means caches die at request end. That is intentional — cross-request caching is a different problem (Redis, in-process LRU, persisted query caches) and a different lifetime.

Putting a DataLoader at module scope would share cache across requests. **Do not.** It leaks data between users (loader cache hit on a row another user does not have permission to see), grows unboundedly, and makes the loader cache poisoned for the lifetime of the process. Every GraphQL N+1 horror story has this in it.

## When DataLoader is not enough

DataLoader is brilliant for the common case but it does not magically solve every fetch pattern.

**1. Conditional fetches.** A field that should only load when the client asked for nested children — DataLoader cannot prune ahead of time. Use selection-aware projection.

**2. Cursor pagination on children.** `User.posts(first: 10)` is hard to batch — different users want different counts and cursors. Either expose a flat `Query.posts(authorId, first, after)` or accept that paginated child arrays do not batch.

**3. Aggregations.** `User.postCount` is a `COUNT(*)` per user. Batch with `SELECT author_id, COUNT(*) FROM posts WHERE author_id = ANY($1) GROUP BY author_id`.

**4. Cross-database / cross-service joins.** When the parent is in Postgres and the child is in Redis or another service, you need two loaders and the resolver glues them.

## Comparison: how Go and Python handle this

**Go (gqlgen)** — there is `graph-gophers/dataloader` for the same pattern. gqlgen ships an example. The `singleflight` and `errgroup` patterns combine well.

**Python (Strawberry)** — `strawberry.dataloader.DataLoader` ships in the framework. Uses asyncio.

The semantics are identical. The implementation is the same idea: collect calls inside one tick, fire one batch, dispatch results.

## Anti-patterns to avoid

**1. Module-scope loaders.** Already covered. Bears repeating.

**2. Loaders that do too much.** A "user-with-posts" loader that fetches both is a re-implementation of JOIN. Keep loaders thin — one entity, one key.

**3. Loaders that throw on missing keys.** Return `null` (or `[]`), let the resolver decide. Throwing inside the batch function fails _every_ caller in that batch.

**4. Loaders without `ANY($1::array)`.** If your batch function calls SQL N times in a loop, you have not actually batched. Always `WHERE col = ANY($1::type[])` or the `IN (...)` equivalent.

## Recap

- DataLoader solves N+1 by coalescing `load()` calls in one tick into one batched fetch.
- Two patterns: load-one-by-key (e.g. user by id), load-many-by-key (e.g. posts by author).
- **Per-request, in context.** Module-scope is a security and memory bug.
- Batch function must return arrays of the same length and order as input keys.
- Use `prime()` to pre-populate the cache from non-loader fetches.
- DataLoader is a generic primitive — works for Redis, gRPC, REST, anything batchable.
- It is not magic. Some patterns (cursor children, conditional fetches) need other tools.

Next: [Mutations, input types, validation](/notes/graphql/07-mutations) — writes done properly.
