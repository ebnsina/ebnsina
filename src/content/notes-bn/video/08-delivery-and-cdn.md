---
title: 'ডেলিভারি ও CDN'
subtitle: 'ভিডিও কেন সাধারণ CDN ধারণা ভেঙে দেয় — cache key ডিজাইন, origin shield, hit ratio-র অর্থনীতি, multi-CDN steering, signed URL আর egress খরচ।'
chapter: 8
level: 'advanced'
readingTime: '২৬ মিনিট'
topics:
  [
    'CDN',
    'cache key',
    'origin shield',
    'tiered caching',
    'cache hit ratio',
    'multi-CDN',
    'signed URL',
    'egress cost'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

মরুভূমির রাস্তায় প্রতি কয়েক ক্রোশ পরপর পানির চৌকি। কুয়া একটাই, অনেক দূরে। চৌকিতে পানি থাকলে পথিক সাথে সাথে পায়; না থাকলে কাউকে কুয়া পর্যন্ত যেতে হয়। CDN ঠিক এই জিনিসটাই, শুধু পানির বদলে সেগমেন্ট।

</Callout>

## গল্পে বুঝি

বাগদাদ থেকে সমরকন্দ যাওয়ার কাফেলা-রাস্তায় ইবনে সিনা একটা পানি সরবরাহের ব্যবস্থা দাঁড় করালেন। রাস্তাটা লম্বা, আর একটাই ভালো কুয়া — বাগদাদের বাইরে, গভীর, ঠান্ডা পানি। সমস্যা হলো, প্রতিটা পথিক যদি পানির জন্য কুয়া পর্যন্ত ফিরে আসে, তাহলে কুয়ার দড়িতে সারাদিন লাইন লেগে থাকবে আর কেউই সময়মতো পানি পাবে না। তাই তিনি রাস্তার ধারে প্রতি কয়েক ক্রোশ পরপর ছোট ছোট **পানির চৌকি** বসালেন — প্রতিটাতে একজন লোক, কয়েকটা মাটির জালা, আর একটা হিসাবের খাতা। পথিক চৌকিতে এসে যা চায় সেটা যদি জালায় থাকে, সাথে সাথে পেয়ে যায়। এই চৌকিগুলোই **edge**, আর মূল কুয়াটা **origin**।

প্রথম মাসেই ধরা পড়ল আসল সমস্যাটা জালার সংখ্যা নয়, **জালার গায়ের লেবেল**। ইবনে সিনা নিয়ম করেছিলেন প্রতিটা জালার গায়ে লেখা থাকবে পানি কোন কুয়ার, কোন দিনের, আর কোন মাপের পাত্রে। চৌকির লোক পথিকের চাহিদার সাথে লেবেল মিলিয়ে দেখে। কিন্তু কিছু পথিক অভ্যাসবশত চাহিদার সাথে নিজের নামও বলত — "বাগদাদের কুয়া, বড় পাত্র, আমি আল-বিরুনি"। চৌকির লোক তখন লেবেল মেলাতে না পেরে ভাবত এটা নতুন জিনিস, আর কুয়া পর্যন্ত লোক পাঠাত। একই পানি, শুধু নামটা আলাদা বলে বারবার কুয়া থেকে আনা হচ্ছিল। ইবনে সিনা নিয়ম বদলালেন: লেবেল মেলানোর সময় **শুধু তিনটা জিনিস** দেখা হবে, বাকি সব বাদ। এটাই **cache key normalisation**, আর পথিকের নামটাই সেই অপ্রয়োজনীয় **query string** যা hit ratio ধ্বংস করে।

তারপরেও কুয়ার উপর চাপ কমল না যতটা আশা করা হয়েছিল। কারণ বিশটা চৌকির প্রতিটাই, প্রথমবার কোনো নতুন জিনিস চাওয়া হলে, আলাদা করে কুয়ায় লোক পাঠাচ্ছিল। এক জিনিস বিশবার তোলা হচ্ছিল। ইবনে সিনা তখন রাস্তার মাঝামাঝি একটা **বড় জলাধার** বানালেন — চৌকিগুলো আর সরাসরি কুয়ায় যাবে না, আগে জলাধারে যাবে; জলাধারে না থাকলে কেবল তখনই জলাধারের লোক কুয়ায় যাবে, একবার। বিশটা অনুরোধ কুয়ায় গিয়ে দাঁড়াল একটায়। এই মাঝের জলাধারই **origin shield**, আর চৌকি-জলাধার-কুয়ার এই তিন স্তরই **tiered caching**।

হিসাব রাখতে গিয়ে তিনি আরও একটা জিনিস দেখলেন। জনপ্রিয় দুয়েকটা জিনিস — সমরকন্দের বরফ-ঠান্ডা পানি — সব চৌকিতেই সবসময় থাকে, ওগুলোর জন্য কখনো কুয়ায় যেতে হয় না। কিন্তু কেউ কেউ এমন জিনিস চায় যা বছরে দুইবার চাওয়া হয়। ওই বিরল চাহিদাগুলো জালায় রেখে দিলে জায়গা নষ্ট, আর না রাখলে প্রতিবার কুয়ায় দৌড়। ইবনে সিনা মেনে নিলেন যে **বিরল জিনিসের জন্য কুয়ায় যেতেই হবে** — কিন্তু জালার জায়গাটা যেন জনপ্রিয় জিনিসেই ভরা থাকে সেটা নিশ্চিত করলেন। এই লম্বা লেজই **long-tail catalogue**, আর "কত ভাগ চাহিদা চৌকিতেই মিটল" সেই অনুপাতটাই **cache hit ratio** — যেটার প্রতিটা শতাংশের সাথে কুয়ার দড়ি টানার খরচ সরাসরি জড়িত।

শেষ দুটো সিদ্ধান্ত ব্যবসার। এক, তিনি দেখলেন এক ঠিকাদারের হাতে সব চৌকি দিলে যেদিন সেই ঠিকাদারের লোকজন ধর্মঘট করে সেদিন পুরো রাস্তা শুকনো। তাই তিনি দুই ঠিকাদারকে ভাগ করে চৌকি দিলেন, আর কাফেলার সর্দারকে বললেন — "যাত্রার আগে খোঁজ নিয়ো কোন ঠিকাদারের চৌকিগুলো আজ ভালো চলছে, সেই লাইনেই যেয়ো।" এটাই **multi-CDN** আর **steering**। দুই, দামি বরফ-পানির জন্য তিনি টিকিট চালু করলেন — কাগজে সিলমোহর, তারিখ লেখা, আর সেই তারিখ পেরোলে চৌকির লোক টিকিট নেবে না। এটাই **signed URL**, আর সিলমোহরটা **HMAC signature**।

মিলিয়ে নিই: রাস্তার ধারের চৌকি হলো **edge PoP**, মূল কুয়া হলো **origin**, মাঝের জলাধার হলো **origin shield** এবং তিন স্তরের ব্যবস্থাটা **tiered caching**; জালার লেবেল হলো **cache key** আর পথিকের বলা বাড়তি নাম হলো সেই **query string** যা key নষ্ট করে; চৌকিতেই মিটে যাওয়া চাহিদার অনুপাত **cache hit ratio**, কুয়া থেকে টানা পানি **origin egress**; দুই ঠিকাদার হলো **multi-CDN**, সর্দারের খোঁজ নেওয়া **steering**, আর সিলমোহরওয়ালা টিকিট হলো **signed URL**। বাকি অধ্যায়টা এই সাতটা জিনিসের প্রকৌশল।

## ভিডিও সাধারণ CDN ধারণাগুলো কোথায় ভাঙে

একটা সাধারণ ওয়েবসাইটের CDN কনফিগারেশন আর একটা ভিডিও প্ল্যাটফর্মের CDN কনফিগারেশন একই দেখতে হলেও ভেতরের অর্থনীতি সম্পূর্ণ আলাদা। পার্থক্যগুলো চারটা।

**এক, object-এর আকার।** একটা HTML পেজ কয়েক কিলোবাইট, একটা JS bundle হয়তো ৩০০ KB। একটা ৬-সেকেন্ডের 1080p সেগমেন্ট ৩ থেকে ৫ MB। মানে একজন দর্শক এক ঘণ্টা দেখলে সে একাই ২-৩ GB টানছে — যা কয়েক লাখ পেজভিউয়ের সমান। CDN-এর ক্যাশে RAM আর SSD-তে যেটুকু জায়গা, সেটা এই আকারে হিসাব করলে অনেক ছোট মনে হয়।

**দুই, catalogue-এর লেজ।** একটা ই-কমার্স সাইটের হয়তো ৫০ হাজার পেজ, তার মধ্যে ৫০০টা পেজেই ৮০ ভাগ ট্রাফিক। ভিডিওতে catalogue হয় লাখো ঘণ্টার, আর প্রতিটা ভিডিও আবার ৬টা রেন্ডিশনে ভাঙা, প্রতিটা রেন্ডিশন আবার শত শত সেগমেন্টে। ১ লাখ ভিডিও মানে সহজেই ২-৩ কোটি আলাদা object। জনপ্রিয়তা Zipf-এর মতো বণ্টিত — কিছু জিনিস প্রচণ্ড জনপ্রিয়, বিশাল একটা লেজ প্রায় কখনো চাওয়া হয় না।

**তিন, request-এর ধরন।** ওয়েব ট্রাফিক burst-ধর্মী: পেজ লোড হলো, ৪০টা রিকোয়েস্ট গেল, তারপর চুপ। ভিডিও ট্রাফিক **সমান তালে চলতে থাকে** — প্রতি ৪-৬ সেকেন্ডে একটা করে সেগমেন্ট, ঘণ্টার পর ঘণ্টা, প্রতিটা দর্শকের জন্য। CDN-এর দিক থেকে এটা একটা দীর্ঘস্থায়ী, ভবিষ্যদ্বাণীযোগ্য স্রোত — যেটা ক্যাপাসিটি পরিকল্পনার জন্য ভালো, কিন্তু খরচের জন্য নির্মম।

**চার, ব্যর্থতার চেহারা।** একটা CSS ফাইল ২ সেকেন্ড দেরিতে এলে কেউ টের পায় না। একটা সেগমেন্ট ২ সেকেন্ড দেরিতে এলে buffer শুকিয়ে যায় আর দর্শক ঘুরন্ত চাকা দেখে। ভিডিওতে CDN-এর p99 latency আসলে দর্শকের rebuffer-এর সরাসরি কারণ, কোনো পরোক্ষ metric নয়।

<Callout type="warning">

ভিডিও ডেলিভারিতে সবচেয়ে দামি ভুলটা হলো ওয়েব-অ্যাসেটের ক্যাশ কনফিগারেশন হুবহু ভিডিওর জন্য ব্যবহার করা। একটা `Cache-Control: no-cache` যদি ভুল করে সেগমেন্টে বসে যায়, প্রতিটা সেগমেন্ট প্রতিবার origin থেকে যাবে — এবং বিলটা একই থাকবে না, দশ-বিশ গুণ হবে। ভিডিওতে ক্যাশ কনফিগারেশন একটা **খরচের সিদ্ধান্ত**, পারফরম্যান্সের সিদ্ধান্ত নয় শুধু।

</Callout>

## Cache key: ঠিক কোন জিনিসটা ক্যাশ হচ্ছে

CDN-এর ক্যাশ একটা বিশাল map। key হলো CDN যা দিয়ে জিনিসটা চেনে, value হলো response। ডিফল্টভাবে key তৈরি হয় host + path + পুরো query string দিয়ে, আর প্রায়ই `Vary` হেডারের কিছু অংশ যোগ হয়।

এই ডিফল্টটাই ভিডিওর জন্য সমস্যা। কারণ সেগমেন্ট URL-এ প্লেয়ার বা অ্যানালিটিক্স প্রায়ই এমন কিছু জুড়ে দেয় যা কনটেন্টের সাথে সম্পর্কহীন।

```text
# একই বাইট, চারটা আলাদা cache key
/vod/ibn-sina-lecture/1080p/seg-00042.m4s
/vod/ibn-sina-lecture/1080p/seg-00042.m4s?session=8f21ac
/vod/ibn-sina-lecture/1080p/seg-00042.m4s?session=8f21ac&t=1712000123
/vod/ibn-sina-lecture/1080p/seg-00042.m4s?utm_source=newsletter
```

চারবার origin থেকে একই ৪ MB টানা হবে। ১০ হাজার দর্শক থাকলে ১০ হাজারটা আলাদা key, hit ratio কার্যত শূন্য। এটা কাল্পনিক সমস্যা নয় — session id URL-এ জুড়ে দেওয়া ভিডিও প্ল্যাটফর্মে সবচেয়ে সাধারণ খরচ-বিস্ফোরণ।

নিয়মগুলো সরল:

- **সেগমেন্ট URL-এ কোনো per-user প্যারামিটার রাখবেন না।** দরকার হলে সেটা হেডারে বা signed token-এর ভেতরে যাক, path-এ নয়।
- **Cache key-তে শুধু whitelist করা প্যারামিটার রাখুন**, blacklist নয়। নতুন প্যারামিটার কেউ যোগ করলে ডিফল্টে সেটা key-র বাইরে থাকবে।
- **`Vary: *` কখনো নয়**, আর `Vary: User-Agent` প্রায় কখনো নয় — User-Agent-এর সম্ভাব্য মান হাজার হাজার, প্রতিটা একটা আলাদা কপি।
- **Path-এর case আর trailing slash নরমালাইজ করুন**, নাহলে `/VOD/` আর `/vod/` দুটো আলাদা এন্ট্রি হয়ে বসে থাকবে।

কিছু জিনিস অবশ্যই key-তে থাকতে হবে: `Range` হেডার (progressive MP4 সার্ভ করলে), আর যদি একই path থেকে DRM/অ-DRM ভ্যারিয়েন্ট যায় তাহলে সেই পার্থক্যটা। বেশিরভাগ CDN byte-range আলাদাভাবে সামলায় (range-এর জন্য পুরো object আনে তারপর টুকরো দেয়) — এটা কনফার্ম করে নেওয়া ভালো, কারণ যে CDN প্রতিটা range-কে আলাদা object ভাবে সে ছোট object-এর পাহাড় বানিয়ে ফেলে।

<Callout type="tip">

Manifest আর সেগমেন্টের TTL কখনো এক হওয়া উচিত নয়। **সেগমেন্ট immutable** — একবার লেখা হলে আর বদলায় না, তাই `Cache-Control: public, max-age=31536000, immutable` একদম যথার্থ। **Manifest পরিবর্তনশীল** (বিশেষত live-এ), তাই সেখানে কয়েক সেকেন্ডের `max-age` বা `no-cache` সহ ETag। এই দুটো আলাদা করাই ভিডিও CDN কনফিগারেশনের প্রথম কাজ।

</Callout>

## Origin shield ও tiered caching

CDN-এর edge PoP পৃথিবীজুড়ে ছড়ানো — ঢাকা, সিঙ্গাপুর, ফ্রাঙ্কফুর্ট, সাও পাওলো। একটা নতুন ভিডিও প্রকাশ পেলে প্রতিটা PoP-তে প্রথম দর্শক একটা করে miss তৈরি করে, আর প্রতিটা miss origin পর্যন্ত যায়। ১০০টা PoP থাকলে একটা সেগমেন্ট origin থেকে ১০০ বার পড়া হবে।

**Origin shield** হলো একটা নির্দিষ্ট মধ্যবর্তী স্তর — সাধারণত origin-এর কাছাকাছি একটা বড় PoP — যার ভেতর দিয়েই সব miss যায়। ১০০টা edge miss shield-এ গিয়ে জমা হয়, shield নিজে origin-এ একবার যায়, বাকি ৯৯টা তার কপি পায়।

<Mermaid
title="Shield ছাড়া বনাম shield সহ"
code={`graph LR
  subgraph noShield["Shield ছাড়া"]
    E1["Edge: Dhaka"] --> O1["Origin"]
    E2["Edge: Singapore"] --> O1
    E3["Edge: Frankfurt"] --> O1
    E4["Edge: Cairo"] --> O1
  end
  subgraph withShield["Shield সহ"]
    F1["Edge: Dhaka"] --> S["Origin shield"]
    F2["Edge: Singapore"] --> S
    F3["Edge: Frankfurt"] --> S
    F4["Edge: Cairo"] --> S
    S --> O2["Origin"]
  end`}
/>

এর দুটো আলাদা লাভ, আর দুটোই আলাদাভাবে গুরুত্বপূর্ণ:

- **Origin offload** — origin-এ যাওয়া রিকোয়েস্টের সংখ্যা নাটকীয়ভাবে কমে। এটা শুধু ব্যান্ডউইথের ব্যাপার নয়; আপনার packager বা storage বাকেটে যত কম রিকোয়েস্ট, তত কম ওঠানামা।
- **Request coalescing** — একই object-এর জন্য একই সময়ে আসা একাধিক miss একটাই upstream fetch-এ মিলে যায়। নতুন এপিসোড প্রকাশের মুহূর্তে এটাই আপনার origin-কে বাঁচায়।

খরচও আছে: shield একটা বাড়তি hop, তাই cold object-এর latency বাড়ে (সাধারণত ২০-৬০ ms)। hot object-এ কোনো প্রভাব নেই কারণ সেটা edge-এই মেলে। Long-tail catalogue-এ shield-এর লাভ সবচেয়ে বেশি, আর কেবল কয়েকটা জনপ্রিয় লাইভ চ্যানেল থাকলে লাভ কম।

<Callout type="info">

Shield-এর অবস্থান **origin-এর কাছে** রাখুন, দর্শকের কাছে নয়। shield-এর কাজ origin-কে রক্ষা করা, দর্শকের latency কমানো নয় — সেটা edge-এর কাজ। Origin যদি ঢাকায় হয় আর shield ফ্রাঙ্কফুর্টে বসানো হয়, তাহলে প্রতিটা miss অকারণে দুইবার মহাদেশ পার হবে।

</Callout>

## Cache hit ratio-র অর্থনীতি

Hit ratio শুধু পারফরম্যান্সের সংখ্যা নয়, এটা সরাসরি বিলের সংখ্যা। একটা হিসাব করে দেখা যাক।

ধরুন মাসে ৫ PB (৫,০০০ TB) ট্রাফিক CDN থেকে দর্শকের কাছে যাচ্ছে। CDN-এর দাম ধরা যাক প্রতি GB ৳০.৮০, আর ক্লাউড origin থেকে CDN-এ egress-এর দাম প্রতি GB ৳৬.০০ (ক্লাউড egress সাধারণত CDN-এর চেয়ে অনেক দামি — এটাই মূল কথা)।

```text
মোট ডেলিভারি          = 5,000 TB = 5,000,000 GB
CDN খরচ (hit ratio নির্বিশেষে) = 5,000,000 x 0.80 = ৳40,00,000

hit ratio 90% → origin fetch = 500,000 GB → 500,000 x 6 = ৳30,00,000
hit ratio 95% → origin fetch = 250,000 GB → 250,000 x 6 = ৳15,00,000
hit ratio 98% → origin fetch = 100,000 GB → 100,000 x 6 =  ৳6,00,000
hit ratio 99% → origin fetch =  50,000 GB →  50,000 x 6 =  ৳3,00,000
```

৯০ থেকে ৯৮-এ গেলে মাসে ২৪ লাখ টাকা বাঁচে, একটা লাইনও অ্যাপ্লিকেশন কোড না বদলে। এই কারণেই cache key নরমালাইজেশন আর shield কনফিগারেশন ভিডিও প্ল্যাটফর্মে সবচেয়ে বেশি ROI দেওয়া কাজগুলোর একটা।

তবে hit ratio মাপার সময় দুটো ভুল খুব সাধারণ:

**Request hit ratio বনাম byte hit ratio।** ১০০টা রিকোয়েস্টের ৯৫টা hit হলে request hit ratio ৯৫%। কিন্তু যদি miss হওয়া ৫টা সবচেয়ে বড় সেগমেন্ট হয়, byte hit ratio হয়তো ৮০%। বিল আসে বাইটে, তাই **byte hit ratio-ই আসল সংখ্যা**।

**গড় করে দেখা।** সব কনটেন্ট মিলিয়ে ৯৬% দেখতে ভালো, কিন্তু হয়তো জনপ্রিয় কনটেন্টে ৯৯.৫% আর নতুন-প্রকাশিত কনটেন্টে ৬০%। কনটেন্টের বয়স, রেন্ডিশন আর অঞ্চল ভেঙে না দেখলে আপনি ঠিক কোথায় টাকা পড়ছে জানবেন না।

| যা মাপবেন            | কেন গুরুত্বপূর্ণ                             |
| -------------------- | -------------------------------------------- |
| Byte hit ratio       | বিলের সাথে সরাসরি সম্পর্কিত                  |
| Request hit ratio    | edge-এর কাজের চাপ বোঝায়                     |
| Origin egress (GB)   | আসল খরচের কাঁচা সংখ্যা                       |
| Shield offload ratio | shield আদৌ কাজ করছে কিনা                     |
| Miss latency p95     | cold-start-এ দর্শকের অভিজ্ঞতা কেমন           |
| ৪xx/৫xx হার          | ভাঙা key বা expired token-এর প্রথম লক্ষণ     |

## Cache key normaliser ও multi-CDN steering

নিচের কোডটা দুটো জিনিস করে, আর দুটোই বাস্তব ডেলিভারি স্তরে থাকে। প্রথমটা একটা **cache key normaliser** — যা edge-এ (CDN-এর edge worker বা আপনার নিজের reverse proxy-তে) চলে, URL-কে একটা ক্যানোনিকাল রূপে আনে, এবং ঠিক কোন প্যারামিটার key-তে থাকবে সেটা whitelist করে। দ্বিতীয়টা একটা **multi-CDN steering engine** — যা প্রতিটা CDN-এর সাম্প্রতিক মাপা পারফরম্যান্স ও খরচ থেকে একটা স্কোর বের করে, ওজন ঠিক করে, আর কোনো CDN খারাপ হয়ে গেলে তাকে সরিয়ে দেয়।

<CodeTabs tsFile="delivery.ts" goFile="delivery.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

// =========================================================================
// Part 1 -- Cache key normalisation
// =========================================================================

interface CacheKeyPolicy {
	/** Query parameters that genuinely change the bytes returned. */
	significantQueryParams: string[];
	/** Request headers that change the bytes returned (kept tiny on purpose). */
	significantHeaders: string[];
	/** Lowercase the path. Safe for generated segment paths, not for user text. */
	lowercasePath: boolean;
	/** Include the Range header so partial responses are cached separately. */
	includeRange: boolean;
}

const SEGMENT_POLICY: CacheKeyPolicy = {
	// Nothing user-specific. Session ids, analytics tags and signature params
	// are deliberately absent: they are per-viewer, and putting them in the key
	// gives every viewer a private copy of a 4 MB object.
	significantQueryParams: [],
	significantHeaders: [],
	lowercasePath: true,
	includeRange: true
};

const MANIFEST_POLICY: CacheKeyPolicy = {
	// Manifests may legitimately differ per device class or per DRM system.
	significantQueryParams: ['drm', 'profile'],
	significantHeaders: [],
	lowercasePath: true,
	includeRange: false
};

interface NormalisedRequest {
	cacheKey: string;
	/** Params stripped from the key -- useful for auditing key hygiene. */
	droppedParams: string[];
	kind: 'manifest' | 'segment' | 'other';
}

const MANIFEST_EXTENSIONS = ['.m3u8', '.mpd'];
const SEGMENT_EXTENSIONS = ['.ts', '.m4s', '.mp4', '.cmfv', '.cmfa'];

function classify(pathname: string): NormalisedRequest['kind'] {
	const lower = pathname.toLowerCase();
	if (MANIFEST_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'manifest';
	if (SEGMENT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'segment';
	return 'other';
}

/**
 * Collapse duplicate slashes and a trailing slash so that
 * `/vod//lecture/` and `/vod/lecture` do not become two cache entries.
 */
function canonicalPath(pathname: string, lowercase: boolean): string {
	let path = pathname.replace(/\/{2,}/g, '/');
	if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
	return lowercase ? path.toLowerCase() : path;
}

/**
 * Normalise a byte range into a canonical `start-end` form.
 *
 * Players emit `bytes=0-`, `bytes=0-1023` and occasionally multiple ranges.
 * Only single ranges are cached separately; anything else falls back to the
 * full object so we never create an unbounded family of keys.
 */
function canonicalRange(rangeHeader: string | null): string {
	if (!rangeHeader) return 'full';
	const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
	if (!match) return 'full';
	const start = match[1];
	const end = match[2] === '' ? 'eof' : match[2];
	return `${start}-${end}`;
}

function normalise(
	rawUrl: string,
	headers: Record<string, string | undefined>,
	policyFor: (kind: NormalisedRequest['kind']) => CacheKeyPolicy
): NormalisedRequest {
	const url = new URL(rawUrl);
	const kind = classify(url.pathname);
	const policy = policyFor(kind);

	const path = canonicalPath(url.pathname, policy.lowercasePath);

	// Whitelist, never blacklist. A parameter added next quarter by an
	// analytics team must default to "not part of the key".
	const kept: string[] = [];
	const dropped: string[] = [];
	for (const name of [...new Set(url.searchParams.keys())].sort()) {
		if (policy.significantQueryParams.includes(name)) {
			// Multi-valued params are sorted so ?a=2&a=1 and ?a=1&a=2 agree.
			const values = url.searchParams.getAll(name).sort();
			for (const value of values) kept.push(`${name}=${value}`);
		} else {
			dropped.push(name);
		}
	}

	const headerParts = policy.significantHeaders
		.map((name) => `${name}:${(headers[name.toLowerCase()] ?? '').toLowerCase()}`)
		.sort();

	const rangePart = policy.includeRange ? canonicalRange(headers['range'] ?? null) : 'full';

	const cacheKey = [
		url.host.toLowerCase(),
		path,
		kept.join('&'),
		headerParts.join('|'),
		rangePart
	].join('\0');

	return { cacheKey, droppedParams: dropped, kind };
}

// =========================================================================
// Part 2 -- Signed URLs
// =========================================================================

interface SignedUrlClaims {
	path: string;
	expiresAt: number; // unix seconds
	/** Optional client IP pin. Breaks mobile network switching -- use sparingly. */
	clientIp?: string;
}

/**
 * Sign the *path prefix*, not the exact segment.
 *
 * A player fetches hundreds of segments from one asset. Signing each URL
 * individually would mean re-signing on every request; signing the prefix lets
 * one token authorise the whole asset while still expiring.
 */
function signPrefix(secret: string, claims: SignedUrlClaims): string {
	const payload = [claims.path, claims.expiresAt, claims.clientIp ?? ''].join('\0');
	const mac = createHmac('sha256', secret).update(payload).digest('base64url');
	const parts = [`e=${claims.expiresAt}`, `s=${mac}`];
	if (claims.clientIp) parts.push('ip=1');
	return parts.join('&');
}

interface VerifyResult {
	ok: boolean;
	reason?: 'expired' | 'bad-signature' | 'malformed' | 'ip-mismatch';
}

function verifyPrefix(
	secret: string,
	prefix: string,
	query: URLSearchParams,
	nowSeconds: number,
	clientIp: string
): VerifyResult {
	const expiresRaw = query.get('e');
	const signature = query.get('s');
	if (!expiresRaw || !signature) return { ok: false, reason: 'malformed' };

	const expiresAt = Number.parseInt(expiresRaw, 10);
	if (!Number.isFinite(expiresAt)) return { ok: false, reason: 'malformed' };

	// Check expiry before the HMAC: it is cheaper and leaks nothing.
	if (nowSeconds > expiresAt) return { ok: false, reason: 'expired' };

	const pinned = query.get('ip') === '1';
	const payload = [prefix, expiresAt, pinned ? clientIp : ''].join('\0');
	const expected = createHmac('sha256', secret).update(payload).digest('base64url');

	const a = Buffer.from(expected);
	const b = Buffer.from(signature);
	// Length check first -- timingSafeEqual throws on mismatched lengths.
	if (a.length !== b.length) return { ok: false, reason: 'bad-signature' };
	if (!timingSafeEqual(a, b)) {
		return { ok: false, reason: pinned ? 'ip-mismatch' : 'bad-signature' };
	}

	return { ok: true };
}

// =========================================================================
// Part 3 -- Multi-CDN steering
// =========================================================================

interface CdnSample {
	cdn: string;
	/** Time to first byte for a small object, milliseconds. */
	ttfbMs: number;
	/** Sustained throughput observed while downloading a segment, kbps. */
	throughputKbps: number;
	/** 1 if the fetch failed or timed out. */
	failed: boolean;
	observedAt: number; // unix millis
}

interface CdnCost {
	cdn: string;
	/** Blended delivery cost per GB, in whatever currency the contract uses. */
	costPerGb: number;
	/** Contractual minimum share, 0..1. Commit deals often force a floor. */
	minShare: number;
	/** Hard ceiling, 0..1. Used to cap a CDN under investigation. */
	maxShare: number;
}

interface CdnScore {
	cdn: string;
	p95TtfbMs: number;
	medianThroughputKbps: number;
	errorRate: number;
	healthy: boolean;
	/** Higher is better. Combines quality and price. */
	score: number;
	samples: number;
}

const WINDOW_MS = 5 * 60 * 1000;
const MIN_SAMPLES = 30;
const MAX_ERROR_RATE = 0.02;
const MAX_TTFB_MS = 400;

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return Number.POSITIVE_INFINITY;
	const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
	return sorted[Math.max(0, index)];
}

/**
 * Score a CDN from *real user measurements*, not synthetic probes.
 *
 * Synthetic probes run from datacentres on clean networks and consistently
 * report that every CDN is excellent. The signal that matters is what actual
 * players on actual home and mobile connections observed.
 */
function scoreCdn(cdn: string, samples: CdnSample[], cost: CdnCost, now: number): CdnScore {
	const recent = samples.filter((s) => s.cdn === cdn && now - s.observedAt <= WINDOW_MS);

	if (recent.length < MIN_SAMPLES) {
		// Not enough evidence. Treat as usable but unattractive rather than
		// dead, otherwise a CDN with low share can never earn its way back.
		return {
			cdn,
			p95TtfbMs: Number.NaN,
			medianThroughputKbps: Number.NaN,
			errorRate: 0,
			healthy: true,
			score: 0.1,
			samples: recent.length
		};
	}

	const failures = recent.filter((s) => s.failed).length;
	const errorRate = failures / recent.length;

	const successes = recent.filter((s) => !s.failed);
	const ttfbs = successes.map((s) => s.ttfbMs).sort((a, b) => a - b);
	const throughputs = successes.map((s) => s.throughputKbps).sort((a, b) => a - b);

	const p95Ttfb = percentile(ttfbs, 95);
	const medianThroughput = percentile(throughputs, 50);

	const healthy = errorRate <= MAX_ERROR_RATE && p95Ttfb <= MAX_TTFB_MS;

	// Quality term: throughput rewarded, latency punished. Normalised against
	// reference values so the number stays roughly in 0..2.
	const throughputTerm = Math.min(2, medianThroughput / 8000);
	const latencyTerm = MAX_TTFB_MS / Math.max(p95Ttfb, 1);
	const reliabilityTerm = 1 - errorRate * 10; // a 2% error rate costs 20%

	// Price term: cheaper is better, but quality dominates. Cost enters as a
	// mild divisor so a bad-but-cheap CDN never wins.
	const priceTerm = 1 / Math.max(cost.costPerGb, 0.01) ** 0.35;

	const score = Math.max(0, throughputTerm * latencyTerm * reliabilityTerm * priceTerm);
	return {
		cdn,
		p95TtfbMs: p95Ttfb,
		medianThroughputKbps: medianThroughput,
		errorRate,
		healthy,
		score,
		samples: recent.length
	};
}

/**
 * Turn scores into traffic weights, honouring contractual floors and ceilings.
 *
 * Weights are smoothed against the previous allocation. Steering that reacts
 * instantly oscillates: shifting all traffic to the fastest CDN makes it the
 * slowest a minute later.
 */
function allocate(
	scores: CdnScore[],
	costs: Map<string, CdnCost>,
	previous: Map<string, number>,
	smoothing = 0.3
): Map<string, number> {
	const usable = scores.filter((s) => s.healthy);
	const pool = usable.length > 0 ? usable : scores; // never steer to nothing

	const total = pool.reduce((sum, s) => sum + s.score, 0);
	const raw = new Map<string, number>();
	for (const score of pool) {
		raw.set(score.cdn, total > 0 ? score.score / total : 1 / pool.length);
	}

	// Apply contractual bounds, then renormalise.
	for (const [cdn, cost] of costs) {
		const current = raw.get(cdn) ?? 0;
		raw.set(cdn, Math.min(cost.maxShare, Math.max(cost.minShare, current)));
	}
	const bounded = [...raw.values()].reduce((a, b) => a + b, 0);
	for (const [cdn, share] of raw) raw.set(cdn, share / bounded);

	// Exponential smoothing against the last allocation.
	const next = new Map<string, number>();
	for (const [cdn, target] of raw) {
		const before = previous.get(cdn) ?? target;
		next.set(cdn, before + (target - before) * smoothing);
	}
	const smoothTotal = [...next.values()].reduce((a, b) => a + b, 0);
	for (const [cdn, share] of next) next.set(cdn, share / smoothTotal);

	return next;
}

/** Deterministic per-session pick, so one viewer stays on one CDN. */
function pickCdn(weights: Map<string, number>, sessionId: string): string {
	let hash = 2166136261;
	for (let i = 0; i < sessionId.length; i++) {
		hash ^= sessionId.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	let point = (hash % 100000) / 100000;

	for (const [cdn, share] of [...weights].sort((a, b) => a[0].localeCompare(b[0]))) {
		if (point < share) return cdn;
		point -= share;
	}
	return [...weights.keys()][0];
}

// --- Demo ---------------------------------------------------------------

function demo(): void {
	const now = Date.now();
	const costs = new Map<string, CdnCost>([
		['cordoba-cdn', { cdn: 'cordoba-cdn', costPerGb: 0.9, minShare: 0.1, maxShare: 0.8 }],
		['samarkand-cdn', { cdn: 'samarkand-cdn', costPerGb: 0.5, minShare: 0.1, maxShare: 0.8 }]
	]);

	const samples: CdnSample[] = [];
	for (let i = 0; i < 200; i++) {
		samples.push({
			cdn: 'cordoba-cdn',
			ttfbMs: 90 + (i % 40),
			throughputKbps: 12000 + (i % 900),
			failed: i % 250 === 0,
			observedAt: now - i * 800
		});
		samples.push({
			cdn: 'samarkand-cdn',
			ttfbMs: 220 + (i % 160),
			throughputKbps: 7000 + (i % 700),
			failed: i % 60 === 0,
			observedAt: now - i * 800
		});
	}

	const scores = [...costs.keys()].map((cdn) => scoreCdn(cdn, samples, costs.get(cdn)!, now));
	const weights = allocate(scores, costs, new Map());

	for (const score of scores) {
		console.log(
			`${score.cdn} p95_ttfb=${score.p95TtfbMs}ms ` +
				`throughput=${score.medianThroughputKbps}kbps ` +
				`errors=${(score.errorRate * 100).toFixed(2)}% score=${score.score.toFixed(3)}`
		);
	}
	for (const [cdn, share] of weights) {
		console.log(`weight ${cdn} = ${(share * 100).toFixed(1)}%`);
	}

	const chosen = pickCdn(weights, 'session-al-biruni-0041');
	console.log(`session steered to ${chosen}`);

	const request = normalise(
		'https://video.example.com/VOD//Ibn-Sina-Lecture/1080p/seg-00042.m4s?session=8f21ac&utm_source=mail',
		{ range: 'bytes=0-' },
		(kind) => (kind === 'manifest' ? MANIFEST_POLICY : SEGMENT_POLICY)
	);
	console.log(`kind=${request.kind} dropped=${request.droppedParams.join(',')}`);

	const query = new URLSearchParams(
		signPrefix('secret', { path: '/vod/ibn-sina-lecture/', expiresAt: Math.floor(now / 1000) + 3600 })
	);
	console.log(
		'token check:',
		verifyPrefix('secret', '/vod/ibn-sina-lecture/', query, Math.floor(now / 1000), '203.0.113.7')
	);
}

demo();
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// =========================================================================
// Part 1 -- Cache key normalisation
// =========================================================================

type CacheKeyPolicy struct {
	SignificantQueryParams []string
	SignificantHeaders     []string
	LowercasePath          bool
	IncludeRange           bool
}

// Nothing user-specific in a segment key. Session ids and analytics tags are
// per-viewer; in the key they give every viewer a private copy of a 4 MB object.
var segmentPolicy = CacheKeyPolicy{
	SignificantQueryParams: nil,
	SignificantHeaders:     nil,
	LowercasePath:          true,
	IncludeRange:           true,
}

// Manifests may legitimately differ per DRM system or device profile.
var manifestPolicy = CacheKeyPolicy{
	SignificantQueryParams: []string{"drm", "profile"},
	LowercasePath:          true,
	IncludeRange:           false,
}

type RequestKind string

const (
	KindManifest RequestKind = "manifest"
	KindSegment  RequestKind = "segment"
	KindOther    RequestKind = "other"
)

type NormalisedRequest struct {
	CacheKey      string
	DroppedParams []string
	Kind          RequestKind
}

var (
	manifestExtensions = []string{".m3u8", ".mpd"}
	segmentExtensions  = []string{".ts", ".m4s", ".mp4", ".cmfv", ".cmfa"}
)

func classify(path string) RequestKind {
	lower := strings.ToLower(path)
	for _, ext := range manifestExtensions {
		if strings.HasSuffix(lower, ext) {
			return KindManifest
		}
	}
	for _, ext := range segmentExtensions {
		if strings.HasSuffix(lower, ext) {
			return KindSegment
		}
	}
	return KindOther
}

// canonicalPath collapses duplicate slashes and a trailing slash so that
// "/vod//lecture/" and "/vod/lecture" do not become two cache entries.
func canonicalPath(path string, lowercase bool) string {
	for strings.Contains(path, "//") {
		path = strings.ReplaceAll(path, "//", "/")
	}
	if len(path) > 1 && strings.HasSuffix(path, "/") {
		path = path[:len(path)-1]
	}
	if lowercase {
		path = strings.ToLower(path)
	}
	return path
}

// canonicalRange folds a Range header into "start-end".
//
// Players emit "bytes=0-", "bytes=0-1023" and occasionally multi-ranges. Only
// single ranges get their own key; anything else falls back to the full object
// so we never create an unbounded family of keys.
func canonicalRange(header string) string {
	header = strings.TrimSpace(header)
	if !strings.HasPrefix(header, "bytes=") {
		return "full"
	}
	spec := strings.TrimPrefix(header, "bytes=")
	if strings.Contains(spec, ",") {
		return "full"
	}
	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 {
		return "full"
	}
	if _, err := strconv.Atoi(parts[0]); err != nil {
		return "full"
	}
	end := parts[1]
	if end == "" {
		end = "eof"
	} else if _, err := strconv.Atoi(end); err != nil {
		return "full"
	}
	return parts[0] + "-" + end
}

func normalise(rawURL string, headers map[string]string, policyFor func(RequestKind) CacheKeyPolicy) (NormalisedRequest, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return NormalisedRequest{}, fmt.Errorf("parse url: %w", err)
	}

	kind := classify(parsed.Path)
	policy := policyFor(kind)
	path := canonicalPath(parsed.Path, policy.LowercasePath)

	significant := make(map[string]bool, len(policy.SignificantQueryParams))
	for _, name := range policy.SignificantQueryParams {
		significant[name] = true
	}

	// Whitelist, never blacklist. A parameter added next quarter by an
	// analytics team must default to "not part of the key".
	query := parsed.Query()
	names := make([]string, 0, len(query))
	for name := range query {
		names = append(names, name)
	}
	sort.Strings(names)

	var kept, dropped []string
	for _, name := range names {
		if !significant[name] {
			dropped = append(dropped, name)
			continue
		}
		values := append([]string(nil), query[name]...)
		sort.Strings(values) // ?a=2&a=1 and ?a=1&a=2 must agree
		for _, value := range values {
			kept = append(kept, name+"="+value)
		}
	}

	headerParts := make([]string, 0, len(policy.SignificantHeaders))
	for _, name := range policy.SignificantHeaders {
		headerParts = append(headerParts, name+":"+strings.ToLower(headers[strings.ToLower(name)]))
	}
	sort.Strings(headerParts)

	rangePart := "full"
	if policy.IncludeRange {
		rangePart = canonicalRange(headers["range"])
	}

	cacheKey := strings.Join([]string{
		strings.ToLower(parsed.Host),
		path,
		strings.Join(kept, "&"),
		strings.Join(headerParts, "|"),
		rangePart,
	}, "\x00")

	return NormalisedRequest{CacheKey: cacheKey, DroppedParams: dropped, Kind: kind}, nil
}

// =========================================================================
// Part 2 -- Signed URLs
// =========================================================================

type SignedURLClaims struct {
	Path      string
	ExpiresAt int64
	ClientIP  string // optional pin; breaks mobile network switching
}

// signPrefix signs the path *prefix*, not the exact segment.
//
// A player fetches hundreds of segments from one asset. Signing each URL
// individually means re-signing on every request; signing the prefix lets one
// token authorise the whole asset while still expiring.
func signPrefix(secret string, claims SignedURLClaims) string {
	payload := strings.Join([]string{claims.Path, strconv.FormatInt(claims.ExpiresAt, 10), claims.ClientIP}, "\x00")
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	parts := []string{"e=" + strconv.FormatInt(claims.ExpiresAt, 10), "s=" + signature}
	if claims.ClientIP != "" {
		parts = append(parts, "ip=1")
	}
	return strings.Join(parts, "&")
}

type VerifyResult struct {
	OK     bool
	Reason string
}

func verifyPrefix(secret, prefix string, query url.Values, now int64, clientIP string) VerifyResult {
	expiresRaw := query.Get("e")
	signature := query.Get("s")
	if expiresRaw == "" || signature == "" {
		return VerifyResult{Reason: "malformed"}
	}

	expiresAt, err := strconv.ParseInt(expiresRaw, 10, 64)
	if err != nil {
		return VerifyResult{Reason: "malformed"}
	}
	// Expiry first: cheaper than an HMAC and leaks nothing.
	if now > expiresAt {
		return VerifyResult{Reason: "expired"}
	}

	pinned := query.Get("ip") == "1"
	pinnedIP := ""
	if pinned {
		pinnedIP = clientIP
	}

	payload := strings.Join([]string{prefix, expiresRaw, pinnedIP}, "\x00")
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expected), []byte(signature)) {
		if pinned {
			return VerifyResult{Reason: "ip-mismatch"}
		}
		return VerifyResult{Reason: "bad-signature"}
	}
	return VerifyResult{OK: true}
}

// =========================================================================
// Part 3 -- Multi-CDN steering
// =========================================================================

type CdnSample struct {
	CDN            string
	TTFBMs         float64
	ThroughputKbps float64
	Failed         bool
	ObservedAt     time.Time
}

type CdnCost struct {
	CDN       string
	CostPerGB float64
	MinShare  float64 // contractual floor from a commit deal
	MaxShare  float64 // ceiling, used to cap a CDN under investigation
}

type CdnScore struct {
	CDN                    string
	P95TTFBMs              float64
	MedianThroughputKbps   float64
	ErrorRate              float64
	Healthy                bool
	Score                  float64
	Samples                int
}

const (
	scoringWindow = 5 * time.Minute
	minSamples    = 30
	maxErrorRate  = 0.02
	maxTTFBMs     = 400.0
)

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return math.Inf(1)
	}
	index := int(math.Ceil(p/100*float64(len(sorted)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

// scoreCdn scores a CDN from real user measurements, not synthetic probes.
//
// Synthetic probes run from datacentres on clean networks and consistently
// report that every CDN is excellent. What matters is what actual players on
// actual home and mobile connections observed.
func scoreCdn(cdn string, samples []CdnSample, cost CdnCost, now time.Time) CdnScore {
	var recent []CdnSample
	for _, sample := range samples {
		if sample.CDN == cdn && now.Sub(sample.ObservedAt) <= scoringWindow {
			recent = append(recent, sample)
		}
	}

	if len(recent) < minSamples {
		// Not enough evidence. Usable but unattractive rather than dead,
		// otherwise a low-share CDN can never earn its way back.
		return CdnScore{CDN: cdn, Healthy: true, Score: 0.1, Samples: len(recent)}
	}

	var failures int
	var ttfbs, throughputs []float64
	for _, sample := range recent {
		if sample.Failed {
			failures++
			continue
		}
		ttfbs = append(ttfbs, sample.TTFBMs)
		throughputs = append(throughputs, sample.ThroughputKbps)
	}
	sort.Float64s(ttfbs)
	sort.Float64s(throughputs)

	errorRate := float64(failures) / float64(len(recent))
	p95TTFB := percentile(ttfbs, 95)
	medianThroughput := percentile(throughputs, 50)
	healthy := errorRate <= maxErrorRate && p95TTFB <= maxTTFBMs

	// Quality: throughput rewarded, latency punished, normalised against
	// reference values so the result sits roughly in 0..2.
	throughputTerm := math.Min(2, medianThroughput/8000)
	latencyTerm := maxTTFBMs / math.Max(p95TTFB, 1)
	reliabilityTerm := 1 - errorRate*10 // a 2% error rate costs 20%

	// Price enters as a mild divisor, so a bad-but-cheap CDN never wins.
	priceTerm := math.Pow(1/math.Max(cost.CostPerGB, 0.01), 0.35)

	score := throughputTerm * latencyTerm * reliabilityTerm * priceTerm
	if score < 0 {
		score = 0
	}

	return CdnScore{
		CDN:                  cdn,
		P95TTFBMs:            p95TTFB,
		MedianThroughputKbps: medianThroughput,
		ErrorRate:            errorRate,
		Healthy:              healthy,
		Score:                score,
		Samples:              len(recent),
	}
}

// allocate turns scores into traffic weights, honouring contractual bounds.
//
// Weights are smoothed against the previous allocation. Steering that reacts
// instantly oscillates: moving all traffic to the fastest CDN makes it the
// slowest a minute later.
func allocate(scores []CdnScore, costs map[string]CdnCost, previous map[string]float64, smoothing float64) map[string]float64 {
	pool := make([]CdnScore, 0, len(scores))
	for _, score := range scores {
		if score.Healthy {
			pool = append(pool, score)
		}
	}
	if len(pool) == 0 {
		pool = scores // never steer to nothing
	}

	var total float64
	for _, score := range pool {
		total += score.Score
	}

	raw := make(map[string]float64, len(pool))
	for _, score := range pool {
		if total > 0 {
			raw[score.CDN] = score.Score / total
		} else {
			raw[score.CDN] = 1 / float64(len(pool))
		}
	}

	for cdn, cost := range costs {
		share := raw[cdn]
		raw[cdn] = math.Min(cost.MaxShare, math.Max(cost.MinShare, share))
	}

	var bounded float64
	for _, share := range raw {
		bounded += share
	}
	for cdn, share := range raw {
		raw[cdn] = share / bounded
	}

	next := make(map[string]float64, len(raw))
	var smoothTotal float64
	for cdn, target := range raw {
		before, seen := previous[cdn]
		if !seen {
			before = target
		}
		value := before + (target-before)*smoothing
		next[cdn] = value
		smoothTotal += value
	}
	for cdn, share := range next {
		next[cdn] = share / smoothTotal
	}
	return next
}

// pickCdn is a deterministic per-session pick, so one viewer stays on one CDN.
func pickCdn(weights map[string]float64, sessionID string) string {
	var hash uint32 = 2166136261
	for i := 0; i < len(sessionID); i++ {
		hash ^= uint32(sessionID[i])
		hash *= 16777619
	}
	point := float64(hash%100000) / 100000

	names := make([]string, 0, len(weights))
	for cdn := range weights {
		names = append(names, cdn)
	}
	sort.Strings(names)

	for _, cdn := range names {
		if point < weights[cdn] {
			return cdn
		}
		point -= weights[cdn]
	}
	return names[0]
}

func main() {
	now := time.Now()
	costs := map[string]CdnCost{
		"cordoba-cdn":   {CDN: "cordoba-cdn", CostPerGB: 0.9, MinShare: 0.1, MaxShare: 0.8},
		"samarkand-cdn": {CDN: "samarkand-cdn", CostPerGB: 0.5, MinShare: 0.1, MaxShare: 0.8},
	}

	var samples []CdnSample
	for i := 0; i < 200; i++ {
		observed := now.Add(-time.Duration(i) * 800 * time.Millisecond)
		samples = append(samples,
			CdnSample{"cordoba-cdn", 90 + float64(i%40), 12000 + float64(i%900), i%250 == 0, observed},
			CdnSample{"samarkand-cdn", 220 + float64(i%160), 7000 + float64(i%700), i%60 == 0, observed},
		)
	}

	scores := make([]CdnScore, 0, len(costs))
	for cdn, cost := range costs {
		scores = append(scores, scoreCdn(cdn, samples, cost, now))
	}
	sort.Slice(scores, func(a, b int) bool { return scores[a].CDN < scores[b].CDN })

	for _, score := range scores {
		fmt.Printf("%s p95_ttfb=%.0fms throughput=%.0fkbps errors=%.2f%% score=%.3f\n",
			score.CDN, score.P95TTFBMs, score.MedianThroughputKbps, score.ErrorRate*100, score.Score)
	}

	weights := allocate(scores, costs, map[string]float64{}, 0.3)
	for _, score := range scores {
		fmt.Printf("weight %s = %.1f%%\n", score.CDN, weights[score.CDN]*100)
	}
	fmt.Printf("session steered to %s\n", pickCdn(weights, "session-al-biruni-0041"))

	request, err := normalise(
		"https://video.example.com/VOD//Ibn-Sina-Lecture/1080p/seg-00042.m4s?session=8f21ac&utm_source=mail",
		map[string]string{"range": "bytes=0-"},
		func(kind RequestKind) CacheKeyPolicy {
			if kind == KindManifest {
				return manifestPolicy
			}
			return segmentPolicy
		},
	)
	if err != nil {
		fmt.Println("normalise failed:", err)
		return
	}
	fmt.Printf("kind=%s dropped=%s\n", request.Kind, strings.Join(request.DroppedParams, ","))

	token := signPrefix("secret", SignedURLClaims{Path: "/vod/ibn-sina-lecture/", ExpiresAt: now.Unix() + 3600})
	query, _ := url.ParseQuery(token)
	fmt.Printf("token check: %+v\n", verifyPrefix("secret", "/vod/ibn-sina-lecture/", query, now.Unix(), "203.0.113.7"))
}
```

</div>
</CodeTabs>

## Multi-CDN: কেন, কীভাবে, আর কীভাবে মাপবেন

একটা CDN-এ থাকা সরল আর সস্তা। তাহলে অনেকে দুই-তিনটা চালায় কেন? তিনটা আলাদা কারণ, আর তিনটা আলাদা সমাধান দাবি করে।

**রিলায়েবিলিটি।** বড় CDN-ও পুরো অঞ্চল ধরে বসে যায় — ভুল কনফিগারেশন, রুটিং সমস্যা, সার্টিফিকেট এক্সপায়ার। এক CDN-এ থাকলে আপনার ভিডিও প্ল্যাটফর্মের uptime তার uptime-এর চেয়ে বেশি হতে পারে না।

**পারফরম্যান্স, অঞ্চলভেদে।** কোনো CDN ইউরোপে চমৎকার আর দক্ষিণ এশিয়ায় গড়পড়তা; কারও আবার নির্দিষ্ট ISP-র সাথে ভালো peering আছে। সবচেয়ে বড় লাভ আসে **অঞ্চল আর ISP ধরে** ভাগ করা থেকে, বিশ্বব্যাপী গড় থেকে নয়।

**দর কষাকষি।** দুইটা CDN থাকা মানে চুক্তি নবায়নের সময় ট্রাফিক সরানোর বিশ্বাসযোগ্য হুমকি থাকা। বহু প্রতিষ্ঠানে multi-CDN-এর আসল ROI প্রকৌশলগত নয়, বাণিজ্যিক।

Steering-এর তিনটা স্তর আছে, আর প্রতিটার প্রতিক্রিয়ার গতি আলাদা:

| স্তর                     | কীভাবে কাজ করে                                    | কত দ্রুত বদলায়            | সীমাবদ্ধতা                    |
| ------------------------ | ------------------------------------------------- | -------------------------- | ----------------------------- |
| DNS                      | hostname আলাদা CDN-এ resolve করে                  | TTL অনুযায়ী, মিনিট        | resolver TTL মানে না, স্থূল   |
| Manifest / session       | manifest তৈরির সময় হোস্ট বসানো হয়               | নতুন সেশনে সাথে সাথে      | চলমান সেশন বদলায় না          |
| Mid-stream (client-side) | প্লেয়ার নিজেই পরের সেগমেন্ট অন্য হোস্ট থেকে নেয় | সেকেন্ড                    | প্লেয়ারে লজিক লাগে           |

সবচেয়ে ব্যবহারিক সমন্বয় হলো **manifest-স্তরের steering + client-side fallback**। প্লেব্যাক শুরুর সময় সার্ভার ঠিক করে দেয় এই সেশন কোন CDN-এ যাবে (তাই সেশনজুড়ে hit ratio ভালো থাকে), আর প্লেয়ারের কাছে বিকল্প হোস্টের একটা তালিকা থাকে যাতে টানা ব্যর্থতা হলে সে নিজেই সরে যেতে পারে।

<Callout type="warning">

প্রতিটা সেগমেন্টের জন্য আলাদা CDN বাছা — যাকে অনেকে "সবচেয়ে বুদ্ধিমান" মনে করে — আসলে সবচেয়ে খারাপ কৌশল। এতে প্রতিটা CDN-এর ক্যাশে একই কনটেন্টের অসম্পূর্ণ কপি জমে, hit ratio সব জায়গায় পড়ে যায়, আর TCP/QUIC কানেকশন বারবার নতুন করে খুলতে হয়। **সেশন-স্টিকি থাকুন**, শুধু ব্যর্থতায় সরুন।

</Callout>

কোন CDN আসলে ভালো করছে সেটা মাপার প্রশ্নে একটাই নিয়ম: **synthetic probe-কে বিশ্বাস করবেন না**। ডেটাসেন্টার থেকে চালানো probe পরিষ্কার নেটওয়ার্কে চলে আর প্রতিটা CDN-কেই চমৎকার বলে রায় দেয়। আসল সংকেত হলো **RUM** — প্লেয়ার থেকে আসা মাপ: TTFB, সেগমেন্ট ডাউনলোড থ্রুপুট, ব্যর্থতার হার — অঞ্চল, ISP আর CDN ধরে ভাগ করা। উপরের কোডের scoring ঠিক এই ডেটার উপর চলার জন্যই লেখা। পরের অধ্যায়ে এই RUM পাইপলাইনটাই বিস্তারিত আসছে।

## Signed URL ও token auth

পেইড কনটেন্টে URL গোপন রাখা কোনো নিরাপত্তা নয় — একটা URL কপি হয়ে ফোরামে চলে যেতে কয়েক সেকেন্ড লাগে। দরকার এমন একটা টোকেন যা **সীমিত সময়ের জন্য, সীমিত পরিসরে** বৈধ, আর যেটা CDN edge নিজেই যাচাই করতে পারে — origin-এ ফিরে না গিয়ে।

কাঠামোটা এরকম:

1. দর্শক প্লেব্যাক শুরু করে; আপনার API entitlement যাচাই করে (সে কি সাবস্ক্রাইবার? এই কনটেন্ট কি তার অঞ্চলে আছে?)।
2. API একটা **HMAC-signed token** বানায় যাতে থাকে expiry আর একটা path prefix।
3. Manifest-এ সেগমেন্ট URL-গুলো ওই টোকেনসহ যায়, অথবা টোকেন একটা cookie-তে বসে।
4. CDN edge প্রতিটা রিকোয়েস্টে signature আর expiry যাচাই করে। বৈধ হলে ক্যাশ থেকে সার্ভ করে; না হলে ৪০৩।

কয়েকটা সিদ্ধান্ত যেখানে মানুষ ভুল করে:

**Prefix সাইন করুন, প্রতিটা সেগমেন্ট নয়।** একটা ২ ঘণ্টার সিনেমায় ১২০০+ সেগমেন্ট। প্রতিটার জন্য আলাদা টোকেন মানে হয় manifest-এ ১২০০টা ভিন্ন সিগনেচার, নয়তো প্রতি সেগমেন্টে API কল। Path prefix সাইন করলে একটা টোকেনেই পুরো অ্যাসেট চলে।

**Signature অবশ্যই cache key-র বাইরে।** টোকেন per-viewer, তাই সেটা key-তে ঢুকলে hit ratio শূন্য। CDN-কে বলতে হবে: এই প্যারামিটারগুলো **যাচাই করো কিন্তু key-তে নিয়ো না**। বেশিরভাগ CDN-এ এটা আলাদা সেটিং, আর এটাই সবচেয়ে বেশি ভুল হওয়া কনফিগারেশন।

**Expiry-র মেয়াদ ভেবে ঠিক করুন।** খুব ছোট (৫ মিনিট) হলে লম্বা সিনেমার মাঝপথে টোকেন মরে যায় আর প্লেব্যাক ভাঙে — যদি না প্লেয়ার নিজে রিফ্রেশ করে। খুব বড় (৭ দিন) হলে শেয়ার করা লিংক সপ্তাহভর কাজ করে। ব্যবহারিক নিয়ম: **কনটেন্টের দৈর্ঘ্য + যুক্তিসঙ্গত pause সময়**, সাধারণত ৬-১২ ঘণ্টা, আর প্লেয়ারে নীরব টোকেন-রিফ্রেশ।

**IP-তে পিন করা প্রায়ই ক্ষতিকর।** মোবাইল দর্শক wifi থেকে cellular-এ গেলেই IP বদলায় আর প্লেব্যাক ৪০৩ খেয়ে থেমে যায়। CGNAT-এর কারণে একই IP-তে হাজারো মানুষ থাকতেও পারে, তাই নিরাপত্তার লাভও সামান্য। খুব উচ্চমূল্যের কনটেন্ট ছাড়া এটা এড়িয়ে যান; ASN-এ পিন করা বেশি সহনীয় বিকল্প।

<Callout type="tip">

Token যাচাইয়ে ব্যর্থ হলে ৪০৩ ফেরত দিন এবং **সেটা ক্যাশ করবেন না** (বা খুব ছোট TTL দিন)। নাহলে একটা ক্ষণস্থায়ী ঘড়ির অমিলের কারণে তৈরি হওয়া ৪০৩ edge-এ আটকে যেতে পারে আর বৈধ দর্শকরাও আটকে থাকবে।

</Callout>

## Egress খরচ: প্রথম শ্রেণির ডিজাইন প্রতিবন্ধকতা

বেশিরভাগ ব্যাকএন্ড সিস্টেমে খরচ মানে CPU আর স্টোরেজ। ভিডিওতে খরচ মানে **বাইট, যা নেটওয়ার্ক দিয়ে বেরোয়** — আর সেটা অন্য সব খরচকে এমনভাবে ছাপিয়ে যায় যে আর্কিটেকচারের সিদ্ধান্তগুলোই বদলে যায়।

খরচ কমানোর জায়গাগুলো, প্রভাবের ক্রমে:

**১. Origin egress কমান** (আগের হিসাবে দেখা গেছে)। Shield, লম্বা সেগমেন্ট TTL, ক্যানোনিকাল key — এখানেই সবচেয়ে বড় লাফ।

**২. যতটা বাইট আসলে দরকার ততটাই পাঠান।** Ladder-এর সবচেয়ে উপরের rung যদি ট্রাফিকের ২৫% হয় আর সেটা 8 Mbps হয়, তাহলে সেটা মোট বাইটের অসম ভাগ খাচ্ছে। Per-title বা per-scene এনকোডিং (অধ্যায় ৫) একই দেখতে মানে কম বিটরেটে দিতে পারলে বিল সরাসরি কমে। **কোডেক পছন্দও এখানেই ফেরত আসে** — AV1 বা HEVC-তে একই মানে ৩০-৪০% কম বাইট, তার বদলে বেশি এনকোডিং CPU। ভলিউম বড় হলে এই অদলবদল প্রায় সবসময় লাভজনক, কারণ এনকোডিং একবার হয় আর ডেলিভারি কোটি বার।

**৩. অপ্রয়োজনীয় ডাউনলোড বন্ধ করুন।** Autoplay preview, আক্রমণাত্মক prefetch, আর বন্ধ ট্যাবে চলতে থাকা প্লেয়ার — এগুলো এমন বাইট পাঠায় যা কেউ দেখে না। "কত বাইট পাঠানো হয়েছে" বনাম "কত বাইট আসলে দেখা হয়েছে" — এই অনুপাতটা মাপা প্রায় কেউ করে না, আর প্রায়ই সেখানে ১০-১৫% অপচয় বসে থাকে।

**৪. Storage-এর দিকেও তাকান।** ১০ রেন্ডিশন x ১ লাখ ঘণ্টা কনটেন্ট মানে বিশাল object storage বিল। যেসব rung প্রায় কেউ ব্যবহার করে না সেগুলো ছাঁটা, আর পুরনো কনটেন্টের বিরল rung গুলো cold tier-এ পাঠানো — দুটোই আসল টাকা বাঁচায়।

```text
এক ঘণ্টা কনটেন্টের মোটামুটি বাজেট (5 Mbps গড়ে ডেলিভারি):
  1 viewer-hour       = 5,000,000 bits/s x 3600 / 8 = ~2.25 GB
  10 লাখ viewer-hour  = ~2.25 PB
  @ ৳0.80 per GB       = ~৳18,00,000

একই জিনিস 3.5 Mbps গড়ে (per-title encoding-এর পর):
  1 viewer-hour       = ~1.58 GB
  10 লাখ viewer-hour  = ~1.58 PB
  @ ৳0.80 per GB       = ~৳12,60,000  →  ৩০% সাশ্রয়
```

<Callout type="info">

এই কারণেই বড় প্ল্যাটফর্মগুলো এনকোডিং মান নিয়ে এত সময় ব্যয় করে। একটা এনকোডিং উন্নতি যা গড় ডেলিভারি বিটরেট ১০% কমায়, সেটা ডেলিভারি বিলও ১০% কমায় — চিরকালের জন্য, প্রতি মাসে। অধ্যায় ১০-এ VMAF দিয়ে এই উন্নতিটা কীভাবে নিরাপদে যাচাই করবেন সেটাই মূল বিষয়।

</Callout>

## যেসব জিনিস বাস্তবে ভাঙে

- **সেগমেন্টে `Cache-Control: private` চলে যাওয়া** — সাধারণত auth middleware ডিফল্টভাবে বসিয়ে দেয়। ফল: সব miss, বিল দশগুণ। ডেপ্লয়ের পর সবসময় প্রকৃত response হেডার দেখে নিন।
- **Manifest ও সেগমেন্টের TTL একই রাখা** — লাইভে manifest বাসি হয়ে গেলে প্লেয়ার নতুন সেগমেন্ট দেখতেই পায় না, আর অকারণে stall হয়।
- **প্রকাশের মুহূর্তে thundering herd** — নতুন এপিসোড প্রকাশের সাথে সাথে হাজারো দর্শক। Shield আর request coalescing না থাকলে origin ধসে যায়। বড় প্রকাশে **prewarm** করা যায়: প্রকাশের আগে প্রধান PoP-গুলোতে প্রথম কয়েকটা সেগমেন্ট ঠেলে দেওয়া।
- **CORS হেডার ক্যাশ হয়ে আটকে যাওয়া** — `Access-Control-Allow-Origin`-এ যদি রিকোয়েস্টের origin প্রতিফলিত হয় আর সেটা key-তে না থাকে, তাহলে এক ডোমেইনের হেডার আরেক ডোমেইনকে সার্ভ হবে। হয় `Vary: Origin` দিন, নয়তো স্থির মান ব্যবহার করুন।
- **Purge-এর উপর নির্ভর করা** — global purge মিনিট লাগতে পারে আর নিশ্চয়তা কম। ঠিক পথ হলো **immutable URL সহ versioned path** (`/v2/...`), যাতে কিছু purge করতেই না হয়।
- **CDN লগ ছাড়া চলা** — CDN-এর access log বা real-time log ছাড়া hit ratio, ৪xx-এর কারণ, বা কোন কনটেন্ট origin-এ চাপ ফেলছে কিছুই জানা যায় না। এটা প্রথম দিনেই চালু করা উচিত।

<div class="takeaways">

### মূল শেখা

- ভিডিও object বড়, catalogue-এর লেজ লম্বা, আর ট্রাফিক ধারাবাহিক — তাই ওয়েব-অ্যাসেটের CDN কনফিগারেশন এখানে সরাসরি খাটে না
- Cache key নরমালাইজ করুন whitelist দিয়ে; সেগমেন্ট URL-এ কোনো per-user প্যারামিটার নয়, নাহলে hit ratio শূন্যের দিকে যায়
- সেগমেন্ট immutable আর দীর্ঘ TTL, manifest স্বল্প TTL — এই দুটো কখনো এক কনফিগারেশনে রাখবেন না
- Origin shield বহু edge-এর miss একটায় মেলায়; এর আসল লাভ origin offload আর request coalescing, দর্শকের latency নয়
- **Byte** hit ratio-ই বিলের সংখ্যা; ৯০ থেকে ৯৮-এ যাওয়া origin egress-কে পাঁচ ভাগের এক ভাগে নামায়
- Multi-CDN চালান রিলায়েবিলিটি, আঞ্চলিক পারফরম্যান্স আর দর কষাকষির জন্য; steer করুন RUM ডেটা দিয়ে, synthetic probe দিয়ে নয়
- Steering সেশন-স্টিকি রাখুন আর ধীরে বদলান; প্রতি সেগমেন্টে CDN বদলালে সব CDN-এর ক্যাশ নষ্ট হয়
- Signed URL-এ prefix সাইন করুন, signature cache key-র বাইরে রাখুন, আর IP-পিনিং এড়িয়ে চলুন
- Egress-ই প্রধান খরচ; এনকোডিং দক্ষতার প্রতিটা শতাংশ উন্নতি সরাসরি মাসিক বিলে ফেরত আসে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Netflix** নিজের Open Connect অ্যাপ্লায়েন্স ISP-র ভেতরেই বসায় — যা মূলত origin shield ধারণাটাকে চূড়ান্তে নিয়ে যাওয়া: ট্রানজিট নেটওয়ার্কে বাইটই ওঠে না
- **YouTube** সবচেয়ে জনপ্রিয় কনটেন্ট edge-এ preposition করে রাখে, আর লম্বা লেজের জন্য tiered cache-এর উপর নির্ভর করে
- **বড় OTT প্ল্যাটফর্মগুলো** প্রায় সবাই multi-CDN চালায় এবং প্লেয়ার-থেকে-আসা RUM ডেটা দিয়ে অঞ্চল ও ISP ধরে ট্রাফিক ভাগ করে
- **খেলার লাইভ স্ট্রিমিং** প্রকাশের আগে প্রধান PoP-তে সেগমেন্ট prewarm করে, কারণ কিক-অফের মুহূর্তে সব দর্শক একসাথে আসে
- **পেইড কনটেন্ট প্ল্যাটফর্ম** signed prefix + স্বল্পমেয়াদি টোকেন ব্যবহার করে, আর signature-কে cache key থেকে বাদ রাখে যাতে একটাই কপি সবাইকে সার্ভ করে

</div>
