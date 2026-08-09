---
title: 'Redis as Cache, Queue & Distributed Lock'
subtitle: 'তিনটি কাজের-ঘোড়া প্যাটার্ন — এবং প্রতিটার ভেতরে লুকিয়ে থাকা ধারালো কিনারা।'
chapter: 6
level: 'advanced'
readingTime: '14 মিনিট'
topics: ['cache', 'queue', 'distributed lock']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

একটা ব্যস্ত অফিসে আল-খোয়ারিজমি একাই তিনটা কাজ সামলায়। প্রথম কাজ — অফিসে দিনভর একই কয়েকটা তথ্য বারবার লাগে: ছুটির নিয়ম, ফোন নম্বরের লিস্ট, কমন ফর্ম। এসবের জন্য প্রতিবার তিনতলার আর্কাইভ রুমে হেঁটে যেতে গেলে সময় নষ্ট, তাই আল-খোয়ারিজমি যেগুলো ঘনঘন লাগে সেগুলোর একটা কপি নিজের ডেস্কের পাশের ছোট তাকে হাতের নাগালে সাজিয়ে রাখে। কেউ জিজ্ঞেস করলেই তাক থেকে সেকেন্ডে বের করে দেয়; তাকে না থাকলে একবার আর্কাইভে গিয়ে এনে দেয়, আর কপিটা তাকে রেখে দেয় পরেরবারের জন্য। তবে প্রতিটা কাগজে সে একটা তারিখ লিখে রাখে — নিয়ম বদলে গেলে যেন পুরনো কাগজ ফেলে টাটকা কপি আনা যায়।

দ্বিতীয় কাজ — অফিসের নানা লোক নানা টাস্ক আল-খোয়ারিজমির ডেস্কের একটা ইন-ট্রেতে চিরকুট হিসেবে ফেলে যায়: "এই চিঠিটা টাইপ করো", "এই বিলটা এন্ট্রি করো"। আল-খোয়ারিজমি আর তার সহকারীরা ট্রে থেকে একটা একটা করে চিরকুট তুলে নিয়ে কাজ শেষ করে, কেউ একই চিরকুট দুবার নেয় না। আর তৃতীয় কাজ — অফিসের দামি জিনিসপত্রের স্ট্রং-রুম, যার চাবি মাত্র একটাই। যে টিম ভেতরে ঢুকবে সে চাবিটা নেয়, কাজ শেষে ফেরত দেয়; ততক্ষণ বাকিরা বাইরে অপেক্ষা করে। চাবি না ফেরালে যাতে সব আটকে না থাকে, সেজন্য নিয়ম — কেউ আধ ঘণ্টার বেশি ভেতরে থাকলে চাবির দাবি ছেড়ে দিতে হবে।

এই একজন আল-খোয়ারিজমিই আসলে Redis-এর তিনটা ভূমিকা। ঘনঘন লাগা কাগজের ছোট তাক হলো **cache** — দ্রুত লুকআপ, প্রতিটায় একটা তারিখ মানে **TTL**। ইন-ট্রেতে চিরকুট ফেলা লোকজন হলো **producer**, আর একটা একটা করে তুলে নেওয়া সহকারীরা হলো **consumer** — পুরোটাই list-দিয়ে বানানো **queue**। আর স্ট্রং-রুমের একটামাত্র চাবি হলো **distributed lock** — একসাথে শুধু একজনই ধরতে পারে, অন্যরা অপেক্ষা করে। বাস্তবে Redis-এ এই lock বানানো হয় `SET ... NX EX` (SETNX) দিয়ে, আর একাধিক server-এ শক্ত করতে **Redlock** algorithm — ঠিক যেমন চাবির আধ ঘণ্টার নিয়মটাই হলো lock-এর TTL, যাতে কেউ চাবি হাতে ক্র্যাশ করলেও system চিরকাল আটকে না থাকে।

Redis-এর বেশিরভাগ production ব্যবহার তিনটা প্যাটার্নের একটা: একটা slow store-এর সামনে একটা cache, background worker-কে খাওয়ানো একটা queue, বা distributed process সমন্বয় করা একটা lock। প্রতিটা শুরু করতে কয়েকটা command এবং ঠিকঠাক করতে অবাক করার মতো সূক্ষ্ম। এই অধ্যায় তিনটাই বানায় এবং যেসব failure mode মানুষকে কামড়ায় সেগুলো ঘুরে দেখে।

## Cache-aside

প্রধান caching প্যাটার্ন। application — Redis নয় — logic-এর মালিক: cache চেক করো, এবং একটা miss-এ database থেকে fetch করে পরের বারের জন্য cache পপুলেট করো।

```text
1. value = GET cache:product:99
2. if value exists -> return it (a "hit")
3. else (a "miss"):
     row = SELECT * FROM products WHERE id = 99
     SET cache:product:99 <serialized row> EX 300
     return row
```

একটা redis-cli session-এ cache-এর অর্ধেকটা দেখতে এমন:

```text
127.0.0.1:6379> GET cache:product:99
(nil)
127.0.0.1:6379> SET cache:product:99 "{\"id\":99,\"name\":\"Lamp\"}" EX 300
OK
127.0.0.1:6379> GET cache:product:99
"{\"id\":99,\"name\":\"Lamp\"}"
```

যেসব মূল বিষয় এটাকে safe করে:

- **সবসময় একটা TTL সেট করো।** bug আর মিস করা invalidation অনিবার্য; একটা TTL বাসি ডেটা কতক্ষণ বাঁচতে পারে তা সীমাবদ্ধ করে।
- **write-এ invalidate করো।** যখন underlying row বদলায়, `DEL cache:product:99` করো যাতে পরের read আবার পপুলেট করে। cache জায়গায় বসে update করার চেয়ে delete করা নিরাপদ, যা race করতে পারে।
- **miss সহ্য করো।** একটা cache একটা optimization, source of truth নয়। Redis down থাকলে app-এর উচিত database-এ fall back করা, ধীর কিন্তু সঠিক।

দুটো ক্লাসিক বিপদ। একটা **cache stampede** ঘটে যখন একটা hot key expire হয় এবং একঝাঁক concurrent request সবাই miss করে এবং একসাথে database-এ আঘাত হানে — একটা ছোট lock দিয়ে প্রশমিত করা হয় যাতে শুধু একটা request rebuild করে, বা expiry-র সামান্য আগে recompute করে। **Cache penetration** হলো যেসব key নেই তাদের জন্য বারবার miss; একটা short-lived negative ফলাফল (একটা empty marker) cache করো যাতে database প্রতিবার query করা না হয়। Caching ট্র্যাক এগুলো গভীরভাবে কভার করে।

## List দিয়ে সরল queue

একটা Redis list একটা তৈরি queue: এক প্রান্তে push করো, অন্যটা থেকে pop করো। blocking pop-ই এটাকে ব্যবহারিক করে — একটা worker polling করার বদলে দক্ষভাবে অপেক্ষা করে।

```text
# Producer enqueues a job
127.0.0.1:6379> LPUSH queue:emails "{\"to\":\"a@x.com\",\"tpl\":\"welcome\"}"
(integer) 1

# Worker blocks until a job is available (up to 5s), then takes it
127.0.0.1:6379> BRPOP queue:emails 5
1) "queue:emails"
2) "{\"to\":\"a@x.com\",\"tpl\":\"welcome\"}"
```

`LPUSH` + `BRPOP` একটা FIFO queue দেয়: producer বাঁয়ে যোগ করে, worker ডান থেকে নেয়। `BRPOP` একটা item আসা বা timeout শেষ হওয়া পর্যন্ত _client_-কে (server নয়) block করে, তাই worker idle থাকাকালীন কোনো CPU খরচ করে না এবং কাজ আসার মুহূর্তেই তুলে নেয়।

fire-and-forget job-এর জন্য এটা যথেষ্ট যেখানে মাঝেমধ্যে ক্ষতি সহনীয়। কিন্তু ফাঁকটা লক্ষ্য করো: `BRPOP` return করার মুহূর্তে, job-টা Redis থেকে _চলে গেছে_। যদি worker শেষ করার আগে crash করে, সেই job হারিয়ে গেছে — কেউ জানে না এটা ছিল।

## Reliable queue

একটা crash করা worker-এর হাত থেকে বাঁচতে তোমাকে job শেষ না হওয়া পর্যন্ত সরানো যাবে না। `BRPOPLPUSH` (বা নতুন `BLMOVE`) atomically একটা job মূল queue থেকে এক ধাপে একটা per-worker _processing_ list-এ সরায়:

```text
# Atomically take a job AND record it as in-flight
127.0.0.1:6379> BRPOPLPUSH queue:emails queue:emails:processing 5
"{\"to\":\"a@x.com\",\"tpl\":\"welcome\"}"

# ...do the work...

# On success, remove it from the processing list
127.0.0.1:6379> LREM queue:emails:processing 1 "{\"to\":\"a@x.com\",\"tpl\":\"welcome\"}"
(integer) 1
```

এখন একটা crash job-টাকে `queue:emails:processing`-এ বসিয়ে রাখে। একটা recovery process (বা restart-এ worker) সেই list scan করে এবং একটা timeout-এর বাইরে আটকে থাকা যেকোনো কিছু re-queue করে। এটা **at-least-once** delivery দেয় — একটা worker কাজ করার পর কিন্তু `LREM`-এর আগে মারা গেলে একটা job দুবার চলতে পারে, তাই job-গুলো **idempotent** হওয়া উচিত।

সত্যি বলতে, বেসিকের বাইরে যেকোনো কিছুর জন্য, **consumer group সহ Streams** (অধ্যায় 5) বা Redis-এর উপর নির্মিত একটা battle-tested library-কে প্রাধান্য দাও। এরা তোমাকে acknowledgement, আটকে থাকা job-এর automatic claim, এবং recovery loop নতুন করে আবিষ্কার না করেই pending কাজে visibility দেয়।

<Callout type="tip">

**নোট:** queue-এর বিভাজক প্রশ্ন হলো "একটা worker job-এর মাঝে মারা গেলে কী হয়?" একটা সাধারণ `BRPOP`-এর উত্তর "job হারিয়ে গেছে।" `BRPOPLPUSH` প্লাস একটা recovery sweep, বা একটা Stream consumer group, উত্তর দেয় "job retry হয়।" একটা job হারানো গ্রহণযোগ্য কিনা তার উপর ভিত্তি করে বেছে নাও — এবং যেভাবেই হোক job-গুলো idempotent বানাও, কারণ at-least-once মানে _কখনো কখনো দুবার_।

</Callout>

## Distributed lock

যখন কয়েকটা process একই exclusive কাজ করতে পারে — একটা cron job চালানো, একটা card চার্জ করা, একটা cache rebuild করা — তোমার একটা lock দরকার যা তারা সবাই সম্মান করে। একটা single Redis instance `SET ... NX EX` দিয়ে একটা সরল lock দেয়:

```text
# Acquire: set only if absent (NX), auto-expire in 30s (EX), unique token as value
127.0.0.1:6379> SET lock:reindex "owner-token-abc" NX EX 30
OK
127.0.0.1:6379> SET lock:reindex "owner-token-xyz" NX EX 30
(nil)                # someone already holds it
```

তিনটা বিষয় নন-নেগোশিয়েবল:

- **`NX` acquisition-কে atomic করে।** একটা single command-এ set-if-not-exists মানে দুটো process দুজনেই ভাবতে পারে না যে তারা জিতেছে।
- **`EX` বাধ্যতামূলক।** holder release না করে crash করলে, TTL lock মুক্ত করে। expiry ছাড়া একটা lock যা তার owner-কে ছাড়িয়ে বাঁচে সেটা system-কে চিরকালের জন্য deadlock করে।
- **value হলো একটা unique token**, তাই শুধু আসল owner এটা release করে। নিরাপদে release করতে একটা check-then-delete দরকার যা অবশ্যই atomic হতে হবে — এবং একটা সাধারণ `GET` তারপর `DEL` নয়, কারণ দুটোর মাঝে lock expire হয়ে re-acquire হতে পারে। একটা Lua script ব্যবহার করো (অধ্যায় 7):

```lua
-- release lock only if we still own it
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
```

### Redlock বিতর্ক

single-instance lock-এর একটা আসল দুর্বলতা আছে: যদি সেই একটা Redis এমন একটা replica-তে failover করে যা এখনও lock write receive করেনি, দুটো client "একই" lock ধরতে পারে। **Redlock** হলো এর বিরুদ্ধে শক্ত করার একটা algorithm, কয়েকটা স্বাধীন Redis master-এর একটা majority-তে lock acquire করে, যাতে একটা node-এর failure lock না হারায়।

Redlock সত্যিই বিতর্কিত। সমালোচনা (বিশেষ করে Martin Kleppmann-এর) হলো timeout-এর উপর ভিত্তি করা কোনো lock সেসব জিনিসের বিরুদ্ধে safe নয় যা আসলে lock ভাঙে: clock drift, দীর্ঘ GC বা stop-the-world pause, এবং network delay একটা client-কে _বিশ্বাস_ করাতে পারে যে সে এখনও এমন একটা lock ধরে আছে যার TTL ইতিমধ্যে expire হয়ে গেছে, যখন আরেকটা client দখল নিয়ে নিয়েছে। পাল্টা যুক্তি (Redis-এর author, antirez থেকে) হলো Redlock সাধারণ কেসের জন্য ঠিক আছে এবং সমালোচনা এমন guarantee দাবি করে যা খুব কম system-এর সত্যিই দরকার।

ব্যবহারিক অবস্থান:

- **efficiency** lock-এর জন্য — "এই redundant কাজ দুবার করা এড়াও, কিন্তু মাঝেমধ্যে হলে এটা শুধু অপচয়" — একটা single-instance `SET NX EX` lock সরল এবং যথেষ্ট ভালো।
- **correctness** lock-এর জন্য — "এটা দুবার করা ডেটা corrupt করে বা একটা customer-কে double-charge করে" — একা একটা Redis lock-এর উপর নির্ভর করো **না**। resource-এ একটা আসল safeguard যোগ করো: একটা fencing token (একটা monotonically বাড়া number যা resource চেক করে এবং বাসি হলে reject করে), একটা unique constraint, বা database-এ একটা conditional write। lock একটা optimization হয়ে ওঠে, এবং correctness resource-এর উপর নির্ভর করে, timeout-এর উপর নয়।

<Callout type="warning">

**নোট:** কোনো timeout-based distributed lock — Redlock সহ — একা correctness-এর জন্য safe নয়, কারণ একটা process তার lock-এর expiry পেরিয়ে না জেনেই pause করতে পারে (GC, scheduling, একটা slow disk)। যদি "একবারে দুই holder" ডেটা corrupt করতো, তোমার নিচে একটা fencing token বা একটা database-level guarantee দরকার। Redis lock-কে best-effort সমন্বয় হিসেবে ট্রিট করো, একটা mutual-exclusion guarantee হিসেবে নয়।

</Callout>
