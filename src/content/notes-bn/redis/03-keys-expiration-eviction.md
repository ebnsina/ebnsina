---
title: 'Keys, Expiration & Eviction'
subtitle: 'Naming, TTLs, Redis কীভাবে expired key ফিরিয়ে নেয়, এবং memory ভরে গেলে কী ঘটে।'
chapter: 3
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['ttl', 'expiration', 'eviction']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

রেলস্টেশনের পাশে ফাতেমার একটা লাগেজ-লকার রুম। যাত্রীরা এসে একটা লকার ভাড়া নেয় নির্দিষ্ট সময়ের জন্য — করিম ব্যাগ রেখে বলে "তিন ঘণ্টার জন্য", রহিম বলে "এক দিনের জন্য"। ফাতেমা প্রতিটা লকারের গায়ে ভাড়ার মেয়াদ লিখে রাখে। মেয়াদ ফুরিয়ে গেলে ওই লকার আপনা-আপনিই খালি বলে গণ্য হয় — ভেতরের জিনিস সরিয়ে লকারটা আবার নতুন যাত্রীর জন্য ছেড়ে দেওয়া হয়, মালিক ফিরে না এলেও।

সমস্যা হলো লকারের সংখ্যা সীমিত। একদিন সব লকার ভর্তি, এমন সময় নতুন এক যাত্রী এসে হাজির — তারও একটা লকার দরকার, কিন্তু একটাও খালি নেই। ফাতেমা তখন বুদ্ধি খাটায়: যে লকারটা সবচেয়ে বেশি সময় ধরে কেউ ছুঁয়ে দেখেনি — কেউ খোলেনি, জিনিস রাখেনি বা বের করেনি — সেটাই সে খালি করে নতুন যাত্রীকে দিয়ে দেয়। যেটা সবচেয়ে "ঠান্ডা", সেটাই আগে যায়।

গল্পটাই আসলে Redis-এর key lifecycle। প্রতিটা লকার হলো একটা **key**, ভাড়ার মেয়াদ হলো **TTL**, আর মেয়াদ ফুরোলে আপনা-আপনি খালি হওয়া হলো **expiration**। আর সব লকার ভর্তি থাকা অবস্থায় সবচেয়ে-বেশিক্ষণ-না-ছোঁয়া লকার খালি করা হলো **eviction policy** — এই ক্ষেত্রে **LRU** (least recently used); ফাতেমা যদি "সবচেয়ে কম বার ব্যবহার হওয়া" লকার বাছত, সেটা হতো **LFU** (least frequently used)। বাস্তবে ঠিক এভাবেই session TTL দিয়ে অটো-লগআউট হয়, আর memory ভরে গেলে cache-এর সবচেয়ে cold key evict করে নতুন ডেটার জায়গা করা হয়।

Memory সীমিত, তাই একটা দীর্ঘ-চলা Redis instance আসলে key নিয়ে একটা গল্প: তুমি কীভাবে এগুলোর নাম দাও, এগুলো কতক্ষণ বাঁচে, এবং RAM শেষ হলে কী ফেলে দেওয়া হয়। এটা ভুল করলে রহস্যময় memory বৃদ্ধি, বাসি ডেটা, বা — সবচেয়ে খারাপ — server-এর write প্রত্যাখ্যান করা হয়। এই অধ্যায় একটা key-এর পূর্ণ lifecycle কভার করে।

## Key naming convention

Redis-এ কোনো table বা namespace নেই, শুধু একটা flat keyspace। যে convention শৃঙ্খলা আনে তা হলো একটা colon-দিয়ে-বিভক্ত hierarchy:

```text
user:1042                 a hash for user 1042
user:1042:sessions        a set of that user's session ids
session:abc123            a session blob
cache:product:99          a cached product
leaderboard:weekly        a sorted set
rate:ip:203.0.113.5       a rate-limit counter
```

ভালো key predictable এবং self-documenting। কয়েকটা নিয়ম কাজে লাগে:

- **একটা consistent separator ব্যবহার করো** (convention অনুযায়ী `:`) এবং একটা stable `object:id:attribute` আকৃতি।
- **key যুক্তিসঙ্গতভাবে ছোট রাখো** — প্রতিটা key RAM-এ থাকে, এবং এক মিলিয়ন লম্বা key জমা হয়ে যায়। কিন্তু কয়েক byte-এর জন্য স্পষ্টতা বিসর্জন দিও না।
- **key খুঁজতে বা expire করতে যা যা লাগে সব এর ভেতরে embed করো।** তোমার কাছে ইতিমধ্যে থাকা ডেটা থেকে যদি একটা key তৈরি করতে না পারো, তাহলে তোমাকে সেটার জন্য scan করতে হবে।
- **প্রতিটা concern-এর জন্য একটা prefix সংরক্ষিত রাখো** (`cache:`, `session:`, `lock:`) যাতে তুমি সম্পর্কিত key নিয়ে যুক্তি করতে এবং দরকার হলে খুঁজে পেতে পারো।

## Expiration সেট করা

একটা cache-এর সংজ্ঞায়ক ফিচার হলো entry চিরকাল বাঁচে না। Redis যেকোনো key-এ একটা TTL (time to live) সংযুক্ত করে।

```text
127.0.0.1:6379> SET session:abc123 "user=1042" EX 3600
OK
127.0.0.1:6379> TTL session:abc123
(integer) 3600
127.0.0.1:6379> EXPIRE session:abc123 60
(integer) 1
127.0.0.1:6379> TTL session:abc123
(integer) 58
127.0.0.1:6379> PERSIST session:abc123
(integer) 1
127.0.0.1:6379> TTL session:abc123
(integer) -1
```

- `EX seconds` / `PX milliseconds` write-এর সময় একটা TTL সেট করে (`SET` দিয়ে)।
- `EXPIRE key seconds` এবং `PEXPIRE` একটা বিদ্যমান key-এ একটা TTL যোগ করে বা বদলায়। `EXPIREAT` একটা absolute Unix timestamp নেয়।
- `TTL` অবশিষ্ট সেকেন্ড ফেরত দেয়, key থাকলে কিন্তু expiry না থাকলে `-1`, এবং key না থাকলে `-2`।
- `PERSIST` TTL সরিয়ে দেয়, key-কে আবার permanent বানায়।

<Callout type="warning">

**নোট:** যেসব write command একটা key-এর value _প্রতিস্থাপন_ করে, তার বেশিরভাগ এর TTL-ও মুছে ফেলে। যদি তুমি এমন একটা key `SET` করো যার expiry ছিল, `EX` আবার নির্দিষ্ট না করে, তাহলে key permanent হয়ে যায়। যেসব command জায়গায় বসে modify করে (`HSET`, `APPEND`, `INCR`) সেগুলো বিদ্যমান TTL রাখে। সন্দেহ হলে, একটা write-এর পর `TTL` চেক করো।

</Callout>

## Expiration আসলে কীভাবে কাজ করে

একটা TTL সহ key exactly সেই মুহূর্তে delete হয় না যখন এটা expire হয়। Redis দুটো mechanism একসাথে ব্যবহার করে।

- **Lazy (passive) expiration।** যখন একটা client একটা key ছোঁয়, Redis প্রথমে এর TTL চেক করে। যদি এটা expire হয়ে থাকে, key তখনই delete হয় এবং command এমন আচরণ করে যেন key নেই। যে key-এর জন্য কেউ চায় না, তার জন্য এটা বিনামূল্যে — কিন্তু যে key আর কখনো access করা হয় না তা নিজে থেকে চিরকাল পড়ে থাকতো।
- **Active expiration।** সেই না-ছোঁয়া key ফিরিয়ে নিতে, একটা background cycle সেকেন্ডে প্রায় দশবার চলে, যাদের TTL আছে এমন key-এর একটা batch sample করে, expired-গুলো delete করে, এবং — যদি sample-এ খুব বেশি expired থাকে — সাথে সাথে আবার করে। এটা probabilistic, তাই একটা key কিছুক্ষণ expired-কিন্তু-উপস্থিত থাকতে পারে, কিন্তু memory-কে অসীমভাবে বাড়তে দেওয়া হয় না।

ব্যবহারিক পরিণতি: memory-হিসাবের উদ্দেশ্যে কখনো ধরে নিও না যে একটা key তার exact expiry সেকেন্ডে অদৃশ্য হয়ে যায়। correctness-এর জন্য এটা হয় — expiry-র পর একটা read কিছুই ফেরত দেয় না — কিন্তু memory কিছুটা পরে মুক্ত হয়।

## Eviction: যখন memory শেষ হয়ে যায়

Expiration সেসব key সামলায় যাদের তুমি expire করতে _বলেছো_। Eviction সামলায় কঠিন কেসটা: memory ভর্তি এবং একটা নতুন write আসে। তুমি `maxmemory` দিয়ে memory সীমাবদ্ধ করো, তারপর কী ফেলে দেবে তার জন্য একটা policy বেছে নাও।

```text
127.0.0.1:6379> CONFIG SET maxmemory 512mb
OK
127.0.0.1:6379> CONFIG SET maxmemory-policy allkeys-lru
OK
127.0.0.1:6379> CONFIG GET maxmemory-policy
1) "maxmemory-policy"
2) "allkeys-lru"
```

policy দুটো axis বরাবর ভাগ হয়: _কোন_ key candidate (সব key, নাকি শুধু যাদের TTL আছে — `volatile-` পরিবার), এবং _কীভাবে_ একটা victim বেছে নেওয়া হয়।

| Policy            | Candidates | Victim যেভাবে বেছে নেওয়া হয় |
| ----------------- | ---------- | ----------------------------- |
| `noeviction`      | none       | write একটা error সহ fail করে  |
| `allkeys-lru`     | সব key     | least recently used           |
| `allkeys-lfu`     | সব key     | least frequently used         |
| `allkeys-random`  | সব key     | random                        |
| `volatile-lru`    | TTL সহ key | least recently used           |
| `volatile-lfu`    | TTL সহ key | least frequently used         |
| `volatile-ttl`    | TTL সহ key | নিকটতম expiry প্রথমে          |
| `volatile-random` | TTL সহ key | random                        |

- একটা primary store-এর জন্য **`noeviction`** হলো safe default: ভরে গেলে, নীরবে ডেটা হারানোর বদলে write প্রত্যাখ্যাত হয়। read তখনও কাজ করে।
- **LRU বনাম LFU।** LRU (least _recently_ used) সম্প্রতি যা ছোঁয়া হয়নি তা evict করে। LFU (least _frequently_ used) একটা access counter track করে এবং যা কদাচিৎ ব্যবহৃত হয় তা evict করে — এটা ভালো যখন কিছু key burst-এ access হয়ে তারপর ভুলে যাওয়া হয় যখন অন্যগুলো ধীরে ধীরে জনপ্রিয় থাকে। Redis-এর LRU আর LFU _আনুমানিক_: এরা একটা perfect global order বজায় রাখার বদলে গুটিকয়েক key sample করে, একটু accuracy অনেক গতির জন্য বিনিময় করে।
- **`volatile-` পরিবার** শুধু সেসব key evict করে যাদের একটা TTL আছে। এটা কাজে লাগে যখন তুমি এক instance-এ permanent ডেটা আর disposable cache মেশাও — কিন্তু যদি কোনো expirable key না থাকে এবং memory ভর্তি হয়, এই policy-গুলো `noeviction`-এর মতো আচরণ করে এবং write fail করে।

<Callout type="tip">

**নোট:** একটা pure cache-এর জন্য, `allkeys-lru` বা `allkeys-lfu` সাধারণত সঠিক — প্রতিটা key disposable, তাই যা সবচেয়ে cold তা-ই evict করো। যদি একই instance এমন ডেটাও ধরে যা তুমি হারাতে পারবে না, দুটোকে আলাদা করো: একটা আলাদা instance, বা `volatile-*` প্লাস শুধু cache key-গুলোতে TTL। `allkeys-*`-এর অধীনে মূল্যবান আর disposable ডেটা মেশানো তোমার প্রয়োজনীয় ডেটা evict করার ঝুঁকি রাখে।

</Callout>

## SCAN বনাম KEYS

তোমাকে শেষমেশ একটা pattern মেলানো key খুঁজতে হবে। দুটো উপায় আছে, এবং production-এ শুধু একটাই safe।

```text
127.0.0.1:6379> KEYS user:*
1) "user:1042"
2) "user:55"
... (blocks the whole server until done)

127.0.0.1:6379> SCAN 0 MATCH user:* COUNT 100
1) "176"
2) 1) "user:1042"
   2) "user:55"
127.0.0.1:6379> SCAN 176 MATCH user:* COUNT 100
1) "0"
2) 1) "user:99"
```

`KEYS` এক ধাক্কায় **পুরো** keyspace হাঁটে। যেহেতু Redis single-threaded, সেটা পুরো scan-এর জন্য প্রতিটা অন্য client-কে ব্লক করে — একটা বড় instance-এ, client time out করা এবং failover trigger করার মতো যথেষ্ট দীর্ঘ। `KEYS`-কে শুধু একটা ফেলে-দেওয়া dataset-এ একটা debugging tool হিসেবে ট্রিট করো।

`SCAN` হলো production-এর উত্তর। এটা একটা cursor-based iterator: প্রতিটা call একটা ছোট batch এবং পরের call-এ pass করার জন্য একটা cursor ফেরত দেয়। তুমি cursor `0`-তে শুরু করো এবং ফেরত পাওয়া cursor আবার `0` হলে থামো। এটা কখনো server-কে বেশিক্ষণ ব্লক করে না, এবং `MATCH` pattern দিয়ে filter করে যখন `COUNT` batch আকারের ইঙ্গিত দেয়। trade-off হলো দুর্বল guarantee — scan-এর মাঝখানে যোগ বা সরানো key দেখা যেতেও পারে, নাও পারে, যদিও পুরো scan জুড়ে উপস্থিত key ফেরত পাওয়ার guarantee আছে। বড় hash, set, আর sorted set একইভাবে iterate করার জন্য typed variant `HSCAN`, `SSCAN`, আর `ZSCAN` আছে।

নিয়মটা সরল: **কখনো production-এর বিরুদ্ধে `KEYS` চালিও না।** `SCAN`-এর দিকে যাও।
