---
title: 'একটা রিকোয়েস্টের শরীরবৃত্ত'
subtitle: 'DNS থেকে TLS, load balancer, app server, cache, database — প্রতিটা হপে কত সময় যায় আর কোথায় কী ভাঙে।'
chapter: 4
level: 'beginner'
readingTime: '১৮ মিনিট'
topics: ['DNS', 'TLS', 'load balancer', 'request path', 'timeouts']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা চিঠি পাঠানো। ঠিকানা খোঁজা, খাম সিল করা, ডাকঘরে দেওয়া, বাছাই কেন্দ্র, স্থানীয় ডাকঘর, পিয়ন, দরজা। প্রতিটা ধাপে সময় লাগে, প্রতিটা ধাপে চিঠি হারাতে পারে — আর গ্রাহকের কাছে পুরোটাই শুধু "চিঠি এসেছে" বা "আসেনি"।

</Callout>

## গল্পে বুঝি

বুখারার ইবনে সিনা কায়রোর ইবনুল হাইসামকে একটা জরুরি চিঠি পাঠাবেন — একটা হিসাব যাচাই করতে চান, আর আজকের মধ্যেই উত্তর চাই।

প্রথম সমস্যা: ঠিকানা। ইবনে সিনা জানেন মানুষটার নাম, কিন্তু কায়রোর কোন মহল্লায় থাকেন জানেন না। তিনি স্থানীয় ডাকঘরে গিয়ে জিজ্ঞেস করেন। ডাকঘরের কেরানি তার নিজের খাতা দেখে — নেই। সে বড় ডাকঘরে খোঁজ পাঠায়, তারা কায়রোর কেন্দ্রীয় রেজিস্ট্রিতে জিজ্ঞেস করে, আর অবশেষে ঠিকানাটা ফিরে আসে। এতে লাগল দুই দিন। কিন্তু কেরানি বুদ্ধিমান — সে ঠিকানাটা নিজের খাতায় লিখে রাখল, "এক মাস পর্যন্ত বৈধ"। পরের বার ইবনে সিনা এলে সাথে সাথে ঠিকানা পাবেন। এটাই **DNS** এবং তার **caching** ও **TTL**।

দ্বিতীয় ধাপ: চিঠিটা গোপন। ইবনে সিনা চান না পথে কেউ পড়ুক। তাই তিনি আর ইবনুল হাইসাম আগে থেকে একটা সাংকেতিক পদ্ধতি ঠিক করে নেন — কয়েকটা চিঠি চালাচালি করে ঠিক হয় কোন সংকেত ব্যবহার হবে, আর একে অপরের সিলমোহর যাচাই করা হয় যাতে কেউ ছদ্মবেশে না আসে। এই আগাম আয়োজনে সময় যায়, কিন্তু একবার হয়ে গেলে পরের সব চিঠি দ্রুত যায়। এটাই **TLS handshake**, সিলমোহর হলো **certificate**, আর পরের চিঠিগুলোর দ্রুত যাওয়া হলো **session resumption** ও **connection reuse**।

তৃতীয় ধাপ: চিঠি কায়রোর কেন্দ্রীয় ডাকঘরে পৌঁছাল। সেখানে একজন বসে আছে যে প্রতিটা চিঠি দেখে ঠিক করে কোন পিয়নকে দেবে — কে এখন কম ব্যস্ত, কে কোন এলাকা চেনে। সে মাঝে মাঝে পিয়নদের খবরও নেয়: "আজ কে অসুস্থ?" অসুস্থ পিয়নকে সে কোনো চিঠি দেয় না। এটাই **load balancer** এবং **health check**।

চতুর্থ ধাপ: পিয়ন চিঠি নিয়ে ইবনুল হাইসামের কাছে গেল। ইবনুল হাইসাম চিঠি পড়ে দেখলেন, উত্তর দিতে হলে একটা পুরনো হিসাবের খাতা লাগবে। খাতাটা যদি তার টেবিলেই থাকে, উত্তর তাৎক্ষণিক (**cache hit**)। না থাকলে তাকে গুদামঘরে যেতে হবে, তালা খুলতে হবে, সঠিক তাক খুঁজতে হবে (**cache miss** → **database query**)। গুদামে যদি খাতাগুলো বিষয় অনুযায়ী সাজানো থাকে, খুঁজতে এক মিনিট; এলোমেলো থাকলে এক ঘণ্টা (**index** থাকা বনাম না থাকা)।

আর ফেরার পথ? উত্তরটা একই সব ধাপ উল্টো দিকে পার হয়ে ইবনে সিনার হাতে পৌঁছায়।

এখন গুরুত্বপূর্ণ অংশ — **কোথায় কী ভাঙতে পারে**। ঠিকানা রেজিস্ট্রি বন্ধ থাকতে পারে (**DNS failure** — চিঠি কোথাও যাবেই না)। সিলমোহরের মেয়াদ শেষ হয়ে যেতে পারে (**expired certificate** — সবচেয়ে প্রচলিত প্রোডাকশন দুর্ঘটনা)। কেন্দ্রীয় ডাকঘরের লোকটা অসুস্থ পিয়নকে ভুল করে চিঠি দিতে পারে (**stale health check**)। ইবনুল হাইসাম উত্তর দিতে গিয়ে দেখতে পারেন গুদামের চাবি অন্য কারো কাছে (**database connection pool exhausted**)। আর ইবনে সিনা যদি অনির্দিষ্টকাল অপেক্ষা করেন, তার নিজের কাজও আটকে থাকবে — তাই তিনি ঠিক করে রাখেন, "সাত দিনের মধ্যে উত্তর না এলে ধরে নেব যায়নি" (**timeout**)। আর উত্তর না এলে তিনি আরেকটা চিঠি পাঠান — কিন্তু তখন ঝুঁকি হলো ইবনুল হাইসাম দুইবার একই কাজ করবেন (**retry** ও তার **idempotency** সমস্যা)।

মিলিয়ে নিই: ঠিকানা খোঁজা **DNS**, কেরানির খাতা **DNS cache**, সাংকেতিক আয়োজন **TLS handshake**, সিলমোহর **certificate**, কেন্দ্রীয় ডাকঘরের বণ্টনকারী **load balancer**, পিয়নের খবর নেওয়া **health check**, টেবিলের খাতা **cache**, গুদামঘর **database**, বিষয় অনুযায়ী সাজানো **index**, সাত দিনের নিয়ম **timeout**, আর দ্বিতীয় চিঠি **retry**।

## পুরো পথটা এক নজরে

<Mermaid
title="একটা HTTP রিকোয়েস্টের যাত্রা"
code={`graph TB
  B["Browser / App"] --> D["DNS resolve"]
  D --> T["TCP + TLS handshake"]
  T --> C["CDN / Edge"]
  C -->|hit| B
  C -->|miss| L["Load Balancer"]
  L --> A["App Server"]
  A --> R["Cache (Redis)"]
  R -->|hit| A
  A --> DB["Database"]
  DB --> A
  A --> L
  L --> B`}
/>

নিচে প্রতিটা হপ আলাদা করে — কত সময় লাগে, কী ভুল হতে পারে, আর ডিজাইনার হিসেবে আপনার কী করার আছে।

## হপ ১ — DNS

ব্রাউজার `api.samarkand-notes.dev` লেখা দেখে, কিন্তু প্যাকেট পাঠাতে হলে একটা IP ঠিকানা লাগে। DNS হলো নাম থেকে IP বের করার ব্যবস্থা।

**কোথায় খোঁজা হয়, এই ক্রমে:**

1. ব্রাউজারের নিজস্ব DNS cache (কয়েক মাইক্রোসেকেন্ড)
2. অপারেটিং সিস্টেমের cache
3. রাউটার / ISP-র resolver
4. Root → TLD (`.dev`) → authoritative nameserver

**খরচ:** cache-এ থাকলে ~০ ms। না থাকলে ২০-১৫০ ms, আর সম্পূর্ণ cold হলে ৩০০ ms-ও হতে পারে।

**যা ভাঙে:**

- **TTL খুব বড়** — সার্ভার বদলালেন, কিন্তু পুরনো IP আরও ২৪ ঘণ্টা ধরে ক্লায়েন্টদের কাছে থাকল। মাইগ্রেশনের আগে TTL কমিয়ে ৬০ সেকেন্ড করে নেওয়া একটা মানক অভ্যাস।
- **TTL খুব ছোট** — প্রতিটা নতুন সংযোগে DNS lookup, বাড়তি latency।
- **DNS প্রোভাইডার ডাউন** — আপনার সার্ভার দিব্যি চলছে, কিন্তু কেউ পৌঁছাতে পারছে না। এই কারণেই বড় সাইটগুলো দুইটা আলাদা DNS প্রোভাইডার ব্যবহার করে।

<Callout type="warning">

DNS হলো সেই বিরল কম্পোনেন্ট যেটা আপনার সিস্টেমের অংশ নয় অথচ পুরো সিস্টেমকে অদৃশ্য করে দিতে পারে। ইতিহাসের বেশ কয়েকটা বড় ইন্টারনেট আউটেজের মূলে ছিল DNS কনফিগারেশনের একটা ভুল লাইন।

</Callout>

## হপ ২ — TCP ও TLS handshake

IP পাওয়া গেল। এবার সংযোগ।

**TCP handshake** — তিনটা প্যাকেট (SYN, SYN-ACK, ACK)। খরচ: এক **round trip time (RTT)**। একই শহরে ৫ ms, একই দেশে ২০ ms, মহাদেশ পেরিয়ে ১৫০ ms।

**TLS handshake** — TLS 1.2-এ দুই RTT, TLS 1.3-এ এক RTT। সার্টিফিকেট যাচাই, key exchange, cipher নির্বাচন।

তাই লন্ডন থেকে সিঙ্গাপুরের একটা সার্ভারে প্রথম রিকোয়েস্টে, কোনো ডেটা যাওয়ার আগেই:

```text
DNS lookup          50 ms
TCP handshake      170 ms  (1 RTT)
TLS 1.3 handshake  170 ms  (1 RTT)
-----------------------------------
before any byte    390 ms
```

**একটা বাইটও যায়নি, ৩৯০ ms চলে গেল।** এই কারণেই:

- **Connection reuse** (HTTP keep-alive) বিশাল ব্যাপার — দ্বিতীয় রিকোয়েস্টে এই পুরো খরচ শূন্য
- **CDN / edge** কেবল cache-এর জন্য নয়, handshake-টা কাছে নিয়ে আসার জন্যও মূল্যবান
- **মোবাইল অ্যাপে connection pool** রাখা জরুরি
- **TLS session resumption** পুনঃসংযোগের খরচ কমায়

**যা ভাঙে:**

- **সার্টিফিকেট মেয়াদোত্তীর্ণ** — প্রোডাকশনের সবচেয়ে সাধারণ আত্মঘাতী দুর্ঘটনা। স্বয়ংক্রিয় নবায়ন আর মেয়াদের ৩০ দিন আগে অ্যালার্ট — দুইটাই লাগবে।
- **Intermediate certificate বাদ পড়া** — ব্রাউজারে চলে (ব্রাউজারের কাছে আছে), কিন্তু আপনার Go/Python ক্লায়েন্টে ভাঙে। ক্লাসিক "আমার মেশিনে তো চলছে"।
- **Clock skew** — সার্ভারের ঘড়ি ভুল থাকলে সার্টিফিকেট অবৈধ মনে হয়।

## হপ ৩ — CDN / Edge

স্ট্যাটিক কনটেন্ট আর ক্যাশযোগ্য API রেসপন্স এখানেই শেষ হয়ে যেতে পারে, origin পর্যন্ত পৌঁছানোর দরকারই নেই।

**খরচ:** edge hit হলে ১০-৪০ ms (ইউজার থেকে edge পর্যন্ত)। Miss হলে edge থেকে origin পর্যন্ত পুরো পথ, প্লাস edge-এর ওভারহেড।

ডিজাইনার হিসেবে আপনার প্রশ্ন: **এই রেসপন্সটা কি সবার জন্য একই?** হ্যাঁ হলে CDN-এ ক্যাশ করুন। ব্যবহারকারী-ভিত্তিক হলে করবেন না — অথবা `Vary` হেডার দিয়ে খুব সাবধানে করুন।

## হপ ৪ — Load balancer

Edge miss হলে রিকোয়েস্ট আপনার অবকাঠামোয় ঢোকে, প্রথমে load balancer-এ।

**কাজ:** একাধিক app server-এর মধ্যে বণ্টন, অসুস্থ সার্ভার বাদ দেওয়া, প্রায়ই TLS termination, কখনো rate limiting।

**খরচ:** ১-৫ ms।

**যা ভাঙে:**

- **Health check ভুল** — যদি health check শুধু "প্রসেস চালু আছে?" দেখে, তাহলে যে সার্ভারের ডেটাবেস সংযোগ মরে গেছে সেটাও সুস্থ গণ্য হবে এবং ট্রাফিক পাবে। ভালো health check নির্ভরশীলতাগুলোও দেখে — কিন্তু সাবধান, তাহলে ডেটাবেস একটু কাঁপলেই _সব_ সার্ভার অসুস্থ ঘোষিত হয়ে সবকিছু বন্ধ হয়ে যেতে পারে।
- **Timeout-এর ভুল সাজানো** — LB-র timeout যদি app server-এর timeout-এর চেয়ে ছোট হয়, LB ৫০৪ ফেরত দেবে অথচ app server তখনো কাজ করে যাচ্ছে। খরচ হলো, লাভ হলো না।
- **Sticky session** — একজন ইউজারকে একই সার্ভারে বেঁধে দিলে scaling কঠিন হয় এবং সেই সার্ভার মরলে ইউজারের state হারায়।

## হপ ৫ — App server

আপনার কোড। রিকোয়েস্ট পার্স, অথেন্টিকেশন, ভ্যালিডেশন, ব্যবসায়িক লজিক, তারপর নিচের স্তরগুলোতে কল।

**খরচ:** বিশুদ্ধ CPU-র কাজ সাধারণত ১-১০ ms। যা বেশি সময় নেয় তা প্রায় সবসময়ই **অপেক্ষা** — ডেটাবেস, cache, অন্য সার্ভিস।

**যা ভাঙে:**

- **Connection pool ফুরিয়ে যাওয়া** — pool-এ ২০টা সংযোগ, ১০০টা রিকোয়েস্ট এলে ৮০টা লাইনে দাঁড়ায়। CPU ৫% অথচ latency ২ সেকেন্ড।
- **N+1 query** — ৫০টা আইটেমের তালিকা আনতে ১ + ৫০টা query। প্রতিটা ২ ms হলেও মোট ১০০ ms।
- **কোনো timeout না দেওয়া** — নিচের একটা সার্ভিস ঝুলে গেলে আপনার সব thread/goroutine সেখানে আটকে যায়, আর পুরো সার্ভিস মরে যায় যদিও নিজে ঠিকই আছে।
- **অসীম concurrency** — সীমা না থাকলে ট্রাফিক স্পাইকে মেমরি শেষ হয়ে প্রসেস মরে যায়।

<Callout type="warning">

**প্রতিটা নেটওয়ার্ক কলে timeout দিন। ব্যতিক্রম নেই।** ডিফল্ট timeout প্রায়ই অসীম বা ৩০ সেকেন্ড — দুইটাই বিপর্যয়। একটা ধীর নির্ভরশীলতা timeout ছাড়া পুরো সিস্টেম নামিয়ে দিতে পারে।

</Callout>

## হপ ৬ — Cache

Redis বা Memcached-এ একটা lookup।

**খরচ:** একই নেটওয়ার্কে ০.৫-২ ms। In-process (মেমরির ভেতর) হলে ০.০০১ ms।

**যা ভাঙে:**

- **Cache-ও একটা নেটওয়ার্ক কল** — Redis ধীর হলে আপনার "দ্রুত পথ" ধীর হয়ে যায়। Redis-এও timeout দিন, এবং cache ব্যর্থ হলে সরাসরি DB-তে যাওয়ার ব্যবস্থা রাখুন।
- **Cache মরে গেলে সব ট্রাফিক DB-তে** — যে DB ৯০% cache hit ধরে সাইজ করা হয়েছে, সে হঠাৎ ১০ গুণ লোড পেয়ে মরে যায়। এটাই **thundering herd**।
- **বাসি ডেটা** — invalidation ভুল হলে ইউজার পুরনো তথ্য দেখে।

## হপ ৭ — Database

সবচেয়ে দামি হপ, এবং প্রায় সবসময়ই আসল bottleneck।

**খরচ:**

| অপারেশন                                      | সময়               |
| -------------------------------------------- | ------------------ |
| Index দিয়ে single row read (buffer cache-এ) | ০.১-১ ms           |
| Index দিয়ে single row read (ডিস্ক থেকে)     | ১-১০ ms            |
| ছোট টেবিলে full scan                         | ১০-১০০ ms          |
| বড় টেবিলে full scan                         | সেকেন্ড থেকে মিনিট |
| Write, fsync সহ                              | ১-১০ ms            |
| Cross-region replica read                    | ৫০-২০০ ms          |

**যা ভাঙে:**

- **Index না থাকা** — একই query ১,০০০ row-তে ১ ms, ১ কোটি row-তে ১০ সেকেন্ড। Table scan রৈখিকভাবে বাড়ে, index লগারিদমিক।
- **Lock contention** — একই row-তে অনেক write একে অপরের জন্য অপেক্ষা করে।
- **লম্বা transaction** — একটা transaction খোলা রেখে বাইরের API কল করা মানে ডেটাবেসের lock ধরে রেখে ইন্টারনেটের জন্য অপেক্ষা করা।
- **Connection সংখ্যা** — PostgreSQL-এ প্রতিটা সংযোগ একটা প্রসেস; কয়েকশোর বেশি হলে নিজেই ভারী হয়ে যায়। এই কারণে pgBouncer-এর মতো pooler ব্যবহার হয়।

## পুরো latency-র বাজেট

একটা বাস্তব রিকোয়েস্টের ভাঙা হিসাব — একই রিজিয়নে, warm connection সহ:

```text
Warm path (connection reused, cache hit):
  LB routing                    2 ms
  app server logic              3 ms
  redis GET                     1 ms
  serialise + respond           2 ms
  network back to user         25 ms
  ------------------------------------
  total                        33 ms

Cold path (new connection, cache miss):
  DNS lookup                   50 ms
  TCP handshake                30 ms
  TLS handshake                30 ms
  LB routing                    2 ms
  app server logic              3 ms
  redis GET (miss)              1 ms
  postgres query                8 ms
  populate cache                1 ms
  serialise + respond           2 ms
  network back to user         25 ms
  ------------------------------------
  total                       152 ms
```

দুইটা পথের পার্থক্য প্রায় পাঁচ গুণ — এবং কোনো কোডই বদলায়নি। এটাই বোঝায় কেন **গড় latency মিথ্যা বলে**: আপনার ৯০% ইউজার ৩৩ ms পায়, ১০% পায় ১৫২ ms, গড় হয় ৪৫ ms — যে সংখ্যাটা আসলে কারো অভিজ্ঞতাই নয়। চ্যাপ্টার ৬ পুরোটা এই নিয়ে।

## Timeout-এর বাজেট সাজানো

এটা এমন একটা জিনিস যা প্রায় সব টিম ভুল করে। নিয়মটা সরল: **ভেতরের timeout সবসময় বাইরের timeout-এর চেয়ে ছোট হতে হবে**, এবং retry-সহ মোট সময় বাইরের সীমা ছাড়াতে পারবে না।

```text
Client (mobile app)        : 10s
  CDN / edge               :  9s
    Load balancer          :  8s
      App server (total)   :  7s
        auth service call  :  1s   (2 retries -> 2s worst case)
        redis GET          : 50ms  (1 retry  -> 100ms)
        postgres query     :  2s   (no retry)
        downstream API     :  2s   (1 retry  -> 4s)
```

উল্টো করলে কী হয়? ধরুন app server-এর timeout ৩০ সেকেন্ড কিন্তু LB-র ৮ সেকেন্ড। ৮ সেকেন্ডে LB ইউজারকে ৫০৪ দিয়ে দিল, কিন্তু app server আরও ২২ সেকেন্ড ধরে কাজ করে গেল — একটা রিকোয়েস্টের জন্য যার উত্তর আর কেউ শুনবে না। ভিড়ের সময় এই "ভূত রিকোয়েস্ট"গুলোই সার্ভার ভরিয়ে ফেলে।

<Callout type="tip">

Retry-র সাথে সবসময় **exponential backoff** আর **jitter** দিন। Jitter ছাড়া সব ক্লায়েন্ট একই মুহূর্তে retry করে — যাকে বলে **retry storm**, এবং সেটাই একটা সাময়িক সমস্যাকে স্থায়ী আউটেজে পরিণত করে।

</Callout>

## রিকোয়েস্ট পথের সময় মাপা

তত্ত্ব যথেষ্ট। নিচে দুইটা জিনিস একসাথে: একটা ক্লায়েন্ট যেটা প্রতিটা হপের সময় আলাদা করে মাপে (DNS, TCP, TLS, TTFB, ডাউনলোড), আর একটা সার্ভার-সাইড মিডলওয়্যার যেটা ভেতরের প্রতিটা ধাপের সময় `Server-Timing` হেডারে ফেরত পাঠায়। দুইটা মিলিয়ে দেখলে বোঝা যায় "৪০০ ms লাগল" বাক্যটার ভেতরে আসলে কী ঘটেছে।

```typescript
import https from 'node:https';
import http from 'node:http';
import { performance } from 'node:perf_hooks';

// ---------------------------------------------------------------------------
// Part 1 — client side: time every hop of a single HTTP request.
// This is the tool you reach for when someone says "the API is slow" and you
// need to know whether it is DNS, TLS, the network, or the server.
// ---------------------------------------------------------------------------

export interface HopTimings {
	url: string;
	statusCode: number;
	dnsMs: number;
	tcpMs: number;
	tlsMs: number;
	ttfbMs: number; // time to first byte, measured from request start
	downloadMs: number;
	totalMs: number;
	serverTiming: Record<string, number>;
	bytes: number;
}

function parseServerTiming(header: string | undefined): Record<string, number> {
	// Server-Timing: db;dur=12.4, cache;dur=0.8, render;dur=3
	if (!header) return {};
	const out: Record<string, number> = {};
	for (const part of header.split(',')) {
		const segments = part.split(';').map((s) => s.trim());
		const name = segments[0];
		const durSegment = segments.find((s) => s.startsWith('dur='));
		if (name && durSegment) {
			const value = Number(durSegment.slice(4));
			if (!Number.isNaN(value)) out[name] = value;
		}
	}
	return out;
}

export function traceRequest(url: string, timeoutMs = 10_000): Promise<HopTimings> {
	return new Promise((resolve, reject) => {
		const target = new URL(url);
		const transport = target.protocol === 'https:' ? https : http;

		const t0 = performance.now();
		let tDnsDone = t0;
		let tTcpDone = t0;
		let tTlsDone = t0;
		let tFirstByte = t0;
		let bytes = 0;

		const req = transport.request(
			{
				method: 'GET',
				hostname: target.hostname,
				port: target.port || (target.protocol === 'https:' ? 443 : 80),
				path: target.pathname + target.search,
				// Force a fresh connection so the handshake cost is visible.
				// Set to true and re-run to see what connection reuse buys you.
				agent: false,
				headers: { 'User-Agent': 'request-tracer/1.0' }
			},
			(res) => {
				res.on('data', (chunk: Buffer) => {
					if (bytes === 0) tFirstByte = performance.now();
					bytes += chunk.length;
				});

				res.on('end', () => {
					const tEnd = performance.now();
					if (bytes === 0) tFirstByte = tEnd;

					resolve({
						url,
						statusCode: res.statusCode ?? 0,
						dnsMs: round(tDnsDone - t0),
						tcpMs: round(tTcpDone - tDnsDone),
						tlsMs: round(tTlsDone - tTcpDone),
						ttfbMs: round(tFirstByte - t0),
						downloadMs: round(tEnd - tFirstByte),
						totalMs: round(tEnd - t0),
						serverTiming: parseServerTiming(res.headers['server-timing'] as string | undefined),
						bytes
					});
				});
			}
		);

		req.setTimeout(timeoutMs, () => {
			req.destroy(new Error(`timeout after ${timeoutMs}ms`));
		});

		req.on('socket', (socket) => {
			socket.on('lookup', () => {
				tDnsDone = performance.now();
			});
			socket.on('connect', () => {
				tTcpDone = performance.now();
				tTlsDone = tTcpDone; // overwritten below for TLS
			});
			socket.on('secureConnect', () => {
				tTlsDone = performance.now();
			});
		});

		req.on('error', reject);
		req.end();
	});
}

function round(n: number): number {
	return Number(n.toFixed(1));
}

export function printTrace(t: HopTimings): void {
	console.log(`\n${t.url}  ->  ${t.statusCode}  (${t.bytes} bytes)`);
	const bar = (ms: number) => '#'.repeat(Math.min(40, Math.round(ms / 5)));
	console.log(`  dns       ${String(t.dnsMs).padStart(7)} ms ${bar(t.dnsMs)}`);
	console.log(`  tcp       ${String(t.tcpMs).padStart(7)} ms ${bar(t.tcpMs)}`);
	console.log(`  tls       ${String(t.tlsMs).padStart(7)} ms ${bar(t.tlsMs)}`);
	console.log(`  ttfb      ${String(t.ttfbMs).padStart(7)} ms ${bar(t.ttfbMs)}`);
	console.log(`  download  ${String(t.downloadMs).padStart(7)} ms ${bar(t.downloadMs)}`);
	console.log(`  total     ${String(t.totalMs).padStart(7)} ms`);
	const keys = Object.keys(t.serverTiming);
	if (keys.length > 0) {
		console.log('  server-side breakdown:');
		for (const k of keys) console.log(`    ${k.padEnd(12)} ${t.serverTiming[k]} ms`);
	}
}

// ---------------------------------------------------------------------------
// Part 2 — server side: report where the time went inside the handler.
// ---------------------------------------------------------------------------

export class TimingCollector {
	private marks: Array<{ name: string; ms: number }> = [];

	async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
		const start = performance.now();
		try {
			return await fn();
		} finally {
			this.marks.push({ name, ms: performance.now() - start });
		}
	}

	header(): string {
		return this.marks.map((m) => `${m.name};dur=${m.ms.toFixed(1)}`).join(', ');
	}
}

// A handler that shows the shape: cache first, database on miss, and every
// step measured so the client can see the split without a debugger.
async function handleGetProfile(
	req: http.IncomingMessage,
	res: http.ServerResponse
): Promise<void> {
	const timings = new TimingCollector();
	const userId = new URL(req.url || '/', 'http://local').searchParams.get('id') ?? 'unknown';

	const cached = await timings.measure('cache', async () => fakeRedisGet(`profile:${userId}`));

	let profile = cached;
	if (!profile) {
		profile = await timings.measure('db', async () => fakeDbQuery(userId));
		await timings.measure('cache_set', async () => fakeRedisSet(`profile:${userId}`, profile));
	}

	const body = await timings.measure('render', async () => JSON.stringify(profile));

	res.writeHead(200, {
		'Content-Type': 'application/json',
		'Server-Timing': timings.header()
	});
	res.end(body);
}

// --- Fake dependencies with realistic latencies -------------------------
const store = new Map<string, unknown>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fakeRedisGet(key: string): Promise<unknown> {
	await sleep(1);
	return store.get(key) ?? null;
}
async function fakeRedisSet(key: string, value: unknown): Promise<void> {
	await sleep(1);
	store.set(key, value);
}
async function fakeDbQuery(id: string): Promise<unknown> {
	await sleep(8);
	return { id, name: 'Ibn al-Haytham', city: 'Cairo' };
}

const server = http.createServer((req, res) => {
	handleGetProfile(req, res).catch(() => {
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'internal_error' }));
	});
});

server.listen(3000, async () => {
	console.log('demo server on http://localhost:3000');
	// cold: cache miss, so the db mark appears
	printTrace(await traceRequest('http://localhost:3000/profile?id=al-biruni'));
	// warm: cache hit, db disappears from the breakdown
	printTrace(await traceRequest('http://localhost:3000/profile?id=al-biruni'));
	server.close();
});
```

## এই কোডটা কেন গুরুত্বপূর্ণ

"API ধীর" — এই অভিযোগটা প্রায় অর্থহীন, কারণ ধীরত্ব যেকোনো হপে হতে পারে। উপরের ট্রেসারটা চালালে সাথে সাথে বোঝা যায় সমস্যাটা কোথায়:

- **DNS বেশি** → DNS প্রোভাইডার বা TTL কনফিগারেশন দেখুন
- **TLS বেশি** → session resumption চালু আছে কিনা, ব্যবহারকারী থেকে সার্ভারের দূরত্ব কত
- **TTFB বেশি কিন্তু server-timing ছোট** → নেটওয়ার্ক দূরত্ব বা LB queueing; আপনার কোড নির্দোষ
- **TTFB বেশি এবং server-timing-এ `db` বড়** → query বা index-এর সমস্যা
- **Download বেশি** → response খুব বড়, compression নেই, বা ব্যান্ডউইথ কম

`Server-Timing` হেডারটা ব্রাউজারের DevTools-এও দেখা যায়, তাই ফ্রন্টএন্ড ডেভেলপাররা ব্যাকএন্ড টিমকে না জিজ্ঞেস করেই বুঝতে পারে সময়টা কোথায় গেল।

<Callout type="info">

প্রতিটা রেসপন্সে একটা `X-Request-Id` দিন এবং সেটা প্রতিটা ডাউনস্ট্রিম কলে বয়ে নিয়ে যান। যখন কেউ বলবে "আমার এই রিকোয়েস্টটা ফেল করেছে", সেই একটা আইডি দিয়ে পুরো পথটার লগ বের করা যায়। এটা distributed tracing-এর সবচেয়ে সস্তা সংস্করণ, এবং প্রথম দিন থেকেই থাকা উচিত।

</Callout>

## যেখানে যেখানে ভাঙতে পারে — সংক্ষেপে

| হপ    | সাধারণ ফেইলিওর                     | যা করবেন                                    |
| ----- | ---------------------------------- | ------------------------------------------- |
| DNS   | প্রোভাইডার ডাউন, TTL ভুল           | দুইটা প্রোভাইডার, মাইগ্রেশনের আগে TTL কমান  |
| TLS   | সার্টিফিকেট মেয়াদোত্তীর্ণ         | স্বয়ংক্রিয় নবায়ন + ৩০ দিন আগে অ্যালার্ট  |
| CDN   | ভুল ক্যাশিং, ব্যক্তিগত ডেটা ফাঁস   | `Cache-Control` ও `Vary` সাবধানে            |
| LB    | ভুল health check, timeout অসাজানো  | নির্ভরশীলতা-সচেতন health check, timeout মই  |
| App   | pool ফুরানো, timeout না থাকা       | সব কলে timeout, concurrency সীমা            |
| Cache | cache মরলে DB-তে বন্যা             | cache ব্যর্থ হলে degrade, stampede প্রতিরোধ |
| DB    | index নেই, lock, লম্বা transaction | query plan দেখুন, transaction ছোট রাখুন     |

<div class="takeaways">

### মূল শেখা

- একটা রিকোয়েস্ট অন্তত সাতটা হপ পার হয়; "ধীর" বলার আগে জানতে হবে কোন হপ
- প্রথম রিকোয়েস্টের ৩০০-৪০০ ms চলে যেতে পারে কোনো ডেটা যাওয়ার আগেই — DNS, TCP, TLS মিলিয়ে
- Connection reuse আর edge termination হলো cold path-এর খরচ কমানোর প্রধান দুই হাতিয়ার
- App server-এর সময় সাধারণত CPU-তে যায় না, যায় অপেক্ষায় — DB, cache, ডাউনস্ট্রিম সার্ভিস
- প্রতিটা নেটওয়ার্ক কলে timeout দিন, এবং timeout-গুলোকে বাইরে থেকে ভেতরে ছোট হওয়ার মই আকারে সাজান
- Retry-তে exponential backoff ও jitter না দিলে সাময়িক সমস্যা retry storm হয়ে স্থায়ী আউটেজে পরিণত হয়
- `Server-Timing` আর `X-Request-Id` — দুইটা সস্তা অভ্যাস যা ডিবাগিংয়ের সময় ঘণ্টার পর ঘণ্টা বাঁচায়

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **"সাইট ধীর" অভিযোগ তদন্তে** — হপ-ভিত্তিক টাইমিং নিয়ে বোঝা সমস্যা নেটওয়ার্কে, edge-এ, নাকি ডেটাবেসে
- **নতুন রিজিয়নে লঞ্চের আগে** — সেই অঞ্চল থেকে RTT আর handshake খরচ মেপে দেখা edge লাগবে কিনা
- **Incident-এর সময়** — সার্টিফিকেট, DNS, health check — এই তিনটা আগে দেখা, কারণ এগুলোই সবচেয়ে বেশি "সব ঠিক অথচ কিছুই চলছে না" ঘটায়
- **নতুন সার্ভিস তৈরির সময়** — timeout মই আর retry নীতি প্রথম দিনেই ঠিক করে রাখা, পরে নয়
- **ফ্রন্টএন্ড পারফরম্যান্স কাজে** — `Server-Timing` দিয়ে ব্যাকএন্ড ও নেটওয়ার্কের ভাগ আলাদা করা

</div>
