---
title: 'Filtering, Grouping & Aggregation'
subtitle: 'COUNT, SUM, GROUP BY আর HAVING দিয়ে অনেকগুলো row-কে সারসংক্ষেপ উত্তরে গুটিয়ে আনুন।'
chapter: 2
level: 'beginner'
readingTime: '13 মিনিট'
topics: ['group by', 'aggregate', 'having']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

দিন শেষে দোকান বন্ধ করার সময় ইবনে সিনা গল্লার সামনে বসে সারাদিনের বিক্রির স্লিপগুলো নিয়ে হিসাব মেলাতে বসে। প্রথমেই সে গাদার মধ্য থেকে বাতিল স্লিপগুলো আলাদা করে সরিয়ে রাখে — যে বিক্রিগুলো ক্যান্সেল হয়ে গিয়েছিল, কাস্টমার জিনিস ফেরত দিয়েছিল, ওগুলো হিসাবে ঢুকলে দিনের অঙ্ক ভুল হবে। শুধু আসল, টিকে থাকা বিক্রির স্লিপগুলোই সে রাখে।

এবার সে বাকি স্লিপগুলোকে পণ্যের ধরন অনুযায়ী আলাদা আলাদা স্তূপে সাজায় — চাল-ডালের এক স্তূপ, সাবান-শ্যাম্পুর আরেক স্তূপ, বিস্কুট-চানাচুরের আরেকটা। প্রতিটা স্তূপ ধরে সে গোনে কয়টা স্লিপ, আর যোগ করে মোট কত টাকা বিক্রি হলো, চাইলে গড়ে প্রতি স্লিপে কত টাকা তা-ও বের করে। শেষে সে শুধু সেই স্তূপগুলোই আলাদা করে মার্ক করে রাখে যেগুলোতে দিনে ৫০০০ টাকার বেশি বিক্রি হয়েছে — কোন ধরনের পণ্য আসলে দোকান চালাচ্ছে, সেটা এভাবেই সে বুঝে ফেলে।

ইবনে সিনার এই হিসাবটাই হুবহু একটা aggregation query। বাতিল স্লিপ সরিয়ে দেওয়াটা `WHERE` — group করার আগেই row ধরে ধরে filter। পণ্যের ধরন অনুযায়ী স্তূপে ভাগ করাটা `GROUP BY`। প্রতি স্তূপে স্লিপ গোনা, টাকা যোগ করা আর গড় বের করা হলো aggregate function — `COUNT`, `SUM`, `AVG`। আর শেষে শুধু ৫০০০ টাকার বেশি বিক্রি হওয়া স্তূপগুলো রাখাটা `HAVING` — যেটা group তৈরি হওয়ার পরে পুরো group ধরে filter করে। বাস্তবেও ঠিক এভাবেই sales dashboard বানানো হয়: বাতিল order বাদ, category ধরে group, প্রতি category-র revenue, তারপর শুধু ভালো-চলা category-গুলো দেখানো।

## Row থেকে সারসংক্ষেপে

এতক্ষণ প্রতিটা query আলাদা আলাদা row ফেরত দিয়েছে। প্রায়ই আপনি বদলে একটা _সারসংক্ষেপ_ চান: আমরা কতগুলো order শিপ করেছি? প্রতি customer-এ গড় order value কত? Aggregation অনেকগুলো row-কে একটায় গুটিয়ে এনে এসব উত্তর দেয়।

আমরা একটা `orders` table ব্যবহার করব:

| id  | customer_id | status    | amount | created_at |
| --- | ----------- | --------- | ------ | ---------- |
| 1   | 10          | shipped   | 49.00  | 2026-05-01 |
| 2   | 10          | shipped   | 12.50  | 2026-05-03 |
| 3   | 20          | cancelled | 80.00  | 2026-05-04 |
| 4   | 20          | shipped   | 99.99  | 2026-05-06 |

## Aggregate Function

একটা aggregate function কতগুলো value-এর একটা set নেয় আর একটা মাত্র value ফেরত দেয়:

| Function                | যা ফেরত দেয়                          |
| ----------------------- | ------------------------------------- |
| `COUNT(*)`              | row-এর সংখ্যা                         |
| `COUNT(col)`            | যেসব row-তে `col` null নয় তার সংখ্যা |
| `SUM(col)`              | সব value-এর যোগফল                     |
| `AVG(col)`              | গড়                                   |
| `MIN(col)` / `MAX(col)` | সবচেয়ে ছোট / সবচেয়ে বড় value       |

```sql
SELECT
  COUNT(*)        AS order_count,
  SUM(amount)     AS revenue,
  AVG(amount)     AS avg_order,
  MAX(amount)     AS biggest_order
FROM orders;
```

এটা পুরো table-এর সারসংক্ষেপ করা ঠিক একটা row ফেরত দেয়।

<Callout type="info">

**`COUNT(*)` বনাম `COUNT(col)`।** `COUNT(*)` null-এর তোয়াক্কা না করে row গোনে। `COUNT(col)` শুধু সেসব row গোনে যেখানে `col` non-null — "কতগুলো order-এ discount code আছে" জাতীয় কাজের জন্য সুবিধাজনক। আর `COUNT(DISTINCT col)` আলাদা non-null value গোনে, যেমন `COUNT(DISTINCT customer_id)` unique customer-এর সংখ্যা দেয়।

</Callout>

## GROUP BY: প্রতি Category-তে Aggregate করা

একটা মাত্র সর্বমোট যোগফল খুব কমই যথেষ্ট — আপনি সাধারণত _প্রতি group-এ_ একটা করে সারসংক্ষেপ চান। `GROUP BY` row-গুলোকে bucket-এ ভাগ করে আর প্রতিটার ভেতরে aggregate চালায়:

```sql
SELECT
  customer_id,
  COUNT(*)    AS order_count,
  SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id;
```

ফলাফল:

| customer_id | order_count | total_spent |
| ----------- | ----------- | ----------- |
| 10          | 2           | 61.50       |
| 20          | 2           | 179.99      |

যে নিয়মটা সবাইকে ধরে ফেলে: **`SELECT` তালিকার প্রতিটা column হয় কোনো aggregate function-এর ভেতরে থাকতে হবে, নয়তো `GROUP BY`-তে নাম থাকতে হবে।** নাহলে database ঠিক করতে পারে না কোন value দেখাবে, কারণ একটা group-এ অনেক row থাকে। এটা fail করে:

```sql
SELECT customer_id, status, SUM(amount)
FROM orders
GROUP BY customer_id;   -- ERROR: status must appear in GROUP BY
```

আরও সূক্ষ্ম bucket বানাতে আপনি একাধিক column দিয়ে group করতে পারেন:

```sql
SELECT customer_id, status, SUM(amount) AS total
FROM orders
GROUP BY customer_id, status;
```

## HAVING বনাম WHERE

আপনি `WHERE` দিয়ে কোনো aggregate-এর ওপর filter করতে পারবেন না, কারণ `WHERE` grouping হওয়ার _আগে_ চলে — ওই মুহূর্তে aggregate-টা এখনো অস্তিত্বেই নেই। `HAVING` হলো সেই filter যা grouping-এর _পরে_ প্রযোজ্য হয়:

```sql
SELECT customer_id, SUM(amount) AS total
FROM orders
WHERE status = 'shipped'        -- filter rows BEFORE grouping
GROUP BY customer_id
HAVING SUM(amount) > 50;        -- filter groups AFTER aggregating
```

এটাকে একটা pipeline হিসেবে পড়ুন:

1. `WHERE status = 'shipped'` cancelled order-গুলোকে row ধরে ধরে বাদ দেয়।
2. `GROUP BY customer_id` বেঁচে যাওয়াগুলোকে bucket-এ ভাগ করে।
3. `HAVING SUM(amount) > 50` যেসব group-এর total খুব ছোট সেগুলো পুরো বাদ দেয়।

<Callout type="tip">

**সস্তা filter-টা `WHERE`-এ রাখুন।** আগেভাগে row filter করা (`WHERE`-এ) মানে group ও aggregate করার জন্য কম row, যা দ্রুততর। `HAVING` রাখুন সেসব শর্তের জন্য যেগুলো সত্যিই কোনো aggregate value-এর ওপর নির্ভর করে। `WHERE amount > 50` আর `HAVING amount > 50` লেখা একেবারেই আলাদা জিনিস বোঝায়।

</Callout>

## Execution-এর Logical ক্রম

SQL-এর clause-গুলো এক ক্রমে _লেখা_ হয় কিন্তু আরেক ক্রমে _মূল্যায়ন_ হয়। এই logical ক্রম বোঝাটা "এখানে ওই alias কেন রেফার করতে পারছি না?" জাতীয় প্রায় প্রতিটা প্রশ্নের ব্যাখ্যা দেয়। engine ধারণাগতভাবে একটা query-কে এভাবে process করে:

```text
1. FROM      — pick the source tables, resolve joins
2. WHERE     — filter individual rows
3. GROUP BY  — collapse rows into groups
4. HAVING    — filter groups
5. SELECT    — compute output columns / aggregates, assign aliases
6. DISTINCT  — remove duplicate result rows
7. ORDER BY  — sort the result
8. LIMIT     — keep only the first N rows
```

এর থেকে দুটো ফলাফল বেরিয়ে আসে:

- **আপনি `WHERE` বা `GROUP BY`-তে কোনো `SELECT` alias ব্যবহার করতে পারবেন না**, কারণ `SELECT` সেগুলোর _পরে_ চলে। alias-টা তখনো অস্তিত্বেই নেই।

  ```sql
  SELECT amount * 0.9 AS discounted FROM orders
  WHERE discounted > 40;   -- ERROR: "discounted" unknown here
  ```

- **আপনি `ORDER BY`-তে একটা `SELECT` alias ব্যবহার _করতে পারেন_**, যেহেতু sort করা সবার শেষে হয়:

  ```sql
  SELECT amount * 0.9 AS discounted FROM orders
  ORDER BY discounted DESC;   -- works fine
  ```

(PostgreSQL সহনশীল আর সুবিধার্থে `GROUP BY`-তেও alias ব্যবহার করতে দেয়, তবে ওপরের logical মডেলটাই হলো পোর্টেবল মানসিক ছবি।)

## সব একসাথে জোড়া লাগানো

একটা বাস্তবসম্মত aggregation query একসাথে এই clause-গুলোর প্রায় সবগুলোকেই ছুঁয়ে যায়:

```sql
SELECT
  customer_id,
  COUNT(*)            AS shipped_orders,
  SUM(amount)         AS revenue,
  ROUND(AVG(amount), 2) AS avg_order
FROM orders
WHERE status = 'shipped'
GROUP BY customer_id
HAVING SUM(amount) > 50
ORDER BY revenue DESC
LIMIT 10;
```

এটা পড়া যায় এভাবে: shipped order-গুলোর মধ্যে, customer ধরে group করো, যারা 50-এর বেশি খরচ করেছে তাদের রাখো, আর revenue অনুযায়ী শীর্ষ 10 দেখাও। ওই একটা statement যা প্রতিস্থাপন করে তা হবে কয়েক ডজন লাইনের imperative code — এটাই SQL-এর declarative প্রতিদান।

## Recap

Aggregate row গুটিয়ে আনে; `GROUP BY` সেটা প্রতি category-তে করে; `HAVING` ফলাফলের group-গুলো filter করে আর `WHERE` input row filter করে। logical execution ক্রমটা আত্মস্থ করে নিন, তাহলে বেশিরভাগ চমকপ্রদ error আর চমক থাকবে না। এরপর আমরা join দিয়ে একাধিক table একসাথে জুড়ব।
