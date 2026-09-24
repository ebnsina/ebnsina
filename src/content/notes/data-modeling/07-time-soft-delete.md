---
title: 'টাইম আর সফট ডিলিট'
subtitle: "এমন টাইমস্ট্যাম্প যা টাইম জোন পেরিয়েও টিকে থাকে, সফট ডিলিট যা প্রতিটা query-কে বিষিয়ে তোলে না, আর history টেবিল যা 'গত মঙ্গলবার এটা দেখতে কেমন ছিল?' এর উত্তর দেয়"
chapter: 7
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['data-modeling', 'timestamps', 'soft-delete', 'history', 'time-zones']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

সময়ের দুটো বৈশিষ্ট্য এটাকে যেকোনো ডেটা টাইপের চেয়ে বেশি schema বাগের উৎস বানিয়ে ফেলে। প্রথমত, টাইম জোন — একই instant আপনি পাঁচ ভাবে store করতে পারেন, আর তার তিনটাই ভুল হবে। দ্বিতীয়ত, অতীত — বেশিরভাগ অ্যাপকে শেষমেশ জানতে হয় "গত সপ্তাহে কী সত্যি ছিল," আর naïve schema সেটার উত্তর দিতে পারে না।

এই চ্যাপ্টারে সেই প্যাটার্নগুলো আছে যেগুলো কাজ করে: সবখানে `TIMESTAMPTZ`, ডিফল্ট হিসেবে তিনটা কাজের timestamp কলাম, সঠিক ভাবে করা soft delete, আর history টেবিল।

<Callout type="info">

**বাস্তব জীবনের উপমা**

পার্মানেন্ট ডিলিটের বদলে একটা archive ফোল্ডার — ইমেইলটা আপনার inbox থেকে গায়েব, কিন্তু এখনও ফিরিয়ে আনা যায়।

</Callout>

## গল্পে বুঝি

বুখারার এক পুরনো বাজারে সিনা হিসাব রাখেন একটা মোটা খাতায়। তাঁর একটাই নিয়ম — খাতা থেকে কোনো এন্ট্রি কখনও রাবার দিয়ে মোছা যাবে না। প্রতিটা লেনদেন লেখার সময় তিনি পাশে বসিয়ে দেন দুটো তারিখ: কবে প্রথম এন্ট্রিটা লেখা হলো, আর সবশেষে কবে সেটায় হাত পড়ল, মানে সংশোধন হলো। কোনো দোকানদার এসে দাম বদলালে সিনা পুরনো লাইন মোছেন না, শুধু সংশোধনের তারিখটা নতুন করে বসিয়ে দেন।

এক সকালে খোয়ারিজমি এসে একটা লেনদেন বাতিল করতে বললেন। সিনা রাবার ধরলেন না — বদলে ওই লাইনটার ওপর পরিপাটি একটা দাগ টেনে পাশে লিখলেন "১২ রজব তারিখে বাতিল"। লাইনটা খাতায় থেকেই গেল, শুধু দিনের মোট হিসাব কষার সময় তিনি দাগ-দেওয়া লাইনগুলো বাদ দিয়ে যোগ করেন। পরের সপ্তাহে ফাতিমা এসে বললেন বাতিলটা ভুল হয়েছিল — সিনা নিশ্চিন্তে দাগটা তুলে দিলেন, এন্ট্রি আবার জীবন্ত, কারণ সেটা কখনও মুছেই ফেলা হয়নি।

এই খাতাই আসলে আমাদের schema। লেখার আর সংশোধনের তারিখ দুটো হলো `created_at` আর `updated_at` timestamp — কবে row তৈরি হলো আর সবশেষে কবে বদলাল। রাবারে মোছার বদলে লাইনে দাগ টেনে "বাতিলের তারিখ" লেখাটাই soft delete — row মুছে না ফেলে একটা `deleted_at` বসিয়ে দেওয়া। ফলে পুরো ইতিহাস অক্ষত থাকে (audit) আর ভুল বাতিল অনায়াসে ফিরিয়ে আনা যায় (restore), অথচ দিনের মোট হিসাব দাগ-দেওয়া লাইন বাদ দেয় — ঠিক যেমন query-তে `WHERE deleted_at IS NULL` দিয়ে soft-deleted row ছেঁকে বাদ দেওয়া হয়। বাস্তবেও ব্যাংক, অ্যাকাউন্টিং সফটওয়্যার বা যেকোনো compliance-নির্ভর সিস্টেম ঠিক এভাবেই ডেটা কখনও সত্যিকারভাবে মোছে না — মার্ক করে রাখে, যাতে "গত মাসে এটা দেখতে কেমন ছিল" প্রশ্নের উত্তর সবসময় থাকে।

## Timestamp — `TIMESTAMPTZ`, সবসময়

Postgres-এ দুই ধরনের timestamp টাইপ আছে:

- `TIMESTAMP` (টাইম জোন ছাড়া): কোনো জোন ছাড়া একটা wall-clock মান। দেখতে সময়ের একটা মুহূর্ত মনে হয়, কিন্তু আসলে নয়।
- `TIMESTAMPTZ` (টাইম জোন সহ): একটা UTC instant।

**সবসময় `TIMESTAMPTZ` ব্যবহার করুন।** এমনকি যখন আপনি "জানেন" ডেটা একটাই টাইম জোনে আছে। এমনকি যখন UI-তে টাইম জোন দেখানও না।

```sql
CREATE TABLE events (
  id          BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  ...
);
```

`TIMESTAMPTZ` ৮ বাইট store করে যা UTC সেকেন্ড + মাইক্রোসেকেন্ড রিপ্রেজেন্ট করে। যখন আপনি এটা পড়েন, Postgres আপনার session-এর টাইম জোনে কনভার্ট করে। যখন একটা মান লেখেন, Postgres UTC-তে কনভার্ট করে। storage হলো canonical; display হলো লোকাল।

একটা কমন কনফিউশন: `TIMESTAMPTZ` কিন্তু যে টাইম জোনে ডেটা লেখা হয়েছিল সেটা **store করে না**। এটা শুধু UTC store করে। নামের "with time zone" অংশটা আসলে এই বোঝায় যে এটা টাইম-জোনসহ input গ্রহণ করে আর কনভার্ট করে।

আপনার যদি ইউজারের মূল টাইম জোনও জানার দরকার হয় (যেমন booking অ্যাপে যেখানে "টোকিও সময় সকাল ৯টা" DST শিফট হলেও "টোকিও সময় সকাল ৯টা"-ই থাকতে হবে), তাহলে জোনটা আলাদা করে store করুন:

```sql
CREATE TABLE bookings (
  id            BIGSERIAL PRIMARY KEY,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  scheduled_tz  TEXT NOT NULL,  -- 'Asia/Tokyo'
  ...
);
```

এখন storage/sorting-এর জন্য UTC আছে আর display-র জন্য জোন আছে।

<Callout type="warn">

**নতুন ডেটার জন্য কখনও `TIMESTAMP` (টাইম জোন ছাড়া) ব্যবহার করবেন না।** এটা এমন একটা footgun যা প্রথম daylight-saving সীমানা বা প্রথমবার একাধিক region-এ deploy করা পর্যন্ত "কাজ করে"। ৮ বাইট একই; কিন্তু correctness এক নয়।

</Callout>

## তিনটা ডিফল্ট timestamp

প্রায় প্রতিটা entity টেবিল তিনটা timestamp থেকে উপকৃত হয়:

```sql
CREATE TABLE posts (
  id          BIGSERIAL PRIMARY KEY,
  ...
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
```

**`created_at`** — row-টা প্রথম কবে insert হয়েছিল। একবার সেট হয়, আর কখনও বদলায় না।

**`updated_at`** — row-টা শেষ কবে বদলানো হয়েছিল। প্রতিটা UPDATE-এ আপডেট হয়।

**`deleted_at`** — soft-delete মার্কার (নিচে আরও)। NULL মানে active।

`updated_at`-এর maintenance:

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_set_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
```

এখন `posts`-এ প্রতিটা UPDATE অটোমেটিক `updated_at` রিফ্রেশ করে। প্রতিটা entity টেবিলে এই trigger লাগান — টেবিলপ্রতি এক লাইন কপি।

Application-লেভেল বিকল্প: app কোডে প্রতিটা UPDATE-এ `updated_at = now()` রাখা। কাজ করে, কিন্তু ভুলে যাওয়া সহজ।

তিনটা timestamp-এরই সুবিধা:

- "এটা কখন খারাপ হলো?" → `created_at`।
- "এটা সম্প্রতি কি ছোঁয়া হয়েছে?" → `updated_at`।
- "এটা আর দেখছি না কেন?" → `deleted_at`।

Production debugging-এ এই তিনটা কলাম প্রথম প্রশ্নের উত্তর ৮০% সময়ই দিয়ে দেয়।

## Soft delete

Soft delete একটা row-কে ফিজিক্যালি রিমুভ না করেই deleted হিসেবে মার্ক করে।

```sql
ALTER TABLE posts ADD COLUMN deleted_at TIMESTAMPTZ;

-- "deleting"
UPDATE posts SET deleted_at = now() WHERE id = 42;

-- "active" rows
SELECT * FROM posts WHERE deleted_at IS NULL;
```

Soft-delete করার কারণ:

- **Recovery.** "Undelete" মানে একটা মাত্র UPDATE।
- **Audit.** compliance, debugging, analytics-এর জন্য row-এর history রক্ষা পায়।
- **Foreign key safety.** যে deleted row এখনও অন্য টেবিল থেকে FK দিয়ে রেফারেন্স করা হচ্ছে সেটা cascade বিশৃঙ্খলা তৈরি করে না।
- **Cross-system replication.** downstream cache আর analytics ডিলিশনটাকে একটা missing row হিসেবে না দেখে একটা state change হিসেবে দেখতে পারে।

খরচটা: প্রতিটা query-কে `WHERE deleted_at IS NULL` মনে রাখতে হয়। একবার ভুলে গেলে আপনার "list posts"-এ deleted পোস্টও চলে আসে। আরও খারাপ, "count posts" ডাবল-কাউন্ট করে; "slug দিয়ে post খোঁজা" deleted ভার্সন রিটার্ন করতে পারে।

### সফট-ডিলিটের ফাঁদ

ফাঁদটা বাস্তব। তিনটা failure mode:

**১. ভুলোমনা query.** নতুন একটা endpoint deleted row রিটার্ন করে কারণ ডেভেলপার filter-টা ভুলে গেছে। কমন, টেস্ট করা কঠিন (dev-এ deleted row বিরল)।

**২. Unique constraint ভেঙে যায়।** `email UNIQUE` `a@b.com` ইমেইলওয়ালা একটা deleted ইউজারকে একই ইমেইলওয়ালা নতুন ইউজারের সাথে সহাবস্থান করতে দেয় না। হয় ইউজার sign up করতে পারে না, নয়তো deleted দিকটায় আপনাকে এটা allow করতে হয়।

**৩. Performance drag.** Index-এ deleted row-ও থাকে। query আরও বেশি page scan করে। যে টেবিলে প্রচুর delete হয় সেখানে এটা জমে ওঠে।

প্রতিটার mitigation:

**ভুলোমনা query-র জন্য:** একটা view ব্যবহার করুন।

```sql
CREATE VIEW posts_active AS SELECT * FROM posts WHERE deleted_at IS NULL;
```

App কোড display-র জন্য `posts_active` query করে। Admin টুল সরাসরি `posts` query করে। ডিফল্টটাই সঠিক; deleted ডেটায় ঢুকতে হলে আপনাকে ইচ্ছাকৃতভাবে opt in করতে হয়।

**Unique constraint-এর জন্য:** partial unique index।

```sql
CREATE UNIQUE INDEX users_email_active
ON users(email)
WHERE deleted_at IS NULL;
```

active ইউজারদের মধ্যে ইমেইল unique; deleted ইউজাররা তাদের পুরনো ইমেইল চিরকাল রাখতে পারে (বা আপনি সেটা মুছে দিতে পারেন)।

**Performance-এর জন্য:** সবখানে partial index।

```sql
CREATE INDEX posts_created_active
ON posts(created_at DESC)
WHERE deleted_at IS NULL;
```

Index-টা শুধু active row cover করে। active set-এর lookup দ্রুত; deleted row index-এ নেই।

খুব বেশি delete-হার হলে একটা cold টেবিলে **archiving** করার কথা ভাবুন:

```sql
-- nightly job
INSERT INTO posts_archive SELECT * FROM posts WHERE deleted_at < now() - interval '90 days';
DELETE FROM posts WHERE deleted_at < now() - interval '90 days';
```

active টেবিল ছোট থাকে; deleted history archive-এ থাকে। compliance lookup archive query করে।

## কখন soft-delete করবেন না

- **Deletion compliance আছে এমন sensitive ডেটা।** GDPR-এর "right to be forgotten" ব্যক্তিগত ডেটার সত্যিকার ডিলিশন দাবি করে। Soft-delete + অনুরোধে hard-delete একটা বৈধ প্যাটার্ন, কিন্তু hard delete-টাকে সত্যিই মুছে ফেলতে হবে।
- **Append-only log.** ইতিমধ্যেই ঐতিহাসিক; "delete" করার কোনো মানে হয় না।
- **সত্যিকার transient ডেটা।** ৩০ দিনের বেশি পুরনো notification, ephemeral session token। Hard delete।
- **Privacy-sensitive join.** একটা `user_messages` টেবিল যেখানে ইউজার deleted — তাদের মেসেজ soft-deleted রাখা একটা leak হতে পারে। Hard-delete করুন বা anonymize করুন।

## History টেবিল

Soft delete "কী delete হয়েছিল" রক্ষা করে। History টেবিল "কী বদলেছিল আর কখন" রক্ষা করে।

একটা সহজ প্যাটার্ন: একটা প্যারালাল `_history` টেবিল যা প্রতিটা state ক্যাপচার করে।

```sql
CREATE TABLE customers (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      CITEXT NOT NULL UNIQUE,
  plan       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers_history (
  history_id  BIGSERIAL PRIMARY KEY,
  id          BIGINT NOT NULL,
  name        TEXT NOT NULL,
  email       CITEXT NOT NULL,
  plan        TEXT NOT NULL,
  valid_from  TIMESTAMPTZ NOT NULL,
  valid_to    TIMESTAMPTZ
);
```

একটা trigger পরিবর্তনগুলো ক্যাপচার করে:

```sql
CREATE OR REPLACE FUNCTION customers_archive() RETURNS TRIGGER AS $$
BEGIN
  -- close out previous version
  UPDATE customers_history
  SET valid_to = now()
  WHERE id = OLD.id AND valid_to IS NULL;

  -- insert new version (the post-update snapshot)
  INSERT INTO customers_history(id, name, email, plan, valid_from)
  VALUES (NEW.id, NEW.name, NEW.email, NEW.plan, now());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_archive_trigger
AFTER INSERT OR UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION customers_archive();
```

এখন `customers_history` "২০২৬-০৪-০১ তারিখে customer 42-এর plan কী ছিল?" এর উত্তর দেয়:

```sql
SELECT plan FROM customers_history
WHERE id = 42
  AND valid_from <= '2026-04-01'
  AND (valid_to IS NULL OR valid_to > '2026-04-01');
```

প্যাটার্নের ভ্যারিয়েন্ট:

- **Append-only history টেবিল।** প্রতিটা UPDATE একটা নতুন row insert করে; পুরনো row-এ `valid_to` থাকে। উপরে যেমন।
- **Audit log.** কম structured: `change_log` টেবিল সহ `(table_name, row_id, action, changed_at, payload JSONB)`। বেশি flexible, কম queryable।
- **PostgreSQL temporal table (extension `temporal_tables`)।** history অটোমেটিক ম্যানেজ করে। জেনে রাখা মূল্যবান; extension-এর প্রতি আপনার সহনশীলতার ওপর নির্ভর করে।

বেশিরভাগ অ্যাপের জন্য প্রতিটা critical টেবিলে একটা append-only history-ই সহজ, সঠিক আকৃতি। প্রতিটা টেবিল history-track করার চেষ্টা করবেন না — শুধু সেগুলোই যেখানে "এই মুহূর্তে কী সত্যি ছিল" গুরুত্বপূর্ণ (compliance, billing, legal)।

## Time-range কলাম

Postgres-এ time range-এর জন্য `TSTZRANGE` আছে:

```sql
CREATE TABLE rentals (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id BIGINT NOT NULL,
  during TSTZRANGE NOT NULL,
  EXCLUDE USING GIST (vehicle_id WITH =, during WITH &&)
);
```

`during` কলাম একটা কলামেই start আর end দুটোই ক্যাপচার করে, "overlaps", "contains", "adjacent" অপারেটরের native সাপোর্টসহ। EXCLUDE constraint (চ্যাপ্টার 6) এর সাথে মিলিয়ে এটা schema লেভেলেই booking conflict ঠেকায়।

আপনার যদি এখন `start_at` আর `end_at` কলাম থাকে আর নিয়মিত `WHERE start_at &lt; $1 AND end_at > $2` টাইপের query লেখেন — এটা একটা সংকেত যে `TSTZRANGE` আরও পরিচ্ছন্ন হবে।

## সময় নিয়ে কমন ভুল

**১. সেকেন্ড আর মিলিসেকেন্ড মেশানো।** `created_at_ms` BIGINT বনাম `created_at_sec` INT। সব integer timestamp-এর জন্য একটা বেছে নিন — মিলিসেকেন্ড। অথবা সবখানে `TIMESTAMPTZ`-ই ব্যবহার করুন।

**২. লোকাল টাইমকে `TIMESTAMP` হিসেবে store করা।** "এটা তো শুধু একটা timestamp, কী এসে যায়?" DST হলে, সার্ভার region বদলালে, ইউজার টাইম জোন পার হলে — তখন এসে যায়।

**৩. `=` দিয়ে timestamp তুলনা করা।** `WHERE created_at = '2026-01-01'` UTC মধ্যরাতে cast করে। ইউজার বুঝিয়েছিল "১ জানুয়ারির যেকোনো সময়।" range ব্যবহার করুন: `WHERE created_at >= '2026-01-01' AND created_at &lt; '2026-01-02'`।

**৪. ক্লায়েন্টের clock-এ বিশ্বাস করা।** `INSERT INTO events(occurred_at) VALUES ($client_timestamp)` একটা বাগি বা malicious ক্লায়েন্টকে অতীতে বা ভবিষ্যতে event insert করতে দেয়। সার্ভারের নিয়ন্ত্রণে থাকা event-এর জন্য `now()` ব্যবহার করুন। ক্লায়েন্টের রিপোর্ট করা event-এর জন্য (verification সহ) `occurred_at` (ক্লায়েন্ট) আর `received_at` (সার্ভার) দুটোই সেট করুন।

**৫. `created_at`-এ `NOT NULL` ভুলে যাওয়া।** "Created at NULL" মানে "এটা কখন তৈরি হয়েছিল আমরা জানি না" — প্রায় সবসময়ই একটা বাগ। NOT NULL DEFAULT now() এটাকে অসম্ভব করে দেয়।

## রিক্যাপ

- সবখানে `TIMESTAMPTZ`। `TIMESTAMP` (জোন ছাড়া) একটা footgun।
- তিনটা ডিফল্ট timestamp: `created_at`, `updated_at`, `deleted_at`।
- `updated_at` trigger দিয়ে, যাতে app কোড ভুলে যেতে না পারে।
- Soft delete প্যাটার্ন: `deleted_at TIMESTAMPTZ` nullable, active-র জন্য view, performance আর uniqueness-এর জন্য partial index।
- Deletion compliance-এর আওতায় থাকা sensitive ডেটা soft-delete করবেন না।
- "কী সত্যি ছিল আর কখন" এর জন্য history টেবিল — append-only, `valid_from`/`valid_to` সহ।
- Booking-স্টাইল overlap ঠেকানোর জন্য `TSTZRANGE` + EXCLUDE।
- কমন বাগ: সেকেন্ড/ms মেশানো, timestamp-এ equality, ক্লায়েন্ট clock-এ বিশ্বাস, `created_at`-এ NULL allow করা।

পরবর্তী: [Multi-tenancy](/notes/data-modeling/08-multi-tenancy) — single-DB, schema-per-tenant, row-level security।
