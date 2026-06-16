---
title: "Running your first server"
subtitle: "graphql-yoga, end-to-end, in sixty lines. By the end of this chapter you will have a real GraphQL server on your laptop, queried with curl, talking to Postgres."
chapter: 3
level: "beginner"
readingTime: "12 min"
topics: ["graphql", "graphql-yoga", "node", "postgres"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Theory off. Code on.

This chapter ships a minimal GraphQL server that reads from a real Postgres database. It is intentionally bare — no DataLoader (chapter 6), no auth (chapter 8), no subscriptions (chapter 9). You can copy the whole thing in five minutes and curl it.

<Callout type="info">

**Real-World Analogy**

Building your first GraphQL server is like opening a shop — you define what you sell (schema), then handle customers (resolvers).

</Callout>

## What you will need

- Node 20+ — `node --version`.
- Postgres running locally (or anywhere reachable). On a VPS: `apt install postgresql`. Mac: `brew install postgresql@16`.
- A project directory.

```bash
mkdir my-graphql && cd my-graphql
npm init -y
npm install graphql graphql-yoga pg
npm install -D nodemon
```

That is the whole dependency footprint. Three packages.

## The database

Create the schema and seed two rows:

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

## The schema

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

## The server

```js
// server.js
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createYoga, createSchema } from "graphql-yoga";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres:///my_graphql",
});

const typeDefs = readFileSync("./schema.graphql", "utf8");

const resolvers = {
  DateTime: {
    serialize: (v) => (v instanceof Date ? v.toISOString() : v),
    parseValue: (v) => new Date(v),
  },

  Query: {
    user: async (_, { id }) => {
      const { rows } = await pool.query(
        "SELECT * FROM users WHERE id = $1",
        [id],
      );
      return rows[0] || null;
    },
    users: async () => {
      const { rows } = await pool.query("SELECT * FROM users ORDER BY id");
      return rows;
    },
    posts: async () => {
      const { rows } = await pool.query(
        "SELECT * FROM posts ORDER BY created_at DESC",
      );
      return rows;
    },
  },

  User: {
    createdAt: (u) => u.created_at,
    posts: async (u) => {
      const { rows } = await pool.query(
        "SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC",
        [u.id],
      );
      return rows;
    },
  },

  Post: {
    createdAt: (p) => p.created_at,
    author: async (p) => {
      const { rows } = await pool.query(
        "SELECT * FROM users WHERE id = $1",
        [p.author_id],
      );
      return rows[0];
    },
  },
};

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphiql: true,
});

const server = createServer(yoga);
server.listen(4000, () => {
  console.log("graphql ready on http://localhost:4000/graphql");
});
```

Sixty lines. That is a working GraphQL server.

```bash
node server.js
```

Open `http://localhost:4000/graphql` in a browser — graphql-yoga ships with **GraphiQL** built in. You get a query editor, autocomplete, schema browser, and inline docs.

## A real query

Paste this into GraphiQL:

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

Run it. You get exactly those fields. Try removing `email` — it is gone from the response. Try adding `email` back — it is back. The shape of the response always mirrors the query. That is the GraphQL contract.

## What just happened

A GraphQL request goes through this pipeline:

1. **Parse** — turn the query string into an AST.
2. **Validate** — check every field exists in the schema, every type matches, arguments are valid.
3. **Execute** — walk the AST, calling a resolver for each field.
4. **Format** — collect resolver return values into the response shape.

You did not write the parser, validator, or executor — `graphql` (the JS reference impl) did. You wrote *resolvers*. That is the only code you actually own.

## Curl it

GraphiQL is nice but the API is just JSON over HTTP:

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ users { id name } }"}' | jq
```

Variables live in a separate field (the right way — never string-interpolate user input into a query):

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetUser($id: ID!) { user(id: $id) { name } }",
    "variables": { "id": "1" }
  }' | jq
```

## Resolver return contracts

Notice two things in the resolvers:

**1. Field resolvers are optional.** Postgres returns `name`, `email`, and `id` — these become `User.name`, `User.email`, `User.id` automatically because the names match. graphql-yoga uses the column value as the field value if no resolver is defined.

**2. Naming mismatch needs a resolver.** Postgres has `created_at`; the schema has `createdAt`. So `User.createdAt: (u) => u.created_at` is required. Most teams either standardize on snake_case in DB and camelCase in schema (writing tiny resolvers) or use a query-time mapping (`SELECT created_at AS "createdAt"`). Both work.

## What is wrong with this server

It is slow. Specifically: query for ten users with their posts, you fire **eleven SQL queries** — one for users, then one per user for posts.

```graphql
{ users { name posts { title } } }
```

That is the **N+1 problem** and it is the most important lesson in GraphQL. We dedicate two whole chapters to it (5 and 6). For now: notice the problem exists, finish reading this chapter.

## Dev workflow

```bash
# package.json
"scripts": {
  "dev": "nodemon --exec node server.js -e js,graphql"
}
```

`npm run dev` reloads on file changes. The schema file is on the watch list too, so editing `schema.graphql` reloads.

## Equivalents in Go and Python

**Go (gqlgen)** — schema-first, generates Go code. The same schema, the same resolvers, but typed at compile time:

```go
func (r *queryResolver) User(ctx context.Context, id string) (*model.User, error) {
    return r.repo.UserByID(ctx, id)
}
```

**Python (Strawberry)** — code-first, types drive the schema:

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

The mental model — schema, resolvers, execution tree — is identical. Pick the language you ship.

<Callout type="info">

**Why graphql-yoga over Apollo Server?** Apollo Server v4 is fine, but graphql-yoga has a smaller footprint, is plugin-based via `envelop`, supports HTTP/WebSocket/file uploads in one package, and does not push you toward Apollo's hosted services. Both work. Yoga is friendlier for self-hosted.

</Callout>

## Recap

- Three dependencies: `graphql`, `graphql-yoga`, `pg`.
- Schema is SDL in a `.graphql` file. Resolvers are a plain JS object.
- Yoga ships GraphiQL — query editor in the browser, free.
- Field resolvers default to property access. Override only when names mismatch or you need to fetch.
- The whole pipeline: parse → validate → execute → format. You write resolvers; the runtime does the rest.
- This server is correct but slow. Chapter 5 is why.

Next: [Resolvers and the execution tree](/notes/graphql/04-resolvers) — what the engine is actually doing while it walks your query.

