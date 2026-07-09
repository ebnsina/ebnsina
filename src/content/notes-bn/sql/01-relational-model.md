---
title: 'The Relational Model & Basic Queries'
subtitle: 'Table, row, column, type — আর যে SELECT statement দিয়ে ডেটা আবার টেনে বের করা হয়।'
chapter: 1
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['select', 'relational model', 'ddl']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Relational Model

একটা relational database ডেটা রাখে **table**-এ (আনুষ্ঠানিকভাবে, _relation_)। একটা table হলো একটা grid:

- একটা **row** (বা _tuple_) হলো একটা একক record — একজন user, একটা order, একটা event।
- একটা **column** (বা _attribute_) প্রতিটা row-এর একটা property বর্ণনা করে — একটা নাম, একটা দাম, একটা created timestamp।
- প্রতিটা column-এর একটা **data type** থাকে, যা ঠিক করে দেয় সেটা কী কী value ধরে রাখতে পারবে।

এই মডেলের শুরু Edgar Codd-এর ১৯৭০ সালের পেপার থেকে, আর এর শক্তি আসে একটা সহজ ধারণা থেকে: ডেটা মানে শুধু row-এর কিছু set, আর আপনি বর্ণনা করেন _কী_ চান, _কীভাবে_ আনতে হবে সেটা নয়। "কীভাবে"-টা database নিজেই বের করে নেয়।

`users` নামের একটা table দেখতে এমন হতে পারে:

| id  | email               | age | created_at          |
| --- | ------------------- | --- | ------------------- |
| 1   | lubna@example.com   | 36  | 2026-01-04 09:12:00 |
| 2   | nusayba@example.com | 41  | 2026-02-18 14:30:00 |
| 3   | harun@example.com   |     | 2026-03-01 08:00:00 |

লক্ষ্য করুন row 3-এর কোনো `age` নেই — ওই খালি cell-টা একটা `NULL`, যেটায় আমরা আবার ফিরব।

## Data Types

সঠিক type বেছে নেওয়া গুরুত্বপূর্ণ: এটা storage size নিয়ন্ত্রণ করে, কোন operation বৈধ তা ঠিক করে, আর database কীভাবে value sort ও compare করবে সেটা নির্ধারণ করে। PostgreSQL-এর কমন কিছু type:

| Type                   | যার জন্য                                          |
| ---------------------- | ------------------------------------------------- |
| `integer` / `bigint`   | পূর্ণসংখ্যা, ID, count                            |
| `numeric(p, s)`        | নির্ভুল দশমিক — টাকাপয়সা, এখানে কখনো `float` নয় |
| `text` / `varchar(n)`  | String                                            |
| `boolean`              | True/false flag                                   |
| `date` / `timestamptz` | তারিখ আর timezone-সচেতন timestamp                 |
| `uuid`                 | Globally unique identifier                        |
| `jsonb`                | Semi-structured document                          |

<Callout type="warning">

**টাকাপয়সা কখনো floating point-এ রাখবেন না।** `float` আর `double` `0.1`-এর মতো value নির্ভুলভাবে ধরে রাখতে পারে না, তাই total এক সেন্টের ভগ্নাংশ পরিমাণে সরে যায়। যেখানে নির্ভুলতা জরুরি সেখানে `numeric` (যাকে `decimal`-ও বলে) ব্যবহার করুন।

</Callout>

## Creating a Table (DDL)

যেসব statement structure সংজ্ঞায়িত করে — `CREATE`, `ALTER`, `DROP` — সেগুলোকে বলা হয় **DDL** (Data Definition Language)।

```sql
CREATE TABLE users (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL UNIQUE,
  age        integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

একটু ভেঙে দেখা যাক:

- `PRIMARY KEY` `id`-কে প্রতিটা row-এর unique identifier হিসেবে চিহ্নিত করে; এটা স্বয়ংক্রিয়ভাবে `NOT NULL` আর indexed।
- `GENERATED ALWAYS AS IDENTITY` Postgres-কে দিয়ে আপনার হয়ে ধারাবাহিক id বসিয়ে দেয়।
- `NOT NULL` ওই column-এ missing value নিষিদ্ধ করে।
- `UNIQUE` দুটো row-কে একই email শেয়ার করতে দেয় না।
- `DEFAULT now()` আপনি না দিলে `created_at` স্বয়ংক্রিয়ভাবে ভরে দেয়।

Row insert করতে **DML** (Data Manipulation Language) ব্যবহার হয়:

```sql
INSERT INTO users (email, age) VALUES
  ('lubna@example.com', 36),
  ('nusayba@example.com', 41),
  ('harun@example.com', NULL);
```

## SELECT: Reading Data

`SELECT` statement হলো আপনার প্রশ্ন করার উপায়। এর মূল রূপ:

```sql
SELECT email, age
FROM users
WHERE age > 30
ORDER BY age DESC
LIMIT 10;
```

প্রতিটা clause একটা করে কাজ করে:

- **`SELECT`** — কোন column ফেরত দেওয়া হবে। `SELECT *` সবগুলো ফেরত দেয় (ইন্টারঅ্যাক্টিভভাবে সুবিধাজনক, তবে application code-এ column-গুলো স্পষ্ট করে লিখুন, যাতে পরে একটা column যোগ করলে সেটা আপনাকে চমকে না দেয়)।
- **`FROM`** — কোন table থেকে পড়া হবে।
- **`WHERE`** — একটা filter; শুধু যেসব row-তে শর্তটা সত্য, সেগুলোই ফেরত আসে।
- **`ORDER BY`** — sort করার ক্রম, `ASC` (default) বা `DESC`।
- **`LIMIT`** — কতগুলো row ফেরত আসবে তার সীমা।

### Filtering with WHERE

`WHERE`-এর শর্তগুলো `AND`, `OR` আর `NOT` দিয়ে comparison জোড়া লাগায়:

```sql
SELECT * FROM users
WHERE age >= 18 AND age < 65;

SELECT * FROM users
WHERE email LIKE '%@example.com';

SELECT * FROM users
WHERE age IN (36, 41, 50);

SELECT * FROM users
WHERE created_at BETWEEN '2026-01-01' AND '2026-03-31';
```

যখন আপনি একটা column-কে একটা literal-এর সাথে তুলনা করেন — যেমন, "৩০-এর কম বয়সী সবাইকে দাও" — সেটা prose-এ হয় `WHERE age &lt; 30`, কিন্তু একটা code block-এর ভেতরে আপনি সাধারণভাবে শুধু `age < 30` লিখবেন। `LIKE` pattern matching করে, যেখানে `%` মানে "যেকোনো ক্রমের অক্ষর"।

### DISTINCT

`DISTINCT` রেজাল্ট থেকে ডুপ্লিকেট row সরিয়ে দেয়:

```sql
SELECT DISTINCT age FROM users ORDER BY age;
```

এটা প্রতিটা আলাদা age একবার করে ফেরত দেয়। `DISTINCT` পুরো selected row-এর ওপর প্রযোজ্য, তাই `SELECT DISTINCT age, email` দুটো column-এর _সমন্বয়ের_ ওপর দেখে deduplicate করে।

## NULL Semantics

`NULL` মানে "অজানা" বা "অনুপস্থিত" — এটা zero _নয়_, আর empty string-ও _নয়_। শুরুতে এটা প্রায় সবাইকে বিভ্রান্ত করে, কারণ comparison-এ `NULL` কোনো value-এর মতো আচরণ করে না।

`NULL`-এর _সাথে_ যেকোনো comparison-এর ফল `NULL` (যাকে "সত্য নয়" হিসেবে ধরা হয়), তাই:

```sql
SELECT * FROM users WHERE age = NULL;   -- returns ZERO rows, always
SELECT * FROM users WHERE age <> 25;    -- excludes NULL-age rows!
```

null পরীক্ষা করতে হলে আপনাকে বিশেষ `IS` operator ব্যবহার করতেই হবে:

```sql
SELECT * FROM users WHERE age IS NULL;
SELECT * FROM users WHERE age IS NOT NULL;
```

<Callout type="info">

**arithmetic-এও `NULL` ছোঁয়াচে।** `5 + NULL` হলো `NULL`, আর `'hi' || NULL` হলো `NULL`। কোনো column null হতে পারে এমন হলে fallback value বসাতে `COALESCE(age, 0)` ব্যবহার করুন — এটা প্রথম non-null argument-টা ফেরত দেয়।

</Callout>

একটা বাস্তব ফলাফল: আপনি যদি চান "যাদের age 25 নয় এমন সবাই, _সহ_ যাদের age অজানা", তাহলে আপনাকে স্পষ্ট হতে হবে:

```sql
SELECT * FROM users WHERE age <> 25 OR age IS NULL;
```

## Recap

এখন আপনার ভিত্তিটা তৈরি: table typed row ধরে রাখে, DDL সেগুলো সংজ্ঞায়িত করে, আর `WHERE` / `ORDER BY` / `LIMIT` সহ `SELECT` সেগুলো আবার পড়ে। `NULL`-এর নিয়মগুলো মাথায় রাখুন — অন্য যেকোনো feature-এর চেয়ে এগুলোই বেশি সূক্ষ্ম bug-এর উৎস। এরপর আমরা aggregation দিয়ে অনেকগুলো row-কে একক উত্তরে সারসংক্ষেপ করব।
