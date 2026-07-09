---
title: 'What Makes a System Distributed'
subtitle: 'কেন আমরা আদৌ distribute করি, কেন independent failure সবকিছু বদলে দেয়, এবং আটটি fallacy যা প্রতিটি নতুন মানুষকে হোঁচট খাওয়ায়।'
chapter: 1
level: 'beginner'
readingTime: '9 মিনিট'
topics: ['distributed', 'fallacies']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটি distributed system হলো স্বাধীন কম্পিউটারের একটি সংগ্রহ যারা সহযোগিতা করে তাদের ব্যবহারকারীদের কাছে একটি একক সুসংগত সিস্টেম হিসেবে দেখা দেয়। মূল শব্দটি হলো **independent**: প্রতিটি মেশিনের নিজস্ব memory, নিজস্ব clock, এবং অন্যদের সাথে না টেনে নিজে fail হওয়ার নিজস্ব ক্ষমতা আছে। সেই স্বাধীনতাই একইসাথে পুরো উদ্দেশ্য এবং পুরো সমস্যা।

## কেন আদৌ distribute করব

সবকিছু একটা মেশিনে চালানো সব দিক থেকেই সহজ, তাই তোমার শুধু তখনই distribute করা উচিত যখন করতেই হবে। তিনটি শক্তি তোমাকে সেই সীমা পার করায়।

**Scale.** একটি একক server-এর একটি সীমা আছে: সীমিত CPU, memory, disk, এবং network। Vertical scaling (একটি বড় বক্স) দ্রুত ব্যয়বহুল হয়ে ওঠে আর তারপরও একটা ছাদ থাকে। Horizontal scaling — আরও মেশিন যোগ করা — কার্যত কোনো ছাদ নেই, কিন্তু তা তখনই কাজ করে যখন কাজটা সেগুলোর মধ্যে ভাগ করা যায়।

**Fault tolerance.** একটি মেশিন মানে একটি single point of failure। এটি মরে গেলে তোমার service মরে যায়। অনেক মেশিন জুড়ে কাজ ও data ছড়িয়ে দিলে সিস্টেম তাদের যেকোনো একটির ক্ষতি সহ্য করে টিকে থাকতে পারে — কিন্তু শুধু তখনই যদি তুমি সেভাবে ডিজাইন করো।

**Latency.** আলোর গতি একটি কঠিন সীমা। Virginia-র একটি server-এ query করা Tokyo-র একজন ব্যবহারকারী প্রায় 150ms round-trip গোনে, server যত দ্রুতই হোক না কেন। ব্যবহারকারীদের কাছাকাছি মেশিন রাখলে সেই দূরত্ব দূর হয়।

## Independent failure: সংজ্ঞায়ক বৈশিষ্ট্য

একটি একক মেশিনে component গুলো একসাথে fail করে। process crash করলে তার ভেতরের সবকিছু একসাথে থেমে যায় — এমন কোনো অস্বস্তিকর মধ্যবর্তী অবস্থা নেই যেখানে অর্ধেক প্রোগ্রাম জীবিত আর অর্ধেক মৃত।

একটি distributed system-এ **অংশগুলো স্বাধীনভাবে fail করে**। মেশিন A crash করতে পারে যখন মেশিন B চলতেই থাকে। তাদের মধ্যকার network link drop করতে পারে যখন দুটো মেশিনই একদম সুস্থ। এটি এমন এক শ্রেণির সমস্যা তৈরি করে যা একটা মেশিনে একেবারেই থাকে না: **partial failure**।

আরও খারাপ, যখন মেশিন A মেশিন B-কে একটা request পাঠায় এবং কোনো উত্তর পায় না, A বলতে পারে না এর মধ্যে কোনটা ঘটেছে:

- B কখনো request-টাই পায়নি।
- B এটি পেয়েছে, কাজ করেছে, এবং উত্তরটা ফেরার পথে হারিয়ে গেছে।
- B শুধু ধীর আর উত্তর এখনো আসছে।

A-এর দিক থেকে তিনটাই একরকম দেখায়। distributed systems-এর বেশিরভাগ কাঠিন্য এই একটি অস্পষ্টতা থেকেই প্রবাহিত হয়।

<Callout type="warning">

**কেন্দ্রীয় কঠিন সত্য:** একটি distributed system-এ তুমি কখনোই নিশ্চিত হতে পারো না যে একটি remote operation সফল হয়েছে, fail করেছে, নাকি এখনো চলছে। এর পরের প্রতিটি ডিজাইন সিদ্ধান্ত সেই অনিশ্চয়তার সাথে বাঁচার দ্বারা গঠিত।

</Callout>

## distributed computing-এর আটটি fallacy

১৯৯০-এর দশকে Sun Microsystems-এর engineer-রা নতুনদের বারবার করা মিথ্যা ধারণাগুলো তালিকাভুক্ত করেছিলেন। এগুলো মুখস্থ করার মতো, কারণ এদের প্রত্যেকটিই একসময় তোমাকে কামড় দেবে।

1. **Network নির্ভরযোগ্য।** Packet হারায়, link down হয়, আর message ভুল ক্রমে পৌঁছায়। এর জন্য পরিকল্পনা করো।
2. **Latency শূন্য।** একটি remote call একটি local call-এর চেয়ে হাজার থেকে লক্ষগুণ ধীর। যেসব chatty ডিজাইন অনেক ছোট ছোট call করে, সেগুলো `localhost`-এ ঠিকঠাক লাগে আর production-এ ভেঙে পড়ে।
3. **Bandwidth অসীম।** বড় payload আর উচ্চ request rate link গুলোকে saturate করে। Data-র একটা আকার আছে আর সরানোর খরচ আছে।
4. **Network নিরাপদ।** তুমি encrypt ও authenticate না করলে wire-এর উপরের যেকোনো কিছু পড়া বা বিকৃত করা যায়।
5. **Topology বদলায় না।** মেশিন ক্রমাগত যোগ, বাদ, ও স্থানান্তরিত হয়। address আর route hard-code করা মানে ভবিষ্যতের যন্ত্রণা নিশ্চিত করা।
6. **একজন administrator আছে।** বাস্তব সিস্টেম দল, vendor, ও cloud জুড়ে বিস্তৃত, প্রত্যেকের ভিন্ন policy আর change window।
7. **Transport cost শূন্য।** Data serialize, send, ও deserialize করতে CPU ও টাকা খরচ হয়, শুধু সময় নয়।
8. **Network সমসত্ত্ব।** ভিন্ন মেশিন ভিন্ন hardware, operating system, ও protocol version চালায়। বৈচিত্র্য ধরে নাও।

প্রতিটি fallacy হলো single-machine প্রোগ্রামিং থেকে আসা একটি আরামদায়ক ধারণা যা network জড়িত হওয়া মাত্রই নীরবে মিথ্যা হয়ে যায়।

## একটি একক মেশিনের তুলনায় কী বদলায়

শিফটটা সুনির্দিষ্টভাবে দেখা সাহায্য করে। একই ধারণা network পার করার পর খুব ভিন্ন আচরণ করে।

| ধারণা         | একক মেশিন                    | Distributed system                                   |
| ------------- | ---------------------------- | ---------------------------------------------------- |
| Function call | সবসময় return বা throw করে   | অজানা ফলাফল নিয়ে time out করতে পারে                 |
| Clock         | একটি clock, monotonic        | অনেক clock, সবই drift করছে                           |
| Failure       | সব-বা-কিছুই-না               | Partial; কিছু node up, কিছু down                     |
| Memory        | Shared, তাৎক্ষণিক consistent | কোনো shared memory নেই; state কপি হয় ও পিছিয়ে থাকে |
| Ordering      | Program order স্পষ্ট         | অতিরিক্ত যন্ত্রপাতি ছাড়া কোনো global order নেই      |

একটি সরল উদাহরণ ভাবো। একটি মেশিনে একটি counter বাড়ানো একটি একক instruction এবং স্বয়ংক্রিয়ভাবে consistent। দুটি মেশিন জুড়ে "counter বাড়াও" হয়ে যায়: network-এর উপর দিয়ে বর্তমান মান পড়ো, local-এ এক যোগ করো, এবং তা আবার লিখে দাও। দুটি মেশিন যদি একসাথে এটা করে, তারা দুজনেই 5 পড়তে পারে, দুজনেই 6 লিখতে পারে, আর তুমি একটি update হারালে — একটি bug যা single-machine version অসম্ভব করে রেখেছিল।

```text
Machine A: read counter -> 5
Machine B: read counter -> 5
Machine A: write 6
Machine B: write 6        # the increment from A is gone
```

<Callout type="tip">

**ডিজাইন heuristic:** একটি network hop যোগ করার আগে জিজ্ঞেস করো কাজটা সত্যিই অন্য মেশিনে থাকার দরকার আছে কিনা। সবচেয়ে সরল distributed system হলো সেটা যেটা তুমি বানাওনি। একটি সুনির্দিষ্ট কারণে distribute করো — scale, fault tolerance, বা latency — default হিসেবে নয়।

</Callout>

## এখান থেকে আমরা কোথায়

Distribution scale, resilience, ও locality কিনে দেয়, কিন্তু এর মূল্য নেয় অনিশ্চয়তার মুদ্রায়: partial failure, অবিশ্বাস্য clock, এবং বিনামূল্যে কোনো global ordering নেই। এই ট্র্যাকের বাকিটা হলো সেই বিলটা ইচ্ছাকৃতভাবে পরিশোধ করা নিয়ে। পরের অধ্যায়ে সবচেয়ে কম বিশ্বাসযোগ্য দুটো জিনিসের দিকে কঠোরভাবে তাকানো হবে — failure ও time।
