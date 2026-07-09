---
title: 'SQL — রোডম্যাপ'
subtitle: 'আপনার প্রথম SELECT লেখা থেকে শুরু করে schema ডিজাইন আর zero-downtime migration শিপ করা পর্যন্ত পুরো পথ।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'sql', 'postgres']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## এই ট্র্যাকে যা যা থাকছে

SQL হলো ডেটার lingua franca। আপনি যত backend বানাবেন তার প্রায় প্রতিটাই শেষমেশ কোনো না কোনো relational database-এর সাথে কথা বলবে, আর যে query দুই মিলিসেকেন্ডে রেজাল্ট ফেরত দেয় আর যেটা প্রোডাকশন ত্রিশ সেকেন্ড লক করে রাখে — এই দুইয়ের পার্থক্য সাধারণত এটুকু বোঝার মধ্যেই: database আসলে ভেতরে কী করছে।

এই ট্র্যাক শেষ করার পর আপনি পারবেন:

- সঠিক, পড়ার-উপযোগী query লিখতে — সহজ lookup থেকে শুরু করে multi-table join, subquery আর window function পর্যন্ত।
- একটা query _কেন_ ধীর তা তার execution plan পড়ে বুঝতে, আর সঠিক index দিয়ে ঠিক করতে।
- transaction আর isolation level সঠিকভাবে ব্যবহার করতে, যাতে concurrent write আপনার ডেটা নষ্ট না করে।
- ঠিকঠাক constraint সহ normalized schema ডিজাইন করতে, আর অ্যাপ্লিকেশন চলতে থাকা অবস্থাতেই সেগুলো নিরাপদে বদলাতে।

আমরা পুরোটা জুড়ে reference dialect হিসেবে **PostgreSQL** ব্যবহার করব। SQL-এর মূল ধারণাগুলো MySQL, SQLite আর SQL Server-এও কাজে লাগে, তবে syntax-এর খুঁটিনাটি (আর বিশেষ করে query planner-এর আচরণ) আলাদা হয়।

## যা আগে থেকে জানা দরকার

আগে থেকে database-এর অভিজ্ঞতা লাগবে না — chapter 1 একদম table আর row থেকেই শুরু করে। একটু command-line-এ স্বাচ্ছন্দ্য থাকলে সুবিধা হয়, কারণ বেশিরভাগ উদাহরণ ধরে নেয় যে আপনি `psql` বা একই রকম কোনো client চালাতে পারেন।

<Callout type="tip">

**দুটো সহযোগী ট্র্যাকের সাথে দারুণ জোড়া লাগে।** এই ট্র্যাক SQL-এর _ভাষা আর ব্যবহারের_ ওপর ফোকাস করে। **db-internals** ট্র্যাক ভেতরের যন্ত্রপাতি (B-tree, write-ahead log, MVCC) ব্যাখ্যা করে আর **data-modeling** একটা domain-কে entity আর relationship-এ রূপান্তরের গভীরে যায়। পুরো ছবিটা পেতে এগুলো একসাথে পড়ুন।

</Callout>

## অধ্যায়গুলো

1. **The Relational Model & Basic Queries** — table, row, column, data type, `CREATE TABLE`, আর `SELECT` / `WHERE` / `ORDER BY` / `LIMIT`-এর মূল অংশ, সাথে `NULL`-এর semantics।
2. **Filtering, Grouping & Aggregation** — `COUNT` / `SUM` / `AVG`, `GROUP BY`, `HAVING` আর `WHERE`-এর পার্থক্য, আর একটা query আসলে যে logical ক্রমে চলে সেটা।
3. **Joins** — `INNER`, `LEFT`, `RIGHT`, `FULL` আর `CROSS` join, self-join, আর fan-out ও `NULL` mismatch-এর মতো ক্লাসিক ফাঁদগুলো।
4. **Subqueries & CTEs** — scalar আর correlated subquery, `IN` বনাম `EXISTS`, derived table, `WITH` clause, আর tree traversal-এর জন্য recursive CTE।
5. **Indexes & Query Plans** — B-tree index, composite আর covering index, `EXPLAIN ANALYZE` পড়া, আর কখন index মোটেও কাজে আসবে না।
6. **Transactions & Isolation Levels** — ACID, `BEGIN` / `COMMIT` / `ROLLBACK`, চারটা isolation level আর তারা যেসব anomaly ঠেকায়, MVCC, lock আর deadlock।
7. **Window Functions** — `OVER` / `PARTITION BY` / `ORDER BY`, ranking function, `LAG` / `LEAD`, running total, আর frame clause।
8. **Query Optimization & Performance** — বাস্তবে চাপের মুখে plan পড়া, N+1 সমস্যা, keyset বনাম offset pagination, চেনা anti-pattern, আর কখন denormalize করবেন।
9. **Schema Design & Migrations** — constraint, বাস্তবে normalization, generated column, আর zero-downtime schema পরিবর্তনের জন্য expand/contract pattern।

## এই ট্র্যাক কীভাবে ব্যবহার করবেন

ক্রম মেনে পড়ুন — প্রতিটা chapter আগেরগুলো ধরে নেয়। query শুধু পড়ে না গিয়ে একটা আসল database-এর বিরুদ্ধে টাইপ করে দেখুন; SQL পরীক্ষা-নিরীক্ষার প্রতিদান দেয়। একটা ফেলে-দেওয়ার মতো Postgres instance চালু করুন, কয়েকশো row নকল ডেটা লোড করুন, আর জিনিসপত্র ভাঙুন। দশ পৃষ্ঠা লেখা পড়ার চেয়ে একটা গোলমেলে query plan থেকে আপনি বেশি শিখবেন।

চলুন ভিত্তি দিয়েই শুরু করি: একটা relational table আসলে কী।
