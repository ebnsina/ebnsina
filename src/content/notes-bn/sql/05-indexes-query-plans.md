---
title: 'Indexes ও Query Plans'
subtitle: 'ডেটাবেস কীভাবে দ্রুত row খুঁজে পায় — B-tree index, EXPLAIN, আর কখন একটা index অকেজো।'
chapter: 5
level: 'intermediate'
readingTime: '17 মিনিট'
topics: ['index', 'explain', 'b-tree']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Index যে সমস্যাটা সমাধান করে

Index ছাড়া `WHERE email = 'lubna@example.com'` এর সাথে ম্যাচ করা row খুঁজতে হলে টেবিলের **প্রতিটা row** পড়তে হয় — একে বলে _sequential scan_। এক মিলিয়ন row-এর টেবিলে একটা row খুঁজতে সেটা এক মিলিয়ন read। Index হলো একটা আলাদা, sorted ডেটা স্ট্রাকচার যা ডেটাবেসকে সরাসরি ম্যাচিং row-এ লাফ দিতে দেয় — ঠিক যেমন একটা বইয়ের index আপনাকে গোটা বই না পড়িয়ে সরাসরি একটা পেজে পাঠায়।

ট্রেড-অফটা হলো: index read দ্রুত করে কিন্তু write ধীর করে (প্রতিটা `INSERT` / `UPDATE` / `DELETE`-কে index-ও আপডেট করতে হয়) এবং disk space খায়। Index দিন ইচ্ছাকৃতভাবে, রিফ্লেক্সে নয়।

## B-Tree Index

Postgres-এর ডিফল্ট index টাইপ হলো **B-tree** (balanced tree)। এটা key-গুলোকে sorted রাখে এবং বিশাল টেবিলেও মাত্র কয়েক লেভেল গভীর থাকে, তাই যেকোনো lookup-এ মুষ্টিমেয় কয়েকটা page read লাগে। যেহেতু এটা key-গুলো _অর্ডার অনুযায়ী_ রাখে, একটা B-tree এগুলো দ্রুত করে:

- Equality: `WHERE id = 42`
- Range: `WHERE created_at >= '2026-01-01'`
- Sorting: `ORDER BY created_at` (index তো আগে থেকেই sorted)
- Prefix matching: `WHERE email LIKE 'lubna%'` (কিন্তু `LIKE '%lubna'` _নয়_)

```sql
CREATE INDEX idx_users_email ON users (email);
```

একটা `UNIQUE` constraint বা `PRIMARY KEY` স্বয়ংক্রিয়ভাবে একটা B-tree index বানায় — আপনাকে আলাদা করে যোগ করতে হয় না।

<Callout type="info">

**B-tree-ই একমাত্র index টাইপ নয়।** Postgres আরো দেয় `hash` (শুধু equality), `GIN` (`jsonb`, array, আর full-text search-এর জন্য), `GiST` (geometric / range ডেটা), আর `BRIN` (বিশাল, স্বাভাবিকভাবে-অর্ডারড টেবিল যেমন time-series log)। বেশিরভাগ ক্ষেত্রেই B-tree হলো সঠিক ডিফল্ট; অন্যগুলোর দিকে হাত বাড়ান যখন তাদের নির্দিষ্ট ডেটা শেপ প্রযোজ্য হয়। db-internals ট্র্যাকে এদের কলকব্জা কভার করা আছে।

</Callout>

## Composite Index আর Column Order

একটা **composite** (multi-column) index একসাথে কয়েকটা column কভার করে:

```sql
CREATE INDEX idx_orders_cust_date ON orders (customer_id, created_at);
```

Column-এর **order-টা প্রচণ্ড জরুরি**। এই index-টা আগে `customer_id` অনুযায়ী sorted, তারপর প্রতিটা customer-এর ভেতরে `created_at` অনুযায়ী। এটা কাজে লাগে:

- `WHERE customer_id = 10` — হ্যাঁ (leading column)
- `WHERE customer_id = 10 AND created_at > '2026-01-01'` — হ্যাঁ, আদর্শ
- একা `WHERE created_at > '2026-01-01'` — **না**, কারণ `created_at` leading column নয়

এটাই হলো **leftmost-prefix rule**: একটা composite index তখনই সাহায্য করে যখন আপনার filter তার column-গুলোর একটা contiguous prefix ব্যবহার করে, প্রথমটা থেকে শুরু করে। Column-গুলো সাজান আগে equality, তারপর range/sort column দিয়ে।

## Covering Index

যদি একটা index-এ একটা query-র প্রয়োজনীয় _প্রতিটা_ column থাকে, তাহলে Postgres টেবিল স্পর্শ না করেই পুরোটা index থেকে উত্তর দিতে পারে — একটা **index-only scan**। `INCLUDE` clause payload column যোগ করে যেগুলো search key-র অংশ নয়:

```sql
CREATE INDEX idx_orders_cust_amount
  ON orders (customer_id) INCLUDE (amount);

-- Answered from the index alone:
SELECT amount FROM orders WHERE customer_id = 10;
```

Covering index হট query-গুলোকে নাটকীয়ভাবে দ্রুত করতে পারে, বিনিময়ে একটা বড় index-এর খরচে।

## EXPLAIN দিয়ে Query Plan পড়া

`EXPLAIN` দেখায় optimizer কোন _plan_ বেছেছে — query না চালিয়েই। `EXPLAIN ANALYZE` আসলেই এটা execute করে এবং বাস্তব timing ও row count রিপোর্ট করে, ধীরগতির diagnose করার সময় এটাই আপনার দরকার।

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 10;
```

একটা plan পড়া হয় node-এর একটা tree হিসেবে; indentation nesting দেখায়, আর ভেতরের (বেশি-indented) node আগে পড়তে হয়। একই query-র দুটো plan:

```text
-- Without an index:
Seq Scan on orders  (cost=0.00..1834.00 rows=12 width=40)
                    (actual time=0.30..14.20 rows=12 loops=1)
  Filter: (customer_id = 10)
  Rows Removed by Filter: 99988

-- With an index on customer_id:
Index Scan using idx_orders_cust on orders
                    (cost=0.42..8.44 rows=12 width=40)
                    (actual time=0.03..0.05 rows=12 loops=1)
  Index Cond: (customer_id = 10)
```

একটা plan থেকে যেসব মূল জিনিস পড়ে নেবেন:

- **Node type** — `Seq Scan` (পুরো টেবিল read), `Index Scan`, `Index Only Scan`, `Bitmap Heap Scan`, বা `Nested Loop`, `Hash Join`, `Merge Join`-এর মতো join node।
- **`cost`** — planner-এর অনুমান, একটা arbitrary একক-এ (startup..total)। এটা যত কম, planner তত optimize করে।
- **`actual time`** — বাস্তব millisecond (শুধু `ANALYZE`-এর সাথে)।
- **`rows` estimated vs actual** — বড় গরমিল মানে stale statistics; সেগুলো refresh করতে `ANALYZE tablename` চালান। খারাপ estimate খারাপ plan-এর দিকে নিয়ে যায়।
- **`Rows Removed by Filter`** — বড় সংখ্যা মানে আপনি যা return করেছেন তার চেয়ে অনেক বেশি scan করেছেন, একটা ইঙ্গিত যে একটা index সাহায্য করবে।

<Callout type="tip">

**Estimate-vs-actual gap-টাই আপনার সেরা সূত্র।** যদি planner ১০টা row আশা করে কিন্তু ১০০,০০০ পায়, তাহলে সম্ভবত এটা একটা nested loop বেছেছে যা এখন বিপর্যয়করভাবে ধীর। সমাধান প্রায়ই হয় statistics আপডেট করতে `ANALYZE`, বা query-টা এমনভাবে পুনর্গঠন করা যাতে planner আরো ভালো estimate করতে পারে।

</Callout>

## Seq Scan vs Index Scan আর Selectivity

একটা sequential scan সবসময় খারাপ নয়। Planner **selectivity** ওজন করে — একটা condition কত ভগ্নাংশ row-এর সাথে ম্যাচ করে:

- **High selectivity** (কম row ম্যাচ করে, যেমন একটা unique email) → index scan জেতে। অল্প কয়েকটা ম্যাচে লাফ দাও।
- **Low selectivity** (অনেক row ম্যাচ করে, যেমন `status = 'active'` যেখানে ৯০% active) → একটা seq scan প্রায়ই _দ্রুত_, কারণ টেবিলের বেশিরভাগ অংশে index pointer ধরে, random order-এ যাওয়ার খরচ পুরো টেবিল sequential-ভাবে স্ট্রিম করার চেয়ে বেশি।

এই কারণেই একটা boolean বা low-cardinality column-এর উপর একটা index প্রায়ই ব্যবহার হয় না — আর এই কারণেই planner সেটা উপেক্ষা করতে ঠিক। Index তখনই লাভ দেয় যখন তারা আপনাকে _অধিকাংশ_ row বাদ দিতে দেয়।

## যখন Index সাহায্য করে না

একটা column-এর উপর index অপচয় যদি query সেটা ব্যবহার করতে না পারে। সাধারণ ক্ষেত্রগুলো:

- **Column-এর উপর function বা expression।** `WHERE lower(email) = 'lubna@x.com'` `email`-এর উপর একটা সাধারণ index ব্যবহার করতে পারে না। একটা _expression index_ বানান: `CREATE INDEX ON users (lower(email))`।
- **Leading wildcard।** `LIKE '%lubna'` একটা B-tree ব্যবহার করতে পারে না (এটা prefix অনুযায়ী sorted)। Trigram (`GIN` + `pg_trgm`) index এটা সামলায়।
- **Type mismatch।** একটা indexed `text` column-কে একটা integer literal-এর সাথে তুলনা করলে এমন একটা cast বাধ্য হতে পারে যা index বাইপাস করে।
- **Low selectivity**, উপরের মতো — planner ঠিকমতোই এটা এড়িয়ে যায়।
- **ক্ষুদ্র টেবিল।** কয়েকশ row-এর নিচে, একটা seq scan index-এর overhead-এর চেয়ে দ্রুত; planner index নিয়ে মাথা ঘামাবে না।
- **ভিন্ন column জুড়ে `OR`** কখনো কখনো index ব্যবহার আটকে দেয়; দুটো indexed query-র একটা `UNION`, বা একটা bitmap scan, দ্রুত হতে পারে।

<Callout type="warning">

**সবকিছুতে index দেবেন না।** প্রতিটা index write amplification আর storage যোগ করে। পনেরোটা index-ওয়ালা একটা টেবিল query serve করার চেয়ে সেগুলো maintain করতেই বেশি সময় ব্যয় করতে পারে। আপনার আসল `WHERE`, `JOIN`, আর `ORDER BY` clause যে column-গুলো আসলেই ব্যবহার করে সেগুলোতে index দিন, তারপর `EXPLAIN` দিয়ে যাচাই করুন যে index-টা বেছে নেওয়া হয়েছে। `pg_stat_user_indexes` যেগুলো কখনো scan হয় না দেখায়, সেই index-গুলো ফেলে দিন।

</Callout>

## একটা ব্যবহারিক Workflow

1. ধীর query-টা খুঁজুন (log বা `pg_stat_statements` থেকে)।
2. এর উপর `EXPLAIN ANALYZE` চালান।
3. ব্যয়বহুল node-টা চিহ্নিত করুন — সাধারণত অনেক `Rows Removed by Filter`-ওয়ালা একটা `Seq Scan`, বা খারাপ row estimate-ওয়ালা একটা join।
4. একটা targeted index যোগ করুন (column order query-র সাথে ম্যাচ করে), বা query refactor করুন।
5. আবার `EXPLAIN ANALYZE` চালান এবং নিশ্চিত করুন যে plan বদলেছে আর সময় কমেছে।

## Recap

Index হলো sorted side structure যা ডেটাবেসকে একটা টেবিলের বেশিরভাগ বাদ দিতে দেয়; B-tree equality, range, আর ordering সামলায়। Composite index leftmost-prefix rule মানে, covering index index-only scan সম্ভব করে, আর `EXPLAIN ANALYZE` হলো আসলে কী ঘটছে তা দেখার উপায়। কিন্তু index শুধু high-selectivity, sargable condition-এই সাহায্য করে — আর প্রতিটাই write-এ আপনাকে খরচ করায়। পরে আমরা transaction দিয়ে concurrent write নিরাপদ করব।
