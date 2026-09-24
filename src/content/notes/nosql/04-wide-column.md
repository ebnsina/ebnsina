---
title: 'Wide-Column স্টোর'
subtitle: 'Cassandra আর Bigtable: partition key, clustering key, query-first মডেলিং, write-optimized LSM পাথ, এবং tunable consistency।'
chapter: 4
level: 'advanced'
readingTime: '12 মিনিট'
topics: ['cassandra', 'partition key', 'clustering']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা বিশাল গুদামের কথা ভাবুন যা জিনিস রেখে দেওয়ার জন্য সাজানো, ঘুরে দেখার জন্য নয়। প্রতিটা প্যালেটের (partition) একটা অনন্য লেবেল আছে, আর একটা ফর্কলিফট সোজা সেটার কাছে চলে যেতে পারে। প্যালেটের ভেতরে, বাক্সগুলো একটা নির্দিষ্ট ক্রমে স্তূপ করা (clustering)। আপনি একটা প্যালেট দ্রুত ধরতে পারেন, বা তার ভেতরের বাক্সগুলো ক্রমে scan করতে পারেন — কিন্তু আপনি "সব প্যালেট জুড়ে প্রতিটা লাল বাক্স খুঁজে দাও" জিজ্ঞেস করতে পারেন না পুরো গুদাম না ঘুরে। সেই query-টা দ্রুত করতে, আপনি একটা দ্বিতীয় গুদাম বানান যা লাল-আগে সাজানো। Wide-column স্টোর বিস্ময়কর স্কেলে partition দিয়ে write ও read করার ক্ষমতার বিনিময়ে নমনীয় query করাকে ট্রেড করে।

</Callout>

## গল্পে বুঝি

সারা দেশে একটা জাতীয় আদমশুমারি চলছে, আর সিনার দায়িত্বে পড়েছে একটা বিশাল দল নিয়ে কোটি কোটি মানুষের তথ্য রেজিস্টারে তোলা। প্রতিটা মানুষের জন্য একটা করে সারি (row), কিন্তু মজার ব্যাপার হলো সবার ঘর এক না — কারও ব্যবসার তথ্য লাগে, কারও পড়াশোনার, কারও কৃষিজমির। খোয়ারিজমির সারিতে শুধু কৃষিজমির ঘর ভরা, ফাতিমার সারিতে শুধু চাকরি আর শিক্ষার ঘর, বাকি ঘরগুলো ফাঁকাই থেকে যায়। কেউ জোর করে সবার সব ঘর ভরায় না — যেটার তথ্য নেই সেই column-টা সেই row-তে থাকেই না। এটাই sparse row: এক এক row-তে এক এক রকম column।

সিনা আবার সম্পর্কিত ঘরগুলো এক এক সেকশনে বেঁধে রেখেছে — "পরিবার" সেকশনে সব পারিবারিক তথ্য, "আয়" সেকশনে সব অর্থনৈতিক তথ্য, একেকটা যেন একেকটা column family। আর কাজটা এত বিশাল যে একটা রেজিস্টারে বা একজন কেরানির হাতে হবে না। তাই সিনা মানুষগুলোকে এলাকা অনুযায়ী ভাগ করে হাজার হাজার কেরানির মধ্যে বিলি করে দিয়েছে — প্রতি কেরানি নিজের ভাগের রেজিস্টারেই লেখে (partition)। ফলে একই সময়ে লক্ষ লক্ষ নতুন এন্ট্রি সমান্তরালে লেখা হতে থাকে, কোথাও লাইন জমে না।

এই গল্পটাই আসলে **wide-column store**। প্রতিটা মানুষ একটা **row**, কিন্তু সবার column এক নয় — যার যেটা লাগে সেটাই থাকে, তাই টেবিলটা **sparse**। সম্পর্কিত column-গুলো **column family**-তে বাঁধা। মানুষদের এলাকা অনুযায়ী কেরানিদের মধ্যে ভাগ করাটাই **partitioning** (partition key দিয়ে ঠিক হয় কোন node কোন row রাখবে), আর একসাথে হাজার কেরানির লেখাটাই বিশাল **write throughput**-এ scale করা। বাস্তবে **Cassandra**, **HBase**, আর Google-এর **Bigtable** ঠিক এভাবেই কাজ করে — কোটি কোটি sparse row অসংখ্য node-এ ছড়িয়ে দিয়ে বিপুল হারে write সামলায়, যেমন time-series ডেটা, IoT telemetry বা মেসেজিং হিস্ট্রি।

## Wide-Column মডেল

একটা wide-column স্টোর (Cassandra, Google Bigtable, ScyllaDB, HBase) উপরিভাগে একটা টেবিলের মতো দেখায়, কিন্তু এর আচরণ খুবই আলাদা। ডেটা **partition**-এ গোষ্ঠীবদ্ধ থাকে, আর প্রতিটা partition একটা ordered set of **row** ধরে রাখে, যেখানে প্রতিটা row হলো column-এর একটা sparse সংগ্রহ। ভিন্ন ভিন্ন row-তে একদম আলাদা column থাকতে পারে — তাই "wide column"।

মডেলটা এর key-এর গঠনের মধ্য দিয়ে সবচেয়ে ভালো বোঝা যায়। একটা primary key-এর দুটো অংশ থাকে:

```text
PRIMARY KEY ( (partition_key) , clustering_key1, clustering_key2 )
              ^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
              which node owns    sort order WITHIN the partition
              the data
```

**partition key** ঠিক করে ক্লাস্টারের কোন node ডেটা স্টোর করে (একটা hash-এর মাধ্যমে)। **clustering key(s)** সেই partition-এর _ভেতরে_ row-গুলোর sort order ঠিক করে। একসাথে তারা একটা row-কে অনন্যভাবে চিহ্নিত করে।

## Partition Key বনাম Clustering Key

এই পার্থক্যটা সবকিছু নিয়ন্ত্রণ করে। এটা ভুল করলে আপনার ক্লাস্টার হয় hot partition-এর নিচে গলে যায় নয়তো আপনার query-র উত্তর দিতে পারে না।

একজন ইউজারের মেসেজ স্টোর করার কথা ভাবুন, নতুনটা আগে:

```sql
CREATE TABLE messages_by_user (
  user_id   uuid,
  sent_at   timestamp,
  message_id uuid,
  body      text,
  PRIMARY KEY ( (user_id), sent_at, message_id )
) WITH CLUSTERING ORDER BY (sent_at DESC);
```

- `user_id` হলো **partition key**: একজন ইউজারের সব মেসেজ একই node-গুলোতে একসাথে থাকে, তাই সেগুলো fetch করা একটা single-partition read।
- `sent_at` (তারপর `message_id`) হলো **clustering key**: partition-এর ভেতরে, row-গুলো সময় অনুসারে descending sort করে স্টোর করা, তাই "এই ইউজারের 20টা নতুন মেসেজ দাও" একটা দ্রুত, contiguous scan।

```sql
-- Efficient: hits one partition, reads rows in clustering order
SELECT * FROM messages_by_user
WHERE user_id = ? LIMIT 20;

-- ILLEGAL / slow: no partition key means scanning the whole cluster
SELECT * FROM messages_by_user
WHERE body = 'hello';
```

এখান থেকে দুটো ডিজাইন নিয়ম বেরিয়ে আসে। partition key-কে অবশ্যই ডেটা **সমানভাবে** ছড়াতে হবে (`country`-র মতো একটা key বিশাল hot partition তৈরি করে; `user_id`-এর মতো একটা key লোড ছড়িয়ে দেয়)। আর প্রতিটা দ্রুত query-তে অবশ্যই partition key থাকতে হবে — SQL যেভাবে অনুমতি দেয় সেভাবে আপনি স্বেচ্ছাচারী column দিয়ে অবাধে filter করতে পারবেন না।

## Query-First মডেলিং

একটা রিলেশনাল ডেটাবেসে আপনি এন্টিটির চারপাশে টেবিল ডিজাইন করেন আর planner-কে query বের করতে দেন। Cassandra-তে আপনি উল্টোটা করেন: **আপনি আগে আপনার query তালিকাভুক্ত করেন, তারপর প্রতি query-র জন্য একটা করে টেবিল বানান**, প্রতিটা এমনভাবে সাজানো যাতে query একটা single-partition read হয়। একই ডেটা কয়েকটা টেবিল জুড়ে duplicate থাকে, প্রতিটা আলাদাভাবে key করা।

আপনার যদি মেসেজ _by user_ এবং _by conversation_ দুইভাবেই দরকার হয়, আপনি দুটো টেবিল বানান:

```sql
CREATE TABLE messages_by_user (
  user_id uuid, sent_at timestamp, message_id uuid, body text,
  PRIMARY KEY ( (user_id), sent_at, message_id )
);

CREATE TABLE messages_by_conversation (
  conversation_id uuid, sent_at timestamp, message_id uuid, body text,
  PRIMARY KEY ( (conversation_id), sent_at, message_id )
);
```

একটা মেসেজ লেখা দুটো টেবিলেই insert করে। এই denormalization SQL থেকে আসা কারও কাছে অপচয় মনে হয়, কিন্তু storage সস্তা আর প্রতিদান হলো _প্রতিটা_ read একটা দ্রুত single-partition lookup। fallback করার মতো কোনো join engine নেই, তাই আপনি যেকোনো স্কেলে অনুমানযোগ্য read পারফরম্যান্সের জন্য write amplification আর duplication-কে ট্রেড করেন।

<Callout type="tip">

**নোট:** wide-column মডেলিংয়ের জন্য একটা কাজের মন্ত্র: "join আর ad-hoc filter নেই, তাই টেবিলটাকে এমনভাবে ডিজাইন করো যাতে সেটাই _উত্তর হয়_।" যদি একটা নতুন query আসে যেটাকে বিদ্যমান কোনো টেবিল দক্ষভাবে সেবা দেয় না, সমাধান সাধারণত একটা নতুন টেবিল (বা একটা materialized view), কোনো চতুর `WHERE` clause নয়।

</Callout>

## Write Path

Wide-column স্টোর write-optimized, আর এর কারণ তাদের storage engine: **LSM-tree** (Log-Structured Merge-tree)। একটা write একটা row জায়গায় আপডেট করতে ফাইলের ভেতরে seek করে না। বরং:

```text
1. Append the write to a commit log (durability).
2. Apply it to an in-memory table (the memtable).
3. Return success to the client.   ← write is done, very fast

Later, asynchronously:
4. Flush the memtable to an immutable on-disk file (SSTable).
5. Periodically merge/compact SSTables, dropping superseded values.
```

কারণ প্রতিটা write একটা append (sequential disk I/O, কোনো random seek নেই, কোনো read-before-write নেই), wide-column স্টোর বিশাল হারে write গ্রহণ করে। update আর delete-ও শুধু append — একটা delete একটা **tombstone** marker লেখে যা পুরনো value লুকিয়ে রাখে যতক্ষণ না compaction সেগুলোকে শারীরিকভাবে সরিয়ে দেয়। এই কারণেই এই স্টোরগুলো time-series ডেটা, event log, IoT telemetry, আর যেকোনো append-ভারী firehose-এ পারদর্শী।

খরচটা read-এ পড়ে: একটা single row-এর বর্তমান value memtable আর কয়েকটা SSTable জুড়ে ছড়ানো থাকতে পারে, তাই একটা read-কে সেগুলো merge করতে হয়। ভালো partition/clustering ডিজাইন আর compaction এটা দ্রুত রাখে; এলোমেলো ডিজাইন (বা অনেক বেশি tombstone) read-কে হামাগুড়ি দেওয়ায়।

## Tunable Consistency (পরিচিতি)

Wide-column স্টোর প্রতিটা partition কয়েকটা node-এ replicate করে (**replication factor**, ধরুন `RF=3`)। প্রতিটা request-এ আপনি একটা **consistency level** বেছে নেন যা বলে অপারেশনটা সফল বলে গণ্য হওয়ার আগে কতগুলো replica-কে সাড়া দিতে হবে।

```text
RF = 3   (three copies of every row)

Write at ONE     → 1 replica must ack   (fast, weak durability)
Write at QUORUM  → 2 of 3 must ack      (balanced)
Read  at QUORUM  → 2 of 3 must respond  (balanced)
Read/Write at ALL→ all 3                (strong, low availability)
```

বিখ্যাত গ্যারান্টি: যদি **R + W &gt; RF** (read replica যোগ write replica replication factor ছাড়িয়ে যায়), একটা read সর্বশেষ write দেখার গ্যারান্টিযুক্ত, কারণ read আর write quorum-কে অন্তত একটা replica-তে overlap করতেই হবে। `RF=3`-এ, `QUORUM`-এ (2) write আর `QUORUM`-এ (2) read করলে `2 + 2 &gt; 3` হয় — strong consistency, যখন একটা মৃত node-ও সহ্য করে।

<Callout type="warning">

**সতর্কতা:** read আর write দুইয়ের জন্যই কম consistency level (`ONE`) বেছে নিলে availability আর গতি সর্বোচ্চ হয় কিন্তু মানে একটা read সহজেই একটা সাম্প্রতিক write মিস করতে পারে — `1 + 1` `3`-এর চেয়ে বড় নয়। সেই নির্দিষ্ট read বা write কতটা staleness সহ্য করতে পারে তার ভিত্তিতে _প্রতি অপারেশন-এ_ consistency ঠিক করুন। আমরা quorum, conflict resolution, আর read repair নিয়ে chapter 7-এ গভীরে যাই।

</Callout>

Wide-column স্টোর সঠিক টুল যখন আপনার বিশাল write volume, অনুমানযোগ্য access pattern, আর single point of failure ছাড়া linear horizontal scaling-এর দরকার। এগুলো ভুল টুল যখন আপনার query ad hoc, আপনার relationship জটিল, বা আপনার স্কেল একটা রিলেশনাল ডেটাবেসের জন্য যথেষ্ট মাঝারি।
