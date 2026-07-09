---
title: 'Replication & Sharding — রোডম্যাপ'
subtitle: 'Postgres streaming replica নিজ হাতে। Vitess ছাড়াই manual shard routing।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটি বেড়ে ওঠা লাইব্রেরি সিস্টেম: একটি শাখা (primary) মূল, নির্ভরযোগ্য সংগ্রহটি ধরে রাখে। কপি (replica) থাকায় একসাথে আরও বেশি মানুষ পড়তে পারে এবং কোনো শাখায় আগুন লাগলেও সংগ্রহ টিকে থাকে। যখন সংগ্রহ সব শাখা ছাড়িয়ে যায়, তখন আপনি এটিকে বিষয় অনুযায়ী আলাদা বিল্ডিংয়ে ভাগ করেন (sharding)। বেশিরভাগ লাইব্রেরিরই কখনও shard করার দরকার হয় না — কিন্তু প্রতিটি লাইব্রেরির একটি backup কপি থাকা উচিত।

</Callout>

## যা যা শিখবেন

Replication সমাধান করে availability এবং read scale। Sharding সমাধান করে write scale। এই track দুটোকেই প্রথম নীতি থেকে কভার করে: Postgres WAL streaming কীভাবে কাজ করে, `pg_basebackup` দিয়ে নিজ হাতে একটি standby কীভাবে সেটআপ করবেন, shard key নির্বাচন ও routing strategy-র পেছনের theory, এবং কীভাবে proxy layer ছাড়াই application code-এ একটি shard router বানাবেন। শেষ chapter-এ থাকছে Postgres table partitioning — single-server বিকল্প যা sharding-এর operational জটিলতা ছাড়াই বেশিরভাগ use case সামলে নেয়।

## এই track-এর chapter-গুলো

1. **Replication Fundamentals** — WAL, synchronous vs async, replication lag, code-এ read replica
2. **Postgres Streaming Replication** — pg_basebackup, standby setup, manual failover, WAL archiving
3. **Sharding Concepts** — কখন shard করবেন, shard key নির্বাচন, range vs hash vs consistent hashing
4. **Manual Shard Routing** — shard manager, repository pattern, cross-shard operation, migration
5. **Postgres Partitioning** — range, list, hash partitioning, pg_partman, partition pruning
