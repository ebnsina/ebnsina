---
title: 'GraphQL কী আর কখন ব্যবহার করবেন'
subtitle: 'GraphQL কোনো database নয়, কোনো transport নয়, আর HTTP-এর বিকল্পও নয়। এটা একটা query language আর একটা typed contract — আর এই পার্থক্যটাই এখান থেকে আপনার প্রতিটা সিদ্ধান্তকে আকার দেয়।'
chapter: 1
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['graphql', 'rest', 'api design', 'schema']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনা পৌরসভা অফিসে গেছেন একটা কাজে। ভেতরে ঢুকে দেখেন একটাই বড় "তথ্য ডেস্ক" — সেখানে বসা কর্মী খোয়ারিজমি। সিনা একটা কাগজে গুছিয়ে লিখে দিলেন ঠিক কী কী দরকার: এক নাগরিকের নাম, তার বাবার নাম, আর তার শেষ দুটো বিল — ব্যস, এটুকুই। খোয়ারিজমি কাগজটা পড়ে ঠিক সেই তথ্যগুলোই একটা স্লিপে লিখে ফেরত দিলেন। বেশিও না, কমও না, আর মাত্র একবার লাইনে দাঁড়িয়েই কাজ শেষ।

পাশের ঘরের কথা ভাবুন, যেখানে ফাতিমাকে ঠিক এই তথ্যগুলোর জন্যই ছুটতে হয়েছিল আলাদা পাঁচটা কাউন্টারে। এক কাউন্টারে নাম, আরেক কাউন্টারে বাবার নাম, বিলের জন্য আরেকটা — আর প্রতিটা কাউন্টার একটা করে বাঁধা-ধরা ছাপা ফর্ম ধরিয়ে দেয়, যেখানে তার দরকারি তথ্যের সাথে আরও দশটা অপ্রয়োজনীয় ঘর ভরা। কোনোটায় যা চেয়েছিলেন তার বেশি, কোনোটায় আবার আধখানা — আর পুরোটা জোগাড় করতে পাঁচবার লাইন।

এই এক তথ্য ডেস্কই হলো **GraphQL**। আপনার লেখা ওই একটা গোছানো কাগজ = একটা GraphQL **query**; কাগজে ঠিক যে তথ্যগুলো লিখলেন = ঠিক যে **field** চান সেগুলো বেছে নেওয়া; একটাই ডেস্ক = একটাই **endpoint** (`/graphql`); আর এক লাইনেই সব পাওয়া = এক round trip, কোনো over-fetching নেই, বাড়তি ছোটাছুটিও নেই। উল্টোদিকে পাঁচ কাউন্টারে দৌড়ানো, প্রতিটা থেকে বাঁধা-ধরা ফর্ম পাওয়া — সেটাই **REST**-এর অনেক endpoint, over/under-fetching আর একগাদা round-trip। বাস্তবে GitHub-এর মতো সাইট তাদের API-তে ঠিক এই কারণেই GraphQL দেয় — মোবাইল, ওয়েব, থার্ড-পার্টি প্রত্যেকে নিজের দরকারি field-গুলো এক request-এ চেয়ে নিতে পারে।

আপনি REST ব্যবহার করেছেন। আপনি জানেন `GET /api/users/42` কী রিটার্ন করে: server যা রিটার্ন করার সিদ্ধান্ত নেয়, তাই। আপনি যদি শুধু ইউজারের নাম চাইতেন, তবুও পুরো object পেয়ে যেতেন। আপনি যদি ইউজার _এবং_ তার শেষ পাঁচটা পোস্ট চাইতেন, তাহলে দুটো রিকোয়েস্ট করতেন। একটা মোবাইল স্ক্রিনের যদি সাতটা জিনিস দরকার হতো, তাহলে আপনি সাতটা রিকোয়েস্ট করতেন অথবা একটা কাস্টম `/api/mobile/dashboard` endpoint বানাতেন যা আর কেউ ব্যবহার করত না।

GraphQL হলো "যদি ক্লায়েন্ট শুধু যা দরকার তা-ই চাইতে পারত, এক রাউন্ড ট্রিপে, একটা typed contract-এর উপর দিয়ে" — এই প্রশ্নের উত্তর। এটাই পুরো পিচ। বাকি সব কিছু — schema, resolver, federation — এই আইডিয়ার সেবায় নিয়োজিত plumbing।

<Callout type="info">

**বাস্তব জীবনের উপমা**

GraphQL হলো একটা fixed meal পাওয়ার বদলে মেনু থেকে ঠিক যা চান তা-ই অর্ডার করার মতো — আপনার যে ডেটা দরকার তার আকারটা আপনি নিজেই নির্দিষ্ট করেন।

</Callout>

## দেখার মতো একটা রিকোয়েস্ট

এই যে একটা GraphQL রিকোয়েস্ট। এটা নিছক `/graphql`-এ একটা JSON body সহ `POST`:

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ user(id: 42) { name posts(last: 5) { title createdAt } } }"
  }'
```

রেসপন্স:

```json
{
	"data": {
		"user": {
			"name": "Sumayya",
			"posts": [
				{ "title": "Why I left Kubernetes", "createdAt": "2026-04-12" },
				{ "title": "Self-hosting is a skill", "createdAt": "2026-04-08" }
			]
		}
	}
}
```

এক রাউন্ড ট্রিপ। ঠিক যে ফিল্ডগুলো চাওয়া হয়েছিল, ঠিক সেগুলোই। রেসপন্সের আকার query-র আকারকে অনুকরণ করে — এটা কোনো দুর্ঘটনা নয়, এটাই গোটা ভাষাটা।

## GraphQL টেকনিক্যালি কী

একটা **type system** সহ একটা **query language**। ব্যস এইটুকুই। server একটা schema প্রকাশ করে (contract), ক্লায়েন্ট সেই schema-র বিপরীতে লেখা query পাঠায়, আর একটা execution engine প্রতিটা চাওয়া ফিল্ড আপনার লেখা কোড কল করে resolve করে।

GraphQL যা প্রতিস্থাপন **করে না**:

- **HTTP** — এটা উপরে চলে। প্রায় সবসময়ই `POST /graphql`। cacheable query-র জন্য মাঝেমধ্যে `GET`। Subscription WebSockets-এর উপর দিয়ে যায়।
- **আপনার database** — storage নিয়ে GraphQL-এর কোনো মতামত নেই। Resolver যা খুশি কল করে (Postgres, Redis, আরেকটা HTTP API)।
- **Authentication** — কোনো `auth` কীওয়ার্ড নেই। REST middleware-এর মতোই আপনি context-এর মাধ্যমে এটা যুক্ত করেন।
- **Caching** — কোনো built-in HTTP caching layer নেই। আপনি এটা যোগ করেন (persisted queries, CDN, client cache)।

এটা একটা contract layer। এটা যা _নয়_ সেটা জানলে পরে অনেক তর্ক থেকে বাঁচবেন।

## REST বনাম GraphQL — সৎ তুলনা

|               | REST                        | GraphQL                   |
| ------------- | --------------------------- | ------------------------- |
| Endpoints     | অনেক, প্রতি resource-এ একটা | একটা (`/graphql`)         |
| Over-fetching | সাধারণ ব্যাপার              | ডিজাইনগতভাবেই অসম্ভব      |
| Versioning    | `/v1` `/v2`                 | additive schema evolution |
| Caching       | HTTP, ফ্রি                  | ম্যানুয়াল, কঠিন          |
| Tooling       | curl, browser dev tools     | Apollo Studio, GraphiQL   |
| Ramp-up       | এক দুপুর                    | এক উইকেন্ড                |
| Failure modes | 500s, 4xx                   | সবসময় 200, error body-তে |

ওই শেষ সারিটা মানুষকে ফাঁদে ফেলে। Resolver থ্রো করলেও GraphQL প্রায় সবসময় HTTP 200 রিটার্ন করে — আসল error থাকে JSON body-র ভেতরে `errors[]`-এ। আপনার monitoring-এর এটা জানা দরকার।

## কখন GraphQL সঠিক পছন্দ

- **আলাদা আলাদা আকার চায় এমন একাধিক consumer।** Web, iOS, Android, third party — প্রত্যেকে সামান্য আলাদা ফিল্ড চায়। REST কাস্টম endpoint-এ ভেঙে পড়ে; GraphQL একটাই schema হয়ে থাকে।
- **গভীরভাবে nested বা সম্পর্কিত ডেটা।** একটা dashboard query যা এক ধাক্কায় user → org → projects → tasks → assignees টেনে আনে, প্রতিটা ক্লায়েন্ট নিজের depth বেছে নেয়।
- **দ্রুত ship করে এমন একটা frontend team।** Schema-ই contract; একবার ফিল্ডটা থাকলে, backend পরিবর্তন ছাড়াই ক্লায়েন্ট সেটা ব্যবহার করে।
- **একাধিক service জুড়ে Federation।** অনেক backend থেকে সেলাই করা একটা unified graph (এ নিয়ে আরও ১০ নম্বর অধ্যায়ে)।

## কখন REST সঠিক পছন্দ

- **Public API।** Caching, rate limiting, CDN-বান্ধবতা, SDK generation — এতে REST জেতে। GitHub, Stripe, AWS — সবাই REST-first, কারণ আছে।
- **File upload আর download।** GraphQL দিয়ে binary stream করা বিদঘুটে; HTTP এটা native-ভাবেই করে।
- **এক ক্লায়েন্ট সহ সাধারণ CRUD।** পাঁচ-endpoint-এর একটা admin panel-এ একটা query language যোগ করা বাড়াবাড়ি।
- **আক্রমণাত্মক caching-এর দরকার।** HTTP cache semantics হলো ৩০ বছরের জমা হওয়া প্রজ্ঞা। GraphQL তার বেশিরভাগই ফেলে দেয়।

<Callout type="warn">

"GraphQL REST-এর চেয়ে দ্রুত" — এটা ভুল। GraphQL round trip-কে resolver-এর জটিলতার বিনিময়ে দেয়। একই ডেটায় একটা naive GraphQL server একটা tuned REST server-এর চেয়ে ধীর হবে। জয়টা _নমনীয়তার_, খাঁটি গতির নয়। পারফরম্যান্স আসে DataLoader, persisted queries, আর স্মার্ট resolver থেকে — ৫, ৬, আর ১০ নম্বর অধ্যায়।

</Callout>

## আপনি যে runtime ব্যবহার করবেন

এই track-এর জন্য server হলো Node-এর উপর চলা **graphql-yoga**। তিনটা কারণ:

1. reference implementation (`graphql-js`) হলো JavaScript, তাই সেখানকার ecosystem সবচেয়ে গভীর।
2. graphql-yoga হলো আধুনিক, ব্যাটারি-সহ runtime — HTTP, subscription, file upload, plugin বাক্সের বাইরে থেকেই সামলায়। পুরনো Apollo Server boilerplate-কে প্রতিস্থাপন করে।
3. এটা কয়েকশো কিলোবাইট আর Node যেখানে চলে সেখানেই চলে। Self-hosting মানে একটা binary আর systemd।

আপনি Go লিখলে সমতুল্যটা হলো **gqlgen** — schema থেকে Go struct-এ code generation, খুব দ্রুত। আপনি Python লিখলে সেটা হলো **Strawberry** — decorator-ভিত্তিক, type-hint-চালিত। একই আইডিয়া, ভিন্ন syntax। এই track-এর প্রতিটা ধারণা সরাসরি map হয়।

```bash
mkdir my-graphql && cd my-graphql
npm init -y
npm install graphql graphql-yoga
```

এটাই পুরো setup। আমরা ৩ নম্বর অধ্যায়ে কোড লেখা শুরু করি।

## এখানে "self-hosted" মানে কী

গোটা track-টা vendor-neutral থাকে। কোনো "AWS AppSync ব্যবহার করুন" বা "Apollo-র hosted service-এ deploy করুন" নেই। আমরা graphql-yoga একটা VPS-এ nginx-এর পিছনে চালাব, একমাত্র data dependency হিসেবে Postgres থাকবে। track শেষ করলে আপনি জানবেন মাসে দশ ডলারে, কিছু managed ছাড়াই, কীভাবে একটা সত্যিকারের production GraphQL service ship করতে হয়।

## রিক্যাপ

- GraphQL হলো একটা type system সহ একটা query language, কোনো transport বা database নয়।
- একটা endpoint, এক রাউন্ড ট্রিপ, ঠিক যে ফিল্ডগুলো চেয়েছেন সেগুলোই।
- এটা HTTP-এর উপরে চলে, subscription-এর জন্য WebSockets সহ।
- অনেক consumer, গভীর সম্পর্ক, দ্রুত-iterate করা frontend-এর জন্য সঠিক সিদ্ধান্ত।
- Public API, file streaming, সাধারণ CRUD, আক্রমণাত্মক caching-এর জন্য ভুল সিদ্ধান্ত।
- error-এর সময়েও HTTP 200 রিটার্ন করে — আপনার monitoring-কে body পড়তে হবে।

পরবর্তী: [Schema-first design](/notes/graphql/02-schema-first-design) — types, queries, mutations, আর সেই nullability সিদ্ধান্তগুলো যা ভুল করলে বছরের পর বছর আপনাকে তাড়া করে বেড়ায়।
