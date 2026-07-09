---
title: 'Mutations, input types, validation'
subtitle: 'Write শুধু side effect সহ query নয়। এদের input type, validation, transaction, idempotency, আর এমন একটা return shape লাগে যা client-কে দ্বিতীয়বার fetch না করেই তার cache update করতে দেয়।'
chapter: 7
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['graphql', 'mutations', 'input types', 'validation', 'transactions']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা `Mutation` field আসলে একটা resolver যা write করে। schema, executor, resolver signature — সব query-র মতোই। যা বদলায় সেটা হলো resolver-এর চারপাশের সবকিছু: input shape, validation, transactional scope, error reporting, আর তুমি কী ফেরত দাও যাতে client state refresh করতে পারে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা mutation হলো একটা form submission-এর মতো, বনাম একটা read-only search — mutation state বদলায়, query তা observe করে।

</Callout>

## Mutation বনাম query — আসল পার্থক্য

GraphQL spec একটা জিনিসের নিশ্চয়তা দেয়: যখন একটা single request-এ একাধিক top-level mutation থাকে, **তারা sequentially, order অনুযায়ী চলে**। query গুলো parallel-এ fan out করে।

```graphql
mutation {
	createPost(input: { title: "A" }) {
		id
	}
	createPost(input: { title: "B" }) {
		id
	}
	createPost(input: { title: "C" }) {
		id
	}
}
```

B শুরু হওয়ার আগে A পুরোপুরি resolve হয়। এটাই একমাত্র execution-level পার্থক্য। বাকি সব convention — convention অনুযায়ী, mutation হলো সেই জায়গা যেখানে তুমি write রাখো; engine-এর কিছুই এটা বাধ্য করে না।

বাস্তবে, এক request-এ অনেক mutation batch করো না। প্রতি write-এ একটা mutation করো। Network round trip সস্তা; concurrency-control bug সস্তা নয়।

## Input type — verbose কিন্তু মূল্যবান

Mutation-এর একটা single `input: <Verb><Noun>Input!` argument নেওয়া উচিত, flat scalar-এর একটা list নয়।

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

কেন এই কষ্ট:

- **Field যোগ করা সস্তা।** `CreatePostInput`-এ `excerpt: String` যোগ করো আর client যখন চায় তখন পাঠায়। flat arg দিয়ে তুমি একটা positional argument যোগ করতে আর default mismatch-এর risk নিতে।
- **Input typed।** Default value, validation directive, description — সব input type definition-এ থাকে। Tooling এটা পড়ে।
- **Reusable।** `UpdatePostInput`, `CreatePostInput`-এর pattern extend করতে পারে। Variant গুলো disciplined থাকে।
- **Client-এ পড়তে সুবিধা।** যে form code field গুলো একটা object-এ জড়ো করে, তারপর submit করে, সেটা arg ছড়িয়ে দেওয়ার চেয়ে বেশি স্বাভাবিক।

সর্বজনীনভাবে apply করো। এমনকি সবচেয়ে সহজ one-field mutation-ও নিজের input পায়।

## একটা বাস্তব mutation, end-to-end

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

Resolver, transaction আর validation সহ:

```js
import { z } from 'zod';

const CreatePostSchema = z.object({
	title: z.string().min(1).max(200),
	body: z.string().min(1),
	tags: z
		.array(z.string().regex(/^[a-z][a-z0-9-]{0,30}$/))
		.max(10)
		.optional(),
	publish: z.boolean().optional()
});

const Mutation = {
	createPost: async (_, { input }, ctx) => {
		if (!ctx.userId) throw new Error('Not authenticated');

		const data = CreatePostSchema.parse(input);

		const client = await ctx.db.connect();
		try {
			await client.query('BEGIN');

			const { rows } = await client.query(
				`INSERT INTO posts (author_id, title, body, published)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
				[ctx.userId, data.title, data.body, !!data.publish]
			);
			const post = rows[0];

			if (data.tags?.length) {
				await client.query(
					`INSERT INTO post_tags (post_id, tag)
           SELECT $1, unnest($2::text[])
           ON CONFLICT DO NOTHING`,
					[post.id, data.tags]
				);
			}

			await client.query('COMMIT');
			return post;
		} catch (e) {
			await client.query('ROLLBACK');
			throw e;
		} finally {
			client.release();
		}
	}
};
```

কয়েকটা pattern উল্লেখ করার মতো।

**Boundary-তে validate করো।** input-এ Zod (বা Yup, বা ajv) ব্যবহার করো। Business rule-এর জন্য GraphQL-এর type system-এ ভরসা করো না — এটা তোমাকে "একটা string কিনা" দেয়, তোমার আরও লাগে "1–200 char, শুধু whitespace নয়, কোনো HTML নেই।" Validation তোমার কাজ।

**Multi-statement write-এর জন্য transaction optional নয়।** pool থেকে একটা client টেনে নাও, `BEGIN`, সব করো, `COMMIT` বা `ROLLBACK`। এটা ছাড়া, step 2-এর পরে একটা error step 1-কে committed রেখে দেয়। চিরকালের inconsistent state।

**Client acquire করো, rollback path-এর জন্য `pool.query` ব্যবহার করো না।** `pool.query` প্রতিটা call-এ একটা connection checkout করে। atomicity-র জন্য তোমার পুরো transaction জুড়ে _একটা_ connection লাগে।

## Validation-এর কৌশল

Validate করার তিনটা জায়গা:

1. **Schema (free)।** GraphQL type, nullability, enum membership enforce করে। `Boolean!` কখনো `"true"` হতে পারে না — তোমার resolver চলার আগে executor reject করে।
2. **Input shape (Zod)।** Length, regex, range, conditional logic। ব্যবহারযোগ্য একটা error দিয়ে reject করে।
3. **Resolver-এ business rule।** "একটা deleted org-এ post publish করা যায় না।" Zod parse-এর পরে যায়, যেখানে তোমার typed input আছে।

Zod-এ business rule রেখো না। Resolver-এ length check রেখো না। যেখানে যেটার জায়গা সেখানে layer করো।

## যেসব error-এ client কাজ করতে পারে

একটা খালি `throw new Error("not found")` `errors[]`-এ কোনো structure ছাড়া একটা generic message হয়ে যায়। Client "validation failed"-কে "internal server error" থেকে বা "unauthorized" থেকে আলাদা করতে পারে না।

দুটো option।

**1. code দিয়ে typed error।** graphql-yoga extension সহ `GraphQLError` support করে:

```js
import { GraphQLError } from 'graphql';

throw new GraphQLError('Invalid title', {
	extensions: { code: 'VALIDATION_FAILED', field: 'title' }
});
```

Client `err.extensions.code` পড়ে আর তার উপর branch করে।

**2. data হিসেবে error (union pattern)।** chapter 2 থেকে:

```graphql
union CreatePostResult = Post | ValidationError | NotAuthorizedError
type Mutation {
	createPost(input: CreatePostInput!): CreatePostResult!
}
```

Verbose কিন্তু watertight। Client প্রতিটা case-এর জন্য fragment লেখে আর schema প্রতিটা failure mode document করে।

ছোট graph-এর জন্য extension দিয়ে code ঠিক আছে। অনেক team যে contract consume করে, তার জন্য errors-as-data মূল্যবান।

<Callout type="info">

**Internal জিনিস লুকাও।** একটা Postgres unique-violation error-এ constraint name, table name, কখনো offending value থাকে। এটা pass through করো না। resolver-এ catch করো, একটা clean error-এ map করো: `throw new GraphQLError("Email already in use", { extensions: { code: "DUPLICATE", field: "email" } })`। Stack trace আর SQL তোমার log-এ থাকে, client response-এ নয়।

</Callout>

## Idempotency

Mutation mid-flight fail করতে পারে — network drop, client retry। Idempotency ছাড়া, user "create post"-এ দুবার click করে আর দুটো post নিয়ে শেষ হয়।

সবচেয়ে পরিষ্কার সমাধান: client একটা `clientMutationId` (UUID) পাঠায় আর server এটা store করে।

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

resolver-এ, প্রথমে table check করো; যদি একটা row থাকে, তার stored result ফেরত দাও। যদি না থাকে, কাজটা করো, result store করো, ফেরত দাও।

কম গুরুত্বপূর্ণ write-এর জন্য (draft, comment) এটা অতিরিক্ত। Payment, account creation, যা কিছু customer-রা care করে — তার জন্য non-negotiable।

## Client-এর update করার মতো যথেষ্ট ফেরত দেওয়া

যদি `createPost` `Boolean` ফেরত দেয়, client-কে UI update করতে `users` আর `posts` refetch করতে হয়। অপচয়।

নতুন entity ফেরত দাও, client-এর cache-এ splice করার মতো যথেষ্ট field সহ:

```graphql
type Mutation {
	createPost(input: CreatePostInput!): Post!
}
```

Apollo Client আর urql ফেরত দেওয়া `Post` পড়বে, তাদের normalized cache-এ `id` দিয়ে খুঁজে বের করবে, আর তুমি যদি সেগুলোও include করো তবে সংশ্লিষ্ট list গুলো update করবে।

যেসব mutation list-এ প্রভাব ফেলে, তাদের জন্য parent-ও ফেরত দাও:

```graphql
type CreatePostPayload {
	post: Post!
	author: User! # has updated post count, latest activity, etc.
}
```

এখন একটা mutation request client-এর দরকারি সবকিছু ফেরত দেয়। শূন্য refetch।

## Bulk mutation

50টা post তৈরি করা দরকার? `createPostBatch(inputs: [CreatePostInput!]!)` expose করো না। Sequential top-level mutation কাজ করে, কিন্তু network-এর উপর সেগুলো ধীর।

আরও ভালো: একটা single mutation যা array নেয়, এক transaction-এ চলে:

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

এক round trip, এক transaction, partial-failure reporting। এখানেই union-typed error pattern তার মূল্য প্রমাণ করে — প্রতিটা item আলাদাভাবে succeed বা fail করতে পারে।

## Mutation আর DataLoader cache

user `42`-তে write করা একটা mutation যেকোনো concurrent বা following request-এর loader cache invalidate করে যা user `42` load করেছিল। যেহেতু loader per-request আর short-lived, একটা single request-এর ভেতরে এটা খুব কমই সমস্যা — কিন্তু যদি তোমার resolver mutate করে তারপর _একই_ mutation-এ read করে, write-এর পরে loader prime বা clear করো:

```js
ctx.loaders.user.clear(post.author_id);
// or
ctx.loaders.user.prime(String(updatedUser.id), updatedUser);
```

নয়তো post-mutation read stale, pre-mutation row ফেরত দেয়।

## রিক্যাপ

- Batch করা হলে mutation sequentially চলে। query থেকে এটাই একমাত্র engine-level পার্থক্য।
- সবসময় `input <Verb><Noun>Input!` type ব্যবহার করো। এক arg, কখনো flat scalar নয়।
- Zod দিয়ে boundary-তে validate করো। Schema type দেয়, তুমি rule দাও।
- Multi-statement write একটা connection সহ একটা real transaction-এ wrap করো।
- ছোট graph-এর জন্য `extensions` দিয়ে error code; বড় graph-এর জন্য errors-as-data union।
- Internal error লুকাও। DB constraint name-কে user-readable message-এ map করো।
- গুরুত্বপূর্ণ যেকোনো কিছুর জন্য `clientMutationId`। Idempotency একটা feature, শখ নয়।
- বদলে যাওয়া entity ফেরত দাও, client-এর cache update করার মতো যথেষ্ট scope সহ।

পরবর্তী: [Authentication and authorization](/notes/graphql/08-auth) — context, field-level check, আর directives pattern।
