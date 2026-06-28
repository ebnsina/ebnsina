---
title: 'Core Data Structures'
subtitle: 'Strings, hashes, lists, sets, sorted sets — and the specialized types that ride on top of them.'
chapter: 2
level: 'beginner'
readingTime: '14 min'
topics: ['strings', 'hashes', 'lists', 'sets', 'sorted sets']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

The reason to choose Redis over a plain memory cache is that its values are not opaque blobs — they are data structures the server understands. Picking the right one turns a multi-step application loop into a single atomic command. This chapter walks the five core types and the three specialized ones, with commands, a real use, and the time complexity that matters when collections grow.

## Strings

The simplest type: a key mapped to a value up to 512 MB. Despite the name, a string can hold text, a serialized JSON document, a number, or raw bytes. Numeric strings get atomic increment and decrement.

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

**Real-world use:** caching a rendered page or a serialized object, and atomic counters for page views, API rate limits, or unique ID generation. `SET key value EX 30 NX` sets a value only if absent with a 30-second expiry — the foundation of a lock (chapter 6).

**Complexity:** `GET`/`SET`/`INCR` are O(1).

## Hashes

A hash is a map of field-value pairs stored under one key — like a small object. Instead of serializing a whole user into one string, store fields individually so you can read or update one without touching the rest.

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

**Real-world use:** representing objects (a user profile, a product, a session) where you update single fields. Small hashes are memory-efficient because Redis packs them into a compact encoding.

**Complexity:** `HGET`/`HSET`/`HINCRBY` are O(1); `HGETALL` is O(N) in the number of fields.

## Lists

A list is an ordered sequence of strings, implemented as a linked list, so pushing and popping at either end is cheap. This makes it a natural queue or stack.

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

**Real-world use:** simple job queues (`LPUSH` to enqueue, `BRPOP` to block-and-wait for work), recent-activity feeds, and capped logs trimmed with `LTRIM`.

**Complexity:** push/pop at the ends are O(1). `LINDEX` and `LRANGE` are O(N) toward the middle, so do not treat a list like a random-access array.

## Sets

An unordered collection of unique strings. Adding a duplicate is a no-op, and membership tests are constant time. The standout feature is server-side set algebra.

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

**Real-world use:** tags, unique visitor tracking, "users who did X," and relationships. `SINTER`, `SUNION`, and `SDIFF` compute intersections, unions, and differences in the server — for example, mutual friends or common tags.

**Complexity:** `SADD`/`SISMEMBER` are O(1); `SINTER` is roughly O(N\*M) across set sizes, so be careful intersecting very large sets.

## Sorted sets (ZSET)

The most powerful core type: a set where every member carries a floating-point **score**, and members are kept ordered by that score. You get uniqueness, ordering, and range queries at once.

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

**Real-world use:** leaderboards and rankings, priority queues (score = priority), rate limiters and time-series windows (score = timestamp, then `ZRANGEBYSCORE` or `ZREMRANGEBYSCORE` to expire old entries).

**Complexity:** `ZADD` and rank/range lookups are O(log N) plus the size of the result — the backing skip list is why this type can do ordered queries that lists and sets cannot.

<Callout type="tip">

**Note:** When a task feels like "keep the top N" or "give me everything between two values," reach for a sorted set first. The score is whatever you want to order by — points, timestamps, priority — and Redis keeps it sorted for free on every write.

</Callout>

## Specialized structures

Three more types build on strings and sets to solve specific problems with very little memory.

### Bitmaps

Not a separate type but bit-level operations on a string. Each bit is addressed by offset, so a million users fit in 125 KB.

```text
127.0.0.1:6379> SETBIT active:2026-06-16 1042 1
(integer) 0
127.0.0.1:6379> GETBIT active:2026-06-16 1042
(integer) 1
127.0.0.1:6379> BITCOUNT active:2026-06-16
(integer) 1
```

**Use:** daily active users, feature flags per user ID, and any large boolean array. `BITOP` combines days with AND/OR to answer "active on both days."

### HyperLogLog

A probabilistic structure that counts **unique** items using a fixed ~12 KB regardless of cardinality, with about 0.81% error. It trades exactness for tiny, constant memory.

```text
127.0.0.1:6379> PFADD visitors:home user1 user2 user3 user1
(integer) 1
127.0.0.1:6379> PFCOUNT visitors:home
(integer) 3
```

**Use:** counting unique visitors, search terms, or events at scale where storing every distinct value would cost gigabytes and you can tolerate a small error.

### Geospatial

Built on sorted sets, geo commands store longitude/latitude and answer radius queries.

```text
127.0.0.1:6379> GEOADD cities -0.1278 51.5074 london 2.3522 48.8566 paris
(integer) 2
127.0.0.1:6379> GEODIST cities london paris km
"343.5562"
127.0.0.1:6379> GEOSEARCH cities FROMMEMBER london BYRADIUS 400 km ASC
1) "london"
2) "paris"
```

**Use:** "find drivers near me," store locators, and proximity search.

<Callout type="info">

**Note:** There are more types still — Streams (chapter 5) for append-only logs, and modules like RedisJSON and RediSearch that add document and full-text capabilities. But the five core structures plus these three cover the overwhelming majority of real designs. Master them and most "how do I model this in Redis" questions answer themselves.

</Callout>

## Choosing quickly

| You need                     | Structure   | Key command             |
| ---------------------------- | ----------- | ----------------------- |
| A single value or counter    | String      | `SET`, `INCR`           |
| An object with fields        | Hash        | `HSET`, `HGET`          |
| A queue or stack             | List        | `LPUSH`, `BRPOP`        |
| Unique items / set math      | Set         | `SADD`, `SINTER`        |
| Ranked / range-queried items | Sorted set  | `ZADD`, `ZRANGEBYSCORE` |
| Large boolean array          | Bitmap      | `SETBIT`, `BITCOUNT`    |
| Approximate unique count     | HyperLogLog | `PFADD`, `PFCOUNT`      |
| Location proximity           | Geo         | `GEOADD`, `GEOSEARCH`   |

The discipline that makes Redis effective is matching the access pattern to the structure before you write a line of code.
