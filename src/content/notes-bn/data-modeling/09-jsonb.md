---
title: 'JSONB আর schemaless ফাঁদ'
subtitle: 'JSONB হলো Postgres-এর অন্যতম সেরা ফিচার। ঠিকভাবে ব্যবহার করলে এটাই যেভাবে আপনি নিজের schema-র সাথে লড়াই বন্ধ করেন। ভুলভাবে ব্যবহার করলে এটাই যেভাবে relational database-এর ভেতরে আপনি একটা schemaless জঞ্জাল বানিয়ে ফেলেন।'
chapter: 9
level: 'advanced'
readingTime: '12 মিনিট'
topics: ['data-modeling', 'jsonb', 'postgres', 'schemaless']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

JSONB আপনাকে একটা column-এর ভেতরে যেকোনো JSON রাখতে দেয়। এটা লোভনীয় — আপনি schema design এড়িয়ে যান, দ্রুত ship করেন, কখনো migrate করতে হয় না। বেশিরভাগ টিম এক-দুইবার এর দিকে হাত বাড়ায় আর একই শিক্ষা পায়: JSONB একটা শক্তিশালী টুল যা চিন্তা করার বিকল্প হিসেবে ব্যবহার করলে স্থায়ী দুর্যোগে পরিণত হয়।

এই চ্যাপ্টারে থাকছে এর বৈধ ব্যবহার, অ্যান্টি-ব্যবহার, যে indexing pattern-গুলো JSONB query দ্রুত করে, আর JSONB যখন বড় হয়ে আসল column হয়ে ওঠে তখনকার migration plan।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা ফাইলিং ক্যাবিনেটের ড্রয়ার যা একইসাথে structured ফোল্ডার আর ছড়ানো-ছিটানো কাগজ — দুটোই গ্রহণ করে; একই জায়গায় rigid আর flexible storage।

</Callout>

## JSONB কী

`JSONB` (Postgres-নির্দিষ্ট) হলো binary JSON storage। যেকোনো valid JSON insert করুন; `->`, `->>`, `@>` এর মতো operator দিয়ে query করুন। membership-ধরনের query-র জন্য GIN (Generalized Inverted Index) দিয়ে index করা হয়।

```sql
CREATE TABLE events (
  id   BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  data JSONB NOT NULL
);

INSERT INTO events(type, data) VALUES
  ('user.signup', '{"user_id": 42, "plan": "pro", "source": "blog"}'),
  ('user.login',  '{"user_id": 42, "ip": "1.2.3.4"}');

SELECT data->>'user_id' AS uid FROM events WHERE type = 'user.signup';
SELECT * FROM events WHERE data @> '{"plan": "pro"}';
```

`JSONB` টাইপ বনাম `JSON`: `JSON` টেক্সটটাকে যেমন-আছে-তেমন (whitespace আর key order সহ) সংরক্ষণ করে; `JSONB` একটা parsed binary representation সংরক্ষণ করে। নতুন কোডে সবসময় `JSONB` ব্যবহার করুন — operator দ্রুততর, আর indexing কেবল JSONB-তেই কাজ করে।

## তিনটি বৈধ ব্যবহার

### 1. প্রতিটি row-তে সত্যিকারের পরিবর্তনশীল shape

যখন data structure row-ভেদে মৌলিকভাবে আলাদা, তখন column সেটা represent করতে পারে না। Webhook event payload-ই এর ক্লাসিক উদাহরণ:

```sql
CREATE TABLE webhook_events (
  id    BIGSERIAL PRIMARY KEY,
  type  TEXT NOT NULL,           -- 'payment.succeeded', 'user.created', ...
  data  JSONB NOT NULL,           -- shape depends on type
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

একটা `payment.succeeded` event-এর field আর একটা `user.created`-এর field আলাদা। প্রতিটি event type-কে আলাদা table হিসেবে model করা মানে হবে কয়েক ডজন table; আর এক wide table হিসেবে model করা মানে কয়েক ডজন প্রায়-NULL column। এখানে JSONB-ই ঠিক।

`data`-র key-গুলো প্রতি `type`-এ স্থিতিশীল। আপনি প্রতিটি type-এর payload আলাদাভাবে document করতে পারেন, আর consumer-রা জানে কী আশা করতে হবে।

### 2. সত্যিকারের user-defined shape

একটা CRM record-এর custom field, form-এর response, key-value preference:

```sql
CREATE TABLE form_submissions (
  id          BIGSERIAL PRIMARY KEY,
  form_id     BIGINT NOT NULL REFERENCES forms(id),
  responses   JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

প্রতিটি form-এর field আলাদা। কাস্টমার form ডিজাইন করে; schema আগে থেকে জানতে পারে না। এখানে JSONB-ই ঠিক।

### 3. Sparse, opaque metadata

Tag-জাতীয় বা label-জাতীয় data যা application কখনো set করে, কখনো read করে, কিন্তু database বেশিরভাগ সময় শুধু সংরক্ষণ করে:

```sql
CREATE TABLE products (
  id       BIGSERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  price_cents BIGINT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'
);
```

`metadata` column-এ app বা integration যা কিছু attach করতে চায় তাই থাকে। এটা প্রায়ই query হয় না; index হয় না; validate হয় না। একে opaque storage হিসেবে ধরুন।

Stripe-এর `metadata` field ঠিক এই ভূমিকাটাই পালন করে — একটা জায়গা যেখানে কাস্টমার তাদের bookkeeping ID রেখে দিতে পারে, আপনার সেগুলো model করার দরকার ছাড়াই।

## অ্যান্টি-প্যাটার্ন: JSONB-কে schema হিসেবে ব্যবহার

ফাঁদটা হলো: "schema design এড়াতে" structured, queryable data-কে JSONB-এর ভেতরে ঢুকিয়ে দেওয়া।

```sql
-- BAD
CREATE TABLE users (
  id    BIGSERIAL PRIMARY KEY,
  data  JSONB NOT NULL  -- contains email, name, plan, role, ...
);
```

এখন:

- **কোনো type safety নেই।** `email` একটা int হতে পারে। `plan` অনুপস্থিত থাকতে পারে। DB-র তাতে কিছু যায়-আসে না।
- **কোনো NOT NULL নেই।** আপনি একটা field "সবসময় set করলেও", একটা buggy insert যে সেটা বাদ দিয়ে দেবে না—তা ঠেকানোর কিছু নেই।
- **অন্য table-এর সাথে কোনো FK নেই।** `data->>'org_id'` কি `orgs.id` reference করে? হয়তো। DB-র কোনো ধারণাই নেই।
- **পরিষ্কার index নেই।** GIN index কিছু query-র জন্য কাজ করে, কিন্তু `ORDER BY data->>'created_at'` ধরনের scan-এর জন্য নয়।
- **যুক্তি বোঝা কঠিন।** "একটা user-এর কী কী field আছে?" কোড দেখুন, আর আশা করুন সেটা সম্পূর্ণ।

আপনি Postgres-এর ভেতরে MongoDB-কে নতুন করে বানিয়ে ফেলেছেন, দুটোরই সবচেয়ে খারাপ দিক নিয়ে — Mongo-র structure-এর অভাব আর Postgres-এর schemaless হতে অনীহা।

নিয়মটার আকার: **যদি data-র row জুড়ে একটা পরিচিত, সাধারণ structure থাকে, তবে column ব্যবহার করুন**। JSONB হলো সত্যিকারের পরিবর্তনশীল, opaque, বা dynamic data-র জন্য — "আমি এখনো column ঠিক করিনি" এর জন্য নয়।

<Callout type="warn">

**JSONB-as-schema বাগটা জমা হয়ে বাড়তে থাকে।** প্রতিটা নতুন feature `data->>'something'` থেকে read করে। প্রতিটা নতুন feature ভুল type read করে থাকতে পারে। দুই বছর পর, JSONB column-টাই হয়ে যায় schema, আর গোটা দুনিয়া নতুন করে না লিখে একটা "আসল" migration করা অসম্ভব।

</Callout>

## JSONB index করা

JSONB-র জন্য তিন ধরনের index, সাধারণ ব্যবহারের ক্রম অনুসারে।

### পুরো column-এর উপর GIN

```sql
CREATE INDEX events_data_gin ON events USING GIN (data);
```

Membership query সাপোর্ট করে:

```sql
-- "events whose data contains this object"
SELECT * FROM events WHERE data @> '{"user_id": 42}';

-- "events with this top-level key"
SELECT * FROM events WHERE data ? 'plan';

-- "events with any of these keys"
SELECT * FROM events WHERE data ?| ARRAY['plan', 'tier'];
```

index-টা বড় (প্রায়ই data-র 2-3× আকারের) কিন্তু বহুমুখী। ঠিক তখন উপযোগী যখন আপনি আগে থেকে জানেন না কোন path-এ filter করবেন।

### `jsonb_path_ops` সহ GIN

আরও কমপ্যাক্ট কিন্তু আরও সীমিত একটা variant:

```sql
CREATE INDEX events_data_gin_path ON events USING GIN (data jsonb_path_ops);
```

ছোট index; কেবল `@>` containment operator সাপোর্ট করে। আপনি যদি শুধু `@>` operator ব্যবহার করেন, তবে এটা default GIN-এর চেয়ে দ্রুততর ও হালকা।

### নির্দিষ্ট path-এর উপর B-tree

একটা নির্দিষ্ট field-এর জন্য যেটা equality বা range দিয়ে query হয়:

```sql
CREATE INDEX events_user_id ON events ((data->>'user_id'));

-- now this is fast
SELECT * FROM events WHERE data->>'user_id' = '42';
```

আপনি cast করে এমন expression-এর উপরও index বানাতে পারেন — `((data->>'user_id')::bigint)` — সঠিক integer comparison-এর জন্য।

Structured-অথচ-flexible JSONB column-ওয়ালা বেশিরভাগ app-এর জন্য **দুটো index ভালো কাজ করে:** সাধারণ query-র জন্য একটা GIN, আর সবচেয়ে বেশি-filter হওয়া field-গুলোর উপর B-tree expression index।

## JSONB থেকে generated column

একটা pattern যা আপনাকে দুই দুনিয়ার সেরাটা দেয়:

```sql
CREATE TABLE events (
  id      BIGSERIAL PRIMARY KEY,
  type    TEXT NOT NULL,
  data    JSONB NOT NULL,
  user_id BIGINT GENERATED ALWAYS AS ((data->>'user_id')::bigint) STORED,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX events_user_id ON events(user_id);
```

`user_id` write-time-এ JSONB থেকে স্বয়ংক্রিয়ভাবে বের করা হয়, একটা আসল column হিসেবে সংরক্ষিত হয়, স্বাভাবিকভাবে index হয়। Application code পরিষ্কারভাবে `WHERE user_id = $1` ব্যবহার করতে পারে। JSONB-ই source of truth থাকে; column-টা একটা দ্রুত access path।

এটা তখন ব্যবহার করুন যখন একটা JSONB field যথেষ্ট বেশি query হয় যে তার নিজের index পাওয়ার যোগ্য, কিন্তু আপনি সেটাকে সম্পূর্ণ আলাদা একটা column-এ extract করতে চান না।

## Validation

JSONB নিজে structure validate করে না। দুটো স্তর:

**Application-level**: JSONB-কে একটা typed struct-এ parse করুন আর ঢোকার পথে validate করুন। প্রচলিত রীতি; অনেক app-এ এটাই একমাত্র প্রতিরক্ষার লাইন।

**Schema-level CHECK constraint**: অবাক করার মতো শক্তিশালী।

```sql
ALTER TABLE webhook_events
  ADD CONSTRAINT data_has_required_keys
  CHECK (data ? 'event_id' AND data ? 'type');

ALTER TABLE webhook_events
  ADD CONSTRAINT data_event_id_is_string
  CHECK (jsonb_typeof(data->'event_id') = 'string');
```

গুরুত্বপূর্ণ structure-এর জন্য (প্রতিটি row-তে এই key-গুলো, এই type-এর থাকতেই হবে), CHECK constraint insert-time-এ বাগটা ধরে ফেলে। প্রতিটি nested field validate করার চেষ্টা করবেন না — এটাকে top-level invariant-এর মধ্যে সীমাবদ্ধ রাখুন।

আরও সমৃদ্ধ validation-এর জন্য, **JSON Schema** `pg_jsonschema` extension দিয়ে (বা app-side validator দিয়ে) প্রয়োগ করা যায়। উচ্চ-ঝুঁকির data-র জন্য এটা করার মতো।

## JSONB থেকে বেরিয়ে migrate করা

শেষ পর্যন্ত একটা JSONB field একটা "আসল" field হয়ে ওঠে। migration-টা:

```sql
-- 1. add the new column
ALTER TABLE events ADD COLUMN user_id BIGINT;

-- 2. backfill from JSONB
UPDATE events SET user_id = (data->>'user_id')::bigint;

-- 3. add NOT NULL + index
ALTER TABLE events ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX events_user_id ON events(user_id);

-- 4. update app code to write to both old and new (during transition)

-- 5. eventually, remove the field from data on writes; backfill remaining

-- 6. optionally, drop JSONB or keep for legacy data
```

শুরু থেকেই এর পরিকল্পনা করুন। JSONB আপনার prototyping-এর জায়গা; column-গুলো production schema। migration-টা স্বাভাবিক। কষ্টকর কেবল তখনই যখন কেউ নজর না রাখতে রাখতে বছরের পর বছর ধরে JSONB organic-ভাবে বাড়তে থাকে।

## Storage আর performance নোট

- **JSONB parse হয়।** `INSERT` parse ও re-encode করে; `SELECT data->>'k'` একটা দ্রুত lookup।
- **TOAST।** বড় JSONB blob (>2KB) TOAST হয়ে যায় (compress হয়ে out-of-line সংরক্ষিত হয়)। পুরো row read করলে সেগুলো টেনে ফিরিয়ে আনা হয়; একটা নির্দিষ্ট path read করলে কিছু query-তে সেটা এড়ানো যায়।
- **JSONB equality তুলনা exact।** Whitespace-এ কিছু যায়-আসে না (সেটা normalize হয়ে গেছে), কিন্তু read-এ key order সংরক্ষিত থাকে।
- **Default-এ কোনো partial update নেই।** `UPDATE events SET data = jsonb_set(data, '{k}', '"v"')` পুরো JSONB read করে, modify করে, আবার write করে। একটা 100KB blob-এর জন্য, এটা 100KB আবার লিখে ফেলে।

## কখন JSONB একেবারেই ব্যবহার করবেন না

- **Relational data-র জন্য।** JSONB field-কে অন্য table-এর সাথে join করা বিদঘুটে। data-র যদি অন্য table-এ FK থাকে, column-ই ঠিক।
- **যে numeric data আপনি aggregate করবেন তার জন্য।** `SUM(data->>'amount'::numeric)` ধীর ও কুৎসিত।
- **type-চালিত query optimization-এর অধীন data-র জন্য।** typed column নিয়ে optimizer অনেক ভালো কাজ করে।
- **যে data আপনি নিয়ত migrate করবেন তার জন্য।** প্রতিটা `jsonb_set` column-টা আবার লিখে ফেলে; column-এর update atomic।

## Recap

- সত্যিকারের পরিবর্তনশীল shape (webhook payload), user-defined field (form), আর opaque metadata-র জন্য JSONB দারুণ।
- অ্যান্টি-প্যাটার্ন: schema design-এর বিকল্প হিসেবে JSONB ব্যবহার করা।
- Index: সাধারণ কাজের জন্য GIN; শুধু `@>`-এর জন্য `jsonb_path_ops`; নির্দিষ্ট path-এর জন্য B-tree expression index।
- Generated column আপনাকে write-time-এ JSONB থেকে একটা আসল column derive করতে দেয়।
- সবসময় application layer-এ validate করুন; top-level invariant-এর জন্য CHECK constraint।
- JSONB থেকে column-এ migration-এর পরিকল্পনা করুন। এটা স্বাভাবিক — JSONB হলো prototyping-এর জায়গা।
- এগুলোর জন্য ব্যবহার করবেন না: FK-ওয়ালা relational data, numeric aggregation, ছোট field-এর hot update।

পরবর্তী: [Schema evolution](/notes/data-modeling/10-schema-evolution) — expand/contract migration, zero-downtime পরিবর্তন, backfill।
