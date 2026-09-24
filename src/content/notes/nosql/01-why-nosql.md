---
title: 'Why NoSQL'
subtitle: 'relational database কোথায় scale-এ চাপে পড়ে, চারটি NoSQL পরিবার, ACID বনাম BASE, আর যেসব ক্ষেত্রে NoSQL ভুল উত্তর।'
chapter: 1
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['nosql', 'base', 'cap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা ছোট শহরের post office প্রতিটা চিঠি হাতে হাতে একটা master address book-এর সাথে মিলিয়ে সাজায় — নির্ভুল, consistent, একটা শহরের জন্য নিখুঁত। এখন কল্পনা করো, পৃথিবীর প্রতিটা চিঠি সেই একজন কেরানি আর একটা বইয়ের মধ্য দিয়ে route করা হচ্ছে। সিস্টেমটা ভুল নয়; এটা শুধু scale করে না। NoSQL হলো তখনই যা ঘটে, যখন তুমি মেনে নাও যে কোনো একজন কেরানি গোটা পৃথিবী ধরে রাখতে পারবে না, তাই তুমি কাজটা অনেকগুলো office-এ ভাগ করে দাও — আর মেনে নাও যে দুটো office হয়তো কিছুক্ষণের জন্য একটা forwarding address নিয়ে দ্বিমত করতে পারে।

</Callout>

## গল্পে বুঝি

ধরো, খোয়ারিজমির একটা সরকারি সেবাকেন্দ্র। সেখানে সবার তথ্য নেওয়া হয় একটা ছাপানো ফর্মে — নাম, বাবার নাম, জন্মতারিখ, ঠিকানা, ঠিক এই কয়টা ঘর, এর বেশিও না কমও না। যতক্ষণ সবাই মোটামুটি একই রকম তথ্য নিয়ে আসছে, ততক্ষণ ফর্মটা দারুণ কাজ করে — সব গোছানো, মিলিয়ে দেখা সহজ। কিন্তু ভিড় বাড়তে বাড়তে সমস্যা শুরু হয়। কেউ এসে বলে তার দুটো ঠিকানা, কারও আবার জন্মতারিখই নেই, কারও সাথে একটা পুরনো মামলার কাগজ, কারও বিদেশি পাসপোর্ট। ছাপানো ফর্মে তো এসব ঘর নেই! খোয়ারিজমি হয় লোকটাকে ফিরিয়ে দেয়, নয়তো ফর্মের কোণায় কষ্ট করে হিজিবিজি লিখে রাখে। প্রতিবার নতুন ধরনের তথ্য এলেই গোটা ফর্ম নতুন করে ছাপাতে হয় — যন্ত্রণাদায়ক আর ধীর।

পাশের কেন্দ্রে ফাতিমা অন্যভাবে কাজ করে। তার হাতে ছাপানো ফর্ম নেই, আছে একটা সাদা খাতা। প্রতিটা লোকের জন্য সে যা যা দরকার তাই লিখে নেয় — একজনের জন্য তিন লাইন, আরেকজনের জন্য পুরো এক পাতা, কারও সাথে ছবি আঠা দিয়ে সেঁটে দেয়। কোনো ঘর ফাঁকা রাখার বালাই নেই, নতুন কিছু এলে শুধু লিখে ফেললেই হলো। আর ভিড় যখন এত বেশি যে ফাতিমা একা সামলাতে পারছে না, তখন সে কেন্দ্র বদলায় না — পাশে আরও দশটা কাউন্টার বসিয়ে দেয়, প্রতিটাতে একজন করে কেরানি, ভিড়টা সবাই মিলে ভাগ করে নেয়।

এই গল্পটাই আসলে **SQL বনাম NoSQL**। খোয়ারিজমির ছাপানো ফর্ম হলো relational database-এর কঠোর **schema** — আগে থেকে ঠিক করা ঘর, একই আকারের সব record, যা বদলানো ব্যয়বহুল আর বৈচিত্র্যময় তথ্যে হোঁচট খায়। ফাতিমার সাদা খাতা হলো **schema-less** NoSQL — প্রতিটা entry দেখতে আলাদা হতে পারে, flexible structure। আর ভিড় বাড়লে একটা কেরানিকে আরও শক্তিশালী না করে বাড়তি কাউন্টার বসানোই হলো **horizontal scaling** — এক মেশিনকে বড় করার বদলে অনেক মেশিনে কাজ ভাগ করা, যেখানে single-server SQL চাপে পড়ে। তবে trade-off আছে: খাতায় সব আলাদা বলে "সব ঠিকানা এক ছাঁচে আছে তো?" — এই কড়া নিশ্চয়তা (join, strong consistency) খানিকটা ছাড়তে হয়, বদলে মেলে flexibility আর scale। বাস্তবে Amazon বা Facebook-এর মতো সাইট ঠিক এই কারণেই বিপুল, বৈচিত্র্যময় ডেটার জন্য NoSQL-এ যায় — যেখানে জমা-টাকা লেনদেনের মতো কড়া অংশে এখনও relational-ই থেকে যায়।

## Relational কোথায় সীমায় পৌঁছায়

Relational database চমৎকার। এগুলো তোমাকে একটা flexible query language, strong consistency, আর কয়েক দশকের tooling দেয়। সমস্যাগুলো দেখা দেয় **scale**-এর চরম প্রান্তে আর **relational model নিজের** সীমানায়।

**একটা single primary-তে write throughput।** Replication read scale করে, write নয়। প্রতিটা write এখনও একটা primary node দিয়ে চুইয়ে যায়। যখন একটা মেশিন আর write volume শুষে নিতে পারে না, তখন তোমাকে shard করতেই হবে — আর SQL database sharding-কে যন্ত্রণাদায়ক করে তোলে কারণ cross-shard join আর transaction কঠিন।

**কঠোর schema।** একটা billion-row টেবিলে একটা column বদলাতে গেলে সেটা অনেকক্ষণ lock হয়ে থাকতে পারে। যেসব application দ্রুত বিবর্তিত হয়, বা যেগুলো ভিন্ন ভিন্ন ধরনের record রাখে, তারা schema-র সাথে অনবরত লড়াই করে।

**object-relational mismatch।** তোমার application nested object-এ চিন্তা করে; relational model চিন্তা করে flat, normalized টেবিলে। একটা logical object আবার জোড়া লাগাতে গেলে প্রতিটা read-এ পাঁচটা টেবিল join করতে হতে পারে।

**কিছু data tabular নয়।** গভীরভাবে সংযুক্ত data (social graph, recommendation network) recursive join-এর দুঃস্বপ্নে পরিণত হয়। Time-series আর append-heavy log row-oriented storage-এ চাপ ফেলে।

NoSQL database relational model-এর কিছু অংশ — join, একটা সমৃদ্ধ query language, strong consistency, বা একটা fixed schema — ছেড়ে দিয়ে বদলে জিতে নেয় **horizontal scalability**, **flexible structure**, বা **specialized access pattern**।

## চারটি পরিবার

NoSQL হলো চারটি সত্যিকারের ভিন্ন design-এর ওপর একটা ছাতা।

| পরিবার      | Data-র আকার                                          | Lookup যেভাবে              | উদাহরণ                        | কীসের জন্য সেরা              |
| ----------- | ---------------------------------------------------- | -------------------------- | ----------------------------- | ---------------------------- |
| Key-value   | একটা key-এর পেছনে opaque value                       | Exact key                  | Redis, DynamoDB, Memcached    | Cache, session, counter      |
| Document    | Self-contained JSON document                         | Key বা indexed field       | MongoDB, Couchbase, Firestore | বিবর্তিত entity, content     |
| Wide-column | dynamic column-এর row, partition অনুযায়ী গোষ্ঠীবদ্ধ | Partition + clustering key | Cassandra, Bigtable, ScyllaDB | বিশাল write, time-series     |
| Graph       | edge দিয়ে সংযুক্ত node                              | একটা node থেকে traversal   | Neo4j, Neptune, JanusGraph    | relationship, recommendation |

একটা গুরুত্বপূর্ণ পার্থক্য: key-value, document, আর wide-column store হলো **aggregate-oriented**। এরা প্রতিটা key-এর জন্য একটা self-contained data-র chunk রাখে আর যতক্ষণ তুমি সেই key দিয়ে access করো ততক্ষণ খুশি। Graph database এর উল্টো — এগুলো পুরোপুরি record-গুলোর _মধ্যেকার_ সংযোগকে ঘিরে তৈরি।

## ACID বনাম BASE

Relational database **ACID** transaction-এর প্রতিশ্রুতি দেয়:

- **Atomicity** — একটা transaction হয় পুরোপুরি সম্পন্ন হয় নয়তো পুরোপুরি roll back করে।
- **Consistency** — প্রতিটা transaction database-কে একটা valid state থেকে আরেকটায় নিয়ে যায় (constraint বজায় থাকে)।
- **Isolation** — একই সময়ে চলা transaction একে অপরের আংশিক কাজ দেখে না।
- **Durability** — একবার commit হয়ে গেলে data crash-এও টিকে থাকে।

অনেক distributed NoSQL store বদলে **BASE** গ্রহণ করে, যা একটা কড়া সংজ্ঞা কম, বরং একটা দর্শন বেশি:

- **Basically Available** — সিস্টেম আংশিক failure-এর সময়েও request-এর উত্তর দেয়, হয়তো stale data দিয়ে।
- **Soft state** — নতুন write ছাড়াও state সময়ের সাথে বদলাতে পারে, যেহেতু replica converge করে।
- **Eventually consistent** — নতুন কোনো write না থাকলে, সব replica শেষমেশ একমত হবে।

এই trade-off-এর কারণ হলো **CAP theorem**: যখন একটা network partition তোমার cluster-কে ভাগ করে দেয় (এই `P`, যেটা একটা distributed system-এ তুমি এড়াতে পারবে না), তখন তোমাকে বেছে নিতে হবে **Consistency** (stale data পরিবেশনের বদলে request reject করা) আর **Availability** (পরিবেশন চালিয়ে যাওয়া, সাময়িক দ্বিমত মেনে নেওয়া)-র মধ্যে। ACID system consistency-র দিকে ঝোঁকে; ক্লাসিক BASE system availability-র দিকে ঝোঁকে।

<Callout type="tip">

**নোট:** আধুনিক NoSQL কদাচিৎ পুরোপুরি সব-অথবা-কিছুই-না। DynamoDB, Cassandra, আর MongoDB সবাই _tunable_ consistency দেয় — তুমি প্রতিটা operation-এর জন্য বেছে নাও যে তুমি একটা দ্রুত, সম্ভবত-stale read চাও নাকি একটা ধীর, strongly-consistent read। CAP একটা constraint, স্থায়ী কোনো product label নয়। tunable consistency আমরা chapter 7-এ গভীরভাবে দেখব।

</Callout>

## একটা বাস্তব trade-off

একটা global shopping cart কল্পনা করো। strong consistency-র সাথে, Tokyo-র একজন user আর Virginia-র একটা server সবসময় হুবহু একই cart দেখে — কিন্তু Tokyo-র user প্রতিটা read-এ একটা cross-Pacific round trip-এর জন্য অপেক্ষা করে। eventual consistency-র সাথে, Tokyo-র read সাথে সাথে একটা কাছের replica-তে গিয়ে লাগে, এই ঝুঁকিতে যে আরেকটা tab-এ এক সেকেন্ড আগে যোগ করা একটা item এখনও propagate হয়নি।

```text
Strongly consistent read:   correct now, ~150ms cross-region latency
Eventually consistent read: ~5ms local latency, may be a few seconds stale
```

একটা shopping cart-এর জন্য, eventual consistency সাধারণত ঠিক আছে — checkout-এর সময় একটা "merge carts" step যেকোনো অমিল ঠিক করে দেয়। শেষের "charge this card" step-এর জন্য, তুমি strong consistency চাও। শিক্ষাটা: consistency হলো একটা _per-operation_ business সিদ্ধান্ত, database জুড়ে কোনো ধর্ম নয়।

## কখন NoSQL ব্যবহার করবে না

NoSQL কোনো default upgrade নয়। relational-এর দিকে হাত বাড়াও যখন:

- **তোমার data সত্যিই relational আর query ad hoc।** যদি তোমাকে column-এর যেকোনো combination দিয়ে data slice করতে হয় আর আগে থেকে প্রশ্নগুলো অনুমান করতে না পারো, তাহলে SQL-এর query planner ঠিক সেই টুল যা তুমি চাও।
- **তোমার multi-record ACID transaction দরকার।** দুটো account-এর মধ্যে টাকা transfer করা, একটা order তৈরি করার সময় inventory কমানো — এগুলো সত্যিকারের atomic transaction চায়। কিছু NoSQL store এখন সীমিত transaction দেয়, কিন্তু SQL এটা সবচেয়ে ভালো করে।
- **তোমার scale মাঝারি।** একটা ভালোভাবে indexed PostgreSQL instance প্রতি সেকেন্ডে হাজার হাজার transaction আর terabyte পরিমাণ data সামলায়। বেশিরভাগ application কখনো এর সীমা ছাড়ায় না। "scale-এর জন্য তৈরি থাকতে" NoSQL গ্রহণ করলে প্রায়ই শুধু operational যন্ত্রণা যোগ হয় যেটা তোমার কখনো দরকারই ছিল না।
- **strong consistency আর referential integrity write throughput-এর চেয়ে বেশি জরুরি।** Foreign key, unique constraint, আর `CHECK` clause database layer-এ এমন bug ধরে যেগুলো NoSQL তোমার application code-এ ঠেলে দেয়।

<Callout type="warning">

**সতর্কতা:** সবচেয়ে সাধারণ NoSQL ব্যর্থতা হলো একটা document বা wide-column store গ্রহণ করে তারপর সেটাকে একটা relational database-এর মতো ব্যবহার করার চেষ্টা করা — application code-এ join emulate করা, unindexed field-এ query করা, আর ad-hoc flexibility আশা করা। তুমি NoSQL-এর সব constraint পাও কিন্তু কোনো সুবিধা পাও না। যদি আগে থেকে তোমার access pattern না জানো, সেটা একটা জোরালো ইঙ্গিত যে এখনকার মতো তোমার relational-এই থাকা উচিত।

</Callout>

## আসল সিদ্ধান্ত

সৎ প্রশ্নটা "SQL নাকি NoSQL" নয় বরং "**এই নির্দিষ্ট workload-এর সাথে কোন store মানানসই?**" একটা single product প্রায়ই কয়েকটা ব্যবহার করে: order-এর জন্য PostgreSQL, session-এর জন্য Redis, search-এর জন্য Elasticsearch, recommendation graph-এর জন্য Neo4j। এটাই **polyglot persistence**, আর এটা শেষ chapter-এর বিষয়। আপাতত, একটা নিয়ম মাথায় গেঁথে নাও: workload বোঝার পরে store বেছে নাও, কখনো আগে নয়।
