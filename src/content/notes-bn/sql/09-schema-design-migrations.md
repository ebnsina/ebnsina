---
title: 'Schema Design ও Migrations'
subtitle: 'Constraints, normalization, generated columns, এবং zero-downtime পরিবর্তনের জন্য expand/contract প্যাটার্ন।'
chapter: 9
level: 'mastery'
readingTime: '18 মিনিট'
topics: ['schema', 'constraints', 'migrations']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Schema হলো আপনার Contract

Schema ভুল হলে সেটা শুধরে নেওয়া সবচেয়ে ব্যয়বহুল, কারণ এর নিচের সবকিছু — queries, application code, integrations — এর উপর নির্ভর করে, আর ডেটা এর ভেতরে জমতে থাকে। ভালোভাবে ডিজাইন করা একটা schema invalid state-কে _প্রকাশই করা অসম্ভব_ করে তোলে; খারাপ একটা schema খারাপ ডেটাকে ভেতরে ঢুকতে দেয় এবং প্রতিটা reader-কে তার বিরুদ্ধে বাঁচার ব্যবস্থা করতে বাধ্য করে। এই চ্যাপ্টার এমন schema ডিজাইন করা নিয়ে যা নিজের invariant নিজেই enforce করে, এবং production না ভেঙে সেগুলো বদলানো নিয়ে।

## Constraints: Rules-গুলো Database-এ ঠেলে দিন

Constraints database-কে invalid ডেটা reject করতে দেয় — কোন application বা script সেটা লিখছে তা যাই হোক না কেন। শুধু application code-এ ডেটা integrity রক্ষা করার চেষ্টা করা আশাহীন — সবসময় আরেকটা writer থেকে যায়।

```sql
CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers (id),
  status      text   NOT NULL DEFAULT 'pending',
  amount      numeric(12, 2) NOT NULL CHECK (amount >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, created_at)
);
```

Constraint-এর ধরনগুলো:

- **`PRIMARY KEY`** — প্রতিটা row-এর unique, non-null identifier। প্রতিটা টেবিলে একটা থাকা উচিত। যদি না কোনো natural key সত্যিই stable হয়, তাহলে surrogate key (একটা `IDENTITY` integer বা `uuid`) বেছে নিন।
- **`FOREIGN KEY`** (`REFERENCES`) — নিশ্চিত করে `customer_id` একটা আসল `customers` row-কেই point করছে, orphan আটকায়। `ON DELETE` behavior ভেবেচিন্তে বেছে নিন: `RESTRICT` (block), `CASCADE` (children-দেরও delete করে), বা `SET NULL`।
- **`UNIQUE`** — duplicate value নিষিদ্ধ করে (একটা column বা একাধিকের combination)।
- **`CHECK`** — একটা arbitrary boolean rule, যেমন `amount >= 0` বা `status IN ('pending','shipped','cancelled')`।
- **`NOT NULL`** — সবচেয়ে কম ব্যবহৃত constraint; যদি কোনো value সবসময়ই দরকার হয়, সেটা বলে দিন, আর একটা গোটা শ্রেণির null-handling bug একদম মুছে ফেলুন।

<Callout type="tip">

**Constraint হলো এমন documentation যা মিথ্যা বলতে পারে না।** `CHECK (status IN ('pending','shipped','cancelled'))` প্রতিটা ভবিষ্যৎ developer-কে valid status-এর ঠিক সেটটা বলে দেয় _এবং_ সেটা enforce করে। কমেন্ট পুরনো হয়ে যায়; constraint যায় না। যতগুলো invariant প্রকাশ করতে পারেন, সবগুলো encode করুন।

</Callout>

## Normalization বাস্তবে

Normalization ডেটাকে এমনভাবে সাজায় যাতে redundancy দূর হয়, ফলে প্রতিটা fact ঠিক একটা জায়গায় থাকে। ব্যবহারিক মূল বিষয়টা প্রয়োগ করতে formal normal form-গুলো মুখস্থ করার দরকার নেই:

- **1NF** — প্রতিটা column একটা single atomic value ধরে রাখে; একটা field-এ comma দিয়ে আলাদা করা list বা repeating group ঠেসে ঢোকানো নয়।
- **2NF / 3NF** — প্রতিটা non-key column নির্ভর করে _পুরো key-এর উপর, এবং key ছাড়া আর কিছুর উপর নয়_। সোজা কথায়: প্রতিটা order row-তে customer-এর নাম আর address স্টোর করবেন না — `customer_id` স্টোর করুন আর নামটা `customers`-এ রাখুন। নাহলে একটা address আপডেট করা মানে হাজার হাজার order row আপডেট করা, আর সেগুলো অনিবার্যভাবে একে অন্যের সাথে মিলবে না (একটা _update anomaly_)।

লাভটা হলো consistency: প্রতি fact-এর একটাই source of truth। খরচটা হলো read-এর সময় বেশি join। চ্যাপ্টার 8-এ যেমন বলা হয়েছে, শুধু সেখানেই আপনি **আবার denormalize করেন** যেখানে মেপে দেখা একটা read bottleneck সেটাকে justify করে — আগে normalize করুন, denormalize করুন একটা ইচ্ছাকৃত, মাপা exception হিসেবে।

একটা দ্রুত smell test: যদি একটা বাস্তব fact আপডেট করতে অনেক row বদলাতে হয়, তাহলে আপনি under-normalized। যদি একটা সাধারণ প্রশ্নের উত্তর দিতে প্রতিবার ছয়টা টেবিল join করতে হয়, তাহলে সেই access pattern-এর জন্য আপনি হয়তো over-normalized।

## Generated Columns

একটা **generated column** একই row-এর অন্য column থেকে computed হয় এবং স্বয়ংক্রিয়ভাবে স্টোর হয় — আপনি কখনো এতে লেখেন না, আর এটা কখনো drift করতে পারে না:

```sql
CREATE TABLE line_items (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quantity  integer NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  total     numeric(12, 2)
            GENERATED ALWAYS AS (quantity * unit_price) STORED
);
```

`total` সবসময় হুবহু `quantity * unit_price` — database প্রতিটা write-এ এটা পুনরায় হিসাব করে, তাই app code-এ maintain করা denormalized column যেভাবে out of sync হয়ে যেতে পারে, এটা সেভাবে যাওয়া অসম্ভব। আপনি একটা generated column-এ index পর্যন্ত করতে পারেন। (PostgreSQL এখন `STORED` generated column সাপোর্ট করে; value-টা physically স্টোর হয়, read-এর সময় compute হয় না।)

## Schema নিরাপদে বিবর্তন করা

Requirement বদলালে schema-ও বদলাতে হয় — কিন্তু live system মানে ডেটা আছে আর traffic চলছে। মূল টুলটা হলো একটা **migration**: একটা versioned, ordered script যা schema-কে transform করে, source control-এ committed থাকে আর একটা migration tool (Flyway, Alembic, Prisma Migrate, golang-migrate, ইত্যাদি) দিয়ে চালানো হয়।

নিরাপদ migration-এর নীতিগুলো:

- **প্রতিটা migration ছোট, ordered, আর মূলগতভাবে forward-only।** অনেক tool একটা `down`/rollback সাপোর্ট করে, কিন্তু নতুন schema-র নিচে ডেটা একবার বদলে গেলে, সাধারণত rollback করার চেয়ে একটা fix দিয়ে _সামনে_ এগোনো বেশি নিরাপদ।
- **Migration হলো code review-এর artifact।** শুধু application diff নয়, SQL-টাও review করুন। একটা অসতর্ক `ALTER` কয়েক মিনিটের জন্য একটা টেবিল lock করে ফেলতে পারে।
- **Schema পরিবর্তন আর data backfill আলাদা রাখুন।** যে migration একই সাথে structure বদলায় _এবং_ লাখ লাখ row পুনরায় লেখে, সেটা অনেক বেশি সময় ধরে lock ধরে রাখে।

<Callout type="warning">

**কিছু DDL table-level lock নেয়।** PostgreSQL-এ, একটা non-constant default দিয়ে `NOT NULL` column যোগ করা (পুরনো version-এ), একটা column type বদলানো, বা একটা foreign key যোগ করার মতো operation চলাকালীন একটা `ACCESS EXCLUSIVE` lock নিতে পারে যা _সব_ read আর write ব্লক করে দেয়। একটা বড়, busy টেবিলে সেটা একটা outage। সবসময় দেখুন migration lock করে কি না, আর কতক্ষণের জন্য — আর write ব্লক না করে index বানাতে `CREATE INDEX CONCURRENTLY` ব্যবহার করুন।

</Callout>

## Zero-Downtime Migrations: Expand / Contract

পুরনো আর নতুন application code যখন একসাথে চলছে (rolling deploy-এর সময় যেমন চলে) তখন একটা _breaking_ পরিবর্তন করার নিরাপদ উপায় হলো **expand/contract** প্যাটার্ন — একে parallel change-ও বলা হয়। এর তিনটা phase আছে:

1. **Expand.** নতুন structure-টা _additively এবং backward-compatible ভাবে_ যোগ করুন। পুরনো code চলতে থাকে কারণ এটা যেসবের উপর নির্ভর করে তার কিছুই সরানো হয়নি। একটা নতুন nullable column, একটা নতুন টেবিল, একটা নতুন index (concurrently) যোগ করুন।
2. **Migrate & dual-write.** existing row-গুলো batch-এ backfill করুন, আর application code আপডেট করুন যাতে পুরনো আর নতুন _দুটো_ shape-ই লেখে। এই code deploy করুন; এখন প্রতিটা write দুটোকেই sync-এ রাখে। backfill সম্পূর্ণ হয়েছে যাচাই হয়ে গেলে read-গুলো নতুন shape-এ switch করুন।
3. **Contract.** যখন চালু কোনো code আর পুরনো structure read বা write করছে না, তখন সেটা সরিয়ে ফেলুন — পুরনো column, পুরনো টেবিল, compatibility shim-গুলো drop করুন।

বাস্তবে, downtime ছাড়া একটা `email` column-কে `email_address`-এ rename করা:

```sql
-- Phase 1 (Expand): add the new column, nullable, no default rewrite
ALTER TABLE users ADD COLUMN email_address text;

-- Phase 2 (Migrate): backfill in batches, app writes BOTH columns
UPDATE users SET email_address = email
WHERE email_address IS NULL AND id BETWEEN 1 AND 10000;   -- repeat in chunks

-- ...deploy app that reads email_address, writes both...
-- ...add NOT NULL once backfill complete (validate separately)...

-- Phase 3 (Contract): once nothing uses the old column
ALTER TABLE users DROP COLUMN email;
```

মূল অন্তর্দৃষ্টিটা: **rolling ভাবে code deploy থাকা অবস্থায় কখনো এক ধাপে একটা breaking পরিবর্তন করবেন না।** প্রতিটা মুহূর্তে, বর্তমানে চলা পুরনো আর নতুন application version-এর মিশ্রণকে schema-টা এমন একটা state-এ পেতে হবে যা সে বোঝে। Expand/contract সেটা নিশ্চিত করে transition-এর পুরো সময়টা জুড়ে পুরনো আর নতুন shape-কে overlap করিয়ে।

<Callout type="info">

**একটা `NOT NULL` column নিরাপদে যোগ করতে দুই ধাপ লাগে।** এটা nullable হিসেবে (বা একটা constant default দিয়ে — আধুনিক Postgres metadata-র মাধ্যমে সেটা তাৎক্ষণিক করে) যোগ করুন, value backfill করুন, তারপর `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` এর পর `VALIDATE CONSTRAINT` দিয়ে `NOT NULL` constraint যোগ করুন, যা একটা blocking lock না ধরে scan করে। একই `NOT VALID` তারপর `VALIDATE` দুই-ধাপ বড় টেবিলে foreign key যোগ করাকে non-blocking করে তোলে।

</Callout>

## একটা Schema Design Checklist

- প্রতিটা টেবিলের একটা primary key আছে।
- Foreign key প্রতিটা বাস্তব relationship enforce করে, একটা ইচ্ছাকৃত `ON DELETE` rule সহ।
- দরকারি column-গুলো `NOT NULL`; enumerated value-গুলো একটা `CHECK` বা একটা lookup table দিয়ে সুরক্ষিত।
- Derived value-গুলো generated column বা trigger দিয়ে maintain করা, হাতে-sync করা নয়।
- প্রতিটা fact একটা জায়গায় থাকে (normalized), denormalization শুধু সেখানেই যেখানে মাপা read সেটা দাবি করে।
- প্রতিটা schema পরিবর্তন একটা reviewed migration হিসেবে যায়, non-blocking হওয়ার জন্য ডিজাইন করা, breaking যেকোনো কিছুর জন্য expand/contract ব্যবহার করে।

## Recap

একটা ভালো schema constraint-এর মাধ্যমে নিজের invariant নিজেই enforce করে, normalization-এর মাধ্যমে প্রতিটা fact একবার স্টোর করে, আর generated column দিয়ে derived value compute করে। ছোট, reviewed, lock-সচেতন migration-এর মাধ্যমে এটাকে বিবর্তন করুন — আর breaking পরিবর্তনগুলো expand/contract প্যাটার্ন দিয়ে নিরাপদ করুন, পুরনো আর নতুন shape-কে overlap করিয়ে যাতে প্রতিটা চালু version সবসময় এমন একটা schema পায় যা সে বোঝে। এতে track-টা সম্পূর্ণ হলো: আপনি এখন আসল relational system লিখতে, optimize করতে, আর নিরাপদে বিবর্তন করতে পারেন। এর নিচের machinery আর modeling-এর কারুকাজ নিয়ে আরও গভীরে যেতে db-internals আর data-modeling track-গুলোতে আবার ফিরে যান।
