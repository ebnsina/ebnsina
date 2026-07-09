---
title: 'N+1 সমস্যা'
subtitle: 'তোমার GraphQL সার্ভার এগারোটা SQL কোয়েরি চালায় যেখানে দুটো চালানো উচিত। প্রতিটা backend টিম এটা কঠিন পথে শেখে। এই চ্যাপ্টার হলো রোগনির্ণয় — চ্যাপ্টার 6 হলো নিরাময়।'
chapter: 5
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['graphql', 'n+1', 'performance', 'sql', 'postgres']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

GraphQL-এর নমনীয়তা আসে resolver call-এর একটা tree থেকে। সেই tree-টা একটা ফাঁদও। ফাঁদটার একটা নাম আছে: **N+1**। যদি এই পুরো ট্র্যাক থেকে শুধু একটা শিক্ষা নাও, এটাই নাও।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

N+1 সমস্যা অনেকটা একজন লাইব্রেরিয়ানের কাছে 100টা বইয়ের নাম চাওয়া, তারপর তাক পর্যন্ত 100টা আলাদা ট্রিপ করার মতো — বনাম সব বই এক কার্টে নিয়ে আসা।

</Callout>

## সমস্যাটা পুনরায় তৈরি করা

চ্যাপ্টার 3-এর সার্ভার ব্যবহার করো। SQL logging যোগ করো যাতে কী হচ্ছে দেখতে পারো:

```js
// server.js
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('connect', (c) => {
	const orig = c.query.bind(c);
	c.query = (text, ...rest) => {
		console.log('[sql]', typeof text === 'string' ? text : text.text);
		return orig(text, ...rest);
	};
});
```

এখন GraphiQL-এ এই কোয়েরিটা চালাও:

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

log-টা দেখো:

```
[sql] SELECT * FROM users ORDER BY id
[sql] SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC
[sql] SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC
```

দুজন user, তিনটা কোয়েরি। একটা user-দের জন্য, দুটো পোস্টের জন্য। একশ user পর্যন্ত scale করো — 101টা কোয়েরি। এক হাজার পর্যন্ত — 1001টা। এটাই **N+1 সমস্যা**: parent-দের জন্য 1টা কোয়েরি, children-দের জন্য N টা, প্রতি parent-এ একটা করে।

## কেন এটা হয়

চ্যাপ্টার 4-এ ফিরে দেখো। executor tree-র প্রতিটা node ধরে হাঁটে। প্রতিটা user-এর জন্য, এটা `User.posts(parent=user)` call করে। প্রতিটা call স্বাধীনভাবে তার SQL fire করে।

```js
User: {
  posts: async (u) => {
    const { rows } = await pool.query(
      "SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC",
      [u.id],
    );
    return rows;
  },
}
```

Resolver-গুলো sibling সম্পর্কে জানে না। তারা "দশজন user একসাথে resolve হয়েছে; আমি তাদের পোস্ট fetch batch করি" দেখতে পারে না। তারা isolated ফাংশন।

## এর খরচ কত

একই মেশিনে একটা DB-তে একটা round trip হয়তো **0.5 ms**। একটা region-জুড়ে একটা DB-তে **5–20 ms**। তাই:

| Users | Local DB | Remote DB   |
| ----- | -------- | ----------- |
| 10    | ~5 ms    | ~50–200 ms  |
| 100   | ~50 ms   | ~500 ms–2 s |
| 1000  | ~500 ms  | অব্যবহার্য  |

এটা শুধু SQL latency। Connection pool contention এটাকে আরও খারাপ করে — একটা GraphQL রিকোয়েস্ট একসাথে দশ-বিশটা connection ধরে রাখতে পারে, অন্য request-গুলো block করে।

একই কোয়েরি **দুটো SQL কোয়েরি** হিসেবে (একটা user-দের জন্য, একটা পোস্টের জন্য):

```sql
SELECT * FROM users ORDER BY id;
SELECT * FROM posts WHERE author_id = ANY($1::bigint[]);
```

N যাই হোক না কেন millisecond রেঞ্জে। data-র shape একদম একই। সমস্যাটা পুরোপুরি resolver-গুলো কীভাবে লেখা তা নিয়ে।

## REST নয় কিন্তু GraphQL এর জন্য বিখ্যাত কেন

REST সমস্যাটা লুকিয়ে রাখে। একটা REST endpoint `GET /users-with-posts` হলো একটা handler — একজন backend engineer একটা SQL `JOIN` লেখে আর ship করে। handler-টা ওই endpoint-এর জন্য কাস্টম।

GraphQL client-রা shape চালায়। একটা client যদি একটা কোয়েরিতে `posts {}` যোগ করে, সার্ভারের resolver-গুলো পরদিন fire করে। একজন backend engineer-এর একটা JOIN লেখার কোনো সুযোগ নেই — engineer কখনো জানতই না client কী চাইতে যাচ্ছে।

তাই GraphQL-এর একটা _general_ সমাধান দরকার যা runtime-এ যেকোনো children batch করে। general সমাধান হলো **DataLoader** (চ্যাপ্টার 6)। কিন্তু এটা ব্যবহার করার আগে, দুটো সহজ fix দেখো যা সংকীর্ণ ক্ষেত্রে কাজ করে।

## Fix 1: হাতে একটা JOIN লেখো

যদি জানো একটা নির্দিষ্ট ফিল্ড প্রায় সবসময় তার parent-এর সাথে কোয়েরি হয়, তাদের একসাথে parent-এ fetch করো।

```js
Query: {
  users: async () => {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.name, u.email, u.created_at,
        COALESCE(
          json_agg(
            json_build_object('id', p.id, 'title', p.title, 'created_at', p.created_at)
            ORDER BY p.created_at DESC
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) AS posts
      FROM users u
      LEFT JOIN posts p ON p.author_id = u.id
      GROUP BY u.id
      ORDER BY u.id
    `);
    return rows;
  },
},

User: {
  posts: (u) => u.posts, // already joined; no extra query
}
```

`{ users { posts {} } }`-এর জন্য একটা SQL কোয়েরি। দ্রুত।

খারাপ দিক: client না চাইলেও তুমি eagerly পোস্ট load করো। client `{ users { name } }` পাঠায় আর তুমি তবুও JOIN-এর মূল্য দাও।

একটা সাধারণ আপস — **selection-aware কোয়েরি** — `info` argument ব্যবহার করে detect করে `posts` selection set-এ আছে কিনা আর শুধু তখনই JOIN করে যখন আছে। শক্তিশালী কিন্তু verbose। Prisma, Drizzle-এর relations, আর `objection.js`-এর মতো ORM এটা automate করে।

<Callout type="tip">

**হাতে লেখা JOIN একটা দারুণ প্রথম পদক্ষেপ।** এগুলো শীর্ষ তিন-চারটা কোয়েরির জন্য যেকোনো abstraction-কে হারায়। হট path-গুলোতে এগুলো ব্যবহার করো; বাকির জন্য DataLoader-এর দিকে হাত বাড়াও।

</Callout>

## Fix 2: parent resolver-এ aggregate করো

Children যদি গভীরভাবে nested হয়, এমনভাবে refactor করো যাতে parent resolver সবকিছু একবারে fetch করে আর child resolver-দের পড়ার জন্য context-এ ভরে দেয়।

```js
Query: {
  users: async (_, __, ctx) => {
    const { rows: users } = await ctx.db.query("SELECT * FROM users");
    const ids = users.map(u => u.id);
    const { rows: posts } = await ctx.db.query(
      "SELECT * FROM posts WHERE author_id = ANY($1::bigint[])",
      [ids],
    );

    const postsByUser = new Map();
    for (const p of posts) {
      if (!postsByUser.has(p.author_id)) postsByUser.set(p.author_id, []);
      postsByUser.get(p.author_id).push(p);
    }

    return users.map(u => ({ ...u, posts: postsByUser.get(u.id) || [] }));
  },
},
```

দুটো SQL কোয়েরি, কোনো JOIN নেই। একই ফলাফল। প্যাটার্নটা — `ANY($1::bigint[])` প্লাস parent ID দিয়ে key করা একটা `Map` — হলো চ্যাপ্টার 6-এ DataLoader তোমার জন্য যা করবে ঠিক সেই অপারেশন, শুধু generalized।

## Fix 3: বিপজ্জনক ফিল্ডটা expose কোরো না

কখনো কখনো সবচেয়ে পরিষ্কার উত্তর হলো schema থেকে একটা ফিল্ড সরিয়ে ফেলা। যদি `User.allPosts` হাজার হাজার row রিটার্ন করে আর কখনো paginate করা না হয়, এটা deprecate করো আর `User.posts(first: Int!)` বা একটা আলাদা `Query.posts(authorId: ID!)` connection দিয়ে replace করো।

এটা কোনো ফাঁকিবাজি নয়। Schema design হলো performance design। যে schema client-দের একটা quadratic কোয়েরি লিখতে দেয় সেখানে শেষপর্যন্ত কেউ না কেউ quadratic কোয়েরিটা লিখবেই।

## পোস্টের বাইরে N+1 কোথায় লুকায়

এটা শুধু child array নয়। Singleton-ও N+1 হয়:

```graphql
{
	posts {
		author {
			name
		}
	}
}
```

দশটা পোস্ট, প্রতিটা `Post.author` call করে → user-দের জন্য দশটা SQL কোয়েরি, প্রায়ই **একই user**। কোনো batching নেই, কোনো caching নেই।

```graphql
{
	users {
		posts {
			comments {
				author {
					name
				}
			}
		}
	}
}
```

তিন স্তরের N+1। বিশ row data দিয়ে একটা graph-কে প্রতি request কয়েক সেকেন্ড রেঞ্জে নিয়ে যাওয়া সহজ।

Permission check-ও N+1 হয়:

```graphql
{
	posts {
		canEdit
	}
}
```

`Post.canEdit` যদি একটা permissions service call করে, সেটা প্রতি request-এ N টা service call।

## Diagnostics — বাস্তবে N+1 খুঁজে বের করা

তিনটা টুল, উপযোগিতার ক্রমে:

**1. Development-এ SQL logs।** সবচেয়ে সহজ। একই কোয়েরি এক request-এ 50 বার দেখলে, তোমার N+1 আছে।

**2. Postgres `pg_stat_statements`।** Production-grade। কোয়েরির frequency আর মোট সময় aggregate করে। যে কোয়েরি প্রতি মিনিটে 100,000× চলে সেটাই তোমার hot spot।

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;
```

**3. APM tracing (OpenTelemetry, ইত্যাদি)।** Per-request flame chart। তুমি resolver tree-টা visually দেখো আর প্রতিটা resolver-এর নিচে nested SQL span দেখো।

Self-hosted-এর জন্য: `pg_stat_statements` বিনামূল্যে, দ্রুত, আর Postgres-এর সাথে আসে। এটা **observability** চ্যাপ্টারে চালু করো (path-এ পরের দিকে)।

## রিক্যাপ

- Resolver-গুলো sibling দেখতে পারে না। প্রতিটা child নিজের fetch fire করে।
- `{ parents { children {} } }`-এর জন্য 1 + N কোয়েরি হলো ডিফল্ট।
- তিনটা fix: parent-এ JOIN, aggregate-and-distribute, বা DataLoader (পরবর্তী)।
- N+1 singleton, deep nesting, আর permission check-এও লুকায়।
- লোকালি SQL logs আর prod-এ `pg_stat_statements` দিয়ে এটা খুঁজে বের করো।
- Schema নিজেই সমস্যা হতে পারে। Pagination একটা fix।

পরবর্তী: [DataLoader](/notes/graphql/06-dataloader) — general fix যা per request batch আর cache করে, কোনো schema পরিবর্তন ছাড়াই।
