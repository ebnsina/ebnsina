---
title: 'Ordering & Logical Clocks'
subtitle: 'একটি shared clock ছাড়াই event order করা: happens-before, Lamport timestamp, vector clock, এবং hybrid logical clock।'
chapter: 7
level: 'advanced'
readingTime: '11 মিনিট'
topics: ['lamport', 'vector clocks', 'ordering']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বিরুনি থাকেন বুখারায়, আর তাঁর বন্ধু সিনা থাকেন সমরকন্দে। দুই শহরের মাঝে চিঠির আদান-প্রদান চলে, কিন্তু ঝামেলা একটাই — দুই বাড়ির দেয়াল-ঘড়ি কখনোই এক সময় দেখায় না। বিরুনির ঘড়িতে সকাল আটটা হলে সিনার ঘড়িতে হয়তো সোয়া আটটা, কখনো আবার পিছিয়ে সাতটা পঞ্চাশ। তাই কোন চিঠি আসলে আগে লেখা হয়েছিল, তা ঘড়ির সময় দেখে বোঝার আর কোনো উপায় নেই — দুজনের সময়ই মিথ্যা বলে।

বুদ্ধি করে দুজন তখন সময় লেখা বাদ দিয়ে চিঠিতে একটা করে ক্রমিক নম্বর বসাতে শুরু করলেন। বিরুনি প্রথম চিঠিতে লিখলেন "চিঠি নং ১"। সিনা সেটা পড়ে যখন জবাব লেখেন, তিনি নিজের নম্বর তো বসানই, সাথে লিখে দেন "তোমার নং ১ পেয়ে এই জবাব লিখছি"। এখন কেউ যদি পুরো চিঠির স্তূপটা সামনে নিয়ে বসে, প্রতিটা জবাবে "কোন চিঠির উত্তরে লেখা" সেই উল্লেখ দেখে দিব্যি সাজিয়ে ফেলতে পারবে কোনটা কার কারণে লেখা — কোন ঘটনা কার পরে ঘটেছে। ঘড়ির সময় ছাড়াই কার্যকারণের ক্রম পুরোপুরি পুনর্গঠন করা যায়।

এই গল্পটাই আসলে **logical clock**। প্রতিটা বাড়ি হলো একটা node, আর দুই ঘড়ির অমিল হলো global time-এর অভাব — এজন্যই wall clock দিয়ে event order করা যায় না। চিঠিতে নম্বর বসানো আর জবাবে শেষ পাওয়া চিঠির নম্বর quote করা — এটাই **Lamport timestamp**, যেখানে প্রতি message-এ counter সংযুক্ত থাকে। আর স্তূপ ঘেঁটে কার্যকারণের যে ক্রম বের হয়, সেটাই **happens-before**/**causal ordering** — "এই জবাবটা ওই চিঠির _পরে_ এসেছে"। বাস্তবে ঠিক এই কারণেই distributed system-এ physical clock-এর উপর ভরসা না করে logical clock ব্যবহার করা হয়; leaderless database-এ (Dynamo, Cassandra) কোন write আগে-পরে বা concurrent তা বুঝতেও এই একই ধারণা কাজে লাগে।

অধ্যায় ২ প্রতিষ্ঠা করেছিল যে physical clock মিথ্যা বলে: skew আর NTP jump মেশিন জুড়ে event order করতে wall-clock timestamp-কে অকেজো করে দেয়। অথচ order-ই ঠিক আমাদের যা দরকার — কোন write আগে এসেছিল জানতে, causal consistency প্রয়োগ করতে, সাংঘর্ষিক replica মিলিয়ে নিতে। সমাধান হলো "এটা _কখন_ ঘটেছিল?" জিজ্ঞেস করা বন্ধ করে "_এটা কি ওটার আগে ঘটেছিল?_" জিজ্ঞেস করা শুরু করা। **Logical clock** কোনো synchronized physical time ছাড়াই দ্বিতীয় প্রশ্নের উত্তর দেয়।

## Happens-before

Leslie Lamport **happens-before** সম্পর্ক সংজ্ঞায়িত করেছিলেন, লেখা হয় `a -> b`, যা ধরে কখন একটি event সম্ভবত অন্যটিকে প্রভাবিত করতে পারত। এটা ঠিক তিনটি ক্ষেত্রে সত্য:

1. **একই process:** যদি `a` আর `b` একই node-এ ঘটে আর program order-এ `a` আগে আসে, তবে `a -> b`।
2. **Message passing:** যদি `a` একটি message পাঠানো হয় আর `b` সেই একই message-এর প্রাপ্তি হয়, তবে `a -> b` (কেউ পাঠানোর আগে তুমি পেতে পারো না)।
3. **Transitivity:** যদি `a -> b` আর `b -> c`, তবে `a -> c`।

যদি `a -> b` না `b -> a` কোনোটাই সত্য না হয়, event গুলো **concurrent**, লেখা হয় `a || b`। Concurrent মানে "একই মুহূর্তে" নয় — এর মানে **causally স্বাধীন**: কোনোটাই অন্যটাকে প্রভাবিত করতে পারত না, তাই তাদের মধ্যে কোনো অর্থপূর্ণ order নেই।

```text
P1:  a --------- send(m) ----------------- d
                    \
P2:  ----- b ------- recv(m) --- c -----

  a -> d            (same process)
  send(m) -> recv(m) (message rule)
  a -> c            (transitivity through m)
  b || a            (concurrent: no path between them)
```

এটা একটি **partial order** দেয়: কিছু event জোড়া order করা, অন্যরা সত্যিই নয়। এটাই একটি distributed execution সম্পর্কে সৎ সত্য — আর logical clock-এর লক্ষ্য এই সম্পর্কটা সংখ্যায় ধরা।

## Lamport timestamp

একটি **Lamport timestamp** হলো per process একটি একক integer counter, দুটি নিয়ম দিয়ে রক্ষণাবেক্ষণ করা:

1. **যেকোনো local event-এর আগে** (একটি message পাঠানো সহ), তোমার counter বাড়াও।
2. **একটি message পাওয়ার সময়**, তোমার counter-কে `max(local_counter, message_counter) + 1` করো।

প্রতিটি message-এ counter সংযুক্ত করো। ফলাফলের একটি নিশ্চিত বৈশিষ্ট্য আছে:

> যদি `a -> b`, তবে `timestamp(a) < timestamp(b)`।

```text
P1: [1]a --- [2]send(m, ts=2) ------------------- [3]d
                    \
P2: [1]b ----------- [3]recv(m) --- [4]c
              (max(1,2)+1 = 3)
```

Lamport timestamp চমৎকারভাবে সস্তা — একটি integer — আর এগুলো process ID দিয়ে টাই (সমান timestamp) ভেঙে তোমাকে একটি **total order** বানাতে দেয়। অনেক algorithm-এর _কোনো_ একটি consistent total order দরকার, আর Lamport timestamp একটি দেয়।

কিন্তু একটি critical সীমাবদ্ধতা আছে। implication-টা _শুধু এক দিকে_ চলে: `a -> b` থেকে `ts(a) < ts(b)` বোঝায়, কিন্তু `ts(a) < ts(b)` থেকে `a -> b` **বোঝায় না**। একটি ছোট timestamp হয়তো নিছক একটি concurrent event হতে পারে। তাই Lamport timestamp event _order_ করতে পারে কিন্তু তোমাকে বলতে পারে না দুটি event **causally সম্পর্কিত নাকি নিছক concurrent** ছিল। Concurrency শনাক্ত করতে — যা conflict resolution-এর দরকার — তোমার আরও লাগে।

<Callout type="warning">

**একটি ছোট Lamport timestamp মানে "আগে ঘটেছিল" নয়।** Lamport clock একটি total order চাপায় কিন্তু causally-সম্পর্কিত আর concurrent event-এর মধ্যকার পার্থক্য হারায়। তোমার logic-এর যদি জানা দরকার "এই দুটি write কি conflict করেছিল?", Lamport timestamp নীরবে ভুল উত্তর দেবে। বরং vector clock ব্যবহার করো।

</Callout>

## Vector clock

একটি **vector clock** হারানো তথ্য ফিরিয়ে আনে। একটি integer-এর বদলে, প্রতিটি process counter-এর একটি **vector** রাখে — সিস্টেমের প্রতি process পিছু একটি entry। নিয়ম:

1. **একটি local event-এর আগে**, একটি process vector-এ **তার নিজের** entry বাড়ায়।
2. প্রতিটি message-এর সাথে পুরো vector **পাঠায়**।
3. **প্রাপ্তিতে**, local ও প্রাপ্ত vector-এর element-wise maximum নাও, তারপর তোমার নিজের entry বাড়াও।

```text
3 processes, vectors written [P1, P2, P3].

P1: [1,0,0]a -- send([1,0,0]) ------------- [2,0,0]
                    \
P2: [0,1,0]b ------- recv -> [1,2,0]c
              (max([0,1,0],[1,0,0]) then +1 on P2)
```

এখন তুমি vector গুলো element-wise তুলনা করো:

- `V(a) < V(b)` (প্রতিটি element `<=` আর অন্তত একটি কঠোরভাবে কম) মানে **`a -> b`**: `a` causally `b`-র আগে।
- `V(a) <= V(b)` না `V(b) <= V(a)` কোনোটাই না মানে **`a || b`**: event গুলো concurrent।

এটা সেই বৈশিষ্ট্য যা Lamport clock-এ ছিল না: vector clock **concurrency শনাক্ত** করতে পারে, যা ঠিক তোমার একটি leaderless store-এ (অধ্যায় ৩) সাংঘর্ষিক write খুঁজতে দরকার। Dynamo-style সিস্টেম vector clock (বা ঘনিষ্ঠ আত্মীয়) ব্যবহার করে চিনতে কখন দুটি replica সত্যিকারের ভিন্ন, concurrent version ধরে রাখে যা একটি সহজভাবে অন্যটাকে overwrite করার বদলে merge করতে হবে।

খরচ: প্রতিটি timestamp process সংখ্যার সাথে বাড়ে, যা বড় বা churning cluster-এ একটি বাস্তব সমস্যা। Variant (dotted version vector, pruning) বাস্তবে এটা বশে আনে।

|                         | Lamport              | Vector                 |
| ----------------------- | -------------------- | ---------------------- |
| আকার                    | একটি integer         | node পিছু একটি integer |
| `a -> b` order বোঝায়?  | হ্যাঁ                | হ্যাঁ                  |
| Concurrency শনাক্ত করে? | না                   | হ্যাঁ                  |
| Total order?            | হ্যাঁ (tie-break সহ) | Partial order          |

## Total বনাম partial order

Order-এর এই দুই ধারণা ট্র্যাক জুড়ে ফিরে আসে:

- একটি **partial order** শুধু causally সম্পর্কিত event order করে আর concurrent গুলোকে unordered রাখে। Vector clock এটা ধরে। এটা যা ঘটেছিল তার _সত্য_।
- একটি **total order** প্রতিটি event জোড়াকে একটি একক লাইনে বাধ্য করে, concurrent গুলোকেও, কোনো যথেচ্ছ কিন্তু consistent tie-break দিয়ে। Lamport timestamp (বা একটি consensus log, অধ্যায় ৬) এটা দেয়। এটা একটি _দরকারি কল্পকাহিনি_ যা সিস্টেম চাপায় যখন এটাকে একটি ক্রম বেছে নিতে হয় — যেমন, একটি Raft log-এ entry-র order।

Consensus, একটা অর্থে, একটি সহজাতভাবে **partial** order থেকে একটি সম্মত **total order** তৈরির যন্ত্রপাতি।

## Hybrid logical clock

Logical clock event সঠিকভাবে order করে কিন্তু তাদের মান মানুষের কাছে অর্থহীন — counter `4178` তোমাকে wall-clock time সম্পর্কে কিছুই বলে না। বিশুদ্ধ physical clock মানুষ-পাঠযোগ্য কিন্তু order-এর জন্য অনিরাপদ। **Hybrid Logical Clock (HLC)** দুটোই মেলায়: প্রতিটি timestamp একটি physical-time অংশ প্লাস একটি ছোট logical counter বহন করে।

একটি HLC physical time-কে ঘনিষ্ঠভাবে track করে (যাতে timestamp মোটামুটি real clock-এর সাথে মেলে আর মানুষের কাছে অর্থপূর্ণ হয়) আর logical counter ব্যবহার করে টাই ভাঙতে এবং physical clock ক্ষণিকের জন্য অমিল করলে বা পিছনে লাফালেও happens-before গ্যারান্টি সংরক্ষণ করতে। ফলাফল একটি timestamp যা _একইসাথে_ wall-clock time-এর কাছাকাছি _এবং_ একটি সঠিক logical clock — `ts(a) < ts(b)` যখনই `a -> b`, এমন একটি মান দিয়ে যা তুমি আসলে পড়তে পারো।

HLC আধুনিক distributed database-এ (CockroachDB, YugabyteDB, MongoDB) transaction order করতে ব্যবহৃত হয়: এগুলো logical clock-এর causal-correctness দেয় real time-এর সাথে বাঁধা timestamp সহ, যা debugging, time-bounded query, ও bounded staleness-এর জন্য অমূল্য।

<Callout type="tip">

**একটি clock বেছে নেওয়া:** **Lamport** timestamp ব্যবহার করো যখন তোমার শুধু _একটি_ consistent total order দরকার আর concurrency শনাক্ত করা নিয়ে ভাবো না। **Vector** clock ব্যবহার করো যখন তোমাকে causal-কে concurrent থেকে আলাদা করতেই হবে (leaderless replication-এ conflict detection)। **HLC** ব্যবহার করো যখন তুমি logical-clock correctness চাও কিন্তু মানুষ ও query-র জন্য real time আনুমানিক করে এমন timestamp-ও দরকার।

</Callout>
