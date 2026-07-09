---
title: 'সঠিক Database বেছে নেওয়া'
subtitle: 'একটা decision framework, polyglot persistence, SQL vs প্রতিটা NoSQL পরিবার, সাধারণ ভুলগুলো, আর কীভাবে একটা workload-কে একটা store-এর সাথে মেলাবেন।'
chapter: 8
level: 'mastery'
readingTime: '12 মিনিট'
topics: ['polyglot', 'decision', 'tradeoffs']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

প্রতিটা ভ্রমণের জন্য আপনি একটাই বাহন রাখেন না। মোড়ের দোকানে যেতে সাইকেল, অফিস যাতায়াতে সেডান, বাসা বদলাতে ভ্যান, মালামাল পরিবহনে ট্রাক। প্রতিটা শুধু একটা যাত্রার সাপেক্ষেই "সেরা"। Database বেছে নেওয়াও একই: সর্বজনীনভাবে সেরা কোনো store নেই, শুধু _এই_ workload-এর আকার, স্কেল আর consistency-র চাহিদার জন্য সবচেয়ে মানানসই store আছে। বিশেষজ্ঞের দক্ষতা হলো বাহন বেছে নেওয়ার আগে যাত্রাটা পড়ে ফেলা।

</Callout>

## Database দিয়ে নয়, Workload দিয়ে শুরু করুন

"আমরা কি MongoDB / Cassandra / Postgres ব্যবহার করব?" দিয়ে শুরু হওয়া প্রতিটা database আলোচনাই ভুল জায়গা থেকে শুরু হচ্ছে। সঠিক প্রথম প্রশ্নগুলো **workload** নিয়ে:

- **Access pattern** — আপনি কি জানা key দিয়ে query করেন, নাকি যেকোনো field জুড়ে ad-hoc filtering দরকার?
- **Relationship** — flat record, nested entity, নাকি একটা ঘনভাবে সংযুক্ত graph?
- **Scale** — গিগাবাইট আর সেকেন্ডে হাজার হাজার operation, নাকি পেটাবাইট আর লাখ লাখ?
- **Consistency** — read কি সবসময় নিখুঁত হতেই হবে, নাকি একটু staleness চলে?
- **Read/write mix** — read-heavy, write-heavy, নাকি append-only?
- **Query flexibility** — query গুলো কি আগে থেকে জানা, নাকি analyst-রা ডেটাকে অননুমেয় উপায়ে কেটেছিঁড়ে দেখবে?

এগুলোর উত্তর দেওয়ার পরেই কেবল একটা store নিজে থেকে হাজির হয়। Database হলো বিশ্লেষণের _উপসংহার_, কখনোই এর ভিত্তি নয়।

## একটা Decision Framework

Workload-টাকে এই gate গুলোর মধ্য দিয়ে হাঁটান:

```text
1. Do you need ad-hoc queries, multi-record ACID transactions,
   and strong referential integrity, at moderate scale?
       → Relational (PostgreSQL). Default. Don't overthink it.

2. Is the data a densely connected graph, and are your key
   questions about paths and relationships (recommendations, fraud)?
       → Graph (Neo4j).

3. Do you have massive write volume and predictable, key-based
   access patterns, needing linear horizontal scale (time-series, logs)?
       → Wide-column (Cassandra / Bigtable).

4. Are your entities self-contained nested documents that evolve
   fast, read mostly by id or indexed field?
       → Document (MongoDB).

5. Do you need the simplest, fastest possible lookup by a known
   key — cache, sessions, counters, ephemeral data?
       → Key-value (Redis / DynamoDB).
```

ক্রমটা ইচ্ছাকৃত: **relational থেকে শুরু করুন আর তখনই সরে যান যখন একটা সুনির্দিষ্ট requirement আপনাকে বাধ্য করে।** "একদিন হয়তো scale লাগবে" কোনো requirement নয়; "আজ আমরা সেকেন্ডে 500k telemetry write ingest করছি" — এটা requirement।

## SQL vs প্রতিটা NoSQL পরিবার

| Need                       | Relational              | Key-value          | Document           | Wide-column          | Graph                 |
| -------------------------- | ----------------------- | ------------------ | ------------------ | -------------------- | --------------------- |
| Ad-hoc queries             | Excellent               | None               | Good               | Poor                 | Poor                  |
| Joins / relationships      | Excellent               | None               | Manual             | None                 | Excellent (traversal) |
| Horizontal write scale     | Hard                    | Excellent          | Good               | Excellent            | Hard                  |
| Flexible / evolving schema | Rigid                   | N/A                | Excellent          | Flexible             | Flexible              |
| Strong consistency         | Excellent               | Varies             | Tunable            | Tunable              | Good                  |
| Lookup latency by key      | Good                    | Excellent          | Good               | Good                 | N/A                   |
| Best at                    | Integrity + flexibility | Speed + simplicity | Whole-entity reads | Write volume + scale | Connectedness         |

কোনো row-ই পুরোপুরি "Excellent" নয় — প্রতিটা store কিছু না কিছুর বিনিময় করে। এই টেবিলটা সঠিকভাবে পড়া মানে খেয়াল করা কোন দুর্বলতাগুলো নিয়ে আপনার workload _মাথা ঘামায় না_। একটা telemetry pipeline "no ad-hoc queries"-কে পাত্তাই দেয় না; একটা graph store-এর নড়বড়ে horizontal scaling অপ্রাসঙ্গিক যদি আপনার graph কয়েকটা node-এই আরামসে এঁটে যায়।

## Polyglot Persistence

পরিণত সিস্টেম কদাচিৎ একটাই database ব্যবহার করে। **Polyglot persistence** মানে ইচ্ছা করে কয়েকটা store ব্যবহার করা, প্রতিটা workload-এর যে অংশে মানায় তার জন্য। একটা e-commerce platform হয়তো চালাতে পারে:

```text
PostgreSQL    → orders, payments, inventory   (ACID, integrity)
Redis         → sessions, cart, rate limits   (speed, TTL)
MongoDB       → product catalog                (flexible, nested)
Elasticsearch → product search                 (full-text, relevance)
Cassandra     → clickstream / event log        (write volume, scale)
Neo4j         → "customers also bought"        (recommendation graph)
```

লাভটা হলো প্রতিটা কাজের জন্য সেরা টুল ব্যবহার করা; খরচটা হলো বাস্তব **operational complexity** — চালানো, monitor করা, back up করা আর sync-এ রাখার মতো আরও সিস্টেম — সাথে store-গুলোর _মধ্যে_ consistency-র কঠিন সমস্যা (প্রায়ই distributed transaction-এর বদলে event streaming বা change-data-capture দিয়ে সমাধান করা হয়)।

<Callout type="tip">

**নোট:** Polyglot persistence একটা গন্তব্য, শুরুর বিন্দু নয়। একটা নতুন product-এর সাধারণত একটা একক, ভালোভাবে-বোঝা database দিয়েই (প্রায় সবসময় PostgreSQL) launch করা উচিত এবং দ্বিতীয় একটা store তখনই নেওয়া উচিত যখন একটা নির্দিষ্ট workload স্পষ্টভাবে প্রথমটাকে ছাড়িয়ে যায়। প্রতিটা বাড়তি database স্থায়ী operational ভার — এটা যোগ করুন কারণ একটা বাস্তব যন্ত্রণা আপনাকে বাধ্য করছে বলে, architecture diagram দেখতে চমৎকার লাগছে বলে নয়।

</Callout>

## সাধারণ ভুলগুলো

**যে scale আপনার নেই তার জন্য NoSQL বেছে নেওয়া।** একটা ভালোভাবে-tune করা PostgreSQL instance বিশাল load সামলায়। বেশিরভাগ product কখনো এর সীমার কাছেও পৌঁছায় না, তবু "তৈরি থাকার জন্য" NoSQL নিয়ে ফেলে আর যে সমস্যা তাদের কখনো ছিল না তার জন্য operational যন্ত্রণা ও modeling সীমাবদ্ধতা টেনে আনে।

**একটা NoSQL store-কে relational-এর মতো ব্যবহার করা।** অনেক collection-এ normalize করা আর application code-এ join এমুলেট করা NoSQL-এর সুবিধাটাকেই ছুড়ে ফেলে আর distributed-join-এর যে খরচ SQL engine অনেক ভালোভাবে সামলায় তা দেয়। আপনি যদি join চান, আপনি আসলে SQL চেয়েছিলেন।

**Access pattern জানার আগে modeling করা।** NoSQL access-pattern-first design দাবি করে। আপনার query না জেনে একটা document বা wide-column store বেছে নিলে এমন ডেটা তৈরি হয় যা পরে আপনি ফিজিক্যালিই কার্যকরভাবে query করতে পারবেন না।

**Consistency-র প্রভাব উপেক্ষা করা।** একটা eventually-consistent store হাতে নিয়ে তারপর এমন logic লেখা যা read-your-writes ধরে নেয় — এতে মাঝেমধ্যে দেখা দেওয়া, পাগল-করা বাগ তৈরি হয়। প্রতিটা operation-এর consistency level-কে তার আসল যা দরকার তার সাথে মেলান।

**খুব তাড়াতাড়ি অতিরিক্ত ভাগ করে ফেলা।** হাজার user-এর একটা product-এর জন্য ছয়টা database কোনো পরিপক্বতা নয়; এটা ছয়টা জিনিস যা রাত ৩টায় ভেঙে পড়তে পারে।

<Callout type="warning">

**সতর্কতা:** "আমরা NoSQL বেছেছি কারণ এটা web-scale / modern / বড় কোম্পানিগুলো যা ব্যবহার করে" — এটা কোনো engineering কারণ নয়। বড় কোম্পানিগুলো এই store গুলো নিয়েছিল নির্দিষ্ট, চরম সমস্যা সমাধান করতে — আর বাকি সবকিছুর জন্য তারা relational database রেখে দিয়েছিল। তাদের workload ছাড়া তাদের database পছন্দকে cargo-cult করলে আপনি তাদের complexity পাবেন কিন্তু তাদের সমস্যা ছাড়া। _আপনার_ workload-এর জন্য বেছে নিন।

</Callout>

## Workload-কে Store-এর সাথে মেলানো: দ্রুত কিছু কেস

- **User account, billing, order** — relational। Integrity আর transaction-ই এখানে পুরো ব্যাপার।
- **Session আর cache layer** — key-value (Redis)। দ্রুত, ephemeral, TTL-চালিত।
- **Product catalog / CMS** — document (MongoDB)। Nested, বদলাতে থাকা, id দিয়ে read।
- **IoT / metrics / event log** — wide-column (Cassandra) বা একটা time-series database। স্কেলে append-heavy।
- **Recommendation / fraud / social graph** — graph (Neo4j)। Relationship-প্রথম প্রশ্ন।
- **Full-text search** — একটা search engine (Elasticsearch / OpenSearch)। Relevance ranking, কোনো general database নয়।

## Mastery-র মানসিকতা

আপনি chapter 1 থেকে একটা পূর্ণ বৃত্ত ঘুরে এসেছেন। প্রশ্নটা কখনোই ছিল না "NoSQL কি SQL-এর চেয়ে ভালো?" — এটা সবসময়ই ছিল "**এই নির্দিষ্ট workload-টার কী দরকার, আর কোন store সবচেয়ে কম trade-off দিয়ে সেটা দেয়?**" default হিসেবে relational ধরুন, কোনো সুনির্দিষ্ট requirement যখন বাধ্য করে তখনই একটা NoSQL পরিবারের দিকে হাত বাড়ান, আপনার access pattern-এর চারপাশে মডেল করুন, প্রতিটা operation-এ consistency সেট করুন, আর store গুলো তখনই একসাথে জোড়েন যখন workload সত্যিই তা দাবি করে। এটা করুন, তাহলে আপনি trend-এর অনুসারী নয়, একজন engineer-এর মতো database বেছে নেবেন।
