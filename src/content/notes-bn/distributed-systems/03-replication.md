---
title: 'Replication'
subtitle: 'একাধিক মেশিনে data-র কপি রাখা: single-leader, multi-leader, ও leaderless ডিজাইন, sync বনাম async, এবং quorum।'
chapter: 3
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['replication', 'quorum', 'leader']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

**Replication** মানে একই data-র একটি কপি একাধিক মেশিনে রাখা। তুমি এটা তিনটি কারণে করো: একটি মেশিনের ক্ষতি সহ্য করতে (availability), কাছাকাছি বা অতিরিক্ত কপি থেকে read সার্ভ করতে (scale ও latency), এবং data ব্যবহারকারীদের কাছাকাছি রাখতে (locality)। কঠিন অংশটা কপি বানানো নয় — মেশিন ও network fail করার সময়ও সেগুলো consistent রাখা। প্রতিটি replication ডিজাইন একটি প্রশ্নের ভিন্ন উত্তর: _write কোথায় ঘটতে দেওয়া হবে?_

## Single-leader replication

সবচেয়ে সাধারণ ডিজাইন। একটি replica-কে **leader** (primary) মনোনীত করা হয়; বাকি সবাই **follower** (replica, secondary)। সব write leader-এ যায়। Leader write-টি প্রয়োগ করে, তারপর পরিবর্তনটি তার follower গুলোতে stream করে, যারা তা একই order-এ প্রয়োগ করে। Read যেকোনো replica সার্ভ করতে পারে।

```text
          writes
   client ------> [ LEADER ]
                     |  \
                     |   \  replication stream
                     v    v
              [follower] [follower]
                  ^           ^
                  |  reads    |
               client      client
```

PostgreSQL streaming replication, MySQL replication, এবং বেশিরভাগ managed database ঠিক এভাবেই কাজ করে। এর বড় গুণ সরলতা: যেহেতু প্রতিটি write একটি node-এর মধ্য দিয়ে একটি order-এ যায়, সমাধান করার মতো কোনো write conflict নেই। এর দুর্বলতা হলো leader একটি write bottleneck আর একটি single point of failure — leader হারানোর জন্য একটি **failover** লাগে, একটি follower-কে leader-এ উন্নীত করা, যা ঠিকঠাক করা সূক্ষ্ম কাজ।

## Multi-leader replication

এখন একাধিক node-কে write গ্রহণ করতে দাও, প্রত্যেকে একটি leader হিসেবে কাজ করে আর তার write অন্যদের replicate করে। এটা মূলত datacenter জুড়ে ব্যবহৃত হয়: প্রতিটি region-এ একটি local leader থাকে যাতে write local-এ দ্রুত হয়, আর leader গুলো background-এ region জুড়ে sync করে।

সুবিধা হলো প্রতিটি region-এ write availability ও কম write latency। খরচটা তীব্র: দুটি leader একই record-এ একই সময়ে সাংঘর্ষিক write গ্রহণ করতে পারে, আর ফিরে যাওয়ার মতো কোনো একক order নেই। তোমাকে **conflict detect ও resolve করতে হবে** — last-write-wins দিয়ে (lossy), application-নির্দিষ্ট merge logic দিয়ে, বা conflict-free data type (CRDT) দিয়ে। Multi-leader শক্তিশালী কিন্তু শুধু তখনই ধরা উচিত যখন single-leader সত্যিই latency চাহিদা মেটাতে পারে না।

## Leaderless replication

Leaderless (Dynamo-style) ডিজাইনে, যা Amazon Dynamo জনপ্রিয় করেছে আর Cassandra ও Riak ব্যবহার করে, কোনো leader-ই নেই। Client (বা তার পক্ষে একটি coordinator) প্রতিটি write **একসাথে কয়েকটি replica-তে** পাঠায় এবং যথেষ্ট সংখ্যক acknowledge করলে সফল বিবেচনা করে। Read-ও একসাথে কয়েকটি replica-কে query করে আর যেকোনো মতভেদ পেলে তা মিলিয়ে নেয়।

যেহেতু write ও read সরাসরি overlap করা replica set-এর সাথে কথা বলে, কিছু replica down থাকলেও সিস্টেম write গ্রহণ করতে থাকে — হারানোর মতো কোনো leader নেই। Trade-off হলো replica গুলো সাময়িকভাবে ভিন্ন মান ধরে রাখতে পারে, তাই সিস্টেমের anti-entropy mechanism লাগে (read repair, background sync) আর কোন মান জিতবে তা ঠিক করার একটি উপায়। চতুরতাটা থাকে **quorum** গণিতে।

## Synchronous বনাম asynchronous replication

তিনটি ডিজাইন জুড়েই কেটে যায় প্রশ্ন — client-কে write-টি _কখন_ acknowledge করা হয়।

- **Synchronous:** client-কে "done" বলার আগে leader অপেক্ষা করে follower নিশ্চিত করা পর্যন্ত যে তার কাছে write আছে। Follower নিশ্চিতভাবে up to date, তাই একটি failover কিছুই হারায় না — কিন্তু client সবচেয়ে ধীর follower-এর জন্য অপেক্ষা করে, আর সেই follower down থাকলে write আটকে যায়।
- **Asynchronous:** leader তাৎক্ষণিকভাবে acknowledge করে আর পরে follower-এ write পাঠায়। Write দ্রুত হয় আর leader follower up থাকার উপর নির্ভর করে না, কিন্তু একটি follower পিছিয়ে থাকতে পারে (**replication lag**), আর একটি write কোনো follower-এ পৌঁছানোর আগে leader মরে গেলে সেই write **হারিয়ে যায়**।

```text
Synchronous:   client -> leader -> follower(ack) -> leader -> client(ack)
Asynchronous:  client -> leader -> client(ack)
                                \-> follower (later)
```

বেশিরভাগ সিস্টেম একটি ব্যবহারিক মাঝপথ ব্যবহার করে: **semi-synchronous**, যেখানে leader একটি follower নিশ্চিত করা পর্যন্ত অপেক্ষা করে (যাতে অন্তত একটি durable কপি থাকে) আর বাকিরা asynchronous-ভাবে replicate করে।

## Quorum: R + W &gt; N

Leaderless সিস্টেম trade-off-টা স্পষ্ট ও tunable করে। ধরো:

- **N** = প্রতিটি data প্রতি যত replica-তে সংরক্ষিত হয়।
- **W** = একটি _write_ সফল গণ্য হতে যত replica-কে acknowledge করতে হবে।
- **R** = client ফলাফল গ্রহণ করার আগে একটি _read_-এ যত replica-কে সাড়া দিতে হবে।

মূল অন্তর্দৃষ্টি: যদি **W + R &gt; N** হয়, তাহলে একটি read যে replica সেটের সাথে যোগাযোগ করে তা নিশ্চিতভাবে সর্বশেষ write acknowledge করা সেটের সাথে অন্তত একটি replica-তে **overlap** করবে। সেই overlap করা replica-তে নতুনতম মান আছে, তাই read নিশ্চিতভাবে তা দেখবে (reader তারপর version number ব্যবহার করে সাড়াগুলোর মধ্যে নতুনতমটি বেছে নেয়)।

```text
N = 3.  Choose W = 2, R = 2.   W + R = 4 > 3, so reads and writes overlap.

  write goes to: [r1] [r2]  r3
  read asks:      r1  [r2] [r3]
  overlap at r2 -> read sees the latest write
```

W ও R টিউন করলে তুমি একটি spectrum জুড়ে সরতে পারো:

| Setting         | প্রভাব                                                   |
| --------------- | -------------------------------------------------------- |
| W = N, R = 1    | দ্রুত read, ধীর/ভঙ্গুর write, শক্তিশালী read consistency |
| W = 1, R = N    | দ্রুত write, ধীর read, write সবসময় উপলব্ধ               |
| W = R = (N+1)/2 | ভারসাম্যপূর্ণ "quorum" — সংখ্যালঘু failure সহ্য করে      |

<Callout type="info">

**নোট:** W + R &gt; N সহ একটি quorum linearizability-র সমান নয়। Concurrent write, clock skew, বা আংশিকভাবে সফল হওয়া failed write থাকলে quorum read এখনো বাসি বা অস্পষ্ট মান ফেরত দিতে পারে। Quorum staleness-কে _অসম্ভাব্য ও সীমাবদ্ধ_ করে; তারা নিজে থেকে অধ্যায় ৪-এর শক্তিশালী গ্যারান্টি দেয় না।

</Callout>

## Read-your-writes consistency

Replication lag একটি বিরক্তিকর user-facing bug তৈরি করে। একজন ব্যবহারকারী তার profile update করে (write leader-এ যায়), তারপর সাথে সাথে page reload করে (read সার্ভ করে একটি পিছিয়ে থাকা follower যে এখনো update পায়নি) — আর তার _পুরনো_ profile দেখে। মনে হয় যেন write হারিয়ে গেছে।

**Read-your-writes consistency** (read-after-write নামেও পরিচিত) গ্যারান্টি দেয় যে একজন ব্যবহারকারী সবসময় তার নিজের সবচেয়ে সাম্প্রতিক write দেখে, যদিও অন্য ব্যবহারকারীরা সংক্ষিপ্তভাবে বাসি data দেখতে পারে। সাধারণ কৌশল:

- একজন ব্যবহারকারী write করার পর একটি ছোট window-এর জন্য তার read leader-এ route করো।
- ব্যবহারকারীর শেষ write-এর অবস্থান (log sequence number) track করো আর শুধু সেই replica থেকে তার read সার্ভ করো যেটা সেই অবস্থানে ধরে ফেলেছে।
- Client-কে তার last-write timestamp মনে রাখতে দাও আর replica গুলোকে অন্তত ততটা current না হওয়া পর্যন্ত অপেক্ষা করতে বলো।

এটি কয়েকটি **client-centric** গ্যারান্টির একটি (monotonic read — কখনো time পিছিয়ে যেতে না দেখা — এবং consistent prefix read-এর পাশাপাশি) যা পূর্ণ শক্তিশালী consistency-র মূল্য না দিয়েই asynchronous replication-এর সবচেয়ে বিভ্রান্তিকর উপসর্গগুলো ঠিক করে। পরের অধ্যায় সেই গ্যারান্টিগুলো ঠিক কী তা আনুষ্ঠানিক করে।

<Callout type="tip">

**ব্যবহারিক default:** single-leader, asynchronous replication দিয়ে শুরু করো আর যে গুটিকয়েক flow-তে ব্যবহারকারীরা সাথে সাথে নিজের write আবার পড়ে সেগুলোর জন্য read-your-writes routing যোগ করো। Multi-leader বা leaderless-এর দিকে শুধু তখনই হাত বাড়াও যখন একটি সুনির্দিষ্ট প্রয়োজন — cross-region write, partition-এর সময় সবসময়-চালু write — তা বাধ্য করে।

</Callout>
