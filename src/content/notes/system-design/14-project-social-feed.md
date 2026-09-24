---
title: 'প্রজেক্ট: সোশ্যাল ফিড'
subtitle: 'রিকোয়ারমেন্ট থেকে শুরু করে fan-out, celebrity সমস্যা, ranking, caching আর শার্ডেড স্টোরেজ — একটা টাইমলাইন সিস্টেম পুরো ডিজাইন করা।'
chapter: 14
level: 'intermediate'
readingTime: '২৫ মিনিট'
topics:
  ['social feed', 'timeline', 'fan-out', 'ranking', 'caching', 'sharding', 'system design project']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

এই ট্র্যাকের সপ্তম চ্যাপ্টারে আপনি একটা URL শর্টনার ডিজাইন করেছিলেন — সেটা ছিল প্রথম পূর্ণাঙ্গ প্রজেক্ট, আর সেখানে মূল চ্যালেঞ্জ ছিল read-heavy একটা key-value লুকআপ দ্রুত করা। এরপর ছয়টা চ্যাপ্টার ধরে আপনি অস্ত্রগুলো জোগাড় করেছেন: caching, load balancing আর statelessness, database scaling আর sharding, async work আর queue, API contract, আর consistency-র স্তরগুলো।

এই চ্যাপ্টার সেই সবগুলোকে একসাথে ব্যবহার করার জায়গা। আমরা একটা **সোশ্যাল টাইমলাইন** ডিজাইন করব — যেখানে প্রতিটা ইউজার তার ফলো করা মানুষদের পোস্ট একটা ফিডে দেখে।

শুনতে সহজ লাগে। বাস্তবে এটা ইন্ডাস্ট্রির সবচেয়ে বিখ্যাত কঠিন সমস্যাগুলোর একটা, কারণ এখানে দুটো ভয়ংকর জিনিস একসাথে ঘটে: read-write অনুপাত প্রচণ্ড অসম, আর ডেটার বণ্টন প্রচণ্ড অসম। এই দুটোর প্রতিটার জন্য আলাদা সমাধান আছে, কিন্তু একসাথে থাকলে সমাধানগুলো একে অন্যকে ভাঙে।

## গল্পে বুঝি

বাগদাদের বায়তুল হিকমায় প্রতিদিন সকালে খবর ছড়ায়। কয়েক হাজার পণ্ডিত সেখানে কাজ করেন, আর প্রত্যেকের নিজস্ব একটা কাঠের বাক্স আছে দেয়ালের গায়ে — নিজের নাম লেখা। কেউ নতুন কোনো পর্যবেক্ষণ বা টীকা লিখলে সেটা অন্যদের কাছে পৌঁছাতে হয়। প্রশ্ন হলো, কীভাবে?

প্রথম পদ্ধতিটা সিনার প্রস্তাব। বিরুনি যখন নতুন একটা টীকা লেখেন, লাইব্রেরির কেরানিরা সাথে সাথে সেটার একটা করে কপি বানিয়ে বিরুনির প্রত্যেক অনুসারীর বাক্সে ফেলে দেয়। ফলে সিনা সকালে এসে নিজের বাক্সটা টেনে খুললেই একদম প্রস্তুত, সাজানো খবর পেয়ে যান — কোথাও দৌড়াতে হয় না, কাউকে জিজ্ঞেস করতে হয় না। পড়াটা বিদ্যুতের মতো দ্রুত। এটাই **fan-out on write**: লেখার সময়ই কষ্টটা করে ফেলা।

দ্বিতীয় পদ্ধতিটা খোয়ারিজমির। তিনি বলেন, কপি বানানো অপচয় — বরং প্রত্যেকের লেখা তার নিজের তাকেই থাক। সিনা সকালে খবর চাইলে একজন সহকারী তাঁর দুইশো অনুসারীর তাক ঘুরে ঘুরে নতুন লেখাগুলো জোগাড় করে, তারিখ অনুযায়ী সাজিয়ে হাতে দেবে। কাগজের অপচয় শূন্য, কিন্তু প্রতিবার খবর চাইলেই দুইশো তাক ঘোরা — অপেক্ষাটা লম্বা। এটাই **fan-out on read**।

কয়েক মাস সিনার পদ্ধতিতেই চলল, দিব্যি চলল। তারপর খলিফা নিজে লেখা শুরু করলেন। খলিফার অনুসারী পঞ্চাশ হাজার। তিনি একটা লাইন লিখলেই কেরানিরা পঞ্চাশ হাজার কপি বানাতে বসে যায়, আর ততক্ষণে পুরো লাইব্রেরির কেরানি-বাহিনী অচল — কিন্দির সাধারণ একটা টীকাও কারও বাক্সে পৌঁছায় না, কারণ সবাই খলিফার কপি বানাচ্ছে। একজন মানুষের একটা লেখা পুরো সিস্টেমকে থামিয়ে দিল। এটাই **celebrity problem** (বা hot key problem)।

সমাধান বেরোল আপসে। ঠিক হলো — সাধারণ পণ্ডিতদের লেখা আগের মতোই কপি হয়ে বাক্সে যাবে, কিন্তু খলিফা আর তাঁর মতো গুটিকয়েক অতি-জনপ্রিয় লেখকের লেখা কপি হবে না; সেগুলো একটা কেন্দ্রীয় নোটিশ বোর্ডে টাঙানো থাকবে। সিনা সকালে নিজের বাক্সটা খুলবেন (প্রায় সব খবর ওখানেই), আর যাওয়ার পথে কেন্দ্রীয় বোর্ডটায় একবার চোখ বুলিয়ে নেবেন। দুটো মিলিয়ে তাঁর সম্পূর্ণ খবর তৈরি। এটাই **hybrid fan-out** — বেশিরভাগ ক্ষেত্রে write-এ কাজ, আর অল্প কিছু বিশেষ ক্ষেত্রে read-এ কাজ।

আরও দুটো ব্যাপার দাঁড়িয়ে গেল। বাক্সে কাগজ জমতে জমতে উপচে পড়ে, তাই নিয়ম হলো প্রতিটা বাক্সে সর্বোচ্চ আটশো কাগজ থাকবে — পুরনোগুলো ঝেড়ে ফেলা হবে। কেউ যদি সত্যিই দুই বছর আগের লেখা খোঁজে, তাকে মূল আর্কাইভে যেতে হবে। আর কাগজগুলো শুধু তারিখ অনুযায়ী নয়, গুরুত্ব অনুযায়ীও সাজানো হয় — যে লেখাগুলো সিনার নিজের বিষয়ের কাছাকাছি বা যেগুলো নিয়ে বেশি আলোচনা হচ্ছে, সেগুলো উপরে। এটাই **ranking**।

মিলিয়ে নিই: প্রত্যেকের কাঠের বাক্স হলো precomputed **timeline** (Redis-এ ইউজারপ্রতি একটা লিস্ট), কেরানিদের কপি বানানো হলো **fan-out worker**, খলিফার কেন্দ্রীয় নোটিশ বোর্ড হলো **celebrity pull path**, দুটো মিলিয়ে পড়া হলো **hybrid merge at read time**, আটশো কাগজের সীমা হলো **timeline truncation**, মূল আর্কাইভ হলো **shared post store** (শার্ডেড ডেটাবেস), আর গুরুত্ব অনুযায়ী সাজানো হলো **ranking**। পুরো চ্যাপ্টারটা আসলে এই একটা ছবিরই ইঞ্জিনিয়ারিং অনুবাদ।

## ধাপ ১: রিকোয়ারমেন্ট

তৃতীয় চ্যাপ্টারের নিয়ম মনে আছে — ডিজাইন শুরুর আগে স্কোপ কেটে ফেলা। একটা ফিড সিস্টেম অসীম বড় হতে পারে, তাই প্রথম কাজ হলো কী বানাচ্ছি না সেটা লিখে ফেলা।

**Functional (যা অবশ্যই লাগবে):**

- একজন ইউজার টেক্সট ও ছবিসহ পোস্ট করতে পারবে
- একজন ইউজার আরেকজনকে ফলো ও আনফলো করতে পারবে
- একজন ইউজার তার হোম ফিড দেখতে পারবে — ফলো করা সবার পোস্ট, ranked
- একজন ইউজারের নিজস্ব প্রোফাইল ফিড (শুধু তার নিজের পোস্ট) দেখা যাবে
- ফিড পেজিনেটেড হবে — infinite scroll

**Functional (যা এই ডিজাইনে ধরছি না):** কমেন্টের থ্রেড, ডাইরেক্ট মেসেজ, লাইভ ভিডিও, সার্চ, বিজ্ঞাপন। এগুলো আলাদা সিস্টেম, আর একসাথে ডিজাইন করার চেষ্টা করলে কোনোটাই ঠিকমতো হবে না।

**Non-functional (এগুলোই আসলে ডিজাইন ঠিক করে দেয়):**

| গুণ                | লক্ষ্য                                             | কেন                                                |
| ------------------ | -------------------------------------------------- | -------------------------------------------------- |
| Feed read latency  | p99 &lt; 200 ms                                    | ফিড অ্যাপের প্রথম স্ক্রিন, ধীর হলে ইউজার চলে যায়  |
| Post write latency | p99 &lt; 300 ms (ফ্যান-আউট বাদে)                   | পোস্ট বাটন সাথে সাথে সাড়া দেবে                    |
| Feed freshness     | ৯৯% ক্ষেত্রে ৫ সেকেন্ডের মধ্যে                     | রিয়েল-টাইম নয়, near-real-time                    |
| Consistency        | eventual, তবে **read-your-own-writes বাধ্যতামূলক** | নিজের পোস্ট নিজের ফিডে না দেখলে সেটা বাগ মনে হয়   |
| Availability       | ফিড পড়া AP, পোস্ট লেখা আরও কড়া                   | ফিড না দেখানোর চেয়ে সামান্য পুরনো ফিড দেখানো ভালো |
| Durability         | পোস্ট কখনো হারাবে না                               | ইউজার-জেনারেটেড কনটেন্ট                            |

<Callout type="info">

লক্ষ্য করুন consistency-র সারিটা। ১৩ নম্বর চ্যাপ্টারের ভাষায় — পুরো ফিডের জন্য আমরা **eventual consistency** নিচ্ছি, কিন্তু নিজের পোস্টের জন্য **read-your-own-writes** সেশন গ্যারান্টিটা বাধ্যতামূলক করছি। এটাই সবচেয়ে দুর্বল গ্যারান্টি যা প্রোডাক্টের জন্য যথেষ্ট, আর এর চেয়ে বেশি নিলে সেটা বিনামূল্যের নিরাপত্তা নয় — সেটা সরাসরি latency আর খরচ।

</Callout>

## ধাপ ২: এস্টিমেশন

সংখ্যা ছাড়া আর্কিটেকচার নিয়ে তর্ক করা মানে অন্ধকারে ছোঁড়াছুঁড়ি। ধরে নিই:

```
DAU                         = 50,000,000
গড় follow প্রতি ইউজার       = 200
পোস্ট করে DAU-র              = 10%, গড়ে 2টা করে
ফিড খোলে প্রতি ইউজার          = দিনে 10 বার
```

**Write throughput:**

```
posts/day  = 50M x 10% x 2       = 10,000,000
posts/sec  = 10M / 86,400        ≈ 115/sec
peak (3x)                        ≈ 350/sec
```

১১৫ writes/sec — এটা একদম তুচ্ছ সংখ্যা। একটাই Postgres এটা হাসতে হাসতে সামলাবে। অর্থাৎ **পোস্ট লেখা এই সিস্টেমের সমস্যা নয়**।

**Read throughput:**

```
feed opens/day = 50M x 10        = 500,000,000
reads/sec      = 500M / 86,400   ≈ 5,800/sec
peak (3x)                        ≈ 17,000/sec
read : write ratio               ≈ 50 : 1
```

**Fan-out write amplification — এখানেই আসল ব্যাপার:**

```
timeline inserts/day = 10M posts x 200 followers = 2,000,000,000
inserts/sec          = 2B / 86,400               ≈ 23,000/sec
peak (3x)                                        ≈ 70,000/sec
```

এই একটামাত্র হিসাব পুরো ডিজাইনটা ঠিক করে দেয়। ইউজারের পোস্ট সেকেন্ডে ১১৫টা, কিন্তু সেগুলো লেখার ফলে সিস্টেমের ভেতরে সেকেন্ডে ২৩,০০০ write তৈরি হচ্ছে — দুইশো গুণ **write amplification**। এই কাজটা রিকোয়েস্টের পথে রাখা অসম্ভব; এটাকে ১১ নম্বর চ্যাপ্টারের queue-তে ঠেলে দিতেই হবে।

**Storage:**

```
পোস্ট row (id, author, text, media ptr, ts, counters) ≈ 400 B
10M posts/day x 400 B = 4 GB/day ≈ 1.5 TB/বছর        (টেক্সট মেটাডেটা)

মিডিয়া: 30% পোস্টে ছবি, গড় 300 KB
3M x 300 KB = 900 GB/day ≈ 320 TB/বছr                (object storage-এ, DB-তে নয়)

Timeline entry (post_id, author_id, score) ≈ 24 B
active user 20M x 800 entry x 24 B ≈ 384 GB           (Redis cluster-এ)
```

দুটো উপসংহার সাথে সাথেই বেরিয়ে আসে: **মিডিয়া কখনো ডেটাবেসে যাবে না** (object storage + CDN), আর **timeline একটাই Redis-এ ধরবে না** — cluster লাগবে, আর শুধু সক্রিয় ইউজারদের জন্যই materialize করতে হবে।

## ধাপ ৩: হাই-লেভেল আর্কিটেকচার

<Mermaid
title="Social feed high-level architecture"
code={`graph TD
  CL["Client apps"] --> LB["L7 load balancer"]
  LB --> API["Feed API<br/>stateless"]
  API --> PS["Post service"]
  API --> GS["Graph service<br/>follows"]
  API --> FS["Feed service<br/>read path"]
  PS --> PDB["Post store<br/>sharded by post_id"]
  PS --> Q["Fan-out queue"]
  Q --> FW["Fan-out workers"]
  FW --> GS
  FW --> TL["Timeline store<br/>Redis cluster"]
  FS --> TL
  FS --> PDB
  FS --> CDN["Media CDN"]`}
/>

সার্ভিসগুলো ইচ্ছে করেই ছোট আর আলাদা রাখা হয়েছে, কারণ এদের স্কেলিং প্রোফাইল সম্পূর্ণ ভিন্ন:

- **Post service** — কম throughput, উঁচু durability। এটাই সত্যের উৎস।
- **Graph service** — follow সম্পর্ক। read-heavy, ছোট row, প্রচণ্ড ক্যাশেবল।
- **Fan-out workers** — বিশাল throughput, কিন্তু সম্পূর্ণ async। পিছিয়ে পড়লে ফিড একটু বাসি হয়, কিছু ভাঙে না।
- **Feed service** — সর্বোচ্চ QPS, সবচেয়ে কড়া latency বাজেট। এটা প্রায় পুরোটাই মেমরি থেকে সার্ভ করে।

## ধাপ ৪: Fan-out on write বনাম fan-out on read

এটাই এই প্রজেক্টের কেন্দ্রীয় সিদ্ধান্ত। দুটোই বৈধ, দুটোই বিপরীত দিকে ভাঙে।

<Mermaid
title="Fan-out on write vs fan-out on read"
code={`graph LR
  subgraph WRITE["Fan-out on write"]
    A1["Al-Biruni posts"] --> F1["Fan-out worker"]
    F1 --> T1["Ibn Sina timeline"]
    F1 --> T2["Al-Kindi timeline"]
    F1 --> T3["200 more timelines"]
    T1 --> R1["Read = 1 lookup"]
  end
  subgraph READ["Fan-out on read"]
    A2["Al-Biruni posts"] --> P2["Own post list only"]
    R2["Ibn Sina opens feed"] --> M2["Gather 200 lists"]
    M2 --> S2["Merge and sort"]
  end`}
/>

| দিক              | Fan-out on write              | Fan-out on read        |
| ---------------- | ----------------------------- | ---------------------- |
| Read latency     | চমৎকার — একটা লুকআপ           | খারাপ — N লিস্ট merge  |
| Write খরচ        | O(followers) — বিশাল          | O(1) — তুচ্ছ           |
| স্টোরেজ          | প্রতি ফলোয়ারের জন্য কপি      | কোনো কপি নেই           |
| নিষ্ক্রিয় ইউজার | অপচয় — কেউ পড়বে না তবু লেখা | কোনো অপচয় নেই         |
| Celebrity পোস্ট  | বিপর্যয়                      | সমস্যা নেই             |
| ফিড ফ্রেশনেস     | worker lag-এর সমান            | সবসময় তাজা            |
| ranking বদলানো   | কঠিন — সব timeline rewrite    | সহজ — read-এ হিসাব হয় |

read:write অনুপাত ৫০:১ — অর্থাৎ read-কে সস্তা করাই বেশি লাভজনক। তাই **ডিফল্ট হবে fan-out on write**। কিন্তু টেবিলের "Celebrity পোস্ট" সারিটাই আমাদের পরের সমস্যায় নিয়ে যায়।

## ধাপ ৫: Celebrity problem

follower distribution কখনোই সমান নয়, এটা একটা power law। ৫০ মিলিয়ন ইউজারের মধ্যে গড় ২০০ ফলোয়ার — কিন্তু "গড়" এখানে প্রায় অর্থহীন। বাস্তব বণ্টন এরকম:

| শ্রেণি    | ফলোয়ার   | ইউজার সংখ্যা | একটা পোস্টে fan-out write |
| --------- | --------- | ------------ | ------------------------- |
| সাধারণ    | ১০০–৫০০   | ~৪৯.৫M       | ২০০                       |
| জনপ্রিয়  | ১০ হাজার+ | ~৫ লাখ       | ১০,০০০                    |
| Celebrity | ১০ লাখ+   | ~২,০০০       | ১০,০০,০০০                 |
| Mega      | ৫ কোটি+   | ~২০          | ৫,০০,০০,০০০               |

একটা mega account একটামাত্র পোস্ট করলে ৫ কোটি timeline write তৈরি হয়। ২৩,০০০/sec ক্ষমতার একটা fan-out ফ্লিটে সেটা শেষ করতে লাগবে ৩৬ মিনিট — আর ওই ৩৬ মিনিট ধরে **অন্য সবার** পোস্ট কিউতে আটকে থাকবে। অর্থাৎ একজন ইউজারের একটা অ্যাকশন পুরো প্ল্যাটফর্মের ফিডকে আধা ঘণ্টা পিছিয়ে দিল।

<Callout type="warning">

এটা ঠিক সেই **hot key / hot shard** সমস্যা যেটা ১০ নম্বর চ্যাপ্টারে দেখেছেন, শুধু এখানে সেটা শার্ডে নয়, কিউতে দেখা দিচ্ছে। আর সমাধানের ধরনও একই: hot জিনিসটাকে সাধারণ পথ থেকে সরিয়ে আলাদা পথে পাঠাও।

</Callout>

আংশিক সমাধানগুলো আগে দেখে নিই, কারণ প্রোডাকশনে এগুলো সবগুলোই লাগে:

- **অগ্রাধিকারভিত্তিক কিউ** — celebrity fan-out আলাদা low-priority কিউতে যাবে, যাতে সাধারণ পোস্ট আটকে না থাকে। এটা lag-টাকে অন্য মানুষের ঘাড় থেকে সরায়, কিন্তু কাজটা কমায় না।
- **শুধু সক্রিয় ফলোয়ারদের জন্য fan-out** — যে ইউজার ৩০ দিনে অ্যাপ খোলেনি, তার timeline লিখে লাভ নেই। বাস্তবে এটা ৬০–৭০% কাজ কমিয়ে দেয়, আর এটাই সবচেয়ে বেশি রিটার্ন দেওয়া একক অপটিমাইজেশন।
- **ব্যাচড pipeline write** — একটা একটা করে নয়, ১,০০০ timeline একসাথে Redis pipeline-এ ঠেলে দেওয়া। এটা throughput কয়েক গুণ বাড়ায়।

কিন্তু mega account-এর ক্ষেত্রে এগুলোর কোনোটাই যথেষ্ট নয়। তাই আসল সমাধান আলাদা।

## ধাপ ৬: Hybrid fan-out

নিয়মটা এক লাইনের: **যাদের ফলোয়ার একটা সীমার নিচে, তাদের পোস্ট push হবে; যাদের উপরে, তাদের পোস্ট read-এ pull হবে।**

```
FANOUT_THRESHOLD = 50,000 followers

on post(author, post):
  if follower_count(author) <= FANOUT_THRESHOLD:
      enqueue fanout job   → push into each active follower's timeline
  else:
      write to author's own post list only   → pulled at read time

on read_feed(user):
  pushed   = ZREVRANGE timeline:{user}  (fast, precomputed)
  celebs   = celebrity accounts that {user} follows   (cached, small list)
  pulled   = for each celeb: recent posts from their post list (cached)
  return rank(merge(pushed, pulled))
```

এটা কেন কাজ করে সেটা আবার একটা সংখ্যার ব্যাপার। Celebrity অ্যাকাউন্ট মোট অ্যাকাউন্টের ০.০০৪%, তাই একজন সাধারণ ইউজার গড়ে ২০০ জনকে ফলো করলে তার মধ্যে celebrity থাকে হয়তো ৫–২০ জন। অর্থাৎ read path-এ merge করতে হয় মাত্র গুটিকয়েক লিস্ট, ২০০টা নয় — fan-out on read-এর খরচটা এখানে প্রায় শূন্যে নেমে আসে। আর celebrity-দের পোস্ট লিস্ট এতই বেশি পড়া হয় যে সেটা ক্যাশে প্রায় সবসময় hit করে; ১০ লাখ মানুষ একই লিস্ট পড়ছে মানে hit ratio ৯৯.৯%+।

<Mermaid
title="Hybrid feed read path"
code={`sequenceDiagram
  participant C as Client
  participant F as Feed service
  participant T as Timeline cache
  participant G as Graph cache
  participant P as Post store
  C->>F: GET /v1/feed?cursor=...
  F->>T: ZREVRANGE timeline of Ibn Sina
  T-->>F: 400 post ids, pushed
  F->>G: celebrity accounts followed
  G-->>F: 12 ids
  F->>P: recent posts of those 12, cached
  P-->>F: 240 post ids
  F->>F: merge, rank, truncate to page
  F->>P: hydrate 30 post bodies, multi-get
  P-->>F: post rows
  F-->>C: page plus next cursor`}
/>

<Callout type="tip">

threshold-টা যেন একটা কনফিগ ভ্যালু হয়, হার্ডকোড করা সংখ্যা নয়। fan-out ফ্লিট পিছিয়ে পড়লে অপারেটর threshold নামিয়ে দিয়ে সাথে সাথে চাপ কমাতে পারবে — এটাই এই সিস্টেমের সবচেয়ে কার্যকর জরুরি নব।

</Callout>

## ধাপ ৭: Ranking

শুধু সময় অনুযায়ী সাজানো (reverse-chronological) ফিড বানানো সবচেয়ে সহজ, আর অনেক প্রোডাক্টের জন্য সেটাই সঠিক উত্তর। কিন্তু ফলো সংখ্যা বাড়লে সময়ভিত্তিক ফিড দ্রুত অকেজো হয়ে যায় — যে ২,০০০ জনকে ফলো করে, সে সবচেয়ে বেশি পোস্ট করা কয়েকজনের পোস্ট ছাড়া আর কিছুই দেখে না।

একটা ব্যবহারিক ranking score:

```
score = w1 * recency_decay
      + w2 * affinity(viewer, author)
      + w3 * engagement_rate(post)
      + w4 * media_bonus
      - w5 * seen_penalty

recency_decay   = exp(-age_hours / half_life_hours)
affinity        = viewer-author interaction history, 0..1
engagement_rate = (likes + 3*replies + 5*reshares) / max(impressions, 1)
```

গুরুত্বপূর্ণ আর্কিটেকচারাল প্রশ্নটা কিন্তু ফর্মুলা নয় — প্রশ্নটা হলো **স্কোর কখন হিসাব হবে**।

- **Write-time scoring** — fan-out-এর সময় স্কোর হিসাব করে timeline-এ সাজিয়ে রাখা। read খুব সস্তা, কিন্তু স্কোরটা viewer-নির্দিষ্ট করা যায় না ভালোভাবে, আর ফর্মুলা বদলালে কোটি কোটি এন্ট্রি নতুন করে লিখতে হয়।
- **Read-time scoring** — timeline-এ শুধু সময় অনুযায়ী রাখা, আর পড়ার সময় শীর্ষ কয়েকশো ক্যান্ডিডেট নিয়ে স্কোর করা। ফর্মুলা যেকোনো দিন বদলানো যায়, A/B টেস্ট করা যায়, personalization সম্ভব।

বাস্তব সিস্টেমগুলো **দুই ধাপে** কাজ করে, আর এটাই সঠিক উত্তর:

1. **Candidate generation** (সস্তা, write-time) — timeline-এ সময় অনুযায়ী সাজানো কয়েকশো পোস্ট। এখানে লক্ষ্য recall, নিখুঁততা নয়।
2. **Ranking** (দামি, read-time) — ওই কয়েকশো ক্যান্ডিডেটের উপর পূর্ণ স্কোরিং, তারপর উপরের ৩০টা ফেরত।

কয়েকশো আইটেমে স্কোরিং করা মিলিসেকেন্ডের কাজ, কিন্তু কোটি আইটেমে সেটা অসম্ভব। এই দুই ধাপে ভাগ করাটাই ranking সিস্টেমের মূল কৌশল।

<Callout type="warning">

Ranking নিয়ে একটা প্রোডাক্ট ফাঁদ আছে: র‌্যাংকড ফিডে ইউজারের নিজের সদ্য করা পোস্ট নিচে চলে যেতে পারে, আর ইউজার ভাবে পোস্টটা হারিয়ে গেছে। তাই প্রায় সব সিস্টেমেই একটা নিয়ম থাকে — নিজের পোস্ট, প্রথম কয়েক মিনিট, জোর করে উপরে। এটা আসলে ১৩ নম্বর চ্যাপ্টারের **read-your-own-writes** গ্যারান্টিরই একটা UI-স্তরের রূপ।

</Callout>

## ধাপ ৮: Caching

৮ নম্বর চ্যাপ্টারের স্তরগুলো এখানে সরাসরি প্রয়োগ হয়। কী ক্যাশ হবে আর কী TTL হবে, সেটা ডেটার ধরন ধরে ঠিক হয়:

| ডেটা                     | স্টোর               | TTL                | কেন                                      |
| ------------------------ | ------------------- | ------------------ | ---------------------------------------- |
| Timeline (post id লিস্ট) | Redis ZSET, capped  | মেয়াদহীন, ৮০০ cap | এটাই মূল কাঠামো, পুনর্গঠনযোগ্য           |
| Post body                | Redis hash          | ৬–২৪ ঘণ্টা         | immutable, তাই আগ্রাসী ক্যাশ নিরাপদ      |
| Follow লিস্ট             | Redis set + local   | ১০ মিনিট           | ধীরে বদলায়, খুব ঘন পড়া হয়             |
| Celebrity পোস্ট লিস্ট    | Redis list          | ৩০ সেকেন্ড         | চরম hot, tiny staleness গ্রহণযোগ্য       |
| Counters (like, reply)   | Redis, write-behind | ১০ সেকেন্ড         | নির্ভুলতার চেয়ে গতি গুরুত্বপূর্ণ        |
| Media                    | Object store + CDN  | immutable, ১ বছর   | content-hash URL, তাই invalidate লাগে না |

দুটো ব্যাপার আলাদা করে বলার মতো।

**পোস্টের বডি immutable ধরুন।** পোস্ট এডিট করলে নতুন version id দিন, আগেরটা ওভাররাইট করবেন না। তাহলে ক্যাশে কখনো invalidate করতে হবে না — timeline-এ id বদলে গেলেই নতুন কনটেন্ট চলে আসবে। ৮ নম্বর চ্যাপ্টারের versioned key প্যাটার্নটার এটাই সবচেয়ে পরিচ্ছন্ন প্রয়োগ।

**Timeline নিজেই একটা ক্যাশ, ডেটাবেস নয়।** Redis-এর একটা shard হারালে ওই ইউজারদের timeline হারায় — কিন্তু কিছুই স্থায়ীভাবে যায় না, কারণ post store আর follow graph অক্ষত। একটা rebuild job সেই ইউজারদের follow লিস্ট ধরে শেষ কয়েক দিনের পোস্ট তুলে timeline আবার বানিয়ে দিতে পারে। এই সম্পত্তিটা ডিজাইনে ইচ্ছাকৃত — timeline-কে কখনো সত্যের উৎস বানাবেন না।

<Callout type="info">

hit ratio-র অর্থনীতি এখানেও একই। ফিড সার্ভিস ৯৯% ক্যাশ থেকে সার্ভ করে; Redis cluster পুরো পড়ে গেলে ওই পুরো ট্রাফিক শার্ডেড post store-এ গিয়ে পড়বে, যা সেটা কোনোদিন সামলাতে পারবে না। তাই ফিড সার্ভিসে অবশ্যই একটা concurrency limiter আর degraded mode থাকতে হবে — যেমন, ক্যাশ না থাকলে শুধু সময়ভিত্তিক ছোট ফিড দেখানো, ranking বাদ দিয়ে।

</Callout>

## ধাপ ৯: স্টোরেজ স্কিমা

```sql
-- Post store: sharded by post_id (hash), immutable rows
CREATE TABLE posts (
  post_id        BIGINT PRIMARY KEY,     -- snowflake: time-ordered, globally unique
  author_id      BIGINT      NOT NULL,
  body           TEXT        NOT NULL,
  media_key      TEXT,                   -- object storage key, never the blob
  created_at     TIMESTAMPTZ NOT NULL,
  deleted_at     TIMESTAMPTZ
);

-- Author's own posts: sharded by author_id so a profile read hits one shard
CREATE TABLE author_posts (
  author_id      BIGINT      NOT NULL,
  post_id        BIGINT      NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (author_id, created_at DESC, post_id)
);

-- Follow graph: stored twice, once per direction, sharded independently
CREATE TABLE following (              -- who does X follow
  follower_id    BIGINT      NOT NULL,
  followee_id    BIGINT      NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE followers (              -- who follows X  (fan-out reads this)
  followee_id    BIGINT      NOT NULL,
  follower_id    BIGINT      NOT NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (followee_id, follower_id)
);

CREATE INDEX ON followers (followee_id, is_active) WHERE is_active;

-- Denormalised counters, updated asynchronously
CREATE TABLE user_stats (
  user_id        BIGINT PRIMARY KEY,
  follower_count BIGINT NOT NULL DEFAULT 0,
  post_count     BIGINT NOT NULL DEFAULT 0,
  is_celebrity   BOOLEAN NOT NULL DEFAULT FALSE
);
```

তিনটে সিদ্ধান্ত ব্যাখ্যা করার মতো।

**Follow graph দুবার লেখা হচ্ছে।** `following` আর `followers` একই তথ্য উল্টো দিক থেকে। কারণ দুটো query pattern সম্পূর্ণ আলাদা: প্রোফাইল পেজ জানতে চায় "X কাদের ফলো করে", আর fan-out worker জানতে চায় "X-কে কারা ফলো করে"। একটাই টেবিল রাখলে দ্বিতীয় query-টা প্রতিবার cross-shard scatter হয়ে যাবে। এটা ১০ নম্বর চ্যাপ্টারের সেই শিক্ষা — শার্ডেড দুনিয়ায় ডিনরমালাইজেশন বিলাসিতা নয়, বাধ্যবাধকতা।

**post_id হলো snowflake id, autoincrement নয়।** শার্ডেড সিস্টেমে global autoincrement অসম্ভব। snowflake id (টাইমস্ট্যাম্প + মেশিন id + সিকোয়েন্স) globally unique, আর যেহেতু উপরের বিটগুলো সময়, তাই id দিয়েই সময় অনুযায়ী sort করা যায় — cursor pagination-এর জন্য এটা সরাসরি ব্যবহারযোগ্য (১২ নম্বর চ্যাপ্টার)।

**`followers` টেবিলে `is_active` কলামটা।** এটাই সেই ৬০–৭০% fan-out কাজ বাঁচানোর সুইচ। নিষ্ক্রিয় ফলোয়ারদের timeline লেখা হবে না; তারা ফিরে এলে তাদের timeline চাহিদামতো rebuild হবে।

Redis-এ কাঠামোটা এরকম:

```
timeline:{user_id}       ZSET   member = post_id, score = rank score
                                capped at 800 via ZREMRANGEBYRANK
post:{post_id}           HASH   body, author, created_at, media_key
following:{user_id}      SET    followee ids, TTL 10m
celebs:{user_id}         SET    followed celebrity ids, TTL 10m
stats:{user_id}          HASH   follower_count, is_celebrity
```

## ধাপ ১০: ইমপ্লিমেন্টেশন

নিচে ফিড সিস্টেমের কেন্দ্রীয় অংশটা — hybrid fan-out সহ post ingestion, fan-out worker, আর ranked merge সহ feed read path, cursor pagination সমেত।

<CodeTabs tsFile="feed-service.ts" goFile="feed_service.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import Redis, { type Cluster } from 'ioredis';

// --- Configuration ---
const TIMELINE_CAP = 800;
const FANOUT_THRESHOLD = Number(process.env.FANOUT_THRESHOLD || 50_000);
const FANOUT_BATCH = 1_000;
const CELEB_POSTS_PER_AUTHOR = 20;
const HALF_LIFE_HOURS = 6;

// --- Types ---
interface Post {
	postId: string; // snowflake, time-ordered
	authorId: string;
	body: string;
	mediaKey?: string;
	createdAt: number; // unix ms
	likes: number;
	replies: number;
	reshares: number;
	impressions: number;
}

interface FeedItem {
	postId: string;
	authorId: string;
	score: number;
	createdAt: number;
}

interface FeedPage {
	items: Post[];
	nextCursor: string | null;
}

interface GraphStore {
	activeFollowers(authorId: string, after?: string): Promise<{ ids: string[]; next?: string }>;
	followerCount(authorId: string): Promise<number>;
	followedCelebrities(userId: string): Promise<string[]>;
}

interface PostStore {
	insert(post: Post): Promise<void>;
	multiGet(postIds: string[]): Promise<Post[]>;
	recentByAuthor(authorId: string, limit: number): Promise<Post[]>;
}

interface JobQueue {
	enqueue(name: string, payload: unknown, opts?: { priority?: 'high' | 'low' }): Promise<void>;
}

// --- Ranking ---
function rankScore(post: Post, affinity: number, now: number): number {
	const ageHours = Math.max(0, (now - post.createdAt) / 3_600_000);
	const recency = Math.exp(-ageHours / HALF_LIFE_HOURS);

	const weighted = post.likes + 3 * post.replies + 5 * post.reshares;
	const engagement = weighted / Math.max(post.impressions, 1);

	const mediaBonus = post.mediaKey ? 0.05 : 0;

	return 0.45 * recency + 0.3 * affinity + 0.2 * Math.min(engagement, 1) + mediaBonus;
}

// --- Write path ---
export class PostService {
	constructor(
		private posts: PostStore,
		private graph: GraphStore,
		private queue: JobQueue
	) {}

	/**
	 * Accepting a post must be fast. Everything expensive is queued.
	 */
	async createPost(authorId: string, body: string, mediaKey?: string): Promise<Post> {
		const post: Post = {
			postId: snowflake(),
			authorId,
			body,
			mediaKey,
			createdAt: Date.now(),
			likes: 0,
			replies: 0,
			reshares: 0,
			impressions: 0
		};

		// 1. Durable write to the source of truth.
		await this.posts.insert(post);

		// 2. Decide push vs pull based on audience size.
		const followers = await this.graph.followerCount(authorId);

		if (followers <= FANOUT_THRESHOLD) {
			await this.queue.enqueue('fanout', { postId: post.postId, authorId }, { priority: 'high' });
		} else {
			// Celebrity: no fan-out at all. Readers will pull this post.
			console.log(
				`[post] celebrity path for author=${authorId} followers=${followers} post=${post.postId}`
			);
		}

		return post;
	}
}

// --- Fan-out worker ---
export class FanoutWorker {
	constructor(
		private redis: Cluster | Redis,
		private graph: GraphStore,
		private posts: PostStore
	) {}

	/**
	 * Push one post into every active follower's timeline, in batches.
	 * Idempotent: ZADD of the same member simply updates the score.
	 */
	async handle(job: { postId: string; authorId: string }): Promise<number> {
		const [post] = await this.posts.multiGet([job.postId]);
		if (!post) {
			console.warn(`[fanout] post ${job.postId} vanished, dropping job`);
			return 0;
		}

		const now = Date.now();
		// Write-time score is affinity-free; the read path re-ranks with affinity.
		const baseScore = rankScore(post, 0, now);

		let cursor: string | undefined;
		let written = 0;

		do {
			const page = await this.graph.activeFollowers(job.authorId, cursor);
			cursor = page.next;

			for (let i = 0; i < page.ids.length; i += FANOUT_BATCH) {
				const chunk = page.ids.slice(i, i + FANOUT_BATCH);
				const pipeline = this.redis.pipeline();

				for (const followerId of chunk) {
					const key = `timeline:${followerId}`;
					pipeline.zadd(key, baseScore, post.postId);
					// Keep only the top N entries; this is a cache, not an archive.
					pipeline.zremrangebyrank(key, 0, -(TIMELINE_CAP + 1));
				}

				await pipeline.exec();
				written += chunk.length;
			}
		} while (cursor);

		console.log(`[fanout] post=${post.postId} author=${job.authorId} timelines=${written}`);
		return written;
	}
}

// --- Read path ---
export class FeedService {
	constructor(
		private redis: Cluster | Redis,
		private graph: GraphStore,
		private posts: PostStore
	) {}

	async getFeed(userId: string, cursor: string | null, limit = 30): Promise<FeedPage> {
		const now = Date.now();
		const maxScore = cursor ? decodeCursor(cursor) : Number.POSITIVE_INFINITY;

		// 1. Pushed candidates: one sorted-set read, already ranked at write time.
		const pushed = await this.readPushed(userId, maxScore);

		// 2. Pulled candidates: recent posts from followed celebrities.
		const pulled = await this.readCelebrityPosts(userId);

		// 3. Merge, dedupe, re-rank with viewer affinity.
		const affinity = await this.affinityMap(userId);
		const merged = new Map<string, FeedItem>();

		for (const item of pushed) merged.set(item.postId, item);

		for (const post of pulled) {
			const score = rankScore(post, affinity.get(post.authorId) ?? 0, now);
			if (score >= maxScore) continue; // already past this page
			merged.set(post.postId, {
				postId: post.postId,
				authorId: post.authorId,
				score,
				createdAt: post.createdAt
			});
		}

		const ordered = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);

		// 4. Hydrate bodies in a single multi-get.
		const bodies = await this.posts.multiGet(ordered.map((i) => i.postId));
		const byId = new Map(bodies.map((p) => [p.postId, p]));

		const items = ordered.map((i) => byId.get(i.postId)).filter((p): p is Post => Boolean(p));

		const last = ordered.at(-1);
		return {
			items,
			nextCursor: ordered.length === limit && last ? encodeCursor(last.score) : null
		};
	}

	private async readPushed(userId: string, maxScore: number): Promise<FeedItem[]> {
		const max = maxScore === Number.POSITIVE_INFINITY ? '+inf' : `(${maxScore}`;

		const raw = await this.redis.zrevrangebyscore(
			`timeline:${userId}`,
			max,
			'-inf',
			'WITHSCORES',
			'LIMIT',
			0,
			400
		);

		const out: FeedItem[] = [];
		for (let i = 0; i < raw.length; i += 2) {
			out.push({
				postId: raw[i],
				authorId: '', // filled during hydration
				score: Number(raw[i + 1]),
				createdAt: 0
			});
		}
		return out;
	}

	private async readCelebrityPosts(userId: string): Promise<Post[]> {
		const celebs = await this.graph.followedCelebrities(userId);
		if (celebs.length === 0) return [];

		// Small N by construction: celebrities are a tiny slice of any follow list.
		const lists = await Promise.all(
			celebs.map((id) => this.posts.recentByAuthor(id, CELEB_POSTS_PER_AUTHOR))
		);
		return lists.flat();
	}

	private async affinityMap(userId: string): Promise<Map<string, number>> {
		const raw = await this.redis.hgetall(`affinity:${userId}`);
		const map = new Map<string, number>();
		for (const [authorId, value] of Object.entries(raw)) {
			map.set(authorId, Number(value));
		}
		return map;
	}

	/**
	 * Rebuild a timeline from the source of truth after a cache-shard loss
	 * or when a dormant user returns.
	 */
	async rebuildTimeline(userId: string): Promise<number> {
		const key = `timeline:${userId}`;
		const following = await this.redis.smembers(`following:${userId}`);
		const now = Date.now();

		const pipeline = this.redis.pipeline();
		let count = 0;

		for (const authorId of following) {
			const recent = await this.posts.recentByAuthor(authorId, 20);
			for (const post of recent) {
				pipeline.zadd(key, rankScore(post, 0, now), post.postId);
				count++;
			}
		}

		pipeline.zremrangebyrank(key, 0, -(TIMELINE_CAP + 1));
		await pipeline.exec();

		console.log(`[rebuild] user=${userId} entries=${count}`);
		return count;
	}
}

// --- Cursor helpers (opaque to clients, see chapter 12) ---
function encodeCursor(score: number): string {
	return Buffer.from(JSON.stringify({ s: score })).toString('base64url');
}

function decodeCursor(cursor: string): number {
	try {
		const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
		const score = Number(parsed.s);
		return Number.isFinite(score) ? score : Number.POSITIVE_INFINITY;
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

// --- Snowflake id: time-ordered and globally unique across shards ---
const EPOCH = 1_700_000_000_000;
const MACHINE_ID = Number(process.env.MACHINE_ID || 1) & 0x3ff;
let lastMs = 0;
let sequence = 0;

function snowflake(): string {
	let now = Date.now();
	if (now === lastMs) {
		sequence = (sequence + 1) & 0xfff;
		if (sequence === 0) {
			while (now <= lastMs) now = Date.now();
		}
	} else {
		sequence = 0;
	}
	lastMs = now;

	const id = (
		(BigInt(now - EPOCH) << 22n) |
		(BigInt(MACHINE_ID) << 12n) |
		BigInt(sequence)
	).toString();
	return id;
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package feed

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log"
	"math"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// --- Configuration ---
const (
	timelineCap          = 800
	fanoutBatch          = 1000
	celebPostsPerAuthor  = 20
	halfLifeHours        = 6.0
	defaultPageSize      = 30
	candidateWindow      = 400
)

var fanoutThreshold int64 = 50_000

// --- Types ---
type Post struct {
	PostID      string `json:"postId"` // snowflake, time-ordered
	AuthorID    string `json:"authorId"`
	Body        string `json:"body"`
	MediaKey    string `json:"mediaKey,omitempty"`
	CreatedAt   int64  `json:"createdAt"` // unix ms
	Likes       int64  `json:"likes"`
	Replies     int64  `json:"replies"`
	Reshares    int64  `json:"reshares"`
	Impressions int64  `json:"impressions"`
}

type FeedItem struct {
	PostID   string
	AuthorID string
	Score    float64
}

type FeedPage struct {
	Items      []Post  `json:"items"`
	NextCursor *string `json:"nextCursor"`
}

type FollowerPage struct {
	IDs  []string
	Next string
}

type GraphStore interface {
	ActiveFollowers(ctx context.Context, authorID, after string) (FollowerPage, error)
	FollowerCount(ctx context.Context, authorID string) (int64, error)
	FollowedCelebrities(ctx context.Context, userID string) ([]string, error)
}

type PostStore interface {
	Insert(ctx context.Context, p Post) error
	MultiGet(ctx context.Context, postIDs []string) ([]Post, error)
	RecentByAuthor(ctx context.Context, authorID string, limit int) ([]Post, error)
}

type JobQueue interface {
	Enqueue(ctx context.Context, name string, payload any, priority string) error
}

// --- Ranking ---
func rankScore(p Post, affinity float64, nowMS int64) float64 {
	ageHours := math.Max(0, float64(nowMS-p.CreatedAt)/3_600_000)
	recency := math.Exp(-ageHours / halfLifeHours)

	weighted := float64(p.Likes + 3*p.Replies + 5*p.Reshares)
	engagement := weighted / math.Max(float64(p.Impressions), 1)

	mediaBonus := 0.0
	if p.MediaKey != "" {
		mediaBonus = 0.05
	}

	return 0.45*recency + 0.30*affinity + 0.20*math.Min(engagement, 1) + mediaBonus
}

// --- Write path ---
type PostService struct {
	posts PostStore
	graph GraphStore
	queue JobQueue
	ids   *SnowflakeGen
}

func NewPostService(posts PostStore, graph GraphStore, queue JobQueue, ids *SnowflakeGen) *PostService {
	return &PostService{posts: posts, graph: graph, queue: queue, ids: ids}
}

// CreatePost must be fast. Everything expensive is queued.
func (s *PostService) CreatePost(ctx context.Context, authorID, body, mediaKey string) (Post, error) {
	p := Post{
		PostID:    s.ids.Next(),
		AuthorID:  authorID,
		Body:      body,
		MediaKey:  mediaKey,
		CreatedAt: time.Now().UnixMilli(),
	}

	// 1. Durable write to the source of truth.
	if err := s.posts.Insert(ctx, p); err != nil {
		return Post{}, err
	}

	// 2. Decide push vs pull based on audience size.
	count, err := s.graph.FollowerCount(ctx, authorID)
	if err != nil {
		return Post{}, err
	}

	if count <= fanoutThreshold {
		payload := map[string]string{"postId": p.PostID, "authorId": authorID}
		if err := s.queue.Enqueue(ctx, "fanout", payload, "high"); err != nil {
			return Post{}, err
		}
	} else {
		// Celebrity: no fan-out at all. Readers will pull this post.
		log.Printf("[post] celebrity path author=%s followers=%d post=%s", authorID, count, p.PostID)
	}

	return p, nil
}

// --- Fan-out worker ---
type FanoutWorker struct {
	rdb   redis.UniversalClient
	graph GraphStore
	posts PostStore
}

func NewFanoutWorker(rdb redis.UniversalClient, graph GraphStore, posts PostStore) *FanoutWorker {
	return &FanoutWorker{rdb: rdb, graph: graph, posts: posts}
}

// Handle pushes one post into every active follower's timeline, in batches.
// Idempotent: ZAdd of the same member simply updates the score.
func (w *FanoutWorker) Handle(ctx context.Context, postID, authorID string) (int, error) {
	rows, err := w.posts.MultiGet(ctx, []string{postID})
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		log.Printf("[fanout] post %s vanished, dropping job", postID)
		return 0, nil
	}
	post := rows[0]

	now := time.Now().UnixMilli()
	// Write-time score is affinity-free; the read path re-ranks with affinity.
	baseScore := rankScore(post, 0, now)

	cursor := ""
	written := 0

	for {
		page, err := w.graph.ActiveFollowers(ctx, authorID, cursor)
		if err != nil {
			return written, err
		}

		for i := 0; i < len(page.IDs); i += fanoutBatch {
			end := i + fanoutBatch
			if end > len(page.IDs) {
				end = len(page.IDs)
			}

			pipe := w.rdb.Pipeline()
			for _, followerID := range page.IDs[i:end] {
				key := "timeline:" + followerID
				pipe.ZAdd(ctx, key, redis.Z{Score: baseScore, Member: post.PostID})
				// Keep only the top N entries; this is a cache, not an archive.
				pipe.ZRemRangeByRank(ctx, key, 0, -(timelineCap + 1))
			}
			if _, err := pipe.Exec(ctx); err != nil {
				return written, err
			}
			written += end - i
		}

		cursor = page.Next
		if cursor == "" {
			break
		}
	}

	log.Printf("[fanout] post=%s author=%s timelines=%d", post.PostID, authorID, written)
	return written, nil
}

// --- Read path ---
type FeedService struct {
	rdb   redis.UniversalClient
	graph GraphStore
	posts PostStore
}

func NewFeedService(rdb redis.UniversalClient, graph GraphStore, posts PostStore) *FeedService {
	return &FeedService{rdb: rdb, graph: graph, posts: posts}
}

func (s *FeedService) GetFeed(ctx context.Context, userID, cursor string, limit int) (FeedPage, error) {
	if limit <= 0 {
		limit = defaultPageSize
	}
	now := time.Now().UnixMilli()
	maxScore := decodeCursor(cursor)

	// 1. Pushed candidates: one sorted-set read, already ranked at write time.
	pushed, err := s.readPushed(ctx, userID, maxScore)
	if err != nil {
		return FeedPage{}, err
	}

	// 2. Pulled candidates: recent posts from followed celebrities.
	pulled, err := s.readCelebrityPosts(ctx, userID)
	if err != nil {
		return FeedPage{}, err
	}

	// 3. Merge, dedupe, re-rank with viewer affinity.
	affinity, err := s.affinityMap(ctx, userID)
	if err != nil {
		return FeedPage{}, err
	}

	merged := make(map[string]FeedItem, len(pushed)+len(pulled))
	for _, item := range pushed {
		merged[item.PostID] = item
	}
	for _, p := range pulled {
		score := rankScore(p, affinity[p.AuthorID], now)
		if score >= maxScore {
			continue // already past this page
		}
		merged[p.PostID] = FeedItem{PostID: p.PostID, AuthorID: p.AuthorID, Score: score}
	}

	ordered := make([]FeedItem, 0, len(merged))
	for _, item := range merged {
		ordered = append(ordered, item)
	}
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Score > ordered[j].Score })
	if len(ordered) > limit {
		ordered = ordered[:limit]
	}

	// 4. Hydrate bodies in a single multi-get.
	ids := make([]string, len(ordered))
	for i, item := range ordered {
		ids[i] = item.PostID
	}
	bodies, err := s.posts.MultiGet(ctx, ids)
	if err != nil {
		return FeedPage{}, err
	}

	byID := make(map[string]Post, len(bodies))
	for _, p := range bodies {
		byID[p.PostID] = p
	}

	items := make([]Post, 0, len(ordered))
	for _, item := range ordered {
		if p, ok := byID[item.PostID]; ok {
			items = append(items, p)
		}
	}

	var next *string
	if len(ordered) == limit {
		c := encodeCursor(ordered[len(ordered)-1].Score)
		next = &c
	}

	return FeedPage{Items: items, NextCursor: next}, nil
}

func (s *FeedService) readPushed(ctx context.Context, userID string, maxScore float64) ([]FeedItem, error) {
	max := "+inf"
	if !math.IsInf(maxScore, 1) {
		max = "(" + strconv.FormatFloat(maxScore, 'f', -1, 64)
	}

	res, err := s.rdb.ZRevRangeByScoreWithScores(ctx, "timeline:"+userID, &redis.ZRangeBy{
		Max:   max,
		Min:   "-inf",
		Count: candidateWindow,
	}).Result()
	if err != nil {
		return nil, err
	}

	out := make([]FeedItem, 0, len(res))
	for _, z := range res {
		member, _ := z.Member.(string)
		out = append(out, FeedItem{PostID: member, Score: z.Score})
	}
	return out, nil
}

func (s *FeedService) readCelebrityPosts(ctx context.Context, userID string) ([]Post, error) {
	celebs, err := s.graph.FollowedCelebrities(ctx, userID)
	if err != nil || len(celebs) == 0 {
		return nil, err
	}

	// Small N by construction: celebrities are a tiny slice of any follow list.
	var (
		mu   sync.Mutex
		wg   sync.WaitGroup
		all  []Post
		errs []error
	)

	for _, id := range celebs {
		wg.Add(1)
		go func(authorID string) {
			defer wg.Done()
			posts, err := s.posts.RecentByAuthor(ctx, authorID, celebPostsPerAuthor)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				errs = append(errs, err)
				return
			}
			all = append(all, posts...)
		}(id)
	}
	wg.Wait()

	if len(errs) > 0 {
		// Degrade rather than fail: a missing celebrity list is not fatal.
		log.Printf("[feed] %d celebrity fetches failed for user=%s", len(errs), userID)
	}
	return all, nil
}

func (s *FeedService) affinityMap(ctx context.Context, userID string) (map[string]float64, error) {
	raw, err := s.rdb.HGetAll(ctx, "affinity:"+userID).Result()
	if err != nil && err != redis.Nil {
		return nil, err
	}
	out := make(map[string]float64, len(raw))
	for author, v := range raw {
		f, convErr := strconv.ParseFloat(v, 64)
		if convErr == nil {
			out[author] = f
		}
	}
	return out, nil
}

// RebuildTimeline restores a timeline from the source of truth after a
// cache-shard loss or when a dormant user returns.
func (s *FeedService) RebuildTimeline(ctx context.Context, userID string) (int, error) {
	key := "timeline:" + userID
	following, err := s.rdb.SMembers(ctx, "following:"+userID).Result()
	if err != nil {
		return 0, err
	}

	now := time.Now().UnixMilli()
	pipe := s.rdb.Pipeline()
	count := 0

	for _, authorID := range following {
		recent, err := s.posts.RecentByAuthor(ctx, authorID, 20)
		if err != nil {
			return count, err
		}
		for _, p := range recent {
			pipe.ZAdd(ctx, key, redis.Z{Score: rankScore(p, 0, now), Member: p.PostID})
			count++
		}
	}

	pipe.ZRemRangeByRank(ctx, key, 0, -(timelineCap + 1))
	if _, err := pipe.Exec(ctx); err != nil {
		return count, err
	}

	log.Printf("[rebuild] user=%s entries=%d", userID, count)
	return count, nil
}

// --- Cursor helpers (opaque to clients, see chapter 12) ---
func encodeCursor(score float64) string {
	b, _ := json.Marshal(map[string]float64{"s": score})
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeCursor(cursor string) float64 {
	if cursor == "" {
		return math.Inf(1)
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return math.Inf(1)
	}
	var parsed map[string]float64
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return math.Inf(1)
	}
	if s, ok := parsed["s"]; ok {
		return s
	}
	return math.Inf(1)
}

// --- Snowflake id: time-ordered and globally unique across shards ---
const snowflakeEpoch int64 = 1_700_000_000_000

type SnowflakeGen struct {
	mu        sync.Mutex
	machineID int64
	lastMS    int64
	sequence  int64
}

func NewSnowflakeGen(machineID int64) *SnowflakeGen {
	return &SnowflakeGen{machineID: machineID & 0x3ff}
}

func (g *SnowflakeGen) Next() string {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now().UnixMilli()
	if now == g.lastMS {
		g.sequence = (g.sequence + 1) & 0xfff
		if g.sequence == 0 {
			for now <= g.lastMS {
				now = time.Now().UnixMilli()
			}
		}
	} else {
		g.sequence = 0
	}
	g.lastMS = now

	id := ((now - snowflakeEpoch) << 22) | (g.machineID << 12) | g.sequence
	return strconv.FormatInt(id, 10)
}
```

</div>
</CodeTabs>

## ধাপ ১১: স্কেলিং আর ফেইলিওর মোড

ডিজাইনটা দাঁড়িয়ে গেছে। এখন সবচেয়ে গুরুত্বপূর্ণ প্রশ্ন — এটা কোথায় ভাঙবে?

| ফেইলিওর                     | কী দেখা যায়                 | কী করবেন                                                                  |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| Fan-out worker পিছিয়ে পড়ল | ফিড বাসি, queue depth বাড়ছে | worker স্কেল আউট, threshold নামান, নিষ্ক্রিয় ফলোয়ার আরও কড়া করে ছাঁটুন |
| Redis shard হারিয়ে গেল     | ওই ইউজারদের ফিড খালি         | চাহিদামতো `rebuildTimeline`, ততক্ষণ celebrity + own posts দেখান           |
| Post store shard ধীর        | hydration timeout            | per-shard circuit breaker, ওই পোস্টগুলো বাদ দিয়ে পেজ সার্ভ করুন          |
| একজন mega account পোস্ট করল | queue-তে বিস্ফোরণ            | threshold-এর কারণে এটা আর push হয় না — কিন্তু alert রাখুন                |
| Hot celebrity list          | একটা Redis key-তে সব ট্রাফিক | in-process cache-এ ৩ সেকেন্ড, তারপর Redis — hot key ভাগ হয়ে যায়         |
| ranking ডিপ্লয় খারাপ হলো   | engagement পড়ে যায়         | ranking read-time বলেই instant rollback সম্ভব — এটাই এর বড় সুবিধা        |

কয়েকটা জিনিস যেগুলো ভুলে যাওয়া সবচেয়ে সহজ:

**Delete আর unfollow.** পোস্ট ডিলিট হলে কোটি timeline থেকে সেটা মোছা অবাস্তব। বাস্তব সমাধান — hydration-এর সময় ফিল্টার করা। timeline-এ id থেকে যাবে, কিন্তু post store থেকে সেটা আর ফিরবে না, তাই ফিডে দেখাবে না, আর TTL/cap-এর কারণে নিজে থেকেই বেরিয়ে যাবে। unfollow-এর ক্ষেত্রেও একই — পুরনো এন্ট্রি সাথে সাথে না মুছে read-এ ফিল্টার করাটাই সস্তা।

**নিজের পোস্ট।** fan-out async, তাই নিজের পোস্ট নিজের timeline-এ পৌঁছাতে কয়েক সেকেন্ড লাগতে পারে — আর ঠিক সেই সময়েই ইউজার ফিড রিফ্রেশ করে। সমাধান: পোস্ট করার সাথে সাথেই সিঙ্ক্রোনাসভাবে **নিজের** timeline-এ লিখে দিন, বাকিদেরটা queue-তে যাক। এক লাইনের কোড, কিন্তু এটাই ১৩ নম্বর চ্যাপ্টারের read-your-own-writes গ্যারান্টিটা দেয়।

**Pagination stability.** ranked ফিডে score বদলায়, তাই offset pagination-এ আইটেম বারবার আসবে বা হারাবে। এজন্যই কার্সরে score রাখা হয়েছে (১২ নম্বর চ্যাপ্টার) — তবু নিখুঁত নয়, কারণ score নিজেই সময়ের সাথে বদলায়। বাস্তব সিস্টেম তাই session-এর শুরুতে ক্যান্ডিডেট সেটটা ফ্রিজ করে রাখে।

<Callout type="tip">

এই সিস্টেমের সবচেয়ে গুরুত্বপূর্ণ ড্যাশবোর্ড মেট্রিক তিনটে: **fan-out queue depth** (ফ্রেশনেসের সরাসরি প্রক্সি), **feed read p99** (ইউজার যা অনুভব করে), আর **timeline cache hit ratio** (ধস আসার আগাম সংকেত)। queue depth বাড়তে থাকলে ইউজার আজ কিছু টের পাবে না, কিন্তু কাল ফিড এক ঘণ্টা পুরনো হবে — এই একটাই মেট্রিক আপনাকে আগে থেকে সাবধান করে।

</Callout>

## ইন্টারভিউতে এই ডিজাইন কীভাবে বলবেন

একটা কাঠামো, যেটা প্রায় সব সিস্টেম ডিজাইন ইন্টারভিউতে কাজে দেয়:

1. **স্কোপ কাটুন** (২ মিনিট) — কী বানাচ্ছি, কী বানাচ্ছি না।
2. **সংখ্যা বের করুন** (৩ মিনিট) — বিশেষ করে read:write অনুপাত আর fan-out amplification। এই দুটো সংখ্যাই বাকি আলোচনাটা চালাবে।
3. **সরল ডিজাইন দিন** (৫ মিনিট) — fan-out on write, কারণ read:write ৫০:১।
4. **নিজেই সেটা ভাঙুন** (৫ মিনিট) — celebrity problem। ইন্টারভিউয়ারকে ধরিয়ে দিতে দেবেন না, নিজে ধরুন।
5. **Hybrid দিয়ে ঠিক করুন** (৫ মিনিট) — threshold, merge at read, কেন খরচ কম।
6. **গভীরে যান** (১০ মিনিট) — ranking, caching, schema, sharding key।
7. **ফেইলিওর মোড বলুন** (৫ মিনিট) — এই অংশটাই সিনিয়র আর জুনিয়র উত্তরের মধ্যে পার্থক্য গড়ে দেয়।

<div class="takeaways">

### মূল শেখা

- ফিড সিস্টেমের আসল সংখ্যা পোস্ট/সেকেন্ড নয় — **fan-out write amplification**। ১১৫ posts/sec থেকে ২৩,০০০ timeline writes/sec, দুইশো গুণ। এই একটা হিসাবই পুরো আর্কিটেকচার ঠিক করে দেয়
- read:write অনুপাত ৫০:১ হলে read-কে সস্তা করাই লাভজনক, তাই ডিফল্ট **fan-out on write** — কিন্তু follower distribution power law বলে সেটা একা কখনো যথেষ্ট নয়
- **Celebrity problem** আসলে ১০ নম্বর চ্যাপ্টারের hot key সমস্যা, শুধু কিউতে। সমাধানও একই — hot জিনিসকে সাধারণ পথ থেকে সরিয়ে দিন। threshold-এর উপরে push নয়, read-এ pull
- Timeline হলো **ক্যাশ, ডেটাবেস নয়** — cap দিন, হারালে rebuild করুন, কখনো সত্যের উৎস বানাবেন না
- Ranking দুই ধাপে: সস্তা **candidate generation** write-time-এ, দামি **scoring** read-time-এ। এতে ফর্মুলা যেকোনো দিন বদলানো যায় আর খারাপ ডিপ্লয় সাথে সাথে rollback করা যায়
- Delete আর unfollow কোটি timeline থেকে মুছে বেড়ানোর জিনিস নয় — **hydration-এ ফিল্টার করুন**, cap-ই বাকিটা করে দেবে
- নিজের পোস্ট নিজের timeline-এ সিঙ্ক্রোনাসভাবে লিখুন — এক লাইনের কোডে **read-your-own-writes** পাওয়া যায়
- সিনিয়র উত্তরের পার্থক্য ডিজাইনে নয়, **ফেইলিওর মোডে** — কী ভাঙবে, কীভাবে টের পাবেন, আর কোন নবটা ঘোরাবেন

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Twitter/X**-এর বিখ্যাত timeline আর্কিটেকচার ঠিক এই hybrid মডেলেই চলে — সাধারণ ইউজারের পোস্ট Redis timeline-এ push হয়, আর অতি-জনপ্রিয় অ্যাকাউন্টের পোস্ট read-এ merge হয়
- **Instagram** ফিডকে candidate generation আর ranking — এই দুই ধাপে ভাগ করে, আর ranking মডেল প্রতিনিয়ত A/B টেস্ট হয় বলেই সেটা read-time-এ রাখা হয়েছে
- **LinkedIn** আর **Facebook** নিষ্ক্রিয় ইউজারদের জন্য fan-out বন্ধ রেখে বিপুল কাজ বাঁচায়, আর তারা ফিরে এলে timeline চাহিদামতো তৈরি করে
- **যেকোনো নোটিফিকেশন বা activity feed** — একই প্যাটার্ন প্রযোজ্য: push-heavy ডিফল্ট, hot producer-এর জন্য pull, আর precomputed লিস্টকে সবসময় পুনর্গঠনযোগ্য ক্যাশ হিসেবে ভাবা

</div>
