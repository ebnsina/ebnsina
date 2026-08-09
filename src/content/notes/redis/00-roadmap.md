---
title: 'Redis — রোডম্যাপ'
subtitle: 'একটি in-memory data structure store: cache, queue, lock, আর primary store — সবই একসাথে।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'redis']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা সুসংগঠিত রান্নাঘরের pass: line cook প্রতিটা অর্ডারের জন্য walk-in ফ্রিজ পর্যন্ত ছুটে যায় না। সবচেয়ে বেশি ব্যবহৃত উপকরণগুলো হাতের নাগালেই লেবেল করা কন্টেইনারে থাকে, প্রতিটাই তার কাজের জন্য আকৃতি পাওয়া — stock-এর জন্য গভীর বিন, garnish-এর জন্য চ্যাপ্টা ট্রে, plating-এর জন্য সাজানো র‍্যাক। তোমার ডেটার জন্য Redis হলো সেই pass: অনেকগুলো বিশেষায়িত in-memory structure, প্রতিটা আলাদা access pattern-এর জন্য টিউন করা, সবই এক microsecond দূরত্বে।

</Callout>

## তুমি যা করতে পারবে

এই ট্র্যাক শেষ করার পর তুমি Redis-কে যথেষ্ট ভালোভাবে বুঝবে যাতে একে একটা magic black box হিসেবে না, বরং ইচ্ছাকৃতভাবে ব্যবহার করতে পারো। তুমি জানবে কোন data structure কোন সমস্যায় ফিট করে, কীভাবে memory আর expiration নিয়ন্ত্রণ করতে হয়, restart-এর পরও এটা কীভাবে টিকে থাকে, এবং replication ও failure-এর অধীনে এটা কেমন আচরণ করে। তুমি একটা cache, একটা work queue, আর একটা distributed lock বানাতে পারবে, Lua দিয়ে atomic multi-step অপারেশন লিখতে পারবে, এবং production-এ কী কী ভুল হতে পারে তা নিয়ে যুক্তি করতে পারবে।

## পূর্বশর্ত

তোমার command line-এ স্বাচ্ছন্দ্য থাকা উচিত এবং বেসিক client-server networking বোঝা উচিত। databases কীভাবে ডেটা রাখে সে সম্পর্কে সামান্য জ্ঞান সাহায্য করে, তবে বাধ্যতামূলক নয়।

এই ট্র্যাক এই সাইটের আরও তিনটি ট্র্যাকের সাথে স্বাভাবিকভাবে জোড়া মেলে:

- **Caching** — Redis হলো সবচেয়ে সাধারণ shared cache; ওই ট্র্যাক strategies আর invalidation গভীরভাবে কভার করে।
- **NoSQL** — Redis একটা key-value store; NoSQL ট্র্যাক দেখায় এটা অন্যান্য non-relational মডেলগুলোর মধ্যে কোথায় বসে।
- **Background Jobs** — Redis অনেক job queue-এর পেছনে থাকে; ওই ট্র্যাক এখানে পরিচয় করানো প্যাটার্নগুলোর worker দিকটা কভার করে।

## এই ট্র্যাকের অধ্যায়গুলো

1. **Redis কী & Core Model** — in-memory key-value store, single-threaded event loop, কেন এটা দ্রুত, RESP protocol, এবং redis-cli দিয়ে connect করা।
2. **Core Data Structures** — strings, hashes, lists, sets, sorted sets, সাথে bitmaps, HyperLogLog, আর geo — প্রতিটার command আর বাস্তব ব্যবহার সহ।
3. **Keys, Expiration & Eviction** — key naming, TTLs, lazy বনাম active expiration, maxmemory policies, এবং কেন SCAN, KEYS-এর চেয়ে ভালো।
4. **Persistence: RDB & AOF** — snapshots, append-only log, fsync policies, এবং একটা in-memory store-এর জন্য durability আসলে কী মানে।
5. **Pub/Sub & Streams** — fire-and-forget messaging, durable Streams, consumer groups, এবং কখন তোমার আসল broker দরকার।
6. **Redis as Cache, Queue & Distributed Lock** — cache-aside, list-based queues, reliable queues, এবং distributed-lock বিতর্ক।
7. **Transactions & Lua Scripting** — MULTI/EXEC/WATCH, কেন এগুলো rollback transaction নয়, এবং EVAL দিয়ে atomic scripting।
8. **Replication, Sentinel & Cluster** — primary/replica replication, failover-এর জন্য Sentinel, hash-slot sharding, এবং consistency trade-off।
9. **Production-এ Redis চালানো** — memory ও fragmentation, slow log, key metrics, big-key এড়ানো, security, এবং সাধারণ ফাঁদ।

প্রথমবার এগুলো ক্রম অনুযায়ী পড়ো। এরপর প্রতিটা অধ্যায় নিজেই একটা reference হিসেবে দাঁড়াতে পারে।
