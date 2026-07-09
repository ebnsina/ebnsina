---
title: 'NoSQL — রোডম্যাপ'
subtitle: 'চারটি পরিবার, একটাই প্রশ্ন: তোমার access pattern কী? Key-value, document, wide-column আর graph store-এর ব্যাখ্যা।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'nosql']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা relational database হলো একটা একক, নিখুঁতভাবে সাজানো ফাইলিং ক্যাবিনেট, যার কড়া নিয়ম আছে: প্রতিটা ফর্মকে একটা টেমপ্লেটের সাথে মিলতে হবে, আর ফর্মগুলোর মধ্যে cross-reference করতে গেলে ড্রয়ার থেকে ড্রয়ারে হাঁটাহাঁটি করতে হয়। NoSQL হলো একটা ওয়ার্কশপ, যেখানে প্রতিটা কাজের জন্য সঠিক টুল আছে: যেসব জিনিস তুমি বারবার নাও তার জন্য একটা দ্রুত pegboard (key-value), লেবেল করা bin যেখানে প্রতিটা slot-এ একটা গোটা kit থাকে (document), row append করার জন্য optimized একটা বিশাল ledger (wide-column), আর সুতো দিয়ে জোড়া লাগানো pin করা ছবির একটা corkboard (graph)। দক্ষতাটা হলো সামনের কাজটার জন্য কোন টুলটা মানানসই তা জানা।

</Callout>

## তুমি যা শিখবে

NoSQL কোনো একক প্রযুক্তি নয় — এটা চারটি আলাদা পরিবারের database, প্রতিটাই একটা ভিন্ন আকারের data আর একটা ভিন্ন access pattern-কে ঘিরে তৈরি। এই track তোমাকে সেই আকারগুলো চিনতে শেখাবে। তুমি শিখবে কেন relational database scale-এর সময় দেয়ালে ধাক্কা খায়, প্রতিটা NoSQL পরিবার কী কী trade-off করে (আর কী ছেড়ে দেয়), আর — সবচেয়ে গুরুত্বপূর্ণ — join আর একটা flexible query planner-এর ওপর যখন আর ভরসা করতে পারবে না, তখন কীভাবে data model করবে।

বারবার ফিরে আসা theme হলো **access-pattern-first design**। SQL-এর জগতে তুমি প্রথমে data model করো আর query পরে ভাবো। বেশিরভাগ NoSQL সিস্টেমে তুমি উল্টোটা করো: তুমি তোমার application-কে যেসব প্রশ্নের উত্তর দিতে হবে তার তালিকা করো, তারপর storage এমনভাবে design করো যাতে প্রতিটা প্রশ্ন একটা দ্রুত lookup হয়। এই mindset-টা ঠিকমতো ধরতে পারলে NoSQL একটা superpower। ভুল করলে তুমি একটা store-এর ওপর একটা ধীর, ভাঙা relational database আবার নতুন করে বানাবে — যে store এর জন্য কখনো তৈরিই হয়নি।

## পূর্বশর্ত

এই track স্বাভাবিকভাবেই আরও দুটোর সাথে জোড়া লাগে:

- **Data Modeling** — entity, relationship, normalization। foreign key আর join কী তা তোমাকে বুঝতে হবে, তারপরই এগুলো ছাড়া বাঁচতে শিখবে।
- **Database Internals** — page, index, write path, আর durability কীভাবে কাজ করে। একটা B-tree কীভাবে একটা LSM-tree থেকে আলাদা তা জানলে wide-column আর key-value chapter-গুলো মাথায় ঢুকে যায়।

তুমি যদি SQL লিখতে স্বচ্ছন্দ হও আর `1NF` থেকে `3NF` normalization বোঝো, তাহলে তুমি তৈরি।

## এই track-এর chapter-গুলো

1. **Why NoSQL** — relational database কোথায় scale-এ চাপে পড়ে, চারটি NoSQL পরিবার, ACID বনাম BASE, আর কখন NoSQL-এর দিকে হাত বাড়ানো উচিত নয়।
2. **Key-Value Stores** — সবচেয়ে সহজ model, Redis আর DynamoDB, TTL, আর ক্লাসিক ব্যবহারগুলো: cache, session, rate limiting।
3. **Document Databases** — JSON document, MongoDB, embedding বনাম referencing-এর সিদ্ধান্ত, indexing, আর access pattern অনুযায়ী schema design।
4. **Wide-Column Stores** — Cassandra আর Bigtable, partition key বনাম clustering key, query-first modeling, আর write path।
5. **Graph Databases** — node, edge, property, Neo4j আর Cypher, traversal, আর কখন একটা graph একগাদা join-কে গুঁড়িয়ে দেয়।
6. **Data Modeling for NoSQL** — access-pattern-first design, denormalization, single-table design, আর join ছাড়া relationship।
7. **Consistency & Replication in NoSQL** — tunable আর eventual consistency, quorum, conflict resolution, আর read repair।
8. **Choosing the Right Database** — একটা decision framework, polyglot persistence, সাধারণ ভুল, আর workload-এর সাথে store মেলানো।

শেষে গিয়ে তুমি আর জিজ্ঞেস করবে না "NoSQL কি SQL-এর চেয়ে ভালো?" তুমি জিজ্ঞেস করবে "এই workload-এর কী দরকার, আর কোন store সবচেয়ে কম trade-off-এ সেটা আমাকে দেয়?"
