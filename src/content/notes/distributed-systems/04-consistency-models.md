---
title: 'Consistency Models'
subtitle: "'consistent' আসলে কী বোঝায়: linearizable, sequential, causal, ও eventual consistency, এবং spectrum জুড়ে trade-off গুলো।"
chapter: 4
level: 'advanced'
readingTime: '12 মিনিট'
topics: ['consistency', 'linearizability', 'causal']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সমরকন্দের এক গ্রামে খবর ছড়ানোর দুটো রাস্তা। প্রথমটা — গ্রামের ঢেঁড়াশিয়াল। কোনো বড় খবর এলে সে ঢোল পিটিয়ে গোটা গ্রামটাকে চকের মাঝখানে জড়ো করে, তারপর সরকারি ভাষ্যটা একবারে ঘোষণা করে দেয়। ইবনে সিনা, আল-বিরুনি, ফাতিমা আল-ফিহরি — যে যেখানেই ছিল, সবাই একসাথে একই মুহূর্তে ঠিক একই কথাটা শোনে। ঘোষণার পর গ্রামের যে কাউকে জিজ্ঞেস করো, সবাই হুবহু একই খবর বলবে, কেউ পুরনো ভাষ্য আঁকড়ে থাকতে পারবে না।

দ্বিতীয় রাস্তাটা — কানাকানি, মুখে মুখে গুজব। আল-খোয়ারিজমি বাজারে একটা কথা বলল, সেটা এ-পাড়া থেকে ও-পাড়ায় ছড়াতে থাকল। কিছুক্ষণের জন্য উত্তর পাড়া এক ভাষ্য জানে, দক্ষিণ পাড়া আরেকটা, আর নদীর ধারের বাড়িগুলো এখনও কিছুই শোনেনি। কিন্তু গুজব থামলে দিন শেষে গোটা গ্রাম একই গল্পে এসে মেলে। আর মজার ব্যাপার — যে আল-খোয়ারিজমি নিজে কথাটা শুরু করেছিল, সে সবসময় নিজের বলা আসল কথাটা ঠিকঠাক মনে রাখে, তাকে কেউ ভুল ভাষ্য গছাতে পারে না।

গল্পটাই আসলে **consistency model**। ঢেঁড়াশিয়ালের সবাইকে-একসাথে-একই-কথা হলো **strong/linearizable consistency** — write শেষ হওয়ার সঙ্গে সঙ্গে যে কেউ পড়লেই নতুন মানটাই পায়, কেউ পুরনো দেখে না, কিন্তু সবাইকে চকে জড়ো করার খরচটা (coordination, latency) বেশি। ধীরে ধীরে ছড়িয়ে শেষে মিলে যাওয়া গুজব হলো **eventual consistency** — কিছুক্ষণ পাড়ায় পাড়ায় মতভেদ থাকে, তারপর সব replica converge করে; সস্তা আর দ্রুত, কিন্তু মাঝের সময়টায় read পুরনো মান দিতে পারে। আর কথা-শুরু-করা লোকটা নিজের ভাষ্য মনে রাখা হলো **read-your-writes** — নিজের করা write নিজে সবসময় দেখে। বাস্তবেও ঠিক এমন: ব্যাংকের ব্যালেন্স বা unique username-এ linearizable লাগে, কিন্তু like counter বা DNS-এর মতো জিনিস eventual consistency-তেই চলে, উপরে দরকারমতো read-your-writes বসিয়ে।

Data যখন কয়েকটি মেশিনে থাকে, "data কি consistent?" আর একটা হ্যাঁ/না প্রশ্ন থাকে না। একটি **consistency model** হলো storage সিস্টেম আর programmer-এর মধ্যে একটি সূক্ষ্ম চুক্তি: এটা বলে দেয় আগে ঘটে যাওয়া write-গুলোর প্রেক্ষিতে একটি read কোন ফলাফল ফেরত দিতে পারে। শক্তিশালী model নিয়ে যুক্তি সাজানো সহজ কিন্তু latency ও availability-তে বেশি খরচ পড়ে; দুর্বল model সস্তা ও দ্রুত কিন্তু জটিলতা তোমার ঘাড়ে ঠেলে দেয়। এই অধ্যায় শক্তিশালী থেকে দুর্বল পর্যন্ত spectrum ধরে হাঁটে।

## কেন একটি model একটি চুক্তি

একটি বর্ণিত model ছাড়া তুমি তোমার প্রোগ্রাম নিয়ে যুক্তি সাজাতে পারো না, কারণ তুমি জানো না একটি read কী ফেরত দিতে পারে। একটি consistency model বৈধ ফলাফলগুলো গুনে দিয়ে সেই অনিশ্চয়তা দূর করে। Model যত শক্তিশালী, তত কম অবাক করা ফলাফল এটি অনুমতি দেয় — আর সেগুলো নিষিদ্ধ করতে সিস্টেমকে তত বেশি নেপথ্যে সমন্বয় করতে হয়।

দুটি বড় পরিবার আছে। **Data-centric** model বর্ণনা করে সব client একসাথে যে order দেখে; **client-centric** model একটি একক client-এর দৃষ্টিকোণ থেকে গ্যারান্টি বর্ণনা করে (এদের কয়েকটির সাথে আমরা অধ্যায় ৩-এ read-your-writes হিসেবে পরিচিত হয়েছি)। আমরা শক্তিশালীতম data-centric model দিয়ে শুরু করি।

## Linearizability (strong consistency)

**Linearizability** হলো স্বর্ণমান। এটি সিস্টেমকে এমনভাবে আচরণ করায় যেন data-র একটিমাত্র কপি ছিল আর প্রতিটি operation **যখন call করা হয়েছিল আর যখন return করেছিল তার মধ্যবর্তী কোনো একটি বিন্দুতে তাৎক্ষণিকভাবে** কার্যকর হয়েছিল। যেকোনো client-এর write সম্পন্ন হওয়ার পর, পরবর্তী প্রতিটি read — যেকোনো client-এর — সেই write বা একটি পরেরটা দেখে। একটি একক, real-time-সম্মানকারী order আছে, আর কেউ কখনো একটি মান পিছিয়ে যেতে দেখে না।

```text
A writes x = 1 (returns at t=5)
        ----------------------> after t=5, ANY read returns 1 (or newer)
B reads x at t=6  -> must return 1
C reads x at t=6  -> must return 1   (cannot still see the old value)
```

এটাই তোমাকে distributed store-কে একটি একক variable-এর মতো ব্যবহার করতে দেয়। মূল্যটা চড়া: কোনো read যাতে কখনো বাসি data না দেখে তা গ্যারান্টি দিতে, সিস্টেমকে প্রতিটি operation-এর critical path-এ replica জুড়ে সমন্বয় করতে হয়, যা latency যোগ করে, আর — অধ্যায় ৫ যেমন দেখায় — একটি network partition-এর সময় এটি পুরোপুরি available থাকতে পারে না। Consensus সিস্টেম (অধ্যায় ৬) আর `compare-and-swap` register linearizability দেয়।

## Sequential consistency

সামান্য দুর্বল। **Sequential consistency**-র জন্য দরকার যে সব operation _কোনো_ একটি একক total order-এ দেখা দেয়, আর এই order প্রতিটি আলাদা client নিজের operation যে order-এ জারি করেছে তা সম্মান করে। Linearizability থেকে গুরুত্বপূর্ণ পার্থক্য: এই order-কে **real time**-এর সাথে মিলতে হয় না। A যদি 10:00-এ write করে আর B 10:01-এ read করে, sequential consistency B-র read-কে A-র write-এর _আগে_ order করার অনুমতি দেয়, যতক্ষণ প্রতিটি client একটি consistent order-এ একমত হয়।

বাস্তবে এর মানে সব client একই সিনেমা দেখে, কিন্তু সিনেমাটা real time থেকে সামান্য পিছিয়ে চলতে পারে। এটা একক database গ্যারান্টি হিসেবে খুব কমই দেওয়া হয় কিন্তু ধারণাগত মইয়ের একটি গুরুত্বপূর্ণ ধাপ।

## Causal consistency

একটি খুব দরকারি মধ্যবিন্দু। **Causal consistency** গ্যারান্টি দেয় যে যেসব operation _causally সম্পর্কিত_ সেগুলো সবার কাছে একই order-এ দেখা দেয়, যখন যেসব operation নিছক **concurrent** (কোনোটাই অন্যটার কারণ নয়) সেগুলো ভিন্ন client-এর কাছে ভিন্ন order-এ দেখা দিতে পারে।

Causality হলো অধ্যায় ৭-এর "happens-before" সম্পর্ক: তুমি যদি একটি মান পড়ো আর তারপর তার ভিত্তিতে কিছু লেখো, তোমার write সেই read-এর causally _পরে_। ক্লাসিক উদাহরণ:

```text
Fatima posts: "I lost my keys."
Omar replies: "Glad you found them!"   (causally after Fatima's post)

Causal consistency guarantees nobody sees Omar's reply
before Fatima's post. Two unrelated posts may appear in any order.
```

Causal consistency আকর্ষণীয় কারণ এটি সত্যিকারের বিভ্রান্তিকর reorder (প্রশ্নের আগে উত্তর) নিষিদ্ধ করে আর একইসাথে **partition-এর সময় available থাকে** — এটি write path-এ cross-replica সমন্বয় ছাড়াই বাস্তবায়ন করা যায়, dependency track করে (vector clock)। Partition-এর সময় availability ত্যাগ না করে তুমি যতটা শক্তিশালী model পেতে পারো এটাই তার সর্বোচ্চ।

## Eventual consistency

সবচেয়ে দুর্বল সাধারণভাবে ব্যবহৃত model। **Eventual consistency** শুধু এই প্রতিশ্রুতি দেয় যে _write বন্ধ হলে, সব replica অবশেষে একই মানে converge করবে_। ইতিমধ্যে read কী ফেরত দেয় সে সম্পর্কে এটা কিছুই বলে না: তুমি নিজের write পড়ে পুরনো মান পেতে পারো, মান লাফালাফি করতে দেখতে পারো, বা update ভুল order-এ দেখতে পারো। "Eventually" অসীম — এটা কয়েক millisecond হতে পারে বা, টানা সমস্যার সময়, অনেক বেশি লম্বা।

এটা ভীতিকরভাবে দুর্বল শোনায়, আর অসাবধানে ব্যবহার করলে তাই। কিন্তু অনেক workload-এর জন্য — একটি like counter, একটি cache, একটি shopping cart যা merge হয়, DNS — eventual consistency একদম ঠিক, কারণ এটা সর্বোচ্চ availability আর সবচেয়ে কম latency কিনে দেয়। Application সাময়িক মতভেদটা শুষে নেয়।

<Callout type="warning">

**"Eventual" অনেক পাপ লুকিয়ে রাখে।** Eventual consistency একটি read-কে একই client-এর ইতিমধ্যে দেখা একটি মানের চেয়ে _পুরনো_ মান ফেরত দিতে অনুমতি দেয়, আর convergence-এ কতক্ষণ লাগে তার কোনো সীমা দেয় না। তোমার code যদি monotonic অগ্রগতি বা read-your-writes ধরে নেয়, plain eventual consistency সেই ধারণা লঙ্ঘন করবে। প্রয়োজন হলে উপরে client-centric গ্যারান্টি স্তরে বসাও।

</Callout>

## Spectrum ও তার trade-off

শক্তিশালী থেকে দুর্বল ক্রমে সাজানো:

| Model        | গ্যারান্টি                                    | সমন্বয় খরচ | Partition-এ available? |
| ------------ | --------------------------------------------- | ----------- | ---------------------- |
| Linearizable | একক কপি, real time সম্মান করে                 | সর্বোচ্চ    | না                     |
| Sequential   | একটি total order, per-client order সম্মান করে | উচ্চ        | না                     |
| Causal       | Causally সম্পর্কিত op সবার জন্য order করা     | মাঝারি      | হ্যাঁ                  |
| Eventual     | Write বন্ধ হলে replica converge করে           | সর্বনিম্ন   | হ্যাঁ                  |

প্যাটার্নটা monotonic: **গ্যারান্টি যত শক্তিশালী, তত বেশি সমন্বয় লাগে, আর failure-এর সময় সিস্টেম তত কম available।** এই টেবিলে একটা কঠিন রেখা আছে — sequential আর causal-এর মধ্যে — যা পার হলে তুমি শক্তিশালী, real-time-সম্মানকারী order-এর বদলে একটি partition-এর সময় সার্ভ করতে থাকার ক্ষমতা কেনো। অধ্যায় ৫ (CAP) হলো ঠিক সেই রেখার আনুষ্ঠানিকীকরণ।

## Client-centric গ্যারান্টি

একটি eventually consistent store-এর উপরেও, তুমি per-client প্রতিশ্রুতি দিতে পারো যা global সমন্বয় ছাড়াই সবচেয়ে বিভ্রান্তিকর উপসর্গ দূর করে:

- **Read-your-writes:** একটি client সবসময় নিজের সর্বশেষ write দেখে (অধ্যায় ৩)।
- **Monotonic reads:** একটি client কখনো time পিছিয়ে যেতে দেখে না — একবার একটি মান পড়লে, পরের read সেই মান বা নতুনতর ফেরত দেয়, কখনো পুরনো নয়।
- **Monotonic writes:** একটি client-এর write গুলো client যে order-এ জারি করেছে সেই order-এ প্রয়োগ হয়।
- **Consistent prefix reads:** একটি write ক্রম যদি কোনো order-এ ঘটে থাকে, একটি reader কখনো আগেরগুলো ছাড়া একটি পরেরটা দেখে না (প্রশ্নের আগে কোনো উত্তর নয়)।

এগুলো বাস্তবায়ন করা সস্তা (session stickiness, version tracking) আর প্রায়ই সঠিক উত্তর: ব্যবহারকারীরা যা আসলে খেয়াল করে তা ঠিক করে দুর্বল data-centric consistency-র availability ও latency সুবিধা ধরে রেখে।

<Callout type="tip">

**একটি model বেছে নেওয়া:** তোমার correctness-এর জন্য যে _দুর্বলতম_ model দরকার সেটা বেছে নাও, তুমি কল্পনা করতে পারো এমন শক্তিশালীতমটা নয়। টাকা সরানো আর unique-username বরাদ্দে linearizability দরকার। Social feed আর comment thread-এর জন্য causal ভালো কাজ করে। Counter, cache, আর presence indicator eventual প্লাস একটি-দুটি client-centric গ্যারান্টি নিয়ে ঠিক আছে। প্রতিটি ধাপ দুর্বল হলে বাস্তব availability ও latency কেনা যায়।

</Callout>
