---
title: 'Subqueries & CTEs'
subtitle: 'Query-র ভেতরে query — scalar, correlated, derived table, WITH clause আর recursion।'
chapter: 4
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['subquery', 'cte', 'recursive']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Query-র ভেতরে Query

একটা **subquery** হলো আরেকটা statement-এর ভেতরে nested একটা `SELECT`। এগুলো আপনাকে ধাপে ধাপে প্রশ্নের উত্তর দিতে দেয়: একটা মধ্যবর্তী ফলাফল বের করুন, তারপর সেটা ব্যবহার করুন। Subquery মূলত তিন জায়গায় দেখা যায় — একটা single value হিসেবে, একটা `WHERE` ফিল্টারে, আর `FROM` clause-এ একটা টেবিল হিসেবে।

## Scalar Subquery

একটা scalar subquery ঠিক **একটা row আর একটা column** ফেরত দেয় — একটা single value — যেটা আপনি যেখানে একটা value আশা করা হয় সেখানেই বসাতে পারেন:

```sql
SELECT name, amount,
       amount - (SELECT AVG(amount) FROM orders) AS diff_from_avg
FROM orders;
```

ভেতরের query একবারই সামগ্রিক average বের করে; প্রতিটা row সেটা বিয়োগ করে। কোনো scalar subquery যদি ভুলবশত একের বেশি row ফেরত দেয়, database একটা error তোলে — ওই constraint-টাই এখানে মূল কথা।

## WHERE-এ Subquery: IN আর EXISTS

একগুচ্ছ (_set_) value-এর বিপরীতে ফিল্টার করতে `IN` সহ একটা subquery ব্যবহার করুন:

```sql
SELECT name FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE amount > 100);
```

এটা এমন customer-দের খুঁজে বের করে যাদের অন্তত একটা order 100-এর বেশি। `EXISTS` একই ধারণাকে ভিন্নভাবে প্রকাশ করে — এটা পরীক্ষা করে subquery আদৌ _কোনো_ row ফেরত দেয় কিনা:

```sql
SELECT name FROM customers c
WHERE EXISTS (
  SELECT 1 FROM orders o
  WHERE o.customer_id = c.id AND o.amount > 100
);
```

<Callout type="warning">

**null-সহ `NOT IN` একটা ফাঁদ।** subquery যদি একটা `NULL`-ও ফেরত দেয়, `NOT IN` _একটাও row ফেরত দেয় না_, কারণ প্রতিটা তুলনায় `x <> NULL` unknown হয়ে যায়। `WHERE id NOT IN (SELECT customer_id FROM orders)` চুপচাপ ভেঙে পড়ে যদি `customer_id` null হতে পারে। `NOT EXISTS` বেছে নিন, যা null ঠিকভাবে হ্যান্ডল করে আর সাধারণত ঠিক ততটাই ভালো অপ্টিমাইজ হয়।

</Callout>

## Correlated Subquery

উপরের `EXISTS` উদাহরণটা **correlated**: ভেতরের query বাইরের query থেকে `c.id` রেফার করে। যুক্তিগতভাবে এটা প্রতিটা outer row-এর জন্য একবার করে আবার চলে। Correlated subquery প্রকাশের দিক থেকে শক্তিশালী কিন্তু টেবিল বড় হলে ধীর হতে পারে, ওই per-row মূল্যায়নের কারণে — যদিও Postgres প্রায়ই এগুলোকে ভেতরে ভেতরে join-এ রিরাইট করে ফেলে। কোনো correlated subquery যদি আপনার query plan-এ প্রাধান্য বিস্তার করে, তাহলে একটা join বা CTE-র দিকে হাত বাড়ান।

একটা ক্লাসিক correlated প্যাটার্ন হলো "প্রতি customer-এর সবচেয়ে সাম্প্রতিক order":

```sql
SELECT * FROM orders o
WHERE o.created_at = (
  SELECT MAX(created_at) FROM orders o2
  WHERE o2.customer_id = o.customer_id
);
```

(chapter 7-এর window function সাধারণত এটা আরও পরিষ্কারভাবে প্রকাশ করে।)

## Derived Table (FROM-এ Subquery)

`FROM` clause-এ একটা subquery একটা অস্থায়ী, নামহীন টেবিল হিসেবে কাজ করে — একটা **derived table**। এটাকে অবশ্যই একটা alias দিতে হয়:

```sql
SELECT bucket, COUNT(*)
FROM (
  SELECT CASE
           WHEN amount < 50  THEN 'small'
           WHEN amount < 100 THEN 'medium'
           ELSE 'large'
         END AS bucket
  FROM orders
) AS labeled
GROUP BY bucket;
```

ভেতরের query প্রতিটা order-কে লেবেল করে; বাইরের query প্রতি লেবেলে গোনে। Derived table হলো এমন উপায় যা দিয়ে আপনি একটা aggregation-এর ফলাফলকে আবার aggregate করেন, অথবা একটা আগে থেকে summarize করা set-এর সাথে join করেন। chapter 3-এর fan-out সমাধানটা মনে করুন — একটা derived table-এ many-side-কে আগে থেকে aggregate করাটা ঠিক ওই টেকনিকটাই।

## Common Table Expression (CTE)

একটা **CTE** হলো `WITH` দিয়ে শুরুতে সংজ্ঞায়িত একটা named subquery। এটা derived table-এর মতোই কাজ করে কিন্তু উপর থেকে নিচে পড়া যায় আর একাধিকবার রেফার করা যায়:

```sql
WITH customer_totals AS (
  SELECT customer_id, SUM(amount) AS total
  FROM orders
  GROUP BY customer_id
)
SELECT c.name, ct.total
FROM customer_totals ct
JOIN customers c ON c.id = ct.customer_id
WHERE ct.total > 100
ORDER BY ct.total DESC;
```

আপনি কয়েকটা CTE চেইন করতে পারেন, প্রতিটা আগেরটার উপর ভর করে গড়ে ওঠে, যা একটা ভীতিকর nested query-কে একটা পড়ার-উপযোগী pipeline-এ পরিণত করে:

```sql
WITH shipped AS (
  SELECT * FROM orders WHERE status = 'shipped'
),
per_customer AS (
  SELECT customer_id, SUM(amount) AS total
  FROM shipped GROUP BY customer_id
)
SELECT * FROM per_customer WHERE total > 50;
```

<Callout type="info">

**CTE আর পারফরম্যান্স।** ঐতিহাসিকভাবে Postgres CTE-কে একটা "optimization fence" হিসেবে গণ্য করত — সবসময় materialize করত, কখনো কখনো পারফরম্যান্স খারাপ করত। Postgres 12 থেকে, একবার রেফার করা সাধারণ non-recursive CTE ডিফল্টভাবে _inline_ হয় (একটা subquery-র মতো অপ্টিমাইজ হয়)। আপনি যখন সত্যিই একটা ফলাফল একবার হিসাব করে আবার ব্যবহার করতে চান, তখন `WITH ... AS MATERIALIZED` দিয়ে পুরনো আচরণ জোর করে আনতে পারেন।

</Callout>

## Recursive CTE

একটা `WITH RECURSIVE` CTE _নিজেকেই_ রেফার করে, যা আপনাকে hierarchy আর graph পাড়ি দিতে দেয় — org chart, category tree, bill-of-materials। এর দুইটা অংশ থাকে যেগুলো `UNION ALL` দিয়ে জোড়া লাগে:

1. **anchor** — শুরুর row-গুলো।
2. **recursive term** — আগের iteration থেকে উদ্ভূত row, যা বারবার চলে যতক্ষণ না কিছুই তৈরি করে।

একটা `employees` টেবিল দেওয়া আছে যাতে `id`, `name` আর `manager_id` আছে, CEO থেকে নিচের দিকে কমান্ডের চেইন ধরে হাঁটুন:

```sql
WITH RECURSIVE org AS (
  -- anchor: top of the tree (no manager)
  SELECT id, name, manager_id, 1 AS depth
  FROM employees
  WHERE manager_id IS NULL

  UNION ALL

  -- recursive term: everyone reporting to the previous level
  SELECT e.id, e.name, e.manager_id, org.depth + 1
  FROM employees e
  JOIN org ON e.manager_id = org.id
)
SELECT repeat('  ', depth - 1) || name AS tree, depth
FROM org
ORDER BY depth;
```

প্রতিটা iteration গত রাউন্ডে আবিষ্কৃত row-গুলোর সরাসরি report খুঁজে বের করে, একটা `depth` কাউন্টার জমা করতে থাকে। কোনো নতুন row তৈরি না হলে recursion স্বয়ংক্রিয়ভাবে থেমে যায় — অর্থাৎ যখন আপনি leaf-এ পৌঁছান।

<Callout type="warning">

**অসীম লুপ থেকে সাবধান থাকুন।** আপনার ডেটায় যদি একটা cycle থাকে (A ম্যানেজ করে B-কে, B ম্যানেজ করে A-কে), একটা সরল recursive CTE কখনো থামে না। একটা array-তে visited node ট্র্যাক করুন, অথবা `UNION` (deduplicating) ফর্ম ব্যবহার করুন, অথবা নতুন Postgres-এ পুনরাবৃত্তি শনাক্ত করে থামাতে একটা `CYCLE` clause যোগ করুন।

</Callout>

একটা কমন সঙ্গী query হলো "একটা নির্দিষ্ট node-এর _নিচের_ সবকিছু" — join-এর দিক উল্টে দিন (`org.id = e.manager_id` হয়ে যায় `e.manager_id = org.id`) আর root-এর বদলে আপনার কাঙ্ক্ষিত node-এ anchor শুরু করুন।

## কোনটা বেছে নেবেন

- **Scalar subquery** — যখন আপনার inline একটা computed value দরকার।
- **`IN` / `EXISTS`** — set membership ফিল্টার; null safety-র জন্য `EXISTS` / `NOT EXISTS` বেছে নিন।
- **Derived table / CTE** — যখন আপনার আরেকটা query-র ফলাফল query করা দরকার; পড়ার-সুবিধা আর পুনর্ব্যবহারে CTE জেতে।
- **Recursive CTE** — hierarchical আর graph traversal-এর জন্য একমাত্র স্ট্যান্ডার্ড SQL টুল।

## রিক্যাপ

Subquery আপনাকে ধাপে ধাপে query রচনা করতে দেয়; CTE সেই ধাপগুলোকে নাম দেয় আর জটিল লজিককে পড়ার-উপযোগী করে; recursive CTE tree আর graph traversal খুলে দেয়। `NOT IN`-with-null-এর ফাঁদ খেয়াল রাখুন আর বড় টেবিলে correlated subquery-র দিকে নজর রাখুন। এরপর আমরা index আর query plan দিয়ে এই সবকিছুকে _দ্রুত_ বানাব।
