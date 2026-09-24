---
title: 'ডেটাবেস স্কেলিং'
subtitle: 'Index থেকে শুরু করে connection pool, read replica, vertical partitioning আর সবশেষে sharding — সস্তা কাজটা আগে করার ক্রমটাই এই চ্যাপ্টারের মূল শিক্ষা।'
chapter: 10
level: 'intermediate'
readingTime: '২০ মিনিট'
topics: ['indexing', 'read replicas', 'replication lag', 'partitioning', 'sharding', 'shard key']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

আগের দুই চ্যাপ্টারে আপনি ডেটাবেসের উপর চাপ কমানোর দুটো উপায় শিখেছেন — সামনে একটা ক্যাশ বসানো, আর অ্যাপ সার্ভারকে stateless বানিয়ে লোড ব্যালান্সারের পেছনে যত খুশি instance যোগ করা। দুটোই কাজ করে, কিন্তু দুটোরই একটা সীমা আছে: অ্যাপ সার্ভার আপনি যত খুশি বাড়াতে পারেন, ডেটাবেস পারেন না। ক্যাশ miss হলে রিকোয়েস্ট শেষ পর্যন্ত ওই একটা primary ডেটাবেসেই গিয়ে পড়ে।

এই চ্যাপ্টার সেই শেষ স্তরটা নিয়ে। আর এখানে সবচেয়ে গুরুত্বপূর্ণ জিনিসটা কোনো টেকনিক নয়, **ক্রম** — কোনটা আগে করবেন। বেশিরভাগ ইঞ্জিনিয়ারিং টিম যে ভুলটা করে সেটা হলো, "ডেটাবেস ধীর" শুনে সোজা sharding-এর ডিজাইন ডকুমেন্ট লিখতে বসে যায়। অথচ বাস্তবে দশটার মধ্যে আটটা ক্ষেত্রে সমস্যাটা একটা missing index, একটা N+1 query, বা একটা ফুরিয়ে যাওয়া connection pool। Sharding হলো শেষ অস্ত্র, প্রথম নয় — কারণ shard করলে আপনি এমন কিছু জিনিস স্থায়ীভাবে হারান যেগুলো আর কখনো ফেরত পাবেন না।

তাই আমরা ঠিক সেই ক্রমেই যাব: index → connection pool → read replica → vertical partitioning → sharding। প্রতিটা ধাপ আগেরটার চেয়ে বেশি ক্ষমতা দেয়, আর বেশি দাম নেয়।

## গল্পে বুঝি

বাগদাদের দিওয়ানুল খারাজ — রাজস্ব দপ্তর — একটা তিনতলা পাথুরে ভবন, যেখানে খলিফার সাম্রাজ্যের প্রতিটা জমির দলিল, প্রতিটা করের রসিদ আর প্রতিটা ব্যবসায়ীর নিবন্ধন কাগজে লেখা আছে। দপ্তরের প্রধান কেরানি সিনা। শুরুর দিকে দিনে চল্লিশ-পঞ্চাশজন লোক আসত, সিনা নিজেই সব সামলাতেন।

তারপর সাম্রাজ্য বাড়ল। এখন দিনে দুই হাজার লোক আসে। প্রতিটা মানুষ এসে বলে — "আমি খোয়ারিজমি, বুখারা মহল্লার, আমার জমির দলিলটা দরকার।" আর সিনার কর্মচারীরা তখন কী করে? তারা গুদামঘরে ঢুকে **প্রথম তাক থেকে শুরু করে এক এক করে প্রতিটা কাগজ পড়তে থাকে**, যতক্ষণ না ওই নামটা পায়। ছয় লাখ দলিলের মধ্যে একটা খুঁজতে গড়ে তিন লাখ কাগজ ওল্টাতে হয়। লাইন দরজা পেরিয়ে রাস্তায় নেমে গেছে।

উজির এসে বললেন — "এই ভবন ছোট, আরও তিনটা ভবন বানাও, দলিল ভাগ করে দাও।" সিনা মাথা নেড়ে বললেন, "একটু দাঁড়ান।" তিনি বরং দুই সপ্তাহ সময় নিয়ে একটা কাজ করলেন: একটা **তালিকা-বই** বানালেন। বইটাতে প্রতিটা নাম বর্ণানুক্রমে সাজানো, আর প্রতিটা নামের পাশে লেখা — কোন ঘর, কোন তাক, কোন বাক্স। এখন কর্মচারী তিন লাখ কাগজ ওল্টায় না; তালিকা-বইয়ের মাঝখানে আঙুল রেখে অর্ধেক বাদ দেয়, আবার অর্ধেক বাদ দেয় — বিশটা পাতা ওল্টালেই নামটা পেয়ে যায়, তারপর সোজা সেই বাক্সে হাত দেয়। তিন লাখের বদলে বিশ। এটাই **index**, আর "মাঝখানে আঙুল রেখে অর্ধেক বাদ" — ওটাই B-tree।

কিন্তু তালিকা-বই বিনামূল্যে আসেনি। এখন নতুন একটা দলিল জমা পড়লে কর্মচারীকে দুটো কাজ করতে হয় — বাক্সে কাগজ রাখতে হয়, **আর** তালিকা-বইয়ের সঠিক জায়গায় নতুন এন্ট্রি ঢোকাতে হয়। সিনা পরে নামের তালিকা ছাড়াও মহল্লার তালিকা, তারিখের তালিকা, করের পরিমাণের তালিকা বানালেন — আর দেখা গেল একটা দলিল জমা নিতে এখন সময় লাগে আগের চেয়ে চার গুণ, কারণ পাঁচটা বইয়ে পাঁচবার লিখতে হয়। **প্রতিটা index পড়াকে দ্রুত করে, লেখাকে ধীর করে।**

তালিকা-বই বসানোর পর লাইন ছোট হলো ঠিকই, কিন্তু কয়েক মাস পর আবার বাড়ল — এবার কারণ আলাদা। মানুষ দলিল "দেখতে" আসে অনেক, "জমা দিতে" আসে কম — একশোজনের মধ্যে পঁচানব্বইজনই শুধু পড়তে চায়। তাই সিনা কয়েকজন **নকলনবিশ** নিয়োগ করলেন। তারা মূল ভবনের প্রতিটা নতুন এন্ট্রি হুবহু নকল করে শহরের তিনটে ছোট অফিসে পাঠায় — কর্ডোবা গলি, দামেস্ক ফটক আর সমরকন্দ চত্বর। এখন যে শুধু পড়তে চায় সে কাছের ছোট অফিসে যায়; যে জমা দিতে চায় তাকেই কেবল মূল ভবনে আসতে হয়। এগুলোই **read replica**, আর "লেখা মূল ভবনে, পড়া ছোট অফিসে" — ওটাই read/write splitting।

কিন্তু এখানেই একটা যন্ত্রণাদায়ক ঘটনা ঘটল। মরিয়ম মূল ভবনে গিয়ে ঠিকানা বদলের আবেদন জমা দিলেন, রসিদ নিলেন, তারপর হেঁটে দশ মিনিটে কর্ডোবা গলির অফিসে গিয়ে বললেন, "আমার নতুন ঠিকানাটা একবার দেখান।" কেরানি খাতা খুলে বলল — "আপনার ঠিকানা তো পুরনোটাই।" নকলনবিশ তখনো ওই এন্ট্রিটা নিয়ে পথে। মারিয়াম নিজের করা পরিবর্তন নিজেই দেখতে পাচ্ছেন না। এটাই **replication lag**, আর মারিয়ামের অভিযোগটাই **read-your-own-writes** সমস্যা। সিনার সমাধান সরল — রসিদে একটা ছাপ, "গত পাঁচ মিনিটে জমা দিয়েছেন? তাহলে মূল ভবনেই দেখুন।"

তারপরও এক বছর পর মূল ভবন আবার ভরে গেল — এবার সত্যিই জায়গা নেই, তাক আর বসানো যায় না। এবার সিনা উজিরের কথাটাই মানলেন, তবে নিজের শর্তে। তিনি দলিল ভাগ করলেন **মহল্লা ধরে** — বুখারার সব দলিল এক ভবনে, ফেজের সব দলিল আরেক ভবনে, কায়রোর সব দলিল তৃতীয় ভবনে। মানুষ এখন সরাসরি নিজের মহল্লার ভবনে যায়, দরজায় একজন দিকনির্দেশক দাঁড়িয়ে থাকে যে শুধু বলে দেয় কোন ভবন। এটাই **sharding**, মহল্লার নামটাই **shard key**, আর দরজার লোকটাই **shard router**।

কিন্তু ভাগ করার দিনই সিনা তিনটে জিনিস চিরতরে হারালেন। এক, "সাম্রাজ্যের সবচেয়ে বড় দশজন করদাতা কারা" — এই প্রশ্নের উত্তর আর এক ভবনে দাঁড়িয়ে পাওয়া যায় না, তিন ভবনে লোক পাঠিয়ে তিনটা তালিকা এনে মিলিয়ে দেখতে হয় (**scatter-gather**)। দুই, দলিলের ক্রমিক নম্বর — আগে একটাই খাতা ছিল, এখন তিন ভবনে তিনটা খাতা, একই নম্বর দুই জায়গায় বসে যেতে পারে। তিন, একই লেনদেনে বুখারার একজনের জমি ফেজের একজনের নামে লেখা এখন আর এক কলমের কাজ নয়, দুই ভবনের মধ্যে সমন্বয় লাগে। আর সবচেয়ে বিরক্তিকর ব্যাপারটা হলো — বাগদাদ মহল্লার ভবনে ভিড় বাকি দুটোর দশ গুণ, কারণ ব্যবসায়ীরা সবাই ওখানেই নিবন্ধিত। একটা ভবন হাঁসফাঁস করছে, দুটো খালি। এটাই **hot shard**।

মিলিয়ে নিই: গুদামের প্রতিটা কাগজ পড়া হলো **full table scan**, তালিকা-বই হলো **index**, বইয়ের মাঝে আঙুল রেখে অর্ধেক বাদ দেওয়া হলো **B-tree lookup**, নাম-তারিখ একসাথে সাজানো বই হলো **composite index**, তালিকা-বইতেই উত্তরটা লেখা থাকা (বাক্স খুলতেই না হওয়া) হলো **covering index**, পাঁচটা বইয়ে পাঁচবার লেখা হলো **write amplification**, নকলনবিশরা হলো **read replica**, নকলের দেরি হলো **replication lag**, "সদ্য জমা দিলে মূল ভবনে দেখুন" হলো **sticky-to-primary window**, মহল্লা ধরে ভবন ভাগ হলো **sharding**, মহল্লার নাম হলো **shard key**, দরজার দিকনির্দেশক হলো **shard router**, তিন ভবনে লোক পাঠিয়ে তালিকা মেলানো হলো **cross-shard query**, আর বাগদাদ ভবনের ভিড় হলো **hot shard**।

আর গল্পের মূল শিক্ষাটা: উজির প্রথম দিনেই ভবন ভাগ করতে বলেছিলেন। সিনা দুই সপ্তাহে একটা তালিকা-বই বানিয়ে সেই প্রয়োজনটা **তিন বছর পিছিয়ে দিয়েছিলেন**। index-এর খরচ দুই সপ্তাহ; sharding-এর খরচ চিরকালের।

## ধাপ ১: Index — সবচেয়ে সস্তা জয়

### B-tree আসলে কী করে

প্রায় সব রিলেশনাল ডেটাবেসের ডিফল্ট index হলো B+tree। এটাকে ভাবুন একটা গাছ হিসেবে যার প্রতিটা নোড একটা ডিস্ক পেজ (সাধারণত ৮ বা ১৬ KB), আর প্রতিটা নোডে শত শত key ধরে। মূল বৈশিষ্ট্য দুটো:

- **উচ্চতা খুব কম।** প্রতিটা নোডে ৫০০ key ধরলে, তিন স্তরের গাছেই ১২ কোটির বেশি row-তে পৌঁছানো যায়। মানে যেকোনো row খুঁজতে ৩-৪টা পেজ পড়াই যথেষ্ট।
- **পাতাগুলো সাজানো এবং একে অপরের সাথে জোড়া।** তাই index শুধু "সমান" খোঁজে না — range scan (`BETWEEN`, `&gt;`, `LIKE 'prefix%'`) আর `ORDER BY`-ও index থেকে সরাসরি চলে।

এই দুটো বৈশিষ্ট্য থেকেই সব নিয়ম বেরোয়। যেখানে সাজানো ক্রম কাজে লাগে না, সেখানে B-tree কাজে লাগে না — যেমন `LIKE '%khwarizmi'` (শুরুতে wildcard) index ব্যবহার করতে পারে না, কারণ সাজানো তালিকায় "শেষ দিকে যা আছে" ধরে কিছু বাদ দেওয়া যায় না।

### Query plan পড়া

Index বসানোর আগে **সবসময়** দেখতে হবে ডেটাবেস আসলে কী করছে। `EXPLAIN ANALYZE` সেটাই বলে।

```sql
EXPLAIN ANALYZE
SELECT id, title, created_at
FROM manuscripts
WHERE author_id = 4417
  AND status = 'published'
ORDER BY created_at DESC
LIMIT 20;
```

Index ছাড়া আউটপুট কেমন দেখায়:

```
Limit  (cost=98214.55..98214.60 rows=20 width=64)
        (actual time=812.447..812.455 rows=20 loops=1)
  ->  Sort  (cost=98214.55..98219.31 rows=1904 width=64)
              (actual time=812.445..812.449 rows=20 loops=1)
        Sort Key: created_at DESC
        Sort Method: top-N heapsort  Memory: 29kB
        ->  Seq Scan on manuscripts
              (cost=0.00..98163.88 rows=1904 width=64)
              (actual time=0.031..810.992 rows=1877 loops=1)
              Filter: ((author_id = 4417) AND (status = 'published'::text))
              Rows Removed by Filter: 4198123
Planning Time: 0.152 ms
Execution Time: 812.489 ms
```

তিনটে জিনিস এখানে চিৎকার করে বলছে সমস্যা কোথায়:

- **`Seq Scan`** — পুরো টেবিল স্ক্যান হচ্ছে।
- **`Rows Removed by Filter: 4198123`** — ৪২ লাখ row পড়ে ফেলে দেওয়া হয়েছে ১৮৭৭টা পেতে। এই সংখ্যাটাই সবচেয়ে বড় সংকেত।
- **`Sort`** — ফলাফল আলাদা করে সাজাতে হয়েছে।

এখন সঠিক index:

```sql
CREATE INDEX CONCURRENTLY idx_manuscripts_author_status_created
  ON manuscripts (author_id, status, created_at DESC);
```

নতুন plan:

```
Limit  (cost=0.43..8.91 rows=20 width=64)
        (actual time=0.038..0.061 rows=20 loops=1)
  ->  Index Scan using idx_manuscripts_author_status_created on manuscripts
        (cost=0.43..807.22 rows=1904 width=64)
        (actual time=0.036..0.057 rows=20 loops=1)
        Index Cond: ((author_id = 4417) AND (status = 'published'::text))
Planning Time: 0.201 ms
Execution Time: 0.089 ms
```

৮১২ ms থেকে ০.০৯ ms — প্রায় **নয় হাজার গুণ**। `Sort` নোডটা পুরোপুরি উধাও, কারণ index নিজেই `created_at DESC` ক্রমে সাজানো। কোনো নতুন সার্ভার লাগেনি, কোনো Redis লাগেনি, কোনো shard লাগেনি।

<Callout type="warning">

প্রোডাকশনে সবসময় `CREATE INDEX CONCURRENTLY` (PostgreSQL) বা `ALGORITHM=INPLACE, LOCK=NONE` (MySQL) ব্যবহার করুন। সাধারণ `CREATE INDEX` টেবিলে একটা write lock ধরে রাখে — কোটি row-র টেবিলে সেটা কয়েক মিনিটের সম্পূর্ণ outage। `CONCURRENTLY` ধীর, কিন্তু কেউ ব্লক হয় না।

</Callout>

### Composite index-এ কলামের ক্রম

এটাই সবচেয়ে ভুল বোঝা বিষয়। একটা composite index `(a, b, c)` আসলে একটা টেলিফোন ডিরেক্টরি যা প্রথমে `a` ধরে সাজানো, `a` সমান হলে `b` ধরে, তারপর `c` ধরে। এই "leftmost prefix" নিয়ম থেকে যা বেরোয়:

| Query-র WHERE                         | `(author_id, status, created_at)` কাজে লাগে?     |
| ------------------------------------- | ------------------------------------------------ |
| `author_id = ?`                       | হ্যাঁ, পুরোপুরি                                  |
| `author_id = ? AND status = ?`        | হ্যাঁ, পুরোপুরি                                  |
| `author_id = ? AND created_at &gt; ?` | আংশিক — `author_id` দিয়ে সংকুচিত, তারপর ফিল্টার |
| `status = ?`                          | না — প্রথম কলাম নেই                              |
| `status = ? AND created_at &gt; ?`    | না                                               |

কলামের ক্রম বাছার ব্যবহারিক নিয়ম:

1. **সমতার (equality) কলাম আগে**, range কলাম পরে। কারণ প্রথম range কলামের পরে index-এর সাজানো ক্রম আর কাজে লাগে না।
2. এরপর যে কলামটা `ORDER BY`-তে আছে সেটা রাখুন — তাহলে sort ধাপটাই মুছে যায়।
3. একাধিক equality কলামের মধ্যে সাধারণত **যেটা বেশি selective** (বেশি আলাদা মান আছে) সেটা আগে — যদিও আধুনিক planner-এ পার্থক্য অল্প, আর query pattern-এর মিল বেশি গুরুত্বপূর্ণ।

<Callout type="tip">

`(author_id)`-এর উপর একটা আলাদা index থাকলে আর `(author_id, status, created_at)` বানালে — পুরনোটা **মুছে দিন**। composite index-এর leftmost prefix ওই কাজটা এমনিতেই করে। অকারণ index মানে অকারণ write খরচ।

</Callout>

### Covering index

Index-এ যদি query-র চাওয়া **সব কলাম** থাকে, ডেটাবেসকে আর মূল টেবিলের row পড়তেই হয় না — উত্তরটা index-এর ভেতরেই আছে। PostgreSQL-এ এটাকে বলে index-only scan।

```sql
-- INCLUDE keeps title/created_at in the leaf pages
-- without making them part of the sort order
CREATE INDEX idx_manuscripts_cover
  ON manuscripts (author_id, status)
  INCLUDE (title, created_at);
```

গল্পের ভাষায় — তালিকা-বইতেই যদি দলিলের সারাংশ লেখা থাকে, কর্মচারীকে আর বাক্স খুলতেই হয় না। খরচ: index-টা মোটা হয়, তাই মেমরিতে কম ধরে আর write আরও ধীর হয়। তাই covering index সেখানেই বসান যেখানে একটা নির্দিষ্ট hot query বারবার চলে।

### Index write-কে ধীর করে — কতটা

এটা কেউ পরিমাপ করে না, অথচ এটাই ধীরে ধীরে সিস্টেম মারে। একটা `INSERT`-এ ডেটাবেসকে করতে হয়:

- heap-এ row লেখা — ১ বার
- প্রতিটা index-এ একটা এন্ট্রি ঢোকানো — N বার, এবং প্রতিবারই B-tree-র সঠিক পাতা খুঁজে বের করে

আটটা index থাকা একটা টেবিলে `INSERT` করলে আপনি আসলে নয়টা কাঠামো লিখছেন। আর `UPDATE`-এ শুধু সেই index গুলোই স্পর্শ হয় যাদের কলাম বদলেছে — এজন্যই "কখনো বদলায় না" এমন কলামের index তুলনামূলক সস্তা, আর `updated_at`-এর মতো প্রতিবার বদলানো কলামের index দামি।

<Callout type="warning">

**অব্যবহৃত index খুঁজে বের করে মুছুন।** PostgreSQL-এ `pg_stat_user_indexes`-এ `idx_scan = 0` মানে ওই index কেউ কোনোদিন ব্যবহার করেনি — কিন্তু প্রতিটা write সেটার দাম দিচ্ছে, আর সেটা মেমরিতে জায়গাও খাচ্ছে। বাস্তব প্রোডাকশন ডেটাবেসে ২০-৪০% index সাধারণত মৃত।

</Callout>

### N+1 — ধীর query নয়, ধীর query-র বন্যা

সবচেয়ে সাধারণ পারফরম্যান্স বাগ, আর query plan দেখে ধরা পড়ে না — কারণ প্রতিটা query আলাদাভাবে দ্রুত। সমস্যা হলো সংখ্যায়।

```typescript
// N+1: 1 query for the list, then one per row
const authors = await db.query('SELECT id, name FROM authors LIMIT 50');
for (const author of authors) {
	author.books = await db.query('SELECT * FROM books WHERE author_id = $1', [author.id]);
}
// 51 round trips. At 0.4 ms each that is 20 ms of pure network waiting.
```

সমাধান দুটো, দুটোই সহজ:

```typescript
// Option A: one extra query, grouped in memory
const ids = authors.map((a) => a.id);
const books = await db.query('SELECT * FROM books WHERE author_id = ANY($1)', [ids]);
const byAuthor = new Map<number, Book[]>();
for (const b of books) {
	const list = byAuthor.get(b.author_id) ?? [];
	list.push(b);
	byAuthor.set(b.author_id, list);
}

// Option B: a single JOIN when the shape allows it
const rows = await db.query(
	`SELECT a.id, a.name, b.id AS book_id, b.title
	 FROM authors a LEFT JOIN books b ON b.author_id = a.id
	 WHERE a.id = ANY($1)`,
	[ids]
);
```

N+1 ধরার একমাত্র নির্ভরযোগ্য উপায় হলো **প্রতি HTTP রিকোয়েস্টে কতগুলো query চলল সেটা গোনা** এবং সেটা লগ করা। একটা রিকোয়েস্টে ২০০টা query দেখলে আপনি সাথে সাথেই জানবেন কী ঘটছে — অথচ শুধু "গড় query latency" দেখলে সবকিছু চমৎকার দেখাবে, কারণ প্রতিটা query সত্যিই ০.৪ ms।

## ধাপ ২: Connection pool আর query শৃঙ্খলা

Index ঠিক করার পরের সস্তা জয়টা প্রায়ই connection-এ। একটা PostgreSQL connection মানে সার্ভারে একটা আলাদা প্রসেস, কয়েক MB মেমরি, আর প্রতিবার নতুন করে খুলতে TCP handshake + TLS + authentication — মিলিয়ে ২০-৫০ ms। প্রতি রিকোয়েস্টে নতুন connection খোলা মানে query-র চেয়ে connection খুলতেই বেশি সময় যাওয়া।

কিন্তু উল্টো ভুলটাও সমান বিপজ্জনক: pool খুব বড় রাখা। ২০টা অ্যাপ instance × ১০০ connection = ২০০০ connection — যা যেকোনো একক PostgreSQL সার্ভারকে ধ্বংস করে দেবে, কারণ CPU তখন প্রকৃত কাজের বদলে context switching-এ ব্যয় হয়।

<Callout type="info">

**Pool sizing-এর ব্যবহারিক নিয়ম:** ডেটাবেস সার্ভারে একসাথে কার্যকরভাবে যত query চলতে পারে সেটা মোটামুটি `core সংখ্যা × 2 + কার্যকর spindle সংখ্যা`। ১৬ কোরের একটা সার্ভারে সব অ্যাপ instance মিলিয়ে ~৪০-৬০ connection-ই যথেষ্ট। কম connection-এ throughput বেশি হয় — এটা প্রতিবার মাপলেই দেখা যায়, তবু বিশ্বাস করা কঠিন লাগে।

connection সংখ্যা এর বেশি লাগলে অ্যাপের pool না বাড়িয়ে সামনে একটা **connection pooler** বসান — PgBouncer (transaction mode) বা ProxySQL। তখন ৫০০০ অ্যাপ connection মাত্র ৫০টা প্রকৃত DB connection-এ multiplex হয়।

</Callout>

query শৃঙ্খলার তিনটে নিয়ম, যেগুলো না থাকলে কোনো স্কেলিং কাজ করে না:

- **প্রতিটা query-তে একটা timeout থাকতে হবে।** `statement_timeout` ছাড়া একটা ভুল query ঘণ্টার পর ঘণ্টা চলে pool-এর connection আটকে রাখে, আর তারপর পুরো অ্যাপ থেমে যায়।
- **ট্রানজেকশন যত ছোট তত ভালো।** ট্রানজেকশন খুলে ভেতরে একটা HTTP call করা সবচেয়ে খারাপ প্যাটার্ন — external সার্ভিসের latency-র সমান সময় ধরে আপনি lock আর connection দুটোই ধরে রাখছেন।
- **`SELECT *` লিখবেন না।** শুধু বাড়তি বাইট নয় — এটা covering index-এর সম্ভাবনাই নষ্ট করে দেয়, কারণ index-এ সব কলাম কখনোই থাকবে না।

## ধাপ ৩: Read replica

Index আর pool ঠিক করার পরও যদি primary-র CPU ৮০%-এ থাকে, তখন প্রশ্ন করুন: লোডটা কি পড়ার না লেখার? সাধারণ ওয়েব অ্যাপ্লিকেশনে read:write অনুপাত ৫০:১ থেকে ৫০০:১ — মানে সমস্যাটা প্রায় নিশ্চিতভাবেই পড়ার। আর পড়া হলো এমন জিনিস যা সহজেই কপি করা যায়।

<Mermaid
title="Read/write splitting across replicas"
code={`graph LR
  APP["App instances"] -->|"writes"| P["db-baghdad-primary"]
  APP -->|"reads"| R1["replica db-cordoba"]
  APP -->|"reads"| R2["replica db-damascus"]
  APP -->|"reads"| R3["replica db-samarkand"]
  P -->|"async WAL stream"| R1
  P -->|"async WAL stream"| R2
  P -->|"async WAL stream"| R3`}
/>

Primary তার write-ahead log স্ট্রিম করে replica-গুলোতে পাঠায়, replica সেটা প্রয়োগ করে। **এটা asynchronous** — primary replica-র জন্য অপেক্ষা করে না। সেটাই এর শক্তি (write ধীর হয় না, replica পড়ে গেলে primary চলতে থাকে) এবং সেটাই এর একমাত্র বড় সমস্যা।

### Replication lag

Lag মানে replica primary-র চেয়ে কত পেছনে। স্বাভাবিক অবস্থায় ৫-৫০ ms। কিন্তু নিচের যেকোনোটাতে সেটা সেকেন্ড বা মিনিটে পৌঁছাতে পারে:

- একটা বড় ব্যাচ `UPDATE` (দশ লাখ row একসাথে) — replica সেটা প্রয়োগ করতে সময় নেয়
- replica-তে একটা দীর্ঘ analytics query চলছে যা WAL প্রয়োগে বাধা দিচ্ছে
- নেটওয়ার্ক সমস্যা বা replica-র ডিস্ক ধীর
- schema migration

**Lag সবসময় মনিটর করুন এবং সেটাকে রাউটিং সিদ্ধান্তে ব্যবহার করুন।** নির্দিষ্ট সীমার (যেমন ২ সেকেন্ড) বেশি lag হলে ওই replica-কে সাময়িকভাবে pool থেকে বাদ দিন।

```sql
-- PostgreSQL: how far behind is this replica, in seconds
SELECT
  CASE WHEN pg_is_in_recovery()
       THEN EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
       ELSE 0
  END AS lag_seconds;
```

### Read-your-own-writes

গল্পের মরিয়মের সমস্যাটা এখানে কোডে ফিরে আসে। ইউজার প্রোফাইল আপডেট করল (primary-তে গেল), তারপর পেজ রিলোড হলো (replica থেকে পড়ল), আর সে পুরনো ডেটা দেখল। ইউজারের চোখে এটা সরাসরি একটা বাগ — "আমার এডিট সেভ হয়নি"।

তিনটে ব্যবহারিক সমাধান, বাস্তবায়নের কঠিনতা অনুযায়ী:

**১. Sticky-to-primary window.** ইউজার write করলে তার সেশনে একটা টাইমস্ট্যাম্প রাখুন। পরের N সেকেন্ড (সাধারণত ৩-৫) ওই ইউজারের সব read primary থেকে যাবে। বাস্তবায়ন সবচেয়ে সহজ, ৯৫% ক্ষেত্রে যথেষ্ট। খরচ: write-এর পরপর primary-তে কিছুটা বাড়তি পড়ার চাপ।

**২. Causal token (LSN/GTID)।** write-এর পর primary যে log position দেয় সেটা ক্লায়েন্টকে ফেরত দিন (কুকি বা রেসপন্স হেডারে)। পরের read-এ ক্লায়েন্ট সেই token পাঠায়, আর router এমন একটা replica বাছে যার replay position ওই token-এর সমান বা বেশি। কোনোটাই যথেষ্ট এগোয়নি? তাহলে primary। এটা সঠিকতম সমাধান, আর distributed SQL সিস্টেমগুলো ঠিক এটাই করে।

**৩. প্রতি-query শ্রেণিবিন্যাস।** কিছু ডেটা কখনোই replica থেকে পড়া হবে না — অ্যাকাউন্ট ব্যালেন্স, পারমিশন, চেকআউটের স্টক। এগুলোকে কোডেই "primary-only" চিহ্নিত করুন, lag-এর হিসাব না করেই।

<Mermaid
title="Read-your-writes with a sticky primary window"
code={`sequenceDiagram
  participant U as "User Maryam"
  participant A as "App"
  participant P as "Primary"
  participant R as "Replica"
  U->>A: "POST /profile update city"
  A->>P: "UPDATE profiles"
  P-->>A: "ok, lsn 0/3A2F118"
  A-->>U: "200, session write_at = now"
  U->>A: "GET /profile"
  A->>A: "within 5s window, force primary"
  A->>P: "SELECT profile"
  P-->>A: "fresh row"
  A-->>U: "200 new city"
  Note over A,R: "after the window, reads go to replicas again"`}
/>

<Callout type="warning">

Replica **write capacity বাড়ায় না** — একটাও না। প্রতিটা replica primary-র প্রতিটা write নিজেও প্রয়োগ করে, তাই write-এর সীমা যেখানে ছিল সেখানেই থাকে। উল্টো, বেশি replica মানে primary-তে বেশি WAL স্ট্রিমিংয়ের চাপ। write সমস্যার জন্য replica কোনো সমাধান নয় — ওটার জন্যই sharding।

</Callout>

## ধাপ ৪: Vertical partitioning

Sharding-এ যাওয়ার আগে আরও একটা ধাপ আছে যেটা প্রায়ই এড়িয়ে যাওয়া হয় — টেবিলটাকে আড়াআড়ি না কেটে **লম্বালম্বি** কাটা। মানে row ভাগ না করে **কলাম বা টেবিল** ভাগ করা।

তিনটে রূপ:

**১. Hot/cold কলাম আলাদা করা.** একটা `users` টেবিলে যদি `id, email, name`-এর পাশে `bio` (৫ KB টেক্সট), `avatar_blob` আর `preferences_json` থাকে, তাহলে প্রতিটা row অনেক বড়। ডেটাবেস পেজপ্রতি কম row রাখতে পারে, ফলে `SELECT id, name FROM users WHERE ...` চালাতেও অনেক বেশি পেজ পড়তে হয় আর buffer pool দ্রুত ভরে যায়। বড় কলামগুলো একটা `user_profiles` টেবিলে সরিয়ে দিলে মূল টেবিলটা সরু হয় — প্রায়ই এটাই ২-৩ গুণ উন্নতি দেয়, একটাও সার্ভার না বাড়িয়ে।

**২. Blob ডেটাবেসের বাইরে নেওয়া.** ছবি, PDF, ভিডিও, বড় অ্যাটাচমেন্ট — এগুলো ডেটাবেসে রাখলে ব্যাকআপ বিশাল হয়, replication ধীর হয়, buffer pool নষ্ট হয়। এগুলো object storage-এ রাখুন, ডেটাবেসে শুধু URL আর মেটাডেটা।

**৩. কার্যকরী বিভাজন (functional separation).** সবচেয়ে শক্তিশালী রূপ: আলাদা ডোমেইনের টেবিলগুলো আলাদা ডেটাবেসে সরানো। `orders` একটা ডেটাবেসে, `analytics_events` আরেকটায়, `audit_log` তৃতীয়টায়। প্রতিটার লোড প্রোফাইল আলাদা, স্কেলিংয়ের প্রয়োজনও আলাদা — আর প্রতিটা এখন নিজের সার্ভার পায়।

```sql
-- Before: one wide table, every read drags the heavy columns along
-- users(id, email, name, bio, avatar_blob, preferences_json, created_at)

-- After: narrow hot table + cold satellite
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
  user_id           BIGINT PRIMARY KEY REFERENCES users(id),
  bio               TEXT,
  avatar_url        TEXT,          -- object storage, not the blob itself
  preferences_json  JSONB
);
```

<Callout type="tip">

কার্যকরী বিভাজন প্রায় সবসময় sharding-এর আগে করা উচিত, কারণ এটা করলে দেখা যায় আসলে **একটামাত্র টেবিল**ই বড় — বাকি সব ঠিকই আছে। আর তখন আপনাকে গোটা ডেটাবেস নয়, শুধু ওই একটা টেবিল shard করতে হয়। এটা কাজের পরিমাণ দশ গুণ কমিয়ে দেয়।

</Callout>

## ধাপ ৫: Sharding — শেষ অস্ত্র

উপরের সব করার পরও যদি একটামাত্র primary-তে write আর ধরছে না, ডেটাসেট একটা মেশিনের ডিস্কে আঁটছে না, বা working set মেমরিতে ধরছে না — তখন sharding। এক লাইনে: ডেটাকে টুকরো করে আলাদা আলাদা ডেটাবেসে রাখা, যেখানে প্রতিটা টুকরো নিজের write ক্ষমতা নিয়ে আসে।

### Shard key — একমাত্র সিদ্ধান্ত যেটা আপনি ফেরত নিতে পারবেন না

shard key হলো সেই কলাম যার মান দেখে ঠিক হয় row-টা কোন shard-এ যাবে। ভালো shard key-র তিনটে গুণ:

- **উচ্চ cardinality** — অনেক আলাদা মান, যাতে ডেটা মসৃণভাবে ছড়ায়। `country` খারাপ (দুইশো মান, আর ভীষণ অসম), `user_id` ভালো।
- **সমান বণ্টন** — কোনো একটা মান পুরো ট্রাফিকের বড় অংশ নেবে না।
- **query-র সাথে মিল** — আপনার ৯০% query-তে এই কলামটা `WHERE`-এ থাকতে হবে। না থাকলে প্রতিটা query সব shard-এ যাবে, আর তখন sharding আপনাকে ধীর করেছে, দ্রুত নয়।

| Shard key              | কেন ভালো / খারাপ                                                 |
| ---------------------- | ---------------------------------------------------------------- |
| `user_id` (hash)       | ভালো — উচ্চ cardinality, সমান, বেশিরভাগ query ইউজার-কেন্দ্রিক    |
| `tenant_id` (B2B SaaS) | ভালো — প্রাকৃতিক সীমানা, কিন্তু বড় tenant hot shard বানাতে পারে |
| `created_at` (range)   | বিপজ্জনক — সব নতুন write সবসময় শেষ shard-এ পড়ে (hot spot)      |
| `country`              | খারাপ — cardinality কম, বণ্টন ভয়ানক অসম                         |
| `auto-increment id`    | খারাপ range-এ — একই hot spot সমস্যা; hash করলে ঠিক আছে           |
| `status` / `is_active` | ভয়াবহ — মাত্র কয়েকটা মান, সবকিছু দু-তিনটে shard-এ জমে যাবে     |

<Callout type="warning">

shard key বদলানো মানে **পুরো ডেটাসেট আবার নতুন করে ভাগ করা** — সাধারণত dual-write, ব্যাকফিল আর কাটওভার সহ কয়েক মাসের প্রজেক্ট। তাই দুই দিন সময় নিয়ে আপনার প্রকৃত query log বিশ্লেষণ করুন: কোন কলামটা সবচেয়ে বেশি `WHERE`-এ আসে? সেটাই প্রার্থী। অনুমানে shard key বাছবেন না।

</Callout>

### তিনটে shard কৌশল

**Range-based.** `id 1–1M → shard 1`, `1M–2M → shard 2`। range query সহজ, নতুন shard যোগ করাও সহজ। কিন্তু hot spot প্রায় অনিবার্য — সব নতুন ডেটা সবসময় শেষ shard-এ পড়ে।

**Hash-based.** `shard = hash(shard_key) % N`। বণ্টন চমৎকার। কিন্তু range query অসম্ভব (`id BETWEEN 100 AND 200` এখন সব shard-এ), আর সবচেয়ে বড় সমস্যা — `% N`-এ N বদলালে **প্রায় সব key নতুন shard-এ চলে যায়**। ৪ থেকে ৫ shard-এ গেলে ~৮০% ডেটা সরাতে হবে।

**Directory-based.** একটা lookup সার্ভিস মনে রাখে কোন key কোন shard-এ। সবচেয়ে নমনীয় — যেকোনো tenant-কে যেকোনো shard-এ সরানো যায়, বড় গ্রাহককে আলাদা shard দেওয়া যায়। খরচ: প্রতিটা query-র আগে একটা lookup (যা অবশ্যই ক্যাশ করতে হবে), আর directory নিজেই একটা single point of failure।

### Consistent hashing আর virtual bucket

`% N`-এর সমস্যাটার সমাধান, আর বাস্তবে সবচেয়ে বেশি ব্যবহৃত পদ্ধতি: key-কে সরাসরি shard-এ ম্যাপ না করে **একটা মধ্যবর্তী স্তরে** ম্যাপ করুন।

স্থির সংখ্যক bucket ঠিক করুন — ধরুন ৪০৯৬টা, যেটা আর কখনো বদলাবে না। তারপর:

```
bucket = hash(shard_key) % 4096      // never changes
shard  = bucket_to_shard[bucket]      // a small, editable mapping
```

এখন একটা shard যোগ করা মানে শুধু কিছু bucket-এর মালিকানা বদলানো। ৪ থেকে ৫ shard-এ গেলে ৪০৯৬-এর প্রায় ১/৫ অংশ, অর্থাৎ ~৮০০টা bucket সরাতে হবে — বাকি ৮০% ডেটা যেখানে আছে সেখানেই থাকবে। মাইগ্রেশনও bucket ধরে ধরে, একটা একটা করে করা যায়।

<Mermaid
title="Virtual buckets between keys and shards"
code={`graph TD
  K["shard_key<br/>user id 88213"] --> H["hash mod 4096<br/>bucket 1907"]
  H --> M["bucket to shard map"]
  M --> S1["shard-baghdad-01<br/>buckets 0 to 1023"]
  M --> S2["shard-cordoba-02<br/>buckets 1024 to 2047"]
  M --> S3["shard-samarkand-03<br/>buckets 2048 to 3071"]
  M --> S4["shard-cairo-04<br/>buckets 3072 to 4095"]
  S2 -.->|"rebalance moves<br/>only some buckets"| S5["shard-fez-05<br/>new"]`}
/>

### Hot shard আর celebrity key

সমান hash-ও যথেষ্ট নয়, কারণ সব key-র ট্রাফিক সমান নয়। একজন সেলিব্রিটির অ্যাকাউন্ট বা একটা বিশাল enterprise tenant একাই তার shard-কে ডুবিয়ে দিতে পারে — বাকি shard গুলো তখন অলস বসে আছে।

প্রতিকার:

- **শনাক্ত করুন।** প্রতি shard-এর QPS আর p99 আলাদা করে মনিটর করুন, এবং সবচেয়ে ব্যস্ত key-গুলোর তালিকা রাখুন। "গড় shard লোড" দেখলে hot shard কখনোই ধরা পড়বে না।
- **সেলিব্রিটিকে ক্যাশ করুন।** যে অল্প কয়েকটা key-তে বেশিরভাগ পড়া হচ্ছে, সেগুলোতে আগ্রাসী ক্যাশিং সবচেয়ে বেশি কাজে দেয় — read-এর হট স্পট প্রায়ই এভাবেই মিটে যায়।
- **Key salting.** লেখার হট স্পটে shard key-র সাথে একটা ছোট সাফিক্স যোগ করুন (`post:9912:0` ... `post:9912:15`), যাতে একটা লজিক্যাল এন্টিটির লেখা ১৬টা shard-এ ছড়ায়। পড়ার সময় ১৬টা টুকরো মিলিয়ে নিতে হয় — এটা কাউন্টার-জাতীয় ডেটার জন্যই মূলত উপযুক্ত।
- **আলাদা shard দিন.** directory-based routing থাকলে সবচেয়ে বড় tenant-কে নিজের একটা shard দিয়ে দিন। বাস্তবে B2B SaaS-এ এটাই সবচেয়ে বেশি ব্যবহৃত সমাধান।

### Shard করলে যা স্থায়ীভাবে হারান

এই তালিকাটাই sharding-কে শেষ ধাপে রাখার আসল কারণ।

| যা হারান                       | কী ঘটে                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Cross-shard `JOIN`             | ডেটাবেস আর জোড়া লাগাতে পারে না; অ্যাপে দুবার query করে মেমরিতে মেলাতে হয়            |
| `AUTO_INCREMENT` id            | shard গুলো একই নম্বর দেবে; UUIDv7 বা Snowflake-জাতীয় id লাগবে                        |
| Global uniqueness              | `UNIQUE(email)` আর প্রয়োগ হয় না; আলাদা একটা global index টেবিল লাগে                 |
| Cross-shard `ORDER BY`/`LIMIT` | প্রতিটা shard থেকে বেশি row এনে অ্যাপে merge করতে হয়                                 |
| `COUNT(*)` আর aggregate        | সব shard-এ চালিয়ে যোগ করতে হয়; অনেক সময় আলাদা counter টেবিলই ভালো                  |
| ACID ট্রানজেকশন                | এক shard-এর ভেতরে ঠিক আছে; দুই shard জুড়ে দুই-ধাপ commit বা saga লাগে (চ্যাপ্টার ১১) |
| স্কিমা মাইগ্রেশন               | একটা `ALTER TABLE` নয়, N টা — কিছু সফল হয়ে কিছু ফেল করতে পারে                       |
| অপারেশনাল সরলতা                | ব্যাকআপ, রিস্টোর, মনিটরিং, failover — সবই এখন N গুণ                                   |

<Callout type="info">

**Global uniqueness-এর ব্যবহারিক সমাধান:** ইমেইলের মতো কলামের জন্য একটা ছোট আলাদা টেবিল রাখুন যা `email → user_id` ম্যাপ করে, এবং সেটা `email` ধরে shard করা। রেজিস্ট্রেশনে প্রথমে ওই টেবিলে conditional insert করুন; সফল হলে তবেই মূল shard-এ ইউজার তৈরি করুন। অর্থাৎ uniqueness-এর দায়িত্ব একটা আলাদা, সঠিক shard key-ওয়ালা কাঠামোর হাতে দিন।

</Callout>

### Cross-shard query: scatter-gather

কিছু query-তে shard key থাকবেই না — "গত ২৪ ঘণ্টায় সবচেয়ে বেশি পড়া ২০টা লেখা"। তখন একমাত্র উপায় হলো প্রতিটা shard-এ query পাঠিয়ে ফলাফল মেলানো।

গুরুত্বপূর্ণ সূক্ষ্মতা: `LIMIT 20` চাইলে প্রতিটা shard থেকেও **২০টাই** আনতে হবে (২০/N নয়), কারণ সত্যিকারের শীর্ষ ২০-এর সবগুলোই এক shard-এ থাকতে পারে। মানে ৮ shard-এ ১৬০ row এনে অ্যাপে sort করে ২০টা রাখা।

আর `OFFSET` সহ pagination scatter-gather-এ বিপর্যয়কর — `LIMIT 20 OFFSET 10000` মানে প্রতি shard থেকে ১০,০২০ row আনা। এজন্যই sharded সিস্টেমে **cursor-based pagination** কার্যত বাধ্যতামূলক।

<Callout type="tip">

Scatter-gather-এর latency সবচেয়ে ধীর shard-এর latency। ৮টা shard-এর প্রতিটার p99 যদি ৫০ ms হয়, তাহলে অন্তত একটার ধীর হওয়ার সম্ভাবনা অনেক বেশি — ফলে মোট p99 একক shard-এর p99-এর চেয়ে অনেক খারাপ। তাই প্রতি-shard timeout রাখুন এবং সম্ভব হলে আংশিক ফলাফল ফেরত দিন। এই query গুলো যত কম, তত ভালো — নিয়মিত দরকার হলে বুঝতে হবে shard key-টাই ভুল, অথবা কাজটা আসলে একটা আলাদা read-optimized স্টোরের (search index / OLAP) জন্য।

</Callout>

## একটা sharded data-access লেয়ার

নিচের ইমপ্লিমেন্টেশনে এই চ্যাপ্টারের সবকিছু একসাথে আছে: virtual bucket-এর উপর consistent hashing, shard router, প্রতি shard-এ primary + replica pool, replication-lag-সচেতন read-your-writes গার্ড, আর merge সহ scatter-gather।

```typescript
import { createHash } from 'node:crypto';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

/** Fixed forever. Changing this reshuffles every key, so pick it once. */
const BUCKET_COUNT = 4096;

/** Reads newer than this window are pinned to the primary. */
const READ_YOUR_WRITES_WINDOW_MS = 5_000;

/** A replica lagging more than this is temporarily removed from rotation. */
const MAX_ACCEPTABLE_LAG_MS = 2_000;

export interface ShardConfig {
	id: string; // e.g. "shard-baghdad-01"
	primaryUrl: string; // e.g. "postgres://app@db-baghdad-primary.internal/records"
	replicaUrls: string[];
	maxConnections?: number;
}

export interface ClusterConfig {
	shards: ShardConfig[];
	/** bucket index -> shard id. Length must equal BUCKET_COUNT. */
	bucketMap: string[];
}

/**
 * Builds an even bucket map. In production this map lives in a config store
 * (etcd / Consul / a config table) so rebalancing does not need a deploy.
 */
export function evenBucketMap(shardIds: string[]): string[] {
	const map = new Array<string>(BUCKET_COUNT);
	for (let b = 0; b < BUCKET_COUNT; b++) {
		map[b] = shardIds[b % shardIds.length];
	}
	return map;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export function bucketFor(shardKey: string): number {
	// A stable hash. Never use a runtime-seeded hash here: a process restart
	// would route the same key to a different shard.
	const digest = createHash('sha1').update(shardKey).digest();
	return digest.readUInt32BE(0) % BUCKET_COUNT;
}

export class ShardRouter {
	constructor(private bucketMap: string[]) {
		if (bucketMap.length !== BUCKET_COUNT) {
			throw new Error(`bucket map must have exactly ${BUCKET_COUNT} entries`);
		}
	}

	shardIdFor(shardKey: string): string {
		return this.bucketMap[bucketFor(shardKey)];
	}

	/** Moving buckets between shards is how rebalancing happens. */
	reassignBuckets(buckets: number[], toShardId: string): void {
		for (const b of buckets) this.bucketMap[b] = toShardId;
	}

	bucketsOwnedBy(shardId: string): number[] {
		const out: number[] = [];
		for (let b = 0; b < BUCKET_COUNT; b++) {
			if (this.bucketMap[b] === shardId) out.push(b);
		}
		return out;
	}
}

// ---------------------------------------------------------------------------
// Per-shard connection pools
// ---------------------------------------------------------------------------

interface ReplicaState {
	pool: Pool;
	url: string;
	lagMs: number;
	healthy: boolean;
}

class Shard {
	readonly id: string;
	readonly primary: Pool;
	private replicas: ReplicaState[];
	private rr = 0;

	constructor(cfg: ShardConfig) {
		this.id = cfg.id;
		const max = cfg.maxConnections ?? 10;

		this.primary = new Pool({
			connectionString: cfg.primaryUrl,
			max,
			idleTimeoutMillis: 30_000,
			connectionTimeoutMillis: 2_000,
			statement_timeout: 5_000
		});

		this.replicas = cfg.replicaUrls.map((url) => ({
			url,
			pool: new Pool({
				connectionString: url,
				max,
				idleTimeoutMillis: 30_000,
				connectionTimeoutMillis: 2_000,
				statement_timeout: 5_000
			}),
			lagMs: 0,
			healthy: true
		}));
	}

	/** Round-robins over replicas that are healthy and not lagging. */
	pickReadPool(): Pool {
		const usable = this.replicas.filter((r) => r.healthy && r.lagMs <= MAX_ACCEPTABLE_LAG_MS);
		if (usable.length === 0) return this.primary; // fail safe, not fail fast
		this.rr = (this.rr + 1) % usable.length;
		return usable[this.rr].pool;
	}

	async refreshLag(): Promise<void> {
		await Promise.all(
			this.replicas.map(async (r) => {
				try {
					const res = await r.pool.query<{ lag_seconds: number }>(
						`SELECT CASE WHEN pg_is_in_recovery()
						             THEN EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
						             ELSE 0 END AS lag_seconds`
					);
					r.lagMs = Number(res.rows[0]?.lag_seconds ?? 0) * 1000;
					r.healthy = true;
					if (r.lagMs > MAX_ACCEPTABLE_LAG_MS) {
						console.warn(`[shard ${this.id}] replica ${r.url} lagging ${r.lagMs.toFixed(0)}ms`);
					}
				} catch (err) {
					r.healthy = false;
					console.error(`[shard ${this.id}] replica ${r.url} health check failed:`, err);
				}
			})
		);
	}

	async close(): Promise<void> {
		await Promise.all([this.primary.end(), ...this.replicas.map((r) => r.pool.end())]);
	}
}

// ---------------------------------------------------------------------------
// Session context: carries the read-your-writes watermark
// ---------------------------------------------------------------------------

export interface SessionContext {
	sessionId: string;
	/** Unix ms of this session's last write. Persist in the session store. */
	lastWriteAt?: number;
}

function mustReadFromPrimary(ctx: SessionContext | undefined): boolean {
	if (!ctx?.lastWriteAt) return false;
	return Date.now() - ctx.lastWriteAt < READ_YOUR_WRITES_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Cluster
// ---------------------------------------------------------------------------

export interface ClusterMetrics {
	primaryReads: number;
	replicaReads: number;
	stickyPrimaryReads: number;
	writes: number;
	scatterQueries: number;
	shardErrors: number;
}

export class ShardedCluster {
	private shards = new Map<string, Shard>();
	private router: ShardRouter;
	private lagTimer?: NodeJS.Timeout;

	readonly metrics: ClusterMetrics = {
		primaryReads: 0,
		replicaReads: 0,
		stickyPrimaryReads: 0,
		writes: 0,
		scatterQueries: 0,
		shardErrors: 0
	};

	constructor(cfg: ClusterConfig) {
		for (const s of cfg.shards) this.shards.set(s.id, new Shard(s));
		this.router = new ShardRouter(cfg.bucketMap);
	}

	startLagMonitor(intervalMs = 1_000): void {
		this.lagTimer = setInterval(() => {
			for (const shard of this.shards.values()) {
				void shard.refreshLag();
			}
		}, intervalMs);
		this.lagTimer.unref();
	}

	private shardFor(shardKey: string): Shard {
		const id = this.router.shardIdFor(shardKey);
		const shard = this.shards.get(id);
		if (!shard) throw new Error(`no shard registered for id ${id}`);
		return shard;
	}

	/** Single-shard read. Routes to a replica unless the session just wrote. */
	async read<T extends QueryResultRow>(
		shardKey: string,
		sql: string,
		params: unknown[] = [],
		ctx?: SessionContext
	): Promise<T[]> {
		const shard = this.shardFor(shardKey);
		const sticky = mustReadFromPrimary(ctx);
		const pool = sticky ? shard.primary : shard.pickReadPool();

		if (sticky) this.metrics.stickyPrimaryReads++;
		else if (pool === shard.primary) this.metrics.primaryReads++;
		else this.metrics.replicaReads++;

		const res = await pool.query<T>(sql, params);
		return res.rows;
	}

	/** Reads that must never be stale, regardless of lag. */
	async readFromPrimary<T extends QueryResultRow>(
		shardKey: string,
		sql: string,
		params: unknown[] = []
	): Promise<T[]> {
		this.metrics.primaryReads++;
		const res = await this.shardFor(shardKey).primary.query<T>(sql, params);
		return res.rows;
	}

	/** Single-shard write. Stamps the session watermark on success. */
	async write<T extends QueryResultRow>(
		shardKey: string,
		sql: string,
		params: unknown[] = [],
		ctx?: SessionContext
	): Promise<T[]> {
		const shard = this.shardFor(shardKey);
		const res = await shard.primary.query<T>(sql, params);
		this.metrics.writes++;
		if (ctx) ctx.lastWriteAt = Date.now();
		return res.rows;
	}

	/**
	 * Transaction confined to one shard. Cross-shard transactions are not
	 * offered on purpose: they need two-phase commit or a saga.
	 */
	async transaction<T>(shardKey: string, fn: (c: PoolClient) => Promise<T>, ctx?: SessionContext) {
		const client = await this.shardFor(shardKey).primary.connect();
		try {
			await client.query('BEGIN');
			const out = await fn(client);
			await client.query('COMMIT');
			this.metrics.writes++;
			if (ctx) ctx.lastWriteAt = Date.now();
			return out;
		} catch (err) {
			await client.query('ROLLBACK').catch(() => undefined);
			throw err;
		} finally {
			client.release();
		}
	}

	/**
	 * Scatter-gather across every shard.
	 *
	 * Note the per-shard limit: to get a global top-N you must fetch N from
	 * each shard, because all N could live on one of them.
	 */
	async scatterGather<T extends QueryResultRow>(
		sql: string,
		params: unknown[],
		opts: {
			limit?: number;
			compare?: (a: T, b: T) => number;
			perShardTimeoutMs?: number;
			allowPartial?: boolean;
		} = {}
	): Promise<{ rows: T[]; failedShards: string[] }> {
		this.metrics.scatterQueries++;
		const timeout = opts.perShardTimeoutMs ?? 3_000;
		const failedShards: string[] = [];

		const results = await Promise.all(
			[...this.shards.values()].map(async (shard) => {
				try {
					const pool = shard.pickReadPool();
					const res = await withTimeout(pool.query<T>(sql, params), timeout, shard.id);
					return res.rows;
				} catch (err) {
					this.metrics.shardErrors++;
					failedShards.push(shard.id);
					console.error(`[scatter] shard ${shard.id} failed:`, err);
					return [] as T[];
				}
			})
		);

		if (failedShards.length > 0 && !opts.allowPartial) {
			throw new Error(`scatter-gather incomplete, shards failed: ${failedShards.join(', ')}`);
		}

		let merged = results.flat();
		if (opts.compare) merged.sort(opts.compare);
		if (opts.limit !== undefined) merged = merged.slice(0, opts.limit);
		return { rows: merged, failedShards };
	}

	/** Count across shards. Cheap-looking, expensive in practice. */
	async countAll(sql: string, params: unknown[] = []): Promise<number> {
		const { rows } = await this.scatterGather<{ n: string }>(sql, params, { allowPartial: false });
		return rows.reduce((sum, r) => sum + Number(r.n), 0);
	}

	async close(): Promise<void> {
		if (this.lagTimer) clearInterval(this.lagTimer);
		await Promise.all([...this.shards.values()].map((s) => s.close()));
	}
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms on ${label}`)), ms);
		p.then(
			(v) => {
				clearTimeout(t);
				resolve(v);
			},
			(e) => {
				clearTimeout(t);
				reject(e);
			}
		);
	});
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

interface Manuscript extends QueryResultRow {
	id: string;
	owner_id: string;
	title: string;
	views: number;
}

const shardIds = ['shard-baghdad-01', 'shard-cordoba-02', 'shard-samarkand-03', 'shard-cairo-04'];

export const cluster = new ShardedCluster({
	shards: [
		{
			id: 'shard-baghdad-01',
			primaryUrl: 'postgres://app@db-baghdad-primary.internal/records',
			replicaUrls: ['postgres://app@db-baghdad-replica-a.internal/records']
		},
		{
			id: 'shard-cordoba-02',
			primaryUrl: 'postgres://app@db-cordoba-primary.internal/records',
			replicaUrls: ['postgres://app@db-cordoba-replica-a.internal/records']
		},
		{
			id: 'shard-samarkand-03',
			primaryUrl: 'postgres://app@db-samarkand-primary.internal/records',
			replicaUrls: ['postgres://app@db-samarkand-replica-a.internal/records']
		},
		{
			id: 'shard-cairo-04',
			primaryUrl: 'postgres://app@db-cairo-primary.internal/records',
			replicaUrls: ['postgres://app@db-cairo-replica-a.internal/records']
		}
	],
	bucketMap: evenBucketMap(shardIds)
});

cluster.startLagMonitor();

/** Shard key present: a single shard answers. This is the fast path. */
export async function listManuscriptsByOwner(ownerId: string, ctx: SessionContext) {
	return cluster.read<Manuscript>(
		ownerId,
		`SELECT id, owner_id, title, views
		 FROM manuscripts
		 WHERE owner_id = $1
		 ORDER BY created_at DESC
		 LIMIT 20`,
		[ownerId],
		ctx
	);
}

/** A write, followed immediately by a read that must see it. */
export async function renameManuscript(
	ownerId: string,
	manuscriptId: string,
	title: string,
	ctx: SessionContext
) {
	await cluster.write(
		ownerId,
		`UPDATE manuscripts SET title = $1, updated_at = now()
		 WHERE id = $2 AND owner_id = $3`,
		[title, manuscriptId, ownerId],
		ctx
	);
	// ctx.lastWriteAt is now set, so this read is pinned to the primary.
	return listManuscriptsByOwner(ownerId, ctx);
}

/** No shard key: every shard is queried and results are merged. */
export async function globalTopManuscripts(limit = 20) {
	const { rows, failedShards } = await cluster.scatterGather<Manuscript>(
		`SELECT id, owner_id, title, views
		 FROM manuscripts
		 WHERE created_at > now() - interval '24 hours'
		 ORDER BY views DESC
		 LIMIT $1`,
		[limit], // per shard, not divided by shard count
		{
			limit,
			compare: (a, b) => b.views - a.views,
			perShardTimeoutMs: 2_000,
			allowPartial: true
		}
	);
	if (failedShards.length > 0) {
		console.warn(`[trending] serving partial results, missing: ${failedShards.join(', ')}`);
	}
	return rows;
}
```

## এই ইমপ্লিমেন্টেশনে যা যা প্রোডাকশন-গ্রেড

- **Virtual bucket** — key সরাসরি shard-এ নয়, ৪০৯৬টা স্থির bucket-এ ম্যাপ হয়, তাই shard যোগ করলে ডেটার সামান্য অংশই সরে
- **Stable hash** — SHA-1-এর প্রথম ৪ বাইট, রানটাইম seed নেই; প্রসেস রিস্টার্টে একই key একই shard-এ যায়
- **Lag-সচেতন routing** — যে replica ২ সেকেন্ডের বেশি পিছিয়ে সে রোটেশন থেকে বাদ, আর কোনোটাই ব্যবহারযোগ্য না হলে primary-তে fail-safe
- **Read-your-writes** — সেশনে শেষ write-এর টাইমস্ট্যাম্প, পরের ৫ সেকেন্ড primary-তে pin
- **Primary-only পথ আলাদা** — যে ডেটা কখনোই stale হতে পারে না তার জন্য সম্পূর্ণ আলাদা মেথড, যাতে ভুল করে replica-তে না যায়
- **Transaction এক shard-এ সীমাবদ্ধ** — API-তেই cross-shard transaction নেই, তাই ভুল করে লেখা সম্ভব নয়
- **Scatter-gather-এ per-shard timeout, partial result আর shard-ভিত্তিক error মেট্রিক** — একটা shard ধীর হলে পুরো এন্ডপয়েন্ট মরে না

## Sharding-এ যাওয়ার আগে চেকলিস্ট

এই তালিকার প্রতিটা "না" আপনাকে কয়েক মাস বাঁচিয়ে দিতে পারে।

- ধীরতম দশটা query-র `EXPLAIN ANALYZE` দেখেছেন, আর কোনো `Seq Scan` বাকি নেই?
- অব্যবহৃত index মুছে ফেলেছেন, আর প্রতি HTTP রিকোয়েস্টে query সংখ্যা মনিটর করছেন (N+1 নেই)?
- connection pool ঠিকভাবে মাপা, আর সামনে PgBouncer বসানো?
- read replica যোগ করে read লোড সরিয়েছেন? primary-র CPU-র কতটা এখনো write?
- হট টেবিল থেকে বড় কলাম আর blob সরিয়েছেন? আলাদা ডোমেইন আলাদা ডেটাবেসে গেছে?
- আগে vertical scaling চেষ্টা করেছেন? আজকের একটা মেশিনে ১২৮ core আর ২ TB RAM পাওয়া যায় — সেটা অনেক দূর নিয়ে যায়, আর একজন ইঞ্জিনিয়ারের তিন মাসের বেতনের চেয়ে সস্তা
- পুরনো ডেটা আর্কাইভ করেছেন? প্রায়ই ৮০% row এমন যা কেউ পড়ে না — cold storage-এ সরালে টেবিল পাঁচ গুণ ছোট হয়

এতগুলোর উত্তর "হ্যাঁ" হওয়ার পরও যদি একটা primary-তে write ধরছে না — তখন shard করুন, এবং shard key-টা মন দিয়ে বাছুন।

<div class="takeaways">

### মূল শেখা

- ক্রমটাই মূল শিক্ষা: **index → connection pool → read replica → vertical partitioning → sharding**। প্রতিটা ধাপ পরেরটার চেয়ে অনেক সস্তা, আর বেশিরভাগ "আমাদের shard করতে হবে" আসলে একটা missing index
- `EXPLAIN ANALYZE` না দেখে index বসাবেন না। `Rows Removed by Filter`-এর বড় সংখ্যাই সবচেয়ে স্পষ্ট সংকেত
- Composite index-এ কলামের ক্রম নির্ধারক — equality কলাম আগে, range আর `ORDER BY` পরে; leftmost prefix না মিললে index ব্যবহারই হবে না
- প্রতিটা index পড়াকে দ্রুত আর লেখাকে ধীর করে; অব্যবহৃত index নিয়মিত খুঁজে মুছুন
- Read replica **read** স্কেল করে, write নয় — এবং async replication মানেই replication lag, যার সবচেয়ে দৃশ্যমান রূপ read-your-own-writes সমস্যা
- Shard key হলো একমাত্র সিদ্ধান্ত যা আপনি কার্যত ফেরত নিতে পারবেন না — উচ্চ cardinality, সমান বণ্টন, আর আপনার আসল query pattern-এর সাথে মিল, এই তিনটেই লাগবে
- সরাসরি `hash % N` নয়, স্থির সংখ্যক **virtual bucket**-এর উপর ম্যাপ করুন — তাহলে shard যোগ করা মানে সামান্য ডেটা সরানো, সব নয়
- Shard করলে JOIN, autoincrement id, global uniqueness আর cross-shard `ORDER BY` — সবই আপনার অ্যাপ্লিকেশন কোডের দায়িত্ব হয়ে যায়, চিরতরে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Instagram** বহু বছর PostgreSQL-এ logical shard আর virtual bucket ব্যবহার করেছে, আর id তৈরিতে Snowflake-ধাঁচের টাইমস্ট্যাম্প-ভিত্তিক স্কিম নিয়েছে — কারণ shard-এর পর autoincrement আর কাজ করে না
- **Notion** ২০২১-এ একটামাত্র বিশাল Postgres থেকে workspace id ধরে ৩২টা shard-এ গেছে, ঠিক এই ক্রমেই — আগে index আর vertical কাজ, তারপর shard, আর shard key হিসেবে এমন কলাম যা তাদের প্রায় সব query-তে থাকে
- **Discord** বার্তা স্টোর Cassandra হয়ে ScyllaDB-তে নিয়েছে, যেখানে shard key `(channel_id, bucket)` — এবং জনপ্রিয় চ্যানেলের hot partition সমস্যাটাই ছিল তাদের সবচেয়ে বড় অপারেশনাল যন্ত্রণা
- **Shopify** pod-ভিত্তিক আর্কিটেকচারে প্রতিটা মার্চেন্টকে একটা নির্দিষ্ট pod-এ রাখে (directory-based sharding), যাতে বড় মার্চেন্টকে আলাদা করে সরানো যায় — Black Friday-র হট শপ সমস্যার সরাসরি সমাধান

</div>
