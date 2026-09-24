---
title: 'ক্যাশিং স্ট্র্যাটেজি'
subtitle: 'ক্যাশ কোথায় বসে, কোন প্যাটার্নে লেখা-পড়া হয়, TTL আর invalidation কীভাবে ঠিক করবেন, আর hit ratio-র অর্থনীতি।'
chapter: 8
level: 'intermediate'
readingTime: '১৮ মিনিট'
topics: ['caching', 'cache-aside', 'TTL', 'invalidation', 'stampede', 'hit ratio']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

আগের চ্যাপ্টারগুলোতে আপনি একটা রিকোয়েস্টের পুরো পথটা দেখেছেন — ব্রাউজার থেকে DNS, লোড ব্যালান্সার, অ্যাপ সার্ভার, ডেটাবেস। আর latency-র সংখ্যাগুলোও দেখেছেন: মেমরি থেকে পড়া ন্যানোসেকেন্ডের ব্যাপার, একই ডেটাসেন্টারে একটা DB query মিলিসেকেন্ডের, আর মহাদেশ পেরিয়ে একটা রাউন্ড ট্রিপ শত মিলিসেকেন্ডের। ক্যাশিং হলো সেই সংখ্যাগুলোর উপর সরাসরি বাজি ধরা — একই উত্তর বারবার হিসাব করার বদলে একবার হিসাব করে কাছেই রেখে দেওয়া।

এই চ্যাপ্টারে আমরা ক্যাশকে একটা "Redis বসিয়ে দিলাম" ট্রিক হিসেবে নয়, একটা আর্কিটেকচারাল লেয়ার হিসেবে দেখব — কোথায় বসে, কে লেখে, কখন মরে, আর ভুল হলে কী ভাঙে।

## গল্পে বুঝি

কর্ডোবার বড় লাইব্রেরির কথা ভাবুন। বিল্ডিংয়ের নিচে তিন তলা গভীর একটা স্টোররুম — সেখানে লক্ষ লক্ষ পাণ্ডুলিপি সাজানো, তালিকা ধরে খুঁজে বের করতে একজন কর্মচারীর অন্তত বিশ মিনিট লাগে। এই স্টোররুমটাই সত্যের একমাত্র উৎস; যা কিছু লাইব্রেরির আছে, সব ওখানেই আছে।

কিন্তু পাঠক তো বিশ মিনিট বসে থাকতে চায় না। তাই লাইব্রেরিয়ান সিনা কয়েকটা স্তর বানিয়েছেন।

প্রথম স্তর — মূল পড়ার ঘরের ঠিক পাশে একটা "রেফারেন্স তাক"। গত কয়েক সপ্তাহে যেসব বই সবচেয়ে বেশি চাওয়া হয়েছে, সিনা সেগুলোর কপি এই তাকে তুলে রেখেছেন। খোয়ারিজমির বীজগণিতের বইটা দিনে চল্লিশবার চাওয়া হয় — সেটা তাকেই থাকে, পাঠক চাইলে দশ সেকেন্ডে হাতে পায়। এই তাকটাই **application cache**।

দ্বিতীয় স্তর — শহরের বিভিন্ন মহল্লায় ছোট ছোট শাখা লাইব্রেরি। বুখারা মহল্লার পাঠককে মূল লাইব্রেরি পর্যন্ত হেঁটে আসতে হয় না, শাখাতেই জনপ্রিয় বইয়ের কপি পাওয়া যায়। শাখায় না থাকলে শাখার কর্মচারী একবার মূল লাইব্রেরি থেকে আনিয়ে নেয়, তারপর সেটা শাখাতেই থেকে যায় — পরের মহল্লাবাসী আর অপেক্ষা করে না। এই শাখাগুলোই **CDN**।

তৃতীয় স্তর — পাঠক নিজে। বিরুনি একটা বই বাড়িতে ধার নিয়ে গেছেন। পরের সপ্তাহে ওই একই তথ্য দরকার হলে তিনি লাইব্রেরিতে আসেনই না, নিজের ঘরের তাক থেকে বইটা নামান। এটাই **client-side cache** — ব্রাউজারের ডিস্ক ক্যাশ, মোবাইল অ্যাপের লোকাল স্টোর।

এখন সমস্যার শুরু। সিনা রেফারেন্স তাকে যে বইটা রেখেছেন, সেটার একটা সংশোধিত সংস্করণ স্টোররুমে এসেছে। তাকের কপিটা এখন **stale** — পুরনো। সিনার দুটো পথ: হয় প্রতি সপ্তাহে তাকের সব বই নামিয়ে নতুন করে তুলবেন (**TTL** — নির্দিষ্ট সময় পর এমনিতেই বাতিল), নয়তো স্টোররুম থেকে খবর এলেই ঠিক সেই বইটা তাক থেকে সরিয়ে দেবেন (**invalidation** — ঘটনা ঘটলেই মুছে ফেলা)। প্রথমটা সহজ কিন্তু কিছুক্ষণ ভুল তথ্য যায়; দ্বিতীয়টা নিখুঁত কিন্তু খবর আনা-নেওয়ার ব্যবস্থা রাখতে হয়।

আরেকটা সমস্যা আরও নাটকীয়। পরীক্ষার আগের দিন সকালে সিনা তাক থেকে গণিতের বইটা নামিয়ে ফেললেন কারণ সময় শেষ। ঠিক সেই মুহূর্তে দরজায় দুইশো ছাত্র দাঁড়িয়ে, সবাই ওই একটাই বই চায়। এখন দুইশোটা আলাদা অনুরোধ একসাথে স্টোররুমে নেমে গেল, দুইশোজন কর্মচারী একই তাকের দিকে ছুটল, স্টোররুম অচল হয়ে গেল। অথচ দরকার ছিল একজন গিয়ে একবার এনে সবাইকে দেখানো। এটাই **cache stampede**, আর সমাধান হলো একটা টোকেন — "এই বইটা আনতে একজন ইতিমধ্যেই গেছে, তুমি লাইনে দাঁড়াও" (**single-flight lock**)।

মিলিয়ে নিই: গভীর স্টোররুম হলো **database**, রেফারেন্স তাক হলো **application cache** (Redis/Memcached), মহল্লার শাখা হলো **CDN edge**, পাঠকের ঘরের তাক হলো **client cache**, সাপ্তাহিক ঝাড়পোঁছ হলো **TTL**, খবর পেয়ে বই সরানো হলো **event-driven invalidation**, দুইশো ছাত্রের একসাথে হামলা হলো **stampede**, আর "একজন যাবে বাকিরা অপেক্ষা করবে" হলো **request coalescing**। আর সিনার সবচেয়ে গুরুত্বপূর্ণ হিসাবটা হলো — তাকে কতগুলো বই রাখলে কত শতাংশ পাঠক স্টোররুম পর্যন্ত না গিয়েই ফিরে যায়। সেটাই **hit ratio**, আর ওটাই ঠিক করে লাইব্রেরিটা টিকবে না ডুববে।

## ক্যাশ আসলে কোথায় কোথায় থাকে

জুনিয়র ইঞ্জিনিয়াররা ক্যাশ বলতে শুধু Redis বোঝে। বাস্তবে একটা রিকোয়েস্ট origin ডেটাবেসে পৌঁছানোর আগে অন্তত পাঁচটা ক্যাশ পেরিয়ে আসতে পারে, আর প্রতিটার নিয়ম আলাদা।

<Mermaid
title="Cache layers on the request path"
code={`graph LR
  B["Browser cache<br/>ms, per-user"] --> C["CDN edge<br/>ms, per-region"]
  C --> G["API gateway cache<br/>shared, short TTL"]
  G --> A["App in-process cache<br/>ns, per-instance"]
  A --> R["Redis / Memcached<br/>sub-ms, shared"]
  R --> D["Database buffer pool<br/>disk avoided"]`}
/>

| স্তর                    | কোথায় থাকে        | কার জন্য      | সাধারণ TTL      | invalidate করা |
| ----------------------- | ------------------ | ------------- | --------------- | -------------- |
| Browser cache           | ইউজারের ডিভাইস     | একজন ইউজার    | মিনিট – বছর     | প্রায় অসম্ভব  |
| CDN edge                | POP সার্ভার        | একটা অঞ্চল    | সেকেন্ড – দিন   | purge API      |
| Gateway / reverse proxy | আপনার edge         | সব ইউজার      | সেকেন্ড         | সহজ            |
| In-process (LRU)        | অ্যাপ প্রসেসের হিপ | একটা instance | সেকেন্ড         | কঠিন (N কপি)   |
| Redis / Memcached       | আলাদা সার্ভার      | সব instance   | মিনিট – ঘণ্টা   | সহজ            |
| DB buffer pool          | ডেটাবেস প্রসেস     | সব query      | ডেটাবেস ঠিক করে | আপনার হাতে নেই |

<Callout type="warning">

**যত ক্যাশ ইউজারের কাছে, তত invalidate করা কঠিন।** ব্রাউজারে একবার `max-age=31536000` পাঠিয়ে দিলে আপনি সেটা আর ফেরত আনতে পারবেন না — ইউজারের ডিস্কে সেটা এক বছর বসে থাকবে। এজন্যই ইমিউটেবল অ্যাসেটে content hash দিয়ে ফাইলনেম বানানো হয় (`app.9f2c1a.js`) — invalidate করার বদলে URL বদলে দেওয়া হয়।

</Callout>

### In-process না Redis?

একটা সাধারণ ভুল হলো সব কিছুর জন্য সরাসরি Redis-এ ছোটা। সিদ্ধান্তটা সহজ:

- ডেটা যদি **ছোট, প্রায় স্থির আর সব instance-এ একই** হয় (feature flag, currency rate, category list) — in-process LRU রাখুন। শূন্য নেটওয়ার্ক hop, ন্যানোসেকেন্ড latency।
- ডেটা যদি **বড় বা ইউজার-নির্দিষ্ট বা ঘন ঘন বদলায়** — Redis। কারণ ২০টা instance-এ ২০ কপি রাখলে মেমরিও নষ্ট হয়, আর একটা আপডেটে ২০ জায়গায় invalidate করতে হয়।
- দুটোই ব্যবহার করলে সেটা **multi-tier cache** — in-process-এ ৫ সেকেন্ডের ছোট TTL, তার পেছনে Redis-এ ১০ মিনিট। এতে Redis-এর উপর চাপ নাটকীয়ভাবে কমে, বিনিময়ে ৫ সেকেন্ড পর্যন্ত staleness মেনে নিতে হয়।

## চারটি প্যাটার্ন, এক নজরে

| প্যাটার্ন     | DB থেকে কে পড়ে | DB-তে কে লেখে        | write latency | ডেটা হারানোর ঝুঁকি |
| ------------- | --------------- | -------------------- | ------------- | ------------------ |
| Cache-aside   | অ্যাপ্লিকেশন    | অ্যাপ্লিকেশন         | স্বাভাবিক     | নেই                |
| Read-through  | ক্যাশ লেয়ার    | অ্যাপ্লিকেশন         | স্বাভাবিক     | নেই                |
| Write-through | অ্যাপ্লিকেশন    | ক্যাশ লেয়ার → DB    | বেশি          | নেই                |
| Write-behind  | অ্যাপ্লিকেশন    | ক্যাশ লেয়ার (async) | সবচেয়ে কম    | আছে                |

### Cache-aside — ডিফল্ট

অ্যাপ্লিকেশনই সব লজিকের মালিক: ক্যাশ দেখো, না পেলে DB থেকে আনো, ক্যাশে বসাও।

```typescript
async function getScholar(id: string): Promise<Scholar> {
	const key = `scholar:v1:${id}`;

	const cached = await redis.get(key);
	if (cached) return JSON.parse(cached);

	const row = await db.scholars.findById(id);
	if (!row) throw new NotFoundError(`scholar ${id} not found`);

	// TTL with jitter so keys do not all expire at the same second
	await redis.set(key, JSON.stringify(row), 'EX', 600 + Math.floor(Math.random() * 60));
	return row;
}
```

মনে রাখার মতো তিনটে জিনিস:

- **write-এ ক্যাশ আপডেট করবেন না, মুছে দিন।** আপডেট করতে গেলে দুটো concurrent write-এর মধ্যে race লেগে ক্যাশে পুরনো ভ্যালু আটকে যেতে পারে। মুছে দিলে সবচেয়ে খারাপ ক্ষেত্রেও পরের read DB থেকে সত্যিটা তুলে আনবে।
- **key-এ ভার্সন রাখুন** (`scholar:v1:...`)। স্কিমা বদলালে `v2` করে দিলেই পুরনো সব এন্ট্রি একসাথে অকেজো — কিছু মুছতে হয় না।
- **TTL-এ jitter দিন।** ১০,০০০ key একই সেকেন্ডে সেট হলে ঠিক ৬০০ সেকেন্ড পর একই সেকেন্ডে সবগুলো মরবে, আর তখন DB-তে একটা দেয়াল ধাক্কা খাবে।

### Read-through — ক্যাশ নিজেই লোড করে

অ্যাপ শুধু ক্যাশের সাথে কথা বলে; miss হলে ক্যাশ লেয়ার নিজেই loader ডাকে। কোড পরিষ্কার হয়, কিন্তু "না পাওয়া গেল" (negative result) কীভাবে হ্যান্ডল হবে সেটা ক্যাশ লেয়ারের নিয়মে বাঁধা পড়ে যায়।

### Write-through — সবসময় সিঙ্কে

প্রতিটা write ক্যাশ আর DB — দুটোতেই যায়। কোনো stale read নেই, কোনো invalidation লজিক নেই। দাম: প্রতিটা write ধীর, আর এমন ডেটাও ক্যাশে ঢোকে যা হয়তো কেউ কোনোদিন পড়বেই না।

### Write-behind — দ্রুত কিন্তু ঝুঁকিপূর্ণ

write শুধু ক্যাশে যায়, ক্যাশ পরে ব্যাচ করে DB-তে ফ্লাশ করে। ভিউ কাউন্ট, লাইক কাউন্ট, রেট লিমিট কাউন্টার — এসব জায়গায় দারুণ, কারণ ৫ সেকেন্ডের কাউন্ট হারালে পৃথিবী থেমে যায় না।

<Callout type="warning">

পেমেন্ট, ইনভেন্টরি ডিডাকশন, ইউজারের লেখা কনটেন্ট — এসবে **কখনোই write-behind নয়**। "ক্র্যাশ করলে শেষ ৫ সেকেন্ডের ডেটা নেই" — এই বাক্যটা ওই ডোমেইনগুলোতে গ্রহণযোগ্য নয়।

</Callout>

## TTL: সংখ্যাটা কীভাবে বাছবেন

TTL হলো "আমি কত সময় পর্যন্ত ভুল উত্তর দিতে রাজি" — এর বেশি কিছু নয়। তাই প্রশ্নটা টেকনিক্যাল নয়, প্রোডাক্টের।

| ডেটা                       | গ্রহণযোগ্য staleness | TTL                      |
| -------------------------- | -------------------- | ------------------------ |
| দেশের তালিকা, currency কোড | দিন                  | ২৪ ঘণ্টা                 |
| প্রোডাক্ট ক্যাটালগ         | মিনিট                | ৫–১৫ মিনিট               |
| ইউজার প্রোফাইল             | সেকেন্ড              | ৬০ সেকেন্ড + invalidate  |
| ফলোয়ার কাউন্ট             | সেকেন্ড              | ১০–৩০ সেকেন্ড            |
| অ্যাকাউন্ট ব্যালেন্স       | শূন্য                | ক্যাশ করবেন না           |
| পারমিশন / রোল              | প্রায় শূন্য         | ছোট TTL + জোর invalidate |

দুটো নিয়ম:

**TTL ছাড়া ক্যাশ = অতিরিক্ত ধাপসহ একটা মেমরি লিক।** ২৪ ঘণ্টার TTL-ও কখনো না মরার চেয়ে ভালো, কারণ সেটা অন্তত একটা উপরের সীমা দেয় — "যত ভুলই হোক, ২৪ ঘণ্টার মধ্যে নিজে থেকে ঠিক হয়ে যাবে"।

**invalidation থাকলেও TTL রাখুন।** invalidation মিস হবেই — একটা ইভেন্ট হারাবে, একটা ডিপ্লয়ে একটা কোডপাথ বাদ পড়বে। TTL হলো সেই ভুলগুলোর জন্য সেফটি নেট।

### Negative caching

`getScholar('does-not-exist')` — এই query DB-তে গিয়ে খালি হাতে ফিরল, তাই কিছু ক্যাশ হলো না। কেউ যদি লুপে ১০ হাজার অস্তিত্বহীন id চায়, প্রতিটাই সোজা DB-তে যাবে। এটা একটা বাস্তব আক্রমণ পথ। সমাধান — "নেই" ফলাফলটাকেও ক্যাশ করুন, তবে অনেক ছোট TTL-এ (৩০–৬০ সেকেন্ড), যাতে জিনিসটা তৈরি হলে দ্রুত দেখা যায়।

## Invalidation: ক্যাশের সবচেয়ে কঠিন অংশ

তিনটে বাস্তব কৌশল, ক্রমবর্ধমান জটিলতা অনুযায়ী।

**১. TTL-only.** কিছু invalidate করবেন না, শুধু ছোট TTL দিন। ৯০% ক্ষেত্রে এটাই যথেষ্ট, আর কোডে কোনো বাড়তি জটিলতা নেই।

**২. Write-path delete.** যে কোডপাথ ডেটা বদলায়, সেই একই ট্রানজেকশনের পর ক্যাশ key মুছে দেয়। ঝুঁকি: ওই এন্টিটি বদলানোর সব পথ আপনাকে মনে রাখতে হবে — অ্যাডমিন প্যানেল, ব্যাকফিল স্ক্রিপ্ট, অন্য সার্ভিস।

**৩. Event-driven invalidation.** ডেটাবেসের change stream (CDC) বা ডোমেইন ইভেন্ট থেকে একটা consumer key মোছে। এটাই সবচেয়ে নির্ভরযোগ্য, কারণ ডেটা কোন কোড দিয়ে বদলাল তাতে কিছু যায় আসে না — কিন্তু একটা পুরো পাইপলাইন মেইনটেইন করতে হয়।

<Mermaid
title="Event-driven cache invalidation"
code={`graph LR
  W["Write API"] --> DB["Primary DB"]
  ADM["Admin tool"] --> DB
  JOB["Backfill job"] --> DB
  DB --> CDC["Change stream"]
  CDC --> INV["Invalidator worker"]
  INV --> R["Redis DEL keys"]`}
/>

### Versioned keys — মোছার বদলে সরে যাওয়া

একটা এন্টিটির অনেকগুলো derived key থাকলে (`user:5:profile`, `user:5:feed`, `user:5:counts`) সব খুঁজে মোছা ঝামেলার। বিকল্প — একটা ভার্সন কাউন্টার রাখুন:

```typescript
// bump on any write to the user
const version = await redis.incr(`user:5:ver`);
const key = `user:5:profile:v${version}`;
```

পুরনো key গুলো আর কেউ চাইবে না, TTL শেষে নিজে থেকেই মরবে। খরচ: প্রতি read-এ একটা বাড়তি Redis call (যেটা pipeline-এ ঢুকিয়ে দেওয়া যায়)।

<Callout type="tip">

`KEYS user:5:*` কখনো প্রোডাকশনে চালাবেন না — এটা Redis-এর পুরো keyspace স্ক্যান করে আর সিঙ্গল-থ্রেডেড সার্ভারটাকে আটকে রাখে। দরকার হলে `SCAN` ব্যবহার করুন, তবে সঠিক উত্তর হলো এমন key ডিজাইন করা যাতে কখনো স্ক্যান করতেই না হয়।

</Callout>

## Cache stampede

একটা জনপ্রিয় key expire হলো। সেই মুহূর্তে ১,০০০টা concurrent রিকোয়েস্ট miss পেল, ১,০০০টাই DB-তে গেল, ১,০০০টাই একই query চালাল, আর ১,০০০টাই একই ভ্যালু ক্যাশে লিখল। DB-র জন্য এটা হঠাৎ ১,০০০x চাপ — যেটা প্রায়ই একটা full outage-এর শুরু।

তিনটে প্রতিকার, একসাথে ব্যবহার করলে সবচেয়ে ভালো:

**Request coalescing (single-flight).** একই key-এর জন্য একই প্রসেসে একটাই in-flight লোড চলবে; বাকিরা সেই একই Promise-এ যোগ দেবে। এটা এক প্রসেসের ভেতরের ভিড় সামলায় — খরচ প্রায় শূন্য, তাই সবসময় রাখুন।

**Distributed lock.** একাধিক instance জুড়ে একজনই DB-তে যাবে। Redis-এ `SET lock:key token NX EX 10` দিয়ে যে জেতে সে লোড করে, বাকিরা অল্প অপেক্ষা করে আবার ক্যাশ পড়ে। lock-এ অবশ্যই TTL রাখুন, নইলে যে জিতেছে সে ক্র্যাশ করলে key চিরতরে আটকে যাবে।

**Probabilistic early expiration.** TTL-এর শেষ দিকে প্রতিটা read সামান্য সম্ভাবনায় ব্যাকগ্রাউন্ডে রিফ্রেশ ট্রিগার করে — সম্ভাবনা expiry-র কাছে গেলে বাড়ে। ফলে key কখনো "সবার জন্য একসাথে" মরে না; একজন ভাগ্যবান পাঠক আগেই সেটা নতুন করে দেয়।

**Stale-while-revalidate.** সবচেয়ে ব্যবহারিক কৌশল: TTL শেষ হলেও ভ্যালুটা আরও কিছুক্ষণ রেখে দিন। expire-এর পরে প্রথম রিকোয়েস্ট পুরনো ভ্যালুটাই সাথে সাথে ফেরত পায়, আর ব্যাকগ্রাউন্ডে রিফ্রেশ শুরু হয়। ইউজার কখনো miss-এর latency দেখেই না।

## Hit ratio-র অর্থনীতি

ক্যাশ নিয়ে সবচেয়ে ভুল বোঝা হিসাবটা হলো — hit ratio ৯০% থেকে ৯৫% করলে DB-র লোড ৫% কমে না, **অর্ধেক** হয়।

কারণটা সোজা: DB-তে যাওয়া রিকোয়েস্ট = মোট রিকোয়েস্ট × miss rate।

```
1,000,000 req/hour

hit ratio 90%  → miss 10%  → 100,000 DB queries
hit ratio 95%  → miss  5%  →  50,000 DB queries   (50% কম)
hit ratio 99%  → miss  1%  →  10,000 DB queries   (90% কম)
hit ratio 99.9% → miss 0.1% →  1,000 DB queries   (99% কম)
```

এখান থেকে দুটো গুরুত্বপূর্ণ উপসংহার:

**ক্যাশ ছাড়া গেলে ব্যাপারটা রৈখিকভাবে খারাপ হয় না।** ৯৯% hit ratio-তে চলা একটা সিস্টেমে Redis পুরোপুরি পড়ে গেলে DB-র লোড ১% থেকে ১০০% — অর্থাৎ **১০০ গুণ** — হয়ে যায়। DB সেটা কখনোই সামলাবে না। এজন্যই Redis-কে "optional speedup" ভাবা বিপজ্জনক; ৯৯% hit ratio-র সিস্টেমে Redis আসলে একটা critical dependency। তাই ক্যাশ লেয়ারের পাশে সবসময় দুটো জিনিস দরকার: DB-র সামনে একটা concurrency limiter, আর নন-ক্রিটিক্যাল ফিচারের জন্য graceful degradation।

**গড় latency-র হিসাবেও একই কথা।** hit-এ ১ ms, miss-এ ৮০ ms ধরলে:

```
p_hit 0.90 → 0.90(1) + 0.10(80) = 8.9 ms
p_hit 0.95 → 0.95(1) + 0.05(80) = 4.95 ms
p_hit 0.99 → 0.99(1) + 0.01(80) = 1.79 ms
```

কিন্তু সাবধান — এটা **গড়**। আপনার p99 latency প্রায় সবসময়ই miss-এর latency, কারণ p99-এ থাকা রিকোয়েস্টগুলোই মূলত miss। তাই "ক্যাশ বসিয়ে দিয়েছি, latency ঠিক হয়ে গেছে" বলার আগে p99 দেখুন, গড় নয়।

<Callout type="info">

**কোন মেট্রিকগুলো ছাড়া ক্যাশ প্রোডাকশনে যাবে না:** hit ratio (key prefix অনুযায়ী আলাদা করে), miss latency, eviction rate, মেমরি ব্যবহার, আর hot key distribution। eviction rate হঠাৎ বাড়া মানে আপনার working set মেমরিতে আর ধরছে না — hit ratio পড়তে শুরু করার আগেই এটা ধরা পড়ে।

</Callout>

## একটা প্রোডাকশন-গ্রেড ক্যাশ লেয়ার

নিচের ইমপ্লিমেন্টেশনে এই চ্যাপ্টারের সবকিছু একসাথে আছে: cache-aside, jitter সহ TTL, negative caching, single-flight coalescing, stale-while-revalidate, আর মেট্রিকস।

```typescript
import Redis from 'ioredis';

// --- Types ---
interface CacheOptions {
	ttlSeconds: number;
	jitterSeconds?: number;
	staleSeconds?: number; // serve stale for this long past TTL
	negativeTtlSeconds?: number;
}

interface Envelope<T> {
	value: T | null;
	storedAt: number; // unix seconds
	freshUntil: number; // unix seconds
}

interface CacheMetrics {
	hits: number;
	misses: number;
	staleHits: number;
	negativeHits: number;
	loadErrors: number;
	coalesced: number;
}

type Loader<T> = () => Promise<T | null>;

// --- Cache layer ---
export class CacheLayer {
	private inFlight = new Map<string, Promise<unknown>>();

	readonly metrics: CacheMetrics = {
		hits: 0,
		misses: 0,
		staleHits: 0,
		negativeHits: 0,
		loadErrors: 0,
		coalesced: 0
	};

	constructor(
		private redis: Redis,
		private namespace: string
	) {}

	private fullKey(key: string): string {
		return `${this.namespace}:${key}`;
	}

	private now(): number {
		return Math.floor(Date.now() / 1000);
	}

	/**
	 * Cache-aside read with single-flight and stale-while-revalidate.
	 */
	async get<T>(key: string, loader: Loader<T>, opts: CacheOptions): Promise<T | null> {
		const redisKey = this.fullKey(key);
		const raw = await this.redis.get(redisKey);

		if (raw) {
			const env = JSON.parse(raw) as Envelope<T>;
			const now = this.now();

			if (now < env.freshUntil) {
				if (env.value === null) this.metrics.negativeHits++;
				else this.metrics.hits++;
				return env.value;
			}

			// Past TTL but inside the stale window: serve stale, refresh behind.
			this.metrics.staleHits++;
			void this.refresh(key, redisKey, loader, opts).catch((err) => {
				console.error(`[cache] background refresh failed for ${redisKey}:`, err);
			});
			return env.value;
		}

		this.metrics.misses++;
		return this.refresh(key, redisKey, loader, opts);
	}

	/**
	 * Load through the origin, coalescing concurrent callers for the same key.
	 */
	private refresh<T>(
		key: string,
		redisKey: string,
		loader: Loader<T>,
		opts: CacheOptions
	): Promise<T | null> {
		const existing = this.inFlight.get(key);
		if (existing) {
			this.metrics.coalesced++;
			return existing as Promise<T | null>;
		}

		const task = (async (): Promise<T | null> => {
			try {
				const value = await loader();
				await this.store(redisKey, value, opts);
				return value;
			} catch (err) {
				this.metrics.loadErrors++;
				throw err;
			} finally {
				this.inFlight.delete(key);
			}
		})();

		this.inFlight.set(key, task);
		return task;
	}

	private async store<T>(redisKey: string, value: T | null, opts: CacheOptions): Promise<void> {
		const now = this.now();
		const base = value === null ? (opts.negativeTtlSeconds ?? 30) : opts.ttlSeconds;
		const jitter = opts.jitterSeconds ? Math.floor(Math.random() * opts.jitterSeconds) : 0;
		const fresh = base + jitter;
		const stale = opts.staleSeconds ?? 0;

		const envelope: Envelope<T> = {
			value,
			storedAt: now,
			freshUntil: now + fresh
		};

		// Physical expiry = freshness window + stale window.
		await this.redis.set(redisKey, JSON.stringify(envelope), 'EX', fresh + stale);
	}

	/** Explicit invalidation from the write path. */
	async invalidate(...keys: string[]): Promise<number> {
		if (keys.length === 0) return 0;
		return this.redis.del(...keys.map((k) => this.fullKey(k)));
	}

	hitRatio(): number {
		const { hits, staleHits, negativeHits, misses } = this.metrics;
		const total = hits + staleHits + negativeHits + misses;
		return total === 0 ? 0 : (hits + staleHits + negativeHits) / total;
	}
}

// --- Usage ---
interface Scholar {
	id: string;
	name: string;
	city: string;
	field: string;
}

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const cache = new CacheLayer(redis, 'library');

async function loadScholarFromDb(id: string): Promise<Scholar | null> {
	// Replace with a real query; null means "does not exist".
	const rows: Record<string, Scholar> = {
		'ibn-sina': { id: 'ibn-sina', name: 'Ibn Sina', city: 'Bukhara', field: 'medicine' },
		'al-biruni': { id: 'al-biruni', name: 'Al-Biruni', city: 'Khwarazm', field: 'astronomy' }
	};
	return rows[id] ?? null;
}

export async function getScholar(id: string): Promise<Scholar | null> {
	return cache.get<Scholar>(`scholar:v1:${id}`, () => loadScholarFromDb(id), {
		ttlSeconds: 600,
		jitterSeconds: 60,
		staleSeconds: 120,
		negativeTtlSeconds: 30
	});
}

export async function updateScholarCity(id: string, city: string): Promise<void> {
	// 1. write to the source of truth
	// await db.scholars.update(id, { city });

	// 2. delete, never update, the cached copy
	await cache.invalidate(`scholar:v1:${id}`);
	console.log(`[cache] invalidated scholar:v1:${id} after city change to ${city}`);
}

// --- Periodic metrics dump ---
setInterval(() => {
	const m = cache.metrics;
	console.log(
		`[cache] hit_ratio=${(cache.hitRatio() * 100).toFixed(2)}% ` +
			`hits=${m.hits} stale=${m.staleHits} neg=${m.negativeHits} ` +
			`miss=${m.misses} coalesced=${m.coalesced} errors=${m.loadErrors}`
	);
}, 60_000).unref();
```

## এই ইমপ্লিমেন্টেশনে যা যা প্রোডাকশন-গ্রেড

- **Envelope ফরম্যাট** — freshness আর physical expiry আলাদা রাখা হয়েছে, যাতে stale-while-revalidate সম্ভব হয়
- **Single-flight** — একই key-এর concurrent miss গুলো একটাই origin call-এ মেলানো হয়, তাই stampede প্রসেসের ভেতরেই থেমে যায়
- **Negative caching** — অস্তিত্বহীন id-র বন্যা DB-তে পৌঁছায় না
- **TTL jitter** — একসাথে সেট হওয়া key গুলো একসাথে মরে না
- **Redis ডাউন হলে fail-open** — ক্যাশ পড়তে না পারলে রিকোয়েস্ট ফেল করে না, origin-এ যায়
- **Invalidate = delete** — কখনো ক্যাশে সরাসরি নতুন ভ্যালু লেখা হয় না, তাই race-এ পুরনো ভ্যালু আটকে যাওয়ার সুযোগ নেই

## যা ক্যাশ করবেন না

ক্যাশিং শেখার সবচেয়ে দামি অংশ হলো কোথায় থামতে হবে জানা।

- **যা প্রতিবার আলাদা** — সার্চ query-র অসীম combination, ইউজার-নির্দিষ্ট এককালীন রিপোর্ট। hit ratio শূন্যের কাছাকাছি হবে, শুধু মেমরি নষ্ট হবে।
- **যা ভুল হলে টাকার ক্ষতি** — ব্যালেন্স, স্টক কাউন্ট, সিট বুকিং। এখানে ক্যাশ না বসিয়ে বরং query দ্রুত করুন।
- **পারমিশন, যদি না আপনার invalidation নিখুঁত হয়** — একজন ব্যবহারকারীর অ্যাক্সেস কেড়ে নেওয়ার পরও ১০ মিনিট ধরে সে ঢুকতে পারলে সেটা একটা সিকিউরিটি ইনসিডেন্ট, পারফরম্যান্স ট্রেড-অফ নয়।
- **যে ধীর query আসলে একটা missing index** — ক্যাশ দিয়ে খারাপ query ঢেকে দিলে সমস্যাটা শুধু পিছিয়ে যায়, আর ক্যাশ মিস হওয়ার দিন সেটা আরও ভয়ংকর হয়ে ফিরে আসে। পরের চ্যাপ্টারগুলোতে আমরা ঠিক সেই দিকেই যাব।

<div class="takeaways">

### মূল শেখা

- ক্যাশ একটা লেয়ার নয়, একটা স্তূপ — browser, CDN, gateway, in-process, Redis, DB buffer pool। যত ইউজারের কাছে, তত দ্রুত এবং তত কম নিয়ন্ত্রণযোগ্য
- **Cache-aside** ডিফল্ট। write path-এ ক্যাশ আপডেট করবেন না, **delete** করুন
- TTL হলো "আমি কত সময় ভুল উত্তর দিতে রাজি" — এটা প্রোডাক্টের সিদ্ধান্ত, টেকনিক্যাল নয়। invalidation থাকলেও TTL রাখুন, কারণ invalidation মিস হবেই
- TTL-এ **jitter** দিন, নইলে একসাথে সেট হওয়া key গুলো একসাথে মরে DB-তে দেয়াল ধাক্কা দেবে
- Stampede ঠেকান তিন স্তরে: প্রসেসের ভেতরে single-flight, প্রসেসের বাইরে distributed lock, আর ইউজারের জন্য stale-while-revalidate
- hit ratio ৯০% → ৯৫% মানে DB লোড **অর্ধেক**, ৫% কম নয়। উল্টোদিকে ৯৯% hit ratio-র সিস্টেমে Redis পড়ে গেলে DB-তে ১০০x চাপ — তাই ক্যাশ optional নয়, critical dependency
- গড় latency ক্যাশ দিয়ে নাটকীয়ভাবে কমে, কিন্তু **p99 প্রায় সবসময়ই miss-এর latency** — গড় দেখে সন্তুষ্ট হবেন না

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Twitter/X** টাইমলাইনের জন্য বিশাল Redis ফ্লিট চালায়, আর ঠিক এ কারণেই তাদের ক্যাশ ফেইলিওর সরাসরি সাইট-ওয়াইড outage হয়ে দাঁড়ায় — ৯৯%+ hit ratio-র সিস্টেমে ক্যাশ কখনো "optional" নয়
- **Facebook**-এর memcached স্তর নিয়ে লেখা পেপারেই stampede (তারা বলে "thundering herd") আর lease-ভিত্তিক সমাধানের ধারণাটা জনপ্রিয় হয়
- **Stripe**-এর মতো পেমেন্ট সিস্টেম ব্যালেন্স ক্যাশ করে না, কিন্তু কারেন্সি রেট আর মার্চেন্ট কনফিগ আগ্রাসীভাবে ক্যাশ করে — সিদ্ধান্তটা সবসময় ডেটার ধরন ধরে হয়, সিস্টেম ধরে নয়
- **যেকোনো ই-কমার্স সাইট** প্রোডাক্ট পেজে stale-while-revalidate ব্যবহার করে: দাম কয়েক সেকেন্ড পুরনো দেখানো যায়, কিন্তু চেকআউটে গিয়ে লাইভ দাম ও স্টক আবার যাচাই হয়

</div>
