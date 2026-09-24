---
title: 'Schema evolution'
subtitle: 'Live data-র বিরুদ্ধে প্রতিটা schema পরিবর্তনই একটা deploy। expand/contract pattern-ই যেভাবে আপনি এমন table বদলান যেখানে দশ লাখ row আর হাজারখানেক concurrent writer আছে — কোনো downtime ছাড়াই।'
chapter: 10
level: 'advanced'
readingTime: '13 মিনিট'
topics: ['data-modeling', 'migrations', 'expand-contract', 'zero-downtime']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনার একটা পুরনো তিনতলা বাড়ি, ভাড়াটেরা এখনো সবাই বসবাস করছে। মাঝখানের কাঠের সিঁড়িটা জীর্ণ হয়ে গেছে, নতুন একটা বসাতে হবে। এখন তিনি তো সবাইকে বাড়ি খালি করতে বলতে পারেন না — লোকজন প্রতিদিন ওঠানামা করছে, জীবন চলছে। তাই তিনি চালাক পথ ধরলেন। পুরনো সিঁড়িটা না ভেঙে, তার ঠিক পাশেই একটা নতুন সিঁড়ি বানিয়ে ফেললেন। দুটোই একসাথে দাঁড়িয়ে থাকল, কেউ পুরনোটা দিয়ে ওঠে, কেউ নতুনটা।

এরপর সিনা ধীরে ধীরে সবাইকে নতুন সিঁড়িতে অভ্যস্ত করালেন, একে একে সবার মালপত্র আর যাতায়াত নতুন সিঁড়ির দিকে সরিয়ে দিলেন। যতদিন না নিশ্চিত হলেন যে পুরনো সিঁড়িতে আর একজনও পা রাখে না, ততদিন সেটা দাঁড়িয়েই থাকল। তারপর, একদম শেষে, অব্যবহৃত পুরনো সিঁড়িটা ভেঙে ফেললেন। পুরো সময়টা জুড়ে বাড়িটা ভাড়াটে-ভর্তি, চালু, বসবাসযোগ্য থাকল — একটা রাতও কাউকে ঘরছাড়া হতে হলো না।

এটাই আসলে **expand/contract** pattern। পুরনো সিঁড়ির পাশে নতুন সিঁড়ি বানানো মানে পুরনো column-এর পাশে নতুন একটা **column** যোগ করা (**expand**)। মানুষ আর তাদের জিনিস সরিয়ে নেওয়া মানে **backfill** করে data ভরে দেওয়া আর app-কে নতুন column-এ **switch** করানো। কেউ ব্যবহার না করলে তবেই পুরনো সিঁড়ি ভাঙা মানে সবার শেষে পুরনো column **drop** করা (**contract**)। আর ভাড়াটেদের কখনো উচ্ছেদ না করাটাই live system-এ zero **downtime** — বাস্তবেও Postgres-এ একটা ব্যস্ত table rename বা type বদলাতে ঠিক এভাবেই কয়েকটা deploy-এ ভাগ করে কাজটা করা হয়, যাতে চলন্ত app কখনো ভেঙে না পড়ে।

একটা ছোট dev database-এ schema migration লাগে 50 মিলিসেকেন্ড। একই migration 100 মিলিয়ন row-র বিরুদ্ধে চালালে ঘণ্টার পর ঘণ্টা লাগতে পারে আর ততক্ষণ table-টা lock করে রাখতে পারে। "আমার migration চলল" আর "আমার migration operate করলাম" এর মধ্যে পার্থক্যটাই junior আর senior engineer-এর মধ্যেকার পার্থক্য।

এই চ্যাপ্টারে আছে সেই pattern-গুলো যা দিয়ে app বন্ধ না করেই live schema বদলানো যায়: expand/contract, সাবধানী ALTER, online index, আর সেই একঘেয়ে শৃঙ্খলা যা এটাকে রুটিন বানিয়ে দেয়।

<Callout type="info">

**বাস্তব জীবনের উপমা**

মানুষ এখনো বাস করছে এমন একটা বাড়ি সংস্কার করা — আপনি তো সব ভেঙে ফেলে নতুন করে শুরু করতে পারবেন না।

</Callout>

## "live" মানে কী

এই চ্যাপ্টারের বাকিটার জন্য দুটো ধরে নেওয়া:

1. **migration চলাকালীন application database-এ read আর write করছে।** কোনো "stop the world" maintenance window নেই। যথেষ্ট বড় প্রজেক্ট কখনোই একটা এর সামর্থ্য রাখে না।
2. **migration-টা roll back করতে সক্ষম হতে হবে।** কিছু ভেঙে গেলে, migration উল্টো করে আবার না চালিয়েই আপনাকে app code revert করতে পারতে হবে।

এই দুই ধরে-নেওয়া বেশিরভাগ "স্বাভাবিক" schema পরিবর্তন নিষিদ্ধ করে দেয়:

- `DROP COLUMN` — পুরনো কোড হয়তো এখনো এটা read করছে।
- `ALTER COLUMN ... TYPE` — ভিন্ন binary format, সম্ভবত দীর্ঘ table rewrite।
- `ADD COLUMN ... NOT NULL` — column-এর default না থাকলে আর table-এ row থাকলে fail করে।
- `RENAME COLUMN` — পুরনো কোড পুরনো নামটা reference করছে।

সমাধান: প্রতিটা পরিবর্তন হলো ছোট, আলাদা-আলাদাভাবে নিরাপদ ধাপের একটা ক্রম। **Expand → migrate → contract।**

## expand/contract pattern

যেকোনো structural পরিবর্তনের জন্য, তিনটি ধাপ:

**1. Expand।** পুরনোটার _পাশাপাশি_ নতুন shape যোগ করুন। দুটোই কাজ করে। পুরনো কোড পুরনোটা ব্যবহার করতে থাকে; নতুন কোড নতুনটা ব্যবহার করা শুরু করে।

**2. Migrate।** Backfill করুন, dual-write করুন, read switch করুন। নতুন shape এখন source of truth।

**3. Contract।** পুরনো shape সরিয়ে ফেলুন। পুরনো কোড চলে গেছে; পুরনো read redirect হয়ে গেছে।

প্রতিটা ধাপ আলাদা একটা deploy। ধাপগুলোর মাঝে, system সবসময় একটা consistent অবস্থায় থাকে।

## কাজে-খাটানো উদাহরণ: একটা column rename করা

পুরনো:

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, full_name TEXT NOT NULL);
```

আপনি `full_name`-কে `display_name`-এ rename করতে চান।

সরল উপায়: `ALTER TABLE users RENAME COLUMN full_name TO display_name`। তাৎক্ষণিক, কিন্তু নতুন app version deploy না হওয়া পর্যন্ত `full_name` reference করা প্রতিটা চলমান query ভেঙে দেয়।

Expand/contract সংস্করণ:

```sql
-- Step 1 (deploy A): add new column, backfill, dual-write
ALTER TABLE users ADD COLUMN display_name TEXT;
UPDATE users SET display_name = full_name WHERE display_name IS NULL;
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
```

App code-কে update করা হয় যাতে দুটো column-এই write করে:

```go
INSERT INTO users(full_name, display_name) VALUES($1, $1)
UPDATE users SET full_name = $1, display_name = $1 WHERE id = $2
```

Read এখনো `full_name` থেকে আসে। দুটো column synchronised থাকে।

```sql
-- Step 2 (deploy B): switch reads
```

App code-কে update করা হয় যাতে `display_name` থেকে read করে। `full_name` এখন অপ্রয়োজনীয়; rollback-এর ক্ষেত্রে সতর্কতার জন্য dual-write আরও কিছুক্ষণ রেখে দিই।

```sql
-- Step 3 (deploy C): stop writing to old column
```

App code dual-write বাদ দেয়। `full_name` এখন অব্যবহৃত।

```sql
-- Step 4 (deploy D): drop the column
ALTER TABLE users DROP COLUMN full_name;
```

একটা rename-এর জন্য চারটা deploy। কষ্টকর — কিন্তু প্রতিটা ধাপ reversible, আর কোনো মুহূর্তেই app crash করে না। কাস্টমার যে feature-এর উপর নির্ভরশীল, তার জন্য ধীর উপায়টাই একমাত্র উপায়।

কম-ঝুঁকির system-এর জন্য, আপনি এটাকে দুই deploy-এ সংকুচিত করতে পারেন (expand + dual-write একসাথে; পরে contract + drop)।

## ALTER TABLE lock

প্রতিটা `ALTER TABLE` কোনো-না-কোনো ধরনের lock নেয়। কোনটা নেয় তা জানা জরুরি:

| Operation                           | Lock level                       | কী block করে                                                 |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| `ADD COLUMN` (no default)           | ACCESS EXCLUSIVE                 | read + write                                                 |
| `ADD COLUMN ... DEFAULT` (constant) | ACCESS EXCLUSIVE                 | read + write — তবে Postgres 11+ এটা কেবল metadata হিসেবে করে |
| `ADD COLUMN ... DEFAULT` (volatile) | ACCESS EXCLUSIVE + table rewrite | ঘণ্টাখানেকের জন্য full lock                                  |
| `DROP COLUMN`                       | ACCESS EXCLUSIVE                 | সংক্ষিপ্ত — কেবল metadata                                    |
| `ALTER COLUMN ... SET NOT NULL`     | ACCESS EXCLUSIVE                 | full table scan                                              |
| `ALTER COLUMN ... TYPE`             | ACCESS EXCLUSIVE + rewrite       | বড় table-এ ঘণ্টার পর ঘণ্টা                                  |
| `CREATE INDEX`                      | SHARE                            | write (read কাজ করে)                                         |
| `CREATE INDEX CONCURRENTLY`         | SHARE UPDATE EXCLUSIVE           | কিছুই না                                                     |
| `ADD CONSTRAINT FOREIGN KEY`        | SHARE ROW EXCLUSIVE              | সংক্ষিপ্তভাবে write                                          |
| `ADD CONSTRAINT ... NOT VALID`      | ACCESS EXCLUSIVE briefly         | সংক্ষিপ্তভাবে write                                          |

যে দুটো সবার মজ্জাগত করে নেওয়া দরকার:

1. বড় table-এ index তৈরির জন্য **`CREATE INDEX CONCURRENTLY`**। locking সংস্করণের চেয়ে ধীর, কিন্তু write block করে না।
2. বড় table-এ constraint যোগ করার জন্য **`ADD CONSTRAINT ... NOT VALID`** তারপর `VALIDATE CONSTRAINT`। চ্যাপ্টার 6-এর সেই দুই-ধাপের pattern।

## নিরাপদে একটা column যোগ করা

```sql
-- BAD on big tables: forces a table rewrite to set defaults
ALTER TABLE big_table ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- GOOD: small, safe steps
ALTER TABLE big_table ADD COLUMN status TEXT;          -- instant (Postgres 11+)
UPDATE big_table SET status = 'pending' WHERE status IS NULL;  -- batched, see below
ALTER TABLE big_table ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE big_table ADD CONSTRAINT status_not_null CHECK (status IS NOT NULL) NOT VALID;
ALTER TABLE big_table VALIDATE CONSTRAINT status_not_null;
ALTER TABLE big_table ALTER COLUMN status SET NOT NULL;
ALTER TABLE big_table DROP CONSTRAINT status_not_null;
```

Postgres 11+ `ADD COLUMN ... DEFAULT <constant>`-কে প্রায়-তাৎক্ষণিক করে দিয়েছে — এটা default-টা metadata হিসেবে সংরক্ষণ করে, বিদ্যমান row rewrite করে না। আগের version-গুলোর সবসময় multi-step নাচটা দরকার। 11+ এও, `DEFAULT now()` এর মতো **volatile default এড়িয়ে চলুন** — সেগুলো একটা rewrite বাধ্য করে।

## Scale-এ backfill করা

সরল backfill হলো একটা SQL statement:

```sql
UPDATE big_table SET status = 'pending' WHERE status IS NULL;
```

একটা 100M-row table-এর জন্য এটা:

- প্রতিটা update হওয়া row-তে একটা row lock ধরে রাখে।
- প্রায় 100M WAL entry তৈরি করে।
- সম্ভবত replication lag ট্রিগার করে।
- ঘণ্টার পর ঘণ্টা নেয়।

ভালো pattern: primary key range ধরে batch করা, সাথে sleep আর progress tracking।

```sql
DO $$
DECLARE
  batch_size INT := 10000;
  max_id BIGINT;
  cur BIGINT := 0;
BEGIN
  SELECT max(id) INTO max_id FROM big_table;
  WHILE cur < max_id LOOP
    UPDATE big_table SET status = 'pending'
    WHERE id > cur AND id <= cur + batch_size AND status IS NULL;
    cur := cur + batch_size;
    COMMIT;
    PERFORM pg_sleep(0.05);  -- breathe
  END LOOP;
END;
$$;
```

অথবা loop-টা application code-এ লিখুন যাতে আপনি monitor আর cancel করতে পারেন:

```go
func backfill(ctx context.Context, db *sql.DB) error {
    var maxID int64
    db.QueryRow(`SELECT max(id) FROM big_table`).Scan(&maxID)

    const batch = 10000
    for cur := int64(0); cur <= maxID; cur += batch {
        _, err := db.ExecContext(ctx,
            `UPDATE big_table SET status = 'pending'
             WHERE id > $1 AND id <= $2 AND status IS NULL`,
            cur, cur+batch,
        )
        if err != nil { return err }
        time.Sleep(50 * time.Millisecond)
    }
    return nil
}
```

Backfill হলো job, migration নয়। migration framework-এর বাইরে, progress monitoring আর pause করার সামর্থ্য সহ চালান।

## বিদ্যমান data-তে একটা NOT NULL constraint যোগ করা

ক্লাসিক ভুলটা:

```sql
ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ NOT NULL;
-- ERROR: column "onboarded_at" of relation "users" contains null values
```

নিরাপদ ক্রম:

```sql
-- 1. add nullable
ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ;

-- 2. backfill (batched)
UPDATE users SET onboarded_at = created_at WHERE onboarded_at IS NULL;

-- 3. add as CHECK constraint NOT VALID (instant, applies to new writes)
ALTER TABLE users ADD CONSTRAINT users_onboarded_at_not_null
  CHECK (onboarded_at IS NOT NULL) NOT VALID;

-- 4. validate (slow but doesn't block writes)
ALTER TABLE users VALIDATE CONSTRAINT users_onboarded_at_not_null;

-- 5. promote to real NOT NULL (fast — uses the validated CHECK as proof)
ALTER TABLE users ALTER COLUMN onboarded_at SET NOT NULL;

-- 6. drop the redundant CHECK
ALTER TABLE users DROP CONSTRAINT users_onboarded_at_not_null;
```

Postgres 12+ এ, ধাপ 5 দ্রুত কারণ একটা valid CHECK constraint যখন আগে থেকেই NOT NULL প্রমাণ করে, তখন Postgres table scan-টা এড়িয়ে যেতে পারে।

## Index online-ভাবে

যেকোনো non-trivial index-এর জন্য:

```sql
CREATE INDEX CONCURRENTLY ON big_table(some_column);
```

`CONCURRENTLY` কোনো write lock না নিয়ে index তৈরি করে। ধীর (একাধিক pass), কিন্তু পুরোটা সময় table read-write থাকে।

সাবধানতা:

- **একটা transaction-এর ভেতরে চালানো যায় না।** migration tool-কে out-of-transaction statement সাপোর্ট করতে হবে (বেশিরভাগই করে; কিছু flag করা দরকার)।
- **build-এর মাঝপথে fail করতে পারে।** build fail করলে, আপনার হাতে একটা `INVALID` index থেকে যায় যা manually drop করতে হয়:
  ```sql
  DROP INDEX CONCURRENTLY some_invalid_index;
  ```
- **locking সংস্করণের চেয়ে ধীর।** বিশাল table-এ ঘণ্টার পর ঘণ্টার পরিকল্পনা করুন।

Unique index-এর জন্যও concurrent:

```sql
CREATE UNIQUE INDEX CONCURRENTLY ON users(email);
```

## একটা foreign key যোগ করা

```sql
-- BAD: locks the referenced table briefly + scans the new FK column
ALTER TABLE orders ADD CONSTRAINT orders_user_fk
  FOREIGN KEY (user_id) REFERENCES users(id);

-- GOOD: NOT VALID first, then validate
ALTER TABLE orders ADD CONSTRAINT orders_user_fk
  FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_user_fk;
```

CHECK-এর মতোই একই pattern। `NOT VALID` FK-টাকে সাথে সাথে নতুন write-এ প্রয়োগ করায়; `VALIDATE` বিদ্যমান row-গুলো background-এ যাচাই করে।

## একটা column-এর type বদলানো

সবচেয়ে কষ্টকর operation। বেশিরভাগ type পরিবর্তনের জন্য `ALTER COLUMN ... TYPE` table rewrite করে।

দুটো কৌশল:

**A. Compatible cast (কোনো rewrite নেই)।** কিছু পরিবর্তন কেবল metadata:

- `VARCHAR(50)`-কে `VARCHAR(100)`-এ বাড়ানো — কোনো rewrite নেই।
- `INTEGER` থেকে `BIGINT` — rewrite (ভিন্ন আকার)।
- `TEXT` ↔ `VARCHAR` বদলানো — কোনো rewrite নেই (দুটোই একইভাবে সংরক্ষিত)।

**B. নতুন column, dual-write, switch।** অসামঞ্জস্যপূর্ণ type-এর জন্য:

```sql
-- 1. add new column
ALTER TABLE invoices ADD COLUMN amount_cents_v2 BIGINT;

-- 2. backfill (batched)
UPDATE invoices SET amount_cents_v2 = (amount_dollars * 100)::bigint;

-- 3. dual-write in app code

-- 4. switch reads to new column

-- 5. eventually drop old column
ALTER TABLE invoices DROP COLUMN amount_dollars;
ALTER TABLE invoices RENAME COLUMN amount_cents_v2 TO amount_cents;
```

আবারও সেই expand/contract নাচ।

## Migration tooling

তিনটা শ্রেণি।

**Source-of-truth migration tool।** `golang-migrate`, `flyway`, `dbmate`, `sqitch`। প্রতিটা migration একটা numbered file। কোনগুলো চলেছে tool তা track করে।

```
migrations/
  001_create_users.up.sql
  001_create_users.down.sql
  002_add_email_unique.up.sql
  002_add_email_unique.down.sql
```

সুবিধা: সরল, language-agnostic, review করা সহজ।
অসুবিধা: কোনো schema diffing নেই — আপনি প্রতিটা migration হাতে লেখেন।

**Schema-as-code tool।** `atlas`, `prisma migrate`, `liquibase`। কাঙ্ক্ষিত schema define করুন; সেখানে পৌঁছানোর migration tool তৈরি করে দেয়।

সুবিধা: সরল পরিবর্তনের জন্য কম পুনরাবৃত্তি।
অসুবিধা: generated migration সাবধানে review করা দরকার (বিশেষত বড়-table পরিবর্তনের জন্য — auto-generated `ALTER TABLE ... TYPE` ভেঙে দেবে)।

**ORM-managed migration।** Active Record, Django migration, Sequelize, GORM। migration model code-এর সাথেই থাকে।

সুবিধা: ORM model-এর সাথে ঘনিষ্ঠ সংযোগ।
অসুবিধা: ORM-ঘেঁষা migration কখনো কখনো আসলে কী চলছে তা লুকিয়ে ফেলে, যা বড় table-এ বিপজ্জনক।

একটা self-hosted backend-এর জন্য, **হাতে-লেখা SQL সহ `golang-migrate` বা `dbmate`** ই একঘেয়ে, সঠিক পছন্দ। DB-র বিরুদ্ধে ঠিক কী চলছে তা আপনি দেখতে পান।

## Migration-এর সাথে deploy করা

migration আর deploy-এর ক্রম সাজানোর তিনটা pattern।

**Deploy-এর আগে migration।** নতুন app উঠে আসার সময় নতুন schema জায়গায় থাকে। যখন নতুন schema নতুন code-এর জন্য _প্রয়োজনীয়_ (যেমন, নতুন code এমন একটা column read করে যা আগে ছিল না) তখন এটা দরকার।

**Migration-এর আগে deploy।** নতুন app code পুরনো আর নতুন — দুই schema সামলাতে পারে। migration পরে চলে, code মানিয়ে নেয়। কিছু কিছু expand/contract ধাপের জন্য এটা দরকার।

**Deploy-এর সাথে migration (interleaved)।** কিছু টিম এটা orchestrate করে — migration A, deploy A, migration B, deploy B। পূর্ণ expand/contract নাচ।

বাস্তবে, বড় schema পরিবর্তনের জন্য multi-step deploy-ই সঠিক ছন্দ। এক ধাক্কায় "migration + deploy + cleanup" করার চেষ্টাই যেভাবে outage ঘটে।

<Callout type="warn">

**সবসময় production data-র একটা কপির উপর migration test করুন।** যে migration dev-এ 100 row নিয়ে 50ms নেয়, সেটা prod-এ 100M row নিয়ে 4 ঘণ্টা নেয়। lock contention-ও আলাদা। ব্যস্ত table-এর বিরুদ্ধে যেকোনো schema পরিবর্তনের জন্য সাম্প্রতিক prod restore সহ একটা staging environment অ-আলোচনাসাপেক্ষ।

</Callout>

## Rollback কৌশল

একটা ভালোভাবে ডিজাইন করা migration reversible হওয়া উচিত — আপনি `down` migration-ও লেখেন। কিন্তু বাস্তবে:

- **কিছু migration data loss ছাড়া reverse করা যায় না।** একটা column drop করা মানে data চলে গেছে। "down" migration column-টা structurally আবার বানায়, কিন্তু backup ছাড়া data ফিরে আসছে না।
- **ইতিমধ্যে deploy হওয়া একটা পরিবর্তন revert করা ঝুঁকিপূর্ণ।** App code হয়তো নতুন shape লেখা শুরু করে দিয়েছে। Revert করলে schema revert হয়; app crash করে।

ব্যবহারিক rollback কৌশল: **roll back করবেন না; roll forward করুন।** একটা migration production ভেঙে দিলে, সেটা ঠিক করতে একটা নতুন migration লিখুন। এটা দ্রুততর, নিরাপদ, আর আপনাকে এগিয়ে চলতে বাধ্য করে।

Down migration শুধু এই ক্ষেত্রের জন্য রেখে দিন: "আমি এখনো deploy করিনি; আমি staging-এ undo করতে চাই।"

## Recap

- Expand → migrate → contract। তিন ধাপ, প্রতিটা নিজে থেকে নিরাপদ।
- বেশিরভাগ rename-এ 4টা deploy লাগে। live system-এর জন্য এর মূল্য আছে।
- Lock level জানুন: `CREATE INDEX CONCURRENTLY`, `NOT VALID` constraint।
- একটা column যোগ করা: nullable + backfill + CHECK-এর মাধ্যমে NOT NULL + promotion।
- Backfill হলো job, migration নয়। ID range ধরে batch করুন, sleep দিন, monitor করুন।
- বড় table-এর জন্য `CREATE INDEX CONCURRENTLY`; fail করে INVALID index রেখে যেতে পারে।
- FK: `NOT VALID` তারপর `VALIDATE`।
- Type পরিবর্তন: সাধারণত নতুন column + dual-write + switch।
- Tooling: হাতে-লেখা SQL migration (`golang-migrate`, `dbmate`) কে অগ্রাধিকার দিন; auto-generated migration সাবধানে review করুন।
- prod-আকারের data-র বিরুদ্ধে একটা staging restore-এ test করুন।
- Roll forward, back নয়।

এই ছিল পুরো Backend Engineering Path-এর data modeling track। path-এর পরবর্তী বিষয়: [Auth & security](/notes/auth-security) — session, password hashing, OAuth flow, আর হাতে করা rate-limiting pattern।
