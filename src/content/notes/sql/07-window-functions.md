---
title: 'Window Functions'
subtitle: 'অ্যাগ্রিগেটের মতো ক্যালকুলেশন, কিন্তু প্রতিটি row রেখে দেয় — ranking, running total আর row-to-row তুলনা।'
chapter: 7
level: 'advanced'
readingTime: '16 মিনিট'
topics: ['window function', 'partition by', 'ranking']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা আপা একটা স্কুলে ক্লাস টিচার। পরীক্ষার পর তিনি চাইলে শুধু প্রতিটা ক্লাসের গড় নম্বরটা একটা কাগজে লিখে রাখতে পারতেন — "ক্লাস সিক্সের গড় ৭২, ক্লাস সেভেনের গড় ৬৮"। কিন্তু তাতে সিনা-খোয়ারিজমি-প্রতিটা ছাত্রের নিজের অবস্থান হারিয়ে যায়, পুরো ক্লাস মিলে একটা লাইনে গুটিয়ে যায়। এমন সারাংশ দিয়ে কোন ছাত্র কোথায় দাঁড়িয়ে আছে সেটা বোঝা যায় না।

তাই ফাতিমা আপা অন্যভাবে করেন। তিনি একটা ছাত্রও বাদ দেন না — প্রতিটা ছাত্রের নামের পাশে তার নিজের সারিতেই লিখে দেন সে তার _নিজের ক্লাসের ভেতরে_ কত নম্বরে আছে। সিনা সিক্সের মধ্যে ৩য়, খোয়ারিজমি সেভেনের মধ্যে ১ম — একজনের rank অন্য ক্লাসের কারো সাথে মেশে না, প্রতি ক্লাস আলাদা করে গোনা হয়। পাশাপাশি তিনি একটা খাতায় আদায় হওয়া বেতনের একটা চলমান যোগফলও রাখেন — প্রতিটা এন্ট্রির পাশে "এ পর্যন্ত মোট কত জমা হলো" সেই running total, নিচের দিকে নামতে নামতে বাড়তেই থাকে।

ফাতিমা আপার এই কাজটাই আসলে **window function**। ক্লাস অনুযায়ী rank দেওয়াটা হলো `PARTITION BY class` করে `RANK()` — প্রতিটা ক্লাস একটা আলাদা window, তার ভেতরেই ছাত্রকে rank করা হয়, অথচ কোনো ছাত্রের row মুছে যায় না। বেতনের খাতার চলমান যোগফলটাই **running total**। এর উল্টোদিকে `GROUP BY` হলো শুধু গড় লিখে রাখা — সবাইকে এক লাইনে collapse করে ফেলা। মূল পার্থক্যটা এখানেই: window function হিসাব করে সম্পর্কিত row-গুলোর উপর দিয়ে, কিন্তু **প্রতিটা row রেখে দেয়**। বাস্তবে গেমের leaderboard-এ প্রতি অঞ্চলের ভেতরে খেলোয়াড়ের rank, কিংবা ব্যাংকের statement-এ প্রতি লেনদেনের পাশে চলতি ব্যালেন্স — সবই ঠিক এই জিনিস।

## Window Functions যে ফাঁকটা পূরণ করে

`GROUP BY` row-গুলোকে collapse করে ফেলে: প্রতি customer-এর দশটা order মিলে একটা summary row হয়ে যায়। কিন্তু অনেক সময় আপনি এক সেট row-এর _উপর দিয়ে_ একটা ক্যালকুলেশন চান, অথচ **প্রতিটি আলাদা row রেখে দিতে চান** — প্রতিটি order-কে তার customer-এর ভেতরে rank করা, প্রতিটি row-এর total-এর মধ্যে অংশ দেখানো, প্রতিটি row-কে আগেরটার সাথে তুলনা করা। ঠিক এই কাজটাই **window functions** করে।

একটা window function দেখতে অ্যাগ্রিগেটের মতোই, তবে সাথে একটা `OVER` clause লাগানো থাকে। এই `OVER` clause যে "window" বা row-গুলোর সেট function দেখবে সেটা ঠিক করে দেয়, _অথচ_ result collapse করে না।

```sql
SELECT
  customer_id,
  amount,
  SUM(amount) OVER (PARTITION BY customer_id) AS customer_total
FROM orders;
```

প্রতিটি order row ফেরত আসে, প্রতিটার সাথে তার customer-এর total যুক্ত করা থাকে। এর সাথে `GROUP BY`-এর তুলনা করুন, যেটা প্রতি customer-এ একটা করে row ফেরত দিত। একই `SUM`, কিন্তু shape একদম আলাদা।

## OVER-এর গঠন

`OVER` clause-এ সর্বোচ্চ তিনটা অংশ থাকতে পারে:

```sql
function(...) OVER (
  PARTITION BY <columns>   -- split rows into independent groups
  ORDER BY    <columns>    -- order within each partition
  <frame clause>           -- which rows around the current row count
)
```

- **`PARTITION BY`** row-গুলোকে group-এ ভাগ করে; প্রতি group-এর জন্য function আবার নতুন করে শুরু হয়। এটা বাদ দিলে পুরো result একটাই partition হয়ে যায়।
- **`ORDER BY`** একটা partition-এর ভেতরে row-গুলো order করে — ranking, running total আর `LAG`/`LEAD`-এর জন্য এটা অপরিহার্য।
- **Frame clause** window-কে _current row-এর সাপেক্ষে_ একটা row-এর range-এ সংকুচিত করে (নিচে আরও আছে)।

একটা খালি `OVER ()` মানে "পুরো result set-টাই একটা order-বিহীন window" — "প্রতিটি row-এর grand total-এর মধ্যে শতকরা কত অংশ" বের করতে এটা কাজে লাগে:

```sql
SELECT amount,
       amount / SUM(amount) OVER () AS pct_of_total
FROM orders;
```

## Ranking Functions

তিনটা function একটা order করা partition-এর ভেতরে position বসিয়ে দেয়:

```sql
SELECT
  customer_id, amount,
  ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rn,
  RANK()       OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rnk,
  DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS dense
FROM orders;
```

এগুলোর পার্থক্য শুধু **tie** (সমান মান) হলে কীভাবে সামলায় সেখানে:

| Function       | Tie হলে আচরণ                              | উদাহরণ sequence |
| -------------- | ----------------------------------------- | --------------- |
| `ROW_NUMBER()` | সবসময় আলাদা, tie যেকোনোভাবে ভাঙে         | 1, 2, 3, 4      |
| `RANK()`       | Tie একই rank পায়, তারপর নম্বর _skip_ করে | 1, 2, 2, 4      |
| `DENSE_RANK()` | Tie একই rank পায়, কোনো gap _নেই_         | 1, 2, 2, 3      |

<Callout type="tip">

**"প্রতি group-এ Top N" হলো এর সবচেয়ে জোরালো use case।** একটা `ROW_NUMBER()` query-কে subquery-তে মুড়ে দিন আর filter করুন:

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY customer_id ORDER BY amount DESC
  ) AS rn
  FROM orders
) t
WHERE rn <= 3;   -- the 3 biggest orders per customer
```

আপনি `WHERE`-এ সরাসরি কোনো window function-এর উপর filter করতে পারবেন না (এটা `SELECT`-এ, অর্থাৎ `WHERE`-এর পরে হিসাব হয়), তাই subquery লাগবেই।

</Callout>

## LAG আর LEAD: প্রতিবেশী দেখা

`LAG` আর `LEAD` partition-এর ভেতরে current row-এর _আগের_ বা _পরের_ কোনো row থেকে মান টেনে আনে — period-over-period তুলনার জন্য একদম আদর্শ:

```sql
SELECT
  month,
  revenue,
  LAG(revenue) OVER (ORDER BY month)  AS prev_month,
  revenue - LAG(revenue) OVER (ORDER BY month) AS mom_change
FROM monthly_revenue;
```

`LAG(revenue)` আগের row-এর revenue ফেরত দেয়; বিয়োগ করলে month-over-month পরিবর্তন পাওয়া যায়। দুটোতেই ঐচ্ছিক argument দেওয়া যায় — `LAG(revenue, 1, 0)` মানে "১ row পেছনে যাও, আগের কোনো row না থাকলে default 0 ধরো" (যেমন প্রথম month-এ)। `LEAD` একই জিনিস, তবে সামনের দিকে তাকায়।

## Running Total আর Frame Clause

কোনো window function-এ `ORDER BY` থাকলে কিন্তু কোনো explicit frame না থাকলে, default frame হয় `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — partition-এর শুরু থেকে current row পর্যন্ত সবকিছু। এই default-টাই ঠিক যা একটা **running total** তৈরি করে:

```sql
SELECT
  created_at,
  amount,
  SUM(amount) OVER (ORDER BY created_at) AS running_total
FROM orders;
```

প্রতিটি row-এর `running_total` হলো সেটা সহ তার আগ পর্যন্ত প্রতিটা order-এর যোগফল। current row আর তার আগের দুটো row নিয়ে একটা **moving average** বের করতে, `ROWS` দিয়ে frame-টা explicitly বলে দিন:

```sql
SELECT
  created_at,
  amount,
  AVG(amount) OVER (
    ORDER BY created_at
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  ) AS moving_avg_3
FROM orders;
```

Frame clause-এর দুটো সাধারণ রূপ আছে:

- **`ROWS`** — নির্দিষ্ট সংখ্যক physical row গোনে (`2 PRECEDING` = উপরের দুটো row)।
- **`RANGE`** — `ORDER BY` column-এর _মান_ অনুযায়ী row গোনে (একই মানের সব row একটা peer group)।

<Callout type="warning">

**Tie হলে `ROWS` আর `RANGE`-এর আচরণ আলাদা।** `RANGE`-এ যে row-গুলোর `ORDER BY` মান একই, সেগুলোকে একটা peer group ধরা হয়, তাই একটা running total কয়েকটা সমান-মানের row একবারে "টপকে" যেতে পারে। `ROWS`-এ প্রতিটা physical row আলাদা। কঠোরভাবে row-by-row running total চাইলে `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` ব্যবহার করুন।

</Callout>

## আরও কিছু কাজের Window Function

- **`FIRST_VALUE(col)` / `LAST_VALUE(col)`** — frame-এর প্রথম/শেষ মান (frame-এর দিকে খেয়াল রাখবেন: `LAST_VALUE` দিয়ে "partition-এর শেষ" বোঝাতে হলে একটা explicit পূর্ণ frame লাগে)।
- **`NTH_VALUE(col, n)`** — frame-এর n-তম মান।
- **`NTILE(n)`** — partition-কে `n`টা মোটামুটি সমান bucket-এ ভাগ করে, যেমন quartile-এর জন্য `NTILE(4)`।
- **`PERCENT_RANK()` / `CUME_DIST()`** — ভগ্নাংশ হিসেবে relative rank, percentile analysis-এর জন্য।

## WINDOW দিয়ে Window-এর নাম দেওয়া

যখন কয়েকটা function একই `OVER` spec ব্যবহার করে, তখন পুনরাবৃত্তি এড়াতে একটা `WINDOW` clause দিয়ে সেটা একবারই define করে দিন:

```sql
SELECT
  customer_id, amount,
  RANK()       OVER w AS rnk,
  SUM(amount)  OVER w AS running
FROM orders
WINDOW w AS (PARTITION BY customer_id ORDER BY amount DESC);
```

## একটা মানসিক মডেল

একটা window function-কে দুই ধাপে চলা হিসেবে ভাবুন। প্রথমে engine স্বাভাবিক result set তৈরি করে (`FROM`/`WHERE`/`GROUP BY`-এর পরে)। তারপর প্রতিটি row-এর জন্য সে সেই row-এর সম্পর্কিত row-গুলোর _window_-টা দেখে function হিসাব করে — মান যুক্ত করে, কখনো collapse করে না। যেহেতু window function `WHERE` আর `GROUP BY`-এর _পরে_ কিন্তু চূড়ান্ত `ORDER BY`-এর _আগে_ চলে, তাই আপনি এদের output একটা বাইরের query-তে filter করেন, ঠিক যেমন উপরের top-N উদাহরণে দেখা গেল।

## রিক্যাপ

Window functions সম্পর্কিত row-গুলোর উপর দিয়ে হিসাব করে, অথচ প্রতিটি row রেখে দেয়। `PARTITION BY` group করে, `ORDER BY` ক্রম ঠিক করে, আর frame clause কোন row-গুলো বিবেচনায় আসবে তার সীমা বেঁধে দেয়। top-N আর leaderboard-এর জন্য ranking function, period তুলনার জন্য `LAG`/`LEAD`, আর running total ও moving average-এর জন্য order করা `SUM`/`AVG` ব্যবহার করুন। এরা গোটা এক পরিবার self-join আর correlated subquery-কে একটা পড়ার-মতো clause দিয়ে বদলে দেয়। এরপর আমরা সবকিছু একসাথে জুড়ে query optimization-এ যাব।
