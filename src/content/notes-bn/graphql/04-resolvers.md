---
title: 'Resolvers আর execution tree'
subtitle: 'একটা resolver হলো একটা ফাংশন যা একটা ভ্যালু রিটার্ন করে। এগুলোকে একটা tree-তে সাজাও, আর সেই tree-ই তোমার API। একবার walk-টা দেখে ফেললে, প্রতিটা অদ্ভুত GraphQL বাগ স্পষ্ট হয়ে যায়।'
chapter: 4
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['graphql', 'resolvers', 'execution', 'context']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

চ্যাপ্টার 3-এ তুমি resolver লিখেছ, সেগুলো আসলে কী সে নিয়ে খুব বেশি না ভেবেই। এই চ্যাপ্টার একটু ধীরে যায়। তুমি যদি executor-কে তোমার কোয়েরি ধরে হাঁটতে কল্পনা করতে পারো, তাহলে GraphQL তোমাকে আর অবাক করবে না — পারফরম্যান্স ইস্যু, error propagation, অদ্ভুত `null` path সবকিছুই পড়ার যোগ্য হয়ে যায়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা GraphQL resolver অনেকটা একজন ওয়েটারের মতো যে তোমার অর্ডার আর রান্নাঘর, ওয়াইন সেলার, আর ডেজার্ট ট্রলির মধ্যে সমন্বয় করে — প্রতিটাই আলাদাভাবে আনা।

</Callout>

## একটা resolver হলো চারটা argument-ওয়ালা একটা ফাংশন

```js
fieldName: (parent, args, context, info) => returnValue;
```

এটাই প্রতিটা resolver-এর signature, প্রতিটা GraphQL সার্ভারে, প্রতিটা ভাষায়।

- **`parent`** — _parent_ resolver-এর রিটার্ন করা ভ্যালু। root type-এর (`Query`, `Mutation`) জন্য parent হলো `undefined` (বা তুমি `rootValue` হিসেবে যা পাস করো)। `User.name`-এর জন্য parent হলো user object।
- **`args`** — ফিল্ডে declare করা argument। `posts(last: 10)` আসে `{ last: 10 }` হিসেবে।
- **`context`** — request-scoped object। DB pool, current user, একটা DataLoader instance, trace ID। এক request-এর প্রতিটা resolver এটা শেয়ার করে।
- **`info`** — execution সম্পর্কে metadata। ফিল্ডের নাম, রিটার্ন type, তুমি যে path-এ আছ, পুরো AST, সব variable। বেশিরভাগ resolver এটা উপেক্ষা করে; advanced-গুলো projection-এর জন্য এটা ব্যবহার করে (শুধু চাওয়া DB column বেছে নেয়া)।

তুমি প্রায় সবসময়ই `parent`, `args`, আর `context` ব্যবহার করবে। `info` হলো 5% ক্ষেত্রের জন্য।

## execution tree

এই কোয়েরিটা দেখো:

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

executor resolver call-এর একটা tree বানায়:

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

প্রতিটা ফিল্ড একটা ফাংশন call। Sibling ফিল্ডগুলো parallel-এ চলে। Children তাদের parent-এর জন্য অপেক্ষা করে।

ওই এক কোয়েরির জন্য, সেটা 1 + 1 + 1 + 4 + 4 = 11টা resolver invocation। author ফিল্ড দুবার call হয় আর একই user-এ resolve হয় — ডিফল্টে কোনো caching নেই। এটাই N+1 সমস্যার বীজ (চ্যাপ্টার 5)।

## Default resolvers

তুমি চ্যাপ্টার 3-এ `User.name` লেখোনি। তোমার দরকার হয়নি। একটা ফিল্ডের default resolver হলো:

```js
(parent) => parent[fieldName];
```

`parent` যদি `{ name: "Sumayya", email: "..." }` হয় আর ফিল্ড হয় `name`, তাহলে default resolver `parent.name` রিটার্ন করে। তাই যে ফিল্ডগুলোর explicit resolver দরকার সেগুলো হলো শুধু:

- Root ফিল্ড (`Query.*`, `Mutation.*`) — এখনো কোনো parent নেই।
- যে ফিল্ডে parent property-র নাম schema ফিল্ডের সাথে মেলে না — `created_at` বনাম `createdAt`।
- যে ফিল্ডের fetch করা দরকার — `User.posts` একটা SQL কোয়েরি চালায়, এটা শুধু একটা property access হতে পারে না।
- যে ফিল্ড compute করে — একটা virtual ফিল্ড যেমন `User.fullName` যা `firstName` আর `lastName` জোড়া লাগায়।

বাকি সব implicit। তোমার resolver map শেষপর্যন্ত ছোট হয়ে যায়।

## সঠিক shape রিটার্ন করা

একটা resolver যা রিটার্ন করে সেটাই পরবর্তী স্তরের resolver-গুলো তাদের `parent` হিসেবে ব্যবহার করতে পারে। দুটো সাধারণ প্যাটার্ন:

**1. পুরো row রিটার্ন করো।** `Query.user` রিটার্ন করে `{ id, name, email, created_at }`। `User`-এর ফিল্ড resolver-গুলো হয় default ব্যবহার করে (`name`, `email`) নয়তো property পড়ে (`createdAt: u => u.created_at`)।

**2. একটা partial object রিটার্ন করো, বাকিটা lazily fetch করো।** `Query.user` রিটার্ন করে `{ id }`, আর `User`-এর অন্য প্রতিটা ফিল্ডের (`name`, `email`, `posts`) নিজের resolver আছে যা যা দরকার তা fetch করে। অপচয় — যদি না client শুধু কখনো এক-দুটো ফিল্ড চায়।

বাস্তবে, SQL তোমাকে যা দিয়েছে সেটাই রিটার্ন করো আর resolver-দের join আর computation সামলাতে দাও।

## Async, parallelism, আর তুমি

Resolver-গুলো promise রিটার্ন করতে পারে। executor সেগুলো await করে। Sibling ফিল্ডগুলো concurrently await হয় — `User.name` আর `User.posts` sequential নয়।

```js
User: {
  name: u => u.name,                                         // sync
  email: u => u.email,                                       // sync
  posts: async u => pool.query("...", [u.id]),               // async, in parallel
  followers: async u => pool.query("...", [u.id]),           // async, in parallel
}
```

একজন user-এর জন্য, `posts` আর `followers` মোটামুটি একই সময়ে fire হয়। দুটো parallel কোয়েরি — মোটামুটি একটার মতোই দ্রুত।

Children তাদের parent-এ block হয়। `User.posts` resolve না হওয়া পর্যন্ত `Post.title` চলতে পারে না।

<Callout type="warn">

**Sibling parallelism সত্যি কিন্তু naive resolver-এর নিচে ভেঙে পড়ে।** যদি `User.posts` দশজন user-এর জন্য দশবার parallel-এ চলে, তাহলে সেটা দশটা parallel SQL কোয়েরি Postgres-কে পিটাচ্ছে। Cache miss, connection pool exhaustion, সবকিছু। সমাধান — DataLoader — হলো চ্যাপ্টার 6।

</Callout>

## Context — জীবনরেখা

Context প্রতি request-এ একবার তৈরি হয় আর প্রতিটা resolver-এ পাস করা হয়। এক কোয়েরিতে resolver-দের মধ্যে state শেয়ার করার এটাই _একমাত্র_ বৈধ উপায়।

```js
const yoga = createYoga({
	schema,
	context: ({ request }) => ({
		db: pool,
		userId: getUserIdFromAuth(request),
		requestId: crypto.randomUUID()
	})
});
```

তারপর যেকোনো resolver পারে:

```js
posts: async (_, args, ctx) => {
	if (!ctx.userId) throw new Error('Not authenticated');
	return ctx.db.query('SELECT * FROM posts WHERE author_id = $1', [ctx.userId]);
};
```

যেগুলো context-এ থাকা উচিত:

- DB connection / pool / transaction handle
- Current user / auth state
- DataLoaders (চ্যাপ্টার 6) — এটা critical, অবশ্যই per-request হতে হবে
- Tracing / request ID
- Permission, feature flag, tenant info-র জন্য loader

যেগুলো context-এ থাকা **উচিত নয়**:

- Per-field state — context নয়, resolver tree ব্যবহার করো।
- Request-জুড়ে mutable shared state — context per-request, সেটা ভেঙো না।

## Error আর সেগুলো কীভাবে propagate হয়

একটা resolver throw করতে পারে। executor throw-টা ধরে, error-টা response-এর `errors[]` array-তে যুক্ত করে, আর সেই ফিল্ডটাকে `null` সেট করে।

ফিল্ড যদি nullable হয়, response সেই ফিল্ডের জন্য `null` দিয়ে চলতে থাকে:

```json
{ "data": { "user": { "name": "Sumayya", "bio": null } }, "errors": [...] }
```

ফিল্ড যদি non-null হয়, `null`-টা সবচেয়ে কাছের nullable parent পর্যন্ত propagate করে:

```graphql
type Query {
	user(id: ID!): User # nullable
}
type User {
	id: ID!
	name: String! # non-null
}
```

`User.name` যদি throw করে, `name` `null` হতে পারে না, তাই `null`-টা `User` পর্যন্ত bubble up করে, যা `Query`-তে nullable, তাই পুরো `user` ফিল্ডটা `null` হয়ে যায়। error-টা `errors[]`-এ থাকে, data তবুও parse হয়।

যদি কখনো দেখো "একটা nested ফিল্ড throw করায় পুরো response null-এ ধসে গেছে," সেটা non-null propagation। কোন ফিল্ডগুলো সত্যিই সবসময় থাকে সে ব্যাপারে সৎ থেকে এটা এড়ানো যায়।

## `info` আর selection projection

চতুর্থ resolver argument-টা সাধারণত তুমি উপেক্ষা করো। কিন্তু একটা নির্দিষ্ট অপটিমাইজেশনের জন্য — client শুধু যে column-গুলো চেয়েছে সেগুলোই fetch করা — এটা সোনার মতো।

```js
import { fieldsList } from 'graphql-fields-list';

users: async (_, __, ___, info) => {
	const fields = fieldsList(info); // ["id", "name"] if client asked for those
	const cols = ['id', ...fields].join(', ');
	const { rows } = await pool.query(`SELECT ${cols} FROM users`);
	return rows;
};
```

পারফরম্যান্স যতক্ষণ না দাবি করে ততক্ষণ এটা এড়িয়ে যাও। চ্যাপ্টার 4-এ অকালপক্ব।

## সাধারণ ভুল

**1. ভুল resolver-এ lookup করা।** যদি `User.posts`-এর সবসময় user-এর পোস্ট দরকার হয়, তাহলে `Query.user`-এ একটা SQL কোয়েরি লুকিয়ে রেখো না — সেটা client না চাইলেও পোস্ট টেনে আনে। Resolver-গুলো lazily চলে; সেটার ওপর ভরসা করো।

**2. Per-request state module scope-এ রাখা।** Module scope-এ তৈরি একটা DataLoader request-জুড়ে শেয়ার হয়, user-দের মধ্যে data leak করে, আর কখনো memory ছাড়ে না। সবসময় per-request, সবসময় context-এ।

**3. Field resolver আছে ভুলে যাওয়া।** যদি একটা column computed হয় (`fullName`, `slug`), সেটার SQL-এ থাকার দরকার নেই। একটা field resolver যোগ করো, parent থেকে সেটা compute করো।

**4. ভুল type রিটার্ন করা।** যদি `User.posts` `[Post!]!` রিটার্ন করে আর তোমার resolver `null` রিটার্ন করে, তুমি একটা non-null violation পাবে। error স্পষ্ট; কিন্তু শুধু যদি তুমি এটা পড়ো।

## রিক্যাপ

- Resolver signature: `(parent, args, context, info) => value`। মুখস্থ করো।
- executor কোয়েরিটাকে একটা tree হিসেবে হাঁটে। Sibling parallel, children sequential।
- Default-গুলো `parent[fieldName]` পড়ে। শুধু দরকার হলেই resolver লেখো।
- Context per-request। DB pool, auth, DataLoaders সেখানে যায়।
- Promise কাজ করে; sibling resolver-গুলো concurrently চলে।
- Error ফিল্ড fail করে। Non-null ফিল্ড failure-টা উপরে propagate করে।
- `info` হলো selection-aware অপটিমাইজেশনের জন্য, পরে।

পরবর্তী: [N+1 সমস্যা](/notes/graphql/05-n-plus-one) — কেন তোমার প্রথম GraphQL সার্ভার স্লো, আর SQL স্তরে আসলে কী ঘটছে।
