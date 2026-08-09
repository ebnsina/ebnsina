---
title: 'Estimation — খাতা-কলমের হিসাব'
subtitle: 'QPS, read/write ratio, storage growth, bandwidth, সার্ভার সংখ্যা — যে অঙ্কগুলো ডিজাইনের আকার ঠিক করে দেয়।'
chapter: 3
level: 'beginner'
readingTime: '১৮ মিনিট'
topics: ['estimation', 'capacity planning', 'QPS', 'storage', 'bandwidth']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

বিয়ের রান্নার হিসাব। "চারশো লোক, জনপ্রতি ২৫০ গ্রাম মাংস, তাহলে ১০০ কেজি; দশ কেজির এক ডেকচি, তাহলে দশ ডেকচি; এক ডেকচি রাঁধতে দেড় ঘণ্টা, তিনটা চুলা — তাহলে পাঁচ ঘণ্টা।" কেউ ক্যালকুলেটর বের করে না, কিন্তু হিসাবটা কাজ করে। System design-এর estimation ঠিক এটাই।

</Callout>

## গল্পে বুঝি

সমরকন্দে আল-বিরুনির বাবুর্চিখানা। শহরের গভর্নর এসে বললেন, "আগামী শুক্রবার আমার ছেলের আকিকা, আপনি রাঁধবেন।"

আল-বিরুনি খাতা বের করে না, চোখ বন্ধ করে হিসাব শুরু করে।

"কতজন?" — "প্রায় হাজারখানেক।" আল-বিরুনি জানে "প্রায় হাজার" মানে বাস্তবে বারোশো, কারণ দাওয়াত পাওয়া লোক সঙ্গে আরও কাউকে আনে। সে ১,২০০ ধরে নেয় — **অনুমানে সবসময় একটু উপরের দিকে যেতে হয়**।

জনপ্রতি মাংস আড়াইশো গ্রাম। ১,২০০ × ২৫০ গ্রাম = ৩০০ কেজি। চাল জনপ্রতি ২০০ গ্রাম, মানে ২৪০ কেজি। এই হলো **মোট চাহিদা**।

কিন্তু আসল সমস্যা মোট নয়, **সময়ের সাথে চাহিদা**। সবাই একসাথে খেতে বসবে না — জুম্মার নামাজের পরে এক ঘণ্টার মধ্যে ৭০% লোক চলে আসবে, বাকিরা ছড়িয়ে ছিটিয়ে। মানে গড়ে ঘণ্টায় ৩০০ জন হলেও **পিক সময়ে ঘণ্টায় ৮০০ জন**। আল-বিরুনি জানে, রান্নাঘর গড়ের জন্য বানালে পিকে ধ্বংস হয়ে যাবে। সে **পিক-টু-গড় অনুপাত** ধরে — এখানে প্রায় ৩ গুণ।

এবার ক্ষমতার হিসাব। এক ডেকচিতে ২০ কেজি, রাঁধতে দেড় ঘণ্টা। ৩০০ কেজির জন্য ১৫ ডেকচি রান্না। তার চুলা আছে চারটা। ১৫ ÷ ৪ = ৪ ব্যাচ, প্রতি ব্যাচ দেড় ঘণ্টা = ৬ ঘণ্টা। খাওয়া শুরু দুপুর একটায়, তাই রান্না শুরু করতে হবে সকাল সাতটায়। এটাই **capacity planning** — চাহিদাকে প্রতি-ইউনিট ক্ষমতা দিয়ে ভাগ করে যন্ত্র ও সময়ের সংখ্যা বের করা।

তারপর সে থামে আর ভাবে: একটা চুলার হাঁড়ি ফেটে গেলে? তখন তিন চুলায় ৬ ব্যাচ = ৯ ঘণ্টা, দেরি হয়ে যাবে। তাই সে পাঁচ নম্বর একটা চুলা তৈরি রাখে যেটা ব্যবহার হবে না, শুধু বিপদের জন্য। এটাই **headroom** — সবসময় শূন্য অতিরিক্ত ক্ষমতা নিয়ে চললে যেকোনো একটা গোলযোগেই সবকিছু ভেঙে পড়ে।

আর গুদাম? প্রতি সপ্তাহে যদি এমন একটা অনুষ্ঠান থাকে, বছরে ৫২ × ৩০০ কেজি = ১৫.৬ টন মাংস কিনতে হবে। ফ্রিজের জায়গা কতটুকু লাগবে, সেটা এই **বৃদ্ধির হার** থেকে আসে, একদিনের হিসাব থেকে নয়।

মিলিয়ে নিই: হাজারের বদলে বারোশো ধরা হলো **safety margin**, জনপ্রতি ২৫০ গ্রাম হলো **per-unit cost**, ঘণ্টায় ৮০০ জন হলো **peak QPS** (গড় নয়), ডেকচি প্রতি ক্ষমতা হলো **per-server throughput**, ১৫ ÷ ৪ ভাগটা হলো **server count**, পাঁচ নম্বর চুলা হলো **headroom / redundancy**, আর বছরের ১৫.৬ টন হলো **storage growth**। System design-এর estimation ঠিক এই ছয়টা জিনিসেরই হিসাব — শুধু মাংসের বদলে বাইট, আর চুলার বদলে সার্ভার।

## Estimation কেন করবেন

নতুনরা ভাবে estimation ইন্টারভিউয়ের একটা আচার। সেটা নয়। এর একটাই উদ্দেশ্য: **সমস্যাটা কোন আকারের সেটা ঠিক করা।**

কারণ ডিজাইনের সিদ্ধান্তগুলো আকার-নির্ভর:

- দিনে ১০ লাখ রিকোয়েস্ট মানে সেকেন্ডে গড়ে ১২ — একটা মেশিন, একটা Postgres, কোনো cache-ও লাগবে না
- দিনে ১০০ কোটি রিকোয়েস্ট মানে সেকেন্ডে ১২,০০০ — cache বাধ্যতামূলক, একাধিক app server, সম্ভবত shard
- ৫০ GB ডেটা মানে একটা মেশিনে সব ধরে যায়, এমনকি RAM-এও অনেকটা
- ৫০ TB ডেটা মানে partition, archive, আলাদা storage tier

**দুই অর্ডার-অফ-ম্যাগনিটিউড ভুল হলে ডিজাইনটাই ভুল।** কিন্তু ২০-৩০% ভুল হলে কিছুই যায় আসে না। তাই estimation-এ নিখুঁত হওয়ার চেষ্টা করবেন না — গোল সংখ্যা নিন, মাথায় গুণ করুন, দ্রুত এগোন।

<Callout type="tip">

সব সংখ্যা গোল করে নিন। ৮৬,৪০০ সেকেন্ডের বদলে ১ লাখ। ১,০২৪-এর বদলে ১,০০০। ৩৬৫ দিনের বদলে ৪০০। ভুলটা ১৫%-এর কম থাকবে, আর হিসাব মাথায় করা যাবে। **যে হিসাব মাথায় করা যায় না, সেটা মিটিংয়ে করা যায় না।**

</Callout>

## মুখস্থ রাখার সংখ্যা

তিনটা জিনিস মনে রাখলে বাকি সব বেরিয়ে আসে।

**দিনে সেকেন্ড:** ৮৬,৪০০ ≈ **১ লাখ**। তাই দিনে ১০ লাখ ঘটনা মানে সেকেন্ডে ১০। দিনে ১০ কোটি মানে সেকেন্ডে ১,০০০। ভাগটা মাথায় হয়ে যায় — শুধু পাঁচটা শূন্য কাটুন।

**আকারের একক:**

| একক | বাইট  | মনে রাখার উপায়       |
| --- | ----- | --------------------- |
| KB  | ১০^৩  | একটা ছোট JSON         |
| MB  | ১০^৬  | একটা গান, একটা ছবি    |
| GB  | ১০^৯  | একটা সিনেমা           |
| TB  | ১০^১২ | ১,০০০ সিনেমা          |
| PB  | ১০^১৫ | একটা বড় কোম্পানির লগ |

**সাধারণ জিনিসের আকার:**

| জিনিস                   | আনুমানিক আকার                  |
| ----------------------- | ------------------------------ |
| একটা UUID               | ১৬ বাইট (বাইনারি), ৩৬ (টেক্সট) |
| একটা টাইমস্ট্যাম্প      | ৮ বাইট                         |
| একটা URL                | ১০০ বাইট                       |
| একটা টুইট-আকারের টেক্সট | ৩০০ বাইট                       |
| একটা ইউজার row          | ১ KB                           |
| একটা লগ লাইন            | ৫০০ বাইট                       |
| একটা থাম্বনেইল          | ২০ KB                          |
| একটা ফোনের ছবি          | ৩ MB                           |
| এক মিনিট 1080p ভিডিও    | ৩০ MB                          |

## QPS: সবচেয়ে গুরুত্বপূর্ণ সংখ্যা

**QPS (queries per second)** হলো সেকেন্ডে কতগুলো রিকোয়েস্ট। প্রায় সব ক্ষমতার হিসাব এখান থেকে শুরু।

সূত্রটা সরল:

```text
গড় QPS = (দৈনিক সক্রিয় ইউজার × জনপ্রতি দৈনিক অ্যাকশন) / ১০০,০০০

পিক QPS = গড় QPS × পিক ফ্যাক্টর    (সাধারণত ২x থেকে ১০x)
```

**পিক ফ্যাক্টর** আসে ব্যবহারের ধরন থেকে। একটা বিশ্বব্যাপী সার্ভিসে ট্রাফিক টাইমজোনে ছড়িয়ে থাকে, পিক হয়তো গড়ের ২ গুণ। একটা দেশভিত্তিক সার্ভিসে সবাই একই সন্ধ্যায় সক্রিয় — পিক ৫ গুণ। আর ইভেন্ট-নির্ভর সার্ভিসে (খেলার স্কোর, পরীক্ষার ফল, ফ্ল্যাশ সেল) পিক ৫০ গুণও হতে পারে।

<Callout type="warning">

**গড় QPS দিয়ে কখনো ক্ষমতা ঠিক করবেন না।** সার্ভার গড় ট্রাফিকে মরে না, পিকে মরে। যদি পিক ফ্যাক্টর জানা না থাকে, ৩ ধরে নিন এবং সেটা লিখে রাখুন যাতে পরে যাচাই করা যায়।

</Callout>

### উদাহরণ: একটা ছবি শেয়ারিং অ্যাপ

ধরা যাক:

- ৫ কোটি নিবন্ধিত ইউজার, তার ২০% দৈনিক সক্রিয় → **১ কোটি DAU**
- প্রতিজন দিনে গড়ে ০.২টা ছবি আপলোড করে → দিনে ২০ লাখ আপলোড
- প্রতিজন দিনে গড়ে ৫০টা ছবি দেখে → দিনে ৫০ কোটি ভিউ

**Write QPS:**

```text
2,000,000 / 100,000 = 20 writes/sec (average)
peak factor 5  ->  100 writes/sec (peak)
```

**Read QPS:**

```text
500,000,000 / 100,000 = 5,000 reads/sec (average)
peak factor 5  ->  25,000 reads/sec (peak)
```

**Read:Write অনুপাত = ৫০০ কোটি ÷ ২০ লাখ = ২৫০:১**

এই একটা অনুপাত পুরো আর্কিটেকচার ঠিক করে দিল। ২৫০:১ মানে এটা প্রবলভাবে read-heavy সিস্টেম। ফলাফল:

- Cache-এ বিপুল লাভ হবে (৯০% hit rate মানে ডেটাবেসে যাওয়া read ২৫,০০০ থেকে নেমে ২,৫০০)
- Read replica যোগ করা অর্থবহ
- Write path-এ জটিল অপটিমাইজেশন করে লাভ নেই — সেকেন্ডে ১০০টা write যেকোনো ডেটাবেস হাসতে হাসতে সামলায়
- বরং write path-এ একটু বেশি কাজ করে (যেমন আপলোডের সময়েই থাম্বনেইল বানিয়ে রাখা) read সহজ করা লাভজনক

<Callout type="info">

**Read:write অনুপাত সম্ভবত estimation-এর একক সবচেয়ে কাজের সংখ্যা।** ১০:১-এর বেশি হলে cache-ই আপনার প্রধান হাতিয়ার। ১:১-এর কাছাকাছি হলে (যেমন চ্যাট, লগ ইনজেশন) সমস্যাটা সম্পূর্ণ ভিন্ন — তখন write path আর storage-ই মূল চ্যালেঞ্জ।

</Callout>

## Storage: আজ কত, এক বছরে কত

Storage-এর হিসাবে দুইটা সংখ্যা লাগে: **প্রতি ইউনিটের আকার** আর **দৈনিক ইউনিট সংখ্যা**। তারপর গুণ, তারপর ৩৬৫ দিয়ে গুণ (বা ৪০০, গোল করে)।

আগের ছবি অ্যাপের জন্য:

```text
Per upload:
  original photo        3 MB
  large  (1080px)       400 KB
  medium (640px)        150 KB
  thumbnail (200px)      20 KB
  metadata row            1 KB
  ----------------------------
  total               ~3.6 MB

Daily:
  2,000,000 uploads x 3.6 MB = 7.2 TB/day

Yearly:
  7.2 TB x 365 = ~2,600 TB = ~2.6 PB/year
```

এখন এই সংখ্যাটা নিয়ে কী করবেন? প্রথমেই প্রশ্ন — **সবকিছু কি চিরকাল রাখতে হবে?** যদি দেখা যায় ৯৫% ভিউ প্রথম ৩০ দিনের ছবিতে, তাহলে পুরনো original ফাইলগুলো সস্তা cold storage-এ সরানো যায়। খরচ দশ গুণ কমে যায়। এই সিদ্ধান্তটা estimation না করলে কখনো নেওয়াই হতো না।

দ্বিতীয় প্রশ্ন — **replication ফ্যাক্টর**। ৩ কপি রাখলে ২.৬ PB হয়ে যায় ৭.৮ PB। Object storage সাধারণত নিজেই ৩ কপি রাখে এবং সেই খরচ দামের মধ্যেই ধরা থাকে, কিন্তু নিজে ডেটাবেস চালালে এটা আপনার হিসাবের অংশ।

### মেটাডেটা আলাদা করে হিসাব করুন

বড় ফাইল যায় object storage-এ, কিন্তু **মেটাডেটা যায় ডেটাবেসে** — আর ডেটাবেসের আকারই ঠিক করে আপনার index RAM-এ ধরবে কিনা।

```text
Metadata row per photo:
  photo_id (uuid)          16 B
  owner_id (uuid)          16 B
  created_at                8 B
  width, height             8 B
  storage_key             100 B
  caption (avg)           200 B
  counters (likes etc.)    24 B
  row overhead + index    ~120 B
  --------------------------------
  total                   ~500 B

2,000,000/day x 500 B = 1 GB/day  ->  365 GB/year
```

৩৬৫ GB/বছর — এটা এখনো একটা মেশিনের সমস্যা। পাঁচ বছরে ১.৮ TB, তখনো একটা ভালো Postgres ইনস্ট্যান্স সামলাবে (index ঠিক থাকলে)। অর্থাৎ **এই সিস্টেমে shard করার দরকার নেই** — অথচ ছবির মোট ২.৬ PB দেখে আতঙ্কিত হয়ে অনেকেই sharding-এর কথা ভাবা শুরু করে। বাইট আর row আলাদা করে হিসাব না করলে এই ভুলটা হয়।

## Bandwidth: যা প্রায়ই সবচেয়ে দামি

Bandwidth = QPS × প্রতি রিকোয়েস্টের আকার। এখানে read আর write আলাদা করে হিসাব করতে হয়, কারণ আকার সাধারণত সম্পূর্ণ ভিন্ন।

```text
Ingress (uploads):
  20 writes/sec x 3 MB   = 60 MB/s   = 480 Mbps  (average)
  peak 5x                = 300 MB/s  = 2.4 Gbps

Egress (views):
  most views serve the medium size, 150 KB
  5,000 reads/sec x 150 KB = 750 MB/s = 6 Gbps   (average)
  peak 5x                  = 3.7 GB/s = 30 Gbps
```

৩০ Gbps পিক egress — এটাই সেই মুহূর্ত যেখানে **CDN আলোচনার বিষয় থেকে বাধ্যতামূলক হয়ে যায়**। কারণ ক্লাউড প্রোভাইডারদের egress-এর দাম প্রতি GB-তে ধরা হয়, এবং এই আকারে সেটাই আপনার সবচেয়ে বড় বিল হবে।

মাসিক egress:

```text
750 MB/s x 100,000 s/day = 75 TB/day
75 TB x 30 = 2,250 TB/month = ~2.2 PB/month
```

ক্লাউড egress যদি প্রতি GB ০.০৮ ডলার হয়, তাহলে মাসে ১,৮০,০০০ ডলার। CDN-এ সেটা প্রতি GB ০.০১ ডলারে নামতে পারে — মাসে ২২,৫০০ ডলার। **এই একটা হিসাবই একটা কোম্পানির লাভ-ক্ষতির হিসাব বদলে দেয়।**

<Callout type="warning">

Estimation-এ bandwidth সবচেয়ে বেশি বাদ পড়ে, অথচ মিডিয়া-ভারী সিস্টেমে এটাই সবচেয়ে বড় খরচ। CPU সস্তা, RAM সস্তা, storage মোটামুটি সস্তা — **egress bandwidth দামি**।

</Callout>

## সার্ভার কয়টা লাগবে

এখন উল্টো দিক: চাহিদা জানা হয়ে গেছে, এবার প্রতি মেশিনের ক্ষমতা দিয়ে ভাগ করুন।

আধুনিক একটা মাঝারি সার্ভারের মোটামুটি ক্ষমতা (রক্ষণশীল অনুমান):

| কাজের ধরন                       | প্রতি মেশিনে সেকেন্ডে |
| ------------------------------- | --------------------- |
| সাধারণ JSON API (হালকা লজিক)    | ৩,০০০ – ১০,০০০        |
| API + একটা DB query             | ৮০০ – ৩,০০০           |
| ভারী গণনা / রেন্ডারিং           | ৫০ – ৩০০              |
| Redis (একক ইনস্ট্যান্স)         | ৫০,০০০ – ১,০০,০০০     |
| PostgreSQL simple read (cached) | ৫,০০০ – ২০,০০০        |
| PostgreSQL write (fsync সহ)     | ৫০০ – ৫,০০০           |

আমাদের ছবি অ্যাপের API লেয়ারের জন্য, পিক ২৫,০০০ read QPS ধরে:

```text
Assume 2,000 req/s per app server (API + cache lookup)

25,000 / 2,000 = 12.5  ->  13 servers

Add headroom: never plan above 60% utilisation
13 / 0.6 = ~22 servers

Add redundancy: survive losing one availability zone (of 3)
22 x 1.5 = ~33 servers
```

তিনটা সংখ্যা — ১৩, ২২, ৩৩ — এবং এদের মধ্যে পার্থক্যটাই অভিজ্ঞতা। ১৩ হলো কাগজের হিসাব। ২২ হলো বাস্তব, কারণ ১০০% ব্যবহারে চললে সামান্য স্পাইকেই latency বিস্ফোরিত হয়। ৩৩ হলো নিরাপদ, কারণ একটা zone চলে গেলেও সার্ভিস চালু থাকা দরকার।

<Callout type="tip">

**৬০-৭০% নিয়ম:** কোনো রিসোর্স (CPU, connection pool, ডিস্ক) ৭০%-এর বেশি ব্যস্ত থাকলে queueing শুরু হয় এবং latency দ্রুত বাড়ে। ৮৫%-এ latency প্রায় দ্বিগুণ, ৯৫%-এ পাঁচ গুণ। তাই ক্ষমতার হিসাব সবসময় ৬০-৭০% লক্ষ্য ধরে করুন।

</Callout>

## Cache-এর আকার

Cache-এর হিসাব করার সময় **৮০/২০ নিয়ম** (আরও বাস্তবে ৯০/১০) ধরে নিন: ২০% কনটেন্ট ৮০% ট্রাফিক টানে।

```text
Hot set: 20% of a day's photos are 80% of views
  daily photos: 2,000,000
  hot 20%:        400,000
  medium size:     150 KB
  cache size: 400,000 x 150 KB = 60 GB

For metadata caching (much cheaper):
  hot metadata rows: 400,000 x 500 B = 200 MB
```

৬০ GB ছবি cache করা মানে CDN-এর কাজ, Redis-এর নয়। ২০০ MB মেটাডেটা cache করা মানে একটা ছোট Redis ইনস্ট্যান্সেই হয়ে যায়। **আবারও: একই সিস্টেমের দুই ধরনের ডেটার জন্য সম্পূর্ণ ভিন্ন সমাধান, এবং সেটা বেরিয়ে এলো শুধু আলাদা করে হিসাব করার কারণে।**

## পুরো হিসাবটা একবারে

<Mermaid
title="Estimation-এর প্রবাহ"
code={`graph TB
  U["DAU x প্রতিজনের অ্যাকশন"] --> D["দৈনিক ঘটনা"]
  D --> Q["গড় QPS<br/>÷ ১ লাখ"]
  Q --> P["পিক QPS<br/>x পিক ফ্যাক্টর"]
  D --> S["Storage/দিন<br/>x প্রতি ইউনিট আকার"]
  S --> Y["Storage/বছর"]
  P --> B["Bandwidth<br/>x payload আকার"]
  P --> N["সার্ভার সংখ্যা<br/>÷ প্রতি সার্ভার ক্ষমতা"]
  N --> H["+ headroom + redundancy"]`}
/>

## Estimation ক্যালকুলেটর

নিচের মডিউলটা পুরো হিসাবটা কোডে ধরে রাখে। এটার আসল মূল্য মিটিংয়ে নয় — এর আসল মূল্য হলো তিন মাস পরে যখন প্রোডাক্ট বলে "আমাদের DAU দ্বিগুণ হচ্ছে", তখন এক সেকেন্ডে জানতে পারা যে ডিজাইনের কোন অংশটা প্রথমে ভাঙবে।

```typescript
// ---------------------------------------------------------------------------
// Back-of-the-envelope capacity estimation, made repeatable.
// Every number below is deliberately rounded the way you would round it on a
// whiteboard: 100,000 seconds per day, 1000 not 1024.
// ---------------------------------------------------------------------------

const SECONDS_PER_DAY = 100_000; // 86,400 rounded up — keeps mental maths honest
const DAYS_PER_YEAR = 365;

export interface WorkloadInput {
	name: string;
	dailyActiveUsers: number;
	writesPerUserPerDay: number;
	readsPerUserPerDay: number;
	peakFactor: number; // peak QPS / average QPS
	bytesPerWritePayload: number; // what the client uploads
	bytesPerStoredObject: number; // original + derivatives, per write
	bytesPerMetadataRow: number;
	bytesPerReadPayload: number; // what we send back per read
	hotSetFraction: number; // fraction of objects that are "hot"
	replicationFactor: number;
	retentionDays: number;
}

export interface ServerProfile {
	requestsPerSecondPerServer: number;
	targetUtilisation: number; // never plan above this
	zoneCount: number; // survive losing one zone
}

export interface Estimate {
	name: string;
	writeQpsAvg: number;
	writeQpsPeak: number;
	readQpsAvg: number;
	readQpsPeak: number;
	readWriteRatio: number;
	storagePerDayBytes: number;
	storageAtRetentionBytes: number;
	metadataPerYearBytes: number;
	ingressPeakBytesPerSec: number;
	egressAvgBytesPerSec: number;
	egressPeakBytesPerSec: number;
	egressPerMonthBytes: number;
	hotCacheBytes: number;
	appServersRaw: number;
	appServersWithHeadroom: number;
	appServersWithRedundancy: number;
}

// --- Formatting ----------------------------------------------------------
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];

export function humanBytes(bytes: number): string {
	if (bytes < 1000) return `${bytes.toFixed(0)} B`;
	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < UNITS.length - 1) {
		value /= 1000;
		unit++;
	}
	return `${value.toFixed(value >= 100 ? 0 : 1)} ${UNITS[unit]}`;
}

export function humanRate(bytesPerSec: number): string {
	const bitsPerSec = bytesPerSec * 8;
	if (bitsPerSec >= 1e9) return `${(bitsPerSec / 1e9).toFixed(1)} Gbps`;
	if (bitsPerSec >= 1e6) return `${(bitsPerSec / 1e6).toFixed(0)} Mbps`;
	return `${(bitsPerSec / 1e3).toFixed(0)} Kbps`;
}

// --- The estimate --------------------------------------------------------
export function estimate(w: WorkloadInput, s: ServerProfile): Estimate {
	const dailyWrites = w.dailyActiveUsers * w.writesPerUserPerDay;
	const dailyReads = w.dailyActiveUsers * w.readsPerUserPerDay;

	const writeQpsAvg = dailyWrites / SECONDS_PER_DAY;
	const readQpsAvg = dailyReads / SECONDS_PER_DAY;
	const writeQpsPeak = writeQpsAvg * w.peakFactor;
	const readQpsPeak = readQpsAvg * w.peakFactor;

	// Storage: stored bytes include every derivative we keep, times replication.
	const storagePerDayBytes = dailyWrites * w.bytesPerStoredObject * w.replicationFactor;
	const storageAtRetentionBytes = storagePerDayBytes * w.retentionDays;
	const metadataPerYearBytes = dailyWrites * w.bytesPerMetadataRow * DAYS_PER_YEAR;

	// Bandwidth: ingress is driven by writes, egress by reads. Egress is almost
	// always the expensive one and almost always the forgotten one.
	const ingressPeakBytesPerSec = writeQpsPeak * w.bytesPerWritePayload;
	const egressAvgBytesPerSec = readQpsAvg * w.bytesPerReadPayload;
	const egressPeakBytesPerSec = readQpsPeak * w.bytesPerReadPayload;
	const egressPerMonthBytes = egressAvgBytesPerSec * SECONDS_PER_DAY * 30;

	// Cache: only the hot fraction of a retention window needs to be resident.
	const objectsInHotWindow = dailyWrites * Math.min(w.retentionDays, 30);
	const hotCacheBytes = objectsInHotWindow * w.hotSetFraction * w.bytesPerReadPayload;

	// Servers: sized from peak, then padded for utilisation and zone loss.
	const totalPeakQps = readQpsPeak + writeQpsPeak;
	const appServersRaw = Math.ceil(totalPeakQps / s.requestsPerSecondPerServer);
	const appServersWithHeadroom = Math.ceil(appServersRaw / s.targetUtilisation);
	const zoneMultiplier = s.zoneCount / Math.max(1, s.zoneCount - 1);
	const appServersWithRedundancy = Math.ceil(appServersWithHeadroom * zoneMultiplier);

	return {
		name: w.name,
		writeQpsAvg,
		writeQpsPeak,
		readQpsAvg,
		readQpsPeak,
		readWriteRatio: dailyWrites === 0 ? Infinity : dailyReads / dailyWrites,
		storagePerDayBytes,
		storageAtRetentionBytes,
		metadataPerYearBytes,
		ingressPeakBytesPerSec,
		egressAvgBytesPerSec,
		egressPeakBytesPerSec,
		egressPerMonthBytes,
		hotCacheBytes,
		appServersRaw,
		appServersWithHeadroom,
		appServersWithRedundancy
	};
}

// --- Cost sketch ---------------------------------------------------------
export interface PriceBook {
	egressPerGbUsd: number;
	hotStoragePerGbMonthUsd: number;
	serverPerMonthUsd: number;
}

export function monthlyCostUsd(e: Estimate, p: PriceBook): Record<string, number> {
	const egressGb = e.egressPerMonthBytes / 1e9;
	const storedGb = e.storageAtRetentionBytes / 1e9;

	const egress = egressGb * p.egressPerGbUsd;
	const storage = storedGb * p.hotStoragePerGbMonthUsd;
	const compute = e.appServersWithRedundancy * p.serverPerMonthUsd;

	return {
		egress: Math.round(egress),
		storage: Math.round(storage),
		compute: Math.round(compute),
		total: Math.round(egress + storage + compute)
	};
}

// --- Report --------------------------------------------------------------
export function printEstimate(e: Estimate, cost: Record<string, number>): void {
	const rows: [string, string][] = [
		['write QPS (avg / peak)', `${e.writeQpsAvg.toFixed(0)} / ${e.writeQpsPeak.toFixed(0)}`],
		['read QPS (avg / peak)', `${e.readQpsAvg.toFixed(0)} / ${e.readQpsPeak.toFixed(0)}`],
		['read : write', `${e.readWriteRatio.toFixed(0)} : 1`],
		['storage per day', humanBytes(e.storagePerDayBytes)],
		['storage at retention', humanBytes(e.storageAtRetentionBytes)],
		['metadata per year', humanBytes(e.metadataPerYearBytes)],
		['ingress (peak)', humanRate(e.ingressPeakBytesPerSec)],
		[
			'egress (avg / peak)',
			`${humanRate(e.egressAvgBytesPerSec)} / ${humanRate(e.egressPeakBytesPerSec)}`
		],
		['egress per month', humanBytes(e.egressPerMonthBytes)],
		['hot cache working set', humanBytes(e.hotCacheBytes)],
		['app servers (raw)', String(e.appServersRaw)],
		['app servers (+headroom)', String(e.appServersWithHeadroom)],
		['app servers (+redundancy)', String(e.appServersWithRedundancy)],
		[
			'monthly cost (USD)',
			`${cost.total} (egress ${cost.egress}, storage ${cost.storage}, compute ${cost.compute})`
		]
	];

	console.log(`\n=== ${e.name} ===`);
	for (const [label, value] of rows) {
		console.log(`${label.padEnd(28)} ${value}`);
	}
}

// --- Worked example: the photo sharing app from this chapter -------------
const photoApp: WorkloadInput = {
	name: 'photo sharing',
	dailyActiveUsers: 10_000_000,
	writesPerUserPerDay: 0.2,
	readsPerUserPerDay: 50,
	peakFactor: 5,
	bytesPerWritePayload: 3_000_000, // 3 MB original upload
	bytesPerStoredObject: 3_600_000, // original + three derivatives
	bytesPerMetadataRow: 500,
	bytesPerReadPayload: 150_000, // medium size is what feeds render
	hotSetFraction: 0.2,
	replicationFactor: 1, // object storage prices replication in already
	retentionDays: 365
};

const serverProfile: ServerProfile = {
	requestsPerSecondPerServer: 2_000,
	targetUtilisation: 0.6,
	zoneCount: 3
};

const prices: PriceBook = {
	egressPerGbUsd: 0.02, // CDN-blended, not raw cloud egress
	hotStoragePerGbMonthUsd: 0.023,
	serverPerMonthUsd: 120
};

const result = estimate(photoApp, serverProfile);
printEstimate(result, monthlyCostUsd(result, prices));
```

## Estimation-এর সাধারণ ভুল

**গড় দিয়ে ক্ষমতা ঠিক করা।** সার্ভার পিকে মরে, গড়ে নয়।

**Peak factor অনুমান না করে ধরে নেওয়া।** সবচেয়ে ভালো হলো বাস্তব ট্রাফিকের গ্রাফ দেখা। না থাকলে ৩ ধরুন, কিন্তু লিখে রাখুন যে এটা অনুমান।

**Bandwidth ভুলে যাওয়া।** QPS আর storage হিসাব করে থেমে যাওয়া সবচেয়ে প্রচলিত ভুল।

**Metadata আর blob এক করে ফেলা।** ২.৬ PB ছবি দেখে ভয় পেয়ে shard করার কথা ভাবা, অথচ ডেটাবেসে মাত্র ৩৬৫ GB।

**১০০% ব্যবহার ধরে সার্ভার গোনা।** ৭০%-এর উপরে গেলে queue জমে, latency বিস্ফোরিত হয়।

**অতিরিক্ত নিখুঁত হওয়ার চেষ্টা।** ৮৬,৪০০ বনাম ১,০০,০০০ নিয়ে তর্ক করে সময় নষ্ট করবেন না। ভুলটা ১৫%, আর আপনার ইনপুট অনুমানগুলোর ভুল ৫০%।

**বৃদ্ধি হিসাব না করা।** আজকের সংখ্যা দিয়ে ডিজাইন করে ছয় মাসে আবার শুরু থেকে করতে হয়। আজকের দশগুণের জন্য ডিজাইন করুন।

<Callout type="tip">

Estimation শেষে সবসময় একটা বাক্য লিখুন: **"এই ডিজাইনটা X পর্যন্ত চলবে, তারপর Y জিনিসটা প্রথমে ভাঙবে।"** এই বাক্যটাই আপনার ভবিষ্যতের রোডম্যাপ, এবং on-call টিমের জন্য সবচেয়ে দামি তথ্য।

</Callout>

<div class="takeaways">

### মূল শেখা

- Estimation-এর উদ্দেশ্য নিখুঁত সংখ্যা নয় — সমস্যাটা কোন অর্ডার-অফ-ম্যাগনিটিউডের সেটা ঠিক করা
- দিনে ১ লাখ সেকেন্ড ধরে নিন; দৈনিক ঘটনা থেকে পাঁচটা শূন্য কাটলেই গড় QPS
- পিক QPS = গড় × পিক ফ্যাক্টর (২x থেকে ১০x); ক্ষমতা সবসময় পিক থেকে হিসাব করুন
- Read:write অনুপাত পুরো আর্কিটেকচার ঠিক করে দেয় — ১০:১-এর বেশি হলে cache প্রধান হাতিয়ার
- Blob storage আর metadata storage আলাদা করে হিসাব করুন; একটা PB-স্কেলের হতে পারে যখন অন্যটা এখনো একটা মেশিনের সমস্যা
- Egress bandwidth প্রায়ই সবচেয়ে বড় খরচ এবং সবচেয়ে বেশি ভুলে যাওয়া অংশ
- সার্ভার সংখ্যা = পিক QPS ÷ প্রতি সার্ভার ক্ষমতা, তারপর ৬০-৭০% utilisation-এর জন্য ভাগ, তারপর zone হারানোর জন্য গুণ
- শেষে লিখুন ডিজাইনটা কোন স্কেল পর্যন্ত টিকবে এবং তারপর কী প্রথমে ভাঙবে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **নতুন সিস্টেমের ডিজাইন ডকে** — cache/shard/queue লাগবে কিনা সেই তর্ক সংখ্যা দিয়ে মীমাংসা করা
- **ক্লাউড বিল কমানোর কাজে** — egress, storage tier আর instance সংখ্যার হিসাব করে দেখা কোথায় টাকা যাচ্ছে
- **ইন্টারভিউয়ে** — requirement-এর ঠিক পরেই তিন-চার মিনিটে QPS, storage, bandwidth বের করা; এটাই বাকি ডিজাইনের ভিত্তি
- **লঞ্চের আগে** — প্রত্যাশিত ট্রাফিকের ৩ গুণে সিস্টেম টিকবে কিনা যাচাই করা এবং সেই অনুযায়ী auto-scaling সীমা বসানো
- **ট্রাফিক স্পাইকের পরে** — প্রকৃত পিক ফ্যাক্টর মেপে নিয়ে অনুমানগুলো হালনাগাদ করা
- **প্রোডাক্ট আলোচনায়** — "এই ফিচারটা আমাদের খরচ কত বাড়াবে" প্রশ্নের উত্তর পাঁচ মিনিটে দেওয়া

</div>
