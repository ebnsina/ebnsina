---
title: 'Joins'
subtitle: 'একাধিক টেবিল থেকে row একসাথে জোড়া দেওয়া — যে অপারেশন relational database-কে relational বানায়।'
chapter: 3
level: 'intermediate'
readingTime: '16 মিনিট'
topics: ['join', 'inner join', 'outer join']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমির বিয়ের অনুষ্ঠান, আর সব সামলাচ্ছে ইভেন্ট অর্গানাইজার সিনা। তার হাতে দুইটা লিস্ট। একটা হলো **নিমন্ত্রণের লিস্ট** — কাকে কাকে দাওয়াত দেওয়া হয়েছে, প্রতিটা মেহমানের নাম। আরেকটা হলো **গিফট/RSVP লিস্ট** — কে কে এসে হাজিরা দিয়েছে আর কী গিফট দিয়েছে, সেখানেও মেহমানের নাম লেখা। সিনার কাজ হলো নাম ধরে ধরে দুই লিস্ট মিলিয়ে দেখা।

সিনা যখন শুধু সেই মেহমানদের বের করে যাদের নাম **দুই লিস্টেই আছে** — মানে যাকে দাওয়াত দেওয়া হয়েছিল আর যে সত্যিই এসে গিফটও দিয়েছে — তখন ফাতিমা (দাওয়াতপ্রাপ্ত, কিন্তু আসেনি) আর একজন অচেনা লোক (যে গিফট দিয়ে গেছে অথচ দাওয়াতের লিস্টেই নাম নেই) — দুইজনই বাদ পড়ে যায়। আবার সিনা যখন থ্যাংক-ইউ কার্ড লিখতে বসে, তখন সে **প্রতিটা দাওয়াতপ্রাপ্ত মেহমানকে** ধরে রাখে, আর কারো গিফট পেলে সেটা নামের পাশে বসিয়ে দেয়; যে আসেনি, তার গিফটের ঘরটা ফাঁকাই রেখে দেয়।

এই গল্পটাই আসলে **JOIN**। মেহমানের নাম হলো সেই **key**, যা দিয়ে দুই লিস্ট (দুইটা table) মেলানো হয়। শুধু দুই লিস্টে কমন নামগুলো বের করাটা হলো **INNER JOIN** — কোনো এক পাশে ম্যাচ না থাকলে সেই row বাদ। আর প্রতিটা দাওয়াতপ্রাপ্ত মেহমানকে রেখে, গিফট থাকলে জুড়ে দিয়ে, না থাকলে ঘর ফাঁকা রাখাটা হলো **LEFT JOIN** — বাঁ দিকের সব row থাকে, ডান দিকে ম্যাচ না পেলে **NULL**। বাস্তবে ঠিক এভাবেই আপনি `users` আর `orders` মেলান: INNER JOIN দিলে শুধু যারা অর্ডার করেছে তারা আসে, আর LEFT JOIN দিলে সব ইউজার আসে — যারা কখনো অর্ডার করেনি তাদের অর্ডারের কলাম NULL হয়ে থাকে।

## Join কেন দরকার

ভালো schema ডিজাইন ডুপ্লিকেশন এড়াতে ডেটাকে একাধিক টেবিলে ছড়িয়ে দেয়: customer-রা থাকে `customers`-এ, তাদের order থাকে `orders`-এ, আর প্রতিটি order একটা `customer_id` দিয়ে তার customer-এর দিকে ফিরে দেখায়। ওই পয়েন্টারটাই হলো **foreign key**। একটা **join** সেই টেবিলগুলোকে আবার সেলাই করে জোড়া দেয়, যাতে আপনি জিজ্ঞেস করতে পারেন "প্রতিটা order দেখাও, _সাথে_ তার customer-এর নামসহ"।

আমাদের দুইটা টেবিল:

```text
customers                  orders
+----+----------+          +----+-------------+--------+
| id | name     |          | id | customer_id | amount |
+----+----------+          +----+-------------+--------+
| 10 | Lubna    |          |  1 |     10      | 49.00  |
| 20 | Nusayba  |          |  2 |     10      | 12.50  |
| 30 | Harun    |          |  3 |     20      | 80.00  |
+----+----------+          |  4 |     99      | 15.00  |  <- orphan: no customer 99
                           +----+-------------+--------+
```

খেয়াল করুন customer 30 (Harun)-এর কোনো order নেই, আর order 4 এমন একটা customer 99-কে রেফার করছে যার অস্তিত্বই নেই। ঠিক এই edge case-গুলোতেই join-এর _type_ ভেদে আচরণ আলাদা হয়।

## INNER JOIN

একটা inner join শুধু সেই row-গুলো ফেরত দেয় যেগুলো **দুই দিকেই** ম্যাচ করে:

```sql
SELECT o.id, c.name, o.amount
FROM orders o
INNER JOIN customers c ON c.id = o.customer_id;
```

| o.id | name    | amount |
| ---- | ------- | ------ |
| 1    | Lubna   | 49.00  |
| 2    | Lubna   | 12.50  |
| 3    | Nusayba | 80.00  |

Harun বাদ পড়ে যায় (কোনো order নেই) আর order 4 বাদ পড়ে যায় (কোনো ম্যাচিং customer নেই)। `INNER` হলো ডিফল্ট — আপনি শুধু `JOIN` লিখলেই হয়। এখানে `o` আর `c` হলো **table alias**, যা multi-table query-কে পড়ার উপযোগী রাখে।

## LEFT JOIN (এবং RIGHT)

একটা `LEFT JOIN` **left টেবিলের প্রতিটা row** রেখে দেয়, আর যেখানে ম্যাচ নেই সেখানে ডান দিকটা `NULL` দিয়ে ভরে দেয়:

```sql
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id;
```

| name    | order_id | amount |
| ------- | -------- | ------ |
| Lubna   | 1        | 49.00  |
| Lubna   | 2        | 12.50  |
| Nusayba | 3        | 80.00  |
| Harun   | _NULL_   | _NULL_ |

এখন Harun দেখা যাচ্ছে, তবে তার order কলামগুলো null — এটাই তো পুরো ব্যাপারটা। `LEFT JOIN` উত্তর দেয় "সব customer, _আর তাদের order যদি থাকে_"। একটা `RIGHT JOIN` হলো এর আয়নার প্রতিচ্ছবি, যা right টেবিলের প্রতিটা row রাখে; বাস্তবে মানুষ টেবিলগুলোর অর্ডার উল্টে দিয়ে `LEFT` ব্যবহার করে, তাই `RIGHT` খুব একটা দেখা যায় না।

<Callout type="tip">

**ম্যাচ নেই এমন row খুঁজে বের করতে** একটা `LEFT JOIN`-কে একটা `IS NULL` ফিল্টারের সাথে মিলিয়ে দিন — খুবই কমন, খুবই কাজের একটা প্যাটার্ন:

```sql
SELECT c.name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;   -- customers who never ordered
```

</Callout>

## FULL OUTER JOIN

একটা `FULL OUTER JOIN` **দুই দিকেরই** ম্যাচ-না-হওয়া row রেখে দেয়:

```sql
SELECT c.name, o.id AS order_id
FROM customers c
FULL OUTER JOIN orders o ON o.customer_id = c.id;
```

আপনি পাবেন Lubna আর Nusayba-এর ম্যাচ হওয়া row, Harun-কে null order সহ, _আর_ order 4-কে null name সহ। এটা হলো left আর full join আচরণের union — reconciliation রিপোর্টের জন্য কাজের, যেখানে আপনি দুই দিকের যেকোনোটার অমিলগুলো সামনে আনতে চান।

## CROSS JOIN

একটা `CROSS JOIN` **Cartesian product** তৈরি করে — কোনো `ON` শর্ত ছাড়াই, left-এর প্রতিটা row ডান দিকের প্রতিটা row-এর সাথে জোড়া লাগানো হয়:

```sql
SELECT s.size, c.color
FROM sizes s
CROSS JOIN colors c;   -- all size/color combinations
```

3টা size আর 4টা color হলে আপনি 12টা row পাবেন। এটা মাঝেমধ্যে ইচ্ছাকৃত হয় (combination তৈরি করা, date grid বানানো) কিন্তু বেশিরভাগ সময় এটা ভুলে join শর্ত বাদ পড়ে যাওয়ার লক্ষণ।

## Join-এর টাইপগুলো এক নজরে

| Join type    | ম্যাচ-না-হওয়া left রাখে?          | ম্যাচ-না-হওয়া right রাখে? |
| ------------ | ---------------------------------- | -------------------------- |
| `INNER`      | না                                 | না                         |
| `LEFT`       | হ্যাঁ                              | না                         |
| `RIGHT`      | না                                 | হ্যাঁ                      |
| `FULL OUTER` | হ্যাঁ                              | হ্যাঁ                      |
| `CROSS`      | প্রযোজ্য নয় — প্রতিটা combination |                            |

## Self-Join

একটা টেবিল নিজের সাথে নিজেই join করতে পারে — যখন কোনো row একই টেবিলের অন্য row-কে রেফার করে তখন এটা কাজে লাগে। একটা `employees` টেবিল কল্পনা করুন যেখানে প্রতিটা row-এর একটা `manager_id` আছে যা আরেকজন employee-এর দিকে ইঙ্গিত করে:

```sql
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;
```

একই ফিজিক্যাল টেবিল দুইবার আসে ভিন্ন ভিন্ন alias সহ (`e` আর `m`), একটা কাজ করছে "employee" হিসেবে আর অন্যটা "তার manager" হিসেবে। `LEFT JOIN` নিশ্চিত করে যে CEO (যার কোনো manager নেই) তবুও দেখা যায়।

## Multi-Table Join

Join স্বাভাবিকভাবেই চেইন হয়। প্রতিটা order line-কে তার product আর customer-এর নামসহ লিস্ট করতে আপনি তিনটা টেবিল join করেন:

```sql
SELECT c.name, p.title, oi.quantity
FROM orders o
JOIN customers c   ON c.id = o.customer_id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p    ON p.id = oi.product_id;
```

ইঞ্জিন এগুলোকে জোড়ায় জোড়ায় সমাধান করে, ধাপে ধাপে কম্বাইন্ড ফলাফল তৈরি করে। সবসময় indexed key কলামের উপর join করুন (chapter 5-এ আলোচনা করা হয়েছে), নাহলে এই query-গুলো দ্রুতই ধীর হয়ে যায়।

## Join-এর ফাঁদ

### Fan-out (row বহুগুণ হয়ে যাওয়া)

আপনি যখন একটা টেবিলকে আরেকটার সাথে join করেন যার _অনেকগুলো_ ম্যাচিং row আছে, তখন ফলাফল বহুগুণ হয়ে যায়। `orders`-কে `order_items`-এর সাথে join করলে প্রতি order-এ নয়, বরং প্রতি item-এ একটা করে row পাওয়া যায়। এরপর আপনি যদি `SUM(o.amount)` করেন, প্রতিটা order-এর amount প্রতি line item-এ একবার করে গোনা হবে — যা টোটালকে ভয়ংকরভাবে ফুলিয়ে দেবে।

```sql
-- WRONG: order amount double-counted by line items
SELECT SUM(o.amount)
FROM orders o
JOIN order_items oi ON oi.order_id = o.id;
```

সমাধান হলো many-side-টাকে join করার _আগেই_ aggregate করা, প্রায়ই একটা subquery বা CTE দিয়ে (chapter 4), অথবা বদলে granular কলামটা (`oi.quantity * oi.price`) sum করা।

<Callout type="warning">

**Fan-out চুপচাপ টোটাল নষ্ট করে দেয়।** এটা কোনো error দেয় না — শুধু দেখতে যুক্তিসঙ্গত মনে হলেও ভুল একটা সংখ্যা ফেরত দেয়। যখনই কোনো join একটা one-to-many সম্পর্ক ছোঁয় আর আপনি aggregate করছেন, থামুন এবং জিজ্ঞেস করুন "আমার ফলাফলে একটা row মানে কী?" grain যদি বদলে গিয়ে থাকে, আপনার sum সন্দেহজনক।

</Callout>

### Join key-তে NULL

`NULL` কখনো `NULL`-এর সমান হয় না, তাই null join key-ওয়ালা row _কোনো_ join টাইপেই কখনো ম্যাচ করে না — এগুলো inner join থেকে ঝরে পড়ে আর outer join-এ null দিয়ে ভরা row তৈরি করে। যদি `customer_id` nullable হয় আর আপনি একটা সম্পর্ক এনফোর্স করতে join-এর উপর নির্ভর করেন, আপনি নীরবে row হারাতে পারেন। Foreign key-এর সাথে `NOT NULL` constraint (chapter 9) এটা উৎসেই ঠেকিয়ে দেয়।

### ON শর্ত ভুলে যাওয়া

`ON` বাদ দিলে (বা ভুল লিখলে) আপনি অজান্তেই একটা cross join লিখে ফেলেছেন, যা একটা বিশাল Cartesian product ফেরত দেবে। যে query-র 1,000 row ফেরত দেওয়ার কথা সেটা হঠাৎ এক মিলিয়ন ফেরত দেয়। কোনো ফলাফল যদি অস্বাভাবিকভাবে বড় হয়, আগে আপনার join শর্তগুলো চেক করুন।

## রিক্যাপ

Inner join ম্যাচগুলো ফেরত দেয়; outer join (`LEFT` / `RIGHT` / `FULL`) ম্যাচ-না-হওয়া row-গুলোকে null সহ রেখে দেয়; cross join সবকিছুকে বহুগুণ করে দেয়। one-to-many সম্পর্কের উপর aggregate করার সময় fan-out-এর দিকে খেয়াল রাখুন, আর মনে রাখুন null key কখনো ম্যাচ করে না। এরপর আমরা subquery আর CTE দিয়ে query-র ভেতরে query বসাব।
