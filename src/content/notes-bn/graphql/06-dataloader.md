---
title: 'DataLoader'
subtitle: 'DataLoader একটা ছোট লাইব্রেরি যা একটা event loop tick-এর ভেতরে load গুলো batch করে আর একটা request-এর সময়কাল জুড়ে key ধরে cache করে N+1 সমস্যা ঠিক করে। একবার wire করে দিলে তোমার resolver গুলো পরিষ্কার থাকে আর SQL graph collapse করে যায়।'
chapter: 6
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['graphql', 'dataloader', 'batching', 'performance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

N+1-এর সমাধান হলো batch করা। মূলনীতিটা সহজ — প্রতিটা "fetch user 1, fetch user 2, fetch user 3"-কে একটা trip-এ জড়ো করা — কিন্তু প্রতিটা relationship-এর জন্য এটা হাতে হাতে করা বিরক্তিকর। DataLoader এটা generic-ভাবে করে দেয়।

<Callout type="info">

**বাস্তব জীবনের উপমা**

DataLoader হলো একটা স্কুল বাসের মতো যেটা ভরে যাওয়ার আগ পর্যন্ত অপেক্ষা করে ছাড়ে না — প্রতিটা বাচ্চার জন্য আলাদা trip না করে সব বাচ্চাকে একসাথে batch করে।

</Callout>

## DataLoader আসলে কী করে

একটা `DataLoader` তৈরি হয় একটা **batch function** দিয়ে: এমন একটা function যা key-এর একটা array নেয় আর একই order-এ value-র একটা array ফেরত দেয়।

```js
import DataLoader from 'dataloader';

const userLoader = new DataLoader(async (ids) => {
	const { rows } = await pool.query('SELECT * FROM users WHERE id = ANY($1::bigint[])', [ids]);
	const byId = new Map(rows.map((u) => [String(u.id), u]));
	return ids.map((id) => byId.get(String(id)) || null);
});
```

তারপর তোমার কোডের যেকোনো জায়গায়:

```js
const aoife = await userLoader.load('1');
const niamh = await userLoader.load('2');
```

DataLoader একসাথে তিনটা কাজ করে:

1. **একটা microtask-এর ভেতরে call গুলো coalesce করে।** একই tick-এর দুটো `load()` call (একটা resolver call একটা promise ফেরত দেয়, sibling resolver গুলো তাদেরটা parallel-এ await করে) queue-তে জমা হয়, batch function একবার `["1", "2"]` দিয়ে call হয়, row গুলো slice করে প্রতিটা caller-এর কাছে ফেরত যায়।
2. **key ধরে cache করে।** আবার `userLoader.load("1")` call করলে cache করা promise ফেরত আসে। দ্বিতীয় SQL trip নেই।
3. **ordered result ফেরত দেয়।** তোমার batch function-কে input key-গুলোর মতো একই order-এ value ফেরত দিতে হবে (miss-এর জন্য `null`)। DataLoader index alignment ব্যবহার করে dispatch করে।

এটাই পুরো লাইব্রেরি। ~200 লাইন কোড। জিনিয়াস ব্যাপারটা হলো resolver API না বদলে কাজ জড়ো করতে JavaScript-এর microtask queue ব্যবহার করা।

## chapter 3-এর server-এ DataLoader wire করা

chapter 4-এর গুরুত্বপূর্ণ নিয়ম: **DataLoader গুলো per-request**। এগুলো `context`-এ তৈরি করো, কখনো module scope-এ নয়।

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

তারপর resolver গুলো update করো:

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

এখন একই query চালাও:

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

যেকোনো N-এর জন্য তিনটা query। post-author lookup user loader-এ হিট করে, যেটা `Query.users` থেকে user 1, 2 আগেই cache করেছিল … দাঁড়াও, না। `Query.users` loader দিয়ে যায়নি। তাই `Post.author` আসলেই fire করে — কিন্তু এটা সব post author-কে একটা query-তে batch করে। দুটো উন্নতি সম্ভব:

1. `Query.users`-কে বেরিয়ে যাওয়ার সময় loader cache prime করানো।
2. সবকিছুর জন্য `loader.load()` ব্যবহার করা আর loader-এর বাইরে কখনো raw SQL না লেখা।

দুটোই common। বেরোনোর সময় prime করা:

```js
Query: {
  users: async (_, __, ctx) => {
    const { rows } = await pool.query("SELECT * FROM users ORDER BY id");
    for (const u of rows) ctx.loaders.user.prime(String(u.id), u);
    return rows;
  },
}
```

এখন post-author lookup প্রতিটা key-তে cache hit — কোনো extra SQL নেই।

## দুই ধরনের batch shape

দুটো pattern আছে আর তুমি দুটোই ব্যবহার করবে।

**Pattern A: key ধরে একটা load করা।** `userLoader.load(id)` একটা user ফেরত দেয়।

- Batch function: `(ids) => [user0, user1, user2]` — একই length আর order।
- ব্যবহার: lookup-by-PK, lookup-by-unique-key।

**Pattern B: key ধরে অনেকগুলো load করা।** `postsByAuthor.load(authorId)` post-এর একটা array ফেরত দেয়।

- Batch function: `(authorIds) => [[posts0], [posts1], [posts2]]` — একই length, প্রতিটা element হলো matching array।
- ব্যবহার: একটা 1-to-many relationship-এ child array।

দুটোই একই `ANY($1::bigint[])` SQL টানে। পার্থক্য হলো তুমি কীভাবে row গুলোকে batch-এ ফিরে fold করো।

<Callout type="warn">

**ফেরত দেওয়া array-র order অবশ্যই input key-গুলোর সাথে মিলতে হবে।** যদি তুমি `byId.get(id)` ফেরত দাও আর একটা key missing থাকে, সেই slot-টা `null` বা `[]` হতে হবে, skip করা যাবে না। এক index-ও misalign হলে client-দের ভুল row ভুল parent-এর সাথে attach হয়ে যায়। এটা সবচেয়ে common DataLoader bug।

</Callout>

## database নয় এমন জিনিসের জন্য loader

DataLoader database সম্পর্কে কিছু জানে না। যেখানেই তোমার আছে "একটা function যা key নেয়, value ফেরত দেয়, আর একটা batchable equivalent আছে" — সেখানে DataLoader কাজ করে।

- **Permissions API** যা `POST /permissions?ids=1,2,3` support করে: প্রতিটা resource type-এর জন্য একটা loader।
- cache করা entity-র জন্য **Redis MGET**: `redis.mget(keys)`।
- একটা `BatchGet` method সহ **gRPC service**: ID-র array pass করো।

resolver-এর ভেতরে তুমি যে external dependency call করো তার প্রতিটার জন্য জিজ্ঞেস করো: "এই dependency-র কি একটা batch endpoint আছে?" যদি হ্যাঁ, একটা DataLoader লেখো। যদি না, dependency-টা ঠিক করো অথবা তার সামনে একটা ছোট batch shim যোগ করো।

## request জুড়ে caching-এর কী হবে

DataLoader _প্রতিটা loader instance ধরে_ cache করে। Per-request loader মানে request শেষ হলে cache মরে যায়। এটা ইচ্ছাকৃত — cross-request caching একটা আলাদা সমস্যা (Redis, in-process LRU, persisted query cache) আর একটা আলাদা lifetime।

module scope-এ একটা DataLoader রাখলে request জুড়ে cache share হবে। **এটা করো না।** এটা user-দের মধ্যে data leak করে (একটা row-তে loader cache hit যেটা দেখার permission অন্য user-এর নেই), অসীমভাবে বাড়ে, আর process-এর পুরো lifetime জুড়ে loader cache poisoned করে রাখে। প্রতিটা GraphQL N+1 horror story-তে এটা থাকে।

## DataLoader যখন যথেষ্ট নয়

DataLoader common case-এর জন্য দুর্দান্ত কিন্তু এটা জাদুবলে প্রতিটা fetch pattern সমাধান করে না।

**1. Conditional fetch।** এমন একটা field যা শুধু তখনই load হওয়া উচিত যখন client nested children চেয়েছে — DataLoader আগে থেকে prune করতে পারে না। selection-aware projection ব্যবহার করো।

**2. Children-এর উপর cursor pagination।** `User.posts(first: 10)` batch করা কঠিন — ভিন্ন user ভিন্ন count আর cursor চায়। হয় একটা flat `Query.posts(authorId, first, after)` expose করো, নয়তো মেনে নাও যে paginated child array batch হয় না।

**3. Aggregation।** `User.postCount` হলো প্রতি user-এ একটা `COUNT(*)`। `SELECT author_id, COUNT(*) FROM posts WHERE author_id = ANY($1) GROUP BY author_id` দিয়ে batch করো।

**4. Cross-database / cross-service join।** যখন parent Postgres-এ আর child Redis বা অন্য service-এ, তখন তোমার দুটো loader লাগে আর resolver তাদের জোড়া লাগায়।

## তুলনা: Go আর Python কীভাবে এটা handle করে

**Go (gqlgen)** — একই pattern-এর জন্য `graph-gophers/dataloader` আছে। gqlgen একটা example দেয়। `singleflight` আর `errgroup` pattern গুলো ভালোভাবে মেলে।

**Python (Strawberry)** — framework-এ `strawberry.dataloader.DataLoader` আসে। asyncio ব্যবহার করে।

Semantics অভিন্ন। implementation একই ধারণা: এক tick-এর ভেতরে call জড়ো করা, একটা batch fire করা, result dispatch করা।

## যেসব anti-pattern এড়িয়ে চলবে

**1. Module-scope loader।** আগেই বলা হয়েছে। আবার বলার মতো।

**2. যেসব loader বেশি কাজ করে।** একটা "user-with-posts" loader যা দুটোই fetch করে সেটা JOIN-এর একটা re-implementation। loader গুলো thin রাখো — একটা entity, একটা key।

**3. যেসব loader missing key-তে throw করে।** `null` (বা `[]`) ফেরত দাও, resolver-কে সিদ্ধান্ত নিতে দাও। batch function-এর ভেতরে throw করলে সেই batch-এর _প্রতিটা_ caller fail করে।

**4. `ANY($1::array)` ছাড়া loader।** যদি তোমার batch function একটা loop-এ N বার SQL call করে, তুমি আসলে batch করোনি। সবসময় `WHERE col = ANY($1::type[])` অথবা তার `IN (...)` equivalent।

## রিক্যাপ

- DataLoader এক tick-এর ভেতরে `load()` call গুলোকে একটা batched fetch-এ coalesce করে N+1 সমাধান করে।
- দুটো pattern: load-one-by-key (যেমন id ধরে user), load-many-by-key (যেমন author ধরে posts)।
- **Per-request, context-এ।** Module-scope একটা security আর memory bug।
- Batch function-কে input key-গুলোর মতো একই length আর order-এর array ফেরত দিতে হবে।
- non-loader fetch থেকে cache pre-populate করতে `prime()` ব্যবহার করো।
- DataLoader একটা generic primitive — Redis, gRPC, REST, যেকোনো batchable জিনিসের জন্য কাজ করে।
- এটা জাদু নয়। কিছু pattern (cursor children, conditional fetch) অন্য tool লাগে।

পরবর্তী: [Mutations, input types, validation](/notes/graphql/07-mutations) — write ঠিকভাবে করা।
