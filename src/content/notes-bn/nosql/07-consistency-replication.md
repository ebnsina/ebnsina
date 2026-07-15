---
title: 'NoSQL-এ Consistency ও Replication'
subtitle: 'Tunable ও eventual consistency, quorum-এর হিসাব, LWW দিয়ে conflict resolution, vector clock আর CRDT, সাথে read repair ও anti-entropy।'
chapter: 7
level: 'advanced'
readingTime: '13 মিনিট'
topics: ['consistency', 'replication', 'conflicts']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

তিন বন্ধু একটা group chat-এ ডিনার প্ল্যান করছে। কোনো সিদ্ধান্ত চূড়ান্ত হওয়ার আগে যদি সবাইকে reply করতেই হয়, তাহলে আপনি সবসময় sync-এ থাকবেন কিন্তু ধীর — একজন বন্ধু অফলাইন থাকলে পুরো গ্রুপ আটকে যায় (strong consistency)। আবার যে কেউ যদি একটা প্ল্যান ঘোষণা করে দিতে পারে আর বাকিরা পরে জেনে নেয়, তাহলে সিদ্ধান্ত তাৎক্ষণিক হয় কিন্তু দুজন হয়তো এক মুহূর্তের জন্য আলাদা রেস্টুরেন্ট বুক করে ফেলতে পারে (eventual consistency)। Distributed database এই একই দর-কষাকষি সেকেন্ডে লাখ লাখ বার চালায়, আর মজার প্রশ্নটা হলো দুই বন্ধু যখন সত্যিই _আলাদা_ রেস্টুরেন্ট বুক করে ফেলল তখন কী হয় — সিস্টেম কীভাবে conflict-টা মিটিয়ে ফেলে।

</Callout>

## গল্পে বুঝি

ইবনে সিনার একটা কাপড়ের দোকানের চেইন — শহরের চারটা এলাকায় চারটা শাখা, সবগুলো একই দাম-তালিকা মেনে চলে। মূল দোকানটা ইবনে সিনা নিজে বসেন, সেটাই head shop। কোনো শাড়ির দাম বদলাতে হলে ইবনে সিনা head shop-এ দাম ঠিক করে ফোন করে করে বাকি শাখাগুলোকে জানিয়ে দেন। কিন্তু চারটা শাখায় ফোন লাগাতে, লিখে রাখতে কয়েক মিনিট তো লেগে যায়ই। তাই দাম বদলানোর পরের কিছুক্ষণ ফাতিমা আল-ফিহরির শাখা হয়তো নতুন দাম বলছে, আল-খোয়ারিজমির শাখা এখনো পুরনোটাই বলছে — এক দোকানে ১২০০, আরেক দোকানে ১১৫০। ঝামেলা মনে হলেও কিছুক্ষণ পর সব শাখাই একই দামে মিলে যায়, কেউ আর আলাদা দাম বলে না।

গোল বাধে যেদিন শাখাগুলোর মধ্যে ফোন লাইনটাই কেটে যায়। এখন ইবনে সিনা নতুন দাম কোনো শাখাকেই জানাতে পারছেন না, শাখাগুলোও একে অন্যের সাথে মিলিয়ে নিতে পারছে না। ইবনে সিনাকে এখন সিদ্ধান্ত নিতে হবে — হয় সব শাখা খোলা রাখো, বিক্রি চলুক, কেউ হয়তো একটু পুরনো দামে বেচবে (দোকান চালু থাকল, কিন্তু দাম হয়তো বেঠিক); নয়তো লাইন ঠিক না হওয়া পর্যন্ত সব শাখার ক্যাশ বন্ধ রাখো, যাতে ভুল দামে একটাও বিক্রি না হয় (দাম নিশ্চিত এক, কিন্তু বিক্রি বন্ধ)। লাইন যতক্ষণ down, ততক্ষণ দুটোই একসাথে পাওয়ার উপায় নেই।

এই গল্পটাই আসলে NoSQL-এর consistency আর replication। প্রতিটা শাখা এক-একটা replica, একই দাম-তালিকার copy রাখছে, আর head shop-এর বদল ফোনে ছড়িয়ে পড়া মানে replication। কিছুক্ষণ শাখায় শাখায় দাম আলাদা কিন্তু শেষে মিলে যাওয়া — এটাই eventual consistency। আর ফোন লাইন কাটার মুহূর্তটা হলো network partition, যেখানে CAP theorem অনুযায়ী ইবনে সিনাকে বেছে নিতে হয় availability (সব খোলা, দাম হয়তো stale) নাকি consistency (দাম নিশ্চিত এক, কিন্তু বন্ধ) — partition-এর সময় দুটোই একসাথে পাওয়া যায় না। বাস্তবে Cassandra বা DynamoDB ঠিক এই সিদ্ধান্তটাই আপনার হাতে দেয় tunable consistency দিয়ে — quorum (`R + W`) সেট করে আপনি per-request ঠিক করেন এই operation-টা গতির জন্য stale ডেটা মেনে নেবে, নাকি অপেক্ষা করে সবশেষ value-ই দেখবে।

## Replication আর মূল Trade-off

NoSQL database প্রতিটা ডেটার একাধিক copy (**replica**) আলাদা আলাদা node-এ রাখে, durability আর availability-র জন্য। **Replication factor** (`RF`) হলো কতগুলো copy আছে — `RF=3` খুব সাধারণ।

যে মুহূর্তে আপনার একাধিক copy আছে, সেই মুহূর্তে প্রতিটা operation-এ একটা পছন্দের মুখোমুখি হন: copy গুলো একমত হওয়া পর্যন্ত অপেক্ষা করবেন (ধীর, consistent) নাকি কাছে যা আছে তা নিয়েই এগিয়ে যাবেন (দ্রুত, সম্ভবত stale)? CAP theorem network partition-এর সময় এটাকে অনিবার্য করে তোলে, কিন্তু সুস্থ cluster-এও trade-off-টা সাধারণ latency হিসেবে হাজির থাকে। NoSQL-এর উত্তর হলো consistency-কে **tunable** করা — পুরো database-এর জন্য fixed নয়, প্রতিটা request-এ ঠিক করা।

## Quorum

Consistency tune করার সবচেয়ে পরিষ্কার উপায় হলো **quorum**-এর হিসাব। ধরি:

- `N` = replication factor (copy-র সংখ্যা)
- `W` = একটা **write** সফল বিবেচিত হওয়ার আগে যতগুলো replica-কে acknowledge করতে হবে
- `R` = একটা **read** ফেরত দেওয়ার আগে যতগুলো replica-কে সাড়া দিতে হবে

মূল গ্যারান্টিটা:

```text
If  R + W > N   →  read and write quorums overlap on at least
                   one replica, so a read always sees the latest write
                   (strong consistency)

If  R + W <= N  →  the quorums might not overlap, so a read can
                   miss a recent write (eventual consistency)
```

`N=3` হলে জনপ্রিয় পছন্দ হলো `W=2, R=2` (`2 + 2 &gt; 3`): strongly consistent, তবু read আর write দুটোতেই একটা মৃত node সহ্য করতে পারে।

```text
N=3 examples:
  W=1, R=1   → fastest, weakest    (1 + 1 = 2, not > 3)   eventual
  W=2, R=2   → balanced, strong    (2 + 2 = 4 > 3)        strong
  W=3, R=1   → fast reads, slow writes, strong            strong
  W=1, R=3   → fast writes, slow reads, strong            strong
```

এগুলো আপনি workload অনুযায়ী tune করেন। একটা write-heavy telemetry pipeline হয়তো `W=1` বেছে নেবে (দ্রুত ingest, loss সহ্য করা); একজন user-এর সদ্য-সেভ-করা নিজের profile-এর read হয়তো `R=3` বেছে নেবে বা `W=3`-তে write করবে freshness নিশ্চিত করতে।

<Callout type="tip">

**নোট:** Quorum _consistency vs latency/availability_ tune করে, _সম্পূর্ণ হারানোর বিরুদ্ধে durability_ নয়। এমনকি `W=1` ও ডেটা লিখে ফেলে আর পরে asynchronously replicate করে — আপনি বেছে নিচ্ছেন replica-র জন্য কতক্ষণ _অপেক্ষা_ করবেন, copy শেষমেশ থাকবে কিনা তা নয়। বাস্তব durability-র জন্য quorum tuning-এর সাথে একটা উপযুক্ত replication factor আর cross-datacenter placement জুড়ে দিন।

</Callout>

## Eventual Consistency

Eventual consistency-র অধীনে সিস্টেম শুধু এটুকুই প্রতিশ্রুতি দেয়: _যদি write বন্ধ হয়ে যায়, সব replica শেষমেশ একই value-তে মিলে যাবে।_ এর মাঝখানে বিভিন্ন replica অল্প সময়ের জন্য ভিন্ন উত্তর দিতে পারে। অনেক workload-এর জন্য — একটা like count, একটা feed, একটা product page — কয়েক সেকেন্ডের staleness অদৃশ্য থাকে আর latency ও availability-র লাভের বিনিময়ে ভালোই।

কঠিন অংশটা হলো তখন কী হয় যখন দুই client একটা partition-এর সময় **আলাদা আলাদা replica-তে একই সময়ে write করে**। দুটোই লোকালি সফল হয়। এখন একই key-র জন্য দুই replica-তে দুটো ভিন্ন value, আর সিস্টেমকে ঠিক করতে হবে কোনটা জিতবে — নাকি কীভাবে এদের একসাথে মিলিয়ে দেবে। এটাই **conflict resolution।**

## Conflict Resolution

**Last-Write-Wins (LWW)।** প্রতিটা write একটা timestamp বহন করে; conflict-এ সবচেয়ে বড় timestamp জেতে। সহজ আর সস্তা, আর Cassandra-তে এটাই default।

```text
Replica A: key = "blue"  @ t=1005
Replica B: key = "green" @ t=1004
Resolved → "blue"   (latest timestamp wins; "green" is silently dropped)
```

বিপদটা: LWW হেরে যাওয়া write-টাকে _নীরবে ফেলে দেয়_, আর machine-গুলোর মধ্যে clock skew "ভুল" write-কে জিতিয়ে দিতে পারে। last-seen status-এর জন্য ঠিক আছে; কিন্তু একটা shopping cart-এর জন্য বিপজ্জনক, যেখানে একটা "add item" ফেলে দেওয়া মানে একজন customer-এর পছন্দ হারানো।

**Vector clock।** wall-clock time-এর বদলে প্রতিটা replica একটা per-node counter রাখে, যা একটা version vector তৈরি করে যেটা _causality_ ধরে রাখে — একটা write আরেকটার আগে ঘটেছে (happened-before) নাকি এরা সত্যিই concurrent।

```text
Write at A: cart = {milk}        version [A:1]
Write at B: cart = {eggs}        version [B:1]
   Neither vector dominates the other → CONCURRENT, a real conflict.
```

Vector clock conflict মেটায় না; এটা conflict-টা নিখুঁতভাবে **detect** করে, একটা stale write (ফেলে দেওয়া নিরাপদ) থেকে concurrent write (মেলাতেই হবে) আলাদা করে। এরপর সিস্টেম দুটো **sibling**-ই application-কে — বা user-কে — merge করার জন্য ফেরত দেয়। Dynamo-ধাঁচের store (Riak) এটা ব্যবহার করে যাতে একটা cart একটা version হারানোর বদলে দুটো version union করে নিতে পারে।

**CRDT (Conflict-free Replicated Data Types)।** এমনভাবে সংজ্ঞায়িত data structure যাতে concurrent update _সবসময়_ deterministically merge হয়, কোনো coordination ছাড়া আর কোনো write না হারিয়ে। একটা grow-only counter সব increment যোগ করে; একটা OR-Set add আর remove track করে যাতে element membership মিলে যায়। Replica গুলো স্বাধীনভাবে write গ্রহণ করতে পারে আর সবসময় একই state-এ মিলে আসে।

```text
Counter CRDT under concurrent +1 at three replicas:
  A: +5   B: +3   C: +2     →  merge = 5 + 3 + 2 = 10  (always)

Set CRDT, concurrent operations:
  A: add "x"      B: remove "x"   →  deterministic merge rule decides,
                                     same result on every replica
```

CRDT হলো স্বয়ংক্রিয়, ক্ষতিহীন convergence-এর সোনার মান (collaborative editor আর Redis-এর active-active replication-এ ব্যবহৃত), এর দাম হলো আরও জটিল data structure আর কিছুটা metadata overhead।

| Strategy        | Lost writes?           | Detects concurrency?   | Complexity |
| --------------- | ---------------------- | ---------------------- | ---------- |
| Last-Write-Wins | Yes (silently)         | No                     | Low        |
| Vector clocks   | No (surfaces siblings) | Yes                    | Medium     |
| CRDTs           | No (auto-merges)       | N/A (merges by design) | High       |

## Read Repair আর Anti-Entropy

Replica গুলো সরে যায় (drift), তাই database দুটো mechanism দিয়ে সক্রিয়ভাবে এই বিচ্যুতি সারিয়ে তোলে।

**Read repair** ঘটে read path-এ। একটা quorum read যখন দেখে replica গুলো অমিল, coordinator জেতা value-টা বেছে নেয় (conflict-resolution rule অনুযায়ী), সেটা client-কে ফেরত দেয়, আর _সঠিক value-টা ব্যাকগ্রাউন্ডে stale replica গুলোতে আবার লিখে দেয়_। ঘন ঘন read হওয়া ডেটা প্রায় বিনামূল্যেই consistent থাকে।

```text
Read at R=3 finds:
  Replica A: v=5 @ t=1005   ← newest
  Replica B: v=4 @ t=1003   ← stale
  Replica C: v=5 @ t=1005
→ return v=5, and asynchronously push v=5 to Replica B
```

**Anti-entropy** সেই ঠান্ডা (cold) ডেটা সামলায় যা read repair কখনো ছুঁয়েও দেখে না। ব্যাকগ্রাউন্ড process (Cassandra-র `nodetool repair`, Dynamo-ধাঁচের Merkle-tree তুলনা) পর্যায়ক্রমে replica-র বিষয়বস্তু তুলনা করে আর পার্থক্য মিলিয়ে দেয়, যাতে কখনো-read-না-হওয়া key গুলোও শেষমেশ মিলে যায়।

<Callout type="warning">

**সতর্কতা:** Eventual consistency মানে "consistency যা শিগগিরই আসবে" নয় — এটা হলো "কোনো সময়সীমা ছাড়া consistency, আর সাথে এমন conflict-এর সম্ভাবনা যা আপনাকেই সামলাতে হবে।" আপনার application logic যদি ধরে নেয় একটা read সবসময় শেষ write-টাই দেখায় (inventory কমিয়ে-তারপর-চেক করা, save-এর পর read-your-own-write), তাহলে eventual consistency বাস্তব, মাঝেমধ্যে দেখা দেওয়া বাগ তৈরি করবে। হয় ওই নির্দিষ্ট operation গুলোর জন্য consistency বাড়ান (`R + W &gt; N`), নয়তো logic এমনভাবে ডিজাইন করুন যাতে staleness সহ্য করে আর conflict স্পষ্টভাবে মিলিয়ে নেয়।

</Callout>

NoSQL consistency-র মূল সুরটা: এটা একটা switch নয়, একটা dial। যেসব operation নিখুঁত হতেই হবে (payment, inventory hold, read-your-writes) তাদের জন্য strong consistency সেট করুন, যেসব operation শুধু দ্রুত আর available হলেই চলে (feed, count, recommendation) তাদের জন্য eventual consistency মেনে নিন, আর এমন একটা conflict-resolution কৌশল বেছে নিন যা প্রতিটা ডেটার জন্য একটা হারানো বা merge হওয়া write কতটা ব্যয়বহুল হবে তার সাথে মেলে।
