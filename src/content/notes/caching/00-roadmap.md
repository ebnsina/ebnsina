---
title: 'Caching — রোডম্যাপ'
subtitle: 'প্রথমে in-process LRU। নিজে Redis সেল্ফ-হোস্ট করুন। Eviction পলিসি, invalidation, stampede।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['রোডম্যাপ']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একজন শেফের mise en place: রান্না শুরুর আগেই সবকিছু প্রস্তুত করে হাতের নাগালে রাখা। শেফ রান্নার মাঝখানে প্রতিটি উপকরণের জন্য স্টোররুমে হেঁটে যান না — যেসব জিনিস ঘন ঘন দরকার হয়, সেগুলো আগে থেকেই কাউন্টারে রাখা থাকে। Caching হলো সফটওয়্যারের জন্য mise en place: আপনার অ্যাপ্লিকেশন যে ডেটা সবচেয়ে বেশি ব্যবহার করে, সেটা এমন কোনো দ্রুত ও কাছাকাছি জায়গায় থাকে, যাতে প্রতিটি রিকোয়েস্টে ডেটাবেস থেকে সেটা আনতে না হয়।

</Callout>

## যা যা শিখবেন

বেশিরভাগ সিস্টেমে caching হলো সবচেয়ে কার্যকর একটিমাত্র পারফরম্যান্স অপটিমাইজেশন — এবং এটাই সবচেয়ে সহজে ভুল করে ফেলার মতো একটি জিনিস। এই ট্র্যাকটি শুরু হয় কেন cache-এর প্রয়োজন হয় তা দিয়ে (মেমরি, ডিস্ক ও নেটওয়ার্কের মধ্যকার latency-এর ফারাক), তারপর প্রতিটি স্তর কভার করে: in-process LRU, Redis-এর মূল বিষয়, eviction পলিসি, cache invalidation কৌশল, stampede প্রতিরোধ, Redis Cluster দিয়ে distributed caching, HTTP caching ও CDN edge caching, এবং প্রোডাকশনে cache-কে নির্ভরযোগ্য রাখার অপারেশনাল প্যাটার্ন।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **কেন Caching-এর অস্তিত্ব আছে** — latency-এর ফারাক, মেমরি হায়ারার্কি, কখন caching সমাধান আর কখন নয়
2. **Cache Strategies** — cache-aside, read-through, write-through, write-behind — ট্রেড-অফ ও ফেইলিওর মোড
3. **Eviction Policies** — LRU, LFU, TTL, random — cache কীভাবে ঠিক করে কোনটা বাদ দেবে
4. **Redis-এর মূল বিষয়** — ডেটা স্ট্রাকচার, কোর কমান্ড, persistence (RDB/AOF), সেল্ফ-হোস্টিং
5. **Cache Invalidation** — TTL, event-driven purging, versioned key, write-through প্যাটার্ন
6. **Cache Stampede ও Thundering Herd** — এর কারণ কী, mutex lock, probabilistic early expiration, request coalescing
7. **Distributed Caching** — consistent hashing, Redis Cluster, replication, ফেইলিওর মোড
8. **HTTP Caching ও CDN** — Cache-Control, ETag, Vary, CDN edge caching, purging
9. **Application Caching প্যাটার্ন** — fragment caching, query result caching, session store, memoization
10. **Production Caching** — hit ratio মনিটরিং, hot key, Redis-এর graceful ফেইলিওর, কখন flush করতে হবে
