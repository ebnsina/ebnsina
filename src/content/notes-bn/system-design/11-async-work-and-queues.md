---
title: 'অ্যাসিনক্রোনাস কাজ আর কিউ'
subtitle: 'কোন কাজটা রিকোয়েস্ট পাথ থেকে সরাবেন, queue না stream বাছবেন, আর worker-কে retry, idempotency ও dead-letter queue দিয়ে কীভাবে বিশ্বাসযোগ্য বানাবেন।'
chapter: 11
level: 'intermediate'
readingTime: '১৯ মিনিট'
topics: ['async', 'queues', 'streams', 'workers', 'retries', 'idempotency', 'dead-letter queue']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

আগের তিনটে চ্যাপ্টারে আমরা রিকোয়েস্ট পাথটাকে দ্রুত করার তিনটে হাতিয়ার দেখেছি — ক্যাশ দিয়ে কাজটা এড়ানো, লোড ব্যালান্সার দিয়ে কাজটা ভাগ করা, আর ডেটাবেস স্কেল করে কাজটা সামলানো। এই চ্যাপ্টারে আমরা চতুর্থ এবং সবচেয়ে শক্তিশালী হাতিয়ারটা দেখব, যেটা আগের তিনটার চেয়ে আলাদা প্রশ্ন করে: এই কাজটা কি ইউজারের রিকোয়েস্টের ভেতরেই করতে হবে?

কারণ p99 latency কমানোর সবচেয়ে বড় সুযোগটা প্রায়ই query optimization-এ নয় — বরং এই উপলব্ধিতে যে চেকআউট রিকোয়েস্টের ভেতরে বসে থাকা তিনটে কাজের মধ্যে দুটোর সাথে ইউজারের কোনো সম্পর্কই নেই। ইনভয়েস PDF বানানো, কনফার্মেশন ইমেইল পাঠানো, ওয়্যারহাউস সিস্টেমে খবর দেওয়া — এসব ঘটতেই হবে, কিন্তু ইউজার তাকিয়ে থাকা অবস্থায় ঘটতে হবে না।

আর সেই সিদ্ধান্তটা নেওয়ার মুহূর্তেই আপনি একটা নতুন জগতে ঢুকে পড়েন: কাজটা এখন একটা কিউতে বসে আছে, কেউ একজন সেটা তুলে নেবে, হয়তো দুবার তুলে নেবে, হয়তো তুলে নিয়ে ক্র্যাশ করবে, হয়তো কখনোই সফল হবে না। এই চ্যাপ্টারটা সেই জগতের নিয়মকানুন নিয়ে।

## গল্পে বুঝি

দামেস্কের ডাকঘরের সামনের কাউন্টারটা সকাল আটটা থেকে ভিড়ে ঠাসা। কাউন্টারে বসেন ফাতিমা আল-ফিহরি। তাঁর সামনে লাইনে দাঁড়ানো লোকজন পার্সেল আর চিঠি নিয়ে আসে, আর ফাতিমা প্রতিটার জন্য ঠিক তিনটে কাজ করেন: ওজন করেন, দাম নেন, আর একটা রসিদে ট্র্যাকিং নম্বর লিখে হাতে ধরিয়ে দেন। এই তিনটে কাজ মিলিয়ে চল্লিশ সেকেন্ড।

কিন্তু ডাকঘরের কাজ তো এখানেই শেষ নয়। পার্সেলটা জেলা অনুযায়ী বাছতে হবে, উটের বহরে তুলতে হবে, বহরকে বুখারা বা কর্ডোবা পর্যন্ত পৌঁছাতে হবে, প্রাপকের কাছে হস্তান্তর করতে হবে, প্রাপ্তির স্বাক্ষর নিয়ে ফিরে আসতে হবে। এই পুরোটা করতে তিন সপ্তাহ। যদি ফাতিমা জেদ ধরতেন যে পার্সেলটা প্রাপকের হাতে না পৌঁছানো পর্যন্ত খদ্দের কাউন্টারেই দাঁড়িয়ে থাকবে — ডাকঘরের সামনের লাইন প্রথম দিনেই শহরের গেট ছাড়িয়ে যেত।

তাই ডাকঘরটা যেভাবে কাজ করে সেটা খুব সাধারণ, কিন্তু গভীর: কাউন্টারে শুধু ওই কাজগুলোই হয় যেগুলোর উত্তর খদ্দেরের **এই মুহূর্তে** দরকার — পার্সেলটা গৃহীত হয়েছে কিনা, দাম কত, আর ট্র্যাকিং নম্বরটা কী। বাকি সব কাজ কাউন্টারের পেছনের উঠোনে গিয়ে জমা হয়। খদ্দের রসিদ হাতে নিয়ে চলে যায়, আর পরে ট্র্যাকিং নম্বর দিয়ে খোঁজ নেয়।

উঠোনে ঢুকলে দেখবেন পার্সেলগুলো একটা লম্বা তাকে সারি ধরে রাখা, আর পাঁচজন সর্টার — ইবনে আল-হাইসাম, আল-কিন্দি, আল-রাযি আর আরও দুজন — তাক থেকে একটা করে পার্সেল তুলে নিয়ে কাজ করছেন। কে কোনটা তুলবে তার কোনো নিয়ম নেই; যে খালি হয় সে পরেরটা তোলে। পাঁচজন হলে উঠোন পাঁচগুণ দ্রুত খালি হয়, দুজন অসুস্থ হলে তিনজনে চলে — একটু ধীরে, কিন্তু চলে।

সর্টার যখন একটা পার্সেল তাক থেকে তোলেন, তিনি সেটা নিজের ডেস্কে নেন এবং তাকের খাতায় লিখে দেন "এই পার্সেলটা আল-রাযির কাছে, দুই ঘণ্টার মধ্যে ফেরত বা প্রেরিত"। এই দুই ঘণ্টার সময়সীমাটা জরুরি। কারণ আল-রাযি যদি পার্সেলটা ডেস্কে নিয়ে অসুস্থ হয়ে বাড়ি চলে যান, তাহলে দুই ঘণ্টা পর সুপারভাইজার এসে দেখবেন কাজটা হয়নি, আর পার্সেলটা আবার তাকে ফিরিয়ে দেবেন — অন্য কেউ তুলে নেবে। কোনো পার্সেল কারো ডেস্কে চিরকাল আটকে থাকতে পারে না। আর যে কাজটা সত্যিই লম্বা — যেমন কাস্টমস ফর্ম ভরা — সেই সর্টার মাঝে মাঝে সুপারভাইজারকে জানিয়ে যান "আমি এখনো এটাতেই কাজ করছি", আর সময়সীমাটা বাড়িয়ে নেওয়া হয়।

এখন আসল ঝামেলা। বুখারার বহরটা মাঝপথে ঝড়ে আটকে গেল, পার্সেলগুলো ফেরত এল। ডাকঘর কি হাল ছেড়ে দেবে? না — পরের বহরে আবার পাঠাবে। কিন্তু এখানে একটা ফাঁদ আছে: ফেরত আসা পার্সেলগুলো আবার পাঠানোর সময় যদি হিসাব না রাখা হয়, প্রাপক একই পার্সেল দুবার পেয়ে যেতে পারেন। তাই প্রতিটা পার্সেলের গায়ে সেই ট্র্যাকিং নম্বরটা লেখা থাকে, আর প্রাপক এলাকার ডাকঘরে একটা খাতা থাকে — "এই নম্বরগুলো ইতিমধ্যে হস্তান্তর হয়েছে"। কোনো পার্সেল দ্বিতীয়বার এলে খাতায় নম্বরটা পাওয়া যায়, আর সেটা আর হস্তান্তর হয় না। পার্সেল দুবার পৌঁছাতেই পারে; কিন্তু হস্তান্তরটা একবারই ঘটে।

আরও একটা নিয়ম আছে পুনঃপ্রেরণে। প্রথমবার ফেরত এলে ডাকঘর পরের দিনই আবার পাঠায়। দ্বিতীয়বার ফেরত এলে দুদিন পরে। তৃতীয়বার চারদিন পরে। কারণ যে রাস্তাটা বন্ধ, সেটাতে প্রতি ঘণ্টায় বহর পাঠানো মানে শুধু উট আর মানুষ নষ্ট করা — আর তাছাড়া, সব ফেরত পার্সেল যদি ঠিক একই সকালে আবার রওনা দেয়, তাহলে গেটে আবার সেই একই জ্যাম। তাই কেরানি ইচ্ছে করে সময়টা একটু এলোমেলো করে দেন — কেউ ভোরে, কেউ দুপুরে।

আর যে পার্সেলটা পাঁচবার চেষ্টা করেও পৌঁছানো গেল না — ঠিকানাটা ভুল, শহরটার নামই কেউ শোনেনি, বা প্রাপক মারা গেছেন? সেটা অনন্তকাল ধরে বহরে ঘুরতে থাকে না। সেটা উঠোনের কোণের একটা আলাদা তাকে গিয়ে ওঠে, যার নাম "অপ্রেরণযোগ্য"। প্রতি সপ্তাহে সুপারভাইজার মারিয়াম আল-আসতুরলাবি ওই তাকটা খুলে দেখেন — কী কী জমেছে, কেন জমেছে। কোনোটার ঠিকানা হাতে ঠিক করে দিয়ে আবার মূল তাকে ফেরত পাঠান, কোনোটা প্রেরকের কাছে ফেরত যায়। সবচেয়ে গুরুত্বপূর্ণ ব্যাপারটা হলো — ওই তাকে হঠাৎ পঞ্চাশটা পার্সেল জমলে ঘণ্টা বাজে, কারণ সেটা একটা পার্সেলের সমস্যা নয়, একটা রাস্তার সমস্যা।

আর মারিয়াম দিনে একবারই যে সংখ্যাটা দেখেন সেটা কতগুলো পার্সেল পাঠানো হলো তা নয় — সেটা হলো মূল তাকে এখন কতগুলো পার্সেল **জমে আছে**। সংখ্যাটা স্থিতিশীল থাকলে ডাকঘর সুস্থ। সংখ্যাটা প্রতি ঘণ্টায় বাড়তে থাকলে তার মানে খদ্দের যত পার্সেল দিচ্ছে, সর্টাররা তার চেয়ে কম সামলাচ্ছেন — আর সেটা কখনো নিজে থেকে ঠিক হয় না।

মিলিয়ে নিই: ফাতিমার কাউন্টার হলো আপনার **synchronous request path**, উঠোনের লম্বা তাক হলো **queue**, পাঁচজন সর্টার হলো **competing consumers** বা **worker pool**, একজন সর্টারের ডেস্কে একসাথে যত পার্সেল ধরে সেটা **prefetch** আর **concurrency**, "দুই ঘণ্টার মধ্যে ফেরত বা প্রেরিত" হলো **visibility timeout**, "আমি এখনো কাজ করছি" জানানো হলো **heartbeat**, ট্র্যাকিং নম্বরটা হলো **idempotency key** আর প্রাপক ডাকঘরের খাতাটা হলো **dedup store**, "পার্সেল দুবার পৌঁছাতে পারে কিন্তু হস্তান্তর একবার" হলো **at-least-once delivery + idempotent handler**, ফেরত পার্সেল আবার পাঠানোর ক্রমবর্ধমান বিরতি হলো **exponential backoff** আর সময় এলোমেলো করা হলো **jitter**, কোণের ওই তাকটা হলো **dead-letter queue**, আর তাকে জমে থাকা পার্সেলের সংখ্যা হলো **queue depth** — অ্যাসিনক্রোনাস সিস্টেমের একমাত্র সৎ স্বাস্থ্য-সূচক।

## কোন কাজটা রিকোয়েস্ট পাথে থাকবে

সিদ্ধান্তটা নেওয়ার জন্য একটাই প্রশ্ন যথেষ্ট, আর প্রশ্নটা টেকনিক্যাল নয় — প্রোডাক্টের:

**উত্তরটা কি ইউজারকে এই রেসপন্সেই দেখাতে হবে?**

উত্তর "হ্যাঁ" হলে কাজটা রিকোয়েস্ট পাথে থাকবে। উত্তর "না" হলে সেটা কিউতে যাবে। এই সরল প্রশ্নটার প্রয়োগ দেখে নিন একটা অর্ডার প্লেসমেন্টের উপর:

| কাজ                             | ইউজারকে এখনই দেখাতে হবে?   | কোথায় থাকবে |
| ------------------------------- | -------------------------- | ------------ |
| পেমেন্ট অথরাইজেশন               | হ্যাঁ — না হলে অর্ডারই নেই | sync         |
| ইনভেন্টরি রিজার্ভেশন            | হ্যাঁ — স্টক নেই বলতে হবে  | sync         |
| অর্ডার রেকর্ড লেখা              | হ্যাঁ — অর্ডার নম্বর লাগবে | sync         |
| কনফার্মেশন ইমেইল                | না                         | async        |
| ইনভয়েস PDF তৈরি                | না                         | async        |
| ওয়্যারহাউস সিস্টেমে নোটিফিকেশন | না                         | async        |
| রেকমেন্ডেশন মডেল আপডেট          | না                         | async        |
| ফ্রড স্কোরিং (পোস্ট-হক)         | না                         | async        |

খেয়াল করুন উপরের তিনটে কাজ ইউজারের সিদ্ধান্ত বদলায় — নিচের পাঁচটা বদলায় না। এটাই পুরো বিভাজনের ভিত্তি।

### দুটো যুক্তি, দুটোই সমান গুরুত্বপূর্ণ

**Latency।** sync কাজগুলোর latency যোগ হয়, ভাগ হয় না। পেমেন্ট গেটওয়ে ৪০০ ms, ইমেইল প্রোভাইডার ৬০০ ms, PDF রেন্ডার ১.২ s, ওয়্যারহাউস API ৩০০ ms — সব একসাথে করলে ইউজার ২.৫ সেকেন্ড অপেক্ষা করে। শেষের তিনটে সরিয়ে দিলে সেই একই অর্ডার ৪০০ ms-এ শেষ। আপনি কোনো কোড দ্রুত করেননি; শুধু ইউজারকে অপেক্ষা করানো বন্ধ করেছেন।

**Failure isolation।** এটাই আসলে বড় যুক্তি। ইমেইল প্রোভাইডার যদি রিকোয়েস্ট পাথের ভেতরে থাকে, তাহলে তাদের ২০ মিনিটের outage মানে **আপনার চেকআউট ২০ মিনিট বন্ধ** — মানুষ টাকা দিতে পারছে অথচ অর্ডার ফেল করছে। ইমেইলটা কিউতে থাকলে ওই ২০ মিনিটে কিউতে কয়েক হাজার জব জমবে, প্রোভাইডার ফিরে এলে worker সেগুলো ঝেড়ে ফেলবে, আর কোনো ইউজার কিছু টেরই পাবে না। কিউ হলো একটা shock absorber: আপনার দুর্বলতম dependency-র uptime আর আপনার সবচেয়ে গুরুত্বপূর্ণ ফ্লো-র uptime আলাদা করে দেয়।

<Mermaid
title="Same checkout, sync versus async"
code={`graph TD
  U["User clicks Pay"] --> API["Order API"]
  API --> P["Payment auth<br/>400 ms, must be sync"]
  P --> DB["Write order row<br/>15 ms, must be sync"]
  DB --> Q["Enqueue 3 jobs<br/>2 ms"]
  Q --> R["200 OK in ~420 ms"]
  Q --> W1["Worker: email"]
  Q --> W2["Worker: invoice PDF"]
  Q --> W3["Worker: warehouse sync"]`}
/>

<Callout type="warning">

কাজটা async করা মানে কাজটা কম গুরুত্বপূর্ণ নয় — মানে হলো **কাজটার ব্যর্থতা ইউজারের রেসপন্স ব্যর্থ করে না**। ইনভয়েস তৈরি না হলে সেটা এখনো একটা bug, এখনো একটা alert, এখনো কাউকে ঠিক করতে হবে। পার্থক্য শুধু এই যে সেটা এখন একটা backlog সমস্যা, একটা outage নয়। এই পার্থক্যটা না বুঝলে টিম কিউকে "যেসব কাজ ফেল করলেও চলে" বলে ভাবতে শুরু করে, আর তখনই dead-letter queue-তে দশ হাজার জব জমে কেউ খেয়ালই করে না।

</Callout>

### যা কিউতে দেওয়া চলবে না

- **যা ইউজারের পরের ক্লিকেই দরকার।** প্রোফাইল ছবি আপলোডের পর যদি ইউজার সাথে সাথেই সেটা দেখতে চায়, তাহলে থাম্বনেইল async করলে UI-তে "processing" স্টেট বানাতে হবে — সেটা করার ইচ্ছা না থাকলে কাজটা sync-ই থাক।
- **যা ব্যর্থ হলে ইউজারকে ভিন্ন সিদ্ধান্ত নিতে হতো।** স্টক নেই — এটা ইমেইলে জানানোর জিনিস নয়, রেসপন্সে জানানোর জিনিস।
- **যা একটা read।** কিউ হলো কাজের জন্য, ডেটা আনার জন্য নয়। "async করে দিই" বলে একটা read-কে কিউতে পাঠিয়ে polling করাটা প্রায় সবসময়ই ভুল ডিজাইন।

## Queue না Stream

"মেসেজ কিউ" নামে দুটো আলাদা জিনিস বাজারে চলে, আর এদের গুলিয়ে ফেলাটা এই ডোমেইনের সবচেয়ে সাধারণ ডিজাইন ভুল।

**Work queue** — RabbitMQ, Amazon SQS, Redis list, Sidekiq, Celery। এখানে মেসেজ মানে "একটা কাজ, কেউ একজন করো"। একটা মেসেজ একজন consumer পায়; সে সফল হলে মেসেজটা **মুছে যায়**। consumer বাড়ালে throughput বাড়ে, কারণ সবাই একই তাক থেকে আলাদা আলাদা পার্সেল তোলে। মেসেজের কোনো ইতিহাস থাকে না — প্রক্রিয়া হয়ে গেলে সেটা আর নেই।

**Log / stream** — Kafka, Redis Streams, AWS Kinesis, Pulsar। এখানে মেসেজ মানে "একটা ঘটনা ঘটেছে, যার যার দরকার পড়ো"। মেসেজ কেউ পড়ে ফেললেও **মুছে যায় না** — retention পিরিয়ড (৭ দিন, ৩০ দিন, চিরকাল) পর্যন্ত থাকে। প্রতিটা consumer group নিজের **offset** রাখে, অর্থাৎ "আমি কতদূর পড়েছি"। ফলে পাঁচটা আলাদা সিস্টেম একই ইভেন্ট স্ট্রিম নিজের মতো করে পড়তে পারে, আর দরকার হলে offset পিছিয়ে দিয়ে পুরনো সব ইভেন্ট আবার **replay** করতে পারে।

| দিক                 | Work queue                | Log / stream                            |
| ------------------- | ------------------------- | --------------------------------------- |
| মেসেজের অর্থ        | "এই কাজটা করো"            | "এই ঘটনাটা ঘটেছে"                       |
| প্রক্রিয়ার পর      | মুছে যায়                 | retention শেষ না হওয়া পর্যন্ত থাকে     |
| একই মেসেজ কতজন পায় | একজন consumer             | প্রতিটা consumer group আলাদা করে        |
| স্কেল করার একক      | consumer সংখ্যা (যত খুশি) | partition সংখ্যা (উপরের সীমা)           |
| ordering            | সাধারণত নেই               | partition-এর ভেতরে কঠোর                 |
| replay              | নেই                       | offset পিছিয়ে দিলেই হয়                |
| উদাহরণ              | ইমেইল পাঠানো, PDF বানানো  | order-placed ইভেন্ট, CDC, অ্যানালিটিক্স |

<Mermaid
title="Competing consumers versus consumer groups"
code={`graph LR
  subgraph WQ["Work queue: one message, one worker"]
    Q["orders.email queue"] --> W1["worker-samarkand-01"]
    Q --> W2["worker-samarkand-02"]
    Q --> W3["worker-samarkand-03"]
  end
  subgraph LOG["Log: every group reads everything"]
    P0["partition 0"] --> G1["group: search-indexer"]
    P1["partition 1"] --> G1
    P0 --> G2["group: analytics"]
    P1 --> G2
    P0 --> G3["group: fraud-scoring"]
    P1 --> G3
  end`}
/>

### কোনটা কখন

- একটা কাজ, একবার হতে হবে, ইতিহাস দরকার নেই → **work queue**। ইমেইল, থাম্বনেইল, রিপোর্ট জেনারেশন, ওয়েবহুক ডেলিভারি।
- একটা ঘটনা, একাধিক ভোক্তা, আর ভবিষ্যতে নতুন ভোক্তা আসতে পারে → **log**। "অর্ডার প্লেসড" ইভেন্টটা আজ শুধু ওয়্যারহাউস পড়ে, ছয় মাস পর ফ্রড টিমও পড়বে — আর তারা গত ৩০ দিনের ইতিহাস দিয়ে শুরু করতে চাইবে।
- আগে থেকে জানেন না → work queue দিয়ে শুরু করুন। log-এর অপারেশনাল খরচ (partition planning, consumer group rebalancing, retention স্টোরেজ) অনেক বেশি, আর দরকার না হলে সেটা শুধু বোঝা।

<Callout type="info">

Log-এর সবচেয়ে কম আলোচিত সীমাবদ্ধতাটা হলো **partition সংখ্যাই আপনার সর্বোচ্চ parallelism**। একটা টপিকে ১২টা partition থাকলে একটা consumer group-এ ১২টার বেশি সক্রিয় consumer রাখার কোনো মানে নেই — ১৩ নম্বরটা খালি বসে থাকবে। work queue-তে এই সীমা নেই, ৫০০ worker চালালে ৫০০ জনই কাজ পায়। তাই Kafka বাছার সময় partition সংখ্যাটা একটা ক্ষমতা-পরিকল্পনার সিদ্ধান্ত, কনফিগের ডিফল্ট নয়।

</Callout>

## Worker ডিজাইন

worker লেখাটা দেখতে সহজ — একটা লুপ, একটা মেসেজ, একটা হ্যান্ডলার। বাস্তবে চারটে জায়গায় নতুন ইঞ্জিনিয়াররা প্রায় নিশ্চিতভাবে হোঁচট খায়।

### Prefetch আর concurrency

**Prefetch** (RabbitMQ-তে `basic_qos`, SQS-এ ব্যাচ সাইজ) হলো একজন worker একসাথে কতগুলো মেসেজ ব্রোকার থেকে টেনে রাখবে। **Concurrency** হলো সে একসাথে কতগুলো প্রক্রিয়া করবে।

prefetch খুব বেশি রাখলে একটা worker কিউয়ের অর্ধেক নিজের মেমরিতে টেনে নেয়, বাকি worker-রা খালি বসে থাকে, আর ওই worker ক্র্যাশ করলে ওই পুরো গোছাটা visibility timeout শেষ না হওয়া পর্যন্ত আটকে থাকে। prefetch খুব কম রাখলে (যেমন ১) প্রতিটা মেসেজের জন্য একটা করে নেটওয়ার্ক রাউন্ড ট্রিপ লাগে, আর ছোট ছোট দ্রুত জবে throughput ধসে যায়।

ব্যবহারিক নিয়ম: **prefetch ≈ concurrency, বা তার সামান্য বেশি**। জব যত লম্বা, prefetch তত কম (লম্বা জবে ১–২)। জব যত ছোট আর দ্রুত, prefetch তত বেশি (৫০–১০০ চলে)।

আর concurrency-র সংখ্যাটা জবের ধরন দিয়ে ঠিক হয়: I/O-বাউন্ড জব (HTTP কল, DB write) হলে CPU-র চেয়ে অনেক বেশি concurrency চলে; CPU-বাউন্ড জব (ইমেজ রিসাইজ, PDF রেন্ডার) হলে concurrency কোরের সংখ্যার আশেপাশেই রাখুন, নইলে শুধু context switch-এ সময় যাবে।

### Visibility timeout আর লম্বা কাজ

worker যখন একটা মেসেজ তুলে নেয়, ব্রোকার সেটা মুছে ফেলে না — লুকিয়ে রাখে, একটা নির্দিষ্ট সময়ের জন্য। এটাই **visibility timeout**। worker সময়মতো ack করলে মেসেজ মুছে যায়; না করলে মেসেজটা আবার দৃশ্যমান হয়ে যায় এবং অন্য কেউ তুলে নেয়। এভাবেই ক্র্যাশ হওয়া worker-এর কাজ হারায় না।

এখান থেকে সবচেয়ে সাধারণ প্রোডাকশন বাগটা জন্ম নেয়: **জবটা visibility timeout-এর চেয়ে বেশি সময় নেয়**। ৩০ সেকেন্ডের timeout, ৪৫ সেকেন্ডের ভিডিও ট্রান্সকোড — ৩০ সেকেন্ডে মেসেজটা আবার দৃশ্যমান হয়, দ্বিতীয় worker সেটা শুরু করে, প্রথম worker ৪৫ সেকেন্ডে শেষ করে ack করতে গিয়ে ব্যর্থ হয়, আর কাজটা অসীমভাবে দ্বিগুণ হতে থাকে। CPU দ্বিগুণ, ইমেইল দ্বিগুণ, চার্জ দ্বিগুণ।

দুটো সমাধান, দুটোই দরকার:

- **Heartbeat** — কাজ চলাকালীন worker পর্যায়ক্রমে visibility deadline বাড়িয়ে নেয় (SQS-এ `ChangeMessageVisibility`, নিজের Redis কিউতে zset-এর score আপডেট)। worker বেঁচে থাকলে সময় বাড়ে, মরে গেলে বাড়া বন্ধ হয় এবং কাজটা যথারীতি ফেরত যায়।
- **কাজ ভাঙা** — একটা তিন ঘণ্টার জব একটা জব নয়, একটা পাইপলাইন। সেটাকে ছোট ছোট ধাপে ভাঙুন যাতে প্রতিটা ধাপ আলাদা করে retry করা যায়। নইলে ২ ঘণ্টা ৫৯ মিনিটে ফেল করলে পুরোটা আবার শুরু।

### Poison message

**Poison message** হলো এমন মেসেজ যেটা যতবারই চেষ্টা করা হোক, সবসময় হ্যান্ডলারকে ক্র্যাশ করায় — একটা ম্যালফর্মড JSON, একটা null ফিল্ড যেটা কোড আশা করেনি, একটা রেফারেন্স যেটা ডিলিট হয়ে গেছে। বিপদটা হলো এই মেসেজটা retry হয়, আবার ক্র্যাশ করায়, আবার retry হয় — আর যদি কিউটা ordered হয়, পুরো কিউ ওখানেই আটকে যায়। এজন্যই attempt কাউন্ট আর dead-letter queue ঐচ্ছিক নয়।

<Callout type="tip">

worker-এর হ্যান্ডলারে দুই ধরনের ব্যর্থতা আলাদা করুন: **retriable** (নেটওয়ার্ক টাইমআউট, 503, DB deadlock) আর **permanent** (ভ্যালিডেশন ব্যর্থতা, 400, রেকর্ড নেই)। permanent হলে retry করে কোনো লাভ নেই — সরাসরি DLQ-তে পাঠান। এই একটা পার্থক্য না করলে আপনার retry বাজেটের ৯০% এমন জবে খরচ হবে যেগুলো কোনোদিনই সফল হবে না।

</Callout>

## Retry, backoff আর jitter

retry-র সরলতম রূপ — "ব্যর্থ হলে আবার চেষ্টা করো" — বড় সিস্টেমে সরাসরি ক্ষতিকর। একটা downstream সার্ভিস চাপে পড়ে ধীর হয়ে গেছে; আপনার সব worker টাইমআউট খাচ্ছে; সবাই সাথে সাথেই আবার চেষ্টা করছে; downstream-এর উপর চাপ এখন দ্বিগুণ। এই লুপটাই **retry storm**, আর এটা ছোট degradation-কে সম্পূর্ণ outage-এ পরিণত করে।

তিনটে জিনিস একসাথে লাগবে।

**Exponential backoff।** প্রতিটা ব্যর্থতার পর অপেক্ষার সময় দ্বিগুণ: ১s, ২s, ৪s, ৮s, ১৬s — একটা সর্বোচ্চ সীমা (cap) পর্যন্ত, সাধারণত ৫–১৫ মিনিট। এতে অসুস্থ downstream শ্বাস নেওয়ার জায়গা পায়।

**Jitter।** শুধু exponential backoff যথেষ্ট নয়, কারণ একই সময়ে ব্যর্থ হওয়া ১০,০০০ জব ঠিক একই সময়ে আবার চেষ্টা করবে — একটা synchronized ঢেউ। তাই সময়টা এলোমেলো করে দিতে হয়। সবচেয়ে ভালো পরিচিত রূপটা হলো **full jitter**:

```
base = 1000 ms
cap  = 300000 ms

backoff(attempt) = random_between(0, min(cap, base * 2^attempt))

attempt 1 → random in [0,   2s]
attempt 2 → random in [0,   4s]
attempt 3 → random in [0,   8s]
attempt 4 → random in [0,  16s]
attempt 7 → random in [0, 128s]
```

"Equal jitter" বা "decorrelated jitter"-ও চলে, কিন্তু full jitter সবচেয়ে সরল এবং ঢেউ ভাঙার কাজে সবচেয়ে কার্যকর। মূল কথাটা হলো — **jitter ছাড়া backoff অসম্পূর্ণ**।

**Retry budget।** প্রতি জবে সর্বোচ্চ চেষ্টা সীমিত করা (যেমন ৫) যথেষ্ট নয়, কারণ ১০ লাখ জব × ৫ চেষ্টা এখনো ৫০ লাখ কল। তাই একটা global সীমাও রাখুন: "মোট রিকোয়েস্টের ১০%-এর বেশি retry হতে পারবে না"। অনুপাত ছাড়িয়ে গেলে retry বন্ধ, জব সরাসরি DLQ বা পরে পুনরায় নির্ধারিত। এটাই আপনার সিস্টেমকে নিজের ঘাড়ে নিজে চড়ে বসা থেকে বাঁচায়।

<Callout type="warning">

retry শুধু তখনই নিরাপদ যখন হ্যান্ডলার **idempotent**। "ব্যর্থ হয়েছে" আর "সফল হয়েছে কিন্তু উত্তরটা হারিয়ে গেছে" — এই দুটো worker-এর দিক থেকে দেখতে একরকম। টাইমআউট হওয়া একটা পেমেন্ট কল হয়তো downstream-এ সফলভাবেই প্রক্রিয়া হয়েছে। idempotency ছাড়া retry মানে ইউজারকে দুবার চার্জ করা।

</Callout>

## Idempotency আর deduplication

কার্যত সব প্রোডাকশন মেসেজিং সিস্টেম **at-least-once delivery** দেয় — মেসেজ অন্তত একবার পৌঁছাবে, কখনো একাধিকবারও পৌঁছাতে পারে। কারণ ডুপ্লিকেট এড়ানোর একমাত্র বিকল্প হলো at-most-once, যেখানে মেসেজ হারাতেও পারে — আর অর্ডার হারানোর চেয়ে ডুপ্লিকেট অর্ডার সামলানো অনেক সহজ।

ডুপ্লিকেট আসে কোথা থেকে? তিনটে সাধারণ পথ: worker কাজ শেষ করে ack পাঠানোর ঠিক আগে ক্র্যাশ করল; ack-টা নেটওয়ার্কে হারিয়ে গেল; কাজটা visibility timeout ছাড়িয়ে গেল এবং মেসেজ পুনরায় দৃশ্যমান হলো। কোনোটাই বিরল নয়।

তাই দায়িত্বটা ব্রোকারের নয়, **হ্যান্ডলারের**: একই মেসেজ দ্বিতীয়বার এলে কোনো নতুন প্রভাব যেন না পড়ে।

### তিনটে কৌশল

**১. প্রাকৃতিকভাবে idempotent অপারেশন।** সবচেয়ে ভালো সমাধান — কোনো বাড়তি অবকাঠামো লাগে না। "স্ট্যাটাস `shipped` সেট করো" দুবার চললেও একই ফল। "কাউন্টার ১ বাড়াও" দুবার চললে ভুল ফল। যেখানে পারেন, absolute অপারেশন বাছুন, delta নয়।

**২. ডেটাবেসের unique constraint।** ট্র্যাকিং নম্বরটাকেই সত্যের উৎস বানান। জবের একটা স্থিতিশীল `idempotency_key` থাকবে (উদাহরণ: `invoice:order-8842`), আর টেবিলে সেটার উপর unique index। দ্বিতীয়বার insert করলে constraint ভায়োলেশন — সেটাকে "ইতিমধ্যে হয়ে গেছে" ধরে চুপচাপ সফল রিটার্ন করুন।

**৩. আলাদা dedup store।** Redis-এ `SET done:invoice:order-8842 1 NX EX 604800` — NX-এর কারণে প্রথমজনই জেতে, বাকিরা জানে কাজটা হয়ে গেছে। TTL-টা যথেষ্ট লম্বা রাখতে হবে, অন্তত আপনার সর্বোচ্চ retry উইন্ডোর চেয়ে বড় (৭ দিন একটা ভালো ডিফল্ট)।

<Callout type="info">

তৃতীয় কৌশলটায় একটা সূক্ষ্ম দৌড় লুকিয়ে আছে: dedup ফ্ল্যাগটা কি কাজের **আগে** বসাবেন না **পরে**? আগে বসালে worker মাঝপথে ক্র্যাশ করলে কাজটা কখনোই হবে না, কিন্তু সিস্টেম ভাববে হয়ে গেছে। পরে বসালে ক্র্যাশের ক্ষেত্রে কাজটা দুবার হতে পারে। বাস্তব সমাধান হলো তিন-অবস্থার মার্কার — কাজের আগে `in_progress` লিখুন (TTL সহ), শেষে `done`; আর `in_progress` অবস্থায় দ্বিতীয় কপি এলে সে ফিরে যায় এবং পরে চেষ্টা করে। নিখুঁত উত্তর হলো কৌশল ২ — প্রভাব আর মার্কার একই ট্রানজেকশনে লেখা।

</Callout>

মনে রাখবেন এই idempotency key-টা worker-স্তরের — এটা মেসেজের পরিচয়। HTTP API-তে ক্লায়েন্ট যে `Idempotency-Key` হেডার পাঠায়, সেটা একই ধারণার অন্য প্রয়োগ, আর সেটা আমরা পরের চ্যাপ্টারে API কনট্রাক্টের অংশ হিসেবে দেখব।

## Dead-letter queue: বানানো সহজ, চালানো কঠিন

সব রকম চেষ্টার পরও যে জব সফল হয় না, সেটা কোথাও যেতে হবে। সেই জায়গাটাই **dead-letter queue** — উঠোনের কোণের সেই "অপ্রেরণযোগ্য" তাক।

DLQ বানানো এক লাইনের কাজ। বেশিরভাগ টিম যেটা করে না সেটা হলো DLQ-কে একটা **অপারেশনাল বস্তু** হিসেবে গণ্য করা। তিনটে জিনিস ছাড়া DLQ শুধু একটা ময়লার ঝুড়ি:

**১. Alerting।** DLQ-র আকারের উপর নয়, **আকার বাড়ার হারের** উপর অ্যালার্ট দিন। ৩০০টা পুরনো জব পড়ে থাকা একটা টিকিট; ১০ মিনিটে ৩০০টা নতুন জব ঢোকা একটা ইনসিডেন্ট। প্রথমটা কাজের সারিতে যায়, দ্বিতীয়টা কাউকে ঘুম থেকে তোলে।

**২. Inspection।** DLQ-তে শুধু মূল payload রাখলে ডিবাগ করা অসম্ভব। প্রতিটা এন্ট্রির সাথে রাখুন: শেষ এররের বার্তা আর স্ট্যাক, মোট কতবার চেষ্টা হয়েছে, প্রথম ও শেষ চেষ্টার সময়, কোন worker চালিয়েছিল, আর trace id। একটা ছোট CLI বা অ্যাডমিন পেজ যেটা DLQ-র শেষ ৫০টা এন্ট্রি এররের ধরন অনুযায়ী গুছিয়ে দেখায় — সেটা আপনার সবচেয়ে বেশি ব্যবহৃত অপারেশনাল টুল হয়ে উঠবে।

**৩. Replay।** ঠিক করার পর জবগুলো ফেরত পাঠানোর একটা নিরাপদ পথ থাকতে হবে, আর সেটা হাতে চালানো স্ক্রিপ্ট নয়। replay-র তিনটে বৈশিষ্ট্য দরকার: **ফিল্টার করা যায়** (শুধু এই এররের জবগুলো, শুধু এই সময়সীমার), **রেট-লিমিটেড** (১০,০০০ জব একসাথে ফেরত দিলে যে সিস্টেমটা সবে সুস্থ হয়েছে সেটা আবার পড়ে যাবে), আর **attempt কাউন্টার রিসেট করে** যাতে জবটা এসেই আবার DLQ-তে ফিরে না যায়।

<Mermaid
title="Lifecycle of a job, including the dead-letter path"
code={`graph LR
  E["Enqueue"] --> R["ready queue"]
  R --> C["worker claims<br/>visibility deadline set"]
  C --> OK["handler succeeds"]
  OK --> A["ack, job deleted"]
  C --> F["handler fails"]
  F --> B["attempt below max<br/>schedule with backoff + jitter"]
  B --> D["delayed set"]
  D --> R
  F --> X["attempt at max<br/>or permanent error"]
  X --> DLQ["dead-letter queue"]
  DLQ --> I["inspect and fix"]
  I --> R
  C --> T["worker crashes<br/>deadline expires"]
  T --> R`}
/>

## Ordering আর per-key ordering

"মেসেজগুলো কি ক্রমে আসবে?" — এই প্রশ্নের সৎ উত্তর প্রায় সব কিউয়ের ক্ষেত্রে **না**। কারণ ordering আর parallelism পরস্পরবিরোধী: পাঁচজন সর্টার একসাথে কাজ করলে কে আগে শেষ করবে তার কোনো নিশ্চয়তা নেই। কঠোর global ordering মানে একজন consumer, অর্থাৎ কোনো parallelism নেই — আর সেটা প্রায় কখনোই আপনি চান না।

কিন্তু বাস্তবে আপনার global ordering দরকারও নেই। ইবনে সিনার প্রোফাইল আপডেট আর আল-বিরুনির প্রোফাইল আপডেট কোনটা আগে হলো তাতে কিছু যায় আসে না। যা দরকার তা হলো **per-key ordering** — একই ইউজারের ঘটনাগুলো নিজেদের মধ্যে ক্রমে থাকুক।

আর এটার সমাধানই partitioning: partition বাছা হয় একটা key-র hash দিয়ে।

```
partition = hash(user_id) mod partition_count
```

একই `user_id`-র সব ইভেন্ট সবসময় একই partition-এ যায়, আর একটা partition একটা consumer group-এর ভেতরে একজনই পড়ে — ফলে ওই ইউজারের ইভেন্টগুলো ক্রমে প্রক্রিয়া হয়। SQS FIFO-তে এই ধারণাটার নাম `MessageGroupId`, Kafka-তে এটাই মেসেজ key, RabbitMQ-তে consistent hash exchange দিয়ে একই জিনিস করা হয়।

দুটো ফাঁদ:

- **hot key।** একটা বিরাট টেন্যান্ট (ধরুন কর্ডোবার বিশ্ববিদ্যালয়ের অ্যাকাউন্ট) যদি ট্রাফিকের ৪০% হয়, তার সব ইভেন্ট একটাই partition-এ পড়বে, আর সেই partition-এর consumer পিছিয়ে পড়তে থাকবে বাকিরা খালি বসে থাকা সত্ত্বেও। প্রয়োজনে key-টা আরও সূক্ষ্ম করুন (`user_id` নয়, `user_id:document_id`)।
- **partition সংখ্যা বদলানো।** partition বাড়ালে hash-এর ম্যাপিং বদলে যায়, আর কিছুক্ষণের জন্য একই key দুটো partition-এ ছড়িয়ে পড়ে — মানে ওই সময়টুকু ordering-এর নিশ্চয়তা ভাঙে। তাই partition সংখ্যা শুরুতেই উদারভাবে রাখুন।

আরেকটা কৌশল আছে যেটা প্রায়ই ভুলে যাওয়া হয়: **ordering-এর দরকারই মুছে ফেলুন**। মেসেজে একটা ভার্সন বা টাইমস্ট্যাম্প রাখুন, আর হ্যান্ডলার লিখুন এমনভাবে যাতে পুরনো ভার্সন এলে সেটা উপেক্ষা করে। তখন ইভেন্ট এলোমেলো ক্রমে এলেও চূড়ান্ত অবস্থা ঠিক থাকে — আর আপনি partition-এর সব জটিলতা থেকে মুক্ত।

## Exactly-once একটা কল্পকাহিনি

মার্কেটিং পেজে "exactly-once delivery" লেখা থাকলে সেটা প্রায় সবসময়ই ভুল বা অসম্পূর্ণ। **ডেলিভারি** exactly-once হতে পারে না — এটা দুই জেনারেলের সমস্যার একটা রূপ। ব্রোকার মেসেজ পাঠাল, worker উত্তর দিল না; ব্রোকার জানে না worker কাজটা করে মরেছে না করার আগেই মরেছে। এই অনিশ্চয়তা দূর করার কোনো উপায় নেই, শুধু বেছে নিতে হয়: আবার পাঠাব (at-least-once, ডুপ্লিকেটের ঝুঁকি) নাকি পাঠাব না (at-most-once, হারানোর ঝুঁকি)।

তাহলে "exactly-once semantics" বলতে বাস্তবে কী বোঝায়? দুটো জিনিসের যেকোনো একটা।

**১. At-least-once delivery + idempotent effect।** মেসেজ বহুবার আসতে পারে, কিন্তু প্রভাব একবারই পড়ে। এটাই ৯৫% সিস্টেমে ব্যবহৃত সমাধান, আর এটা আসলে বেশ ভালো — শুধু ব্যাপারটা আপনার হ্যান্ডলারের দায়িত্ব, ব্রোকারের নয়।

**২. একটাই সিস্টেমের ভেতরে transactional offset commit।** Kafka যখন "exactly-once processing" বলে, তখন তারা এই কেসটার কথা বলে: consumer একটা Kafka টপিক থেকে পড়ে, প্রক্রিয়া করে, ফল আরেকটা Kafka টপিকে লেখে, আর **ফল লেখা ও offset কমিট একই ট্রানজেকশনে ঘটে**। যেহেতু দুটোই Kafka-র নিজের ভেতরে, atomicity সম্ভব। কিন্তু ফলটা যদি Kafka-র বাইরে যায় — আপনার Postgres-এ, একটা তৃতীয় পক্ষের ইমেইল API-তে — তাহলে গ্যারান্টিটা ওখানেই শেষ। ইমেইল প্রোভাইডার আপনার Kafka ট্রানজেকশনে অংশ নেয় না।

<Callout type="warning">

তাই ব্যবহারিক নিয়মটা সরল: **at-least-once ধরে নিন, আর হ্যান্ডলারকে idempotent বানান**। যে সিস্টেম "exactly-once আছে" ধরে নিয়ে idempotency বাদ দেয়, সেটা ঠিক ততক্ষণ কাজ করে যতক্ষণ প্রথম নেটওয়ার্ক পার্টিশন না ঘটে।

</Callout>

## Outbox pattern

এখন সবচেয়ে সূক্ষ্ম সমস্যাটা, যেটা প্রায় প্রতিটা event-driven সিস্টেম কোনো না কোনো সময় ভুল করে।

আপনার হ্যান্ডলারকে দুটো কাজ করতে হবে: ডেটাবেসে অর্ডার লেখা, আর একটা ইভেন্ট পাবলিশ করা। কিন্তু ডেটাবেস আর ব্রোকার দুটো আলাদা সিস্টেম — এদের মধ্যে কোনো যৌথ ট্রানজেকশন নেই। ফলে যে ক্রমেই লিখুন, একটা ফাঁক থেকে যায়:

- আগে DB, পরে publish — publish-এর আগে ক্র্যাশ করলে অর্ডার আছে কিন্তু কেউ জানে না। **হারানো ইভেন্ট।**
- আগে publish, পরে DB — DB write ফেল করলে সবাই জানে একটা অর্ডার হয়েছে যেটা আসলে নেই। **ভুতুড়ে ইভেন্ট**, যেটা আরও খারাপ।

সমাধান হলো **transactional outbox**: ইভেন্টটাকেও ডেটাবেসেরই একটা রো বানিয়ে ফেলুন, আর সেটা মূল ডেটার সাথে **একই ট্রানজেকশনে** লিখুন। তারপর একটা আলাদা relay প্রসেস ওই টেবিল থেকে পড়ে ব্রোকারে পাঠায়।

```sql
CREATE TABLE outbox (
  id            BIGSERIAL PRIMARY KEY,
  aggregate_id  TEXT        NOT NULL,
  event_type    TEXT        NOT NULL,
  payload       JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);

CREATE INDEX outbox_unpublished_idx
  ON outbox (id) WHERE published_at IS NULL;

-- Business write and event publication in ONE transaction.
BEGIN;

INSERT INTO orders (id, scholar, city, total_dirhams, status)
VALUES ('order-8842', 'ibn-sina', 'bukhara', 1450, 'placed');

INSERT INTO outbox (aggregate_id, event_type, payload)
VALUES (
  'order-8842',
  'order.placed',
  '{"orderId":"order-8842","scholar":"ibn-sina","city":"bukhara"}'
);

COMMIT;
```

relay-টা একটা ছোট লুপ। খেয়াল করুন `FOR UPDATE SKIP LOCKED` — এটাই একাধিক relay instance-কে একে অপরের রো না কেড়ে সমান্তরালে চালাতে দেয়।

```typescript
// outbox-relay.ts — runs as its own process, ideally more than one.
async function relayBatch(): Promise<number> {
	return db.transaction(async (tx) => {
		const rows = await tx.query(
			`SELECT id, aggregate_id, event_type, payload
			   FROM outbox
			  WHERE published_at IS NULL
			  ORDER BY id
			  LIMIT 200
			  FOR UPDATE SKIP LOCKED`
		);
		if (rows.length === 0) return 0;

		for (const row of rows) {
			// The broker sees the event at least once; downstream handlers
			// dedupe on this stable id.
			await broker.publish(row.event_type, row.payload, {
				idempotencyKey: `outbox:${row.id}`,
				partitionKey: row.aggregate_id
			});
		}

		await tx.query(`UPDATE outbox SET published_at = now() WHERE id = ANY($1)`, [
			rows.map((r) => r.id)
		]);
		return rows.length;
	});
}
```

publish সফল হওয়ার পর `published_at` আপডেট করার আগে relay ক্র্যাশ করলে ইভেন্টটা দ্বিতীয়বার পাবলিশ হবে — অর্থাৎ outbox at-least-once দেয়, exactly-once নয়। সেজন্যই আউটবক্স রো-র id দিয়ে বানানো `outbox:8842` জাতীয় কি-টা একটা স্থিতিশীল idempotency key, আর consumer সেটা দিয়েই dedupe করে। ঘুরেফিরে সেই একই উপসংহার।

<Callout type="tip">

relay নিজে না লিখে **CDC** ব্যবহার করাটা বড় সিস্টেমে বেশি প্রচলিত — Debezium বা AWS DMS ডেটাবেসের replication log পড়ে outbox টেবিলের নতুন রো সরাসরি Kafka-তে ঠেলে দেয়। সুবিধা: কোনো polling নেই, latency কম, আর relay-র নিজস্ব ব্যর্থতার পথটাও নেই। খরচ: আরেকটা চালানোর মতো সিস্টেম।

</Callout>

## Backpressure আর queue depth

throughput আর latency-র মেট্রিক দেখে অ্যাসিনক্রোনাস সিস্টেমের স্বাস্থ্য বোঝা যায় না। যে একটা সংখ্যা সব বলে দেয়, সেটা হলো **queue depth** — এই মুহূর্তে কতগুলো কাজ অপেক্ষায় আছে।

কারণ queue depth হলো producer rate আর consumer rate-এর পার্থক্যের সঞ্চয়। depth স্থিতিশীল মানে দুটো হার সমান — সিস্টেম সুস্থ। depth ক্রমাগত বাড়ছে মানে producer এগিয়ে আছে, আর সেটা **কখনো নিজে থেকে ঠিক হয় না**; হয় consumer বাড়াতে হবে, নয় producer কমাতে হবে।

তিনটে সংখ্যা একসাথে দেখুন:

| মেট্রিক             | কী বলে                                | অ্যালার্ট কখন                        |
| ------------------- | ------------------------------------- | ------------------------------------ |
| Queue depth         | এই মুহূর্তে কত কাজ বাকি               | নির্দিষ্ট সীমা ছাড়ালে               |
| Oldest message age  | সবচেয়ে পুরনো অপেক্ষমাণ কাজের বয়স    | SLO ছাড়ালে — এটাই সবচেয়ে ভালো সূচক |
| Consumer lag / rate | consumer কত পিছিয়ে, কত দ্রুত এগোচ্ছে | lag বাড়তে থাকলে                     |

**Oldest message age** সবচেয়ে ভালো, কারণ এটা সরাসরি ইউজারের অভিজ্ঞতার ভাষায় কথা বলে। ১০ লক্ষ জব থাকা একটা কিউ যদি ৩০ সেকেন্ডে খালি হয়, সেটা সমস্যা নয়। ৫০টা জব থাকা একটা কিউ যেখানে সবচেয়ে পুরনো জবটা ৪০ মিনিট ধরে পড়ে আছে — সেটা ভাঙা।

### Backpressure: কিউ ভরে গেলে কী করবেন

কিউ অসীম নয়, আর অসীম হলেও লাভ নেই — কারণ যে জব চার ঘণ্টা পরে চলবে সেটা প্রায়ই আর কারো কাজেই লাগে না। তাই আগে থেকেই ঠিক করে রাখতে হয় কিউ ভরে গেলে কী হবে:

- **Producer-কে ধীর করা।** কিউ depth সীমা ছাড়ালে API 429 ফেরত দেয়। কঠোর, কিন্তু সৎ।
- **Load shedding।** কম গুরুত্বের জব ফেলে দেওয়া। রেকমেন্ডেশন মডেল আপডেটের জব চাপের সময় বাদ দেওয়া যায়; পেমেন্ট রিকনসিলিয়েশনের জব যায় না।
- **অগ্রাধিকার অনুযায়ী আলাদা কিউ।** একটা কিউ নয়, তিনটে: critical, default, bulk। worker-রা আগে critical দেখে। এতে একটা bulk ব্যাকফিল কখনোই পাসওয়ার্ড রিসেট ইমেইলকে আটকাতে পারে না। এটাই সবচেয়ে বেশি কাজে লাগে, আর একটা বিশাল ব্যাকফিল চালানোর আগেই এটা থাকা উচিত।
- **Autoscaling।** queue depth বা oldest message age দেখে worker সংখ্যা বাড়ানো। কিন্তু মনে রাখুন — worker বাড়ালে চাপটা downstream-এ সরে যায়। ৫০ থেকে ৫০০ worker করলে আপনার ডেটাবেস ১০ গুণ কানেকশন পাবে, আর সেটা সামলাতে পারবে কিনা সেটা আলাদা প্রশ্ন।

## Scheduled আর delayed job

দুটো জিনিস আলাদা, আর গুলিয়ে ফেলাটা সাধারণ।

**Delayed job** — একটা নির্দিষ্ট জব ভবিষ্যতের একটা সময়ে চলবে। "কার্ট ছেড়ে যাওয়ার ২৪ ঘণ্টা পর রিমাইন্ডার", "৩০ মিনিট পর পেমেন্ট স্ট্যাটাস আবার দেখো", "backoff-এর পর retry"। ইমপ্লিমেন্টেশনটা প্রায় সবসময় একই — একটা sorted set যার score হলো `runAt` টাইমস্ট্যাম্প, আর একটা ছোট প্রসেস যেটা প্রতি সেকেন্ডে due হয়ে যাওয়া জবগুলো তুলে ready কিউতে ঠেলে দেয়। SQS-এর `DelaySeconds` (সর্বোচ্চ ১৫ মিনিট) বা RabbitMQ-র delayed exchange প্লাগইনও একই কাজ করে, তবে সীমা সহ।

**Scheduled / periodic job** — একটা কাজ বারবার চলবে, একটা ক্রন এক্সপ্রেশন অনুযায়ী। "প্রতি রাত ২টায় রিপোর্ট", "প্রতি ৫ মিনিটে সিঙ্ক"। এখানে বাড়তি সমস্যাটা হলো **কে চালাবে** — ১০টা instance চললে ১০টাই ২টা বাজে জেগে উঠবে এবং একই রিপোর্ট ১০ বার বানাবে। সমাধান দুটো: একটা distributed lock (`SET cron:nightly-report token NX EX 300` — যে জেতে সেই চালায়), অথবা প্ল্যাটফর্মের নিজস্ব শিডিউলার (Kubernetes CronJob, EventBridge Scheduler) যেটা নিজেই একবারই ট্রিগার করে।

<Callout type="warning">

periodic job-এ **সবসময় একটা lock TTL আর একটা overlap নীতি রাখুন**। ৫ মিনিটের সিঙ্ক জব যদি কোনো এক দিন ৭ মিনিট নেয়, তাহলে পরের রানটা আগেরটার উপর চড়ে বসবে — আর দুটো মিলে ডেটাবেসে এমন একটা race তৈরি করবে যেটা ডিবাগ করতে আপনার একটা সপ্তাহ যাবে। স্পষ্টভাবে ঠিক করুন: overlap হলে নতুনটা বাদ যাবে (skip), না আগেরটা মারা হবে (kill)। ডিফল্টটা প্রায় সবসময় skip।

</Callout>

## একটা প্রোডাকশন-গ্রেড job queue

নিচের ইমপ্লিমেন্টেশনে এই চ্যাপ্টারের সবকিছু একসাথে আছে: Redis-ভিত্তিক durable কিউ, visibility timeout সহ at-least-once ডেলিভারি, heartbeat, bounded concurrency, full jitter সহ exponential backoff, দুই স্তরের dedup (enqueue আর handler), dead-letter queue-র inspect ও replay, graceful shutdown, আর queue depth মেট্রিক।

<CodeTabs tsFile="job-queue.ts" goFile="job_queue.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Job {
	id: string;
	name: string;
	payload: unknown;
	attempt: number;
	maxAttempts: number;
	idempotencyKey?: string;
	enqueuedAt: number;
	lastError?: string;
	claimedBy?: string;
}

export interface EnqueueOptions {
	maxAttempts?: number;
	delayMs?: number;
	/** Same key within dedupWindowMs enqueues only once. */
	dedupKey?: string;
	dedupWindowMs?: number;
	/** Stable key that makes the handler effect idempotent. */
	idempotencyKey?: string;
}

export interface QueueDepth {
	ready: number;
	delayed: number;
	inFlight: number;
	dead: number;
	oldestReadyAgeMs: number;
}

/** Throw this to skip retries and dead-letter the job immediately. */
export class PermanentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PermanentError';
	}
}

export type Handler = (job: Job) => Promise<void>;

// ---------------------------------------------------------------------------
// Lua scripts — every multi-step Redis mutation must be atomic
// ---------------------------------------------------------------------------

// Claim one ready job and put it in the in-flight set with a deadline.
const CLAIM = `
local job = redis.call('RPOP', KEYS[1])
if not job then return nil end
redis.call('ZADD', KEYS[2], ARGV[1], job)
return job
`;

// Move every delayed job whose runAt has passed into the ready list.
const PROMOTE = `
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[2]))
for i = 1, #due do
  redis.call('LPUSH', KEYS[2], due[i])
  redis.call('ZREM', KEYS[1], due[i])
end
return #due
`;

// Replace an in-flight member with a rewritten one (retry / heartbeat).
const REPLACE = `
redis.call('ZREM', KEYS[1], ARGV[1])
if ARGV[4] == 'delayed' then
  redis.call('ZADD', KEYS[2], ARGV[3], ARGV[2])
elseif ARGV[4] == 'dead' then
  redis.call('LPUSH', KEYS[3], ARGV[2])
elseif ARGV[4] == 'inflight' then
  redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
end
return 1
`;

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export class JobQueue {
	private readonly kReady: string;
	private readonly kDelayed: string;
	private readonly kInFlight: string;
	private readonly kDead: string;

	constructor(
		private readonly redis: Redis,
		private readonly namespace = 'damascus'
	) {
		this.kReady = `jq:${namespace}:ready`;
		this.kDelayed = `jq:${namespace}:delayed`;
		this.kInFlight = `jq:${namespace}:inflight`;
		this.kDead = `jq:${namespace}:dead`;

		this.redis.defineCommand('jqClaim', { numberOfKeys: 2, lua: CLAIM });
		this.redis.defineCommand('jqPromote', { numberOfKeys: 2, lua: PROMOTE });
		this.redis.defineCommand('jqReplace', { numberOfKeys: 3, lua: REPLACE });
	}

	/**
	 * Enqueue a job. Returns null when dedupKey suppressed a duplicate.
	 */
	async enqueue(name: string, payload: unknown, opts: EnqueueOptions = {}): Promise<Job | null> {
		if (opts.dedupKey) {
			const ttl = Math.ceil((opts.dedupWindowMs ?? 3_600_000) / 1000);
			const won = await this.redis.set(
				`jq:${this.namespace}:dedup:${opts.dedupKey}`,
				'1',
				'EX',
				ttl,
				'NX'
			);
			if (won === null) return null; // already enqueued recently
		}

		const job: Job = {
			id: randomUUID(),
			name,
			payload,
			attempt: 0,
			maxAttempts: opts.maxAttempts ?? 5,
			idempotencyKey: opts.idempotencyKey,
			enqueuedAt: Date.now()
		};

		const body = JSON.stringify(job);
		if (opts.delayMs && opts.delayMs > 0) {
			await this.redis.zadd(this.kDelayed, Date.now() + opts.delayMs, body);
		} else {
			await this.redis.lpush(this.kReady, body);
		}
		return job;
	}

	/** Claim one job, hiding it for visibilityMs. */
	async claim(workerId: string, visibilityMs: number): Promise<{ job: Job; raw: string } | null> {
		const deadline = Date.now() + visibilityMs;
		// @ts-expect-error defineCommand is dynamic
		const raw: string | null = await this.redis.jqClaim(this.kReady, this.kInFlight, deadline);
		if (!raw) return null;

		const job = JSON.parse(raw) as Job;
		job.claimedBy = workerId;
		return { job, raw };
	}

	/** Job succeeded: drop it from the in-flight set. */
	async ack(raw: string): Promise<void> {
		await this.redis.zrem(this.kInFlight, raw);
	}

	/** Extend the visibility deadline of a long-running job. */
	async heartbeat(raw: string, visibilityMs: number): Promise<void> {
		// @ts-expect-error defineCommand is dynamic
		await this.redis.jqReplace(
			this.kInFlight,
			this.kDelayed,
			this.kDead,
			raw,
			raw,
			Date.now() + visibilityMs,
			'inflight'
		);
	}

	/** Job failed: reschedule with backoff, or dead-letter it. */
	async fail(raw: string, job: Job, err: unknown, permanent: boolean): Promise<'retry' | 'dead'> {
		const next: Job = {
			...job,
			attempt: job.attempt + 1,
			lastError: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
		};
		const body = JSON.stringify(next);

		if (permanent || next.attempt >= next.maxAttempts) {
			// @ts-expect-error defineCommand is dynamic
			await this.redis.jqReplace(this.kInFlight, this.kDelayed, this.kDead, raw, body, 0, 'dead');
			return 'dead';
		}

		const runAt = Date.now() + fullJitterBackoff(next.attempt);
		// @ts-expect-error defineCommand is dynamic
		await this.redis.jqReplace(
			this.kInFlight,
			this.kDelayed,
			this.kDead,
			raw,
			body,
			runAt,
			'delayed'
		);
		return 'retry';
	}

	/** Move due delayed jobs to ready; recover jobs whose worker died. */
	async reap(batch = 200): Promise<{ promoted: number; recovered: number }> {
		const now = Date.now();
		// @ts-expect-error defineCommand is dynamic
		const promoted: number = await this.redis.jqPromote(this.kDelayed, this.kReady, now, batch);

		const expired = await this.redis.zrangebyscore(this.kInFlight, '-inf', now, 'LIMIT', 0, batch);
		for (const raw of expired) {
			const job = JSON.parse(raw) as Job;
			await this.fail(raw, job, new Error('visibility timeout expired'), false);
		}
		if (expired.length > 0) {
			console.warn(`[jq] recovered ${expired.length} jobs from dead workers`);
		}
		return { promoted, recovered: expired.length };
	}

	// --- Dead-letter operations -------------------------------------------

	async inspectDead(limit = 50): Promise<Job[]> {
		const raws = await this.redis.lrange(this.kDead, 0, limit - 1);
		return raws.map((r) => JSON.parse(r) as Job);
	}

	/**
	 * Replay dead jobs back onto the ready queue, filtered and rate limited.
	 * Attempt counters are reset so a replayed job is not instantly dead again.
	 */
	async replayDead(opts: { limit?: number; match?: (job: Job) => boolean } = {}): Promise<number> {
		const limit = opts.limit ?? 100;
		let moved = 0;

		for (let i = 0; i < limit; i++) {
			const raw = await this.redis.rpop(this.kDead);
			if (!raw) break;

			const job = JSON.parse(raw) as Job;
			if (opts.match && !opts.match(job)) {
				await this.redis.lpush(this.kDead, raw); // put it back untouched
				continue;
			}

			job.attempt = 0;
			delete job.lastError;
			await this.redis.lpush(this.kReady, JSON.stringify(job));
			moved++;
		}
		console.log(`[jq] replayed ${moved} jobs from the dead-letter queue`);
		return moved;
	}

	async depth(): Promise<QueueDepth> {
		const [ready, delayed, inFlight, dead, head] = await Promise.all([
			this.redis.llen(this.kReady),
			this.redis.zcard(this.kDelayed),
			this.redis.zcard(this.kInFlight),
			this.redis.llen(this.kDead),
			this.redis.lindex(this.kReady, -1)
		]);

		let oldest = 0;
		if (head) oldest = Date.now() - (JSON.parse(head) as Job).enqueuedAt;
		return { ready, delayed, inFlight, dead, oldestReadyAgeMs: oldest };
	}

	dedupStoreKey(key: string): string {
		return `jq:${this.namespace}:done:${key}`;
	}
}

/** Full jitter: random in [0, min(cap, base * 2^attempt)]. */
export function fullJitterBackoff(attempt: number, baseMs = 1000, capMs = 300_000): number {
	const window = Math.min(capMs, baseMs * 2 ** attempt);
	return Math.floor(Math.random() * window);
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export interface WorkerOptions {
	workerId: string;
	concurrency: number;
	visibilityMs: number;
	heartbeatMs: number;
	idleSleepMs: number;
	idempotencyTtlSec: number;
}

export class Worker {
	private running = false;
	private active = new Set<Promise<void>>();

	constructor(
		private readonly queue: JobQueue,
		private readonly redis: Redis,
		private readonly handlers: Record<string, Handler>,
		private readonly opts: WorkerOptions
	) {}

	async start(): Promise<void> {
		this.running = true;
		console.log(`[jq] ${this.opts.workerId} started, concurrency=${this.opts.concurrency}`);

		while (this.running) {
			if (this.active.size >= this.opts.concurrency) {
				await Promise.race(this.active);
				continue;
			}

			const claimed = await this.queue.claim(this.opts.workerId, this.opts.visibilityMs);
			if (!claimed) {
				await sleep(this.opts.idleSleepMs);
				continue;
			}

			const task = this.run(claimed.job, claimed.raw).finally(() => this.active.delete(task));
			this.active.add(task);
		}
	}

	/** Stop claiming, then wait for in-flight jobs to finish. */
	async shutdown(graceMs = 30_000): Promise<void> {
		console.log(`[jq] ${this.opts.workerId} draining ${this.active.size} in-flight jobs`);
		this.running = false;

		const deadline = Date.now() + graceMs;
		while (this.active.size > 0 && Date.now() < deadline) {
			await Promise.race([...this.active, sleep(200)]);
		}
		if (this.active.size > 0) {
			console.warn(`[jq] ${this.active.size} jobs still running; they will be redelivered`);
		}
	}

	private async run(job: Job, raw: string): Promise<void> {
		const handler = this.handlers[job.name];
		if (!handler) {
			await this.queue.fail(raw, job, new PermanentError(`no handler for ${job.name}`), true);
			return;
		}

		// Handler-level idempotency: a replayed job becomes a no-op.
		if (job.idempotencyKey) {
			const key = this.queue.dedupStoreKey(job.idempotencyKey);
			const won = await this.redis.set(
				key,
				this.opts.workerId,
				'EX',
				this.opts.idempotencyTtlSec,
				'NX'
			);
			if (won === null) {
				console.log(`[jq] job ${job.id} (${job.idempotencyKey}) already applied, skipping`);
				await this.queue.ack(raw);
				return;
			}
		}

		const beat = setInterval(() => {
			void this.queue.heartbeat(raw, this.opts.visibilityMs).catch(() => {});
		}, this.opts.heartbeatMs);

		const startedAt = Date.now();
		try {
			await handler(job);
			await this.queue.ack(raw);
			console.log(`[jq] ok ${job.name} ${job.id} in ${Date.now() - startedAt}ms`);
		} catch (err) {
			const permanent = err instanceof PermanentError;
			// Effect did not happen: release the idempotency marker so a retry can run.
			if (job.idempotencyKey && !permanent) {
				await this.redis.del(this.queue.dedupStoreKey(job.idempotencyKey));
			}
			const outcome = await this.queue.fail(raw, job, err, permanent);
			console.error(`[jq] ${outcome} ${job.name} ${job.id} attempt=${job.attempt + 1}:`, err);
		} finally {
			clearInterval(beat);
		}
	}
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const redis = new Redis(process.env.REDIS_URL ?? 'redis://queue.cordoba.internal:6379');
const queue = new JobQueue(redis, 'damascus');

const handlers: Record<string, Handler> = {
	'dispatch.parcel': async (job) => {
		const p = job.payload as { parcelId: string; recipient: string; city: string };
		if (!p.city) throw new PermanentError(`parcel ${p.parcelId} has no destination city`);
		console.log(`[dispatch] parcel ${p.parcelId} to ${p.recipient} in ${p.city}`);
	},

	'send.receipt-email': async (job) => {
		const p = job.payload as { orderId: string; scholar: string };
		console.log(`[email] receipt for ${p.orderId} to ${p.scholar}`);
	}
};

const worker = new Worker(queue, redis, handlers, {
	workerId: 'worker-samarkand-03',
	concurrency: 8,
	visibilityMs: 30_000,
	heartbeatMs: 10_000,
	idleSleepMs: 250,
	idempotencyTtlSec: 7 * 24 * 3600
});

// One reaper per deployment is enough; the Lua scripts make it safe to run more.
const reaper = setInterval(() => {
	void queue.reap().catch((err) => console.error('[jq] reap failed:', err));
}, 1000);

const metrics = setInterval(async () => {
	const d = await queue.depth();
	console.log(
		`[jq] ready=${d.ready} delayed=${d.delayed} inflight=${d.inFlight} ` +
			`dead=${d.dead} oldest_ready=${Math.round(d.oldestReadyAgeMs / 1000)}s`
	);
}, 15_000);

process.on('SIGTERM', async () => {
	clearInterval(reaper);
	clearInterval(metrics);
	await worker.shutdown(30_000);
	await redis.quit();
	process.exit(0);
});

await queue.enqueue(
	'dispatch.parcel',
	{ parcelId: 'DMS-4471', recipient: 'al-biruni', city: 'bukhara' },
	{ idempotencyKey: 'parcel:DMS-4471', dedupKey: 'parcel:DMS-4471', maxAttempts: 5 }
);

await worker.start();
```

</div>
<div class="ct-panel" data-lang="go">

```go
package jobqueue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"math/rand"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Job struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	Payload        json.RawMessage `json:"payload"`
	Attempt        int             `json:"attempt"`
	MaxAttempts    int             `json:"maxAttempts"`
	IdempotencyKey string          `json:"idempotencyKey,omitempty"`
	EnqueuedAt     int64           `json:"enqueuedAt"`
	LastError      string          `json:"lastError,omitempty"`
	ClaimedBy      string          `json:"claimedBy,omitempty"`
}

type EnqueueOptions struct {
	MaxAttempts    int
	Delay          time.Duration
	DedupKey       string
	DedupWindow    time.Duration
	IdempotencyKey string
}

type Depth struct {
	Ready      int64
	Delayed    int64
	InFlight   int64
	Dead       int64
	OldestReady time.Duration
}

// PermanentError skips retries and dead-letters the job immediately.
type PermanentError struct{ Reason string }

func (e *PermanentError) Error() string { return "permanent: " + e.Reason }

type Handler func(ctx context.Context, job Job) error

// ---------------------------------------------------------------------------
// Lua scripts — every multi-step Redis mutation must be atomic
// ---------------------------------------------------------------------------

var claimScript = redis.NewScript(`
local job = redis.call('RPOP', KEYS[1])
if not job then return nil end
redis.call('ZADD', KEYS[2], ARGV[1], job)
return job
`)

var promoteScript = redis.NewScript(`
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[2]))
for i = 1, #due do
  redis.call('LPUSH', KEYS[2], due[i])
  redis.call('ZREM', KEYS[1], due[i])
end
return #due
`)

var replaceScript = redis.NewScript(`
redis.call('ZREM', KEYS[1], ARGV[1])
if ARGV[4] == 'delayed' then
  redis.call('ZADD', KEYS[2], ARGV[3], ARGV[2])
elseif ARGV[4] == 'dead' then
  redis.call('LPUSH', KEYS[3], ARGV[2])
elseif ARGV[4] == 'inflight' then
  redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
end
return 1
`)

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

type Queue struct {
	rdb       *redis.Client
	namespace string

	kReady    string
	kDelayed  string
	kInFlight string
	kDead     string
}

func New(rdb *redis.Client, namespace string) *Queue {
	return &Queue{
		rdb:       rdb,
		namespace: namespace,
		kReady:    fmt.Sprintf("jq:%s:ready", namespace),
		kDelayed:  fmt.Sprintf("jq:%s:delayed", namespace),
		kInFlight: fmt.Sprintf("jq:%s:inflight", namespace),
		kDead:     fmt.Sprintf("jq:%s:dead", namespace),
	}
}

func (q *Queue) DedupStoreKey(key string) string {
	return fmt.Sprintf("jq:%s:done:%s", q.namespace, key)
}

// Enqueue adds a job. Returns ok=false when DedupKey suppressed a duplicate.
func (q *Queue) Enqueue(ctx context.Context, name string, payload any, opts EnqueueOptions) (*Job, bool, error) {
	if opts.DedupKey != "" {
		window := opts.DedupWindow
		if window == 0 {
			window = time.Hour
		}
		won, err := q.rdb.SetNX(ctx, fmt.Sprintf("jq:%s:dedup:%s", q.namespace, opts.DedupKey), 1, window).Result()
		if err != nil {
			return nil, false, err
		}
		if !won {
			return nil, false, nil
		}
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, false, err
	}

	maxAttempts := opts.MaxAttempts
	if maxAttempts == 0 {
		maxAttempts = 5
	}

	job := Job{
		ID:             uuid.NewString(),
		Name:           name,
		Payload:        raw,
		Attempt:        0,
		MaxAttempts:    maxAttempts,
		IdempotencyKey: opts.IdempotencyKey,
		EnqueuedAt:     time.Now().UnixMilli(),
	}

	body, err := json.Marshal(job)
	if err != nil {
		return nil, false, err
	}

	if opts.Delay > 0 {
		runAt := float64(time.Now().Add(opts.Delay).UnixMilli())
		err = q.rdb.ZAdd(ctx, q.kDelayed, redis.Z{Score: runAt, Member: body}).Err()
	} else {
		err = q.rdb.LPush(ctx, q.kReady, body).Err()
	}
	return &job, err == nil, err
}

// Claim takes one ready job and hides it for the visibility window.
func (q *Queue) Claim(ctx context.Context, workerID string, visibility time.Duration) (*Job, string, error) {
	deadline := time.Now().Add(visibility).UnixMilli()

	res, err := claimScript.Run(ctx, q.rdb, []string{q.kReady, q.kInFlight}, deadline).Text()
	if errors.Is(err, redis.Nil) {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", err
	}

	var job Job
	if err := json.Unmarshal([]byte(res), &job); err != nil {
		// Unparseable member: park it in the dead-letter queue right away.
		q.rdb.ZRem(ctx, q.kInFlight, res)
		q.rdb.LPush(ctx, q.kDead, res)
		return nil, "", nil
	}
	job.ClaimedBy = workerID
	return &job, res, nil
}

// Ack removes a completed job from the in-flight set.
func (q *Queue) Ack(ctx context.Context, raw string) error {
	return q.rdb.ZRem(ctx, q.kInFlight, raw).Err()
}

// Heartbeat extends the visibility deadline of a long-running job.
func (q *Queue) Heartbeat(ctx context.Context, raw string, visibility time.Duration) error {
	deadline := time.Now().Add(visibility).UnixMilli()
	return replaceScript.Run(ctx, q.rdb,
		[]string{q.kInFlight, q.kDelayed, q.kDead},
		raw, raw, deadline, "inflight",
	).Err()
}

// Fail reschedules with backoff, or dead-letters the job.
func (q *Queue) Fail(ctx context.Context, raw string, job Job, cause error, permanent bool) (string, error) {
	next := job
	next.Attempt = job.Attempt + 1
	next.LastError = cause.Error()

	body, err := json.Marshal(next)
	if err != nil {
		return "", err
	}

	if permanent || next.Attempt >= next.MaxAttempts {
		err = replaceScript.Run(ctx, q.rdb,
			[]string{q.kInFlight, q.kDelayed, q.kDead},
			raw, body, 0, "dead",
		).Err()
		return "dead", err
	}

	runAt := time.Now().Add(FullJitterBackoff(next.Attempt, time.Second, 5*time.Minute)).UnixMilli()
	err = replaceScript.Run(ctx, q.rdb,
		[]string{q.kInFlight, q.kDelayed, q.kDead},
		raw, body, runAt, "delayed",
	).Err()
	return "retry", err
}

// Reap promotes due delayed jobs and recovers jobs from dead workers.
func (q *Queue) Reap(ctx context.Context, batch int) (int64, int, error) {
	now := time.Now().UnixMilli()

	promoted, err := promoteScript.Run(ctx, q.rdb, []string{q.kDelayed, q.kReady}, now, batch).Int64()
	if err != nil {
		return 0, 0, err
	}

	expired, err := q.rdb.ZRangeByScore(ctx, q.kInFlight, &redis.ZRangeBy{
		Min: "-inf", Max: fmt.Sprintf("%d", now), Count: int64(batch),
	}).Result()
	if err != nil {
		return promoted, 0, err
	}

	for _, raw := range expired {
		var job Job
		if err := json.Unmarshal([]byte(raw), &job); err != nil {
			continue
		}
		if _, err := q.Fail(ctx, raw, job, errors.New("visibility timeout expired"), false); err != nil {
			log.Printf("[jq] requeue failed for %s: %v", job.ID, err)
		}
	}
	if len(expired) > 0 {
		log.Printf("[jq] recovered %d jobs from dead workers", len(expired))
	}
	return promoted, len(expired), nil
}

// --- Dead-letter operations ------------------------------------------------

func (q *Queue) InspectDead(ctx context.Context, limit int64) ([]Job, error) {
	raws, err := q.rdb.LRange(ctx, q.kDead, 0, limit-1).Result()
	if err != nil {
		return nil, err
	}
	jobs := make([]Job, 0, len(raws))
	for _, raw := range raws {
		var job Job
		if err := json.Unmarshal([]byte(raw), &job); err == nil {
			jobs = append(jobs, job)
		}
	}
	return jobs, nil
}

// ReplayDead pushes dead jobs back onto the ready queue, filtered and bounded.
// Attempt counters are reset so a replayed job is not instantly dead again.
func (q *Queue) ReplayDead(ctx context.Context, limit int, match func(Job) bool) (int, error) {
	moved := 0
	for i := 0; i < limit; i++ {
		raw, err := q.rdb.RPop(ctx, q.kDead).Result()
		if errors.Is(err, redis.Nil) {
			break
		}
		if err != nil {
			return moved, err
		}

		var job Job
		if err := json.Unmarshal([]byte(raw), &job); err != nil {
			continue
		}
		if match != nil && !match(job) {
			q.rdb.LPush(ctx, q.kDead, raw) // put it back untouched
			continue
		}

		job.Attempt = 0
		job.LastError = ""
		body, err := json.Marshal(job)
		if err != nil {
			continue
		}
		if err := q.rdb.LPush(ctx, q.kReady, body).Err(); err != nil {
			return moved, err
		}
		moved++
	}
	log.Printf("[jq] replayed %d jobs from the dead-letter queue", moved)
	return moved, nil
}

func (q *Queue) Depth(ctx context.Context) (Depth, error) {
	var d Depth
	pipe := q.rdb.Pipeline()
	ready := pipe.LLen(ctx, q.kReady)
	delayed := pipe.ZCard(ctx, q.kDelayed)
	inflight := pipe.ZCard(ctx, q.kInFlight)
	dead := pipe.LLen(ctx, q.kDead)
	head := pipe.LIndex(ctx, q.kReady, -1)
	if _, err := pipe.Exec(ctx); err != nil && !errors.Is(err, redis.Nil) {
		return d, err
	}

	d.Ready, d.Delayed, d.InFlight, d.Dead = ready.Val(), delayed.Val(), inflight.Val(), dead.Val()
	if raw := head.Val(); raw != "" {
		var job Job
		if err := json.Unmarshal([]byte(raw), &job); err == nil {
			d.OldestReady = time.Since(time.UnixMilli(job.EnqueuedAt))
		}
	}
	return d, nil
}

// FullJitterBackoff returns a random duration in [0, min(maxDelay, base * 2^attempt)].
func FullJitterBackoff(attempt int, base, maxDelay time.Duration) time.Duration {
	window := float64(base) * math.Pow(2, float64(attempt))
	if window > float64(maxDelay) {
		window = float64(maxDelay)
	}
	return time.Duration(rand.Int63n(int64(window)))
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

type WorkerOptions struct {
	WorkerID       string
	Concurrency    int
	Visibility     time.Duration
	HeartbeatEvery time.Duration
	IdleSleep      time.Duration
	IdempotencyTTL time.Duration
}

type Worker struct {
	q        *Queue
	rdb      *redis.Client
	handlers map[string]Handler
	opts     WorkerOptions

	slots chan struct{}
	wg    sync.WaitGroup
}

func NewWorker(q *Queue, rdb *redis.Client, handlers map[string]Handler, opts WorkerOptions) *Worker {
	return &Worker{
		q:        q,
		rdb:      rdb,
		handlers: handlers,
		opts:     opts,
		slots:    make(chan struct{}, opts.Concurrency),
	}
}

// Run claims jobs until ctx is cancelled, then waits for in-flight work.
func (w *Worker) Run(ctx context.Context) {
	log.Printf("[jq] %s started, concurrency=%d", w.opts.WorkerID, w.opts.Concurrency)

	for {
		select {
		case <-ctx.Done():
			log.Printf("[jq] %s draining in-flight jobs", w.opts.WorkerID)
			w.wg.Wait()
			log.Printf("[jq] %s drained", w.opts.WorkerID)
			return
		case w.slots <- struct{}{}:
		}

		// Claim with a background context so shutdown does not abort a claim.
		job, raw, err := w.q.Claim(context.Background(), w.opts.WorkerID, w.opts.Visibility)
		if err != nil || job == nil {
			<-w.slots
			if err != nil {
				log.Printf("[jq] claim failed: %v", err)
			}
			time.Sleep(w.opts.IdleSleep)
			continue
		}

		w.wg.Add(1)
		go func(job Job, raw string) {
			defer w.wg.Done()
			defer func() { <-w.slots }()
			w.process(job, raw)
		}(*job, raw)
	}
}

func (w *Worker) process(job Job, raw string) {
	// Detached context: an in-flight job finishes even during shutdown.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	handler, ok := w.handlers[job.Name]
	if !ok {
		w.q.Fail(ctx, raw, job, &PermanentError{Reason: "no handler for " + job.Name}, true)
		return
	}

	// Handler-level idempotency: a replayed job becomes a no-op.
	if job.IdempotencyKey != "" {
		won, err := w.rdb.SetNX(ctx, w.q.DedupStoreKey(job.IdempotencyKey), w.opts.WorkerID, w.opts.IdempotencyTTL).Result()
		if err == nil && !won {
			log.Printf("[jq] job %s (%s) already applied, skipping", job.ID, job.IdempotencyKey)
			w.q.Ack(ctx, raw)
			return
		}
	}

	stop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(w.opts.HeartbeatEvery)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				if err := w.q.Heartbeat(context.Background(), raw, w.opts.Visibility); err != nil {
					log.Printf("[jq] heartbeat failed for %s: %v", job.ID, err)
				}
			}
		}
	}()

	started := time.Now()
	err := handler(ctx, job)
	close(stop)

	if err == nil {
		if ackErr := w.q.Ack(ctx, raw); ackErr != nil {
			log.Printf("[jq] ack failed for %s: %v", job.ID, ackErr)
		}
		log.Printf("[jq] ok %s %s in %s", job.Name, job.ID, time.Since(started))
		return
	}

	var perm *PermanentError
	permanent := errors.As(err, &perm)

	// Effect did not happen: release the marker so a retry can run.
	if job.IdempotencyKey != "" && !permanent {
		w.rdb.Del(ctx, w.q.DedupStoreKey(job.IdempotencyKey))
	}

	outcome, _ := w.q.Fail(ctx, raw, job, err, permanent)
	log.Printf("[jq] %s %s %s attempt=%d: %v", outcome, job.Name, job.ID, job.Attempt+1, err)
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

func Main() {
	rdb := redis.NewClient(&redis.Options{Addr: "queue.cordoba.internal:6379"})
	q := New(rdb, "damascus")

	handlers := map[string]Handler{
		"dispatch.parcel": func(ctx context.Context, job Job) error {
			var p struct {
				ParcelID  string `json:"parcelId"`
				Recipient string `json:"recipient"`
				City      string `json:"city"`
			}
			if err := json.Unmarshal(job.Payload, &p); err != nil {
				return &PermanentError{Reason: "malformed parcel payload"}
			}
			if p.City == "" {
				return &PermanentError{Reason: "parcel " + p.ParcelID + " has no destination city"}
			}
			log.Printf("[dispatch] parcel %s to %s in %s", p.ParcelID, p.Recipient, p.City)
			return nil
		},
	}

	worker := NewWorker(q, rdb, handlers, WorkerOptions{
		WorkerID:       "worker-samarkand-03",
		Concurrency:    8,
		Visibility:     30 * time.Second,
		HeartbeatEvery: 10 * time.Second,
		IdleSleep:      250 * time.Millisecond,
		IdempotencyTTL: 7 * 24 * time.Hour,
	})

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()

	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if _, _, err := q.Reap(context.Background(), 200); err != nil {
				log.Printf("[jq] reap failed: %v", err)
			}
		}
	}()

	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			d, err := q.Depth(context.Background())
			if err != nil {
				continue
			}
			log.Printf("[jq] ready=%d delayed=%d inflight=%d dead=%d oldest_ready=%s",
				d.Ready, d.Delayed, d.InFlight, d.Dead, d.OldestReady.Truncate(time.Second))
		}
	}()

	q.Enqueue(context.Background(), "dispatch.parcel",
		map[string]string{"parcelId": "DMS-4471", "recipient": "al-biruni", "city": "bukhara"},
		EnqueueOptions{IdempotencyKey: "parcel:DMS-4471", DedupKey: "parcel:DMS-4471", MaxAttempts: 5},
	)

	worker.Run(ctx)
	_ = rdb.Close()
}
```

</div>
</CodeTabs>

## এই ইমপ্লিমেন্টেশনে যা যা প্রোডাকশন-গ্রেড

- **Lua দিয়ে atomic দাবি** — "কিউ থেকে তোলা" আর "in-flight সেটে বসানো" দুটো আলাদা কমান্ড হলে মাঝখানে ক্র্যাশ করলে জব চিরতরে হারায়; একটা স্ক্রিপ্টে হলে হারায় না
- **Visibility timeout + reaper** — worker মরে গেলে তার জব সর্বোচ্চ একটা visibility উইন্ডোর মধ্যেই ফিরে আসে, কারো হস্তক্ষেপ ছাড়াই
- **Heartbeat** — লম্বা জব চলাকালীন deadline বাড়ে, তাই "কাজ শেষ হওয়ার আগেই আরেকজন শুরু করে দিল" সমস্যাটা ঘটে না
- **দুই স্তরের dedup** — enqueue-এ `dedupKey` একই কাজ দুবার কিউতে ঢুকতে দেয় না, আর handler-এ `idempotencyKey` একই কাজের প্রভাব দুবার পড়তে দেয় না
- **ব্যর্থতায় মার্কার ছেড়ে দেওয়া** — retriable ব্যর্থতায় idempotency মার্কার মুছে ফেলা হয়, নইলে একটা ক্ষণস্থায়ী এররই কাজটাকে চিরতরে "হয়ে গেছে" বানিয়ে ফেলত
- **Full jitter backoff** — retry-র ঢেউ ছড়িয়ে যায়, downstream-এ দেয়াল ধাক্কা লাগে না
- **Permanent বনাম retriable এরর** — ভ্যালিডেশন ব্যর্থতা পাঁচবার চেষ্টা না করে সরাসরি DLQ-তে যায়
- **Bounded concurrency + graceful shutdown** — SIGTERM-এ নতুন জব তোলা বন্ধ, চলমান জব শেষ; ডিপ্লয়ে কোনো কাজ অর্ধেক অবস্থায় ছিঁড়ে যায় না
- **Depth মেট্রিক সহ oldest-ready age** — কেবল সংখ্যা নয়, অপেক্ষার বয়সও, কারণ ওটাই আসল SLO

<div class="takeaways">

### মূল শেখা

- একটাই প্রশ্ন সব ঠিক করে দেয় — **উত্তরটা কি ইউজারকে এই রেসপন্সেই দেখাতে হবে?** না হলে কাজটা কিউতে যাবে, আর সেটা শুধু latency নয়, failure isolation-ও দেয়: আপনার দুর্বলতম dependency আর আপনার চেকআউটের uptime আলাদা হয়ে যায়
- **Work queue** মানে "একটা কাজ, একজন করো, তারপর মুছে যাবে"; **log/stream** মানে "একটা ঘটনা, সবাই পড়ো, retention পর্যন্ত থাকবে, দরকারে replay করো"। partition সংখ্যাই log-এ আপনার সর্বোচ্চ parallelism
- worker-এর তিনটে ফাঁদ: prefetch খুব বেশি (ভারসাম্য নষ্ট), visibility timeout জবের চেয়ে ছোট (কাজ দ্বিগুণ), আর poison message-এর জন্য attempt সীমা না থাকা (কিউ আটকে যাওয়া)
- retry ছাড়া backoff অসম্পূর্ণ, আর backoff ছাড়া **jitter** অসম্পূর্ণ — না হলে ব্যর্থ জবগুলো ঠিক একই সেকেন্ডে ফিরে এসে retry storm বানায়। সাথে একটা global **retry budget** রাখুন
- সব প্রোডাকশন ব্রোকার **at-least-once**, তাই ডুপ্লিকেট সামলানোটা ব্রোকারের নয় **হ্যান্ডলারের** দায়িত্ব — idempotency key, unique constraint, বা dedup store দিয়ে
- **exactly-once delivery** বলে কিছু নেই; "exactly-once semantics" মানে হয় at-least-once + idempotent effect, নয়তো একটাই সিস্টেমের ভেতরে transactional offset commit
- "DB-তে লেখো আর ইভেন্ট পাবলিশ করো" কখনোই atomic নয় — **outbox pattern** দিয়ে ইভেন্টটাকে একই ট্রানজেকশনের একটা রো বানান, আর একটা relay বা CDC সেটাকে ব্রোকারে পৌঁছে দিক
- অ্যাসিনক্রোনাস সিস্টেমের আসল স্বাস্থ্য-সূচক throughput নয়, **queue depth আর oldest message age** — আর DLQ-তে অ্যালার্ট দিন আকার দেখে নয়, বাড়ার হার দেখে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Shopify** ব্ল্যাক ফ্রাইডেতে চেকআউটের বাইরের প্রায় সব কাজ (ইমেইল, ইনভেন্টরি সিঙ্ক, অ্যানালিটিক্স) কিউতে ঠেলে দেয় এবং অগ্রাধিকার অনুযায়ী আলাদা কিউ চালায়, যাতে একটা বিশাল ব্যাকফিল কখনোই অর্ডার কনফার্মেশনকে আটকাতে না পারে
- **Uber** তাদের ইভেন্ট পাইপলাইন Kafka-র উপর চালায় আর `trip_id` দিয়ে partition করে — global ordering নয়, per-trip ordering, কারণ বাস্তবে ওটুকুই দরকার
- **Stripe**-এর ওয়েবহুক ডেলিভারি at-least-once, exponential backoff সহ কয়েক দিন ধরে retry করে, আর প্রতিটা ইভেন্টে একটা স্থিতিশীল id পাঠায় — যাতে গ্রাহকের হ্যান্ডলার নিজেই dedupe করতে পারে। এটাই at-least-once + idempotent handler-এর সবচেয়ে পরিচিত উদাহরণ
- **Netflix** ও **Airbnb** ডেটাবেস আর Kafka-র মধ্যে সামঞ্জস্যের জন্য outbox বা CDC (Debezium-ধরনের) পাইপলাইন ব্যবহার করে, কারণ "আগে DB না আগে publish" প্রশ্নটার কোনো নিরাপদ উত্তর নেই

</div>
