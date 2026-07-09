---
title: 'Denormalization'
subtitle: 'কখনো কখনো একই fact ইচ্ছাকৃতভাবে দুই জায়গায় থাকে। ঠিকভাবে করলে hot query উড়তে থাকে। বাজেভাবে করলে ঠিক সেই drift তৈরি হয় যা ঠেকানোর জন্য normalization বানানো হয়েছিল।'
chapter: 5
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['data-modeling', 'denormalization', 'performance', 'caching']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Chapter 4-এ বলা হয়েছিল: প্রতিটি fact ঠিক একটা জায়গায় থাকে। এটাই সঠিক default। এই chapter হলো কখন ইচ্ছাকৃতভাবে সেটা ভাঙবেন, আর কীভাবে সেই মিথ্যাটাকে consistent রাখবেন যাতে পরে সেটা আপনাকে কামড় না দেয়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

আপনার boarding pass-এ flight number লেখা একটা sticky note সেঁটে দেওয়া — data duplicate হচ্ছে, কিন্তু প্রতিবার খুঁজে বের করতে হচ্ছে না।

</Callout>

## কেন আদৌ denormalize করবেন

তিনটা বৈধ কারণ।

**1. Read performance.** একটা 5-table JOIN সঠিক কিন্তু expensive। যদি একটা hot query দিনে লক্ষ লক্ষ বার চলে, তাহলে কয়েকটা field denormalize করলে latency 10× কমতে পারে।

**2. Historical accuracy.** কিছু data-কে অবশ্যই "তখন যা সত্য ছিল" তা প্রতিফলিত করতে হবে। Order-এর line item-এ customer যে দাম দিয়েছিল সেটা রাখা উচিত, বর্তমান product price নয়।

**3. Atomic invariants.** কখনো কখনো একটা value-কে অন্যটার সাথে consistent রাখতে হয় এমনকি source unreachable হলেও (cross-service eventual consistency, derived denormalization)।

প্রতিটাই আসল লাভ। প্রতিটার সাথেই একটা খরচ আছে — duplicate-গুলোকে sync-এ রাখা। এই chapter-এর বেশিরভাগই সেই bookkeeping নিয়ে।

## Read-performance denormalization

ক্লাসিক উদাহরণ: author-এর নাম সহ post-এর একটা list দেখানো।

কঠোর 3NF:

```sql
SELECT p.id, p.title, u.name AS author_name, COUNT(c.id) AS comment_count
FROM posts p
JOIN users u ON u.id = p.user_id
LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id, u.name
ORDER BY p.created_at DESC
LIMIT 20;
```

দুটো join, একটা aggregation। কয়েকশো post-এর জন্য ঠিক আছে; কয়েক মিলিয়নের জন্য slow। প্রতিটা post-এর জন্য author-এর নাম আবার fetch করা হয়; প্রতিটা query-তে comment count আবার হিসাব করা হয়।

Denormalized:

```sql
ALTER TABLE posts ADD COLUMN author_name TEXT;
ALTER TABLE posts ADD COLUMN comment_count INT NOT NULL DEFAULT 0;

-- backfill once
UPDATE posts SET author_name = u.name FROM users u WHERE u.id = posts.user_id;

-- query becomes
SELECT id, title, author_name, comment_count
FROM posts
ORDER BY created_at DESC
LIMIT 20;
```

কোনো JOIN নেই, কোনো aggregation নেই। Query এখন একটা সাধারণ index scan + LIMIT।

খরচ: একজন user-এর নামে প্রতিটা পরিবর্তন তার লেখা প্রতিটা post আপডেট করতে হবে। প্রতিটা comment insert/delete-এ parent post-এর counter আপডেট করতে হবে।

## Bookkeeping-এর অপশন

Denormalized data-কে sync-এ রাখার তিনটা pattern।

### 1. Application code

```go
func (s *Service) UpdateUserName(ctx context.Context, userID int64, newName string) error {
    tx, _ := s.db.BeginTx(ctx, nil)
    defer tx.Rollback()

    _, err := tx.Exec(`UPDATE users SET name = $1 WHERE id = $2`, newName, userID)
    if err != nil {
        return err
    }
    _, err = tx.Exec(`UPDATE posts SET author_name = $1 WHERE user_id = $2`, newName, userID)
    if err != nil {
        return err
    }
    return tx.Commit()
}
```

সুবিধা: explicit, পড়তে সহজ, সবটাই এক transaction-এ।
অসুবিধা: source আপডেট করে এমন প্রতিটা code path-কে duplicate আপডেট করার কথা মনে রাখতে হবে। একটা মিস করলেই → drift। একাধিক service জুড়ে এটা খুবই কঠিন হয়ে যায়।

### 2. Triggers

```sql
CREATE OR REPLACE FUNCTION update_post_author_name() RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts SET author_name = NEW.name WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_name_change
AFTER UPDATE OF name ON users
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name)
EXECUTE FUNCTION update_post_author_name();
```

সুবিধা: database level-এ enforce করা। Application code ভুলতে পারে না। Bookkeeping rule-এর একটাই source of truth।
অসুবিধা: বেশিরভাগ developer-এর কাছে trigger অদৃশ্য — যে SQL UPDATE "এমনিই কাজ করে" সেটা দেখানোর চেয়ে বেশি কিছু করছে। Debug করা কঠিন। Bulk operation-এর জন্য disable করা কঠিন।

### 3. Materialized views

```sql
CREATE MATERIALIZED VIEW post_listing AS
SELECT p.id, p.title, u.name AS author_name, COUNT(c.id) AS comment_count
FROM posts p
JOIN users u ON u.id = p.user_id
LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id, u.name;

CREATE UNIQUE INDEX ON post_listing(id);

-- refresh on schedule
REFRESH MATERIALIZED VIEW CONCURRENTLY post_listing;
```

সুবিধা: কোনো application পরিবর্তন নেই; refresh write থেকে decoupled। Analytics বা "near-real-time" dashboard-এর জন্য ভালো।
অসুবিধা: দুই refresh-এর মাঝে data stale থাকে। বড় dataset-এ `REFRESH` expensive হতে পারে।

বেশিরভাগ product feature-এর জন্য একই transaction-এর ভেতরে application-level bookkeeping সবচেয়ে পরিষ্কার। Bookkeeping যখন অনেক table জুড়ে ছড়ায় বা আপনাকে write-কে খরচ থেকে আলাদা রাখতে হয়, তখন trigger আর materialized view তাদের জায়গা করে নেয়।

## Counter column

একটা নির্দিষ্ট কেস আলোচনা করার মতো: একটা count রাখা।

```sql
CREATE TABLE posts (
  id            BIGSERIAL PRIMARY KEY,
  ...
  comment_count INT NOT NULL DEFAULT 0
);
```

Application code এটা maintain করে:

```go
func (s *Service) AddComment(ctx context.Context, postID int64, body string) error {
    tx, _ := s.db.BeginTx(ctx, nil)
    defer tx.Rollback()

    _, err := tx.Exec(`INSERT INTO comments(post_id, body) VALUES($1, $2)`, postID, body)
    if err != nil { return err }

    _, err = tx.Exec(`UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1`, postID)
    if err != nil { return err }

    return tx.Commit()
}
```

প্রতি comment-এ দুটো write, এক transaction। 10M-row comments table-এ `SELECT COUNT(*)`-এর চেয়ে ভালো।

সাবধানতা:

- **Concurrency.** দুটো একসাথে comment insert দুটোকেই সঠিকভাবে increment করতে হবে। Postgres UPDATE-এর সময় `posts` row-এ row lock দিয়ে এটা handle করে; দুটোই serial-ভাবে সফল হয়।
- **Drift recovery.** Counter কখনো ভুল হয়ে গেলে (একটা bug, trigger বাদ দেওয়া একটা manual delete), আপনার একটা reconciliation job দরকার: `UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = posts.id);`। নিয়মিত চালান।
- **যে count দেখান না তা denormalize করবেন না।** যদি `comment_count` শুধু per-post page-এ দেখায় যেখানে আপনি সস্তায় `SELECT COUNT(*) WHERE post_id = ?` করতে পারেন, তাহলে denormalization হলো এমন overhead যা আপনার দরকার নেই।

## Historical denormalization

আরেকটা বড় কেস: source পরিবর্তন হতে পারে বলে data-র snapshot নেওয়া।

```sql
CREATE TABLE order_items (
  order_id     BIGINT NOT NULL REFERENCES orders(id),
  product_id   BIGINT NOT NULL REFERENCES products(id),
  quantity     INT NOT NULL,
  unit_price_cents BIGINT NOT NULL,    -- snapshot, not FK
  product_name TEXT NOT NULL,           -- snapshot
  PRIMARY KEY (order_id, product_id)
);
```

`unit_price_cents` আর `product_name` দেখতে 3NF violation-এর মতো — canonical price আর name থাকে `products`-এ। এগুলো ইচ্ছাকৃত snapshot।

Seller ছয় মাস পর product-এর দাম পাল্টালে, এই order-এর history পাল্টায় না। Customer দিয়েছিল `4200`; receipt-এ লেখা `4200`। Ledger স্থায়ী।

যেকোনো _event_, _transaction_, বা _historical record_-এর জন্য এটাই সঠিক উত্তর। Write-এর সময় relevant field-গুলোর snapshot নিন। Source-of-truth table-গুলো স্বাধীনভাবে পাল্টাতে পারে।

Bookkeeping rule: **historical denormalization হলো write-once।** Order তৈরি হয়ে গেলে, সেই column-গুলো আর কখনো আপডেট হয় না। কোনো trigger দরকার নেই।

## Cross-service denormalization

একটা multi-service architecture-এ, service boundary জুড়ে normalization সম্ভবই না — canonical user data থাকে User Service-এ; আপনার Orders Service সস্তায় সেটার বিরুদ্ধে JOIN করতে পারে না।

Pattern: source-of-truth service থেকে event subscribe করুন আর একটা local copy maintain করুন।

```sql
-- In the orders database
CREATE TABLE customers_cache (
  id          BIGINT PRIMARY KEY,        -- matches user service's id
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL
);
```

Orders service user service থেকে একটা user.updated event stream-এ subscribe করে। প্রতিটা event এই cache আপডেট করে। `customers_cache`-এ local join fast আর এতে network hop লাগে না।

এটা মূলত GraphQL track-এর N+1 নিয়ে chapter-এর মতোই একই pattern — data duplicate করুন, eventual consistency মেনে নিন, fast read পান।

এখানে trade-off আসল: data _eventually_ consistent। যে user নিজের নাম পাল্টায় তার order-গুলোতে কয়েক সেকেন্ড (বা মিনিট) পুরনো নাম থাকবে। Display-এর জন্য গ্রহণযোগ্য; billing বা compliance-এর জন্য না।

## মানুষ যেভাবে ভুল denormalize করে

**1. "পারফরম্যান্সের জন্য just denormalize করে দিই" কোনো মাপজোক ছাড়া।** Premature denormalization। JOIN সম্ভবত ঠিকই ছিল। আগে profile করুন।

**2. প্রতিটা column denormalize করা।** Duplicate set যখন 2-3 field ছাড়িয়ে যায়, ভেবে দেখুন source table আদৌ এই query-তে থাকা উচিত কিনা — কখনো read pattern তার নিজের একটা table চায় (একটা আসল materialized view, একটা indexed view, বা Redis-এর মতো আলাদা cache)।

**3. পুরো record store করা।** পুরো user blob সহ একটা `posts.author_data JSONB` মানে প্রতিটা user পরিবর্তন প্রতিটা post আপডেট করে। Access pattern-এ যদি পুরো user আসলে দরকার না হয়, তাহলে শুধু ব্যবহৃত field-গুলোর snapshot নিন (`author_name`, `author_avatar`)।

**4. Reconciliation ভুলে যাওয়া।** যথেষ্ট সময় ধরে চলা যেকোনো system-এ denormalized data drift করে — একটা bug, একটা missed event, migration-এর সময় একজন developer-এর ভুল। সবসময় একটা script রাখুন যা source-of-truth থেকে recompute করে তুলনা করে।

```sql
-- Reconcile post.comment_count
SELECT
  p.id,
  p.comment_count AS stored,
  COUNT(c.id) AS actual
FROM posts p
LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id, p.comment_count
HAVING p.comment_count <> COUNT(c.id);
```

সাপ্তাহিক চালান। Row ফেরত এলে alert দিন।

<Callout type="warn">

**Denormalization একটা debt।** আপনি একটা fact-এর দুটো copy চিরকাল sync-এ রাখার প্রতিশ্রুতি দিচ্ছেন। নতুন feature ship করা team যদি না জানে duplicate-টা আছে, তারা সেটা আপডেট করতে ভুলে যাবে। schema-তে প্রতিটা denormalization document করুন (column comment, ADR, ARCHITECTURE.md), আর reconciliation query লিখুন।

</Callout>

## কখন পুরোপুরি denormalization এড়িয়ে যাবেন

Pure 3NF ঠিক আছে যখন:

- Read pattern-এ JOIN fast হওয়া দরকার নেই (admin page, মাঝেমধ্যের dashboard)।
- Index-ই JOIN-কে fast করে দেয় (`SELECT * FROM posts WHERE user_id = ?` FK index সহ)।
- Duplicate ঘন ঘন পাল্টাবে। Sync cost > read win।
- একটা cache (Redis, CDN) hot read path handle করে। Cache-এর invalidation আছে, কিন্তু সেটা localized — স্থায়ী schema commitment নয়।

Denormalization-এর দিকে হাত বাড়ান শুধু তখনই যখন:

- একটা নির্দিষ্ট query প্রমাণিতভাবে slow।
- "সঠিক" fix কোনো index নয়।
- আপনি একটা পরিষ্কার reconciliation check লিখতে পারেন।

## Postgres-নির্দিষ্ট tool

কয়েকটা feature যা হিসাবটা পাল্টে দেয়:

**Generated columns.** Write-এর সময় compute হয়, automatically store হয়। Manual bookkeeping ছাড়াই denormalization দেয়।

```sql
ALTER TABLE invoices ADD COLUMN total NUMERIC GENERATED ALWAYS AS (subtotal * (1 + tax_rate)) STORED;
```

**`pg_partman` partitioning.** Table যখন বিশাল, date বা tenant দিয়ে partition করলে data denormalize না করেই read performance-এর সুবিধা পাওয়া যায়।

**`tsvector` columns.** একটা denormalized search index, GIN দিয়ে index করা যায়। কোনো external index ছাড়াই full-text search-এর জন্য ব্যবহৃত।

**Arrays.** একটা GIN index সহ `tags TEXT[]` column "tag X আছে এমন post খুঁজে বের করো"-র জন্য একটা 1NF-ভাঙা shortcut হতে পারে। Tag আর label-এর জন্য ভালো; নিজস্ব attribute থাকা relation-এর জন্য খারাপ।

## Recap

- Default হলো 3NF। শুধু মাপা কারণে denormalize করুন।
- তিনটা কারণ: read performance, historical accuracy, cross-service।
- তিনটা sync mechanism: app code, trigger, materialized view।
- Counter column সবচেয়ে সাধারণ। এদের একই transaction-এ রাখুন; একটা reconciliation job রাখুন।
- Historical denormalization হলো write-once — তৈরির সময় snapshot নিন, কখনো আপডেট করবেন না।
- Cross-service cache eventually consistent। Billing, compliance-এর জন্য ব্যবহার করবেন না।
- Anti-pattern: profiling ছাড়া denormalize করা, পুরো record কপি করা, reconciliation না রাখা।
- Postgres tool — generated column, partition, array, tsvector — কম ঝুঁকিতে denormalization দেয়।

পরবর্তী: [Constraints](/notes/data-modeling/06-constraints) — schema-র শেষ প্রতিরক্ষা।
