---
title: 'Data modeling জিনিসটা কী'
subtitle: 'Schema design হলো আপনার ship করা সবচেয়ে দামি জিনিস। প্রথম দিন যে column-গুলো বাছেন সেগুলো প্রতিটা framework, প্রতিটা refactor, প্রতিটা rewrite-কে ছাড়িয়ে টিকে থাকে। ভালো modeling মূলত CREATE TABLE টাইপ করার আগে ভাবা।'
chapter: 1
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['data-modeling', 'schemas', 'orms', 'design']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা সাধারণ app-এ তিন ধরনের code থাকে: handlers, business logic, আর schema। Framework বদলালে handlers আবার লেখা হয়। Requirement বদলালে business logic refactor হয়। Schema থেকে যায়। ২০১৮-তে তৈরি একটা `users` table-এর ২০২৬-এও একই primary key থাকে, আর আপনি এখনও প্রতি মঙ্গলবার তার বিরুদ্ধে migration ship করেন।

এই অসমতাটাই কারণ যে data modeling যত্ন করে করার মতো জিনিস। একটা ঢিলেঢালা model বাকি পুরো project-এ প্রতিটা feature-এ ঘর্ষণ যোগ করে। একটা আঁটসাঁট model অদৃশ্য হয়ে যায়।

<Callout type="info">

**বাস্তব জগতের উপমা**

একটা building-এর blueprint — concrete ঢালার আগেই আপনি layout ঠিক করেন, কারণ পরে দেয়াল সরানো ব্যয়বহুল।

</Callout>

## "data modeling" আসলে কী মানে

তিনটা layer, প্রায়ই গুলিয়ে ফেলা হয়।

**Conceptual model.** আপনার app যে জগতের কথা বলে সেখানে কোন entity-গুলো আছে — users, orders, line items, invoices — আর তারা কীভাবে সম্পর্কিত। কোনো SQL নেই। থাকে একটা sketch-এ, একটা ER diagram-এ, নয়তো আপনার মাথায়।

**Logical model.** Tables, columns, types, keys, relationships। এখনও abstract — Postgres, MySQL, নয়তো SQLite-তে গিয়ে বসতে পারে। বেশিরভাগ "data modeling" সিদ্ধান্ত আসলে এখানেই ঘটে।

**Physical model.** যে CREATE TABLE statement আপনার নির্দিষ্ট database-এর বিরুদ্ধে চলে। Indexes, partitioning, vendor-নির্দিষ্ট type যেমন JSONB আর tsvector।

এই track মূলত logical model-এ ফোকাস করে, এক পা physical-এ (Postgres)। Conceptual layer-ও গুরুত্বপূর্ণ — অধ্যায় ২ — কিন্তু আসল leverage হলো একটা পরিষ্কার conceptual model-কে এমন logical model-এ রূপান্তরিত করায় যা load-এর নিচে টিকে থাকে।

## এটা যা নয়

**এটা "ORM model design করা" নয়।** Active Record, Sequelize, Prisma — সবই schema-কে code-এ _প্রকাশ_ করতে সহায়ক, কিন্তু schema তাদের সাথে বা ছাড়াই থাকে। ORM আগে design করলে এমন schema হয় যা code-এ ভালো পড়ায় কিন্তু SQL-এ খারাপ — N+1, polymorphic FK-এর কসরত, denormalized আবর্জনা field যেগুলো কেউ ফেলে দিতে পারে না।

**এটা "API যে database ফেরত দেয়" তা নয়।** আপনার API response schema থেকে _projected_, কিন্তু schema-ই হলো source of truth। একটা সাধারণ ভুল: table-কে আজকের frontend যে JSON shape চায় তার সাথে মিলিয়ে বানানো, তারপর আবিষ্কার করা যে আগামীকালের frontend আলাদা shape চায় আর schema সহজে সেটা দিতে পারে না।

**এটা শুধু "কোন column যোগ করব" তা নয়।** এটা হলো schema কোন কোন _invariant_ enforce করে। `orders`-এর ওপর কোনো constraint ছাড়া একটা `status` column নিছক একটা string। একটা `CHECK (status IN ('pending','paid','shipped','canceled'))` হলো schema বলছে _এগুলোই একমাত্র বৈধ মান_। প্রথমটা bug ঢুকতে দেয়; দ্বিতীয়টা সেগুলো নিষিদ্ধ করে।

## কেন schema বাকি সবকিছুকে ছাড়িয়ে টিকে থাকে

তিনটা শক্তি schema বদলানোর বিরুদ্ধে কাজ করে:

1. **Data তার ভেতরে থাকে।** ৫ কোটি row-এর একটা table এমন জিনিস যা আপনি সাবধানে migrate করেন, replace করেন না।
2. **অনেক reader তার ওপর নির্ভর করে।** আপনার API, batch jobs, analytics query, যে dashboard আপনার CEO প্রতি সোমবার load করেন — সব লেখা হয়েছে table name আর column name-এর বিরুদ্ধে। একটা column rename করা একটা coordination সমস্যা।
3. **Schema-র shape code-এর shape নির্ধারণ করে।** প্রতি subscription-এ এক row-ওয়ালা একটা `subscription` table এক set code path-এ নিয়ে যায়; append-only row-ওয়ালা একটা `subscription_event` table আলাদা set-এ নিয়ে যায়। প্রতিটা path এমন feature-কাজ টেনে আনে যা তার shape ধরে নেয়। সেই ধারণা উল্টানো মানে পুরো app জুড়ে refactor।

Schema খায় এমন code একটা weekend-এ আবার লেখা যায়। Schema নিজে ছোট পরিবর্তনের জন্যও সপ্তাহ ধরে expand-contract migration লাগায় (অধ্যায় ১০)। সেই অনুযায়ী পরিকল্পনা করুন।

## একটা schema যে চারটা প্রশ্নের উত্তর দেয়

একটা ভালো schema এই প্রশ্নগুলোর উত্তর application code-কে জিজ্ঞেস না করেই দেয়:

**১. কী store করা যাবে?** Types, lengths, NOT NULL, regex constraints। Schema insert-এর সময়েই খারাপ data প্রত্যাখ্যান করে। App code-এ কোনো `if x.length > 200` নয়; শুধু `varchar(200) NOT NULL`।

**২. সবসময় কী সত্য?** Foreign keys মানে "প্রতিটা order এমন এক user-এর যে বিদ্যমান।" Unique constraint মানে "দুইজন user একই email share করে না।" CHECK constraint মানে "amount > 0।" এগুলো _invariant_ — data-র এমন property যা একটা explicit transaction ছাড়া সাময়িকভাবেও ভাঙা যায় না।

**৩. জিনিসগুলো কীভাবে সম্পর্কিত?** Foreign keys one-to-many আর many-to-many relationship বানান করে দেয়। Schema-ই সত্য; application তা পড়ে।

**৪. এটা কীভাবে বদলাবে?** Schema evolution নিজেই একটা design constraint। Surrogate keys বাছা (অধ্যায় ৩) rename-এর আগাম প্রস্তুতি। Nullable field বাছা নতুন optional data-র আগাম প্রস্তুতি। চওড়া unique constraint এড়ানো performance পরিবর্তনের আগাম প্রস্তুতি। Schema শুধু আজকের নয়, পরের দশ বছরের পরিকল্পনা করে।

## একটা চিন্তার পরীক্ষা

আপনি একটা marketplace বানাচ্ছেন। Users listing post করে। Buyers listing favorite করে, তারপর কেনে। Orders ship হয়।

সরল প্রথম model:

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, email TEXT, name TEXT);
CREATE TABLE listings (id BIGSERIAL PRIMARY KEY, user_id BIGINT, title TEXT, price NUMERIC);
CREATE TABLE orders (id BIGSERIAL PRIMARY KEY, listing_id BIGINT, buyer_id BIGINT, status TEXT);
```

তিনটা table, দেখতে যুক্তিসঙ্গত। কিন্তু — সমস্যা কোথায়?

- **`users.email` unique নয়।** দুইজন user একই email দিয়ে sign up করতে পারে। Login দ্ব্যর্থক হয়ে যায়।
- **`listings.user_id`-এ কোনো foreign key নেই।** একটা listing এমন user-কে reference করতে পারে যে নেই। Orphan এখন সম্ভব।
- **`orders.status` freeform text।** অর্ধেক row বলে "shipped"; অর্ধেক বলে "Shipped"; একটা বলে "shippped" কারণ কেউ ভুল টাইপ করেছে।
- **`listings.price` scale ছাড়া `NUMERIC`।** এটা `12.345678` store করতে পারে — যে currency আপনি প্রকাশই করতে পারেন না।
- **কোথাও কোনো timestamp নেই।** আপনি "গত মাসের order দেখাও" প্রশ্নের উত্তর দিতে পারবেন না। আরও খারাপ, কখন bug ঢুকেছে তা বলতে পারবেন না।
- **`listings`-এর কোনো soft state নেই।** একজন seller যখন একটা listing delete করে, তখন যে order সেটা reference করে তার কী হবে? `ON DELETE CASCADE` order history মুছে ফেলে; `ON DELETE RESTRICT` seller-কে delete করতে বাধা দেয়; `ON DELETE SET NULL`-এর জন্য order-এর দিকে `listings.id` nullable হতে হবে।

দ্বিতীয় pass:

```sql
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  email       CITEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id          BIGSERIAL PRIMARY KEY,
  seller_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  price_cents BIGINT NOT NULL CHECK (price_cents > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'canceled');

CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  listing_id  BIGINT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  buyer_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status      order_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

একই তিনটা table, কিন্তু এখন:

- Email uniqueness enforce করা। `CITEXT` একে case-insensitive করে — `Fatima@Example.com` আর `fatima@example.com` একই row।
- Foreign keys relationship বানান করে দেয়। Seller-এর listing থাকলে তাদের delete করা যায় না; সেটা একটা ইচ্ছাকৃত পছন্দ (`RESTRICT`), দুর্ঘটনা নয়।
- Status একটা enum — শুধু পাঁচটা বৈধ মান গ্রহণ করা হয়।
- Price হলো `BIGINT cents`, floating-point dollar নয় (অধ্যায় ৩-এ পুরো যুক্তি আছে)।
- প্রতিটা table-এ `created_at` আছে। Production-এ এটা কতটা সাহায্য করে তা বলে শেষ করা কঠিন।
- Listing-এ soft delete-এর জন্য একটা `archived_at` আছে (অধ্যায় ৭), physically সরিয়ে ফেলার বদলে।

Column আর table বদলায়নি। বদলেছে _schema যে প্রতিশ্রুতিগুলো দেয়_ সেগুলো। সেটাই data modeling।

## Modeling-এর সবচেয়ে বেশি লাভ একঘেয়ে ক্ষেত্রগুলোতে

চটকদার schema সমস্যা — sharding, replication, CRDT — সংবাদপত্রে আসে। হাজার গুণ রিটার্ন আসে একঘেয়ে জিনিস থেকে:

- একটা `created_at` column যা ops-কে ভোর ৩টার একটা page ৯০ মিনিটের বদলে ৯০ সেকেন্ডে debug করতে দেয়।
- একটা unique constraint যা একটা registration bug-এর সময় ৮০০টা duplicate user row তৈরি হওয়া ঠেকায়।
- একটা foreign key যা আপনার অনিচ্ছাকৃত delete cascade QA-তে দেখা দেওয়ার আগেই ধরে ফেলে।
- একটা CHECK constraint যা একজন developer buggy admin form push করার মুহূর্তেই negative price প্রত্যাখ্যান করে।

এর একটাও চতুর feature নয়। সবগুলোই আসল সময়, আসল টাকা, আসল customer-বিশ্বাস বাঁচায়। **Schema হলো application bug-এর বিরুদ্ধে আপনার শেষ রক্ষণরেখা।**

<Callout type="tip">

**যদি একটা invariant schema-তে encode করতে পারেন, করুন।** Constraint failure জোরালো — database খারাপ data গ্রহণ করতে অস্বীকার করে, app একটা পরিষ্কার error পায়, আপনি bug ঠিক করেন। শুধু app code-এ enforce করা invariant সময়ের সাথে সরে যায়, বিশেষত এমন service-গুলোর মধ্যে যারা একটা database share করে।

</Callout>

## কখন শুরুতেই ভারী modeling _করবেন না_

উল্টো ভুলটাও আছে। যে idea তার প্রথম user-ই টেকে না, তার নিখুঁত schema-র পেছনে দুই সপ্তাহ খরচ করা হলো নষ্ট কাজ। দ্রুত এগোনোর তিনটা সৎ ক্ষেত্র:

1. **Prototypes.** একটা `data JSONB` সহ চওড়া table ব্যবহার করুন আর shape পরে ঠিক করুন। যখন সত্যিই ship করবেন তখন refactor করুন।
2. **সত্যিকারের schemaless data.** Logs, audit events, telemetry — append-only, বেশিরভাগ পড়ে এমন tool যারা নিজেদের typing নিজেই সামলায়। প্রতিটা event type-কে একটা কঠোর table হিসেবে model করা হলো overhead।
3. **প্রবল domain অনিশ্চয়তা।** যখন আপনি এখনও জানেন না একটা "order" আসলে কী, তখন ১২টা column name locking-in করা অকালপক্ব। Code-এ sketch করুন, shape যাচাই করুন, তারপর formalize করুন।

ফাঁদ: যারা বলে "পরে formalize করব" তারা কদাচিৎ করে। JSONB-র স্তূপ স্থায়ী schema হয়ে যায়। `JSONB`-র দিকে হাত বাড়ান এটা জেনে যে আপনাকে হয়তো migrate out করতে হবে — অধ্যায় ৯-এ পুরো pattern আছে।

## যে tool-গুলো সাহায্য করে

একটা ছোট তালিকা, vendor-নিরপেক্ষ:

- schema ঘাঁটার জন্য **`psql`**। `\d table_name` command আপনার সবচেয়ে বেশি ব্যবহৃত schema tool।
- environment-গুলোর মধ্যে schema তুলনা করতে **`pg_dump --schema-only`**।
- ER diagram-এর জন্য **dbdiagram.io / mermaid**। মিনিটে ১০ সেকেন্ডের sketch যেকোনো IDE-কে হারায়।
- migration tooling-এর জন্য **sqitch / atlas / golang-migrate**। একটা বাছুন আর তাতে থাকুন।
- schema query-র সময় কত খরচ করে তা বুঝতে **`EXPLAIN ANALYZE`**। মেপে না দেখে modeling করা মানে আন্দাজ করা।

Postgres-নির্দিষ্ট power tool — `pg_stat_statements`, `pg_stat_user_indexes`, `auto_explain` — **Databases self-hosted** track-এ কাজে আসে।

## সারসংক্ষেপ

- একটা schema-র তিনটা layer আছে: conceptual, logical, physical। বেশিরভাগ modeling সিদ্ধান্ত logical layer-এ।
- Schema তার চারপাশের প্রতিটা framework-কে ছাড়িয়ে টিকে থাকে। সেই অনুযায়ী একে দেখুন।
- ভালো schema চারটা প্রশ্নের উত্তর দেয়: কী store করা যাবে, সবসময় কী সত্য, জিনিসগুলো কীভাবে সম্পর্কিত, এটা কীভাবে বদলাবে।
- সম্ভব হলে invariant schema-তে (constraint) থাকা উচিত — শেষ রক্ষণরেখা।
- জয়গুলো বেশিরভাগ একঘেয়ে: timestamps, NOT NULL, unique constraint, foreign key।
- Prototype JSONB ব্যবহার করে পরে ঠিক করতে পারে, migration খরচ মাথায় রেখে।
- Tools: `psql`, ER sketch, একটা আসল migration tool, EXPLAIN।

পরবর্তী: [Entities, attributes, relationships](/notes/data-modeling/02-entities-relationships) — ER-চিন্তা, SQL-এর আগে।
