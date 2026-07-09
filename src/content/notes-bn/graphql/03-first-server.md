---
title: 'তোমার প্রথম সার্ভার চালানো'
subtitle: 'graphql-yoga, শুরু থেকে শেষ পর্যন্ত, ষাট লাইনে। এই চ্যাপ্টার শেষে তোমার ল্যাপটপে একটা সত্যিকারের GraphQL সার্ভার থাকবে, curl দিয়ে কোয়েরি করা, Postgres-এর সাথে কথা বলছে।'
chapter: 3
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['graphql', 'graphql-yoga', 'node', 'postgres']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

থিওরি বন্ধ। কোড চালু।

এই চ্যাপ্টার একটা মিনিমাল GraphQL সার্ভার ছাড়ছে যা একটা সত্যিকারের Postgres ডেটাবেস থেকে পড়ে। এটা ইচ্ছাকৃতভাবেই খালি — কোনো DataLoader নেই (চ্যাপ্টার 6), কোনো auth নেই (চ্যাপ্টার 8), কোনো subscriptions নেই (চ্যাপ্টার 9)। তুমি পুরোটা পাঁচ মিনিটে কপি করে curl করতে পারবে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

তোমার প্রথম GraphQL সার্ভার বানানো অনেকটা একটা দোকান খোলার মতো — তুমি ঠিক করো কী বিক্রি করবে (schema), তারপর কাস্টমারদের সামলাও (resolvers)।

</Callout>

## যা যা লাগবে

- Node 20+ — `node --version`।
- Postgres লোকালি চলছে (বা যেকোনো জায়গায় যেখানে পৌঁছানো যায়)। একটা VPS-এ: `apt install postgresql`। Mac-এ: `brew install postgresql@16`।
- একটা প্রজেক্ট ডিরেক্টরি।

```bash
mkdir my-graphql && cd my-graphql
npm init -y
npm install graphql graphql-yoga pg
npm install -D nodemon
```

এটাই পুরো ডিপেন্ডেন্সি ফুটপ্রিন্ট। তিনটা প্যাকেজ।

## ডেটাবেস

schema বানাও আর দুটো রো seed করো:

```sql
-- save as schema.sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id BIGSERIAL PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX posts_author_id_created_at ON posts(author_id, created_at DESC);

INSERT INTO users (name, email) VALUES
  ('Sumayya',  'sumayya@example.com'),
  ('Aisha',  'aisha@example.com');

INSERT INTO posts (author_id, title, body) VALUES
  (1, 'Why I left Kubernetes', 'A long story...'),
  (1, 'Self-hosting is a skill', 'Just rent a VPS.'),
  (2, 'Postgres is enough',     'Most apps do not need more.');
```

```bash
createdb my_graphql
psql my_graphql < schema.sql
```

## schema

```graphql
# schema.graphql
scalar DateTime

type User {
	id: ID!
	name: String!
	email: String!
	createdAt: DateTime!
	posts: [Post!]!
}

type Post {
	id: ID!
	title: String!
	body: String!
	createdAt: DateTime!
	author: User!
}

type Query {
	user(id: ID!): User
	users: [User!]!
	posts: [Post!]!
}
```

## সার্ভার

```js
// server.js
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createYoga, createSchema } from 'graphql-yoga';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
	connectionString: process.env.DATABASE_URL || 'postgres:///my_graphql'
});

const typeDefs = readFileSync('./schema.graphql', 'utf8');

const resolvers = {
	DateTime: {
		serialize: (v) => (v instanceof Date ? v.toISOString() : v),
		parseValue: (v) => new Date(v)
	},

	Query: {
		user: async (_, { id }) => {
			const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
			return rows[0] || null;
		},
		users: async () => {
			const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
			return rows;
		},
		posts: async () => {
			const { rows } = await pool.query('SELECT * FROM posts ORDER BY created_at DESC');
			return rows;
		}
	},

	User: {
		createdAt: (u) => u.created_at,
		posts: async (u) => {
			const { rows } = await pool.query(
				'SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC',
				[u.id]
			);
			return rows;
		}
	},

	Post: {
		createdAt: (p) => p.created_at,
		author: async (p) => {
			const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [p.author_id]);
			return rows[0];
		}
	}
};

const yoga = createYoga({
	schema: createSchema({ typeDefs, resolvers }),
	graphiql: true
});

const server = createServer(yoga);
server.listen(4000, () => {
	console.log('graphql ready on http://localhost:4000/graphql');
});
```

ষাট লাইন। এটাই একটা কাজ করা GraphQL সার্ভার।

```bash
node server.js
```

ব্রাউজারে `http://localhost:4000/graphql` খোলো — graphql-yoga-এর সাথে বিল্ট-ইন **GraphiQL** আসে। তুমি একটা কোয়েরি এডিটর, autocomplete, schema browser, আর inline docs পাও।

## একটা সত্যিকারের কোয়েরি

এটা GraphiQL-এ পেস্ট করো:

```graphql
{
	user(id: 1) {
		name
		email
		posts {
			title
			createdAt
		}
	}
}
```

চালাও। তুমি ঠিক ওই ফিল্ডগুলোই পাবে। `email` সরিয়ে দেখো — এটা response থেকে চলে গেছে। `email` আবার যোগ করে দেখো — এটা ফিরে এসেছে। response-এর shape সবসময় কোয়েরির প্রতিচ্ছবি। এটাই GraphQL-এর contract।

## এইমাত্র কী হলো

একটা GraphQL রিকোয়েস্ট এই pipeline-এর মধ্য দিয়ে যায়:

1. **Parse** — কোয়েরি স্ট্রিংটাকে একটা AST-এ পরিণত করা।
2. **Validate** — প্রতিটা ফিল্ড schema-তে আছে কিনা, প্রতিটা type মেলে কিনা, argument-গুলো valid কিনা তা চেক করা।
3. **Execute** — AST ধরে হাঁটা, প্রতিটা ফিল্ডের জন্য একটা resolver কল করা।
4. **Format** — resolver-এর রিটার্ন ভ্যালুগুলো response shape-এ জড়ো করা।

তুমি parser, validator, বা executor লেখোনি — `graphql` (JS reference impl) সেটা করেছে। তুমি লিখেছ _resolvers_। এটাই একমাত্র কোড যা আসলে তোমার নিজের।

## এটা curl করো

GraphiQL ভালো কিন্তু API আসলে HTTP-এর ওপর দিয়ে শুধু JSON:

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ users { id name } }"}' | jq
```

Variable-গুলো একটা আলাদা ফিল্ডে থাকে (এটাই সঠিক পথ — কখনো ইউজার ইনপুট কোয়েরিতে string-interpolate করো না):

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetUser($id: ID!) { user(id: $id) { name } }",
    "variables": { "id": "1" }
  }' | jq
```

## Resolver-এর রিটার্ন contract

resolver-গুলোতে দুটো জিনিস খেয়াল করো:

**1. Field resolver-গুলো অপশনাল।** Postgres `name`, `email`, আর `id` রিটার্ন করে — এগুলো স্বয়ংক্রিয়ভাবে `User.name`, `User.email`, `User.id` হয়ে যায় কারণ নামগুলো মেলে। কোনো resolver ডিফাইন করা না থাকলে graphql-yoga column-এর ভ্যালুটাই ফিল্ডের ভ্যালু হিসেবে ব্যবহার করে।

**2. নামের মিল না থাকলে resolver লাগে।** Postgres-এ আছে `created_at`; schema-তে আছে `createdAt`। তাই `User.createdAt: (u) => u.created_at` দরকার। বেশিরভাগ টিম হয় DB-তে snake_case আর schema-তে camelCase-এ স্ট্যান্ডার্ডাইজ করে (ছোট ছোট resolver লিখে) নয়তো query-time mapping ব্যবহার করে (`SELECT created_at AS "createdAt"`)। দুটোই কাজ করে।

## এই সার্ভারে কী সমস্যা

এটা স্লো। বিশেষভাবে: দশজন ইউজারকে তাদের পোস্টসহ কোয়েরি করো, তুমি **এগারোটা SQL কোয়েরি** ছোড়ো — একটা ইউজারদের জন্য, তারপর প্রতি ইউজারের জন্য একটা করে পোস্টের।

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

এটাই **N+1 সমস্যা** আর এটা GraphQL-এর সবচেয়ে গুরুত্বপূর্ণ শিক্ষা। এর জন্য আমরা দুটো পুরো চ্যাপ্টার (5 আর 6) উৎসর্গ করেছি। এখনকার জন্য: খেয়াল করো সমস্যাটা আছে, এই চ্যাপ্টার পড়া শেষ করো।

## Dev workflow

```bash
# package.json
"scripts": {
  "dev": "nodemon --exec node server.js -e js,graphql"
}
```

`npm run dev` ফাইল বদলালে reload করে। schema ফাইলটাও watch list-এ আছে, তাই `schema.graphql` এডিট করলে reload হয়।

## Go আর Python-এ সমতুল্য

**Go (gqlgen)** — schema-first, Go কোড জেনারেট করে। একই schema, একই resolvers, কিন্তু compile time-এ typed:

```go
func (r *queryResolver) User(ctx context.Context, id string) (*model.User, error) {
    return r.repo.UserByID(ctx, id)
}
```

**Python (Strawberry)** — code-first, type-গুলো schema চালায়:

```python
@strawberry.type
class User:
    id: strawberry.ID
    name: str
    email: str

@strawberry.type
class Query:
    @strawberry.field
    async def user(self, id: strawberry.ID) -> User | None:
        return await fetch_user(id)
```

মেন্টাল মডেল — schema, resolvers, execution tree — একদম একই। যে ভাষা ship করবে সেটা বেছে নাও।

<Callout type="info">

**Apollo Server-এর বদলে graphql-yoga কেন?** Apollo Server v4 ঠিকই আছে, কিন্তু graphql-yoga-এর footprint ছোট, `envelop`-এর মাধ্যমে plugin-based, এক প্যাকেজে HTTP/WebSocket/file uploads সাপোর্ট করে, আর তোমাকে Apollo-র hosted service-এর দিকে ঠেলে দেয় না। দুটোই কাজ করে। self-hosted-এর জন্য Yoga বেশি বন্ধুত্বপূর্ণ।

</Callout>

## রিক্যাপ

- তিনটা ডিপেন্ডেন্সি: `graphql`, `graphql-yoga`, `pg`।
- Schema হলো একটা `.graphql` ফাইলে SDL। Resolvers হলো একটা সাধারণ JS object।
- Yoga GraphiQL ছাড়ে — ব্রাউজারে কোয়েরি এডিটর, বিনামূল্যে।
- Field resolver-গুলো ডিফল্টে property access করে। শুধু তখনই override করো যখন নাম মেলে না বা তোমার fetch করা দরকার।
- পুরো pipeline: parse → validate → execute → format। তুমি resolvers লেখো; runtime বাকিটা করে।
- এই সার্ভার সঠিক কিন্তু স্লো। চ্যাপ্টার 5 হলো কেন।

পরবর্তী: [Resolvers আর execution tree](/notes/graphql/04-resolvers) — engine তোমার কোয়েরি ধরে হাঁটার সময় আসলে কী করছে।
