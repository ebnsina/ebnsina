---
title: 'Query Optimization & Performance'
subtitle: 'বাস্তবে plan পড়া, N+1 query মারা, বড় স্কেলে pagination, আর ক্লাসিক anti-pattern এড়ানো।'
chapter: 8
level: 'advanced'
readingTime: '17 মিনিট'
topics: ['optimization', 'n+1', 'performance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমার ছোট্ট রেস্টুরেন্টে দুপুরের ভিড় বাড়তেই অভিযোগ আসতে শুরু করল — খাবার আসতে দেরি হচ্ছে। প্রথমে সে ভাবল আরও একজন রাঁধুনি লাগবে, কিন্তু টাকা খরচের আগে সে একবেলা রান্নাঘরে দাঁড়িয়ে দেখল সময়টা আসলে কোথায় যাচ্ছে। দেখা গেল, প্রতিটা প্লেটের জন্য সে আলাদা করে পেঁয়াজ-রসুন কুচোচ্ছে, আর মশলার কৌটো রাখা পেছনের স্টোরে — তাই প্রতিবার লবণ-হলুদ আনতে সে দশ কদম হেঁটে যাচ্ছে। রান্নার হাত ধীর নয়, সময় খাচ্ছে বারবার একই কাজ।

তাই সে তিনটা জিনিস বদলাল। এক, সকালেই একবারে অনেকটা পেঁয়াজ-রসুন কুচিয়ে রাখল — এখন প্রতি অর্ডারে আর নতুন করে কাটতে হয় না। দুই, বেশি লাগা মশলাগুলো চুলার পাশের তাকেই সাজিয়ে রাখল, স্টোরে হাঁটার দরকার ফুরাল। তিন, অর্ডারে যা চাওয়া হয়েছে ঠিক ততটুকুই প্লেটে তুলল — এক প্লেট ভাতের সাথে গোটা হাঁড়ির তরকারি সাজানো বন্ধ করল। ভিড় একই থাকল, কিন্তু প্লেট বেরোতে লাগল অর্ধেক সময়ে।

ফাতিমার এই বুদ্ধিটাই আসলে **query optimization**। সে আগে না বদলে **মেপে দেখেছে সময় কোথায় যাচ্ছে** — এটাই `EXPLAIN` দিয়ে plan পড়া, অনুমানে হাত না দেওয়া। মশলা হাতের নাগালে রাখা মানে **index** — প্রতিবার পুরো স্টোর হাঁটার (full scan) বদলে সোজা দরকারি জিনিসে পৌঁছানো। একবারে কেটে রাখা মানে **N+1 এড়ানো** — প্রতি প্লেটে একই কাজ বারবার না করা। আর যতটুকু চাওয়া হয়েছে ততটুকুই তোলা মানে **শুধু দরকারি column select করা**, `SELECT *`-এ অপচয় না করা। বাস্তবেও তা-ই — একটা slow API-তে আগে `pg_stat_statements` আর `EXPLAIN ANALYZE` দিয়ে দেখুন সময় কোথায় যাচ্ছে, তারপর একটা করে জিনিস ঠিক করুন; অন্ধভাবে server বড় করার আগে এটুকুতেই বেশিরভাগ সময় সমস্যা মিটে যায়।

## Optimization-এর মানসিকতা

Performance-এর কাজ একটা নিয়ম মেনে চলে: **মাপো, অনুমান করো না।** আসল slow query-টা খুঁজে বের করুন (`pg_stat_statements` বা আপনার APM দিয়ে), `EXPLAIN ANALYZE` দিয়ে তার আসল plan দেখুন, একটা জিনিস বদলান, আর আবার মাপুন। অন্ধভাবে প্রয়োগ করা বেশিরভাগ "optimization" আসলে কিছুই করে না — বা অবস্থা আরও খারাপ করে। Database-এর planner সাধারণত আপনার intuition-এর চেয়ে চতুর; আপনার কাজ হলো তাকে ভালো index, ভালো statistics আর এমন query দেওয়া যা সে ভালোভাবে plan করতে পারে।

## বাস্তবে Plan পড়া

Chapter 5-এ `EXPLAIN ANALYZE`-এর সাথে পরিচয় হয়েছে। আসল diagnosis-এর সময় plan-এ এই red flag-গুলো খুঁজুন:

- **একটা বড় table-এ `Seq Scan`** যার `Rows Removed by Filter` বেশি — একটা index নেই, নয়তো একটা non-sargable condition আছে।
- **Estimated rows আসল rows থেকে অনেক দূরে** — বাসি statistics (table-টা `ANALYZE` করুন) নয়তো এমন condition যেটা planner estimate করতে পারে না। খারাপ estimate গড়িয়ে গিয়ে খারাপ join পছন্দে গিয়ে ঠেকে।
- **বড় inner side সহ `Nested Loop`** — inner side ছোট আর indexed হলে ঠিক আছে, না হলে বিপর্যয়। এটা প্রায়ই নিচের N+1 pattern-এর, বা একটা খারাপ row estimate-এর লক্ষণ।
- **কোনো node-এ বেশি `loops=` সংখ্যা** — সেই node অনেকবার চলেছে; তার প্রতি-loop খরচ গুণ হয়ে যায়।
- **`Sort` বা `Hash` disk-এ spill করছে** (`Sort Method: external merge Disk: 24MB`) — `work_mem` বাড়ান, নয়তো এমন একটা index যোগ করুন যেটা order-টা বিনামূল্যে দিয়ে দেয়।

`EXPLAIN (ANALYZE, BUFFERS)` ব্যবহার করলে আরও দেখা যায় কত page cache থেকে আর কত disk থেকে এসেছে — যে query শুধু cold cache-এ slow তার সমাধান CPU-bound query-র চেয়ে আলাদা।

## N+1 সমস্যা

Application কোডে সবচেয়ে সাধারণ performance বাগটা একটা slow query নয় — এটা _অনেকগুলো_ query। আপনি একটা list fetch করেন, তারপর loop চালিয়ে প্রতি item-এ আরও একটা করে query মারেন:

```text
SELECT * FROM posts LIMIT 20;            -- 1 query
-- then, in app code, for each of the 20 posts:
SELECT * FROM users WHERE id = ?;        -- 20 queries
```

যেখানে ১টা বা ২টা query-তেই কাজ হতো, সেখানে এটা ২১টা round trip। প্রতিটা round trip network আর parsing overhead দেয়; ২০ item-এ এটা বিরক্তিকর, ২,০০০ item-এ এটা একটা outage। সমাধান হলো সম্পর্কিত data একটা **single query আর join** দিয়ে fetch করা, নয়তো `IN` দিয়ে দ্বিতীয় একটা query:

```sql
-- One join instead of N+1
SELECT p.*, u.name AS author
FROM posts p
JOIN users u ON u.id = p.author_id
LIMIT 20;
```

<Callout type="warning">

**N+1 ORM-এর আড়ালে লুকিয়ে থাকে।** একটা loop-এর ভেতরে কোনো relation lazy-load করাটা দেখতে নিরীহ property access-এর মতো (`post.author.name`), অথচ প্রতিবার iteration-এ একটা query ছোড়ে। Development-এ query logging চালু রেখে গোনাটা দেখুন। N+1-কে একটা ধ্রুব সংখ্যক query-তে নামিয়ে আনতে আপনার ORM-এর eager-loading বা batching feature (`include`, `joinedload`, `with`, DataLoader) ব্যবহার করুন।

</Callout>

## Pagination: Offset বনাম Keyset

Result-এর ভেতর দিয়ে page করার সহজ-সরল উপায় হলো `LIMIT` / `OFFSET`:

```sql
SELECT * FROM posts ORDER BY created_at DESC
LIMIT 20 OFFSET 10000;   -- page 501
```

সমস্যা: আপনার ২০টা row ফেরত দেওয়ার আগে database-কে বাদ পড়া পুরো ১০,০০০ row **তৈরি করে ফেলে দিতে** হয়। আপনি যত গভীরে page করবেন `OFFSET` linearly তত slow হয় — page 1 তাৎক্ষণিক, page 500 হামাগুড়ি দেয়। এটা _অস্থিরও_ বটে: কোনো user page করার মধ্যে যদি একটা row insert হয়, তাহলে row-গুলো সরে যায় আর সে একটা duplicate দেখে বা একটা বাদ পড়ে যায়।

**Keyset pagination** (cursor বা seek pagination-ও বলে) এর বদলে শেষ যে row দেখা হয়েছিল সেটা মনে রাখে আর তার _পরের_ row-গুলো চায়:

```sql
-- First page
SELECT * FROM posts ORDER BY created_at DESC, id DESC LIMIT 20;

-- Next page: pass the last row's (created_at, id) as a cursor
SELECT * FROM posts
WHERE (created_at, id) < ('2026-05-01 10:00:00', 8423)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

এই `WHERE` একটা B-tree index ব্যবহার করে সরাসরি cursor-এর position-এ লাফ দেয়, তাই গভীরতা যাই হোক **প্রতিটা page সমান দ্রুত**। বিনিময়: আপনি ইচ্ছেমতো কোনো page নম্বরে লাফ দিতে পারবেন না, শুধু "next"/"previous"। cursor যাতে দ্ব্যর্থহীন থাকে সেজন্য order-এ একটা unique tie-breaker (`id`) রাখুন।

|                           | Offset       | Keyset |
| ------------------------- | ------------ | ------ |
| গভীর-page speed           | linearly কমে | ধ্রুব  |
| Page N-এ লাফ              | হ্যাঁ        | না     |
| Insert-এর মধ্যে স্থিতিশীল | না           | হ্যাঁ  |

## সাধারণ Anti-Pattern

- **Application কোডে `SELECT *`** — যে column ব্যবহারই করেন না সেগুলো fetch করে (I/O আর bandwidth নষ্ট করে) আর index-only scan ভেঙে দেয়। যে column দরকার সেগুলোই লিখুন।
- **Indexed column-এর উপর function** — `WHERE date_trunc('day', ts) = '2026-05-01'` `ts`-এর উপরের index ব্যবহার করতে পারে না। এটাকে একটা range হিসেবে লিখুন: `WHERE ts >= '2026-05-01' AND ts < '2026-05-02'`। এমন index-বান্ধব condition-কে _sargable_ বলে।
- **Implicit type cast** — একটা indexed column-কে অমিল type-এর সাথে তুলনা করলে নীরবে এমন একটা cast জোর করে বসতে পারে যা index অকেজো করে দেয়।
- **শুরুতে wildcard দেওয়া `LIKE`** — `'%term'` কোনো B-tree ব্যবহার করতে পারে না; full-text search বা trigram index ব্যবহার করুন।
- **Column জুড়ে `OR`** — কখনো index ব্যবহার আটকে দেয়; দুটো indexed query-র একটা `UNION ALL` অনেক বেশি দ্রুত হতে পারে।
- **Pagination-এর জন্য সব গোনা** — প্রতি page-এ একটা বিশাল filtered set-এর উপর `SELECT COUNT(*)` খরচবহুল; একটা estimate (`reltuples`) বিবেচনা করুন, নয়তো UI থেকে exact count বাদ দিন।

<Callout type="tip">

**Condition-কে sargable বানান।** একটা "sargable" predicate হলো এমন যেটা planner একটা index range দিয়ে মেটাতে পারে। যান্ত্রিক নিয়ম: তুলনার এক পাশে indexed column-টা _খালি_ রাখুন আর যেকোনো transformation করুন _literal_ পাশে। `WHERE price > 100 * 1.2` sargable; `WHERE price / 1.2 > 100` নয়।

</Callout>

## কখন Denormalize করবেন

Normalization (chapter 9) হলো সঠিক default — এটা update anomaly আটকায় আর data সঙ্গতিপূর্ণ রাখে। কিন্তু কখনো কখনো একটা read এত গরম, আর join এত খরচবহুল, যে redundant data রেখে দেওয়াই জেতে। _ইচ্ছাকৃতভাবে_ denormalize করুন যখন:

- একটা বেশি-পড়া মান পেতে প্রতিবার অনেকগুলো table join করতে হয় (যেমন প্রতি page load-এ comment `COUNT` করার বদলে `posts`-এ একটা cached `comment_count`)।
- একটা aggregate লেখার চেয়ে অনেক বেশি পড়া হয় — একটা trigger দিয়ে বা application কোডে সেটা maintain করুন।
- একটা materialized view একটা খরচবহুল report আগে থেকে হিসাব করে রাখতে পারে আর নিয়মিত refresh করতে পারে: `CREATE MATERIALIZED VIEW ... ; REFRESH MATERIALIZED VIEW CONCURRENTLY ...`।

এর মূল্য হলো consistency: প্রতিটা denormalized কপি আরও একটা জিনিস যা source of truth থেকে সরে যেতে পারে। শুধু তখনই এটা দিন যখন মাপজোখ প্রমাণ করে join-ই bottleneck।

## Connection আর Statement-এর বিবেচনা

Performance শুধু query text নিয়ে নয়:

- **Connection pooling।** Postgres connection ভারী (প্রতিটা একটা process)। প্রতি request-এ একটা করে খুললে server নিঃশেষ হয়ে যায়। সামনে একটা pooler (PgBouncer, বা আপনার framework-এর pool) বসান আর connection পুনর্ব্যবহার করুন।
- **Prepared statement** database-কে একটা query একবার parse আর plan করে সেই plan পুনর্ব্যবহার করতে দেয়, hot path-এ overhead বাঁচায় — তবে একটা cached generic plan মাঝেমধ্যে নির্দিষ্ট parameter-এর জন্য plan করা একটার চেয়ে খারাপ হতে পারে।
- **Write batch করুন।** ১০,০০০ row একটা multi-row `INSERT` (বা `COPY`) দিয়ে insert করা ১০,০০০টা single-row insert-এর চেয়ে বহুগুণ দ্রুত, কারণ প্রতিটার নিজের round trip আর transaction থাকে।
- **Transaction ছোট রাখুন।** Chapter 6-এ যেমন বলা হয়েছে, দীর্ঘ transaction lock ধরে রাখে আর `VACUUM` আটকায়, যা bloat তৈরি করে আর সময়ের সাথে _সবকিছু_ slow করে দেয়।

## একটা Diagnostic Checklist

1. `pg_stat_statements` থেকে slow query শনাক্ত করুন (মোট সময় দিয়ে, শুধু per-call সময় দিয়ে নয় — একটা দ্রুত query দশ লাখবার ডাকা হলে সেটাই আধিপত্য করতে পারে)।
2. সেটাকে `EXPLAIN (ANALYZE, BUFFERS)` করুন। সবচেয়ে খরচবহুল node খুঁজুন।
3. এটা কি একটা অনুপস্থিত index? একটা non-sargable condition? বাসি stats? App থেকে N+1?
4. একটা জিনিস ঠিক করুন। আবার চালান। নিশ্চিত করুন plan বদলেছে আর সময় কমেছে।
5. দেখে নিন আপনি write performance-এ regression আনেননি বা একটা অব্যবহৃত index যোগ করেননি।

## রিক্যাপ

মেপে optimize করুন: আপনার ধারণা নয়, আসল plan পড়ুন। N+1-কে join-এ নামিয়ে আনুন, গভীর offset-এর বদলে keyset cursor দিয়ে page করুন, condition sargable রাখুন, আর শুধু তখনই denormalize করুন যখন একটা মাপা join bottleneck consistency-র মূল্য দেওয়াকে যুক্তিসংগত করে। Query-র চারপাশে connection pool করুন আর write batch করুন। এরপর, এই সবকিছুর নিচের ভিত্তি — schema নিজেই design আর evolve করা।
