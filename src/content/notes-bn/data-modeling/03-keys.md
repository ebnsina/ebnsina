---
title: 'Keys'
subtitle: 'আপনার স্কিমার সবচেয়ে দামি সিদ্ধান্ত হলো primary key। ভুল বেছে নিলে বছরের পর বছর সেটা এড়িয়ে কাজ করতে হবে। ঠিকঠাক বেছে নিলে ভুলেই যাবেন যে এটা আছে।'
chapter: 3
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['data-modeling', 'primary keys', 'ulid', 'uuid', 'natural keys']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব-জীবনের উদাহরণ**

একটা passport number — সব সিস্টেমের মধ্যে এটা আপনাকে ইউনিকভাবে শনাক্ত করে, কখনো বদলায় না, আর গ্লোবাল স্কেলে কলিশন-প্রুফ হওয়ার জন্য বেছে নেওয়া হয়েছে। একটা খারাপ primary key হলো নিজের নাম ব্যবহার করার মতো: ইউনিক নয়, বদলায়, আর দুজন মানুষের নাম মিলে গেলেই বিশৃঙ্খলা শুরু হয়।

</Callout>

প্রতিটা টেবিলের একটা primary key দরকার। `BIGSERIAL`, `UUID`, `ULID`, নাকি একটা natural key — এই পছন্দটা কোনো স্টাইলের ব্যাপার নয়। আপনার অ্যাপ যখন এক মেশিন ছাড়িয়ে বড় হয়, অন্য সিস্টেমে event পাঠায়, কিংবা এক এনভায়রনমেন্ট থেকে আরেকটায় ডেটা migrate করতে হয় — তখন এদের প্রত্যেকটা আলাদা জায়গায় গিয়ে দাঁড়ায়।

এই চ্যাপ্টারটা হলো চারটা বাস্তব অপশনের cost/benefit টেবিল, সাথে composite key-এর নিয়ম, কখন ID পাবলিকভাবে expose করবেন, আর চিরন্তন "natural vs surrogate" বিতর্ক।

## primary key কী

একটা primary key একটা row-কে ইউনিকভাবে শনাক্ত করে। এর দুটো পরিণতি:

1. **কোনো ডুপ্লিকেট নেই।** দুটো row একই primary key value শেয়ার করে না।
2. **কোনো NULL নেই।** প্রতিটা row-এর একটা value আছে।

Postgres দুটোই স্বয়ংক্রিয়ভাবে enforce করে এবং দ্রুত lookup-এর জন্য একটা unique B-tree index তৈরি করে। সেই index-টাই আসলে মূল access path — প্রতিটা অন্য index ভেতরে ভেতরে primary key-কে রেফারেন্স করে (InnoDB-তে; Postgres একটু আলাদা কিন্তু বাস্তবে প্রায় একইরকম আচরণ করে)।

একটা primary key চিরকালীন। অন্তত: এটা _প্রায়_ চিরকালীন। আলাদা কী-তে migrate করা মানে উল্লেখযোগ্য ডেটাসহ যেকোনো টেবিলে কয়েক দিনের অপারেশন, তাই এই পছন্দটা হাই-স্টেক।

## চারটা অপশন

### 1. `BIGSERIAL` (integer, auto-incremented)

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  ...
);
```

`BIGSERIAL` হলো `BIGINT NOT NULL DEFAULT nextval('users_id_seq')`-এর শর্টহ্যান্ড। Postgres insert হওয়া row-গুলোকে 1, 2, 3, ... assign করে।

**সুবিধা:**

- 8 bytes। surrogate অপশনগুলোর মধ্যে সবচেয়ে ছোট। সবচেয়ে দ্রুত index।
- Sequential। নতুন row index-এর শেষে গিয়ে বসে — cache-friendly insert।
- log-এ পড়া সহজ। `user 4271` এমন কিছু যা নিয়ে আপনি জিজ্ঞেস করতে পারেন।
- insert অনুযায়ী স্বাভাবিকভাবেই orderable। `ORDER BY id DESC` সবচেয়ে নতুনটা আগে ফেরত দেয়।

**অসুবিধা:**

- Predictable। `/api/users/42` enumeration attack-কে আমন্ত্রণ জানায় ("আমি কি user 41 দেখতে পারি? user 43?")।
- একক সোর্স অফ ট্রুথ — আপনি অফলাইনে বা আরেকটা সার্ভিসে ID generate করতে পারবেন না।
- renumber না করে দুই সোর্সের ডেটা merge করা কঠিন।

**যেখানে ব্যবহার করবেন:** internal সিস্টেম, single-database অ্যাপ, যেখানে ID বাইরে expose হয় না আর DB-র বাইরে generate করার দরকার নেই।

### 2. UUID v4 (random)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);
```

128-bit random number। `gen_random_uuid()` Postgres 13+-এ বিল্ট-ইন; তার আগে `pgcrypto` install করতে হয়।

**সুবিধা:**

- Globally unique। দুটো সার্ভিস কোনো coordination ছাড়াই ID তৈরি করতে পারে।
- Unguessable। পাবলিক API enumeration ঝুঁকি ছাড়াই এগুলো ব্যবহার করতে পারে।
- Mergeable। দুই database-এর row কনফ্লিক্ট ছাড়াই combine করা যায়।

**অসুবিধা:**

- 16 bytes — `BIGSERIAL`-এর দ্বিগুণ সাইজ। index বড় হয়।
- Random। নতুন row index-জুড়ে ছড়িয়ে পড়ে — page split, বেশি I/O।
- পড়া কঠিন। `0d6b3e07-2d5d-4aab-9a8e-1bafa20fbb02` দুর্বোধ্য।
- Time-ordering-এর জন্য আলাদা একটা column দরকার।

**যেখানে ব্যবহার করবেন:** distributed সিস্টেম, multi-source-of-truth, যখন পাবলিক ID unguessable হওয়া দরকার।

### 3. UUID v7 / ULID (time-ordered random)

```sql
-- Postgres 18+ has uuidv7() built in; earlier use an extension or app-side
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  ...
);
```

UUIDv7 হলো একটা UUID যার প্রথম 48 bit একটা millisecond timestamp; বাকিটা random। **ULID** একই আইডিয়া কিন্তু ভিন্ন encoding — Crockford base32-এর 26 character।

**সুবিধা:**

- UUIDv4-এর মতোই globally unique।
- Time-prefixed: নতুন row index-এর শেষে গিয়ে বসে। insert-friendly।
- আলাদা column ছাড়াই creation time অনুযায়ী sortable।
- ULID একটু বেশি readable: `01HF5J7XK4TG6N2VRT9P0M3DZ4`।

**অসুবিধা:**

- এখনো 16 bytes (UUIDv7) বা 26 character (ULID)।
- একটু কম random — প্রথম 48 bit predictable (time)। বেশিরভাগ ক্ষেত্রে security-র জন্য এতে কিছু আসে-যায় না; বিরল কিছু ক্ষেত্রে theoretical privacy-র জন্য গুরুত্বপূর্ণ।
- ULID Postgres-এ natively typed নয় — আপনি `text` বা `bytea` হিসেবে store করেন।

**যেখানে ব্যবহার করবেন:** distributed সিস্টেম যেখানে আপনি sortable ID-ও চান। নতুন public-facing সিস্টেমের জন্য আধুনিক default।

### 4. Natural keys

একটা "natural" key হলো বাস্তব-জগতের একটা value যা entity-কে ইউনিকভাবে শনাক্ত করে — একটা email, একটা ISBN, একটা country code:

```sql
CREATE TABLE countries (
  code  CHAR(2) PRIMARY KEY,  -- 'US', 'GB', 'JP'
  name  TEXT NOT NULL
);
```

**সুবিধা:**

- কোনো surrogate column লাগে না। স্কিমা এক column ছোট হয়।
- Join স্বতঃস্পষ্ট: `WHERE country = 'US'`-এর জন্য আলাদা lookup লাগে না।

**অসুবিধা:**

- বাস্তব-জগতের value বদলায়। Country code স্থিতিশীল; email নয়। যা কিছু বদলাতে _পারে_ সেটা খারাপ PK।
- ভুল ছড়িয়ে পড়ে। natural key-তে একটা typo হলে প্রতিটা foreign key আপডেট করতে হয়।
- Composite key (একাধিক column) join-কে দীর্ঘ করে তোলে।

**যেখানে ব্যবহার করবেন:** সত্যিকারের স্থিতিশীল বাস্তব-জগতের identifier — country code, currency code, ISO স্ট্যান্ডার্ড। প্রায় কখনোই user-এর দেওয়া কিছু নয়।

## ৯০% টেবিলের জন্য সঠিক পছন্দ

নতুন টেবিলের জন্য, 2026-এ:

- **শুধু internal ডেটা:** `BIGSERIAL`। সবচেয়ে ছোট, দ্রুত, ডিবাগ করা সহজ।
- **Public-facing ডেটা:** ULID বা UUIDv7। Mergeable, unguessable, sortable।
- **Reference টেবিল (countries, currencies):** natural key।

এটা নিয়ে বেশি মাথা ঘামাবেন না। নতুন টেবিলের জন্য একটা default বেছে নিয়ে এগিয়ে যান।

<Callout type="tip">

**"BIGSERIAL internal + ULID external" প্যাটার্ন।** কিছু সিস্টেম primary key হিসেবে `BIGSERIAL id` ব্যবহার করে (index আর join-এর জন্য সেরা) সাথে একটা আলাদা `public_id ULID` column যাতে unique constraint থাকে, যেটা URL-এ expose করা হয়। আপনি দ্রুত internal join আর unguessable পাবলিক ID দুটোই পান। প্রতি টেবিলে এক column আর এক index যোগ হয় — যেকোনো user-facing entity-র জন্য সাধারণত এটা করার মূল্য আছে।

</Callout>

## Composite primary keys

কখনো কখনো natural primary key দুটো (বা তার বেশি) column হয়:

```sql
CREATE TABLE org_memberships (
  user_id BIGINT NOT NULL REFERENCES users(id),
  org_id  BIGINT NOT NULL REFERENCES orgs(id),
  role    TEXT NOT NULL,
  PRIMARY KEY (user_id, org_id)
);
```

`(user_id, org_id)` জোড়াটা ইউনিক — একজন user একটা org-এ বড়জোর একবার থাকে।

**কখন composite ঠিক:**

- খাঁটি join টেবিল (chapter 2): দুই FK একসাথে সম্পর্কটা শনাক্ত করে।
- Time-series partition: `(metric_id, bucket_start)`।
- Append-only log: `(stream_id, sequence)`।

**কখন composite ভুল:**

- টেবিলটা এমন একটা entity প্রকাশ করে যার নিজস্ব জীবন আছে (এতে attribute বাড়ে, অন্য জায়গায় reference হয়)। একটা surrogate ID যোগ করুন। Composite key অন্য টেবিল থেকে আসা foreign key-গুলোকে দীর্ঘ করে তোলে।

নিয়মটা: অন্য কোনো টেবিল যদি এই টেবিলকে reference করে, তাহলে একটা single surrogate key-কে অগ্রাধিকার দিন। দুই-column FK প্রতিটা সম্পর্কিত টেবিলে cascade করে আর maintenance-এর বোঝা হয়ে দাঁড়ায়।

## বিশ্বের কাছে ID expose করা

পাবলিক ID-র জন্য দুটো প্রশ্ন:

**1. এগুলো কি guessable হওয়া উচিত?** একটা `BIGSERIAL` URL প্যাটার্ন (`/api/orders/42`) যে কাউকে আপনার order-এর মধ্য দিয়ে iterate করতে দেয়। Rate limiting আর auth সাহায্য করে, কিন্তু অন্তর্নিহিত enumeration ঝুঁকিটা বাস্তব। পাবলিক surface-এর জন্য UUID/ULID ব্যবহার করুন।

**2. এগুলো কি type-এর ইঙ্গিত দেবে?** Stripe-এর ID (`cus_abc`, `py_xyz`, `sub_def`) resource type-কে prefix করে, যা log-কে readable করে আর ভুল করে type-এর মধ্যে ID অদল-বদল হওয়া ঠেকায়। যোগ করা সহজ:

```sql
ALTER TABLE customers ADD COLUMN public_id TEXT GENERATED ALWAYS AS ('cus_' || id::text) STORED;
```

কিংবা insert-এর সময় prefixed ID generate করুন:

```go
func newID(prefix string) string {
    return prefix + "_" + ulid.Make().String()
}
```

Stripe-স্টাইলের ID শুধু নান্দনিক নয়। এগুলো একটা সাধারণ bug ঠেকায়: যেখানে payment ID প্রত্যাশিত ছিল সেখানে customer ID পাস করা। prefix মিলে না গেলে API boundary-তেই bug-টা ধরা পড়ে।

## কখন একটা single primary key ব্যবহার _না_ করবেন

কিছু shape "এক row, এক key"-তে মানায় না:

- **Bitemporal টেবিল।** Row-এ "valid time" আর "transaction time" দুটোই থাকে; PK হলো `(entity_id, valid_from, transaction_from)`।
- **Event-sourced aggregate।** প্রতিটা event একটা row; PK হলো `(aggregate_id, sequence)`।
- **Wide-column shadow টেবিল।** একটা change-log টেবিল যেখানে PK হলো `(table_name, row_id, changed_at)`।

এগুলো advanced প্যাটার্ন; chapter 7 temporal ডেটা ছুঁয়ে যায়। default হিসেবে একটা সাধারণ PK রাখুন, স্পষ্ট কারণ থাকলে তবেই এগুলোতে যান।

## Sequence vs identity

Postgres-এ `BIGSERIAL`-এর একটা syntactic বিকল্প আছে:

```sql
-- legacy
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, ...);

-- modern (SQL standard)
CREATE TABLE users (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ...);
```

`GENERATED ALWAYS AS IDENTITY` হলো SQL স্ট্যান্ডার্ড। এটা একই কাজ করে কিন্তু একটু বেশি strict — আপনি ম্যানুয়ালি একটা `id` value `INSERT` করতে পারবেন না (`BY DEFAULT` দিয়ে পারবেন)। নতুন টেবিলের জন্য identity syntax-কে অগ্রাধিকার দিন। runtime-এ একইরকম আচরণ করে।

## `email`-কেই user PK করলে সমস্যা কী?

একটা সাধারণ সরল প্রশ্ন। কারণগুলো:

1. **Email বদলায়।** User তাদের email আপডেট করে; এখন সেটাকে reference করা প্রতিটা foreign key আপনাকে আপডেট করতে হবে।
2. **Email হলো PII।** এগুলো index, log, replication stream, query plan-এ দেখা দেয়। একটা surrogate key-তে দেয় না।
3. **TEXT-এর উপর composite-key join ধীর** `BIGINT` join-এর চেয়ে। Email variable-length; integer comparison দ্রুত।

"entity-র জন্য সবসময় একটা surrogate key ব্যবহার করো" convention-টা আছে কারণ বাস্তব-জগতের identifier অস্থিতিশীল হয়ে দাঁড়ায়। স্কিমা পায় surrogate; অ্যাপ্লিকেশন natural attribute-এর উপর uniqueness enforce করে।

```sql
CREATE TABLE users (
  id    BIGSERIAL PRIMARY KEY,        -- stable, internal
  email CITEXT NOT NULL UNIQUE,        -- stable, but user can change it
  ...
);
```

## ID type আর migration

আপনি যদি একটা primary key type বদলান, সেটাকে reference করা প্রতিটা foreign key-ও বদলাতে হবে। সম্পর্কিত টেবিলের সংখ্যার সাথে খরচ linearly বাড়ে।

একটা existing টেবিলে **`BIGSERIAL` থেকে `UUID`-তে যাওয়া**:

1. parent-এ একটা নতুন `uuid_id` column যোগ করুন।
2. প্রতিটা row-এর জন্য নতুন UUID backfill করুন।
3. প্রতিটা child-এ `uuid_<parent>_id` column যোগ করুন। JOIN দিয়ে backfill করুন।
4. অ্যাপ কোড নতুন ID ব্যবহার করার জন্য switch করুন।
5. পুরনো column drop করুন।

একটা ব্যস্ত সিস্টেমের জন্য এটা কয়েক সপ্তাহের কাজ। **সঠিক key type বেছে নেওয়ার সঠিক সময় হলো যখন টেবিলটা খালি।** তিন বছর পরে এই migration এড়াতে এখনই যেকোনো নতুন public-facing টেবিলের জন্য default হিসেবে ULID/UUIDv7 নিন।

## hashids আর short URL-এর কী

`hashids`, `nanoid`, আর কাস্টম alphabet ID (YouTube-এর 11-character URL) আলোচনায় আসে। এগুলো কাস্টম encoding-সহ surrogate key-এর রূপ। ট্রেড-অফ:

- **`nanoid`** — একটা কাস্টম alphabet-এ ছোট random ID। UUIDv4-এর মতো কিন্তু ছোট। non-time-sortable ক্ষেত্রে ঠিক আছে।
- **`hashids`** — integer-কে উল্টো করা যায় এমনভাবে encode করে। ছোট দেখায় কিন্তু আসলে একটা ছদ্মবেশী `BIGSERIAL` — integer-টা যে enumeration-এর ঝুঁকিতে ছিল সেই একই ঝুঁকিতে দুর্বল। security-র জন্য এড়িয়ে চলুন।
- **কাস্টম short code** (`abc123`) — সাধারণত collision-এ retry সহ অ্যাপ-generated। non-hot path-এর জন্য কাজ করে।

বেশিরভাগ প্রজেক্টের জন্য ULID যথেষ্ট। কাস্টম ID নির্দিষ্ট niche সমস্যা সমাধান করে।

## Indexing আর primary key

primary key স্বয়ংক্রিয়ভাবে একটা unique B-tree index পায়। আপনি ম্যানুয়ালি একটা যোগ করেন না।

Composite PK-র জন্য, শুধু leading column non-PK query-র জন্য একটা index পায়:

```sql
PRIMARY KEY (user_id, org_id)
-- Index on user_id alone: yes, automatic
-- Index on org_id alone: NO — must add manually
CREATE INDEX ON memberships(org_id);
```

এটা B-tree index-এর "leftmost prefix rule"। এটা ভুলে গেলে আপনার অর্ধেক query ধীর থেকে যায়।

## রিক্যাপ

- প্রতিটা টেবিলে একটা PK থাকে। ভেবেচিন্তে বেছে নিন; বদলানো ব্যয়বহুল।
- internal ডেটার জন্য `BIGSERIAL`; public-facing-এর জন্য ULID/UUIDv7; শুধু স্থিতিশীল বাস্তব-জগতের ID-র জন্য natural key।
- "BIGSERIAL internal + ULID public" user-facing entity-র জন্য একটা ভালো default।
- Composite PK শুধু join টেবিল আর time-series-এর জন্য — নিজস্ব জীবন আছে এমন যেকোনো কিছু একটা surrogate পায়।
- পাবলিক ID unguessable আর (ঐচ্ছিকভাবে) type দিয়ে prefixed হওয়া উচিত।
- নতুন কোডে `BIGSERIAL`-এর বদলে `GENERATED AS IDENTITY` ব্যবহার করুন (SQL স্ট্যান্ডার্ড)।
- Email/username/user-এর টাইপ করা যেকোনো কিছু PK নয়। surrogate + UNIQUE constraint।
- Composite PK শুধু leading column index করে; বাকিগুলোর জন্য explicit index যোগ করুন।

পরবর্তী: [Normalization](/notes/data-modeling/04-normalization) — 1NF, 2NF, 3NF বাস্তব উদাহরণসহ সহজ ভাষায়।
