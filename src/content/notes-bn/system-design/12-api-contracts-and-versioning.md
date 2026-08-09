---
title: 'API কন্ট্রাক্ট আর ভার্সনিং'
subtitle: 'রিসোর্স মডেলিং, HTTP ভোকাবুলারি, pagination, error envelope, rate limit, idempotent write আর কিছু না ভেঙে API বদলানোর নিয়ম।'
chapter: 12
level: 'intermediate'
readingTime: '১৯ মিনিট'
topics: ['API design', 'pagination', 'cursor', 'rate limiting', 'idempotency', 'versioning']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

এতক্ষণ আমরা সিস্টেমের ভেতরটা বানিয়েছি — ক্যাশ বসিয়েছি, লোড ব্যালান্স করেছি, ডেটাবেস স্কেল করেছি, ভারী কাজ কিউয়ে সরিয়ে দিয়েছি। এখন সেই সিস্টেমটার বাইরের দিকে তাকানোর সময়। বাইরের দিক মানে API — যেটা দিয়ে মোবাইল অ্যাপ, ওয়েব ফ্রন্টএন্ড, পার্টনার ইন্টিগ্রেশন আর আপনার নিজের অন্য সার্ভিসগুলো আপনার সাথে কথা বলে।

ভেতরের সিদ্ধান্ত আর বাইরের সিদ্ধান্তের মধ্যে একটা মৌলিক পার্থক্য আছে। ভেতরে যা করেছেন তার প্রায় সবই ফেরত নেওয়া যায়। Redis-এর বদলে Memcached নিতে পারেন, Postgres shard করতে পারেন, worker-এর ভাষা বদলাতে পারেন — কেউ টের পাবে না। কিন্তু API-তে একবার একটা ফিল্ডের নাম `title` দিয়ে ফেললে, সেটা এখন আপনার নয়। ওটা এখন সেই ৪০টা ক্লায়েন্টের, যাদের মধ্যে ৭টা আর কেউ মেইনটেইন করে না, ৩টার সোর্স কোড হারিয়ে গেছে, আর একটা চলছে একটা পার্টনারের সার্ভারে যাদের সাথে আপনার শেষ কথা হয়েছিল দেড় বছর আগে।

এটাই এই চ্যাপ্টারের মূল কথা: **API হলো একটা কন্ট্রাক্ট, আর কন্ট্রাক্টের দাম হলো আপনি সেটা ফেরত নিতে পারেন না।** বাকি সবকিছু — রিসোর্স মডেলিং, স্ট্যাটাস কোড, pagination, error envelope, rate limit, versioning — এই একটা সত্য থেকে বেরিয়ে আসা ব্যবহারিক নিয়ম।

## গল্পে বুঝি

কায়রোর একটা বড় বাণিজ্য-প্রতিষ্ঠান — মালিক ফাতিমা আল-ফিহরি। প্রতিষ্ঠানটা নিজে কিছু বানায় না; সে কর্ডোবা, দামেস্ক, সমরকন্দ আর বুখারার শত শত ব্যবসায়ীর কাছ থেকে অর্ডার নেয় আর মাল পাঠায়। শুরুর দিকে প্রতিটা ব্যবসায়ী নিজের মতো করে চিঠি লিখে অর্ডার পাঠাত — কেউ লিখত "দশ থান রেশম", কেউ লিখত "রেশম, পরিমাণ দশ", কেউ ওজনে লিখত, কেউ সংখ্যায়। কেরানিরা পাগল হয়ে গেল। তাই ফাতিমা একটা ছাপানো ফর্ম বানালেন — একটা কাগজ, যাতে নির্দিষ্ট ঘর আছে: ব্যবসায়ীর নাম, শহর, পণ্যের কোড, পরিমাণ, গন্তব্য, তারিখ। প্রতিটা পার্টনার ব্যবসায়ীকে ওই ফর্মের এক বান্ডিল দিয়ে দেওয়া হলো। এই ছাপানো ফর্মটাই হলো **প্রকাশিত কন্ট্রাক্ট** — এখন থেকে কায়রোর অফিস আর ব্যবসায়ী, দুই পক্ষই জানে কী আসবে, কোন ঘরে আসবে।

কিছুদিন পর ফাতিমার দরকার হলো বীমার তথ্য। তিনি ফর্মের নিচে একটা নতুন ঘর যোগ করলেন — "বীমা (ঐচ্ছিক)"। কর্ডোবার যে ব্যবসায়ীর কাছে এখনো পুরনো বান্ডিল পড়ে আছে, সে পুরনো ফর্মেই অর্ডার পাঠাতে থাকল, ঘরটা ফাঁকা থাকল, আর কায়রোর কেরানি সেটা দিব্যি প্রসেস করল। কারো কিছু ভাঙল না। এটাই **additive change** — নতুন ঐচ্ছিক ঘর যোগ করা নিরাপদ।

তারপর একদিন এক নতুন কেরানি বুদ্ধি করে "পরিমাণ" ঘরের নাম বদলে "একক-সংখ্যা" করে দিল, কারণ সেটা নাকি বেশি স্পষ্ট। পরের দুই সপ্তাহে সমরকন্দ থেকে আসা প্রতিটা অর্ডার বাতিল হলো — ব্যবসায়ীরা তো এখনো পুরনো ফর্মে "পরিমাণ" ঘরেই লিখছে, নতুন কেরানি সেই ঘরটা খুঁজেই পাচ্ছে না। ফাতিমার লোকসান হলো, সম্পর্ক নষ্ট হলো। এটাই **breaking change** — ঘরের নাম বদলানো মানে অন্য প্রান্তের প্রত্যেকটা মানুষকে একই দিনে বদলাতে বাধ্য করা, যেটা আপনি কখনোই পারবেন না।

আরেকটা সমস্যা আরও ব্যয়বহুল। বুখারার আল-বিরুনি একটা অর্ডার পাঠালেন উটের কাফেলায়। তিন সপ্তাহ কোনো জবাব না পেয়ে ভাবলেন চিঠিটা হারিয়ে গেছে, তাই একই অর্ডার আবার পাঠালেন। আসলে প্রথম চিঠিটা হারায়নি, শুধু জবাবটা দেরি করছিল। কায়রোর অফিস দু'বার একই মাল পাঠিয়ে দিল, দু'বার বিল করল। ফাতিমা এর সমাধান করলেন ফর্মের মাথায় একটা ঘর বসিয়ে — "রসিদ নম্বর"। ব্যবসায়ী অর্ডার লেখার সময় নিজেই একটা অনন্য নম্বর বসাবে, আর একই নম্বরের অর্ডার দ্বিতীয়বার এলে কেরানি নতুন করে মাল না পাঠিয়ে আগের বারের রসিদটাই আবার পাঠিয়ে দেবে। এই রসিদ নম্বরটাই **idempotency key**।

খাতা দেখানোর ব্যাপারেও ঝামেলা হচ্ছিল। ব্যবসায়ীরা মাঝে মাঝে চাইত "গত বছরের সব লেনদেন দেখান"। কেরানি আগে বলত "আপনি পাঁচশো নম্বর এন্ট্রি থেকে শুরু করে পরের বিশটা দেখুন" — কিন্তু খাতায় প্রতিদিন নতুন এন্ট্রি উপরে যোগ হচ্ছিল, তাই ব্যবসায়ী পরের পাতা চাইতেই কিছু এন্ট্রি দুইবার দেখত, কিছু একেবারেই বাদ পড়ত। তাই নিয়ম বদলাল: কেরানি প্রতিটা পাতার শেষে বলে দেয় "আপনি সর্বশেষ যে এন্ট্রিটা দেখলেন সেটার চিহ্ন এই — পরেরবার এই চিহ্নটা নিয়ে আসবেন, আমি ঠিক তার পরের বিশটা দেব"। নতুন এন্ট্রি যত-ই যোগ হোক, ব্যবসায়ীর পড়া কখনো এলোমেলো হয় না। এটাই **cursor pagination**।

আর শেষ সমস্যাটা ছিল ভিড়ের। এক উৎসাহী ব্যবসায়ী একদিনে একাই একশো অর্ডার ফর্ম পাঠিয়ে দিল, আর অফিসের সব কেরানি সেদিন কেবল তার কাগজই সামলাল — বাকি চারশো ব্যবসায়ী অপেক্ষায় বসে রইল। ফাতিমা নিয়ম করলেন: একজন ব্যবসায়ী দিনে সর্বোচ্চ বিশটা ফর্ম জমা দিতে পারবে; বেশি এলে কাগজ ফেরত যাবে, আর ফেরত কাগজের গায়ে লেখা থাকবে "আপনার কোটা আগামীকাল সকালে আবার খুলবে"। খেয়াল করুন — ফেরত পাঠানোটাই মূল কথা নয়, **কখন আবার আসবে সেটা বলে দেওয়াটাই** মূল কথা। এটাই **rate limiting**, আর ওই "আগামীকাল সকালে" হলো `Retry-After`।

মিলিয়ে নিই: ছাপানো ফর্মটা হলো আপনার **প্রকাশিত API কন্ট্রাক্ট**; ফর্মের প্রতিটা ঘর হলো একটা **field**; নতুন ঐচ্ছিক ঘর যোগ করা **additive, backward compatible**; ঘরের নাম বা মানে বদলানো **breaking change**; রসিদ নম্বর হলো **idempotency key**; শেষ-দেখা-এন্ট্রির চিহ্ন হলো **cursor**; দৈনিক কোটা হলো **rate limit** আর ফেরত-কাগজের বার্তা হলো **429 + Retry-After**; আর ফাতিমা যখন সত্যিই ফর্মের কাঠামো বদলাতে চান, তিনি পুরনো ফর্ম বাতিল করে দেন না — নতুন ফর্ম ছাপান, দুটোই এক বছর চালু রাখেন, প্রতিটা পুরনো ফর্মের গায়ে ছাপ মেরে দেন "এই ফর্ম আগামী রমজান পর্যন্ত গ্রহণযোগ্য", আর তারপর ধীরে ধীরে গুটিয়ে নেন। ওটাই **versioning + deprecation + sunset**।

## রিসোর্স মডেলিং: বিশেষ্য, ক্রিয়া নয়

একটা REST API-র মূল ধারণা হলো — আপনি ফাংশন এক্সপোজ করছেন না, **জিনিস** এক্সপোজ করছেন। জিনিসগুলোর নাম বিশেষ্য, আর তাদের উপর কী করা যায় সেটা বলে HTTP verb।

| খারাপ (ক্রিয়া URL-এ)         | ভালো (বিশেষ্য + verb)                   |
| ----------------------------- | --------------------------------------- |
| `POST /createManuscript`      | `POST /v1/manuscripts`                  |
| `GET /getManuscriptById?id=7` | `GET /v1/manuscripts/7`                 |
| `POST /updateManuscriptTitle` | `PATCH /v1/manuscripts/7`               |
| `POST /deleteManuscript`      | `DELETE /v1/manuscripts/7`              |
| `GET /listScholarManuscripts` | `GET /v1/scholars/ibn-sina/manuscripts` |

এতে লাভটা নান্দনিক নয়, বাস্তব: verb-ভিত্তিক URL-এ প্রতিটা নতুন কাজের জন্য একটা নতুন endpoint লাগে, আর ছয় মাস পর আপনার API-তে `updateManuscriptTitle`, `updateManuscriptTitleV2`, `updateManuscriptTitleAndAuthor` — এরকম চল্লিশটা প্রায়-একই endpoint জমে যায়। বিশেষ্য-ভিত্তিক ডিজাইনে নতুন ফিল্ড মানে শুধু একটা নতুন কী, নতুন endpoint নয়।

### কিন্তু কখনো কখনো ক্রিয়াই সৎ উত্তর

REST বিশুদ্ধতাবাদীরা এখানে আটকে যান, আর তখন API-টা হাস্যকর হয়ে ওঠে। কিছু অপারেশন সত্যিই কোনো রিসোর্সের অবস্থা বদলানো নয় — সেগুলো একটা **কাজ**, যার নিজস্ব নিয়ম, নিজস্ব পারমিশন আর নিজস্ব সাইড-ইফেক্ট আছে।

- পাসওয়ার্ড রিসেট মেইল পাঠানো
- একটা ক্যাটালগ ইনডেক্স আবার তৈরি করা
- একটা পেমেন্ট রিফান্ড করা
- একটা ড্রাফট পাণ্ডুলিপি প্রকাশ করা

`PATCH /v1/manuscripts/7` দিয়ে `status` ফিল্ড `draft` থেকে `published` করা যায় বটে — কিন্তু তাহলে "প্রকাশ" নামের ব্যবসায়িক ঘটনাটা একটা সাধারণ ফিল্ড আপডেটের ভেতর লুকিয়ে যায়, ওতে আলাদা পারমিশন বসানো কঠিন হয়, আর অডিট লগে সেটা আলাদা করে চেনা যায় না। এসব ক্ষেত্রে সৎ উত্তর হলো একটা sub-resource action:

```
POST /v1/manuscripts/7/publish
POST /v1/payments/pay_1a2b/refunds
POST /v1/catalog/reindex
```

নিয়মটা সহজ: **ডিফল্ট বিশেষ্য; যখন অপারেশনটার নিজস্ব পারমিশন, নিজস্ব রেট লিমিট বা নিজস্ব অডিট-পরিচয় দরকার, তখন সেটা আলাদা action endpoint হওয়া উচিত।**

### Granularity: chatty বনাম over-fetching

রিসোর্স কত বড় হবে — এটাই সবচেয়ে বেশি ভুল হওয়া ডিজাইন সিদ্ধান্ত, আর দুই দিকেই খাদ আছে।

**খুব ছোট রিসোর্স → chatty API।** একটা পাণ্ডুলিপির পাতা দেখাতে যদি ক্লায়েন্টকে `/manuscripts/7`, তারপর `/manuscripts/7/author`, তারপর `/authors/ibn-sina/city`, তারপর প্রতিটা অধ্যায়ের জন্য আলাদা call করতে হয় — মোবাইলে ৩০০ ms RTT-তে সেটা কয়েক সেকেন্ডের পেজ লোড। চ্যাপ্টার ৫-এর latency সংখ্যাগুলো মনে করুন: এখানে খরচটা ব্যান্ডউইথের নয়, **রাউন্ড ট্রিপের**।

**খুব বড় রিসোর্স → over-fetching।** উল্টো দিকে যদি `/manuscripts/7` একবারেই লেখকের জীবনী, সব অধ্যায়ের পূর্ণ টেক্সট আর ৪০০টা সাইটেশন ফেরত দেয়, তাহলে যে ক্লায়েন্ট শুধু শিরোনাম দেখাতে চায় সেও ২ MB টানছে — আর আপনার ডেটাবেস প্রতিবার ছয়টা join করছে।

বাস্তব সমাধান তিনটে, ক্রমবর্ধমান জটিলতায়:

- **যুক্তিসঙ্গত ডিফল্ট + `fields` প্যারামিটার।** ডিফল্টে সারাংশ, আর ক্লায়েন্ট চাইলে `?fields=id,title,author` দিয়ে ছোট করে নেবে।
- **স্পষ্ট expansion।** `?expand=author,chapters` — ক্লায়েন্ট যেটা চায় শুধু সেটাই ভেতরে ঢোকে। Stripe এই মডেলটা জনপ্রিয় করেছে। expansion-এর গভীরতায় সীমা বেঁধে দিন, নইলে একটা call দিয়ে পুরো ডেটাবেস টেনে আনা যাবে।
- **আলাদা read-optimized endpoint।** নির্দিষ্ট স্ক্রিনের জন্য নির্দিষ্ট composite endpoint (BFF প্যাটার্ন)। শক্তিশালী, কিন্তু এতে UI-র আকার API-র কন্ট্রাক্টে ঢুকে যায় — UI বদলালেই API বদলাতে হয়।

<Callout type="tip">

Granularity ঠিক করার সবচেয়ে ভালো পরীক্ষা হলো — আপনার সবচেয়ে গুরুত্বপূর্ণ স্ক্রিনটা আঁকুন, আর গুনে দেখুন সেটা রেন্ডার করতে কয়টা API call লাগে। এক বা দুই হলে ঠিক আছে। সাত হলে আপনার API chatty। উত্তরটা "GraphQL নিয়ে আসি" নয় — উত্তরটা প্রথমে "ডিফল্ট রেসপন্সে কী থাকা উচিত সেটা আবার ভাবি"।

</Callout>

## HTTP-র শব্দভাণ্ডার, ঠিকভাবে

HTTP আপনাকে একটা রেডিমেড ভোকাবুলারি দেয় যেটা প্রতিটা প্রক্সি, ক্যাশ, লোড ব্যালান্সার আর ক্লায়েন্ট লাইব্রেরি ইতিমধ্যেই বোঝে। সেটা অগ্রাহ্য করে সব কিছু `200 OK` দিয়ে পাঠিয়ে ভেতরে `"success": false` লেখা মানে বিনামূল্যে পাওয়া অবকাঠামোটা ফেলে দেওয়া।

| Verb     | কাজ                  | Idempotent   | Safe  | Body  |
| -------- | -------------------- | ------------ | ----- | ----- |
| `GET`    | পড়া                 | হ্যাঁ        | হ্যাঁ | না    |
| `POST`   | তৈরি বা action       | না           | না    | হ্যাঁ |
| `PUT`    | সম্পূর্ণ প্রতিস্থাপন | হ্যাঁ        | না    | হ্যাঁ |
| `PATCH`  | আংশিক আপডেট          | না (সাধারণত) | না    | হ্যাঁ |
| `DELETE` | মুছে ফেলা            | হ্যাঁ        | না    | না    |

এখানে "idempotent" মানে — একই রিকোয়েস্ট দশবার পাঠালে সার্ভারের অবস্থা একবার পাঠানোর মতোই থাকে। এটাই ঠিক করে দেয় কোন রিকোয়েস্ট নিরাপদে retry করা যায়, আর সেজন্যই `POST` নিয়ে আলাদা ব্যবস্থা লাগে — সেটা একটু পরেই।

স্ট্যাটাস কোডে সবচেয়ে বেশি কাজে লাগে এই কয়টা, আর এগুলোর মধ্যে পার্থক্যটাই আসল দক্ষতা:

| কোড   | কখন                                             | সাথে যা পাঠাবেন                       |
| ----- | ----------------------------------------------- | ------------------------------------- |
| `200` | সফল read বা আপডেট                               | রিসোর্স                               |
| `201` | নতুন রিসোর্স তৈরি হয়েছে                        | `Location` হেডার + তৈরি হওয়া রিসোর্স |
| `202` | কাজটা গ্রহণ করা হয়েছে, এখনো শেষ হয়নি          | job/status URL                        |
| `204` | সফল, কিন্তু কিছু ফেরত দেওয়ার নেই               | কোনো body নয়                         |
| `400` | রিকোয়েস্টটাই বিকৃত (JSON parse হয়নি)          | error envelope                        |
| `401` | কে আপনি জানি না                                 | `WWW-Authenticate`                    |
| `403` | জানি, কিন্তু অনুমতি নেই                         | error envelope                        |
| `404` | নেই — বা আপনার দেখার অধিকার নেই                 | error envelope                        |
| `409` | বর্তমান অবস্থার সাথে সংঘাত                      | কীসের সাথে সংঘাত                      |
| `422` | সিনট্যাক্স ঠিক, কিন্তু ব্যবসায়িক নিয়মে ব্যর্থ | ফিল্ড-লেভেল ডিটেইল                    |
| `429` | কোটা শেষ                                        | `Retry-After` + `RateLimit-*`         |
| `503` | আমরা সাময়িকভাবে অক্ষম                          | `Retry-After`                         |

কয়েকটা বিশেষভাবে মনে রাখার মতো:

**`201` মানে শুধু কোড নয়, `Location` হেডারও।** নতুন পাণ্ডুলিপি তৈরি হলে ক্লায়েন্টকে বলতে হবে সেটা এখন কোথায় থাকে — `Location: /v1/manuscripts/ms_9f2c1a`। এতে ক্লায়েন্টকে id parse করে নিজে URL বানাতে হয় না, অর্থাৎ URL-এর গঠনটা আপনার হাতেই থাকে।

**`202` হলো চ্যাপ্টার ১১-এর সরাসরি বহিঃপ্রকাশ।** যখন কাজটা কিউয়ে চলে যায় — একটা বড় ক্যাটালগ ইমপোর্ট, একটা রিপোর্ট জেনারেশন — তখন `200` মিথ্যা কথা, কারণ কাজটা হয়নি। `202 Accepted` দিন, সাথে একটা job রিসোর্সের URL, আর ক্লায়েন্ট সেটা poll করবে বা webhook-এ খবর পাবে। এটাই async কাজকে সৎভাবে API-তে প্রকাশ করার উপায়।

**`409` আর `422`-র পার্থক্য।** `422` মানে আপনি যা পাঠিয়েছেন সেটাই গ্রহণযোগ্য নয় — পাতার সংখ্যা ঋণাত্মক, ইমেইল ফরম্যাট ভুল। রিকোয়েস্ট বদলালে ঠিক হবে। `409` মানে আপনি যা পাঠিয়েছেন তা ঠিকই, কিন্তু সার্ভারের **বর্তমান অবস্থার** সাথে খাপ খাচ্ছে না — এই ISBN আগেই আছে, বইটা আগেই প্রকাশিত, বা আপনি যে ভার্সন এডিট করছেন সেটা এর মধ্যে বদলে গেছে। রিকোয়েস্ট এক রেখেও পরে ঠিক হয়ে যেতে পারে।

**`404` বনাম `403` একটা সিকিউরিটি সিদ্ধান্ত।** অন্য ব্যবহারকারীর ব্যক্তিগত পাণ্ডুলিপিতে `403` ফেরত দিলে আপনি স্বীকার করে ফেললেন যে ওই id-টা অস্তিত্বশীল। মাল্টি-টেন্যান্ট সিস্টেমে সাধারণত `404`-ই সঠিক উত্তর।

<Mermaid
title="Request path through the API contract layers"
code={`graph LR
  C["Client"] --> V["Version router<br/>path or header"]
  V --> A["Auth<br/>401 / 403"]
  A --> RL["Rate limiter<br/>429 + RateLimit-*"]
  RL --> ID["Idempotency layer<br/>replay or 409"]
  ID --> VAL["Validation<br/>400 / 422"]
  VAL --> H["Handler<br/>200 / 201 / 202"]
  H --> ERR["Error envelope<br/>problem+json + request id"]`}
/>

## Pagination: offset কেন ভাঙে

কোনো লিস্ট endpoint pagination ছাড়া প্রোডাকশনে যাওয়া উচিত নয় — এমনকি যখন আজ মাত্র ৫০টা সারি আছে তখনও, কারণ pagination পরে যোগ করা একটা breaking change।

**Offset pagination** সবচেয়ে পরিচিত: `?limit=20&offset=100`। ডেটাবেসে এটা হয় `LIMIT 20 OFFSET 100`। সহজ, যেকোনো sort-এ কাজ করে, আর ক্লায়েন্ট সরাসরি "৭ নম্বর পাতায় যাও" করতে পারে। কিন্তু দুটো সমস্যা আছে, আর দুটোই মারাত্মক।

**সমস্যা ১ — গভীরতায় খরচ।** `OFFSET 100000` মানে ডেটাবেস এক লক্ষ সারি পড়ে, তারপর সেগুলো ফেলে দিয়ে পরের বিশটা দেয়। খরচ offset-এর সাথে **রৈখিকভাবে বাড়ে**। প্রথম পাতা ২ ms, হাজারতম পাতা ৪০০ ms। ক্রলার বা এক্সপোর্ট স্ক্রিপ্ট গভীরে ঢুকলেই আপনার ডেটাবেস কাঁদতে শুরু করে।

**সমস্যা ২ — concurrent insert-এ পাতা পিছলে যায়।** ধরুন সবচেয়ে নতুন আগে (`ORDER BY created_at DESC`) সাজানো। ক্লায়েন্ট প্রথম পাতা (০–১৯) নিল। ঠিক তখন তিনটে নতুন পাণ্ডুলিপি যোগ হলো — সবগুলো তালিকার উপরে বসল। এবার ক্লায়েন্ট `offset=20` চাইল, কিন্তু পুরো তালিকা তিন ঘর নিচে সরে গেছে, তাই সে ইতিমধ্যে দেখা তিনটে আইটেম **আবার** পেল। উল্টোভাবে ডিলিট হলে আইটেম **বাদ** পড়ে যায়। এক্সপোর্ট বা সিঙ্ক করার সময় এটা নীরবে ডেটা হারায় — সবচেয়ে খারাপ ধরনের বাগ, কারণ কোথাও কোনো এরর ওঠে না।

**Keyset (cursor) pagination** এই দুটোই সমাধান করে। offset-এর বদলে ক্লায়েন্ট বলে "সর্বশেষ যেটা দেখেছি সেটার পরের বিশটা দাও"। SQL-এ:

```sql
-- offset: reads and discards everything before the window
SELECT id, title, created_at FROM manuscripts
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 100000;

-- keyset: jumps straight into the index, cost is constant
SELECT id, title, created_at FROM manuscripts
WHERE (created_at, id) < ('2026-03-11T09:14:22Z', 'ms_7c31')
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

দ্বিতীয় query-টার খরচ পাতা নম্বরের উপর নির্ভর করে না — index-এর ভেতর একটা নির্দিষ্ট জায়গায় লাফ দিয়ে সেখান থেকে বিশটা সারি পড়া। দশ লক্ষতম পাতাও প্রথম পাতার মতোই দ্রুত।

### Stable sort key ছাড়া keyset কাজ করে না

উপরের query-তে খেয়াল করুন সাজানো হয়েছে `(created_at, id)` — শুধু `created_at` নয়। কারণ একই মিলিসেকেন্ডে দুটো সারি তৈরি হতে পারে, আর তখন তাদের আপেক্ষিক ক্রম অনির্ধারিত — একবার এক ক্রমে আসবে, পরেরবার আরেক ক্রমে, আর আপনার cursor সীমানায় আইটেম হারাবে বা দুইবার আসবে। **cursor pagination-এর একেবারে বাধ্যতামূলক শর্ত হলো একটা মোট-ক্রম (total order): এমন কলামের tuple যেটা কখনো দুই সারির জন্য এক হয় না।** সাধারণত এটা হয় "যে ফিল্ডে সাজাতে চান" প্লাস প্রাইমারি কী। আর ওই একই tuple-এর উপর একটা composite index থাকতেই হবে, নইলে query-টা আবার scan-এ ফিরে যাবে।

### Cursor অস্বচ্ছ হতে হবে

cursor হিসেবে সরাসরি `created_at`-এর ভ্যালু ফেরত দেবেন না। কারণ সেটা ফেরত দেওয়া মানে "আমার sort key হলো created_at" — এটা কন্ট্রাক্টের অংশ হয়ে গেল, আর কাল আপনি sort key বদলাতে চাইলে পুরনো cursor নিয়ে আসা ক্লায়েন্ট ভেঙে পড়বে। এর বদলে ভেতরের অবস্থাটা JSON করে base64url এনকোড করে দিন। ক্লায়েন্ট এটাকে একটা অর্থহীন স্ট্রিং হিসেবে দেখবে — যেটা ঠিক, কারণ এর অর্থ শুধু সার্ভারের জানার কথা। ভেতরে একটা `v` ফিল্ড রাখুন, যাতে ভবিষ্যতে ফরম্যাট বদলালে পুরনো cursor চিনে নিতে পারেন। আর cursor-এ কখনো কাঁচা SQL বা এমন কিছু রাখবেন না যা ক্লায়েন্ট বদলে দিলে অন্য কারো ডেটা দেখা যায় — দরকার হলে HMAC দিয়ে সই করুন।

```json
{
	"data": [
		{
			"id": "ms_7c31",
			"title": "Al-Qanun fi al-Tibb",
			"author": "Ibn Sina",
			"city": "Bukhara",
			"createdAt": "2026-03-11T09:14:22Z"
		},
		{
			"id": "ms_5a90",
			"title": "Kitab al-Manazir",
			"author": "Ibn al-Haytham",
			"city": "Cairo",
			"createdAt": "2026-03-10T18:02:41Z"
		}
	],
	"page": {
		"limit": 20,
		"hasMore": true,
		"nextCursor": "eyJ2IjoxLCJrIjoiMjAyNi0wMy0xMFQxODowMjo0MVoiLCJpIjoibXNfNWE5MCJ9"
	},
	"requestId": "req_01JQ8ZK3M2CAIRO"
}
```

শেষ পাতায় `nextCursor` থাকবে না (বা `null` হবে) — এটাই ক্লায়েন্টের থামার সংকেত। ক্লায়েন্টকে কখনো "খালি `data` পেলে থামো" নিয়মের উপর নির্ভর করতে বলবেন না; ফিল্টারের কারণে মাঝখানে একটা খালি পাতা আসা সম্পূর্ণ বৈধ।

<Mermaid
title="Offset drift versus keyset stability under concurrent inserts"
code={`graph TD
  P1["Client reads page 1<br/>items 1-20"] --> INS["3 new manuscripts inserted<br/>at the top of the sort"]
  INS --> O["Offset: ask for offset=20<br/>whole list shifted down by 3"]
  INS --> K["Keyset: ask for after cursor<br/>cursor still points at item 20"]
  O --> OD["Items 18, 19, 20 returned again<br/>silent duplicates"]
  K --> KD["Exactly items 21-40<br/>no duplicates, no gaps"]`}
/>

### Total count একটা ফাঁদ

`"total": 48213` — দেখতে নিরীহ, বাস্তবে এটাই প্রায়ই লিস্ট endpoint-এর সবচেয়ে দামি অংশ। ফিল্টার করা `COUNT(*)` মানে ডেটাবেসকে পুরো ম্যাচিং সেট গুনতে হবে, অথচ আপনি ফেরত দিচ্ছেন মাত্র ২০টা সারি। বড় টেবিলে page fetch ৩ ms আর count ৯০০ ms — খুব সাধারণ ঘটনা। তার উপর concurrent write-এর কারণে সংখ্যাটা যখন আপনি দেখাচ্ছেন তখন এমনিতেই পুরনো।

ব্যবহারিক নীতি:

- ডিফল্টে total দেবেন না। শুধু `hasMore` দিন — UI-র "পরের পাতা" বোতামের জন্য এটুকুই যথেষ্ট।
- সত্যিই দরকার হলে সেটা **opt-in** করুন (`?includeTotal=true`), যাতে খরচটা যে চায় সে-ই দেয়।
- বিশাল সেটের জন্য আনুমানিক গণনা দিন (Postgres-এ planner estimate) আর নামটাই সৎ রাখুন — `approximateTotal`।
- আরেকটা কৌশল: `limit + 1` সারি আনুন। অতিরিক্ত সারিটা এলে বুঝলেন আরও আছে, আর সেটা ফেলে দিয়ে `hasMore: true` পাঠালেন। কোনো বাড়তি query নেই।

## ফিল্টার আর সর্টও কন্ট্রাক্ট

`?status=published&city=Cordoba&sort=-createdAt` — এটা দেখতে ছোট একটা সুবিধা, কিন্তু আপনি যেই query প্যারামিটার একবার গ্রহণ করেছেন, সেটা এখন সমর্থন করে যেতে হবে। তাই কিছু সীমা শুরুতেই বেঁধে দিন:

- **allowlist।** কোন কোন ফিল্ডে ফিল্টার আর সর্ট করা যাবে তার একটা স্পষ্ট তালিকা রাখুন। "যেকোনো কলামে সর্ট" মানে যেকোনো দিন কেউ এমন একটা কলামে সর্ট চাইবে যেখানে index নেই, আর তখন একটা full table scan আপনার ডেটাবেস আটকে দেবে।
- **সর্ট সিনট্যাক্স স্থির করুন।** `sort=-createdAt` (মাইনাস মানে descending) — একটাই কনভেনশন, সব endpoint-এ এক।
- **limit-এ সর্বোচ্চ সীমা।** `limit=1000000` চাইলে নীরবে ১০০ দিন না — `422` দিন আর বলে দিন সর্বোচ্চ কত।
- **সর্ট বদলালে cursor অচল।** পরের পাতা চাওয়ার সময় ক্লায়েন্ট যদি sort বদলে দেয়, cursor-টার আর কোনো মানে থাকে না। cursor-এর ভেতরে sort-এর একটা fingerprint রাখুন, আর না মিললে `400` দিন — নীরবে ভুল পাতা দেওয়ার চেয়ে অনেক ভালো।

## একটা সামঞ্জস্যপূর্ণ error envelope

বেশিরভাগ API-তে এররই সবচেয়ে অগোছালো অংশ, অথচ ক্লায়েন্ট ডেভেলপাররা তাদের সময়ের বেশিরভাগটা এররের সাথেই কাটায়। একটা ভালো error envelope-এ পাঁচটা জিনিস থাকে:

- **machine-readable `code`** — একটা স্থির স্ট্রিং যেটা কোড দিয়ে চেক করা যায়। HTTP স্ট্যাটাস যথেষ্ট নয়, কারণ `422`-র বিশটা আলাদা কারণ থাকতে পারে। **এই code-টা কন্ট্রাক্ট — একবার দিলে আর বদলাবেন না।**
- **human-readable `message`** — ডেভেলপারের জন্য, ইউজারকে দেখানোর জন্য নয়। মেসেজের টেক্সট কখনো কন্ট্রাক্ট নয়, তাই ক্লায়েন্টকে বলে দিন এটা parse না করতে।
- **ফিল্ড-লেভেল `errors` অ্যারে** — ফর্ম ভ্যালিডেশনে কোন ফিল্ডে কী ভুল, প্রতিটার নিজস্ব code সহ। একবারে সব ভুল দিন, একটা একটা করে নয়।
- **`requestId`** — সাপোর্টে লেখার সময় ব্যবহারকারী যেটা কপি করে পাঠাবে, আর যেটা দিয়ে আপনি আপনার লগে ঠিক ওই একটা রিকোয়েস্ট খুঁজে পাবেন। এটাই আপনার একমাত্র সেতু।
- **`type` / `title` / `status` / `detail`** — RFC 9457 (`application/problem+json`) এই চারটে ফিল্ড স্ট্যান্ডার্ড করেছে। নিজের স্কিমা আবিষ্কার না করে এটার উপরে নিজের `code` আর `errors` যোগ করে নেওয়াই সবচেয়ে ভালো পথ।

```json
{
	"type": "https://api.bukhara.dev/problems/validation-failed",
	"title": "Validation failed",
	"status": 422,
	"detail": "The manuscript could not be created because 2 fields are invalid.",
	"instance": "/v1/manuscripts",
	"code": "validation_failed",
	"requestId": "req_01JQ8ZK3M2CAIRO",
	"errors": [
		{
			"field": "pageCount",
			"code": "out_of_range",
			"message": "pageCount must be between 1 and 20000, got -4"
		},
		{
			"field": "city",
			"code": "not_allowed",
			"message": "city must be one of: Baghdad, Cordoba, Damascus, Samarkand, Bukhara, Cairo, Fez"
		}
	]
}
```

<Callout type="warning">

এররের `message` ফিল্ডে কখনো ভেতরের বিবরণ ফাঁস করবেন না — SQL, stack trace, ফাইল পাথ, টেবিলের নাম, বা "user al-khwarizmi not found" ধরনের বাক্য যা অস্তিত্ব স্বীকার করে। বিস্তারিতটা `requestId` দিয়ে লগে রাখুন, আর বাইরে শুধু কোড আর নিরাপদ বার্তা পাঠান।

</Callout>

## Rate limiting

Rate limit শুধু অপব্যবহারকারী ঠেকানোর জন্য নয় — এটা আপনার সিস্টেমের সবচেয়ে সস্তা স্থিতিশীলতার যন্ত্র। একটা ক্লায়েন্টের বাগি retry লুপ যদি আপনার পুরো ফ্লিট বসিয়ে দিতে পারে, তাহলে আপনার সমস্যা ওই ক্লায়েন্ট নয়, আপনার অরক্ষিত edge।

**Token bucket** সবচেয়ে ব্যবহারিক অ্যালগরিদম। প্রতিটা কী-র জন্য একটা বালতি, তাতে সর্বোচ্চ `capacity` টোকেন ধরে, আর প্রতি সেকেন্ডে `refillRate` হারে টোকেন জমা হয়। প্রতিটা রিকোয়েস্ট একটা টোকেন খরচ করে; বালতি খালি হলে `429`। এর সৌন্দর্য হলো এটা **burst সহ্য করে** — কেউ চুপ করে থেকে টোকেন জমিয়ে হঠাৎ ৬০টা রিকোয়েস্ট পাঠাতে পারে, যা বাস্তব ক্লায়েন্টের আচরণের সাথে মেলে — কিন্তু দীর্ঘমেয়াদি গড় হার ঠিক `refillRate`-এ বাঁধা থাকে। মেমরিতে লাগে মাত্র দুটো সংখ্যা: বর্তমান টোকেন আর শেষ রিফিলের সময়।

**Sliding window** ভিন্ন প্রশ্নের উত্তর দেয় — "গত ৬০ সেকেন্ডে ঠিক কতগুলো রিকোয়েস্ট এসেছে"। সাধারণ fixed window (প্রতি মিনিটে কাউন্টার রিসেট) একটা কুখ্যাত ফাঁকি রাখে: ঠিক মিনিটের সীমানার দুই পাশে ১০০ + ১০০ পাঠিয়ে কয়েক সেকেন্ডে ২০০ রিকোয়েস্ট ঢুকিয়ে দেওয়া যায়। sliding window log প্রতিটা রিকোয়েস্টের টাইমস্ট্যাম্প রাখে — নিখুঁত, কিন্তু মেমরি খরচ বেশি; sliding window counter দুটো পাশাপাশি window-র ওজনদার গড় নেয় — প্রায় নিখুঁত আর সস্তা। মোটা দাগে: **API gateway-তে token bucket, আর কড়া কোটা বা বিলিং-সংক্রান্ত সীমায় sliding window।**

কী দিয়ে limit করবেন সেটাও ডিজাইন সিদ্ধান্ত। শুধু IP দিয়ে করলে একটা অফিসের NAT-এর পেছনের সব ব্যবহারকারী একসাথে ভুগবে, আর যে সত্যিই আক্রমণ করছে সে IP বদলে ফেলবে। বাস্তবে স্তরে স্তরে করুন — API key বা tenant প্রতি একটা বড় সীমা, ব্যবহারকারী প্রতি একটা মাঝারি সীমা, IP প্রতি একটা মোটা সীমা অননুমোদিত রিকোয়েস্টের জন্য, আর দামি endpoint-এ (সার্চ, এক্সপোর্ট, রিপোর্ট) আলাদা কড়া সীমা।

**হেডারগুলোই আসল ইউজার এক্সপেরিয়েন্স।** সীমার কথা কেবল ডকুমেন্টেশনে লিখে রাখলে ক্লায়েন্ট সেটা জানবে দেয়ালে ধাক্কা খেয়ে। প্রতিটা রেসপন্সে — সফল হলেও — বর্তমান অবস্থা পাঠান:

```
RateLimit-Limit: 60
RateLimit-Remaining: 41
RateLimit-Reset: 19
RateLimit-Policy: 60;w=60
```

আর `429`-এর সাথে অবশ্যই `Retry-After` (সেকেন্ডে) দিন। এটা না দিলে ভদ্র ক্লায়েন্টও অন্ধভাবে retry করবে, আর আপনি নিজের হাতে একটা retry storm বানাবেন।

<Callout type="info">

`429` **কখনো** এমন হেডার ছাড়া পাঠাবেন না যা বলে দেয় কখন আবার আসা যাবে। আর ক্লায়েন্টের দিকে নিয়ম দুটো: `Retry-After` থাকলে সেটাই মানুন, আর না থাকলে **jitter সহ exponential backoff** করুন। jitter অপরিহার্য — একশোটা ক্লায়েন্ট একই সেকেন্ডে `429` পেয়ে ঠিক ২ সেকেন্ড পর একসাথে ফিরে এলে আপনি শুধু একই ভিড় ২ সেকেন্ড পিছিয়ে দিলেন।

</Callout>

## Idempotent write: `Idempotency-Key`

চ্যাপ্টার ১১-এ আমরা idempotency দেখেছি **worker**-এর স্তরে — একটা মেসেজ দুইবার ডেলিভার হলে consumer যেন দুইবার কাজ না করে। এখানে প্রশ্নটা এক ধাপ আগের: **HTTP ক্লায়েন্ট যখন retry করে, তখন কী হবে?**

পরিস্থিতিটা এড়ানো যায় না। ক্লায়েন্ট `POST /v1/orders` পাঠাল। সার্ভার অর্ডার তৈরি করল, টাকা কাটল, আর তারপর রেসপন্স ফেরত যাওয়ার পথে মোবাইল নেটওয়ার্ক পড়ে গেল। ক্লায়েন্টের কাছে এটা দেখতে ঠিক ব্যর্থতার মতো — টাইমআউট। সে retry করবে, করা উচিতও। কিন্তু সার্ভারের দিক থেকে প্রথম রিকোয়েস্টটা সম্পূর্ণ সফল ছিল। ক্লায়েন্ট আর সার্ভারের মধ্যে **এই অনিশ্চয়তাটা দূর করা অসম্ভব** — নেটওয়ার্কে "সফল হয়েছে কিনা জানি না" অবস্থাটা মৌলিক। তাই সমাধান অনিশ্চয়তা দূর করা নয়, **পুনরাবৃত্তিকে নিরীহ করা**।

সমাধানটা ঠিক ফাতিমার রসিদ নম্বর। ক্লায়েন্ট প্রতিটা write রিকোয়েস্টের সাথে একটা অনন্য কী পাঠায় — `Idempotency-Key: idem_01JQ8Z...` — যেটা সে নিজে তৈরি করে (সাধারণত একটা UUID) এবং **retry-র সময় একই কী পাঠায়**। সার্ভার তখন এই নিয়মগুলো মানে:

**১. কী নতুন হলে** — একটা রেকর্ড বসিয়ে দিন `in_progress` অবস্থায়, কাজটা করুন, তারপর রেকর্ডে চূড়ান্ত স্ট্যাটাস কোড আর রেসপন্স body জমা রাখুন।

**২. কী আগে দেখা এবং কাজ শেষ** — নতুন করে কিছু করবেন না; **জমা রাখা রেসপন্সটাই হুবহু ফেরত দিন**, একই স্ট্যাটাস কোড সহ। ক্লায়েন্ট বুঝতেই পারবে না যে এটা replay — আর সেটাই উদ্দেশ্য। সাথে একটা `Idempotent-Replay: true` হেডার দিলে ডিবাগিং সহজ হয়।

**৩. কী আগে দেখা কিন্তু কাজ এখনো চলছে** — এটাই সবচেয়ে সূক্ষ্ম কেস, আর সবচেয়ে বেশি বাদ পড়ে। ধীর নেটওয়ার্কে ক্লায়েন্ট আসল রিকোয়েস্টটা শেষ হওয়ার আগেই retry পাঠাতে পারে; তখন **দুটো রিকোয়েস্ট একসাথে চলছে**। এখানে দ্বিতীয়টাকে কাজ করতে দেওয়া চলবে না। `409 Conflict` দিন `idempotency_key_in_progress` কোড সহ, আর ক্লায়েন্ট একটু পরে আবার চেষ্টা করবে। এটা কাজ করার জন্য রেকর্ড বসানোটা **atomic** হতে হবে — ডেটাবেসে idempotency key-র উপর একটা unique constraint, আর insert ব্যর্থ হওয়া মানেই "কেউ একজন আগে থেকে আছে"।

**৪. একই কী, কিন্তু ভিন্ন payload** — কেউ একটা কী পুনর্ব্যবহার করে অন্য কিছু তৈরি করতে চাইছে। এটা প্রায় সবসময়ই ক্লায়েন্টের বাগ, আর নীরবে প্রথম রেসপন্স ফেরত দেওয়া বিপজ্জনক (ক্লায়েন্ট ভাববে দ্বিতীয় অর্ডারটাও হয়েছে)। তাই মূল রিকোয়েস্টের body-র একটা hash (fingerprint) রেকর্ডে রাখুন, আর না মিললে `422` দিন `idempotency_key_reuse` কোড সহ।

কয়েকটা ব্যবহারিক বিষয়: রেকর্ডগুলোর একটা **TTL** থাকতে হবে — ২৪ ঘণ্টা বা ৭ দিন — নইলে টেবিলটা অসীম বাড়বে; আর সেই মেয়াদ ডকুমেন্টেশনে লিখে দিন, কারণ সেটাও কন্ট্রাক্টের অংশ। কী-টা **tenant বা API key দিয়ে scope** করুন, নইলে এক গ্রাহকের কী আরেকজনের সাথে সংঘর্ষে যেতে পারে। আর সবচেয়ে গুরুত্বপূর্ণ — আদর্শভাবে রেসপন্স জমা রাখা আর আসল কাজটা **একই ডেটাবেস ট্রানজেকশনে** হওয়া উচিত, নইলে কাজ হয়ে গেছে অথচ রেকর্ড লেখা হয়নি — এমন একটা ফাঁক থেকে যাবে যেখানে retry দ্বিতীয়বার কাজ করে ফেলবে।

<Mermaid
title="Idempotency-Key handling for a retried POST"
code={`sequenceDiagram
  participant C as "Client"
  participant A as "API"
  participant S as "Idempotency store"
  participant D as "Domain / DB"
  C->>A: "POST /v1/orders (key K)"
  A->>S: "insert K as in_progress"
  S-->>A: "inserted"
  A->>D: "create order, charge"
  Note over C,A: "network drops, client sees a timeout"
  A->>S: "save status 201 and body for K"
  C->>A: "POST /v1/orders (same key K)"
  A->>S: "insert K"
  S-->>A: "conflict, K already completed"
  A-->>C: "201 replayed from store"`}
/>

## সবকিছু একসাথে: একটা কন্ট্রাক্ট-সচেতন API সার্ভার

নিচের ইমপ্লিমেন্টেশনে এই চ্যাপ্টারের প্রতিটা অংশ একসাথে আছে: ভার্সনড রাউটার, অস্বচ্ছ base64 cursor সহ keyset pagination, request id সহ problem+json error envelope, `RateLimit-*` ও `Retry-After` হেডার সহ token bucket, আর concurrent-duplicate শনাক্তকরণ সহ `Idempotency-Key`।

<CodeTabs tsFile="api-server.ts" goFile="api_server.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Domain: a manuscript catalogue served from api.bukhara.dev
// ---------------------------------------------------------------------------

interface Manuscript {
	id: string;
	title: string;
	author: string;
	city: string;
	pageCount: number;
	createdAt: string; // RFC 3339, part of the sort key
}

const ALLOWED_CITIES = ['Baghdad', 'Cordoba', 'Damascus', 'Samarkand', 'Bukhara', 'Cairo', 'Fez'];

const manuscripts: Manuscript[] = [
	{
		id: 'ms_7c31',
		title: 'Al-Qanun fi al-Tibb',
		author: 'Ibn Sina',
		city: 'Bukhara',
		pageCount: 1420,
		createdAt: '2026-03-11T09:14:22Z'
	},
	{
		id: 'ms_5a90',
		title: 'Kitab al-Manazir',
		author: 'Ibn al-Haytham',
		city: 'Cairo',
		pageCount: 880,
		createdAt: '2026-03-10T18:02:41Z'
	},
	{
		id: 'ms_4b18',
		title: 'Al-Jabr wa-l-Muqabala',
		author: 'Al-Khwarizmi',
		city: 'Baghdad',
		pageCount: 310,
		createdAt: '2026-03-10T07:55:03Z'
	},
	{
		id: 'ms_3d77',
		title: 'Al-Athar al-Baqiya',
		author: 'Al-Biruni',
		city: 'Samarkand',
		pageCount: 640,
		createdAt: '2026-03-09T21:30:10Z'
	},
	{
		id: 'ms_2e05',
		title: 'Kitab al-Hawi',
		author: 'Al-Razi',
		city: 'Baghdad',
		pageCount: 2100,
		createdAt: '2026-03-09T11:12:59Z'
	},
	{
		id: 'ms_1f44',
		title: 'Risala fi al-Aql',
		author: 'Al-Kindi',
		city: 'Cordoba',
		pageCount: 96,
		createdAt: '2026-03-08T16:45:00Z'
	}
];

// ---------------------------------------------------------------------------
// Error envelope: RFC 9457 problem+json plus a code and a request id
// ---------------------------------------------------------------------------

interface FieldError {
	field: string;
	code: string;
	message: string;
}

class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly detail: string,
		readonly fieldErrors: FieldError[] = [],
		readonly headers: Record<string, string> = {}
	) {
		super(detail);
	}
}

const PROBLEM_BASE = 'https://api.bukhara.dev/problems';

function writeProblem(
	res: ServerResponse,
	req: IncomingMessage,
	requestId: string,
	err: ApiError
): void {
	const body = {
		type: `${PROBLEM_BASE}/${err.code.replace(/_/g, '-')}`,
		title: err.code.replace(/_/g, ' '),
		status: err.status,
		detail: err.detail,
		instance: req.url ?? '',
		code: err.code,
		requestId,
		...(err.fieldErrors.length > 0 ? { errors: err.fieldErrors } : {})
	};
	res.writeHead(err.status, {
		'content-type': 'application/problem+json',
		'x-request-id': requestId,
		...err.headers
	});
	res.end(JSON.stringify(body));
}

function writeJson(
	res: ServerResponse,
	status: number,
	requestId: string,
	body: unknown,
	headers: Record<string, string> = {}
): void {
	res.writeHead(status, {
		'content-type': 'application/json',
		'x-request-id': requestId,
		...headers
	});
	res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// Token bucket rate limiter, keyed per API key
// ---------------------------------------------------------------------------

interface Bucket {
	tokens: number;
	lastRefill: number; // ms
}

class TokenBucketLimiter {
	private buckets = new Map<string, Bucket>();

	constructor(
		private readonly capacity: number,
		private readonly refillPerSecond: number
	) {}

	/** Consume one token. Returns the headers to emit and whether the call is allowed. */
	take(key: string): { allowed: boolean; limit: number; remaining: number; resetSeconds: number } {
		const now = Date.now();
		let bucket = this.buckets.get(key);
		if (!bucket) {
			bucket = { tokens: this.capacity, lastRefill: now };
			this.buckets.set(key, bucket);
		}

		const elapsedSeconds = (now - bucket.lastRefill) / 1000;
		bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
		bucket.lastRefill = now;

		const allowed = bucket.tokens >= 1;
		if (allowed) bucket.tokens -= 1;

		// Seconds until at least one token is available again.
		const deficit = Math.max(0, 1 - bucket.tokens);
		const resetSeconds = Math.ceil(deficit / this.refillPerSecond);

		return { allowed, limit: this.capacity, remaining: Math.floor(bucket.tokens), resetSeconds };
	}

	/** Drop idle buckets so memory does not grow with the key space. */
	sweep(idleMs = 10 * 60_000): void {
		const cutoff = Date.now() - idleMs;
		for (const [key, bucket] of this.buckets) {
			if (bucket.lastRefill < cutoff) this.buckets.delete(key);
		}
	}
}

const limiter = new TokenBucketLimiter(60, 1);
setInterval(() => limiter.sweep(), 60_000).unref();

// ---------------------------------------------------------------------------
// Idempotency store: in-progress detection, stored responses, payload fingerprint
// ---------------------------------------------------------------------------

type RecordState = 'in_progress' | 'completed';

interface IdempotencyRecord {
	state: RecordState;
	fingerprint: string;
	status?: number;
	body?: unknown;
	location?: string;
	expiresAt: number;
}

class IdempotencyStore {
	private records = new Map<string, IdempotencyRecord>();

	constructor(private readonly ttlMs = 24 * 60 * 60_000) {}

	/**
	 * Atomically claim a key. Returns 'claimed' if this caller owns the work,
	 * otherwise the existing record so the caller can replay or reject.
	 * In production this is an INSERT with a unique constraint, not a Map.
	 */
	claim(
		key: string,
		fingerprint: string
	): { claimed: true } | { claimed: false; record: IdempotencyRecord } {
		const existing = this.records.get(key);
		if (existing && existing.expiresAt > Date.now()) {
			return { claimed: false, record: existing };
		}
		this.records.set(key, {
			state: 'in_progress',
			fingerprint,
			expiresAt: Date.now() + this.ttlMs
		});
		return { claimed: true };
	}

	complete(key: string, status: number, body: unknown, location?: string): void {
		const record = this.records.get(key);
		if (!record) return;
		record.state = 'completed';
		record.status = status;
		record.body = body;
		record.location = location;
	}

	/** Release the claim so a failed request can be retried honestly. */
	release(key: string): void {
		const record = this.records.get(key);
		if (record && record.state === 'in_progress') this.records.delete(key);
	}
}

const idempotency = new IdempotencyStore();

function fingerprintOf(method: string, path: string, rawBody: string): string {
	return createHash('sha256').update(`${method} ${path} ${rawBody}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Opaque keyset cursor: base64url of a versioned state object
// ---------------------------------------------------------------------------

interface CursorState {
	v: number; // cursor format version
	k: string; // last seen createdAt
	i: string; // last seen id, breaks ties
	s: string; // sort fingerprint, invalidates the cursor if sort changes
}

function encodeCursor(state: CursorState): string {
	return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decodeCursor(raw: string, expectedSort: string): CursorState {
	let parsed: CursorState;
	try {
		parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorState;
	} catch {
		throw new ApiError(400, 'invalid_cursor', 'The cursor could not be decoded.', [
			{ field: 'cursor', code: 'malformed', message: 'cursor is not a valid page token' }
		]);
	}
	if (parsed.v !== 1 || typeof parsed.k !== 'string' || typeof parsed.i !== 'string') {
		throw new ApiError(400, 'invalid_cursor', 'The cursor format is not supported.');
	}
	if (parsed.s !== expectedSort) {
		throw new ApiError(
			400,
			'cursor_sort_mismatch',
			'The sort order changed; start from the first page.'
		);
	}
	return parsed;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const MAX_LIMIT = 100;

function listManuscripts(
	url: URL,
	requestId: string,
	version: 1 | 2
): { status: number; body: unknown } {
	const limitRaw = url.searchParams.get('limit') ?? '20';
	const limit = Number.parseInt(limitRaw, 10);
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
		throw new ApiError(422, 'validation_failed', 'The limit parameter is out of range.', [
			{ field: 'limit', code: 'out_of_range', message: `limit must be between 1 and ${MAX_LIMIT}` }
		]);
	}

	const sort = url.searchParams.get('sort') ?? '-createdAt';
	if (sort !== '-createdAt') {
		throw new ApiError(422, 'validation_failed', 'That sort field is not supported.', [
			{ field: 'sort', code: 'not_allowed', message: 'sort must be -createdAt' }
		]);
	}

	const city = url.searchParams.get('city');
	if (city && !ALLOWED_CITIES.includes(city)) {
		throw new ApiError(422, 'validation_failed', 'That city is not in the catalogue.', [
			{
				field: 'city',
				code: 'not_allowed',
				message: `city must be one of: ${ALLOWED_CITIES.join(', ')}`
			}
		]);
	}

	// Total order: (createdAt DESC, id DESC). Never sort on createdAt alone.
	let rows = manuscripts
		.filter((m) => !city || m.city === city)
		.sort((a, b) =>
			a.createdAt === b.createdAt
				? b.id.localeCompare(a.id)
				: b.createdAt.localeCompare(a.createdAt)
		);

	const cursorRaw = url.searchParams.get('cursor');
	if (cursorRaw) {
		const cursor = decodeCursor(cursorRaw, sort);
		rows = rows.filter(
			(m) => m.createdAt < cursor.k || (m.createdAt === cursor.k && m.id < cursor.i)
		);
	}

	// Fetch limit + 1 so hasMore needs no extra count query.
	const window = rows.slice(0, limit + 1);
	const hasMore = window.length > limit;
	const page = hasMore ? window.slice(0, limit) : window;
	const last = page[page.length - 1];

	const data = page.map((m) => (version === 1 ? toV1(m) : toV2(m)));

	return {
		status: 200,
		body: {
			data,
			page: {
				limit,
				hasMore,
				nextCursor:
					hasMore && last ? encodeCursor({ v: 1, k: last.createdAt, i: last.id, s: sort }) : null
			},
			requestId
		}
	};
}

// v1 exposes a flat author string. v2 nests it, and keeps author for one more
// release so old clients keep working: expand now, contract after the sunset.
function toV1(m: Manuscript) {
	return {
		id: m.id,
		title: m.title,
		author: m.author,
		city: m.city,
		pageCount: m.pageCount,
		createdAt: m.createdAt
	};
}

function toV2(m: Manuscript) {
	return {
		id: m.id,
		title: m.title,
		author: m.author, // deprecated, removed after the sunset date
		scholar: { name: m.author, city: m.city },
		pageCount: m.pageCount,
		createdAt: m.createdAt
	};
}

function createManuscript(
	rawBody: string,
	requestId: string
): { status: number; body: unknown; location: string } {
	let payload: Partial<Manuscript>;
	try {
		payload = JSON.parse(rawBody) as Partial<Manuscript>;
	} catch {
		throw new ApiError(400, 'malformed_body', 'The request body is not valid JSON.');
	}

	const errors: FieldError[] = [];
	if (!payload.title)
		errors.push({ field: 'title', code: 'required', message: 'title is required' });
	if (!payload.author)
		errors.push({ field: 'author', code: 'required', message: 'author is required' });
	if (payload.city && !ALLOWED_CITIES.includes(payload.city)) {
		errors.push({
			field: 'city',
			code: 'not_allowed',
			message: `city must be one of: ${ALLOWED_CITIES.join(', ')}`
		});
	}
	if (payload.pageCount !== undefined && (payload.pageCount < 1 || payload.pageCount > 20000)) {
		errors.push({
			field: 'pageCount',
			code: 'out_of_range',
			message: `pageCount must be between 1 and 20000, got ${payload.pageCount}`
		});
	}
	if (errors.length > 0) {
		throw new ApiError(
			422,
			'validation_failed',
			`The manuscript could not be created because ${errors.length} fields are invalid.`,
			errors
		);
	}

	if (manuscripts.some((m) => m.title === payload.title && m.author === payload.author)) {
		throw new ApiError(
			409,
			'duplicate_manuscript',
			'A manuscript with that title already exists for this author.'
		);
	}

	const created: Manuscript = {
		id: `ms_${randomUUID().slice(0, 4)}`,
		title: payload.title as string,
		author: payload.author as string,
		city: payload.city ?? 'Baghdad',
		pageCount: payload.pageCount ?? 1,
		createdAt: new Date().toISOString()
	};
	manuscripts.push(created);

	return {
		status: 201,
		body: { data: toV1(created), requestId },
		location: `/v1/manuscripts/${created.id}`
	};
}

// ---------------------------------------------------------------------------
// Server: version routing, rate limiting, idempotency, error envelope
// ---------------------------------------------------------------------------

const SUNSET_V1 = 'Sat, 31 Oct 2026 23:59:59 GMT';

async function readBody(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
	const requestId = `req_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
	const url = new URL(req.url ?? '/', 'https://api.bukhara.dev');

	try {
		// --- version routing: /v1/... or /v2/... ---
		const segments = url.pathname.split('/').filter(Boolean);
		const versionSegment = segments[0];
		if (versionSegment !== 'v1' && versionSegment !== 'v2') {
			throw new ApiError(404, 'unknown_version', 'Use /v1 or /v2 as the first path segment.');
		}
		const version: 1 | 2 = versionSegment === 'v1' ? 1 : 2;
		const resource = segments.slice(1).join('/');

		// --- rate limiting, per API key ---
		const apiKey = (req.headers['x-api-key'] as string) ?? 'anonymous';
		const quota = limiter.take(apiKey);
		const rateHeaders: Record<string, string> = {
			'RateLimit-Limit': String(quota.limit),
			'RateLimit-Remaining': String(Math.max(0, quota.remaining)),
			'RateLimit-Reset': String(quota.resetSeconds),
			'RateLimit-Policy': `${quota.limit};w=60`
		};
		if (!quota.allowed) {
			throw new ApiError(429, 'rate_limited', 'Too many requests for this API key.', [], {
				...rateHeaders,
				'Retry-After': String(Math.max(1, quota.resetSeconds))
			});
		}

		// --- deprecation signalling for v1 ---
		if (version === 1) {
			rateHeaders['Deprecation'] = 'true';
			rateHeaders['Sunset'] = SUNSET_V1;
			rateHeaders['Link'] = '<https://api.bukhara.dev/docs/migrate-v2>; rel="deprecation"';
		}

		if (req.method === 'GET' && resource === 'manuscripts') {
			const result = listManuscripts(url, requestId, version);
			writeJson(res, result.status, requestId, result.body, rateHeaders);
			return;
		}

		if (req.method === 'POST' && resource === 'manuscripts') {
			const rawBody = await readBody(req);
			const key = req.headers['idempotency-key'] as string | undefined;
			if (!key) {
				throw new ApiError(
					400,
					'idempotency_key_required',
					'POST requests must carry an Idempotency-Key header.'
				);
			}

			// Scope the key per API key so tenants cannot collide.
			const scopedKey = `${apiKey}:${key}`;
			const fingerprint = fingerprintOf('POST', url.pathname, rawBody);
			const claim = idempotency.claim(scopedKey, fingerprint);

			if (!claim.claimed) {
				const record = claim.record;
				if (record.fingerprint !== fingerprint) {
					throw new ApiError(
						422,
						'idempotency_key_reuse',
						'That Idempotency-Key was used with a different payload.'
					);
				}
				if (record.state === 'in_progress') {
					throw new ApiError(
						409,
						'idempotency_key_in_progress',
						'A request with that Idempotency-Key is still being processed.',
						[],
						{
							...rateHeaders,
							'Retry-After': '1'
						}
					);
				}
				// Replay the stored response byte for byte.
				writeJson(res, record.status ?? 200, requestId, record.body, {
					...rateHeaders,
					'Idempotent-Replay': 'true',
					...(record.location ? { Location: record.location } : {})
				});
				return;
			}

			try {
				const result = createManuscript(rawBody, requestId);
				idempotency.complete(scopedKey, result.status, result.body, result.location);
				writeJson(res, result.status, requestId, result.body, {
					...rateHeaders,
					Location: result.location
				});
			} catch (err) {
				idempotency.release(scopedKey);
				throw err;
			}
			return;
		}

		throw new ApiError(404, 'not_found', 'No route matches that path and method.');
	} catch (err) {
		if (err instanceof ApiError) {
			writeProblem(res, req, requestId, err);
			return;
		}
		console.error(`[api] request_id=${requestId} unhandled error:`, err);
		writeProblem(
			res,
			req,
			requestId,
			new ApiError(500, 'internal_error', 'An unexpected error occurred.')
		);
	}
});

server.listen(8080, () => console.log('[api] listening on :8080'));
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ---------------------------------------------------------------------------
// Domain: a manuscript catalogue served from api.bukhara.dev
// ---------------------------------------------------------------------------

type Manuscript struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Author    string `json:"author"`
	City      string `json:"city"`
	PageCount int    `json:"pageCount"`
	CreatedAt string `json:"createdAt"` // RFC 3339, part of the sort key
}

var allowedCities = []string{"Baghdad", "Cordoba", "Damascus", "Samarkand", "Bukhara", "Cairo", "Fez"}

var (
	catalogueMu sync.RWMutex
	catalogue   = []Manuscript{
		{"ms_7c31", "Al-Qanun fi al-Tibb", "Ibn Sina", "Bukhara", 1420, "2026-03-11T09:14:22Z"},
		{"ms_5a90", "Kitab al-Manazir", "Ibn al-Haytham", "Cairo", 880, "2026-03-10T18:02:41Z"},
		{"ms_4b18", "Al-Jabr wa-l-Muqabala", "Al-Khwarizmi", "Baghdad", 310, "2026-03-10T07:55:03Z"},
		{"ms_3d77", "Al-Athar al-Baqiya", "Al-Biruni", "Samarkand", 640, "2026-03-09T21:30:10Z"},
		{"ms_2e05", "Kitab al-Hawi", "Al-Razi", "Baghdad", 2100, "2026-03-09T11:12:59Z"},
		{"ms_1f44", "Risala fi al-Aql", "Al-Kindi", "Cordoba", 96, "2026-03-08T16:45:00Z"},
	}
)

func cityAllowed(c string) bool {
	for _, a := range allowedCities {
		if a == c {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Error envelope: RFC 9457 problem+json plus a code and a request id
// ---------------------------------------------------------------------------

type FieldError struct {
	Field   string `json:"field"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type APIError struct {
	Status  int
	Code    string
	Detail  string
	Fields  []FieldError
	Headers map[string]string
}

func (e *APIError) Error() string { return e.Detail }

func newAPIError(status int, code, detail string, fields ...FieldError) *APIError {
	return &APIError{Status: status, Code: code, Detail: detail, Fields: fields}
}

type problem struct {
	Type      string       `json:"type"`
	Title     string       `json:"title"`
	Status    int          `json:"status"`
	Detail    string       `json:"detail"`
	Instance  string       `json:"instance"`
	Code      string       `json:"code"`
	RequestID string       `json:"requestId"`
	Errors    []FieldError `json:"errors,omitempty"`
}

const problemBase = "https://api.bukhara.dev/problems"

func writeProblem(w http.ResponseWriter, r *http.Request, requestID string, e *APIError) {
	for k, v := range e.Headers {
		w.Header().Set(k, v)
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("X-Request-Id", requestID)
	w.WriteHeader(e.Status)
	_ = json.NewEncoder(w).Encode(problem{
		Type:      problemBase + "/" + strings.ReplaceAll(e.Code, "_", "-"),
		Title:     strings.ReplaceAll(e.Code, "_", " "),
		Status:    e.Status,
		Detail:    e.Detail,
		Instance:  r.URL.Path,
		Code:      e.Code,
		RequestID: requestID,
		Errors:    e.Fields,
	})
}

func writeJSON(w http.ResponseWriter, status int, requestID string, body any, headers map[string]string) {
	for k, v := range headers {
		w.Header().Set(k, v)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Request-Id", requestID)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// ---------------------------------------------------------------------------
// Token bucket rate limiter, keyed per API key
// ---------------------------------------------------------------------------

type bucket struct {
	tokens     float64
	lastRefill time.Time
}

type TokenBucketLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	capacity float64
	refill   float64 // tokens per second
}

type Quota struct {
	Allowed   bool
	Limit     int
	Remaining int
	Reset     int // seconds until a token is available
}

func NewLimiter(capacity, refillPerSecond float64) *TokenBucketLimiter {
	return &TokenBucketLimiter{buckets: make(map[string]*bucket), capacity: capacity, refill: refillPerSecond}
}

func (l *TokenBucketLimiter) Take(key string) Quota {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.capacity, lastRefill: now}
		l.buckets[key] = b
	}

	elapsed := now.Sub(b.lastRefill).Seconds()
	b.tokens = math.Min(l.capacity, b.tokens+elapsed*l.refill)
	b.lastRefill = now

	allowed := b.tokens >= 1
	if allowed {
		b.tokens--
	}

	deficit := math.Max(0, 1-b.tokens)
	return Quota{
		Allowed:   allowed,
		Limit:     int(l.capacity),
		Remaining: int(math.Max(0, math.Floor(b.tokens))),
		Reset:     int(math.Ceil(deficit / l.refill)),
	}
}

// Sweep drops idle buckets so memory does not grow with the key space.
func (l *TokenBucketLimiter) Sweep(idle time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := time.Now().Add(-idle)
	for k, b := range l.buckets {
		if b.lastRefill.Before(cutoff) {
			delete(l.buckets, k)
		}
	}
}

var limiter = NewLimiter(60, 1)

// ---------------------------------------------------------------------------
// Idempotency store: in-progress detection, stored responses, fingerprint check
// ---------------------------------------------------------------------------

type idemRecord struct {
	InProgress  bool
	Fingerprint string
	Status      int
	Body        json.RawMessage
	Location    string
	ExpiresAt   time.Time
}

type IdempotencyStore struct {
	mu      sync.Mutex
	records map[string]*idemRecord
	ttl     time.Duration
}

func NewIdempotencyStore(ttl time.Duration) *IdempotencyStore {
	return &IdempotencyStore{records: make(map[string]*idemRecord), ttl: ttl}
}

// Claim atomically reserves a key. claimed=false means an existing record is
// returned, so the caller can replay it or reject the request.
// In production this is an INSERT guarded by a unique constraint, not a map.
func (s *IdempotencyStore) Claim(key, fingerprint string) (claimed bool, existing idemRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if rec, ok := s.records[key]; ok && rec.ExpiresAt.After(time.Now()) {
		return false, *rec
	}
	s.records[key] = &idemRecord{InProgress: true, Fingerprint: fingerprint, ExpiresAt: time.Now().Add(s.ttl)}
	return true, idemRecord{}
}

func (s *IdempotencyStore) Complete(key string, status int, body json.RawMessage, location string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rec, ok := s.records[key]; ok {
		rec.InProgress = false
		rec.Status = status
		rec.Body = body
		rec.Location = location
	}
}

// Release frees the claim so a failed request can be retried honestly.
func (s *IdempotencyStore) Release(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rec, ok := s.records[key]; ok && rec.InProgress {
		delete(s.records, key)
	}
}

var idempotency = NewIdempotencyStore(24 * time.Hour)

func fingerprintOf(method, path string, body []byte) string {
	h := sha256.New()
	h.Write([]byte(method + " " + path + " "))
	h.Write(body)
	return hex.EncodeToString(h.Sum(nil))
}

// ---------------------------------------------------------------------------
// Opaque keyset cursor: base64url of a versioned state object
// ---------------------------------------------------------------------------

type cursorState struct {
	V int    `json:"v"` // cursor format version
	K string `json:"k"` // last seen createdAt
	I string `json:"i"` // last seen id, breaks ties
	S string `json:"s"` // sort fingerprint
}

func encodeCursor(c cursorState) string {
	raw, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeCursor(raw, expectedSort string) (cursorState, *APIError) {
	var c cursorState
	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil || json.Unmarshal(decoded, &c) != nil {
		return c, newAPIError(400, "invalid_cursor", "The cursor could not be decoded.",
			FieldError{"cursor", "malformed", "cursor is not a valid page token"})
	}
	if c.V != 1 || c.K == "" || c.I == "" {
		return c, newAPIError(400, "invalid_cursor", "The cursor format is not supported.")
	}
	if c.S != expectedSort {
		return c, newAPIError(400, "cursor_sort_mismatch", "The sort order changed; start from the first page.")
	}
	return c, nil
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const maxLimit = 100

type pageMeta struct {
	Limit      int    `json:"limit"`
	HasMore    bool   `json:"hasMore"`
	NextCursor string `json:"nextCursor"`
}

func listManuscripts(r *http.Request, requestID string, version int) (any, *APIError) {
	q := r.URL.Query()

	limit := 20
	if raw := q.Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > maxLimit {
			return nil, newAPIError(422, "validation_failed", "The limit parameter is out of range.",
				FieldError{"limit", "out_of_range", fmt.Sprintf("limit must be between 1 and %d", maxLimit)})
		}
		limit = parsed
	}

	sortKey := q.Get("sort")
	if sortKey == "" {
		sortKey = "-createdAt"
	}
	if sortKey != "-createdAt" {
		return nil, newAPIError(422, "validation_failed", "That sort field is not supported.",
			FieldError{"sort", "not_allowed", "sort must be -createdAt"})
	}

	city := q.Get("city")
	if city != "" && !cityAllowed(city) {
		return nil, newAPIError(422, "validation_failed", "That city is not in the catalogue.",
			FieldError{"city", "not_allowed", "city must be one of: " + strings.Join(allowedCities, ", ")})
	}

	catalogueMu.RLock()
	rows := make([]Manuscript, 0, len(catalogue))
	for _, m := range catalogue {
		if city == "" || m.City == city {
			rows = append(rows, m)
		}
	}
	catalogueMu.RUnlock()

	// Total order: (createdAt DESC, id DESC). Never sort on createdAt alone.
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].CreatedAt == rows[j].CreatedAt {
			return rows[i].ID > rows[j].ID
		}
		return rows[i].CreatedAt > rows[j].CreatedAt
	})

	if raw := q.Get("cursor"); raw != "" {
		c, apiErr := decodeCursor(raw, sortKey)
		if apiErr != nil {
			return nil, apiErr
		}
		filtered := rows[:0]
		for _, m := range rows {
			if m.CreatedAt < c.K || (m.CreatedAt == c.K && m.ID < c.I) {
				filtered = append(filtered, m)
			}
		}
		rows = filtered
	}

	// Fetch limit + 1 so hasMore needs no extra count query.
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}

	data := make([]any, 0, len(rows))
	for _, m := range rows {
		if version == 1 {
			data = append(data, toV1(m))
		} else {
			data = append(data, toV2(m))
		}
	}

	meta := pageMeta{Limit: limit, HasMore: hasMore}
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		meta.NextCursor = encodeCursor(cursorState{V: 1, K: last.CreatedAt, I: last.ID, S: sortKey})
	}

	return map[string]any{"data": data, "page": meta, "requestId": requestID}, nil
}

// v1 exposes a flat author string. v2 nests it and keeps author for one more
// release so old clients keep working: expand now, contract after the sunset.
func toV1(m Manuscript) map[string]any {
	return map[string]any{
		"id": m.ID, "title": m.Title, "author": m.Author,
		"city": m.City, "pageCount": m.PageCount, "createdAt": m.CreatedAt,
	}
}

func toV2(m Manuscript) map[string]any {
	return map[string]any{
		"id":        m.ID,
		"title":     m.Title,
		"author":    m.Author, // deprecated, removed after the sunset date
		"scholar":   map[string]any{"name": m.Author, "city": m.City},
		"pageCount": m.PageCount,
		"createdAt": m.CreatedAt,
	}
}

func createManuscript(body []byte, requestID string) (int, any, string, *APIError) {
	var payload Manuscript
	if err := json.Unmarshal(body, &payload); err != nil {
		return 0, nil, "", newAPIError(400, "malformed_body", "The request body is not valid JSON.")
	}

	var fields []FieldError
	if payload.Title == "" {
		fields = append(fields, FieldError{"title", "required", "title is required"})
	}
	if payload.Author == "" {
		fields = append(fields, FieldError{"author", "required", "author is required"})
	}
	if payload.City != "" && !cityAllowed(payload.City) {
		fields = append(fields, FieldError{"city", "not_allowed", "city must be one of: " + strings.Join(allowedCities, ", ")})
	}
	if payload.PageCount != 0 && (payload.PageCount < 1 || payload.PageCount > 20000) {
		fields = append(fields, FieldError{"pageCount", "out_of_range",
			fmt.Sprintf("pageCount must be between 1 and 20000, got %d", payload.PageCount)})
	}
	if len(fields) > 0 {
		return 0, nil, "", newAPIError(422, "validation_failed",
			fmt.Sprintf("The manuscript could not be created because %d fields are invalid.", len(fields)), fields...)
	}

	catalogueMu.Lock()
	defer catalogueMu.Unlock()
	for _, m := range catalogue {
		if m.Title == payload.Title && m.Author == payload.Author {
			return 0, nil, "", newAPIError(409, "duplicate_manuscript",
				"A manuscript with that title already exists for this author.")
		}
	}

	created := Manuscript{
		ID:        fmt.Sprintf("ms_%04x", time.Now().UnixNano()%0xffff),
		Title:     payload.Title,
		Author:    payload.Author,
		City:      payload.City,
		PageCount: payload.PageCount,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if created.City == "" {
		created.City = "Baghdad"
	}
	if created.PageCount == 0 {
		created.PageCount = 1
	}
	catalogue = append(catalogue, created)

	return 201, map[string]any{"data": toV1(created), "requestId": requestID}, "/v1/manuscripts/" + created.ID, nil
}

// ---------------------------------------------------------------------------
// Server: version routing, rate limiting, idempotency, error envelope
// ---------------------------------------------------------------------------

const sunsetV1 = "Sat, 31 Oct 2026 23:59:59 GMT"

func handle(w http.ResponseWriter, r *http.Request) {
	requestID := fmt.Sprintf("req_%016x", time.Now().UnixNano())

	fail := func(e *APIError) { writeProblem(w, r, requestID, e) }

	segments := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(segments) == 0 || (segments[0] != "v1" && segments[0] != "v2") {
		fail(newAPIError(404, "unknown_version", "Use /v1 or /v2 as the first path segment."))
		return
	}
	version := 1
	if segments[0] == "v2" {
		version = 2
	}
	resource := strings.Join(segments[1:], "/")

	apiKey := r.Header.Get("X-Api-Key")
	if apiKey == "" {
		apiKey = "anonymous"
	}
	quota := limiter.Take(apiKey)
	headers := map[string]string{
		"RateLimit-Limit":     strconv.Itoa(quota.Limit),
		"RateLimit-Remaining": strconv.Itoa(quota.Remaining),
		"RateLimit-Reset":     strconv.Itoa(quota.Reset),
		"RateLimit-Policy":    fmt.Sprintf("%d;w=60", quota.Limit),
	}
	if !quota.Allowed {
		e := newAPIError(429, "rate_limited", "Too many requests for this API key.")
		e.Headers = headers
		e.Headers["Retry-After"] = strconv.Itoa(int(math.Max(1, float64(quota.Reset))))
		fail(e)
		return
	}

	if version == 1 {
		headers["Deprecation"] = "true"
		headers["Sunset"] = sunsetV1
		headers["Link"] = `<https://api.bukhara.dev/docs/migrate-v2>; rel="deprecation"`
	}

	switch {
	case r.Method == http.MethodGet && resource == "manuscripts":
		body, apiErr := listManuscripts(r, requestID, version)
		if apiErr != nil {
			apiErr.Headers = headers
			fail(apiErr)
			return
		}
		writeJSON(w, 200, requestID, body, headers)

	case r.Method == http.MethodPost && resource == "manuscripts":
		raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			fail(newAPIError(400, "malformed_body", "The request body could not be read."))
			return
		}

		key := r.Header.Get("Idempotency-Key")
		if key == "" {
			fail(newAPIError(400, "idempotency_key_required", "POST requests must carry an Idempotency-Key header."))
			return
		}

		// Scope the key per API key so tenants cannot collide.
		scoped := apiKey + ":" + key
		fp := fingerprintOf("POST", r.URL.Path, raw)
		claimed, existing := idempotency.Claim(scoped, fp)

		if !claimed {
			if existing.Fingerprint != fp {
				fail(newAPIError(422, "idempotency_key_reuse", "That Idempotency-Key was used with a different payload."))
				return
			}
			if existing.InProgress {
				e := newAPIError(409, "idempotency_key_in_progress", "A request with that Idempotency-Key is still being processed.")
				e.Headers = map[string]string{"Retry-After": "1"}
				for k, v := range headers {
					e.Headers[k] = v
				}
				fail(e)
				return
			}
			// Replay the stored response byte for byte.
			replay := headers
			replay["Idempotent-Replay"] = "true"
			if existing.Location != "" {
				replay["Location"] = existing.Location
			}
			writeJSON(w, existing.Status, requestID, json.RawMessage(existing.Body), replay)
			return
		}

		status, body, location, apiErr := createManuscript(raw, requestID)
		if apiErr != nil {
			idempotency.Release(scoped)
			apiErr.Headers = headers
			fail(apiErr)
			return
		}
		stored, _ := json.Marshal(body)
		idempotency.Complete(scoped, status, stored, location)
		headers["Location"] = location
		writeJSON(w, status, requestID, body, headers)

	default:
		fail(newAPIError(404, "not_found", "No route matches that path and method."))
	}
}

func main() {
	go func() {
		for range time.Tick(time.Minute) {
			limiter.Sweep(10 * time.Minute)
		}
	}()

	log.Println("[api] listening on :8080")
	if err := http.ListenAndServe(":8080", http.HandlerFunc(handle)); err != nil {
		log.Fatal(err)
	}
}
```

</div>
</CodeTabs>

## Versioning: তিনটে কৌশল, তিন রকম দাম

কন্ট্রাক্ট সত্যিই ভাঙতে হলে ভার্সন লাগে। তিনটে প্রচলিত পদ্ধতি, আর প্রতিটার সৎ ট্রেড-অফ:

| কৌশল              | দেখতে                                     | ভালো দিক                                      | খারাপ দিক                                                           |
| ----------------- | ----------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| **URL path**      | `/v1/manuscripts`                         | ব্রাউজারে দেখা যায়, curl-এ সহজ, রাউটিং তুচ্ছ | রিসোর্সের একই জিনিসের দুটো URL, ক্যাশ ও লিঙ্ক ভাগ হয়ে যায়         |
| **Custom header** | `X-API-Version: 2026-03-01`               | URL পরিষ্কার থাকে, ধীরে ধীরে rollout করা যায় | curl-এ অদৃশ্য, ভুলে গেলে ডিফল্ট কী হবে সেটা ঠিক করতে হয়            |
| **Media type**    | `Accept: application/vnd.bukhara.v2+json` | HTTP-র নিজস্ব ব্যবস্থা, per-resource ভার্সন   | ক্লায়েন্টদের কাছে অপরিচিত, CDN ও প্রক্সি প্রায়ই ঠিকমতো সামলায় না |

বাস্তবে সবচেয়ে কম বেদনার সংমিশ্রণটা হলো — **প্রধান, বিরল, বড় ধাপের জন্য URL path (`/v1`, `/v2`), আর ছোট ছোট আচরণগত পরিবর্তনের জন্য একটা তারিখ-ভিত্তিক হেডার।** Stripe এই মডেলটাই বিখ্যাত করেছে: প্রতিটা অ্যাকাউন্ট একটা তারিখে "পিন" করা থাকে, আর সেই তারিখ থেকে আজ পর্যন্ত সব পরিবর্তন সার্ভারে একটার পর একটা transformation হিসেবে প্রয়োগ হয়। এতে ক্লায়েন্ট নিজের গতিতে আপগ্রেড করতে পারে, আর সার্ভারে ভার্সন-নির্দিষ্ট কোড দুটো আলাদা কোডবেসে না ছড়িয়ে ছোট ছোট adapter-এ থাকে।

<Callout type="warning">

**সবচেয়ে বড় ভুল হলো `/v2` বানিয়ে পুরো কোডবেস কপি করে ফেলা।** প্রথম মাসে দারুণ লাগে, তারপর প্রতিটা বাগফিক্স দুই জায়গায় করতে হয় — আর অবধারিতভাবে একদিন একটা সিকিউরিটি ফিক্স শুধু একটা ভার্সনে যায়। সঠিক গঠন হলো একটাই ভেতরের ডোমেইন মডেল, আর তার উপরে ভার্সন-প্রতি পাতলা serialization স্তর — উপরের কোডে `toV1` আর `toV2` ঠিক সেটাই দেখাচ্ছে।

</Callout>

## Backward-compatible ইভোলিউশন: আসল দক্ষতা

সবচেয়ে ভালো ভার্সনিং কৌশল হলো **যতটা সম্ভব ভার্সন না বাড়ানো**। বেশিরভাগ পরিবর্তন কোনো ভার্সন ছাড়াই করা যায়, যদি আপনি জানেন কোনটা নিরাপদ:

| পরিবর্তন                            | নিরাপদ?   | কেন                                                   |
| ----------------------------------- | --------- | ----------------------------------------------------- |
| রেসপন্সে নতুন ফিল্ড যোগ             | হ্যাঁ     | পুরনো ক্লায়েন্ট সেটা উপেক্ষা করবে                    |
| নতুন ঐচ্ছিক request প্যারামিটার     | হ্যাঁ     | না পাঠালে আগের আচরণ                                   |
| নতুন endpoint                       | হ্যাঁ     | কেউ কিছু হারাচ্ছে না                                  |
| নতুন ঐচ্ছিক হেডার                   | হ্যাঁ     | উপেক্ষা করা যায়                                      |
| রেসপন্স থেকে ফিল্ড সরানো            | **না**    | ক্লায়েন্ট সেটা পড়ছিল                                |
| ফিল্ডের নাম বদল                     | **না**    | সরানো + যোগ করার সমান                                 |
| ফিল্ডের টাইপ বদল (`"12"` থেকে `12`) | **না**    | parse ভাঙে, নীরবে                                     |
| নতুন **আবশ্যিক** request ফিল্ড      | **না**    | পুরনো রিকোয়েস্ট এখন `422` পাবে                       |
| enum-এ নতুন মান যোগ                 | **হয়তো** | ক্লায়েন্ট যদি অজানা মানে ক্র্যাশ করে, তাহলে না       |
| ভ্যালিডেশন কড়া করা                 | **না**    | আগে যা গ্রহণ হতো তা এখন প্রত্যাখ্যাত                  |
| ডিফল্ট ভ্যালু বদল                   | **না**    | অদৃশ্য কিন্তু বাস্তব আচরণ পরিবর্তন                    |
| pagination যোগ করা                  | **না**    | যে ক্লায়েন্ট পুরো লিস্ট আশা করছিল সে এখন অর্ধেক পাবে |

শেষ কয়েকটা সারি বিশেষভাবে খেয়াল করুন — এগুলো "নীরব" breaking change, যেগুলো ডিপ্লয়ের দিন কোনো এরর দেখায় না, কিন্তু ক্লায়েন্টের ডেটা ভুল করে দেয়। এই কারণেই enum-এ নতুন মান যোগ করাটা একটা ধূসর এলাকা: আপনার ডকুমেন্টেশনে **শুরু থেকেই** লিখে রাখা উচিত যে "অজানা enum মান আসতে পারে, ক্লায়েন্টকে সেটা সহনীয়ভাবে হ্যান্ডল করতে হবে"। যা আগে থেকে ঘোষণা করেননি, সেটা পরে ধরে নিতে পারবেন না।

### Tolerant reader আর তার সীমা

Postel-এর নিয়ম — "যা পাঠাও তাতে কঠোর হও, যা গ্রহণ করো তাতে উদার হও" — API ক্লায়েন্টের জন্য এভাবে অনুবাদ হয়: **অচেনা ফিল্ড উপেক্ষা করো, অচেনা enum মানে ক্র্যাশ কোরো না, আর শুধু যেটুকু দরকার সেটুকুই parse করো।** যে ক্লায়েন্ট strict schema validation চালিয়ে অচেনা ফিল্ড দেখলেই এরর দেয়, সে নিজের হাতে প্রতিটা additive পরিবর্তনকে breaking বানিয়ে ফেলে।

কিন্তু এই নিয়মের একটা বাস্তব সীমা আছে, আর সেটা না জানলে ক্ষতি হয়। অতিরিক্ত উদারতা মানে ভুল ইনপুট নীরবে গিলে ফেলা — কেউ `pageCount` বানান ভুল করে `pagecount` লিখল, আপনি সেটা উপেক্ষা করলেন, ফিল্ডটা ডিফল্ট মানে বসল, আর ব্যবহারকারী ছয় মাস পর আবিষ্কার করল তার ডেটা ভুল। **তাই আধুনিক অবস্থানটা অসমমিত: রেসপন্স পড়ার সময় উদার হোন, কিন্তু রিকোয়েস্ট গ্রহণ করার সময় অচেনা ফিল্ড দেখলে স্পষ্ট এরর দিন।** ভুলটা সাথে সাথে ধরা পড়াই ক্লায়েন্ট ডেভেলপারের জন্য সবচেয়ে বড় উপকার।

### Expand and contract

কোনো ফিল্ডের নাম বা আকার বদলানোর সঠিক উপায়টা এক ধাপে নয়, তিন ধাপে — ঠিক যেভাবে চ্যাপ্টার ১০-এ ডেটাবেস কলাম মাইগ্রেট করেছিলাম।

**১. Expand।** নতুন রূপটা যোগ করুন, পুরনোটা রেখেই। এখন রেসপন্সে `author` আর `scholar` দুটোই আছে, আর write path দুটোই গ্রহণ করে (একটা এলে অন্যটা derive হয়)। কেউ ভাঙল না।

**২. Migrate।** ডকুমেন্টেশনে পুরনো ফিল্ডকে deprecated ঘোষণা করুন, রেসপন্সে `Deprecation` ও `Sunset` হেডার পাঠান, আর সবচেয়ে গুরুত্বপূর্ণ — **মাপুন**। প্রতিটা deprecated ফিল্ড ও endpoint-এর ব্যবহার API key ধরে ধরে গুনুন। এই মেট্রিকটা ছাড়া retirement একটা অন্ধ জুয়া।

**৩. Contract।** ব্যবহার প্রায় শূন্যে নামলে, আর বাকি ক্লায়েন্টদের সরাসরি যোগাযোগ করে জানানোর পরে, পুরনো ফিল্ডটা সরান — নতুন ভার্সনে।

### Deprecation আর সত্যিকারের retirement

HTTP-তে এর জন্য স্ট্যান্ডার্ড হেডার আছে, আর সেগুলো ব্যবহার করা উচিত:

```
Deprecation: true
Sunset: Sat, 31 Oct 2026 23:59:59 GMT
Link: <https://api.bukhara.dev/docs/migrate-v2>; rel="deprecation"
```

কিন্তু বাস্তবতা হলো — **কেউ হেডার পড়ে না।** একটা ভার্সন সত্যিই তুলে নিতে হলে যা যা লাগে:

- **ব্যবহার মাপুন**, শুধু endpoint নয় — API key, ফিল্ড আর ক্লায়েন্ট ভার্সন ধরে। কে ভাঙবে সেটা নাম ধরে জানতে হবে।
- **সরাসরি যোগাযোগ করুন।** যে দশটা ইন্টিগ্রেশন এখনো `/v1` ব্যবহার করছে, তাদের ইমেইল করুন। মাইগ্রেশন গাইড দিন, প্রয়োজনে কোড লিখে দিন।
- **Brownout করুন।** সানসেটের আগে কয়েকবার, ঘোষণা দিয়ে, ৩০ মিনিটের জন্য পুরনো ভার্সন বন্ধ রাখুন। যারা হেডার আর ইমেইল উপেক্ষা করেছে, তারা এবার টের পাবে — কিন্তু নিয়ন্ত্রিত সময়ে, আর ফিরিয়ে আনার সুযোগ রেখে।
- **প্রথমে `410 Gone` দিন, `404` নয়।** `410` মানে "এটা ছিল, ইচ্ছাকৃতভাবে সরানো হয়েছে" — মাইগ্রেশন লিঙ্ক সহ পাঠালে ডেভেলপার তাৎক্ষণিকভাবে বুঝে যায় কী করতে হবে।
- **তারিখটা মানুন।** একবার সানসেট পিছিয়ে দিলে পরের সব সানসেটের তারিখ অর্থহীন হয়ে যায়। প্রতিষ্ঠান হিসেবে এটাই আপনার একমাত্র শৃঙ্খলার হাতিয়ার।

<Callout type="tip">

সবচেয়ে ভালো ভার্সনিং কৌশল হলো **কম প্রতিশ্রুতি দেওয়া**। প্রতিটা ফিল্ড, প্রতিটা query প্যারামিটার, প্রতিটা এরর কোড — একবার প্রকাশ করলে সেটা চিরকালের দায়। "হয়তো কাজে লাগবে" ভেবে ফিল্ড যোগ করবেন না; ভেতরের কলামগুলো হুবহু বাইরে ফাঁস করবেন না। ছোট, ইচ্ছাকৃত পৃষ্ঠতল মানে কম breaking change — এবং সেটাই সবচেয়ে সস্তা।

</Callout>

পরের চ্যাপ্টারে আমরা কন্ট্রাক্টের আরেকটা দিকে যাব যেটা এখানে বারবার উঁকি দিয়েছে — একটা distributed সিস্টেম আসলে **কী** প্রতিশ্রুতি দিতে পারে। আপনার API যখন `201` বলে, তখন ডেটাটা কি সব রেপ্লিকায় পৌঁছেছে? consistency, availability আর partition-এর সেই আপসটাই চ্যাপ্টার ১৩।

<div class="takeaways">

### মূল শেখা

- API একটা কন্ট্রাক্ট, আর কন্ট্রাক্টের দাম হলো ফেরত নেওয়া যায় না — তাই ছোট, ইচ্ছাকৃত পৃষ্ঠতলই সবচেয়ে সস্তা ডিজাইন
- রিসোর্স বিশেষ্য হবে, কাজ হবে HTTP verb; কিন্তু যে অপারেশনের নিজস্ব পারমিশন, রেট লিমিট বা অডিট-পরিচয় দরকার, সেটা আলাদা action endpoint হওয়াই সৎ
- স্ট্যাটাস কোড কাজে লাগান: `201` মানে `Location` হেডারও, `202` মানে async কাজ আর একটা job URL, `422` মানে payload ভুল আর `409` মানে সার্ভারের অবস্থার সাথে সংঘাত
- Offset pagination গভীরতায় ধীর হয় আর concurrent insert-এ আইটেম দুইবার দেখায় বা বাদ দেয়; keyset cursor স্থির খরচে সঠিক ফল দেয় — শর্ত একটাই, sort key-টা মোট-ক্রম হতে হবে
- cursor অস্বচ্ছ রাখুন (base64 করা ভার্সনড state), আর `total` ডিফল্টে দেবেন না — সেটা প্রায়ই পুরো query-র সবচেয়ে দামি অংশ
- একটাই error envelope: machine-readable `code`, মানুষের জন্য message, ফিল্ড-লেভেল ডিটেইল আর একটা `requestId`; RFC 9457 problem+json-এর উপর দাঁড়ান, নিজের ফরম্যাট আবিষ্কার করবেন না
- Rate limit করুন token bucket দিয়ে, আর সফল রেসপন্সেও `RateLimit-*` পাঠান — `429`-এর সাথে `Retry-After` ছাড়া আপনি নিজেই retry storm বানাচ্ছেন
- `POST`-এ `Idempotency-Key` নিন, ফলাফল জমা রাখুন আর হুবহু replay করুন; একই কী চলমান থাকলে `409`, ভিন্ন payload-এ `422`
- বেশিরভাগ পরিবর্তন ভার্সন ছাড়াই করা যায় — নতুন ফিল্ড ও ঐচ্ছিক প্যারামিটার নিরাপদ, নাম বদল ও কড়া ভ্যালিডেশন নয়। বদলাতেই হলে expand → migrate → contract, আর সানসেটের তারিখটা মানুন

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Stripe** তারিখ-ভিত্তিক ভার্সনিং চালায় — প্রতিটা অ্যাকাউন্ট একটা ভার্সনে পিন করা থাকে আর সার্ভারে transformation স্তরে স্তরে প্রয়োগ হয়; তাদের `Idempotency-Key` হেডারটাই আজ পেমেন্ট API-র কার্যত স্ট্যান্ডার্ড
- **GitHub** API-তে cursor pagination আর `Link` হেডার দিয়ে পরের পাতা দেওয়া হয়, আর deprecation চলে ঘোষিত তারিখ ও brownout সহ — বড় পাবলিক API কীভাবে ভার্সন তুলে নেয় তার সবচেয়ে ভালো উদাহরণ
- **Slack** rate limit-কে endpoint-শ্রেণিতে ভাগ করে (Tier 1 থেকে Tier 4) আর `429`-এর সাথে সবসময় `Retry-After` পাঠায় — দামি endpoint-এ আলাদা কড়া সীমা রাখার আদর্শ নমুনা
- **Twitter/X**-এর v1.1 থেকে v2 রূপান্তর উল্টো শিক্ষাটা দেয়: ভার্সন বদলের সাথে একই সময়ে মূল্য ও অ্যাক্সেস নীতি বদলালে সেটা কারিগরি মাইগ্রেশন থাকে না, ইকোসিস্টেম-ভাঙা ঘটনা হয়ে দাঁড়ায়

</div>
