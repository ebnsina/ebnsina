---
title: 'CAP & PACELC'
subtitle: 'CAP theorem সূক্ষ্মভাবে বর্ণিত, কেন একটি partition consistency ও availability-র মধ্যে একটি পছন্দ বাধ্য করে, এবং PACELC যে latency মাত্রা যোগ করে।'
chapter: 5
level: 'advanced'
readingTime: '10 মিনিট'
topics: ['cap', 'pacelc', 'tradeoffs']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

দুটো দ্বীপে দুটো ট্রেডিং পোস্ট — একটা চালায় আল-কিন্দি, অন্যটা ইবনে সিনা। দুই দ্বীপের মাঝে কোনো তার নেই, কেবল একটা ফেরি দিনভর যাতায়াত করে দুই পোস্টের মধ্যে চিঠি আর দামের তালিকা বয়ে নেয়। কেউ কিছু বিক্রি করলে ফেরি সেই খবর অন্য পোস্টে পৌঁছে দেয়, যাতে দুই দ্বীপে জিনিসের দাম এক থাকে। যতক্ষণ ফেরি চলছে, দুই পোস্ট প্রায় হাত ধরাধরি করে চলে।

তারপর এলো এক ঝড়। ফেরি বন্ধ, দুই দ্বীপ একে অন্যের কাছ থেকে বিচ্ছিন্ন। এখন আল-কিন্দির সামনে একজন ক্রেতা দাঁড়িয়ে — কী করবে সে? হয় সে নিজের কাছে থাকা পুরোনো দামের তালিকা দেখেই বিক্রি চালিয়ে যাবে (ঝুঁকি: ইবনে সিনার দ্বীপে ততক্ষণে দাম বদলে গেছে, দুই দ্বীপের দাম মিলবে না), নয়তো সে বলবে "ফেরি না ফেরা পর্যন্ত বিক্রি বন্ধ" — যাতে দুই দ্বীপ সবসময় একই দামে একমত থাকে, কিন্তু ক্রেতা খালি হাতে ফেরে। তৃতীয় কোনো পথ নেই: ইবনে সিনার সর্বশেষ দাম শারীরিকভাবেই আল-কিন্দির কাছে পৌঁছাতে পারছে না।

এই গল্পটাই **CAP**। ফেরি বন্ধ হওয়া মানে **partition** — আর তখন বাধ্যতামূলক পছন্দ: বিক্রি চালিয়ে যাওয়া (**availability**, বেঠিক দামের ঝুঁকি নিয়ে) নাকি ফেরি না ফেরা পর্যন্ত থেমে থাকা (**consistency**, দুই দ্বীপ সবসময় একমত)। আর **PACELC**-এর "Else" অংশটা হলো: ফেরি যখন **চলছেও**, আল-কিন্দি প্রতি বিক্রির আগে ফেরি পাঠিয়ে ইবনে সিনার সর্বশেষ দাম যাচাই করে নিতে পারে (ধীর, কিন্তু বেশি consistent) — নাকি স্মৃতি থেকেই তক্ষুনি বিক্রি করে দিতে পারে (দ্রুত, কিন্তু ঢিলা), অর্থাৎ **latency** বনাম **consistency**-র ট্রেড-অফ। বাস্তবে Cassandra বা DynamoDB ঠিক এই সিদ্ধান্তই নেয় — partition-এ available থাকে, আর স্বাভাবিক সময়েও কম latency-র জন্য strong consistency শিথিল করে।

CAP হলো distributed systems-এ সবচেয়ে উদ্ধৃত — এবং সবচেয়ে ভুল বোঝা — ফলাফল। শিথিলভাবে বললে ("তিনটার মধ্যে দুটো নাও") এটা বিভ্রান্তিকর। সূক্ষ্মভাবে বললে এটা network fail করলে একটি সিস্টেমকে কী ছাড়তে হবে তা নিয়ে যুক্তি সাজানোর একটি ধারালো, দরকারি হাতিয়ার। এই অধ্যায় এটা সঠিকভাবে বর্ণনা করে, আসল সিদ্ধান্ত টানে, তারপর PACELC দিয়ে বাড়ায়, যা কিছু ভাঙা না থাকলেও যে trade-off বিদ্যমান তা ধরে।

## তিনটি বৈশিষ্ট্য

CAP একটি distributed data store-এর তিনটি বৈশিষ্ট্য নিয়ে:

- **Consistency (C):** প্রতিটি read সবচেয়ে সাম্প্রতিক write বা একটি error পায়। এখানে "consistency" মানে নির্দিষ্টভাবে **linearizability** (অধ্যায় ৪) — data-র একটি একক up-to-date কপি। এটা ACID transaction-এর "C" _নয়_; এই অতিরিক্ত-বোঝাই শব্দটা অন্তহীন বিভ্রান্তি ঘটায়।
- **Availability (A):** একটি non-failed node-এ প্রতিটি request একটি non-error সাড়া পায় — সিস্টেম সার্ভ করতে থাকে, যদিও সাড়াটা বাসি হতে পারে।
- **Partition tolerance (P):** network node-এর মধ্যে যথেচ্ছ সংখ্যক message drop বা দেরি করা সত্ত্বেও সিস্টেম কাজ করতে থাকে।

## Theorem, সূক্ষ্মভাবে বর্ণিত

অসাবধান সংস্করণটা হলো "তুমি তিনটার মধ্যে শুধু দুটো পেতে পারো।" সূক্ষ্ম সংস্করণটা আরও ধারালো:

> যখন একটি network **partition** ঘটে, একটি distributed system-কে **consistency** আর **availability**-র মধ্যে বেছে নিতে হয়। এটা দুটোই পেতে পারে না।

মূল উপলব্ধি হলো **partition tolerance ঐচ্ছিক নয়**। যেকোনো বাস্তব network-এ, partition _ঘটবেই_ — link fail করে, switch reboot হয়, packet drop হয়। তুমি P বাদ দেওয়ার "পছন্দ" পাও না; network তোমার হয়ে সেটা বেছে নেয়। তাই আসল, বাধ্যতামূলক পছন্দটা C আর A-র মধ্যে, আর এটা শুধু **একটি partition-এর সময়** বাধ্যতামূলক। Network সুস্থ থাকলে, একটি ভালোভাবে বানানো সিস্টেম consistency ও availability দুটোই দিতে পারে।

<Callout type="warning">

**"তিনটার মধ্যে দুটো নাও" ভুল।** P প্রকৃতির একটি সত্য, একটি ডিজাইন পছন্দ নয় — তোমাকে partition সহ্য করতেই হবে। CAP আসলে বলে: _একটি partition-এর সময়_, C বা A বেছে নাও। বাকি সময় trade-off-টা প্রযোজ্যই নয়। CAP-কে partition-এর সময়কার আচরণ নিয়ে একটি বিবৃতি হিসেবে পড়ো, একটা মেনু হিসেবে নয়।

</Callout>

## কেন পছন্দটা বাধ্যতামূলক

কল্পনা করো একটি সিস্টেম দুটি অর্ধেকে partition হয়েছে যারা যোগাযোগ করতে পারে না। একটি client একটি অর্ধেকে একটি write পাঠায়। এখন ভাবো _অন্য_ অর্ধেকের কী করা উচিত যখন সে সেই একই data-র জন্য একটি read পায়:

```text
   [ Half 1 ]   ||  partition  ||   [ Half 2 ]
   write x = 9                        read x = ?
```

- Half 2 যদি read-এর **উত্তর দেয়**, তাকে নিজের বাসি মান দিয়ে উত্তর দিতে হবে (সে কখনো `x = 9` সম্পর্কে শোনেনি)। এটা **available** থাকল কিন্তু **consistency** ভাঙল।
- Half 2 যদি read **প্রত্যাখ্যান করে** (বা partition সেরে ওঠা পর্যন্ত block করে), এটা **consistent** থাকল কিন্তু **availability** ভাঙল।

কোনো তৃতীয় বিকল্প নেই। Half 2 নতুন মান ফেরত দিতে পারে না কারণ নতুন মান শারীরিকভাবেই তার কাছে পৌঁছাতে পারে না। এটাই পুরো theorem, আর এটা অনিবার্য।

## CP বনাম AP

তাই সিস্টেমগুলো একটি partition-এর সময় কোন বৈশিষ্ট্য ত্যাগ করে তা দিয়ে শ্রেণিবদ্ধ হয়:

**CP (partition-এ consistent):** partition হলে, সিস্টেম বাসি বা সাংঘর্ষিক data ফেরত দেওয়ার বদলে যেসব request সঠিকভাবে সার্ভ করতে পারে না সেগুলো প্রত্যাখ্যান করে। সংখ্যালঘু পক্ষ write গ্রহণ বন্ধ করে; শুধু quorum আছে এমন পক্ষ কাজ করতে থাকে। তুমি কিছু unavailability-র বিনিময়ে correctness পাও। উদাহরণ: ZooKeeper, etcd, HBase, এবং সাধারণভাবে consensus-সমর্থিত store। CP বেছে নাও যখন ভুল data কোনো data না থাকার চেয়ে খারাপ — account balance, lock, configuration, leader election।

**AP (partition-এ available):** partition হলে, প্রতিটি পক্ষ read ও write গ্রহণ করতে থাকে, replica-কে diverge করতে দেয়, আর পরে মিলিয়ে নেয় (last-write-wins, merge, CRDT)। তুমি সাময়িক inconsistency-র বিনিময়ে availability পাও। উদাহরণ: Cassandra, DynamoDB (তার eventually-consistent mode-এ), Riak। AP বেছে নাও যখন _কিছু একটা_ সবসময় সার্ভ করা _সর্বশেষটা_ সার্ভ করার চেয়ে বেশি গুরুত্বপূর্ণ — shopping cart, social feed, telemetry, cache।

|                   | CP সিস্টেম                    | AP সিস্টেম                  |
| ----------------- | ----------------------------- | --------------------------- |
| Partition-এর সময় | কিছু request প্রত্যাখ্যান করে | সব request সার্ভ করে        |
| ত্যাগ করে         | Availability                  | Consistency                 |
| Recovery          | ইতিমধ্যে consistent           | Divergence মিলিয়ে নিতে হয় |
| ভালো              | টাকা, lock, config            | Cart, feed, metrics         |

<Callout type="info">

**নোট:** CP ও AP পাথরে খোদাই করা whole-system লেবেল নয়। অনেক সিস্টেম per operation tunable — DynamoDB আর Cassandra তোমাকে per query একটি strongly consistent read (বেশি CP-ঘেঁষা) বা একটি eventual read (বেশি AP-ঘেঁষা) অনুরোধ করতে দেয়। Trade-off-টা আলাদা আলাদা request-এর মাত্রায় করা যায়।

</Callout>

## PACELC: CAP যে অংশটা বাদ দেয়

CAP শুধু _একটি partition-এর সময়_ আচরণ বর্ণনা করে, যা বিরল। Network সুস্থ থাকা বাকি 99.9% সময়ে তুমি যে trade-off-এর মুখোমুখি হও সে সম্পর্কে এটা কিছুই বলে না। **PACELC** (Daniel Abadi-র প্রস্তাবিত) সেই ফাঁকটা পূরণ করে। এটাকে একটি বাক্য হিসেবে পড়ো:

> **যদি** একটি **P**artition থাকে, **A**vailability আর **C**onsistency-র মধ্যে বেছে নাও; **E**lse (স্বাভাবিক কাজ), **L**atency আর **C**onsistency-র মধ্যে বেছে নাও।

নতুন অন্তর্দৃষ্টি হলো "else" clause। একটি একদম সুস্থ network দিয়েও, একটি সিস্টেম যেটা strong consistency চায় তাকে উত্তর দেওয়ার আগে replica জুড়ে সমন্বয় করতে হয় — আর সেই সমন্বয়ে সময় লাগে। তাই কিছু ভাঙা না থাকলেও strong consistency-র খরচ **latency**। একটি সিস্টেম consistency শিথিল করে (নিকটতম replica থেকে যাচাই না করে উত্তর দিয়ে) কম latency কিনতে পারে, বা প্রতিটি request-এ বেশি latency দিয়ে consistency-র মূল্য দিতে পারে।

এটা একটি চার-মুখী শ্রেণিবিভাগ দেয়, লেখা হয় `PA/EL`, `PC/EC`, ইত্যাদি:

| Class | Partition-এর সময় | স্বাভাবিকভাবে | উদাহরণ                                          |
| ----- | ----------------- | ------------- | ----------------------------------------------- |
| PC/EC | Consistency       | Consistency   | Strongly consistent store, etcd / spanner-style |
| PA/EL | Availability      | Latency       | Cassandra, DynamoDB (eventual)                  |
| PA/EC | Availability      | Consistency   | Tunable, সুস্থ থাকলে consistent-ঘেঁষা           |
| PC/EL | Consistency       | Latency       | কম প্রচলিত                                      |

PACELC বেশি সৎ model কারণ এটা তুমি আসলে প্রতিদিন যে trade-off করো তা সামনে আনে। বেশিরভাগ দল একটি নির্দিষ্ট মাসে কখনো partition-এ পড়ে না, কিন্তু প্রতিটি request `EL`/`EC` পছন্দে বর্ণিত consistency-বনাম-latency কর দেয় — বা এড়ায়।

<Callout type="tip">

**ডিজাইনে এগুলো ব্যবহার করা:** CP বনাম AP ঠিক করো per _data category_, per company নয়। তোমার billing ledger চায় PC/EC; তোমার "users online now" widget চায় PA/EL। একটা পুরো সিস্টেমের জন্য একটি অবস্থান বেছে নিলে হয় critical data অনিরাপদ হয় নয়তো তুচ্ছ data অপ্রয়োজনীয়ভাবে ধীর ও ভঙ্গুর হয়। সেই নির্দিষ্ট data সম্পর্কে ভুল হওয়ার খরচের সাথে trade-off মেলাও।

</Callout>
