---
title: 'Pub/Sub & Streams'
subtitle: 'Fire-and-forget messaging বনাম consumer group সহ একটি durable, replayable log।'
chapter: 5
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['pubsub', 'streams', 'consumer groups']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

আসরের নামাজের ঠিক আগে পাড়ার মসজিদের মাইকে খোয়ারিজমি চাচা ঘোষণা দিলেন — "আজ রাতে মিলাদ, সবাই দাওয়াত রইল।" যারা সেই মুহূর্তে মসজিদের আশপাশে ছিল, দোকানে বসে ছিল, বা জানালা খোলা রেখে বাড়িতে ছিল, তারা সবাই শুনে ফেলল। কিন্তু সিনা তখন বাজারে, হেডফোন কানে — সে কিছুই শোনেনি। ঘোষণা বাতাসে মিলিয়ে গেল, কোথাও লেখা রইল না। সিনা দশ মিনিট পরে ফিরে এসে যতই কান পাতুক, মিস করা ঘোষণা আর ফিরে পাওয়ার উপায় নেই।

এই সমস্যা এড়াতে মসজিদ কমিটি দেয়ালে একটা নোটিশ খাতা ঝুলিয়ে রেখেছে। প্রতিটা ঘোষণা তারিখ-ক্রম অনুযায়ী সেখানে লিখে রাখা হয়। এখন সিনা তিন দিন পরে এসেও খাতাটা খুলে উপর থেকে নিচে পড়ে ফেলতে পারে — কী কী মিস করেছে সব ধরে ফেলে। ফাতিমা আবার আলাদা মানুষ, সে খাতার পাশে নিজের নামে একটা বুকমার্ক রাখে — "আমি এই লাইন পর্যন্ত পড়েছি" — যাতে পরেরবার এসে ঠিক সেখান থেকেই পড়া শুরু করতে পারে, আগেরগুলো আবার না পড়ে।

এই গল্পটাই আসলে **Pub/Sub** বনাম **Streams**। মসজিদের লাইভ মাইক হলো Pub/Sub channel — যে subscriber ঠিক তখন শুনছে সে-ই পায়, দেরিতে এলে চিরতরে মিস, কোথাও persist হয় না (fire-and-forget)। আর দেয়ালের নোটিশ খাতা হলো Stream — একটা durable, ক্রমানুসারে লেখা log, যেখানে দেরিতে আসা মানুষও পুরোটা replay করে পড়তে পারে, আর ফাতিমার মতো প্রত্যেক পাঠকের নিজের বুকমার্ক (consumer group offset) থাকে যাতে কে কোথায় পড়েছে আলাদা করে track করা যায়। বাস্তবে live notification বা presence update-এর জন্য Pub/Sub যথেষ্ট, কিন্তু order-processing বা event log — যেখানে একটা message হারানো চলবে না, worker crash করলে আবার process করতে হবে — সেখানে Streams-ই ঠিক tool।

Redis শুধু value সংরক্ষণ করে না, process-এর মধ্যে message-ও সরাতে পারে। এর জন্য এটা দুটো খুব আলাদা tool দেয়: Pub/Sub, স্মৃতিহীন একটা lightweight broadcast, এবং Streams, delivery guarantee সহ একটা durable append-only log। এগুলো উপরিভাগে একরকম দেখায় এবং সবসময় গুলিয়ে ফেলা হয়। এই অধ্যায় সীমারেখা টানে এবং দেখায় কখন কোনটা ফিট করে।

## Pub/Sub: fire-and-forget broadcast

Pub/Sub-এ, publisher-রা নামযুক্ত **channel**-এ message পাঠায় এবং subscriber-রা তাদের শোনার সময় যা publish হয় তা receive করে। কোনো storage নেই এবং কোনো queue নেই — একটা message সেই মুহূর্তে প্রতিটা connected subscriber-এর কাছে delivered হয় এবং তারপর ভুলে যাওয়া হয়।

```text
# Terminal A — subscriber
127.0.0.1:6379> SUBSCRIBE news:tech
Reading messages... (press Ctrl-C to quit)
1) "subscribe"
2) "news:tech"
3) (integer) 1

# Terminal B — publisher
127.0.0.1:6379> PUBLISH news:tech "Redis 8 released"
(integer) 1          # number of subscribers that received it

# Terminal A now shows
1) "message"
2) "news:tech"
3) "Redis 8 released"
```

Pattern subscription একটা subscriber-কে অনেক channel মেলাতে দেয়:

```text
127.0.0.1:6379> PSUBSCRIBE news:*
```

**কোথায় ফিট করে।** real-time fan-out যেখানে একটা message হারানো গ্রহণযোগ্য এবং তুমি শুধু _এখন_ নিয়ে চিন্তিত: live notification, presence update, বর্তমানে-connected client-দের চ্যাট, app server জুড়ে cache-invalidation signal, এবং config পরিবর্তন broadcast করা।

### সীমাবদ্ধতা

Pub/Sub-এর সরলতাই এর ছাদ, এবং তোমাকে এগুলো ঘিরে design করতে হবে:

- **কোনো persistence নেই।** কেউ subscribe না থাকা অবস্থায় publish করা একটা message চলে গেছে। এক millisecond দেরিতে connect করা একটা subscriber এটা কখনো দেখে না।
- **কোনো acknowledgement নেই।** publisher recipient-এর একটা count পায় কিন্তু কেউ message process করেছে তার কোনো প্রমাণ পায় না।
- **কোনো replay নেই।** disconnect করে reconnect করা একটা subscriber-এর যা মিস করেছে তা ধরে ফেলার কোনো উপায় নেই।
- **At-most-once delivery।** যদি একটা subscriber ধীর হয় এবং এর buffer overflow করে, Redis একে drop করে। কোনো redelivery নেই।

যদি এসব guarantee-র কোনোটা গুরুত্বপূর্ণ হয় — এবং একটা job queue বা একটা event log-এর জন্য প্রায় সবসময়ই হয় — Pub/Sub ভুল tool। ঠিক সেই ফাঁকটাই Streams পূরণ করে।

<Callout type="warning">

**নোট:** ক্লাসিক Pub/Sub ফাঁদ হলো একে একটা job queue হিসেবে ব্যবহার করা। যেহেতু কোনো persistence বা ack নেই, একটা worker যে restart করে, পিছিয়ে পড়ে, বা সংক্ষিপ্তভাবে offline থাকে সে নীরবে job হারায়, এবং কিছুই তোমাকে জানায় না। যা কিছু নির্ভরযোগ্যভাবে process করতেই হবে, তার জন্য Streams বা একটা list-based queue (অধ্যায় 6) ব্যবহার করো, Pub/Sub নয়।

</Callout>

## Streams: একটি durable, replayable log

একটা Stream হলো entry-র একটা append-only log, প্রতিটার একটা auto-generated ID (একটা millisecond timestamp প্লাস একটা sequence number) এবং field-value জোড়ার একটা সেট আছে। entry persist করে যতক্ষণ না তুমি এগুলো ছাঁটো, একাধিক consumer স্বাধীনভাবে পড়তে পারে, এবং সবাই history replay করতে পারে। এটাকে একটা Kafka-style log-এর প্রতি Redis-এর উত্তর ভাবো।

```text
127.0.0.1:6379> XADD orders * item "book" qty 2
"1718553600000-0"
127.0.0.1:6379> XADD orders * item "pen" qty 5
"1718553600050-0"
127.0.0.1:6379> XLEN orders
(integer) 2
127.0.0.1:6379> XRANGE orders - +
1) 1) "1718553600000-0"
   2) 1) "item"
      2) "book"
      3) "qty"
      4) "2"
2) 1) "1718553600050-0"
   2) 1) "item"
      2) "pen"
      3) "qty"
      4) "5"
```

`*` Redis-কে ID generate করতে বলে। `XADD ... MAXLEN ~ 10000` stream-এর length সীমাবদ্ধ করে যাতে এটা চিরকাল না বাড়ে। নতুন entry আসার সাথে সাথে পড়তে, `XREAD` block করতে পারে:

```text
127.0.0.1:6379> XREAD COUNT 10 BLOCK 5000 STREAMS orders $
```

এখানে `$` মানে "শুধু সেসব entry যা আমি পড়া শুরু করার পর যোগ হয়েছে," এবং `BLOCK 5000` একটা দেখা দেওয়া পর্যন্ত পাঁচ সেকেন্ড অপেক্ষা করে। `$`-এর বদলে একটা নির্দিষ্ট ID pass করা একটা reader-কে ঠিক যেখানে থেমেছিল সেখান থেকে resume করতে দেয় — সেই replay যা Pub/Sub করতে পারে না।

## Consumer groups

একটা single blocking reader scale করে না; তুমি চাও কয়েকটা worker load ভাগ করুক যেখানে কোনো entry দুবার process না হয়। **Consumer group** ঠিক সেটাই দেয়। group একটা shared cursor track করে, এবং Redis প্রতিটা নতুন entry group-এর একটা consumer-কে দেয়।

```text
127.0.0.1:6379> XGROUP CREATE orders workers $ MKSTREAM
OK
# worker "w1" claims the next undelivered entries
127.0.0.1:6379> XREADGROUP GROUP workers w1 COUNT 1 STREAMS orders >
1) 1) "orders"
   2) 1) 1) "1718553600100-0"
         2) 1) "item"
            2) "lamp"
# after processing, acknowledge it
127.0.0.1:6379> XACK orders workers 1718553600100-0
(integer) 1
```

`>` মানে "এই group-এর কোনো consumer-কে কখনো delivered হয়নি এমন entry।" প্রতিটা delivered entry সেই consumer-এর **Pending Entries List (PEL)**-এ ঢোকে এবং `XACK` না হওয়া পর্যন্ত সেখানে থাকে। এটাই delivery-কে নির্ভরযোগ্য করে:

- **At-least-once delivery।** একটা entry pending থাকে যতক্ষণ না স্পষ্টভাবে acknowledge করা হয়, তাই একটা worker যে job-এর মাঝে crash করে সে entry-টা recoverable রেখে যায়।
- **`XPENDING` আর `XCLAIM` দিয়ে recovery।** `XPENDING` delivered কিন্তু এখনো ack না হওয়া entry তালিকাভুক্ত করে (এবং এগুলো কতক্ষণ idle ছিল)। `XCLAIM` (বা `XAUTOCLAIM`) আরেকটা worker-কে একটা মৃত consumer যে entry কখনো শেষ করেনি সেগুলো নিয়ে নিতে দেয়।
- **Load balancing।** group-এ আরও consumer যোগ করো আর Redis স্বয়ংক্রিয়ভাবে নতুন entry এদের মধ্যে ছড়িয়ে দেয়।

```text
127.0.0.1:6379> XPENDING orders workers
1) (integer) 1
2) "1718553600100-0"
3) "1718553600100-0"
4) 1) 1) "w1"
      2) "1"
```

<Callout type="info">

**নোট:** Pub/Sub আর Streams আলাদা প্রশ্নের উত্তর দেয়। Pub/Sub জিজ্ঞেস করে "_এই মুহূর্তে_ কে শুনছে?" Streams জিজ্ঞেস করে "কী ঘটেছে, এবং প্রতিটা event কি সামলানো হয়েছে?" Pub/Sub কোনো state রাখে না; Streams একটা durable log প্লাস per-group delivery state রাখে। যদি তোমার acknowledgement, replay, বা load-balanced worker দরকার, তাহলে এটা Streams।

</Callout>

## Streams বনাম একটি আসল message broker

Streams সত্যিই সক্ষম, কিন্তু এরা Kafka, RabbitMQ, বা একটা managed queue-এর পূর্ণ বদল নয়। ইচ্ছাকৃতভাবে বেছে নাও:

- **Streams-এর দিকে যাও** যখন তুমি ইতিমধ্যে Redis চালাও, throughput আর retention মাঝারি, এবং তুমি আরেকটা system না চালিয়ে একটা durable queue বা event log চাও। latency চমৎকার এবং API সরল।
- **একটা dedicated broker-এর দিকে যাও** যখন তোমার খুব উচ্চ sustained throughput, দিন বা সপ্তাহে মাপা দীর্ঘ retention, অনেক node জুড়ে partitioning, জটিল routing আর exchange (RabbitMQ), একটা cluster জুড়ে শক্তিশালী ordering আর exactly-once semantics, বা connector-এর একটা ecosystem দরকার। একটা Stream-এর ডেটা এখনও Redis-এর memory-তে বাকি সবকিছুর পাশে ধরতে হয়, যা তুমি কতটা history রাখতে পারো তা সীমাবদ্ধ করে।

সৎ সারসংক্ষেপ: Streams অনেক in-house workload-এর জন্য ঠিক পরিমাণ durability আর delivery guarantee, এবং অকালে Kafka না যোগ করার একটা ভালো কারণ — কিন্তু বড় স্কেলে বা কঠিন routing প্রয়োজনে, একটা purpose-built broker তার operational খরচ পুষিয়ে দেয়।
