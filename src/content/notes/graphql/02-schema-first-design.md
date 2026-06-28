---
title: 'Schema-first design'
subtitle: 'The schema is your contract with every client that ever exists. The decisions you make in the first afternoon — types, nullability, IDs — are the ones you live with for years.'
chapter: 2
level: 'beginner'
readingTime: '14 min'
topics: ['graphql', 'schema', 'sdl', 'types', 'nullability']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A GraphQL schema is just a text file. By convention it lives at `schema.graphql` (sometimes split into multiple files and stitched at boot). It is written in **SDL** — Schema Definition Language — which is the language for describing types and operations.

Before we run anything, learn to read and write SDL. Once you can think in schemas, the rest of GraphQL is mostly mechanics.

<Callout type="info">

**Real-World Analogy**

A GraphQL schema is like an architectural blueprint — agreed on before a single brick is laid, by both the builder and the client.

</Callout>

## A whole schema in one screen

```graphql
scalar DateTime

type User {
	id: ID!
	name: String!
	email: String!
	createdAt: DateTime!
	posts(last: Int = 10): [Post!]!
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
	posts(authorId: ID, after: String, first: Int = 20): PostConnection!
}

type PostConnection {
	edges: [PostEdge!]!
	pageInfo: PageInfo!
}

type PostEdge {
	cursor: String!
	node: Post!
}

type PageInfo {
	hasNextPage: Boolean!
	endCursor: String
}

input CreatePostInput {
	title: String!
	body: String!
}

type Mutation {
	createPost(input: CreatePostInput!): Post!
	deletePost(id: ID!): Boolean!
}
```

That is a complete (small) GraphQL API. Every concept you need is in there. Let's unpack each.

## The five kinds of types

**1. Scalars** — leaf values. Built-ins: `Int`, `Float`, `String`, `Boolean`, `ID`. You can also declare custom scalars: `scalar DateTime`, `scalar Email`, `scalar UUID`. The runtime needs serializers for those (chapter 3).

**2. Object types** — `type User { ... }`. The bread and butter. Each field has a type. Fields can take arguments.

**3. Input types** — `input CreatePostInput { ... }`. Used as mutation arguments. Cannot have circular references and cannot be returned. Without input types, mutation signatures get unwieldy fast.

**4. Enums** — `enum Role { ADMIN MEMBER GUEST }`. A finite set of named values. The runtime guarantees only those values pass.

**5. Interfaces and unions** — for polymorphism.

```graphql
interface Node {
	id: ID!
}

type User implements Node {
	id: ID!
	name: String!
}

union SearchResult = User | Post
```

`Node` lets you ask "give me anything by `id`" — the Relay convention. Unions return one of several object types and clients must use inline fragments to pick fields.

## The two root types

`type Query` — read operations. Every field on `Query` is an entry point clients can ask for.

`type Mutation` — write operations. Same shape, but they are guaranteed to run sequentially when batched, and the convention says they do something with side effects.

There is also `type Subscription` for realtime — covered in chapter 9. You do not need it day one.

## Nullability — the decision that haunts you

Every field is nullable by default. `String` means "may be null." `String!` means "guaranteed non-null." The bang is the most consequential character in your whole schema.

```graphql
type User {
	id: ID! # always present
	name: String! # always present
	bio: String # may be null
	posts: [Post!]! # array always present, items always present
	drafts: [Post!] # array may be null, items always present
	flags: [Post]! # array always present, items may be null
}
```

Read those array signatures slowly. The first `!` after `]` says the array itself is non-null. The `!` after `Post` says items are non-null. They mean different things.

**Two rules that save you:**

1. **`null` propagates up.** If a non-null field returns null (or throws), the error bubbles up to the nearest nullable parent and that whole branch becomes null. If everything is non-null, one bad field nukes the whole response.
2. **You cannot un-mark a field as non-null without breaking clients.** Going `String!` → `String` is a breaking change. Going `String` → `String!` is also breaking. Once non-null, forever non-null.

<Callout type="tip">

**Default to nullable.** Mark a field `!` only when truly always present. `id` and `createdAt` deserve `!`. `bio`, `avatar`, `lastLoginAt` almost never do. The cost of being too aggressive shows up as outages two years from now when one query starts failing entirely because one nullable thing returned null.

</Callout>

## Arguments and defaults

Fields can take arguments, including on nested fields:

```graphql
type User {
	posts(last: Int = 10, status: PostStatus = PUBLISHED): [Post!]!
}
```

Defaults belong in the schema, not the resolver. `last: Int = 10` is documented in introspection — clients see the default. `last: Int` with the resolver picking 10 internally is invisible and surprising.

## IDs and the ID type

`ID` is a string. It is opaque — clients should not parse it. This is the lever that lets you migrate from `int` PKs to UUIDs without breaking the schema.

The Relay convention encodes the type into the ID via base64:

```
base64("User:42") = "VXNlcjo0Mg=="
```

So `User.id = "VXNlcjo0Mg=="` and the global `node(id: ID!): Node` query can decode it and route to the right resolver. Optional, but worth knowing — you will see it in the wild.

## Pagination — the right way

Three ways exist. Two are wrong.

**Offset/limit** — `posts(offset: Int, limit: Int)`. Easy, but breaks under writes (rows shift), and Postgres `OFFSET 10000` is a full scan. Avoid for anything user-facing.

**Page numbers** — same problems with extra ceremony. Avoid.

**Cursors (Relay connections)** — the verbose-looking pattern in the schema above. `edges`, `node`, `cursor`, `pageInfo`. Stable under inserts, fast under indexes, paginates forward and backward. Worth the extra types.

```graphql
type Query {
	posts(after: String, first: Int = 20): PostConnection!
}
```

The cursor is opaque (usually a base64-encoded `(createdAt, id)` tuple). Clients pass back what they got — no offset math.

## Errors — a real decision

GraphQL has two error styles and you must pick one.

**1. Top-level errors.** Resolvers throw, errors land in the response's `errors[]` array, the field becomes null. Simple. Default behavior.

```json
{
	"data": { "user": null },
	"errors": [{ "message": "User not found", "path": ["user"] }]
}
```

**2. Errors as data.** Make failures part of the schema:

```graphql
union UserResult = User | NotFoundError | PermissionError

type Query {
	user(id: ID!): UserResult!
}
```

The client uses fragments to pattern-match. Verbose, but typed and the client cannot forget to handle errors. Used heavily in production graphs (Shopify, GitHub).

For day one, top-level errors are fine. Migrate later if needed.

## Documenting the schema

Anything in `"""..."""` becomes documentation surfaced in introspection and tools:

```graphql
"""
A registered user.
"""
type User {
	"""
	Stable, opaque identifier. Do not parse.
	"""
	id: ID!

	"""
	Public display name. Not unique.
	"""
	name: String!
}
```

Treat docs as part of the schema, not optional. Clients without docs reverse-engineer your meaning, and they get it wrong.

## Schema evolution — additive only

The first commandment of GraphQL: **additive changes only**. You can:

- Add a new type
- Add a new field to an existing type
- Add a new argument to a field, **as long as it is nullable or has a default**

You cannot:

- Remove a field a client might query
- Make a non-null field nullable (changes return shape)
- Make an argument required when it was not
- Change a field's type to anything not assignable

Removal is a multi-step dance: deprecate first (`@deprecated(reason: "Use newField instead.")`), monitor usage, remove after months. Apollo Studio and similar tools track per-field usage; for a small self-hosted graph, log the field selections (chapter 10).

## Naming conventions

These are not enforced but every large graph follows them:

- **Types:** `PascalCase` — `User`, `BlogPost`, `OrderLineItem`.
- **Fields and arguments:** `camelCase` — `firstName`, `createdAt`, `pageInfo`.
- **Enums:** `SCREAMING_SNAKE_CASE` for values — `enum Role { ADMIN MEMBER }`.
- **Mutations:** verb first — `createPost`, `deletePost`, `archiveOrder`. Inputs as `<Verb><Noun>Input` — `CreatePostInput`.
- **Booleans:** `is`/`has` prefix — `isPublished`, `hasComments`.

## Schema files in practice

For a small graph, one `schema.graphql` is fine. For a medium graph, split by domain:

```
schema/
  user.graphql
  post.graphql
  comment.graphql
  scalars.graphql
  index.graphql      # type Query and type Mutation, root only
```

graphql-yoga loads them with `loadSchema` and merges them. Same with `gqlgen` and Strawberry.

## Recap

- SDL is a small text file. Five kinds of types: scalar, object, input, enum, interface/union.
- `Query` and `Mutation` are root types. `Subscription` is the third.
- `!` means non-null. Default to nullable; non-null is forever.
- Use cursor-based connections, not offsets.
- Errors: top-level for simple, errors-as-data for serious. Pick early.
- Schema evolution is additive only. Deprecate then remove, never break.
- `"""docs"""` are not optional. Naming conventions matter for tooling.

Next: [Running your first server](/notes/graphql/03-first-server) — graphql-yoga, end-to-end, in 60 lines of code.
