---
title: 'Transactions ও Isolation Level'
subtitle: 'ACID, চারটা isolation level, MVCC, আর যে lock ও deadlock concurrent write সঠিক রাখে।'
chapter: 6
level: 'advanced'
readingTime: '18 মিনিট'
topics: ['acid', 'isolation', 'mvcc', 'locking']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনেমা হলের কাউন্টারে একটাই বাঁধানো সিট-বুকিং খাতা, আর দুই ক্লার্ক — সিনা আর খোয়ারিজমি — একই শো-এর জন্য একসাথে টিকিট কাটছে। খোয়ারিজমি একজন খদ্দেরের জন্য C4 সিটটা পেন্সিলে টুকে রাখল, কিন্তু টাকা এখনো হাতে পায়নি, তাই বুকিংটা এখনো পাকা না। সিনা যদি সেই আধা-লেখা পেন্সিল এন্ট্রি দেখে ধরে নেয় C4 বুক হয়ে গেছে, আর তারপর খদ্দের চলে যাওয়ায় খোয়ারিজমি দাগটা রাবার দিয়ে মুছে ফেলে — তাহলে সিনা এমন এক তথ্যের ওপর কাজ করল যা আসলে কখনো পাকাই হয়নি। নিয়ম যদি হয় "আরেকজনের পেন্সিল দাগ পাকা কালি না হওয়া পর্যন্ত পড়া যাবে না", তাহলে এই সমস্যাটাই হয় না।

আরেকটা ঝামেলা আছে। সিনা "সামনের সারিতে কয়টা সিট খালি" গুনে দেখল পাঁচটা, খদ্দেরকে বলল দাম হিসাব করতে দাঁড়ান — এর ফাঁকে খোয়ারিজমি ওই সারিরই একটা সিট পাকা করে ফেলল। সিনা আবার গুনে দেখল এবার চারটা; মাঝপথে সংখ্যাটা তার পায়ের নিচ থেকে বদলে গেল। আবার ধরুন সিনা "ব্যালকনির সব খালি সিট" একবার তালিকা করে রাখল, আর তার কাজ শেষ হওয়ার আগেই খোয়ারিজমি ব্যালকনিতে একটা একদম নতুন বুকিং ঢুকিয়ে দিল — সিনা যে তালিকা আগে বানিয়েছিল তাতে হঠাৎ একটা বাড়তি সারি গজিয়ে উঠল, যেটা সে গোনার সময় ছিলই না।

গল্পের এই তিনটা গোলমালই ডেটাবেসের তিনটা anomaly। খোয়ারিজমির মোছা-যাওয়া পেন্সিল দাগ পড়ে ফেলা = **dirty read** (commit না হওয়া ডেটা পড়া)। সিনা যে সিটকে খালি গুনেছিল সেটা তার মাঝপথে বদলে যাওয়া = **non-repeatable read** (একই row দ্বিতীয়বার পড়লে ভিন্ন value)। আগে থেকে তালিকা করা সারিতে নতুন বুকিং গজানো = **phantom** (আগের একটা range-এ নতুন row হাজির হওয়া)। কড়া নিয়ম — যেমন সিনা যতক্ষণ কাজ করছে ততক্ষণ পুরো খাতার পাতাটা তালা মেরে রাখা — এই সবগুলো ঠেকায়, সেটাই বেশি শক্তিশালী isolation level (`serializable`-এর দিকে যাওয়া)। কিন্তু তালা মারলে অন্য ক্লার্ককে দাঁড়িয়ে অপেক্ষা করতে হয়, সবার কাজ ধীর হয় — এটাই isolation বনাম concurrency-র ট্রেড-অফ। বাস্তবে দুটো ব্যাংক টেলার একই account balance একসাথে বদলানোর সময় ডেটাবেস ঠিক এই নিয়মগুলোই আরোপ করে; `read committed` ডিফল্ট রেখে দ্রুত রাখা হয়, আর যেখানে সঠিকতা সবচেয়ে জরুরি সেখানে কড়া level বেছে নিয়ে গতি কমানো হয়।

## Transaction জিনিসটা কী

একটা **transaction** কয়েকটা statement-কে একটা all-or-nothing একক-এ দলবদ্ধ করে। ক্লাসিক উদাহরণ হলো একটা ব্যাংক transfer: একটা account থেকে debit, আরেকটাতে credit। দুটোর মাঝখানে যদি সিস্টেম ক্র্যাশ করে, তাহলে আপনার এমন অবস্থায় পড়া _উচিত নয়_ যেখানে টাকা debit হয়েছে কিন্তু কখনো credit হয়নি। একটা transaction গ্যারান্টি দেয় যে হয় দুটোই ঘটবে নয়তো একটাও না।

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;     -- both changes become permanent together
```

`COMMIT`-এর আগে যদি কিছু ভুল হয়, আপনি `ROLLBACK` করেন এবং ডেটাবেস এমন হয়ে যায় যেন কিছুই ঘটেনি:

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  -- ...check fails, abort...
ROLLBACK;   -- the debit is undone
```

## ACID

Transaction চারটা গ্যারান্টি দেয়, সংক্ষেপে **ACID**:

- **Atomicity** — সব statement একসাথে commit হয় নয়তো একটাও না। কোনো আংশিক transaction নেই।
- **Consistency** — একটা transaction ডেটাবেসকে একটা valid state থেকে আরেকটা valid state-এ নিয়ে যায়; constraint (foreign key, check) কখনো লঙ্ঘিত অবস্থায় থাকে না।
- **Isolation** — concurrent transaction একে অপরের উপর পা মাড়ায় না; প্রতিটা এমনভাবে চলে _যেন_ ডেটাবেসটা তার একার (এর মাত্রাটাই হলো _isolation level_)।
- **Durability** — একবার `COMMIT` return করলে, ডেটা ক্র্যাশ আর power loss-এও টিকে থাকে (Postgres এটা একটা write-ahead log দিয়ে অর্জন করে, db-internals-এ কভার করা)।

Isolation-টাই সূক্ষ্মটা, কারণ নিখুঁত isolation (প্রতিটা transaction সত্যিকারভাবে serial) ব্যয়বহুল। SQL দুর্বলতর level সংজ্ঞায়িত করে যা কিছুটা isolation-এর বদলে concurrency দেয়।

## Concurrency Anomaly

দুর্বলতর isolation নির্দিষ্ট কিছু _anomaly_-কে অনুমতি দেয় — transaction interleave হওয়ার কারণে ঘটা অবাক করা ফলাফল। SQL standard তিনটার নাম দেয়:

- **Dirty read** — আপনি এমন একটা row পড়েন যা আরেকটা transaction modify করেছে কিন্তু _এখনো commit করেনি_। সেই transaction যদি roll back করে, তাহলে আপনি এমন ডেটার উপর কাজ করলেন যা কখনো আনুষ্ঠানিকভাবে ছিলই না।
- **Non-repeatable read** — আপনি একটা row পড়েন, আরেকটা transaction তাতে একটা _update_ commit করে, আপনি _একই_ transaction-এ আবার সেটা পড়েন এবং একটা ভিন্ন value পান।
- **Phantom read** — আপনি একটা query চালান (`WHERE status = 'pending'`), আরেকটা transaction একটা নতুন ম্যাচিং row _insert_ করে commit করে, আপনি query-টা আবার চালান এবং একটা নতুন "phantom" row হাজির হয়।

একটা চতুর্থটা, **lost update**, ঘটে যখন দুটো transaction একটা value পড়ে, দুটোই সেটা modify করে, এবং দ্বিতীয়টা প্রথমটার পরিবর্তন overwrite করে দেয়।

## চারটা Isolation Level

প্রতিটা level ক্রমান্বয়ে আরো বেশি anomaly _নিষিদ্ধ_ করে। দুর্বলতম থেকে শক্তিশালীতম:

| Level              | Dirty read | Non-repeatable read | Phantom read |
| ------------------ | ---------- | ------------------- | ------------ |
| `READ UNCOMMITTED` | সম্ভব\*    | সম্ভব               | সম্ভব        |
| `READ COMMITTED`   | না         | সম্ভব               | সম্ভব        |
| `REPEATABLE READ`  | না         | না                  | সম্ভব\*\*    |
| `SERIALIZABLE`     | না         | না                  | না           |

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
  -- ...
COMMIT;
```

কয়েকটা PostgreSQL-নির্দিষ্ট নোট (উপরে চিহ্নিত):

- \*Postgres-এ সত্যিকারের কোনো `READ UNCOMMITTED` নেই — এটা একে `READ COMMITTED` হিসেবে ধরে, তাই dirty read কখনোই ঘটে না।
- \**`REPEATABLE READ`-এ, Postgres-এর MVCC implementation আসলে *এমনকি\* phantom read-ও প্রতিরোধ করে (এটা আপনাকে একটা stable snapshot দেয়), তাই এটা standard যা চায় তার চেয়ে শক্তিশালী।
- `READ COMMITTED` হলো **ডিফল্ট**, আর বেশিরভাগ অ্যাপ্লিকেশনের জন্য একটা ভালো পছন্দ।
- Postgres-এ `SERIALIZABLE` Serializable Snapshot Isolation (SSI) ব্যবহার করে: এটা transaction-গুলোকে concurrent-ভাবে চলতে দেয় কিন্তু একটাকে serialization error দিয়ে abort করে যদি তাদের সমন্বয় কোনো serial order-এ ঘটতে _না পারত_। আপনাকে retry-এর জন্য প্রস্তুত থাকতে হবে।

<Callout type="info">

**`READ COMMITTED` মানে প্রতিটা statement একটা তাজা snapshot দেখে।** এই level-এ একটা transaction-এর ভেতরে, দুটো একই রকম `SELECT` ভিন্ন ডেটা return করতে পারে যদি মাঝখানে আরেকটা transaction commit করে থাকে। যদি আপনার একাধিক statement জুড়ে একটা consistent view লাগে (একটা report, একটা multi-step হিসাব), তাহলে `REPEATABLE READ` ব্যবহার করুন যাতে গোটা transaction একটাই frozen snapshot দেখে।

</Callout>

## MVCC: Postgres কীভাবে Read Lock এড়ায়

PostgreSQL isolation implement করে **MVCC** দিয়ে — Multi-Version Concurrency Control। read-এর জন্য row lock করার বদলে, এটা প্রতিটা row-এর _একাধিক version_ রাখে। একটা `UPDATE` জায়গায় বসে overwrite করে না; এটা একটা নতুন row version লেখে এবং পুরোনোটাকে expired হিসেবে মার্ক করে। প্রতিটা transaction তার snapshot অনুযায়ী যে version current ছিল সেটা দেখে।

প্রধান সুবিধা: **reader কখনো writer-কে block করে না, আর writer কখনো reader-কে block করে না।** একটা দীর্ঘ analytics query একটা consistent snapshot দেখে যখন তার চারপাশে write চলতে থাকে। খরচটা হলো _bloat_ — মৃত row version জমে এবং `VACUUM` প্রসেস দিয়ে সেগুলো পরিষ্কার করতে হয় (autovacuum স্বয়ংক্রিয়ভাবে চলে, কিন্তু বেশি-update হওয়া টেবিলের নজর দরকার)।

```text
Time →
  T1: BEGIN (snapshot taken) ... SELECT balance  → sees 100 (old version)
  T2:        UPDATE balance=150; COMMIT          → writes new version
  T1: SELECT balance again (REPEATABLE READ)     → still sees 100
```

## Write-এর জন্য Lock

Read MVCC ব্যবহার করে, কিন্তু _write_-এর এখনো lock লাগে দুটো transaction-কে একই row একসাথে modify করা থেকে ঠেকাতে। আপনি যখন একটা row `UPDATE` বা `DELETE` করেন, Postgres একটা **row-level lock** নেয়; একটা দ্বিতীয় transaction একই row লিখতে চাইলে প্রথমটা commit বা roll back করা পর্যন্ত _অপেক্ষা করে_।

Lost update এড়াতে আর read-modify-write সিকোয়েন্স সমন্বয় করতে আপনি row explicitly lock করতে পারেন:

```sql
BEGIN;
  SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;  -- lock the row
  -- compute new balance in app code...
  UPDATE accounts SET balance = :new WHERE id = 1;
COMMIT;
```

`FOR UPDATE` সেই row-এ অন্য writer (আর অন্য `FOR UPDATE` reader)-দের block করে যতক্ষণ না আপনি commit করেন, critical section-টা serialize করে। `FOR SHARE` একটা দুর্বলতর, shared lock।

<Callout type="tip">

**পারলে ডেটাবেসকেই হিসাব করতে দিন।** `UPDATE accounts SET balance = balance - 100 WHERE id = 1` row level-এ atomic এবং read-then-write race পুরোপুরি এড়ায় — কোনো explicit lock দরকার নেই। `FOR UPDATE`-এর দিকে হাত বাড়ান শুধু তখন যখন নতুন value এমন লজিকের উপর নির্ভর করে যা অবশ্যই application code-এ থাকতে হবে।

</Callout>

## Deadlock

একটা **deadlock** ঘটে যখন দুটো transaction প্রত্যেকে এমন একটা lock ধরে রাখে যা অন্যটার দরকার, একটা cycle তৈরি করে:

```text
T1: locks row A ... wants row B
T2: locks row B ... wants row A
   → neither can proceed
```

Postgres স্বয়ংক্রিয়ভাবে deadlock শনাক্ত করে এবং একটা transaction-কে একটা `deadlock detected` error দিয়ে মেরে ফেলে যাতে অন্যটা চলতে পারে। শিকারটাকে retry করতে হয়। Deadlock _প্রতিরোধ_ করতে:

- **একটা consistent order-এ lock নিন।** যদি প্রতিটা transaction row-গুলো ascending id order-এ lock করে, কোনো cycle তৈরি হতে পারে না।
- **Transaction ছোট রাখুন।** একটা transaction যত কম সময় lock ধরে রাখে, conflict-এর window তত ছোট।
- **কম row স্পর্শ করুন, আর দেরিতে lock করুন।** আগে read-only কাজ করুন, `COMMIT`-এর যতটা সম্ভব কাছে write lock নিন।

<Callout type="warning">

**সবসময় retry করতে প্রস্তুত থাকুন।** `SERIALIZABLE` serialization failure আর deadlock শিকার — দুটোই error হিসেবে হাজির হয় যা আপনার অ্যাপ্লিকেশনকে catch করে retry করতে হবে। Transaction লজিককে একটা ছোট backoff-সহ একটা retry loop-এ মুড়ে দিন। যে code ধরে নেয় একটা transaction সবসময় প্রথম চেষ্টাতেই সফল হবে, সেটা load-এর নিচে মাঝেমধ্যে fail করবে।

</Callout>

## ব্যবহারিক নির্দেশনা

- ডিফল্ট `READ COMMITTED` দিয়ে শুরু করুন; `REPEATABLE READ`-এ যান যখন একটা transaction-এর একটা stable multi-statement view লাগে, আর `SERIALIZABLE`-এ যখন concurrency-র নিচে সঠিকতা সবচেয়ে জরুরি এবং আপনি retry যোগ করেছেন।
- Transaction যতটা সম্ভব ছোট রাখুন — কখনো একটা network call বা user think-time জুড়ে একটা open রাখবেন না।
- কখনো একটা `BEGIN`-কে একটা মিলে যাওয়া `COMMIT`/`ROLLBACK` ছাড়া ফেলে রাখবেন না; একটা idle-in-transaction connection lock ধরে রাখে এবং `VACUUM` block করে।

## Recap

Transaction আপনাকে ACID দেয়: atomic, consistent, isolated, durable কাজের একক। Isolation level dirty, non-repeatable, আর phantom read থেকে সুরক্ষার বিনিময়ে concurrency ট্রেড করে। Postgres MVCC ব্যবহার করে যাতে read কখনো write-কে block না করে, write-এর জন্য row lock নেয়, আর deadlock শনাক্ত করে — বাকিটা আপনার উপর ছেড়ে দেয়: order-এ lock নেওয়া, transaction ছোট রাখা, আর conflict-এ retry করা। পরে আমরা window function দিয়ে analytical শক্তি যোগ করব।
