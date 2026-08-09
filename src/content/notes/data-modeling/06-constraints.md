---
title: 'Constraints'
subtitle: 'Application bug-এর বিরুদ্ধে schema হলো আপনার শেষ প্রতিরক্ষা। Constraint সেই নিয়মগুলো encode করে যা সবসময় সত্য থাকা উচিত — আপনার app মনে রাখুক বা না রাখুক, Postgres সেগুলো enforce করে।'
chapter: 6
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['data-modeling', 'constraints', 'foreign-keys', 'check', 'unique']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Constraint হলো database যে data গ্রহণ করে তা নিয়ে database-এর একটা প্রতিশ্রুতি। এমন প্রতিশ্রুতি যা প্রতিটা code path, প্রতিটা microservice, গত সপ্তাহে যোগ দেওয়া প্রতিটা developer জুড়ে টিকে থাকে। এমন প্রতিশ্রুতি যা টিকে থাকে এমনকি যখন কেউ রাত 2টায় একটা one-off SQL update চালায়।

বেশিরভাগ data quality bug-কে একটা missing constraint-এ ফিরিয়ে নেওয়া যায়। এই chapter হলো সেই toolkit।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা form যা valid email ছাড়া submit হবে না — database নিয়ম enforce করে যাতে application code-কে করতে না হয়।

</Callout>

## গল্পে বুঝি

রেজিস্ট্রেশন অফিসের কাউন্টারে বসেন ফাতিমা আল-ফিহরি — কড়া ধাঁচের ফর্ম-চেকিং ক্লার্ক। যে ফর্মই তাঁর টেবিলে আসে, ফাইলে যাওয়ার আগে তিনি নিয়মে না মিললে সেটা ফেরত দেন। ইবনে সিনা একটা ফর্ম জমা দিলেন যেখানে বাধ্যতামূলক "নাম" ঘরটা ফাঁকা — ফাতিমা সঙ্গে সঙ্গে ফিরিয়ে দিলেন, "নাম ছাড়া ফর্ম নেব না।" পরের জন এমন একটা ID নম্বর লিখলেন যেটা আগেই একজনের নামে রেজিস্টার করা — সেটাও বাউন্স, "এই নম্বর তো আগেই আছে।"

এরপর এক ফর্মে বয়স লেখা মাইনাস পাঁচ — ফাতিমা হেসে সেটা ছুঁড়ে ফেললেন, "বয়স তো positive হতে হবে।" আর আল-খোয়ারিজমি এমন এক অভিভাবক-অ্যাকাউন্ট নম্বর রেফার করলেন যেটার কোনো অস্তিত্বই নেই ফাইলে — "যে অ্যাকাউন্ট নেই, তার রেফারেন্স নেব কী করে?" বলে সেটাও প্রত্যাখ্যাত। কাউন্টারেই যাচাই হয় বলে একটাও ভুল ফর্ম কখনো পেছনের ফাইল পর্যন্ত পৌঁছায় না।

এই কাউন্টারটাই আসলে database-এর **constraint**। বাধ্যতামূলক ঘর ফাঁকা থাকায় ফর্ম বাতিল হলো **NOT NULL** — column-এ value থাকতেই হবে। আগের রেজিস্টার করা ID বাউন্স হওয়াটা **UNIQUE** — duplicate value ঢুকবে না। মাইনাস পাঁচ বয়স ছুঁড়ে ফেলা হলো **CHECK** — value একটা নিয়ম (age positive) মানতে হবে। আর অস্তিত্বহীন অ্যাকাউন্টের রেফারেন্স প্রত্যাখ্যান হলো **foreign key** — reference-কে অবশ্যই আসল একটা row-কে point করতে হবে। ফাতিমা কাউন্টারেই validity নিশ্চিত করেন বলে ভুল ডেটা ফাইলে ঢোকে না — ঠিক তেমনই database constraint enforce করে, তাই app code-এ bug থাকলেও খারাপ ডেটা টেবিলে ঢুকতে পারে না। বাস্তবে Postgres-এ এই চার ধরনের constraint দিয়েই data validity-র শেষ প্রতিরক্ষা তৈরি হয়।

## ছয়টা constraint type

```
NOT NULL    — column must have a value
UNIQUE      — values across rows are unique
PRIMARY KEY — both NOT NULL and UNIQUE, plus indexed
FOREIGN KEY — value must reference an existing row in another table
CHECK       — value must satisfy an expression
EXCLUDE     — values across rows must not overlap (e.g. time ranges)
```

Postgres-এ GENERATED column-ও আছে (chapter 4), যা কড়াভাবে constraint নয় কিন্তু একই রকম invariant enforce করে।

## NOT NULL — সবচেয়ে সস্তা bima

```sql
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  email       CITEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

প্রতিটা column-এ default হিসেবে NOT NULL রাখুন। শুধু তখনই NULL অনুমোদন করুন যখন "এখনো কোনো value নেই" বা "প্রযোজ্য নয়" একটা অর্থপূর্ণ state।

শৃঙ্খলা: একটা nullable column যোগ করার সময় জিজ্ঞেস করুন _এখানে NULL মানে কী?_ উত্তর যদি হয় "জানি না, এটা just optional", তাহলে একটা যুক্তিসঙ্গত default সহ এটা NOT NULL করুন।

কয়েকটা সাধারণ কেস যেখানে NULL সঠিক:

- **`deleted_at`**: NULL মানে "delete হয়নি।" (Chapter 7.)
- **`accepted_at`** একটা invitation-এ: NULL মানে "এখনো pending।"
- **`canceled_at`** একটা subscription-এ: NULL মানে "active।"

তিনটা value একটা state machine হয়ে যায়: NULL এক জিনিস বোঝায়; উপস্থিতি অন্য জিনিস, আর timestamp আপনাকে বলে কখন।

## UNIQUE — duplicate ঠেকানো

```sql
CREATE TABLE users (
  ...
  email CITEXT NOT NULL UNIQUE
);
```

দুটো row একই email শেয়ার করতে পারে না। Write-এর সময় enforce করা; violation একটা পরিষ্কার error।

Multi-column uniqueness-এর জন্য:

```sql
CREATE TABLE org_memberships (
  user_id BIGINT NOT NULL REFERENCES users(id),
  org_id  BIGINT NOT NULL REFERENCES orgs(id),
  ...
  UNIQUE (user_id, org_id)
);
```

Pair-টা unique — একজন user একটা org-এ বড়জোর একবার থাকে।

**Partial unique index** হলো একটা Postgres power tool:

```sql
-- only one active subscription per user
CREATE UNIQUE INDEX one_active_subscription
ON subscriptions(user_id)
WHERE canceled_at IS NULL;
```

এটা বলে "যেসব row-এ `canceled_at IS NULL`, তাদের মধ্যে `user_id` unique।" এতে প্রতি user-এর অনেক পুরনো canceled subscription থাকতে পারে কিন্তু শুধু একটা active। একটা সাধারণ UNIQUE দিয়ে প্রকাশ করা কঠিন; একটা partial index দিয়ে খুবই সহজ।

UNIQUE automatically একটা index তৈরি করে — সাধারণত একটা B-tree, ঠিক `CREATE UNIQUE INDEX`-এর মতোই। আপনি lookup performance বিনামূল্যে পান।

## PRIMARY KEY

Chapter 3-এ ইতিমধ্যে আলোচনা হয়েছে। আবার বলার মতো: একটা primary key হলো `NOT NULL UNIQUE` প্লাস একটা clustered/canonical index। প্রতিটা table-এ ঠিক একটা থাকে। কিছু database আপনাকে এটা বাদ দিতে দেয়; Postgres দেয়, কিন্তু আপনার সত্যিই দেওয়া উচিত না।

## FOREIGN KEY — relational integrity

```sql
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES users(id),
  ...
);
```

`orders.customer_id`-কে অবশ্যই `users`-এ থাকা একটা row reference করতে হবে। একটা অস্তিত্বহীন ID দিয়ে insert → error। যে user-এর order আছে তাকে delete করার চেষ্টা → blocked (default behavior)।

চারটা `ON DELETE` policy:

```sql
ON DELETE NO ACTION  -- default: error if children exist
ON DELETE RESTRICT   -- same as NO ACTION but checked immediately
ON DELETE CASCADE    -- delete the children too
ON DELETE SET NULL   -- nullify the FK in children (column must be nullable)
ON DELETE SET DEFAULT
```

পছন্দটা গুরুত্বপূর্ণ আর প্রতিটা relationship-এর জন্য ইচ্ছাকৃত হওয়া উচিত:

- **CASCADE** owned data-র জন্য: comment একটা post-এর অন্তর্গত — post delete, comment delete।
- **RESTRICT** shared reference-এর জন্য: একজন user-এর order থাকলে তাকে delete হতে দেবেন না। App-কে সেটা handle করতে বাধ্য করুন।
- **SET NULL** soft reference-এর জন্য: একটা audit row-এ একটা `created_by_user_id` — user delete হলে, audit রাখুন কিন্তু reference null করুন।

"পারফরম্যান্সের জন্য" foreign key বাদ দেওয়া একটা খারাপ trade। Insert-এ FK validation-এর খরচ ছোট; বাইরে orphan row-এর খরচ বিশাল। সবসময় FK column-এ index করুন (Postgres FK auto-index করে না):

```sql
CREATE INDEX ON orders(customer_id);
```

সেই index ছাড়া, "user X-এর সব order খুঁজে বের করা" একটা full table scan, _আর_ একজন user delete করা orphan check করার জন্য একটা full table scan।

<Callout type="warn">

**সবসময় foreign key column-এ index করুন।** Postgres automatically index তৈরি করে না (primary key-এর মতো নয়)। একটা missing FK index প্রতিটা reference check-কে একটা scan-এ পরিণত করে। এই query নিয়মিত চালান: `SELECT conrelid::regclass, conname FROM pg_constraint WHERE contype = 'f';` আর যাচাই করুন প্রতিটার একটা covering index আছে।

</Callout>

## CHECK — domain constraint

```sql
CREATE TABLE products (
  id          BIGSERIAL PRIMARY KEY,
  price_cents BIGINT NOT NULL CHECK (price_cents > 0),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200)
);
```

CHECK constraint যেকোনো boolean expression গ্রহণ করে। সাধারণ pattern:

```sql
-- range
CHECK (age BETWEEN 0 AND 150)

-- enum-like (alternative to CREATE TYPE ... AS ENUM)
CHECK (status IN ('pending', 'paid', 'shipped', 'canceled'))

-- format
CHECK (email ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$')

-- relationship
CHECK (end_date > start_date)

-- cross-column
CHECK ((shipped_at IS NULL) OR (shipped_at >= created_at))

-- exactly-one polymorphic FK (chapter 2)
CHECK (
  (post_id IS NOT NULL)::int +
  (photo_id IS NOT NULL)::int +
  (video_id IS NOT NULL)::int = 1
)
```

CHECK constraint একই row-এর যেকোনো column reference করতে পারে কিন্তু অন্য row নয়। "এই row-এর value-কে অন্য একটা table জড়িত একটা condition satisfy করতে হবে"-র জন্য trigger বা application-level validation ব্যবহার করুন।

একটা সাধারণ বিতর্ক: **CHECK বনাম ENUM**।

```sql
-- ENUM type
CREATE TYPE order_status AS ENUM ('pending','paid','shipped','canceled');
CREATE TABLE orders (..., status order_status NOT NULL);

-- vs CHECK
CREATE TABLE orders (..., status TEXT NOT NULL CHECK (status IN ('pending','paid','shipped','canceled')));
```

Trade-off:

- ENUM বেশি compact (4 byte বনাম variable-length text)।
- ENUM পুরো database জুড়ে একই vocabulary enforce করে।
- ENUM-এর evolution বেশি ঝামেলার: একটা value যোগ করতে `ALTER TYPE` লাগে; value সরানো বা reorder করা কঠিন।
- CHECK evolve করা সহজ কিন্তু আপনি `TRIM` না করা পর্যন্ত দুর্ঘটনাবশত "shipped " (শেষে space) মেনে নেয়।

যেসব status আপনি সময়ের সাথে যোগ করবেন, তাদের জন্য CHECK-কে অগ্রাধিকার দিন। সত্যিকারের fixed vocabulary-র জন্য (currency code, ISO country code), ENUM ঠিক আছে।

## EXCLUDE — overlap prevention

UNIQUE যখন ঠিক সঠিক আকারের নয়, তখন EXCLUDE হলো সেই constraint যার দিকে হাত বাড়ান।

```sql
CREATE EXTENSION btree_gist;

CREATE TABLE bookings (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL,
  during  TSTZRANGE NOT NULL,
  EXCLUDE USING GIST (room_id WITH =, during WITH &&)
);
```

Constraint-টা পড়ে: "এমন কোনো দুটো row নেই যেখানে `room_id` একই এবং `during` overlap করে।" Room 1-এর জন্য সকাল 9টা থেকে 10টা একটা booking insert করার চেষ্টা করুন যখন ইতিমধ্যে একটা আছে সকাল 9:30 থেকে 10:30 — error। Database এটা enforce করে।

Range আর geometric data-র জন্য EXCLUDE অনন্য। এটা ছাড়া আপনি application-level check লিখতেন যা concurrency-তে race করে।

এটা কম ব্যবহৃত। যদি আপনার time-range, range-of-number, বা non-overlap নিয়ম সহ spatial data থাকে, তাহলে EXCLUDE-ই সবচেয়ে পরিষ্কার উত্তর।

## Generated column (আবার)

কারিগরিভাবে constraint নয়, কিন্তু একটা invariant enforce করে:

```sql
CREATE TABLE invoices (
  id        BIGSERIAL PRIMARY KEY,
  subtotal  NUMERIC NOT NULL,
  tax_rate  NUMERIC NOT NULL,
  total     NUMERIC GENERATED ALWAYS AS (subtotal * (1 + tax_rate)) STORED
);
```

DB প্রতিটা INSERT বা UPDATE-এ `total` আবার compute করে। এটা drift করতে পারে না। যেসব derived value সবসময় একই row-এর অন্য column থেকে আসে তাদের জন্য ভালো।

Postgres-এ STORED (write-এর সময় compute) আর (নতুন version-এ) VIRTUAL (read-এর সময় compute) আছে। STORED বেশি সাধারণ — সামান্য storage খরচ, কোনো read overhead নেই।

## কোথায় একটা নিয়ম enforce করবেন — schema বনাম app বনাম দুটোই

একটা সাধারণ প্রশ্ন: এই validation schema-তে থাকবে নাকি app code-এ?

**Schema** যখন:

- নিয়মটা universal (প্রতিটা code path মানতে হবে)।
- নিয়মটা SQL-এ প্রকাশ করা যায় (range, format, FK, uniqueness)।
- নিয়মটা "কী সত্য" নিয়ে, "কী ঘটা উচিত" নিয়ে নয়।

**Application** যখন:

- নিয়মটার এমন context দরকার যা DB-র নেই (current user, feature flag, business rule)।
- নিয়মটা একাধিক field-level violation সহ friendly error message তৈরি করে।
- নিয়মটা external service cross-reference করে।

**দুটোই** যখন ঝুঁকি বেশি। Application-level validation সুন্দর UX দেয় (field level-এ form error); schema constraint validation যেসব code path মিস করেছে সেখানকার bug ধরে।

ফাঁদ: শুধু app code-এ validate করা, তারপর একটা manual SQL update বা একটা unrelated service invariant ভেঙে দেয়। Production data এমনভাবে নষ্ট হয় যা ধরা কঠিন আর ঠিক করা আরও কঠিন।

## Constraint-এর নামকরণ

সবসময় আপনার constraint-এর নাম দিন। Postgres default-এ `users_email_key1` বা `orders_check5`-এর মতো নাম তৈরি করে — একটা query-র জন্য কাজের, migration-এর জন্য ভয়ঙ্কর।

```sql
ALTER TABLE orders
  ADD CONSTRAINT orders_status_valid
  CHECK (status IN ('pending','paid','shipped','canceled'));
```

এখন আপনি পরে `ALTER TABLE orders DROP CONSTRAINT orders_status_valid;` করতে পারবেন। নাম না দিলে, auto-generated নাম খুঁজে বের করতে হতো।

Convention: `<table>_<column(s)>_<type>`। `users_email_unique`, `orders_status_check`, `payments_amount_positive_check`।

## Deferred constraint

Default-এ, constraint প্রতিটা statement-এর শেষে check করা হয়। কখনো কখনো commit পর্যন্ত defer করতে হয়:

```sql
ALTER TABLE A ADD CONSTRAINT a_b_fk FOREIGN KEY (b_id) REFERENCES B(id) DEFERRABLE INITIALLY IMMEDIATE;

BEGIN;
SET CONSTRAINTS a_b_fk DEFERRED;
-- now insert into A and B in either order
INSERT INTO A ...;
INSERT INTO B ...;
COMMIT; -- check all constraints now
```

Circular FK dependency-র জন্য কাজের — A reference করে B, B reference করে A — যেখানে কোনো FK validate হওয়ার আগে আপনাকে দুটো row-ই insert করতে হবে।

বেশিরভাগ schema-র এটা দরকার নেই। যখন একটা আসল circular reference থাকে তখনই deferred constraint-এর দিকে হাত বাড়ান।

## বড় table-এ constraint যোগ করা

একটা billion-row table-এ একটা NOT NULL বা CHECK constraint যোগ করা একটা দীর্ঘ-চলা operation যা একটা exclusive lock ধরে রাখে। CHECK-এর জন্য Postgres-এর একটা workaround আছে:

```sql
-- step 1: add constraint NOT VALID — does not check existing rows
ALTER TABLE big_table
  ADD CONSTRAINT big_table_x_check CHECK (x > 0) NOT VALID;

-- step 2: validate (slow, but doesn't block writes)
ALTER TABLE big_table VALIDATE CONSTRAINT big_table_x_check;
```

`NOT VALID` constraint-টাকে সাথে সাথে _নতুন_ write-এ প্রযোজ্য করে যখন existing row check করা হয় না। তারপর `VALIDATE` একটা exclusive lock না ধরে existing row scan করে। দুই-ধাপের migration; zero downtime।

NOT NULL-এর জন্য, একই ধারণা কাজ করে আগে একটা CHECK দিয়ে, তারপর promote করে:

```sql
-- step 1
ALTER TABLE big_table ADD CONSTRAINT big_table_x_not_null CHECK (x IS NOT NULL) NOT VALID;
ALTER TABLE big_table VALIDATE CONSTRAINT big_table_x_not_null;

-- step 2 (fast, uses the CHECK as a witness)
ALTER TABLE big_table ALTER COLUMN x SET NOT NULL;
ALTER TABLE big_table DROP CONSTRAINT big_table_x_not_null;
```

Chapter 10-এ এই expand/contract pattern-এর আরও কিছু আলোচনা আছে।

## Constraint যা করে না

- **এরা input validation-এর বিকল্প নয়।** User app layer থেকে friendly error পায়; schema হলো safety net।
- **এরা প্রতিটা bug ঠেকায় না।** একটা constraint বলতে পারে না "সঠিক ব্যক্তি এটা approve করছে।" Logic-level নিয়ম code-এ থাকে।
- **এরা সবসময় performance enforce করে না।** একটা CHECK যা প্রতিটা insert-এ একটা expensive function call করে সেটা একটা foot-gun।

## Recap

- ছয়টা constraint type: NOT NULL, UNIQUE, PRIMARY KEY, FOREIGN KEY, CHECK, EXCLUDE।
- Default হিসেবে NOT NULL রাখুন; NULL শুধু তখনই অনুমোদন করুন যখন এর অর্থ স্পষ্ট।
- UNIQUE একটা index তৈরি করে। Partial unique index "প্রতি user-এ একটা active"-কে পরিষ্কারভাবে সমাধান করে।
- FK ON DELETE: owned data-র জন্য CASCADE, shared-এর জন্য RESTRICT, soft reference-এর জন্য SET NULL। সবসময় FK column-এ index করুন।
- Range, format, enum-like, cross-column-এর জন্য CHECK। ENUM type-এর চেয়ে evolve করা সহজ।
- Non-overlap নিয়মের জন্য EXCLUDE — time range, geometric data।
- Generated column derived value-তে drift ঠেকায়।
- আপনার constraint-এর নাম দিন। Convention: `<table>_<col>_<type>`।
- বড় table: block ঠেকাতে CHECK-কে `NOT VALID` হিসেবে যোগ করুন তারপর `VALIDATE` করুন।
- Constraint হলো শেষ প্রতিরক্ষা; UX আর edge case-এর জন্য app validation দিয়ে layer করুন।

পরবর্তী: [Time and soft delete](/notes/data-modeling/07-time-soft-delete) — timestamp, time zone, history, আর soft-delete-এর ফাঁদ।
