---
title: 'Redis কী & Core Model'
subtitle: 'একটি in-memory key-value store, single-threaded event loop আর অসম্ভব সরল একটি wire protocol সহ।'
chapter: 1
level: 'beginner'
readingTime: '11 মিনিট'
topics: ['redis', 'in-memory', 'single-threaded']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমি মিয়ার মুদি দোকানে কোনো দাম-স্টকের খাতা কাউন্টারে নেই। আপনি জিজ্ঞেস করলেন, "চিনি কত?" — সাথে সাথে জবাব, "আটান্ন টাকা কেজি, বস্তা আছে তিনটা।" ডাল, তেল, আটা — যা-ই নাম ধরে জিজ্ঞেস করেন, খোয়ারিজমি মিয়া চোখ বন্ধ করে মুখস্থ বলে দেন, কারণ সব দাম আর স্টকের হিসাব তার মাথায় গাঁথা। পাশের দোকানের সিনা প্রতিবার পেছনের স্টোর রুমে হেঁটে গিয়ে ফাইল ঘেঁটে দাম বের করে — খোয়ারিজমি মিয়ার কাছে সেই হাঁটাহাঁটির বালাই নেই, উত্তর আসে নিমেষে।

তবে এই মুখস্থ রাখার একটা ঝুঁকি আছে। একদিন প্রচণ্ড জ্বরে খোয়ারিজমি মিয়া দুদিন অজ্ঞান হয়ে রইলেন — উঠে দেখলেন মাথার অনেক হিসাব ঘোলা হয়ে গেছে। যেগুলো আগেভাগে খাতায় টুকে রেখেছিলেন সেগুলোই কেবল ফিরে পেলেন, বাকিটা হারিয়ে গেল। তাই তিনি এখন গুরুত্বপূর্ণ হিসাবগুলো মাথায় রাখার পাশাপাশি একটা খাতাতেও লিখে রাখেন।

এটাই আসলে Redis। খোয়ারিজমি মিয়ার মাথা হলো RAM — সব ডেটা সেখানেই থাকে বলে এটা একটা **in-memory store**, আর তাই উত্তর আসে বিদ্যুৎবেগে (এই **speed**-টাই Redis-এর আসল জোর)। জিনিসের নাম ধরে জিজ্ঞেস করাটা হলো **key** দিয়ে খোঁজা — নাম বললেই মান পাওয়া, ঠিক **key-value** মডেল। আর জ্বরে হিসাব হারানোটা হলো **volatility**: RAM-এর ডেটা power চলে গেলে মুছে যায়, খাতায় (disk-এ) লিখে না রাখলে ফেরত পাওয়া যায় না। বাস্তবে এই কারণেই Redis-কে বেশি ব্যবহার করা হয় cache আর session storage-এর মতো কাজে — যেখানে দ্রুত উত্তর দরকার, আর মূল সত্যটা (source of truth) database-এ থেকেই যায়।

## Redis আসলে কী

Redis মানে **RE**mote **DI**ctionary **S**erver। মূলে এটা একটা dictionary — keys থেকে values-এর একটা map — যা RAM-এ থাকে এবং network-এর মাধ্যমে পৌঁছানো যায়। একটা সাধারণ hash map যেখানে শুধু অস্বচ্ছ blob রাখে, Redis-এর values নিজেরাই সমৃদ্ধ data structure: strings, lists, hashes, sets, sorted sets, আরও অনেক কিছু। server এই structure-গুলো বোঝে এবং এগুলোর উপর অপারেশন expose করে, তাই কাজটা ডেটার পাশেই ঘটে, তোমার application-এ পাঠানোর বদলে।

যেহেতু পুরো dataset memory-তে থাকে, read আর write মাপা হয় microsecond-এ, millisecond-এ নয়। hot path-এ কোনো disk seek নেই। disk শুধু durability-র জন্য ব্যবহৃত হয় (অধ্যায় 4-এ কভার করা), কখনোই একটা সাধারণ request serve করতে নয়।

## কেন এটা দ্রুত

তিনটা design সিদ্ধান্ত Redis-এর গতির বেশিরভাগটা ব্যাখ্যা করে।

- **সবকিছু memory-তে।** RAM access একটা random disk seek-এর চেয়ে মোটামুটি এক লক্ষ গুণ দ্রুত। Redis memory-র খরচ দিয়ে memory-র গতি কিনে নেয়।
- **একটা single-threaded command loop।** একটা thread একবারে একটা করে command চালায়, ক্রম অনুযায়ী। এটা একটা সীমাবদ্ধতার মতো শোনায়, আর raw CPU parallelism-এর জন্য তা-ই। কিন্তু এর মানে কোনো lock নেই, কোনো mutex নেই, এবং data structure-গুলোর উপর কোনো contention নেই। প্রতিটা command অন্য command-গুলোর তুলনায় atomically সম্পূর্ণ হয়ে চলে। এই সরলতা নিজেই একটা performance feature।
- **একটা efficient event loop আর ক্ষুদ্র protocol।** Redis সেই একটা thread-এ হাজারো client connection-কে একটা event loop ব্যবহার করে multiplex করে (ভেতরে epoll/kqueue)। protocol parse করা প্রায় বিনামূল্যে।

একটা single-threaded core মানে একটা single process নয়। আধুনিক Redis কিছু কাজ background thread-এ সরিয়ে দেয় — connection বন্ধ করা, নির্দিষ্ট কিছু delete, আর persistence — এবং তুমি একাধিক core ব্যবহার করতে একাধিক Redis process চালাও। কিন্তু যে logical model নিয়ে তুমি ভাবো তা হলো: একবারে একটা command, atomic, কোনো চমক ছাড়াই।

<Callout type="tip">

**নোট:** যেহেতু command-গুলো atomic এবং serialized, একটা single Redis command-কে safe করতে তোমার কখনো lock দরকার হয় না। ঝামেলা তখনই শুরু হয় যখন একটা _business operation_ কয়েকটা command জুড়ে বিস্তৃত হয় — সেটার জন্যই transactions আর Lua scripting (অধ্যায় 7)।

</Callout>

## Single-threaded event loop, concretely

কল্পনা করো তিনটা client ঠিক একই মুহূর্তে server-এ `INCR counter` দিয়ে আঘাত করলো। একটা naive multithreaded store-এ তুমি একটা lost update নিয়ে চিন্তা করতে — দুটো thread একই value পড়ে এবং দুটোই আবার লিখে ফেলে। Redis-এ কোনো race নেই: loop একটা command বেছে নেয়, পুরোপুরি চালায়, তারপর পরেরটা, তারপর পরেরটা। কোথাও কোনো locking code ছাড়াই counter সঠিক value-তে শেষ হয়। এই মানসিক model-টা মনে রাখো: **command-এর একটা queue, একবারে একটা করে খালি করা হচ্ছে।**

উল্টো দিকটা: একটা slow command প্রতিটা অন্য client-কে ব্লক করে রাখে যতক্ষণ না এটা শেষ হয়। এক মিলিয়ন key-এর উপর একটা `KEYS *`, কিংবা একটা বিশাল sorted-set range, পুরো server-কে থামিয়ে দিতে পারে। বড় collection-এর উপর O(N) command এড়ানো এই ট্র্যাকের একটা বারবার আসা থিম।

## RESP protocol

Client-রা Redis-এর সাথে **RESP** (REdis Serialization Protocol) ব্যবহার করে কথা বলে। এটা text-based এবং human-readable, যে কারণে তুমি সাধারণ `telnet` বা `nc` দিয়ে এটা debug করতে পারো। প্রতিটা type একটা single byte দিয়ে prefix করা:

```text
+   simple string   -> +OK\r\n
-   error           -> -ERR unknown command\r\n
:   integer         -> :1000\r\n
$   bulk string     -> $5\r\nhello\r\n
*   array           -> *2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n
```

একটা command bulk string-এর একটা array হিসেবে পাঠানো হয়। `SET name redis` wire-এ যায় এভাবে:

```text
*3\r\n$3\r\nSET\r\n$4\r\nname\r\n$5\r\nredis\r\n
```

তুমি খুব কমই এটা হাতে লেখো — একটা client library এটা করে — কিন্তু আকৃতিটা জানা `redis-cli` কী করছে তার রহস্য দূর করে এবং ব্যাখ্যা করে কেন pipelining (reply পড়ার আগে অনেক command পাঠানো) এত সহজ একটা জয়: protocol-এ per-command কোনো handshake নেই।

## Install করা আর connect করা

বেশিরভাগ system-এ Redis এক লাইনে install হয়, এবং `redis-cli` হলো interactive client:

```bash
# macOS
brew install redis
redis-server &        # start the server (foreground without &)

# Debian / Ubuntu
sudo apt-get install redis-server

# Connect
redis-cli
redis-cli -h 127.0.0.1 -p 6379
```

একটা প্রথম session দেখতে এমন। প্রতিটা command-এর পরের লাইনগুলো হলো server-এর reply:

```text
127.0.0.1:6379> PING
PONG
127.0.0.1:6379> SET greeting "hello world"
OK
127.0.0.1:6379> GET greeting
"hello world"
127.0.0.1:6379> APPEND greeting "!"
(integer) 12
127.0.0.1:6379> GET greeting
"hello world!"
127.0.0.1:6379> DEL greeting
(integer) 1
127.0.0.1:6379> EXISTS greeting
(integer) 0
```

`PING` হলো health check, `SET`/`GET` হলো মূল কাজের ঘোড়া, এবং `(integer)` reply-গুলো হলো RESP integer — `DEL` কতটা key সরিয়েছে তা ফেরত দেয়, `EXISTS` একটা count ফেরত দেয়।

## কখন Redis ব্যবহার করবে (আর কখন নয়)

Redis তখন জ্বলে ওঠে যখন access দ্রুত এবং ডেটা memory-তে ধরে:

- ব্যয়বহুল query বা computation-এর ফলাফল **Caching** করা।
- web app-এর জন্য **Session storage**।
- **Rate limiting** আর counter, atomic increment ব্যবহার করে।
- lists আর streams দিয়ে **Queues আর job brokers**।
- sorted set দিয়ে **Leaderboards আর ranking**।
- presence, typing indicator, আর short-lived lock-এর মতো **Ephemeral real-time data**।

বরং একটা traditional database-এর দিকে যাও যখন:

- তোমার working set সাশ্রয়ী RAM-এর চেয়ে অনেক বড় এবং এর বেশিরভাগ cold।
- তোমার rich ad-hoc query, join, আর একটা query planner দরকার।
- তোমার একটা relational engine-এর কঠোর, multi-row, roll-back-যোগ্য transaction দরকার।
- ডেটাই source of truth এবং সতর্ক durability tuning ছাড়া শেষ এক সেকেন্ডের write হারানো অগ্রহণযোগ্য।

<Callout type="info">

**নোট:** "In-memory" মানে অবশ্যই "volatile" নয়। Redis disk-এ persist করতে পারে এবং restart-এ আবার load করতে পারে (অধ্যায় 4)। কিন্তু এর durability guarantee একটা relational database-এর চেয়ে দুর্বল এবং বেশি configurable, তাই একটা সত্যিকারের system of record-এর জন্য এটা সাধারণত একটার সাথে জোড়া লাগানো হয়, বদল হিসেবে ব্যবহৃত হয় না।

</Callout>

সঠিক framing: Redis হলো **network-এর উপর দ্রুত data structure-এর একটা toolbox**, তোমার primary database-এর drop-in বদল নয়। এই ট্র্যাকের বাকিটা হলো tool-গুলোকে যথেষ্ট ভালোভাবে শেখা যাতে সঠিকটা বেছে নেওয়া যায়।
