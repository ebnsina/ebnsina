---
title: 'Schema-first design'
subtitle: 'Schema হলো আজ পর্যন্ত যত ক্লায়েন্ট আছে তাদের প্রত্যেকের সাথে আপনার contract। প্রথম দুপুরে নেওয়া সিদ্ধান্তগুলো — types, nullability, ID — বছরের পর বছর আপনাকে বয়ে বেড়াতে হয়।'
chapter: 2
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['graphql', 'schema', 'sdl', 'types', 'nullability']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা GraphQL schema নিছক একটা text ফাইল। প্রথা অনুযায়ী এটা থাকে `schema.graphql`-এ (কখনও কখনও একাধিক ফাইলে ভাগ করে boot-এর সময় সেলাই করা হয়)। এটা লেখা হয় **SDL**-এ — Schema Definition Language — যা types আর operation বর্ণনা করার ভাষা।

কিছু চালানোর আগে, SDL পড়তে আর লিখতে শিখুন। একবার schema-তে ভাবতে পারলে, GraphQL-এর বাকিটা মূলত যান্ত্রিক ব্যাপার।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা GraphQL schema হলো একটা স্থাপত্যের নকশার মতো — একটা ইট গাঁথার আগেই builder আর client দুজন মিলে যেটার উপর একমত হয়।

</Callout>

## গল্পে বুঝি

মারিয়াম আল-আসতুরলাবি একজন স্থপতি। বাগদাদের এক ধনী বণিক ফাতিমা আল-ফিহরি তাঁকে একটা বড় বাড়ি বানানোর দায়িত্ব দিলেন। মারিয়াম প্রথমেই ইট গাঁথতে গেলেন না — বরং টেবিলে বসে গোটা বাড়ির একটা নিখুঁত নকশা আঁকলেন। প্রতিটা ঘর কী — শোবার ঘর, রান্নাঘর, লাইব্রেরি, উঠান — কোন ঘরের দরজা কোন ঘরে খোলে, লাইব্রেরি থেকে সিঁড়ি কোথায় নামে, উঠান কোন ঘরগুলোকে জোড়া দেয় — সব একটা কাগজেই ঠিকঠাক এঁকে দিলেন।

তারপর মারিয়াম, ফাতিমা (client) আর মিস্ত্রিদের প্রধান — তিনজনই সেই নকশায় সই করলেন। এখন একটা ইটও গাঁথার আগে সবাই একমত: বাড়িতে ঠিক কী কী থাকবে, কোন ঘর কীসের সাথে জোড়া। মাঝপথে মিস্ত্রি যদি রান্নাঘরের জায়গায় গুদাম বানাতে চায়, নকশা বলে দেয় — না। ফাতিমা যদি বলেন "লাইব্রেরিটা তো দোতলায় থাকার কথা ছিল", নকশা খুলেই তর্ক মিটে যায়। নকশা হলো চুক্তি; বাড়ি হলো সেটার বাস্তবায়ন মাত্র।

এই নকশাটাই আসলে **GraphQL schema**, আর schema-first design মানে ইট গাঁথার আগে নকশা আঁকা। প্রতিটা ঘর আর তার ধরন হলো একটা **type** আর তার **field** — `type User`, `type Post`, প্রতিটার নির্দিষ্ট field। ঘর কীভাবে একে অন্যের সাথে জোড়া, সেটা হলো type-দের মধ্যে **relationship** — একটা `Post`-এর `author` একটা `User`, একটা `User`-এর `posts` একগুচ্ছ `Post`। আর সইয়ের আগে সবাই একমত হওয়া — এটাই **schema-as-contract**: schema লেখা হয় আগে, resolver (আসল কোড, অর্থাৎ ইট গাঁথা) লেখা হয় পরে। বাস্তবেও ঠিক এই কারণেই দল আগে `.graphql` schema ফাইলে সবাই মিলে একমত হয়, তারপর frontend আর backend দুই দল আলাদাভাবে সেই একই নকশা ধরে কাজ করে — client-server-এর তর্ক schema খুললেই মিটে যায়।

## এক স্ক্রিনে একটা গোটা schema

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

এটা একটা সম্পূর্ণ (ছোট) GraphQL API। আপনার যত ধারণা দরকার সব ওখানে আছে। চলুন প্রতিটা খুলে দেখি।

## পাঁচ ধরনের type

**১. Scalars** — leaf value। Built-in: `Int`, `Float`, `String`, `Boolean`, `ID`। আপনি কাস্টম scalar-ও ঘোষণা করতে পারেন: `scalar DateTime`, `scalar Email`, `scalar UUID`। runtime-এর সেগুলোর জন্য serializer দরকার (৩ নম্বর অধ্যায়)।

**২. Object types** — `type User { ... }`। মূল কাঠামো। প্রতিটা ফিল্ডের একটা type আছে। ফিল্ড argument নিতে পারে।

**৩. Input types** — `input CreatePostInput { ... }`। Mutation argument হিসেবে ব্যবহৃত হয়। circular reference থাকতে পারে না আর রিটার্ন করা যায় না। input type ছাড়া mutation signature দ্রুত জবুথবু হয়ে যায়।

**৪. Enums** — `enum Role { ADMIN MEMBER GUEST }`। নাম-দেওয়া মানের একটা সসীম সেট। runtime নিশ্চিত করে শুধু ওই মানগুলোই পাস হয়।

**৫. Interfaces আর unions** — polymorphism-এর জন্য।

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

`Node` আপনাকে "`id` দিয়ে যেকোনো কিছু দাও" জিজ্ঞেস করতে দেয় — Relay convention। Union একাধিক object type-এর মধ্যে একটা রিটার্ন করে আর ফিল্ড বেছে নিতে ক্লায়েন্টকে inline fragment ব্যবহার করতে হয়।

## দুটো root type

`type Query` — read operation। `Query`-এর প্রতিটা ফিল্ড একটা entry point যা ক্লায়েন্ট চাইতে পারে।

`type Mutation` — write operation। একই আকার, কিন্তু batch করা হলে সেগুলো ক্রমানুসারে চলার গ্যারান্টি থাকে, আর প্রথা বলে এরা side effect সহ কিছু একটা করে।

realtime-এর জন্য `type Subscription`-ও আছে — ৯ নম্বর অধ্যায়ে আলোচিত। প্রথম দিন এটা আপনার দরকার নেই।

## Nullability — যে সিদ্ধান্ত আপনাকে তাড়া করে

প্রতিটা ফিল্ড ডিফল্টভাবে nullable। `String` মানে "null হতে পারে।" `String!` মানে "নিশ্চিতভাবে non-null।" এই bang-টা আপনার গোটা schema-র সবচেয়ে গুরুত্বপূর্ণ অক্ষর।

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

ওই array signature-গুলো ধীরে ধীরে পড়ুন। `]`-এর পরের প্রথম `!` বলে array নিজেই non-null। `Post`-এর পরের `!` বলে item-গুলো non-null। এরা আলাদা জিনিস বোঝায়।

**দুটো নিয়ম যা আপনাকে বাঁচায়:**

1. **`null` উপরের দিকে propagate করে।** একটা non-null ফিল্ড null রিটার্ন করলে (বা থ্রো করলে), error-টা নিকটতম nullable parent পর্যন্ত বুদবুদের মতো উঠে আসে আর সেই গোটা শাখাটা null হয়ে যায়। সব কিছু non-null হলে, একটা খারাপ ফিল্ড গোটা রেসপন্সটাকে উড়িয়ে দেয়।
2. **ক্লায়েন্ট না ভেঙে একটা ফিল্ডকে non-null থেকে un-mark করতে পারবেন না।** `String!` → `String` করা একটা breaking change। `String` → `String!` করাও breaking। একবার non-null, চিরকাল non-null।

<Callout type="tip">

**ডিফল্টে nullable রাখুন।** একটা ফিল্ডকে `!` চিহ্নিত করুন শুধু তখনই যখন এটা সত্যিই সবসময় থাকে। `id` আর `createdAt` `!`-এর যোগ্য। `bio`, `avatar`, `lastLoginAt` প্রায় কখনোই নয়। বেশি আক্রমণাত্মক হওয়ার মূল্য দুই বছর পরে outage হিসেবে দেখা দেয়, যখন একটা nullable জিনিস null রিটার্ন করায় একটা query পুরোপুরি ব্যর্থ হতে শুরু করে।

</Callout>

## Arguments আর default

ফিল্ড argument নিতে পারে, nested ফিল্ডেও:

```graphql
type User {
	posts(last: Int = 10, status: PostStatus = PUBLISHED): [Post!]!
}
```

Default-এর জায়গা schema-তে, resolver-এ নয়। `last: Int = 10` introspection-এ documented — ক্লায়েন্ট default দেখে। `last: Int` যেখানে resolver ভেতরে ভেতরে 10 বেছে নেয়, সেটা অদৃশ্য আর চমকপ্রদ।

## ID আর ID type

`ID` একটা string। এটা opaque — ক্লায়েন্টের এটা parse করা উচিত নয়। এই লিভারটাই আপনাকে schema না ভেঙে `int` PK থেকে UUID-তে migrate করতে দেয়।

Relay convention base64-এর মাধ্যমে type-টাকে ID-তে encode করে:

```
base64("User:42") = "VXNlcjo0Mg=="
```

তো `User.id = "VXNlcjo0Mg=="` আর global `node(id: ID!): Node` query এটা decode করে সঠিক resolver-এ route করতে পারে। ঐচ্ছিক, তবে জেনে রাখার মতো — বাস্তবে এটা দেখবেন।

## Pagination — সঠিক উপায়

তিনটা উপায় আছে। দুটো ভুল।

**Offset/limit** — `posts(offset: Int, limit: Int)`। সহজ, কিন্তু write-এর নিচে ভেঙে পড়ে (row সরে যায়), আর Postgres `OFFSET 10000` একটা full scan। যেকোনো user-facing জিনিসের জন্য এড়িয়ে চলুন।

**Page number** — একই সমস্যা, বাড়তি আনুষ্ঠানিকতা সহ। এড়িয়ে চলুন।

**Cursors (Relay connections)** — উপরের schema-র ওই verbose-দেখতে প্যাটার্নটা। `edges`, `node`, `cursor`, `pageInfo`। insert-এর নিচে stable, index-এর নিচে দ্রুত, সামনে-পিছনে দুই দিকেই paginate করে। বাড়তি type-গুলোর মূল্য আছে।

```graphql
type Query {
	posts(after: String, first: Int = 20): PostConnection!
}
```

Cursor-টা opaque (সাধারণত একটা base64-encoded `(createdAt, id)` tuple)। ক্লায়েন্ট যা পেয়েছিল তা-ই ফেরত পাঠায় — কোনো offset হিসাব নেই।

## Errors — একটা সত্যিকারের সিদ্ধান্ত

GraphQL-এ দুটো error style আছে আর আপনাকে একটা বেছে নিতে হবে।

**১. Top-level errors।** Resolver থ্রো করে, error রেসপন্সের `errors[]` array-তে গিয়ে পড়ে, ফিল্ডটা null হয়ে যায়। সহজ। ডিফল্ট আচরণ।

```json
{
	"data": { "user": null },
	"errors": [{ "message": "User not found", "path": ["user"] }]
}
```

**২. Errors as data।** ব্যর্থতাকে schema-র অংশ বানান:

```graphql
union UserResult = User | NotFoundError | PermissionError

type Query {
	user(id: ID!): UserResult!
}
```

ক্লায়েন্ট pattern-match করতে fragment ব্যবহার করে। Verbose, কিন্তু typed আর ক্লায়েন্ট error handle করতে ভুলে যেতে পারে না। production graph-এ (Shopify, GitHub) ব্যাপকভাবে ব্যবহৃত।

প্রথম দিনের জন্য top-level error ঠিক আছে। দরকার হলে পরে migrate করবেন।

## Schema-কে document করা

`"""..."""`-এর ভেতরের যেকোনো কিছু introspection আর tool-এ ফুটে ওঠা documentation হয়ে যায়:

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

doc-কে schema-র অংশ হিসেবে গণ্য করুন, ঐচ্ছিক নয়। doc ছাড়া ক্লায়েন্ট আপনার অর্থ reverse-engineer করে, আর তারা ভুল বোঝে।

## Schema evolution — শুধু additive

GraphQL-এর প্রথম আদেশ: **শুধু additive পরিবর্তন**। আপনি পারেন:

- একটা নতুন type যোগ করতে
- একটা বিদ্যমান type-এ একটা নতুন ফিল্ড যোগ করতে
- একটা ফিল্ডে একটা নতুন argument যোগ করতে, **যতক্ষণ সেটা nullable বা একটা default থাকে**

আপনি পারেন না:

- ক্লায়েন্ট query করতে পারে এমন একটা ফিল্ড সরাতে
- একটা non-null ফিল্ডকে nullable করতে (রিটার্ন আকার বদলায়)
- একটা argument-কে required করতে যখন সেটা ছিল না
- একটা ফিল্ডের type এমন কিছুতে বদলাতে যা assignable নয়

সরানো একটা বহু-ধাপের নাচ: আগে deprecate করুন (`@deprecated(reason: "Use newField instead.")`), ব্যবহার monitor করুন, মাসখানেক পরে সরান। Apollo Studio আর অনুরূপ tool per-field ব্যবহার track করে; একটা ছোট self-hosted graph-এর জন্য ফিল্ড selection log করুন (১০ নম্বর অধ্যায়)।

## Naming convention

এগুলো enforce করা হয় না তবে প্রতিটা বড় graph এগুলো মেনে চলে:

- **Types:** `PascalCase` — `User`, `BlogPost`, `OrderLineItem`।
- **Fields আর arguments:** `camelCase` — `firstName`, `createdAt`, `pageInfo`।
- **Enums:** মানের জন্য `SCREAMING_SNAKE_CASE` — `enum Role { ADMIN MEMBER }`।
- **Mutations:** verb আগে — `createPost`, `deletePost`, `archiveOrder`। Input হিসেবে `<Verb><Noun>Input` — `CreatePostInput`।
- **Booleans:** `is`/`has` prefix — `isPublished`, `hasComments`।

## বাস্তবে schema ফাইল

একটা ছোট graph-এর জন্য একটা `schema.graphql` ঠিক আছে। একটা মাঝারি graph-এর জন্য domain অনুযায়ী ভাগ করুন:

```
schema/
  user.graphql
  post.graphql
  comment.graphql
  scalars.graphql
  index.graphql      # type Query and type Mutation, root only
```

graphql-yoga এগুলো `loadSchema` দিয়ে লোড করে merge করে। `gqlgen` আর Strawberry-তেও একই।

## রিক্যাপ

- SDL একটা ছোট text ফাইল। পাঁচ ধরনের type: scalar, object, input, enum, interface/union।
- `Query` আর `Mutation` হলো root type। `Subscription` হলো তৃতীয়টা।
- `!` মানে non-null। ডিফল্টে nullable রাখুন; non-null চিরকালের।
- offset নয়, cursor-based connection ব্যবহার করুন।
- Errors: সহজের জন্য top-level, গুরুতরের জন্য errors-as-data। তাড়াতাড়ি বেছে নিন।
- Schema evolution শুধু additive। deprecate করে তারপর সরান, কখনও ভাঙবেন না।
- `"""docs"""` ঐচ্ছিক নয়। tooling-এর জন্য naming convention গুরুত্বপূর্ণ।

পরবর্তী: [আপনার প্রথম server চালানো](/notes/graphql/03-first-server) — graphql-yoga, end-to-end, ৬০ লাইন কোডে।
