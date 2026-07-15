---
title: 'Persistence: RDB & AOF'
subtitle: "একটি in-memory store কীভাবে একটি restart-এ টিকে থাকে, এবং 'durable' আসলে তোমাকে কী দেয়।"
chapter: 4
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['rdb', 'aof', 'durability']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

সবকিছু যদি RAM-এ থাকে, একটা crash বা restart-এর সব মুছে ফেলার কথা — তবু একটা ভালোভাবে configure করা Redis তার ডেটা অক্ষত অবস্থায় ফিরে আসে। এটা background-এ disk-এ লিখে সেটা করে। Redis দুটো persistence mechanism দেয় যাদের আলাদা trade-off আছে, এবং এগুলো বোঝা হলো "আমি এক ঘণ্টার ডেটা হারিয়েছি" আর "আমি শেষ সেকেন্ডটা হারিয়েছি"-র মধ্যে পার্থক্য। এই অধ্যায় দুটোই ব্যাখ্যা করে এবং কীভাবে durability আসলে একটা switch নয়, একটা dial।

## গল্পে বুঝি

রহিমের মুদি দোকানে কোন তাকে কত মাল আছে — চাল, ডাল, তেল, সাবান — সবটাই তার মাথায় গাঁথা। খদ্দের এলে সেকেন্ডেই বলে দিতে পারে কী আছে কী নেই, কারণ পুরো হিসাব তার মাথার ভেতরেই (in-memory)। কিন্তু এলাকায় লোডশেডিং হলে বা রাতে ঘুমিয়ে সকালে উঠে যদি মাথা ফাঁকা হয়ে যায়, তাহলে তো সব হিসাব উধাও। তাই রহিম দুইভাবে নিজেকে বাঁচিয়ে রাখে। প্রথমত, প্রতি ঘণ্টায় সে দোকানের পুরো স্টক-বোর্ডের একটা ফুল ছবি তুলে রাখে — এক ক্লিকে গোটা তাকের অবস্থা। দ্বিতীয়ত, একইসাথে সে একটা চলতি খাতায় প্রতিটা বিক্রি ঘটার সাথে সাথে লিখে ফেলে — "দুই কেজি চিনি গেল, এক লিটার তেল গেল" — একটা লাইনও বাদ যায় না।

একদিন সত্যিই ব্ল্যাকআউট হলো, মাথার হিসাব ফাঁকা। এখন রহিমের হাতে দুই উপায়। ঘণ্টার তোলা ছবিটা দেখে সে চট করে গোটা স্টক আবার সাজিয়ে ফেলতে পারে — দ্রুত, কিন্তু ছবিটা তোলার পর যে বিক্রিগুলো হয়েছে সেগুলো ছবিতে নেই, ওই শেষ কিছুক্ষণের হিসাব হারিয়ে গেল। আবার চলতি খাতাটা খুলে সে প্রথম লাইন থেকে একটা একটা করে সব বিক্রি রিপ্লে করলে হুবহু শেষ মুহূর্ত পর্যন্ত সঠিক অবস্থা ফিরে পায় — কিন্তু খাতা মোটা হয়ে গেছে, পড়ে শেষ করতে সময় লাগে। কোনটাতে সে বেশি ভরসা করবে, সেটা বুঝেই একটা বেছে নেয়।

এই গল্পটাই আসলে Redis-এর **persistence**। মাথার হিসাব হলো RAM-এ থাকা লাইভ ডেটা, ঘণ্টায় তোলা ফুল ছবি হলো **RDB snapshot** (দ্রুত restore, কিন্তু শেষ কিছুক্ষণের ডেটা হারায়), আর চলতি খাতায় প্রতিটা বিক্রি টুকে রাখা হলো **AOF** — প্রতিটা write command-এর append-only log যা রিপ্লে করে হুবহু state ফেরানো যায়, কিন্তু log বড় হতে থাকে। ব্ল্যাকআউটের পর যেভাবে রহিম ছবি বা খাতা থেকে দোকান আবার দাঁড় করায়, সেটাই crash **recovery**, আর "দ্রুত কিন্তু কিছুটা হারানো ছবি" বনাম "ধীর কিন্তু নিখুঁত খাতা" — এটাই snapshot-vs-log tradeoff। বাস্তবে অনেক production Redis দুটোই একসাথে চালায়: RDB দিয়ে দ্রুত backup, আর AOF দিয়ে ছোট ক্ষতির window।

## Durability-র জন্য "in-memory" মানে কী

তোমার ডেটার authoritative copy RAM-এ। Disk persistence হলো একটা _backup_ যা Redis-কে restart-এর পর সেই RAM image পুনর্গঠন করতে দেয়। এটা একটা traditional database-এর উল্টো, যেখানে disk source of truth এবং memory তার একটা cache।

পরিণতি: শেষ সফল disk write আর একটা crash-এর মাঝে, যা শুধু memory-তে ছিল তা চলে যায়। সেই window কতটা ধরে — শূন্য, এক সেকেন্ড, কয়েক মিনিট — সম্পূর্ণভাবে নির্ভর করে তুমি persistence কীভাবে configure করো তার উপর। Redis একটা পছন্দ চাপিয়ে দেয় না; এটা তোমাকে knob দেয়।

## RDB: point-in-time snapshot

RDB (Redis Database) পর্যায়ক্রমে পুরো dataset-এর একটা compact, binary snapshot একটা single ফাইলে সংরক্ষণ করে, সাধারণত `dump.rdb`। তুমি একটা window-তে কতগুলো write হয় তা দিয়ে trigger configure করো:

```text
# redis.conf — save a snapshot if:
save 900 1       # 900s pass with at least 1 change
save 300 10      # 300s pass with at least 10 changes
save 60 10000    # 60s pass with at least 10000 changes

127.0.0.1:6379> BGSAVE
Background saving started
127.0.0.1:6379> LASTSAVE
(integer) 1718553600
```

যখন একটা snapshot trigger হয়, Redis `fork()` কল করে। child process memory-র একটা copy-on-write view উত্তরাধিকার পায় এবং সেটা disk-এ লেখে যখন parent client serve করতে থাকে। শুধু সেসব memory page যা save-এর সময় বদলায় সেগুলো duplicate হয়, তাই overhead সাধারণত মাঝারি — যদিও একটা খুব বড়, write-ভারী dataset-এ fork আর copy-on-write churn memory আর latency spike করতে পারে।

**শক্তি।** একটা single compact ফাইল, backup-এর জন্য বা একটা replica seed করতে box থেকে copy করা তুচ্ছ। দ্রুত restart — একটা binary ফাইল load করা একটা log replay করার চেয়ে দ্রুত। snapshot-এর মধ্যে ন্যূনতম runtime overhead।

**দুর্বলতা।** এটা একটা _point-in-time_ backup। যদি তুমি প্রতি পাঁচ মিনিটে snapshot করো এবং চার মিনিটে crash করো, তুমি চার মিনিটের write হারাও। RDB একা সেই ডেটার জন্য যেখানে কিছু ক্ষতি গ্রহণযোগ্য।

## AOF: append-only log

AOF (Append Only File) উল্টো পথ নেয়: এটা প্রতিটা write command ঘটার সাথে সাথে একটা ফাইলে log করে। restart-এ Redis exact state আবার গড়তে log replay করে।

```text
# redis.conf
appendonly yes
appendfsync everysec      # fsync policy (see below)
```

AOF-এর durability নির্ভর করে **কখন log OS buffer থেকে disk-এ flush হয়** তার উপর — `fsync` policy:

| `appendfsync` | আচরণ                      | worst-case ক্ষতি    | গতি             |
| ------------- | ------------------------- | ------------------- | --------------- |
| `always`      | প্রতিটা write-এর পর fsync | একটা single command | সবচেয়ে ধীর     |
| `everysec`    | সেকেন্ডে একবার fsync      | প্রায় এক সেকেন্ড   | দ্রুত (default) |
| `no`          | OS-কে সিদ্ধান্ত নিতে দাও  | ~30s পর্যন্ত        | সবচেয়ে দ্রুত   |

`everysec` হলো sweet spot যা বেশিরভাগ deployment ব্যবহার করে: বড়জোর প্রায় এক সেকেন্ডের write হারানো, no-fsync-এর কাছাকাছি throughput সহ।

যেহেতু একটা append-only log চিরকাল বাড়ে, Redis পর্যায়ক্রমে এটা **rewrite** করে: এটা fork করে, বর্তমান dataset পুনরুৎপাদন করার সবচেয়ে ছোট command সেট তৈরি করে, এবং পুরনো log প্রতিস্থাপন করে। `BGREWRITEAOF` এটা ম্যানুয়ালি trigger করে; `auto-aof-rewrite-percentage` এটা স্বয়ংক্রিয় করে।

```text
127.0.0.1:6379> BGREWRITEAOF
Background append only file rewriting started
```

**শক্তি।** RDB-র চেয়ে অনেক ছোট ক্ষতির window — এক সেকেন্ড বা এমনকি এক command পর্যন্ত নেমে আসে। log একটা append-only text-ঘেঁষা format যা তুমি পরিদর্শন করতে এবং, বিপদে পড়লে, মেরামত করতে পারো।

**দুর্বলতা।** ফাইলটা একটা RDB snapshot-এর চেয়ে বড়, এবং restart-এ একটা লম্বা log replay করা একটা snapshot load করার চেয়ে ধীর। `always` দিয়ে, throughput লক্ষণীয়ভাবে কমে।

<Callout type="info">

**নোট:** `fsync` হলো প্রতিটা durability দাবির পেছনের মূল ধারণা। একটা ফাইলে লেখা মানে ডেটা নিরাপদে disk-এ, তা নয় — OS এটা একটা page cache-এ buffer করে এবং অলসভাবে লেখে। শুধু `fsync` সেই byte-গুলোকে physical device-এ যেতে বাধ্য করে। "আমরা কত ঘন ঘন fsync করি?" _এটাই_ durability প্রশ্ন, Redis-এর জন্য এবং সাধারণভাবে database-এর জন্য।

</Callout>

## দুটো মিলিয়ে ব্যবহার

RDB আর AOF পরস্পর-বিরোধী নয়, এবং দুটোই চালানো সাধারণ production পছন্দ। AOF তোমাকে স্বাভাবিক recovery-র জন্য একটা ছোট ক্ষতির window দেয়; RDB দ্রুত backup আর দ্রুত reseeding-এর জন্য একটা compact ফাইল দেয়। দুটোই enabled থাকলে, Redis restart-এ AOF ব্যবহার করে কারণ এটা বেশি সম্পূর্ণ record।

আধুনিক Redis এটা **mixed (RDB-AOF) persistence** দিয়ে ধারালো করে: একটা AOF rewrite ফাইলের base হিসেবে একটা RDB-format snapshot লেখে, তারপর এর পরে নতুন command append করে। তুমি ডেটার বেশিরভাগের জন্য দ্রুত snapshot-style loading প্লাস সাম্প্রতিক command-এর fine-grained tail পাও — দুটোরই সেরাটা।

```text
# redis.conf
appendonly yes
aof-use-rdb-preamble yes
```

## বাস্তবে recovery

startup-এ Redis স্বয়ংক্রিয়ভাবে persistence ফাইল load করে: AOF যদি enabled হয়, অন্যথায় RDB। তুমি এই দিয়ে যাচাই এবং পরিদর্শন করতে পারো:

```text
127.0.0.1:6379> INFO persistence
# Persistence
loading:0
rdb_last_save_time:1718553600
rdb_last_bgsave_status:ok
aof_enabled:1
aof_last_rewrite_time_sec:2
aof_last_bgrewrite_status:ok
```

কয়েকটা operational বাস্তবতা:

- **Backup হলো একটা snapshot-এর snapshot।** একটা schedule-এ `dump.rdb` (আর AOF) host থেকে copy করো। persistence একটা process crash থেকে রক্ষা করে; off-box backup host হারানো থেকে রক্ষা করে।
- **একটা corrupted AOF** `redis-check-aof` tool দিয়ে চেক এবং ছাঁটা যায়; `redis-check-rdb` snapshot-এর জন্য একই কাজ করে।
- **সম্পূর্ণভাবে persistence disable করা** একটা pure cache-এর জন্য বৈধ যেখানে source of truth অন্য কোথাও। `save ""` আর `appendonly no` দিয়ে, একটা restart খালি অবস্থায় শুরু হয় — যা ঠিক আছে যদি cache শুধু database থেকে আবার ভরে যায়।

<Callout type="tip">

**নোট:** persistence-কে role-এর সাথে মেলাও। একটা database-এর সামনে একটা **cache**-এর প্রায়ই কিছুরই দরকার নেই — এটা হারানো মানে শুধু একটা cold start। একটা queue বা primary store-এর ন্যূনতম `everysec` সহ AOF দরকার, প্লাস backup-এর জন্য RDB। এই প্রশ্ন করে সিদ্ধান্ত নাও: এই instance যদি এই মুহূর্তে মারা যায়, শেষ সেকেন্ড, শেষ মিনিট, বা পুরোটা হারাতে কত খরচ হবে?

</Callout>
