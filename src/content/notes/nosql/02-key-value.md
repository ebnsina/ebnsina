---
title: 'Key-Value Stores'
subtitle: 'সবচেয়ে সহজ NoSQL model: একটা বিশাল distributed hash map। Redis, DynamoDB, TTL, আর যেসব workload-এ একটা O(1) lookup-কে কেউ হারাতে পারে না।'
chapter: 2
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['key-value', 'redis', 'dynamodb']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা থিয়েটারের coat check। তুমি তোমার coat জমা দাও আর একটা নম্বর দেওয়া ticket পাও। কর্মচারী তোয়াক্কা করে না তোমার coat-এ কী আছে, রং বা size দিয়ে খোঁজে না, আর "সব wool coat" খুঁজে বের করতে পারে না। কিন্তু ticket নম্বর 47 জমা দাও আর তোমার coat সাথে সাথে হাজির। একটা key-value store হলো গ্রহ-স্কেলে একটা coat check: এটাকে key দাও, value নাও, এক ধাপে — আর এর কাছে আর কিছু চেয়ো না।

</Callout>

## গল্পে বুঝি

বাস স্ট্যান্ডের কোণায় একটা মালপত্র জমা রাখার কাউন্টার — লেফট-লাগেজ কাউন্টার। খোয়ারিজমি দূরের বাসে ওঠার আগে তার ভারী ব্যাগটা কাউন্টারে জমা দিল। কর্মচারী ব্যাগটা তাকের নির্দিষ্ট একটা খোপে রেখে খোয়ারিজমির হাতে একটা নম্বর লেখা টোকেন ধরিয়ে দিল — ৪৭। ব্যাগে কী আছে, কী রং, কতটা ভারী — কিছুই কাউন্টারের খাতায় ওঠে না। শুধু টোকেন নম্বর আর খোপ, ব্যস।

ঘণ্টা তিনেক পর খোয়ারিজমি ফিরে এসে টোকেন ৪৭ কাউন্টারে দিল, আর কর্মচারী এক সেকেন্ডেই ৪৭ নম্বর খোপ থেকে ব্যাগটা বের করে দিল — পুরো তাক হাতড়াতে হলো না। কিন্তু ধরো ফাতিমা এসে বলল "আমার কালো ব্যাগটা খুঁজে দিন তো", টোকেন হারিয়ে ফেলেছে — কর্মচারী অসহায়। কালো ব্যাগ, বড় ব্যাগ, চেন লাগানো ব্যাগ — এভাবে খোঁজার কোনো ব্যবস্থাই নেই। টোকেন থাকলে সব, টোকেন নেই তো কিছুই না।

এই কাউন্টারটাই আসলে একটা **key-value store**। টোকেন নম্বর হলো **key**, খোপে রাখা ব্যাগটা হলো **value**। সঠিক key দিলে এক ধাপেই — O(1) lookup — value পাওয়া যায়, তাক ঘেঁটে নয়। আর value-র ভেতরের content দিয়ে (রং, আকার) কখনো খোঁজা যায় না — no query by value, শুধু exact key দিয়ে fetch। বাস্তবে Redis-এ ঠিক এভাবেই user session রাখা হয়: session ID হলো টোকেন (key), session-এর তথ্য হলো ব্যাগ (value), আর ওই ID দিয়ে সাথে সাথে user-কে চিনে নেওয়া যায় — একই ভাবে cache-এও ব্যয়বহুল query-র ফলাফল এক key-র নিচে রেখে পরের বার সরাসরি তুলে আনা হয়।

## Model

একটা key-value store ধারণাগতভাবে একটা hash map। প্রতিটা entry হলো একটা unique **key**, যেটা একটা **value**-এর সাথে map করা। store value-কে opaque হিসেবে ধরে — এটা এর ভেতরে তাকায় না, index করে না, বা তোমাকে এর content দিয়ে query করতে দেয় না।

```text
"user:1042"           → {"name": "Zubaida", "tier": "gold"}
"session:abc123"      → {"userId": 1042, "expires": 1718500000}
"ratelimit:ip:1.2.3.4"→ 47
```

এই চরম সরলতাই পুরো ব্যাপারটা। কোনো query planner, কোনো join, আর কোনো schema না থাকায়, store নির্মমভাবে দ্রুত আর অনায়াসে partition করা যায়: key-কে hash করো, আর সেটাই ঠিক করে দেয় কোন node এটার মালিক। node যোগ করো, hash range rebalance করো, আর তুমি পেয়ে গেলে linear horizontal scaling।

## Access Pattern

একটা key-value store মূলত তিনটা operation সমর্থন করে:

- `GET key` — একটা key-এর value fetch করা।
- `PUT key value` (বা `SET`) — একটা value store বা overwrite করা।
- `DELETE key` — একটা key মুছে ফেলা।

এটাই contract। "tier = gold যেসব value সব খুঁজে বের করো" বলে কিছু নেই — একটা query সমর্থন করতে হলে, তোমাকে নিজেই index বানাতে হবে একটা বাড়তি key লিখে (উদাহরণস্বরূপ `tier:gold` নামের একটা set যেটা member key-গুলোর তালিকা রাখে)। এটাই NoSQL data modeling-এর তোমার প্রথম স্বাদ: **যদি তোমার কিছু খুঁজে বের করতে হয়, তাহলে তুমি যে প্রশ্ন করবে সেই আকারের একটা key-এর নিচে সেটা store করতে হবে।**

## Redis

Redis একটা in-memory key-value store, sub-millisecond latency-র জন্য খুব সমাদৃত। এর মোচড় হলো value শুধু opaque blob নয় — এগুলো হলো **typed data structure**: string, hash, list, set, sorted set, আর আরও অনেক। এটা একে একটা cache-এর চেয়ে অনেক বেশি করে তোলে।

```text
# String — a counter
INCR page:views:home          → 1, 2, 3 ...

# Hash — fields within one key
HSET user:1042 name "Zubaida" tier "gold"
HGET user:1042 tier           → "gold"

# Sorted set — a leaderboard, scored and ordered
ZADD leaderboard 4820 "zubaida"
ZADD leaderboard 5100 "alex"
ZREVRANGE leaderboard 0 9     → top 10 players by score

# List — a simple queue
LPUSH jobs "send-email:42"
RPOP jobs                     → "send-email:42"
```

যেহেতু Redis data RAM-এ ধরে রাখে, এটা দ্রুত কিন্তু memory-র আকার দিয়ে সীমাবদ্ধ, আর durability-র জন্য যত্ন লাগে (এটা snapshot আর append-only-log persistence দেয়)। এটাকে একটা high-speed working set হিসেবে ধরো, তোমার system of record নয়, যদি না তুমি ইচ্ছাকৃতভাবে durability configure করে থাকো।

## DynamoDB

DynamoDB হলো AWS-এর managed key-value (আর document) store। Redis-এর মতো নয়, এটা disk-backed, durable, আর predictable single-digit-millisecond latency-সহ বিশাল আকারে scale করে। এর data অনেক partition জুড়ে SSD-তে থাকে, আর AWS তোমার হয়ে replication আর partitioning সামলায়।

DynamoDB-র key একটা single string-এর চেয়ে সমৃদ্ধ। প্রতিটা item-এর একটা **partition key** (কোন node/partition এটা ধরে রাখে) আর একটা optional **sort key** (একটা partition-এর ভেতরে ordering) থাকে। এটা একটা "key"-কে সম্পর্কিত item-এর একটা _range_ address করতে দেয় — single-table design-এর ভিত্তি, chapter 6-এ আলোচিত।

```json
{
	"PK": "USER#1042",
	"SK": "PROFILE",
	"name": "Zubaida",
	"tier": "gold"
}
```

<Callout type="tip">

**নোট:** Redis আর DynamoDB আলাদা জায়গা দখল করে। Redis একটা in-memory accelerator — ভয়ানক দ্রুত, memory-bound, প্রায়ই আরেকটা database-এর সাথে জোড়া লাগানো। DynamoDB একটা durable primary store যা managed operations story-সহ terabyte পর্যন্ত scale করে। "Key-value store" দুটোকেই বর্ণনা করে, কিন্তু তুমি খুব ভিন্ন কারণে এদের মধ্যে বেছে নাও।

</Callout>

## TTL — Time To Live

বেশিরভাগ key-value store তোমাকে একটা key-এর সাথে একটা expiry জুড়তে দেয়। TTL পার হয়ে গেলে, store নিজে থেকেই key মুছে ফেলে। ক্ষণস্থায়ী data-র জন্য এটাই killer feature — তোমাকে কখনো একটা cleanup job লিখতে হয় না।

```text
# Redis: set a key that self-destructs in 1 hour
SET session:abc123 "{...}" EX 3600

# Check remaining life
TTL session:abc123            → 3599
```

DynamoDB-তে একই ধারণা আছে একটা নির্দিষ্ট TTL attribute-এর মাধ্যমে যেটা একটা Unix timestamp ধরে রাখে; AWS মেয়াদোত্তীর্ণ item-গুলো background-এ মুছে ফেলে। TTL session, cache, one-time token, আর rate-limit window-কে self-maintaining data-তে পরিণত করে।

## সাধারণ ব্যবহার

**Caching।** মূল use case: একটা ব্যয়বহুল query বা computation-এর ফলাফল একটা key-এর নিচে store করা, একটা TTL-সহ। পরবর্তী request database-এর বদলে cache-এ গিয়ে লাগে। (Caching track strategy আর pitfall-গুলো গভীরভাবে দেখায়।)

**Sessions।** Web session বিশুদ্ধ key-value: session ID হলো key, session blob হলো value, আর একটা TTL expiry সামলায়। session application memory-র বদলে Redis-এ রাখলে তুমি sticky session ছাড়াই তোমার web server-গুলোকে horizontally scale করতে পারো।

**Rate limiting।** প্রতি client প্রতি time window-এ একটা counter, window-এর দৈর্ঘ্যকে TTL হিসেবে দিয়ে।

```text
# Increment, and on first hit set a 60s window
INCR ratelimit:user:1042
EXPIRE ratelimit:user:1042 60
# If the value exceeds your limit, reject the request
```

**Feature flag, leaderboard, distributed lock, pub/sub।** Redis-এর data structure এগুলো সবকটাকে কয়েকটা command-এর ব্যাপার বানিয়ে দেয়।

## সীমাবদ্ধতা

শক্তিগুলোই দুর্বলতা। একটা key-value store তোমাকে value দিয়ে query করার, join করার, aggregation করার, বা schema enforcement-এর কোনো উপায় দেয় না। যদি তুমি নিজেকে "gold tier-এর user-দের সব session" চাইতে দেখো, তাহলে তুমি model-এর সীমা ছাড়িয়ে গেছ — নয়তো তোমাকে সেই query-টাকে তার নিজের একটা key-তে denormalize করতে হবে।

এটা দুর্বল built-in relationship-ও দেয়। একটা one-to-many relationship model করা মানে একটা key বজায় রাখা যার value হলো অন্য key-গুলোর একটা list, আর সেই list হাতে হাতে sync রাখা। যখন relationship আর সমৃদ্ধতর query-ই প্রাধান্য পায়, তখন একটা document বা graph store বেশি মানানসই। key-value store যা সবচেয়ে ভালো করে তার জন্যই ব্যবহার করো: একটা জানা key দিয়ে দ্রুত, সহজ lookup।
