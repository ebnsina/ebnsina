---
title: 'Replication, Sentinel & Cluster'
subtitle: 'এক node থেকে অনেক: copy, automatic failover, এবং hash slot জুড়ে sharding।'
chapter: 8
level: 'advanced'
readingTime: '13 মিনিট'
topics: ['replication', 'sentinel', 'cluster']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

করিমের একটা মুদি দোকানের চেইন — শহরজুড়ে অনেকগুলো শাখা। দাম আর স্টকের আসল হিসাবের খাতাটা থাকে হেড শপে, করিমের নিজের হাতে। কিন্তু হেড শপে গিয়ে সবাই কেনাকাটা করলে তো লাইন লেগে যাবে, তাই প্রতিটা শাখা হেড শপের খাতাটা সমানে দেখে দেখে নিজের কাছে হুবহু কপি করে রাখে। কোন জিনিসের কত দাম, কত স্টক — যেকোনো শাখায় গিয়ে কাস্টমার জিজ্ঞেস করলেই সঙ্গে সঙ্গে জবাব পায়, হেড শপ পর্যন্ত দৌড়াতে হয় না। খাতা যেই আপডেট হয়, শাখাগুলোর কপিও একটু পরেই মিলে যায়।

কিন্তু বিপদ তো বলে আসে না। এক রাতে হেড শপে আগুন লেগে সব পুড়ে ছাই। ভাগ্যিস করিম একটা নাইট-ওয়াচম্যান রেখেছিল, যে সারা রাত হেড শপের দিকে চোখ রাখে। হেড শপ পুড়তেই সে থেমে থাকে না — সঙ্গে সঙ্গে সবচেয়ে কাছের শাখাটাকে ঘোষণা দিয়ে নতুন হেড শপ বানিয়ে দেয়, বাকি শাখাগুলোকে বলে দেয় এখন থেকে এর খাতা দেখেই কপি করবে। ব্যবসা এক মিনিটও বন্ধ থাকে না। আবার পুরো ক্যাটালগ এত বিশাল যে এক দোকানে সব ধরে না — তাই করিম পণ্য ভাগ করে দেয়: চাল-ডাল-তেল এক শাখায়, প্রসাধনী আরেক শাখায়, ইলেকট্রনিক্স আরেকটায়। কোন জিনিস কোন শাখায় সেটা ঠিক থাকে বলে কাস্টমার সোজা সেই শাখাতেই চলে যায়।

এই গল্পটাই আসলে এই অধ্যায়। শাখাগুলোর হেড শপের খাতা কপি করাটা হলো **replication** (replica-রা primary-র copy রাখে, read সামলায়, HA দেয়), নাইট-ওয়াচম্যানের হেড শপ পুড়লে কাছের শাখাকে নতুন হেড বানানোটা হলো **Sentinel**-এর automatic **failover** (primary মরলে একটা replica-কে promote করা), আর পণ্য ভাগ করে আলাদা শাখায় রাখাটা হলো **Cluster**-এর **sharding** (keyspace শাখা মানে node জুড়ে ভাগ করে দেওয়া)। বাস্তবে Redis ঠিক এভাবেই এক node পেরিয়ে scale করে — Twitter, GitHub-এর মতো বড় সিস্টেম এই তিন স্তর দিয়েই একটা machine-এর সীমা টপকায়।

একটা single Redis node একটা single point of failure এবং memory ও read throughput-এর উপর একটা কঠিন ছাদ। এক node পেরিয়ে scale করা layer-এ layer-এ আসে: copy আর read scaling-এর জন্য replication, automatic failover-এর জন্য Sentinel, এবং machine জুড়ে data sharding-এর জন্য Cluster। প্রতিটা layer ক্ষমতা আর জটিলতা যোগ করে, এবং সেই ক্রমেই যোগ করে। এই অধ্যায় ব্যাখ্যা করে প্রতিটা তোমাকে কী দেয় এবং consistency-তে এর কী খরচ।

## Primary/replica replication

ভিত্তি হলো replication: একটা **primary** (master) write গ্রহণ করে এবং প্রতিটা পরিবর্তন এক বা একাধিক **replica**-তে stream করে, যারা নিজেদের পূর্ণ copy রাখে। replica read serve করে, primary-কে মুক্ত করে, এবং primary মারা গেলে promote হতে প্রস্তুত থাকে।

```text
# On a replica node
127.0.0.1:6380> REPLICAOF 127.0.0.1 6379
OK
127.0.0.1:6380> INFO replication
# Replication
role:slave
master_host:127.0.0.1
master_link_status:up
slave_read_only:1
```

এটা কীভাবে কাজ করে: connect-এ replica একটা full sync করে — primary একটা RDB snapshot fork করে, এটা ship করে, এবং replica এটা load করে। এরপর থেকে primary command-এর একটা continuous replication log stream করে। একটা সংক্ষিপ্ত disconnect একটা full-এর বদলে একটা backlog buffer থেকে একটা _partial_ resync trigger করে।

গুরুত্বপূর্ণ বৈশিষ্ট্য হলো যে **replication asynchronous**। primary replica write receive করেছে নিশ্চিত করার _আগেই_ client-কে একটা write acknowledge করে। এটা write দ্রুত রাখে কিন্তু মানে একটা replica সামান্য পিছিয়ে থাকতে পারে, এবং একটা primary যে crash করে সে তার শেষ কয়েকটা write নিয়ে যেতে পারে।

Replication তোমাকে যা দেয়:

- **Read scaling** — read-ভারী traffic replica-তে নির্দেশ করো (এই মেনে নিয়ে যে এগুলো সামান্য বাসি হতে পারে)।
- **Data redundancy** — আরেকটা machine-এ একটা পূর্ণ live copy।
- **একটা failover target** — একটা replica primary-তে promote হতে পারে।

এটা তোমাকে যা _দেয় না_: automatic recovery। যদি primary মারা যায়, একটা replica promote করা এবং client repoint করা manual। সেটা Sentinel-এর কাজ।

<Callout type="info">

**নোট:** যেহেতু replication asynchronous, replica-গুলো **eventually consistent**। primary দ্বারা acknowledge করা একটা write এখনও একটা replica-তে না থাকতে পারে, তাই একটা write-এর ঠিক পরে একটা replica থেকে একটা read বাসি ডেটা ফেরত দিতে পারে। `WAIT numreplicas timeout` command একটা client-কে একটা write N replica-তে পৌঁছানো পর্যন্ত block করতে দেয়, window সরু করে — কিন্তু এটা replication-কে synchronous বানাতে বা ঝুঁকি সম্পূর্ণ দূর করতে পারে না।

</Callout>

## Sentinel: automatic failover

Replication তোমাকে একটা spare দেয়; Sentinel swap-টা automatic করে। Sentinel হলো process-এর একটা আলাদা সেট (একটা নির্ভরযোগ্য quorum-এর জন্য তুমি অন্তত তিনটা চালাও) যা primary আর replica monitor করে, primary সত্যিই down কিনা তা নিজেদের মধ্যে সম্মত হয়, একটা replica promote করে, এবং client-দের বলে নতুন primary কোথায়।

```text
# sentinel.conf — monitor a primary named "mymaster", quorum of 2
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
```

failover sequence:

1. **Detection।** একটা Sentinel `PING` reply পাওয়া বন্ধ করে এবং primary-কে _subjectively down_ mark করে।
2. **Agreement।** একবার Sentinel-দের একটা _quorum_ সম্মত হলে, primary _objectively down_ — quorum একটা Sentinel-এর খারাপ network-কে একটা অপ্রয়োজনীয় failover trigger করা থেকে রোধ করে।
3. **Election।** Sentinel-রা failover চালাতে একটা leader নির্বাচন করে।
4. **Promotion।** একটা উপযুক্ত replica promote হয়; বাকিগুলো এটা থেকে replicate করতে reconfigure হয়।
5. **Notification।** client-রা, একটা Sentinel-aware library ব্যবহার করে, Sentinel-কে current primary address জিজ্ঞেস করে এবং reconnect করে।

Sentinel **high availability** সামলায় কিন্তু sharding নয় — প্রতিটা node এখনও পুরো dataset ধরে, তাই তোমার ডেটা এক machine-এ ধরতে হবে। যখন ধরে না, তোমার Cluster দরকার।

## Cluster: node জুড়ে sharding

Cluster mode একাধিক primary জুড়ে ডেটা partition করে যাতে মোট dataset যেকোনো single machine-এর memory ছাড়াতে পারে এবং write horizontally scale করে। mechanism হলো **hash slot**: keyspace একটা fixed **16384** slot-এ ভাগ হয়, প্রতিটা slot একটা primary-র মালিকানায়।

```text
127.0.0.1:7000> CLUSTER INFO
cluster_enabled:1
cluster_state:ok
cluster_known_nodes:6
cluster_slots_assigned:16384
127.0.0.1:7000> CLUSTER KEYSLOT user:1042
(integer) 8326
127.0.0.1:7000> SET user:1042 "Lubna"
-> Redirected to slot [8326] located at 127.0.0.1:7001
OK
```

একটা key-এর slot হলো `CRC16(key) mod 16384`। একটা key খুঁজতে, একটা client এটা hash করে, দেখে কোন node সেই slot-এর মালিক, এবং সরাসরি সেই node-এর সাথে কথা বলে — hot path-এ কোনো proxy নেই। যদি একটা client ভুল node-এ আঘাত করে সে একটা `MOVED` redirect পায় যা সঠিকটা বলে দেয়; স্মার্ট client slot map cache করে এবং এরপর সঠিকভাবে route করে। প্রতিটা primary-র সাধারণত নিজের একটা replica থাকে, তাই Cluster HA-ও দেয় — failover built-in, কোনো আলাদা Sentinel দরকার নেই।

### Multi-key operation আর hash tag

Sharding-এর একটা আসল খরচ আছে: কয়েকটা key ছোঁয়া একটা command শুধু তখনই কাজ করে যদি সেই key-গুলো **একই** slot-এ থাকে, কারণ কোনো single node এদের সবাইকে দেখে না। `MGET a b c`, `SINTER`, আর multi-key Lua script slot জুড়ে fail করে। **Hash tag** braces-এর ভেতরের অংশটাই শুধু hash করে সম্পর্কিত key-গুলোকে এক slot-এ বাধ্য করে:

```text
# Both keys hash on "{1042}" -> same slot -> multi-key ops work
127.0.0.1:7000> MSET user:{1042}:name "Lubna" user:{1042}:email "lubna@x.com"
OK
127.0.0.1:7000> CLUSTER KEYSLOT user:{1042}:name
(integer) 5439
127.0.0.1:7000> CLUSTER KEYSLOT user:{1042}:email
(integer) 5439
```

যেকোনো group-এর জন্য যা তোমাকে একসাথে পড়তে বা modify করতে হবে সেটার জন্য _আগেভাগে_ hash tag দিয়ে তোমার key design করো — পরে এগুলো retrofit করা মানে ডেটা সরানো।

<Callout type="warning">

**নোট:** Cluster শুধু deployment নয়, programming model বদলায়। Cross-slot multi-key command আর transaction সীমাবদ্ধ, কিছু client-এর অতিরিক্ত logic দরকার, এবং `KEYS` বা `SCAN`-এর মতো অপারেশন একবারে শুধু এক node দেখে। শুধু high availability-র জন্য Cluster enable করো না — Sentinel সেটা এসব সীমাবদ্ধতা ছাড়াই করে। Cluster শুধু তখনই ব্যবহার করো যখন একটা machine সত্যিই তোমার ডেটা ধরতে বা তোমার write rate serve করতে পারে না।

</Callout>

## Consistency trade-off

এখানকার প্রতিটা layer asynchronous replication-এর উপর নির্মিত, তাই কোনোটাই strong consistency দেয় না। সৎ model হলো:

- **একটা failover সম্প্রতি acknowledge করা write হারাতে পারে।** যদি primary একটা write গ্রহণ করে, এখনও এটা replicate করেনি, এবং তারপর মারা যায়, promote করা replica সেই write কখনো পায়নি। এটা চলে গেছে।
- **Split-brain সম্ভব।** একটা partition-এর সময় একটা পুরনো primary তার দিকের client থেকে write গ্রহণ করতে থাকতে পারে যতক্ষণ না এটা লক্ষ্য করে যে এটা প্রতিস্থাপিত হয়েছে; সেই write-গুলো যখন এটা আবার যোগ দেয় তখন বাতিল হয়। `min-replicas-to-write` যথেষ্ট replica connected না থাকলে write প্রত্যাখ্যান করে এটা কমায়।
- **Replica থেকে read বাসি** কিছু ছোট, পরিবর্তনশীল পরিমাণে।

এটা standard CAP trade-off: একটা partition-এর অধীনে Redis strict consistency-র চেয়ে availability-কে প্রাধান্য দেয়। cache, session, এবং Redis যাতে ভালো তার বেশিরভাগের জন্য, সেটাই সঠিক trade — একটা বিরল failover-এর সময় শেষ কয়েকটা write হারানো গ্রহণযোগ্য। যদি একটা নির্দিষ্ট ডেটার জন্য এটা গ্রহণযোগ্য _না_ হয়, সেই ডেটা সম্ভবত strong consistency-র জন্য design করা একটা system-এ থাকা উচিত, Redis এর সামনে cache করে।

## কখন তোমার সত্যিই clustering দরকার

সংখ্যাগুলো দাবি না করা পর্যন্ত scaling জটিলতা প্রতিহত করো। একটা ব্যবহারিক সিঁড়ি:

1. **Single instance** — বেশিরভাগ application একটা ভালোভাবে-মাপা Redis-কে কখনো ছাড়িয়ে যায় না। এখানে শুরু করো।
2. **একটা replica যোগ করো** যখন তোমার read scaling বা একটা warm standby দরকার।
3. **Sentinel যোগ করো** যখন একটা manual failover থেকে downtime অগ্রহণযোগ্য এবং ডেটা এখনও এক machine-এ ধরে।
4. **Cluster গ্রহণ করো** শুধু তখনই যখন dataset সত্যিই এক machine-এর RAM ছাড়ায়, বা write throughput এক primary ছাড়ায় — এবং তুমি multi-key সীমাবদ্ধতা নিয়ে বাঁচতে পারো।

প্রতিটা ধাপ operational বোঝা যোগ করে। শুধু তোমার প্রকৃত constraint যতটা দাবি করে ততটাই উঁচুতে ওঠো; অকাল clustering এমন জটিলতা কেনে যার মূল্য তুমি রাত ৩টায় দেবে।
