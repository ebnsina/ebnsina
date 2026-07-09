---
title: 'Distributed Systems — রোডম্যাপ'
subtitle: 'একটি মেশিন থেকে অনেকগুলোতে: failure, time, replication, consensus, এবং যে trade-off গুলো প্রতিটি distributed system-কে সংজ্ঞায়িত করে।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'distributed systems']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জগতের উপমা**

একটা রান্নাঘরে একজন রাঁধুনিকে সমন্বয় করা সহজ: পুরো কাউন্টারটা এক নজরে দেখা যায়। কিন্তু বিভিন্ন শহরের একশোটা রান্নাঘরে ছড়িয়ে থাকা একশো রাঁধুনিকে সমন্বয় করা — যারা শুধু চিঠি পাঠিয়ে কথা বলতে পারে, আর সেই চিঠি মাঝেমধ্যে হারিয়ে যায় — সম্পূর্ণ ভিন্ন এক সমস্যা। Distributed systems হলো সেই দ্বিতীয় রান্নাঘরের চর্চা।

</Callout>

## যা তুমি করতে পারবে

এই ট্র্যাক শেষে তুমি একাধিক মেশিন জুড়ে বিস্তৃত সিস্টেম নিয়ে সূক্ষ্মভাবে যুক্তি সাজাতে পারবে: কীভাবে সেগুলো fail করে তার পূর্বাভাস দেওয়া, কেন তারা তাৎক্ষণিকভাবে একমত হতে পারে না তা ব্যাখ্যা করা, এবং একটি নির্দিষ্ট workload-এর জন্য সঠিক trade-off বেছে নেওয়া। সুনির্দিষ্টভাবে, তুমি পারবে:

- কেন কম্পিউটারের একটি network একটা বড় কম্পিউটারের মতো মোটেও আচরণ করে না তা ব্যাখ্যা করতে।
- Failure (crash, omission, Byzantine) শ্রেণিবদ্ধ করতে এবং partial failure-কে ঘিরে ডিজাইন করতে।
- একটি replication strategy বেছে নিতে এবং quorum ও read-your-writes গ্যারান্টি নিয়ে যুক্তি সাজাতে।
- Linearizable থেকে eventual পর্যন্ত consistency spectrum-এ একটি সিস্টেমকে জায়গা দিতে।
- CAP ও PACELC theorem সূক্ষ্মভাবে বর্ণনা করতে এবং বাস্তব database-এ প্রয়োগ করতে।
- Raft কীভাবে consensus অর্জন করে তা ধাপে ধাপে বুঝতে, এবং Paxos-এর সাথে তুলনা করতে।
- Lamport ও vector clock ব্যবহার করে shared clock ছাড়াই event order করতে।
- Saga, outbox pattern, এবং idempotency দিয়ে service জুড়ে পরিবর্তন সমন্বয় করতে।

## পূর্বশর্ত ও সম্পর্কিত ট্র্যাক

এই ট্র্যাক ধরে নেয় যে তুমি pseudocode পড়তে পারো এবং অন্তত একটি networked application বানিয়েছ। এটি আরও তিনটি ট্র্যাকের সাথে স্বাভাবিকভাবে মেলে:

- **Networking** — packet, latency, TCP, এবং কেন network বেশিরভাগ distributed-systems যন্ত্রণার উৎস।
- **Replication & Sharding** — এখানকার replication theory-এর হাতে-কলমে, database-নির্দিষ্ট প্রতিরূপ।
- **Event-Driven Architecture** — pub/sub, change data capture, এবং event sourcing, যেগুলো এই ট্র্যাকের ordering ও delivery ধারণার উপর অনেকখানি নির্ভর করে।

তোমার কোনো নির্দিষ্ট language লাগবে না। Code sample গুলো `text`, `go`, বা `python`-এ pseudocode হিসেবে দেওয়া, mechanics বোঝানোর জন্য, copy-paste করার জন্য নয়।

## এই ট্র্যাকের অধ্যায়সমূহ

1. **What Makes a System Distributed** — কেন distribute করব, independent failure, আটটি fallacy, এবং একটি মেশিনের তুলনায় কী বদলায়।
2. **Failure Models &amp; Time** — crash বনাম omission বনাম Byzantine, partial failure, partition, এবং কেন clock ও timeout মিথ্যা বলে।
3. **Replication** — single-leader, multi-leader, এবং leaderless ডিজাইন; sync বনাম async; quorum ও read-your-writes।
4. **Consistency Models** — linearizable, sequential, causal, এবং eventual consistency, আর spectrum জুড়ে trade-off গুলো।
5. **CAP &amp; PACELC** — CAP theorem সূক্ষ্মভাবে বর্ণিত, partition-এর সময় CP বনাম AP, এবং PACELC যে latency মাত্রা যোগ করে।
6. **Consensus: Raft &amp; Paxos** — consensus সমস্যা, leader election, log replication, এবং সম্পূর্ণ Raft walkthrough।
7. **Ordering &amp; Logical Clocks** — happens-before, Lamport timestamp, vector clock, এবং hybrid logical clock।
8. **Distributed Transactions** — two-phase commit, saga, outbox pattern, idempotency key, এবং exactly-once নিয়ে ভুল ধারণা।
9. **Building Reliable Distributed Systems** — retry, backoff, jitter, deduplication, এবং durable execution।

## এই ট্র্যাক কীভাবে পড়বে

ক্রম অনুযায়ী পড়ো। প্রতিটি অধ্যায় এমন শব্দভাণ্ডার গড়ে তোলে যা পরেরটি ধরে নেয়। অধ্যায় ১–৩ ভিত্তিমূলক; ৪–৭ তাত্ত্বিক মূল অংশ; ৮–৯ হলো এই সবকিছু প্রয়োগ করে বাস্তব জগতে টিকে থাকা সিস্টেম বানানো নিয়ে। failure অধ্যায়টা গুরুত্বের সাথে নাও — প্রায় প্রতিটি distributed bug-ই এমন একটা ধারণায় ফিরে যায় যে network বা কোনো clock ঠিকঠাক আচরণ করবে।
