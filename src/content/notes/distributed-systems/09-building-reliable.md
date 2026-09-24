---
title: 'Building Reliable Distributed Systems'
subtitle: 'সব একসাথে জোড়া: backoff ও jitter সহ retry, idempotency ও deduplication, delivery semantics, এবং durable execution।'
chapter: 9
level: 'mastery'
readingTime: '12 মিনিট'
topics: ['idempotency', 'retries', 'durable execution']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

একটা জরুরি রাজকীয় পার্সেল বাগদাদ থেকে কর্ডোভা পৌঁছে দিতে হবে — রিলে দৌড়ের মতো, একেকটা স্টেজে একেকজন দৌড়বিদ পার্সেলটা নিয়ে পরের স্টেজে দিয়ে আসে। হাইসাম পুরো রুটটা সাজাচ্ছেন, আর তাঁর মাথায় একটাই চিন্তা — যেকোনো একজন দৌড়বিদ পথে অসুস্থ হয়ে পড়লেও পার্সেল যেন থেমে না থাকে। তাই প্রতিটা স্টেজেই তিনি একজন বাড়তি দৌড়বিদ তৈরি রাখেন; মূল লোকটা ব্যর্থ হলে বসে থাকা লোকটা সঙ্গে সঙ্গে ছোটে।

খোয়ারিজমি প্রতিটা স্টেজে একজন করে চেকার বসিয়ে দেন, যাঁরা নজর রাখেন দৌড়বিদ ঠিক সময়ে পরের স্টেজে "পৌঁছেছি" বলে খবর পাঠাল কি না। একটা নির্দিষ্ট সময়ের মধ্যে খবর না এলে ধরে নেওয়া হয় লোকটা পথেই আটকে গেছে, আর পরের বাড়তি দৌড়বিদকে পাঠানো হয় — তবে প্রথমবার একটু অপেক্ষা করে, দ্বিতীয়বার আরও বেশি অপেক্ষা করে, যাতে হুটহাট সবাইকে একসাথে না ছোটানো হয়। এদিকে সিনা প্রতিটা পার্সেলে একটা অনন্য সিল মেরে দেন — কর্ডোভার শেষ চেকপোস্টে ফাতিমা সেই সিল দেখে বোঝেন এই পার্সেল আগে একবার এসে গেছে কি না; একই সিলের পার্সেল দুবার এলে দ্বিতীয়টা তিনি নীরবে বাদ দিয়ে দেন, দুবার প্রসেস করেন না। আর কোনো একটা রুট পুরো বন্ধ হয়ে গেলে চেকাররা পার্সেলটা ঘুরিয়ে পাশের রুট দিয়ে পাঠিয়ে দেন — একটু দেরিতে হলেও পৌঁছায়, একেবারে আটকে থাকে না।

এই গল্পটাই আসলে **অনির্ভরযোগ্য অংশ দিয়ে নির্ভরযোগ্য সিস্টেম বানানো**। প্রতিটা স্টেজে বাড়তি দৌড়বিদ রাখা হলো **redundancy**; খবর না এলে অপেক্ষা করে আবার পাঠানো হলো **timeout** আর **retry**, আর প্রতিবার অপেক্ষা বাড়ানোটা হলো **backoff**। পার্সেলের অনন্য সিল হলো **idempotency** — একই কাজ দুবার হয়ে গেলেও প্রভাব একবারই পড়ে (ঠিক যেমন idempotency key দিয়ে duplicate request বাদ দেওয়া হয়)। চেকারদের নজরদারি হলো **health check ও monitoring**, আর রুট ঘুরিয়ে দেওয়া হলো **graceful degradation** — পুরো ব্যর্থ হওয়ার বদলে একটু কমানো পথে হলেও কাজ চালিয়ে নেওয়া। বাস্তবে Temporal বা AWS Step Functions-এর মতো durable execution engine ঠিক এই কাজটাই করে — partial failure-কে ব্যতিক্রম নয়, স্বাভাবিক পথ ধরে নিয়ে সিস্টেমকে টিকিয়ে রাখে।

এতক্ষণ পর্যন্ত সবকিছু ছিল distributed system বোঝা নিয়ে। এই শেষ অধ্যায় একটার ভেতরে _কাজ করা_ নিয়ে: সেই সুনির্দিষ্ট, কষ্টার্জিত প্যাটার্ন যা partial failure-এর অনিবার্যতাকে এমন কিছুতে পরিণত করে যা তোমার সিস্টেম সুন্দরভাবে সামলে টিকে থাকে। একীভূত মানসিকতাটা বলা সহজ আর আত্মস্থ করা কঠিন — **ধরে নাও প্রতিটি remote call fail করতে পারে, time out করতে পারে, বা সফল-হয়েও-fail-করা-দেখাতে পারে, আর এমনভাবে ডিজাইন করো যাতে সেই ক্ষেত্র সামলানো স্বাভাবিক পথ হয়, ব্যতিক্রম নয়।**

## Retry

একটি remote call fail বা time out করলে, প্রথম প্রবৃত্তি হলো retry করা — আর এটা সাধারণত ঠিক, কারণ অনেক failure ক্ষণস্থায়ী (একটি সংক্ষিপ্ত ব্লিপ, একটি ক্ষণিকের overload)। কিন্তু সরল retry দুটি ভিন্ন উপায়ে বিপজ্জনক, আর তোমাকে দুটোরই বিরুদ্ধে রক্ষা করতে হবে।

### The thundering herd

একটি service হেঁচকি খেলে আর হাজারটা client সবাই তাৎক্ষণিকভাবে retry করলে, তারা সেরে ওঠা service-কে একটি synchronized traffic-এর দেয়াল দিয়ে আঘাত করে, এটাকে আবার ফেলে দেয়। Retry গুলোই পরের outage-এর _কারণ_ হয়। প্রতিরক্ষা হলো backoff ও jitter।

**Exponential backoff:** প্রতিটি পরপর failure-এর পর দীর্ঘতর অপেক্ষা করো — 1s, 2s, 4s, 8s — struggling service-কে হাতুড়ি না মেরে সেরে ওঠার জায়গা দাও।

**Jitter:** প্রতিটি অপেক্ষায় randomness যোগ করো যাতে retry lockstep-এ ছোঁড়ার বদলে সময়ে ছড়িয়ে পড়ে। Jitter ছাড়া, exponential backoff তারপরও সব client-কে একই retry মুহূর্তে synchronize করে (সবাই ঠিক 2s অপেক্ষা করে, তারপর ঠিক 4s)।

```text
No jitter:        all clients retry at t = 1, 2, 4, 8  (synchronized spikes)
Full jitter:      each waits random(0, 2^n)            (smoothly spread out)

wait = random_between(0, min(cap, base * 2^attempt))
```

**Full jitter** — শূন্য আর backoff সীমার মধ্যে যেকোনো জায়গায় একটি random delay বেছে নেওয়া — সবচেয়ে সরল স্কিম যা ভালো কাজ করে; এটা একইসাথে backoff করে আর de-synchronize করে।

### কখন retry না করতে হয় তা জানা

Retry শুধু _ক্ষণস্থায়ী_ failure-এর জন্য অর্থপূর্ণ। একটি deterministic error (একটি `400 Bad Request`, একটি validation failure) retry করা শুধু resource নষ্ট করে — এটা প্রতিবার একইভাবে fail করবে। আর retry অবশ্যই **সীমাবদ্ধ** হতে হবে: চেষ্টার সংখ্যা আর মোট সময় সীমিত করো, তারপর হাল ছেড়ে failure সামনে আনো। অসীম retry একটি ক্ষণস্থায়ী ব্লিপকে একটি স্থায়ী resource leak-এ পরিণত করে। Retry-কে একটি **circuit breaker**-এর সাথে জোড়ো: একটি dependency-তে অনেকবার failure-এর পর, একটি cooldown সময়ের জন্য এটা call করা বন্ধ করো, জমে যাওয়ার বদলে দ্রুত fail করো।

<Callout type="warning">

**Retry সবচেয়ে খারাপ সম্ভাব্য মুহূর্তে load বাড়ায়** — একটি outage-এর সময়, যখন সিস্টেম ইতিমধ্যে সংগ্রাম করছে। সবসময় retry-কে exponential backoff, jitter, একটি কঠিন চেষ্টার সীমা, আর একটি circuit breaker-এর সাথে মেলাও। এগুলো ছাড়া retry একটি ছোট ঘটনাকে একটি স্ব-প্রণোদিত, cascading outage-এ পরিণত করে।

</Callout>

## Idempotency হলো retry-র পূর্বশর্ত

এখানে সেই ফাঁকিটা যা আগের অধ্যায়কে অপরিহার্য করে: **একটি operation idempotent না হলে তুমি নিরাপদে retry করতে পারো না।** slow-বনাম-dead অস্পষ্টতা মনে করো (অধ্যায় ২) — একটি call time out করলে, operation-টা হয়তো _ইতিমধ্যে সফল হয়েছে_; response-টাই হারিয়েছে। সেই পরিস্থিতিতে তুমি একটি non-idempotent operation retry করলে, তুমি এটা দুবার করো: একটি double charge, একটি duplicate order, একটি দ্বিগুণ balance।

তাই retry আর idempotency অবিচ্ছেদ্য। কোথাও একটি retry যোগ করার আগে, নিশ্চিত করো target operation idempotent — স্বাভাবিকভাবে (একটি মান set করা, যা যতবারই করো একই) বা একটি **idempotency key** (অধ্যায় ৮) দিয়ে যা server-কে একটি পুনরাবৃত্ত request চিনতে ও de-duplicate করতে দেয়।

## Delivery semantics

প্রতিটি message-passing সিস্টেম তিনটি গ্যারান্টির একটি দেয়। তোমার কোনটা আছে — আর কোনটা দরকার — তা জানা মৌলিক।

| Semantic          | গ্যারান্টি                  | ঝুঁকি                            | কীভাবে                                  |
| ----------------- | --------------------------- | -------------------------------- | --------------------------------------- |
| **At-most-once**  | শূন্য বা একবার deliver হয়  | Message **হারাতে** পারে          | Send and forget; কখনো retry নয়         |
| **At-least-once** | এক বা একাধিকবার deliver হয় | Message **duplicate** করতে পারে  | Acknowledge হওয়া পর্যন্ত retry         |
| **Exactly-once**  | প্রভাব একবার ঘটে            | (বিশুদ্ধ delivery হিসেবে অসম্ভব) | At-least-once **+** idempotent consumer |

ব্যবহারিক শিক্ষা:

- **At-most-once** শুধু তখনই গ্রহণযোগ্য যখন একটি message হারানো নিরীহ — metrics, best-effort notification।
- **At-least-once** হলো গুরুত্বপূর্ণ যেকোনো কিছুর জন্য যুক্তিসঙ্গত default: একটি acknowledgment না পাওয়া পর্যন্ত retry করো, মেনে নাও duplicate ঘটবে।
- **Exactly-once** processing অর্জিত হয়, deliver হয় না: at-least-once প্লাস একটি deduplicating, idempotent consumer (অধ্যায় ৮)। exactly-once _delivery_-র পিছনে ছোটা বন্ধ করো; একটি অনির্ভরযোগ্য network-এ এটা নেই।

## Deduplication

At-least-once delivery মানে duplicate নিশ্চিত, তাই consumer-কে সেগুলো চিনে drop করতে হবে। ব্যবহারিক dedup কৌশল:

- **প্রতিটি message-এ idempotency key** প্লাস process করা key-এর একটি store — consumer এমন একটি key এড়ায় যা এটা ইতিমধ্যে সামলেছে।
- **Natural idempotency** — operation-টা এমনভাবে ডিজাইন করো যাতে একটি replay একটি no-op হয় (যেমন "shipped count বাড়াও"-এর বদলে "status shipped-এ set করো")।
- **একটি deduplication window** — সাম্প্রতিক-দেখা message ID একটি সীমাবদ্ধ সময়ের জন্য রাখো (একটি TTL set, একটি Bloom filter), ধরে নিয়ে যে duplicate কাছাকাছি আসে। এটা একটি missed dedup-এর সামান্য ঝুঁকি অসীম storage-এর বিপরীতে trade করে।

Dedup store-এর idempotency key-এর মতোই একই প্রয়োজন: একটি message "processed" চিহ্নিত করা আর তার প্রভাব প্রয়োগ করা **atomic** হতে হবে, নয়তো তাদের মাঝে একটি crash duplicate window আবার খুলে দেয়।

## Durable execution ও workflow

একটি multi-step workflow — অধ্যায় ৮-এর order saga — একটি ভঙ্গুর বৈশিষ্ট্য রাখে: এটা চালানো process ধাপ ৩-এ crash করলে, এটা কোথায় resume করে? Plain code তার অগ্রগতি memory-তে আর call stack-এ রাখে, দুটোই একটি crash-এ উবে যায়। তোমাকে প্রতিটি workflow-এর জন্য হাতে জটপাকানো state machine আর recovery logic লিখতে হয়।

**Durable execution** engine (Temporal, AWS Step Functions, restate, ও অনুরূপ) এটা সরাসরি সমাধান করে। তারা তোমার workflow-কে সাধারণ-দেখতে code হিসেবে চালায়, কিন্তু workflow এগোনোর সাথে সাথে **প্রতিটি ধাপের input ও result durable storage-এ persist করে**। Worker crash করলে, engine অন্য একটি worker-এ workflow restart করে আর এটা **replay** করে, সম্পন্ন ধাপগুলোর রেকর্ড করা result ফিরিয়ে দিয়ে সেগুলো এড়িয়ে — যাতে execution ঠিক যেখানে থেমেছিল সেখান থেকে resume করে, কখনো ঘণ্টা বা দিন পরে।

```text
Workflow: charge -> reserve -> ship

Engine records:  charge done (result saved)
                 reserve done (result saved)
                 [WORKER CRASHES before ship]

On recovery:     replay -> charge: use saved result (skip)
                           reserve: use saved result (skip)
                           ship: actually run    <- resumes here
```

Replay সঠিক হতে, durable engine এই পুরো ট্র্যাকের একদম সেই ধারণাগুলোর উপর নির্ভর করে: ধাপ **idempotent** হতে হবে (replay এমন একটি ধাপ পুনরায় invoke করতে পারে যার result crash-এর আগে রেকর্ড হয়নি), আর side effect engine-এর মধ্য দিয়ে যায় যাতে সেগুলো track ও retry করা যায়। Durable execution কার্যত অধ্যায় ৮-এর saga + outbox + idempotency + retry stack একটি পুনর্ব্যবহারযোগ্য runtime হিসেবে প্যাকেজ করা — এজন্যই এটা দীর্ঘ-চলা, multi-service workflow orchestrate করার আধুনিক default হয়ে উঠেছে।

<Callout type="info">

**নোট:** Durable execution distributed system-এর নিয়ম রদ করে না — এটা সেই প্যাটার্নগুলো _encapsulate_ করে যেগুলো তুমি অন্যথায় হাতে বানাতে। তোমার activity-কে এখনো idempotent হতে হবে, তোমার timeout এখনো slow-কে dead থেকে বলতে পারে না, আর "exactly-once" এখনো আসলে at-least-once প্লাস dedup। Engine শুধু workflow state persist ও resume করার boilerplate সরিয়ে দেয়।

</Callout>

## Partial failure-এর জন্য ডিজাইন: একটি checklist

পুরো ট্র্যাক একসাথে টেনে, বাস্তব জগতে টিকে থাকা একটি সিস্টেম এই বৈশিষ্ট্যগুলো ভাগ করে:

- **ধরে নাও প্রতিটি dependency অনুপলব্ধ থাকতে পারে।** প্রতিটি remote call-এ timeout যোগ করো; কখনো চিরকাল block কোরো না।
- **Operation idempotent বানাও** যাতে retry আর replay নিরাপদ হয়।
- **Exponential backoff, jitter, একটি সীমা, ও একটি circuit breaker দিয়ে retry করো** — কখনো সরলভাবে নয়।
- **At-least-once delivery বেছে নাও** আর এটাকে idempotent, deduplicating consumer-এর সাথে মেলাও।
- **Service জুড়ে 2PC এড়াও**; compensation সহ saga আর outbox pattern ব্যবহার করো।
- **সুন্দরভাবে degrade করো:** consistency model যেখানে অনুমতি দেয়, সম্পূর্ণ fail করার বদলে বাসি data বা একটি কমানো feature set সার্ভ করো।
- **সবচেয়ে দুর্বল consistency model বেছে নাও** যা প্রতিটি প্রয়োজন মেটায়, availability সর্বোচ্চ ও latency সর্বনিম্ন করতে।
- **Failure observable বানাও:** ভালো metrics, log, ও trace ছাড়া, তুমি slow-কে dead থেকে বলতে পারো না — অধ্যায় ২-এর কেন্দ্রীয় সমস্যা — ঠিক করা তো দূরের কথা।

<Callout type="tip">

**যে একটি অভ্যাস সবচেয়ে গুরুত্বপূর্ণ:** unhappy path-কে মূল path হিসেবে দেখো। Distributed system-এ, timeout, retry, duplicate, ও partial failure এমন edge case নয় যা সময় থাকলে সামলাও — এগুলো স্বাভাবিক কর্মাবস্থা। যে code এগুলো প্রথমে সামলায়, আর happy path-কে "এবার কিছু ভুল হয়নি" এর একটি বিশেষ ক্ষেত্র হিসেবে দেখে, সেই code production-এ টিকে থাকে।

</Callout>
