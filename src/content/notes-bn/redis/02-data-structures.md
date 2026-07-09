---
title: 'Core Data Structures'
subtitle: 'Strings, hashes, lists, sets, sorted sets — এবং যেসব বিশেষায়িত type এগুলোর উপর ভর করে চলে।'
chapter: 2
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['strings', 'hashes', 'lists', 'sets', 'sorted sets']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা সাধারণ memory cache-এর বদলে Redis বেছে নেওয়ার কারণ হলো এর values অস্বচ্ছ blob নয় — এগুলো data structure যা server বোঝে। সঠিকটা বেছে নেওয়া একটা multi-step application loop-কে একটা single atomic command-এ পরিণত করে। এই অধ্যায় পাঁচটা core type আর তিনটা বিশেষায়িত type ঘুরে দেখে, command, একটা বাস্তব ব্যবহার, এবং collection বড় হলে যে time complexity গুরুত্বপূর্ণ হয়ে ওঠে তা সহ।

## Strings

সবচেয়ে সরল type: একটা key যা 512 MB পর্যন্ত একটা value-তে map করা। নাম যা-ই হোক, একটা string text, একটা serialized JSON document, একটা number, বা raw bytes ধরে রাখতে পারে। numeric string atomic increment আর decrement পায়।

```text
127.0.0.1:6379> SET user:1042:name "Lubna of Cordoba"
OK
127.0.0.1:6379> GET user:1042:name
"Lubna of Cordoba"
127.0.0.1:6379> SET page:home:views 0
OK
127.0.0.1:6379> INCR page:home:views
(integer) 1
127.0.0.1:6379> INCRBY page:home:views 9
(integer) 10
127.0.0.1:6379> SET lock:job mine EX 30 NX
OK
```

**বাস্তব ব্যবহার:** একটা rendered page বা একটা serialized object cache করা, এবং page view, API rate limit, বা unique ID generation-এর জন্য atomic counter। `SET key value EX 30 NX` একটা value শুধু তখনই সেট করে যদি সেটা অনুপস্থিত থাকে, একটা 30-সেকেন্ড expiry সহ — একটা lock-এর ভিত্তি (অধ্যায় 6)।

**Complexity:** `GET`/`SET`/`INCR` হলো O(1)।

## Hashes

একটা hash হলো একটা key-এর অধীনে সংরক্ষিত field-value জোড়ার একটা map — একটা ছোট object-এর মতো। একটা পুরো user-কে একটা string-এ serialize করার বদলে, field-গুলো আলাদা করে রাখো যাতে বাকিটা না ছুঁয়ে তুমি একটা পড়তে বা update করতে পারো।

```text
127.0.0.1:6379> HSET user:1042 name "Lubna of Cordoba" age 36 city "Baghdad"
(integer) 3
127.0.0.1:6379> HGET user:1042 city
"Baghdad"
127.0.0.1:6379> HINCRBY user:1042 age 1
(integer) 37
127.0.0.1:6379> HGETALL user:1042
1) "name"
2) "Lubna of Cordoba"
3) "age"
4) "37"
5) "city"
6) "Baghdad"
```

**বাস্তব ব্যবহার:** object (একটা user profile, একটা product, একটা session) উপস্থাপন করা যেখানে তুমি single field update করো। ছোট hash memory-efficient কারণ Redis এগুলোকে একটা compact encoding-এ প্যাক করে।

**Complexity:** `HGET`/`HSET`/`HINCRBY` হলো O(1); `HGETALL` হলো field-সংখ্যায় O(N)।

## Lists

একটা list হলো string-এর একটা ordered sequence, একটা linked list হিসেবে বাস্তবায়িত, তাই যেকোনো প্রান্তে push আর pop করা সস্তা। এটা একে একটা স্বাভাবিক queue বা stack বানায়।

```text
127.0.0.1:6379> LPUSH tasks "send-email" "resize-image"
(integer) 2
127.0.0.1:6379> RPUSH tasks "generate-report"
(integer) 3
127.0.0.1:6379> LRANGE tasks 0 -1
1) "resize-image"
2) "send-email"
3) "generate-report"
127.0.0.1:6379> RPOP tasks
"generate-report"
127.0.0.1:6379> LLEN tasks
(integer) 2
```

**বাস্তব ব্যবহার:** সরল job queue (enqueue করতে `LPUSH`, কাজের জন্য block-and-wait করতে `BRPOP`), recent-activity feed, এবং `LTRIM` দিয়ে ছেঁটে রাখা capped log।

**Complexity:** প্রান্তে push/pop হলো O(1)। `LINDEX` আর `LRANGE` মাঝের দিকে O(N), তাই একটা list-কে random-access array-এর মতো ট্রিট করো না।

## Sets

unique string-এর একটা unordered collection। একটা duplicate যোগ করা একটা no-op, এবং membership test constant time। বিশেষ ফিচারটা হলো server-side set algebra।

```text
127.0.0.1:6379> SADD article:99:tags redis cache database
(integer) 3
127.0.0.1:6379> SADD article:99:tags redis
(integer) 0
127.0.0.1:6379> SISMEMBER article:99:tags cache
(integer) 1
127.0.0.1:6379> SADD user:7:liked redis golang
(integer) 2
127.0.0.1:6379> SINTER article:99:tags user:7:liked
1) "redis"
```

**বাস্তব ব্যবহার:** tags, unique visitor tracking, "যেসব user X করেছে," এবং সম্পর্ক। `SINTER`, `SUNION`, আর `SDIFF` server-এ intersection, union, আর difference হিসাব করে — যেমন, mutual friends বা common tags।

**Complexity:** `SADD`/`SISMEMBER` হলো O(1); `SINTER` set আকার জুড়ে মোটামুটি O(N\*M), তাই খুব বড় set intersect করার সময় সতর্ক থাকো।

## Sorted sets (ZSET)

সবচেয়ে শক্তিশালী core type: একটা set যেখানে প্রতিটা member একটা floating-point **score** বহন করে, এবং member-গুলো সেই score অনুযায়ী ordered থাকে। তুমি একসাথে uniqueness, ordering, আর range query পাও।

```text
127.0.0.1:6379> ZADD leaderboard 100 fatima 250 omar 175 maryam
(integer) 3
127.0.0.1:6379> ZINCRBY leaderboard 50 fatima
"150"
127.0.0.1:6379> ZREVRANGE leaderboard 0 2 WITHSCORES
1) "omar"
2) "250"
3) "maryam"
4) "175"
5) "fatima"
6) "150"
127.0.0.1:6379> ZRANK leaderboard omar
(integer) 2
127.0.0.1:6379> ZRANGEBYSCORE leaderboard 150 250
1) "fatima"
2) "maryam"
3) "omar"
```

**বাস্তব ব্যবহার:** leaderboard আর ranking, priority queue (score = priority), rate limiter আর time-series window (score = timestamp, তারপর পুরনো entry expire করতে `ZRANGEBYSCORE` বা `ZREMRANGEBYSCORE`)।

**Complexity:** `ZADD` এবং rank/range lookup হলো O(log N) প্লাস ফলাফলের আকার — পেছনের skip list-এর কারণেই এই type এমন ordered query করতে পারে যা list আর set পারে না।

<Callout type="tip">

**নোট:** যখন একটা কাজ "top N রাখো" বা "দুটো value-এর মধ্যে সবকিছু দাও"-এর মতো মনে হয়, প্রথমেই একটা sorted set-এর দিকে যাও। score হলো যা দিয়ে তুমি order করতে চাও — point, timestamp, priority — এবং Redis প্রতিটা write-এ বিনামূল্যে এটা sorted রাখে।

</Callout>

## বিশেষায়িত structure

আরও তিনটা type string আর set-এর উপর ভর করে খুব সামান্য memory দিয়ে নির্দিষ্ট সমস্যা সমাধান করে।

### Bitmaps

আলাদা কোনো type নয় বরং একটা string-এর উপর bit-level অপারেশন। প্রতিটা bit offset দিয়ে address করা, তাই এক মিলিয়ন user 125 KB-তে ধরে।

```text
127.0.0.1:6379> SETBIT active:2026-06-16 1042 1
(integer) 0
127.0.0.1:6379> GETBIT active:2026-06-16 1042
(integer) 1
127.0.0.1:6379> BITCOUNT active:2026-06-16
(integer) 1
```

**ব্যবহার:** daily active user, user ID অনুযায়ী feature flag, এবং যেকোনো বড় boolean array। `BITOP` দিনগুলোকে AND/OR দিয়ে মিলিয়ে "দুই দিনেই active" এর উত্তর দেয়।

### HyperLogLog

একটা probabilistic structure যা **unique** item গণনা করে, cardinality নির্বিশেষে একটা fixed ~12 KB ব্যবহার করে, প্রায় 0.81% error সহ। এটা exactness-কে ক্ষুদ্র, constant memory-র জন্য বিনিময় করে।

```text
127.0.0.1:6379> PFADD visitors:home user1 user2 user3 user1
(integer) 1
127.0.0.1:6379> PFCOUNT visitors:home
(integer) 3
```

**ব্যবহার:** বড় স্কেলে unique visitor, search term, বা event গণনা করা যেখানে প্রতিটা distinct value সংরক্ষণে gigabyte খরচ হতো এবং তুমি একটা ছোট error সহ্য করতে পারো।

### Geospatial

sorted set-এর উপর নির্মিত, geo command longitude/latitude সংরক্ষণ করে এবং radius query-র উত্তর দেয়।

```text
127.0.0.1:6379> GEOADD cities -0.1278 51.5074 london 2.3522 48.8566 paris
(integer) 2
127.0.0.1:6379> GEODIST cities london paris km
"343.5562"
127.0.0.1:6379> GEOSEARCH cities FROMMEMBER london BYRADIUS 400 km ASC
1) "london"
2) "paris"
```

**ব্যবহার:** "আমার কাছাকাছি driver খুঁজে দাও," store locator, এবং proximity search।

<Callout type="info">

**নোট:** আরও type আছে — append-only log-এর জন্য Streams (অধ্যায় 5), এবং RedisJSON আর RediSearch-এর মতো module যা document আর full-text ক্ষমতা যোগ করে। কিন্তু পাঁচটা core structure প্লাস এই তিনটা বাস্তব design-এর অপ্রতিরোধ্য সংখ্যাগরিষ্ঠতা কভার করে। এগুলো আয়ত্ত করো আর "Redis-এ এটা কীভাবে model করবো"-র বেশিরভাগ প্রশ্ন নিজে থেকেই উত্তর পেয়ে যাবে।

</Callout>

## দ্রুত বেছে নেওয়া

| তোমার যা দরকার                | Structure   | মূল command             |
| ----------------------------- | ----------- | ----------------------- |
| একটা single value বা counter  | String      | `SET`, `INCR`           |
| field সহ একটা object          | Hash        | `HSET`, `HGET`          |
| একটা queue বা stack           | List        | `LPUSH`, `BRPOP`        |
| unique item / set math        | Set         | `SADD`, `SINTER`        |
| ranked / range-query করা item | Sorted set  | `ZADD`, `ZRANGEBYSCORE` |
| বড় boolean array             | Bitmap      | `SETBIT`, `BITCOUNT`    |
| আনুমানিক unique count         | HyperLogLog | `PFADD`, `PFCOUNT`      |
| Location proximity            | Geo         | `GEOADD`, `GEOSEARCH`   |

যে শৃঙ্খলা Redis-কে কার্যকর করে তা হলো এক লাইন code লেখার আগে access pattern-কে structure-এর সাথে মেলানো।
