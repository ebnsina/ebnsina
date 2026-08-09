---
title: 'কনসিস্টেন্সি আর CAP'
subtitle: 'CAP আসলে কী বলে আর কী বলে না, PACELC-র সৎ হিসাব, consistency model-এর সিঁড়ি, quorum, conflict resolution আর isolation level — কোন ফিচারে ঠিক কতটুকু গ্যারান্টি সত্যিই দরকার।'
chapter: 13
level: 'intermediate'
readingTime: '২১ মিনিট'
topics: ['CAP', 'PACELC', 'consistency', 'eventual consistency', 'quorum', 'isolation levels']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

চ্যাপ্টার ১০-এ ডেটাবেস স্কেল করতে গিয়ে আমরা একটা সমস্যায় হোঁচট খেয়েছিলাম আর সেটাকে "পরে দেখব" বলে সরিয়ে রেখেছিলাম — replication lag। ইউজার প্রোফাইল আপডেট করল, পেজ রিলোড করল, আর পুরনো নামটাই দেখল, কারণ read গেছে এমন একটা replica-তে যেখানে write টা তখনো পৌঁছায়নি। চ্যাপ্টার ১১-তে queue নিয়ে কাজ করতে গিয়ে at-least-once delivery আর idempotency-র মুখোমুখি হয়েছি — একই মেসেজ দুবার এলে কী হবে। চ্যাপ্টার ৯-এ stateless সার্ভার বানাতে গিয়ে sticky session ছেড়ে দিয়েছি।

এই তিনটে সমস্যার নিচে আসলে একটাই প্রশ্ন লুকিয়ে আছে: **একটা distributed সিস্টেমে "এখনকার সঠিক ভ্যালু" বলতে ঠিক কী বোঝায়, আর সেটা জানতে আপনি কতটা দাম দিতে রাজি?**

এই চ্যাপ্টারটা সেই প্রশ্নের তত্ত্ব। এটা এই ব্যান্ডের সবচেয়ে কঠিন চ্যাপ্টার, আর পরের চ্যাপ্টারের capstone প্রজেক্টে (একটা social feed) আপনি এখানকার প্রতিটা সিদ্ধান্ত হাতে-কলমে নেবেন। সাথে সাথে এটা একটা myth ভাঙার চ্যাপ্টারও — কারণ CAP theorem নিয়ে ইন্টারভিউতে আর ব্লগপোস্টে যা বলা হয়, তার বেশিরভাগই ভুল।

## গল্পে বুঝি

সমরকন্দে ইবনে সিনার একটা পুরনো money-changing house আছে — দুটো শাখা। একটা শহরের ভেতরে, বড় বাজারের পাশে; আরেকটা পাহাড়ের ওপারে বুখারার পথে, কাফেলাগুলো যেখানে থামে। দুই শাখাতেই একই খাতা রাখা হয়: কে কত জমা রেখেছে, কে কত তুলেছে। খাতা দুটো মেলানো হয় একজন কুরিয়ারের মাধ্যমে — প্রতিদিন ভোরে সে ঘোড়া নিয়ে পাহাড়ের গিরিপথ পেরিয়ে যায়, আগের দিনের সব এন্ট্রি পৌঁছে দেয়, আর ফেরার পথে অন্য শাখার এন্ট্রিগুলো নিয়ে আসে।

স্বাভাবিক দিনে ব্যবস্থাটা চমৎকার চলে। আল-কিন্দি শহরের শাখায় এসে একশো দিনার জমা রাখলেন। কেরানি খাতায় তুলল, রসিদ দিল, আল-কিন্দি চলে গেলেন। পরদিন ভোরে কুরিয়ার সেই এন্ট্রি পাহাড়ের ওপারে নিয়ে গেল। এখন দুই শাখাই জানে আল-কিন্দির একশো দিনার আছে। এক দিনের একটা ফাঁক ছিল, কিন্তু কেউ টেরই পায়নি।

তারপর শীত এল, আর গিরিপথ বরফে বন্ধ হয়ে গেল। কুরিয়ার যেতে পারছে না। দুই শাখা এখন সম্পূর্ণ বিচ্ছিন্ন — কেউ জানে না অন্য শাখায় কী ঘটছে। এই মুহূর্তে প্রতিটা শাখার ম্যানেজারকে একটা সিদ্ধান্ত নিতে হবে, আর সিদ্ধান্তটা কোনো টেকনিক্যাল সিদ্ধান্ত নয় — ব্যবসায়িক।

পাহাড়ের ওপারের শাখার ম্যানেজার মরিয়ম আল-আসতুরলাবি প্রথম পথটা বেছে নিলেন। তিনি দরজায় নোটিশ টাঙিয়ে দিলেন: "কুরিয়ার না আসা পর্যন্ত টাকা তোলা বন্ধ।" আল-রাযি এসে তিরিশ দিনার তুলতে চাইলেন, মরিয়ম বললেন — "আপনার খাতায় পঞ্চাশ দিনার আছে ঠিকই, কিন্তু গত তিন দিনে আপনি শহরের শাখা থেকে কিছু তুলেছেন কিনা আমি জানি না। ভুল হিসাবে টাকা দেওয়ার চেয়ে না দেওয়া ভালো।" আল-রাযি বিরক্ত হয়ে ফিরে গেলেন। মরিয়মের শাখা কোনো ভুল করেনি, কিন্তু সে কয়েক সপ্তাহ ধরে কার্যত অচল রইল।

শহরের শাখার ম্যানেজার ফাতিমা আল-ফিহরি উল্টো পথ নিলেন। তিনি দরজা খোলা রাখলেন। "খাতায় যা লেখা আছে, সেই অনুযায়ী কাজ চলবে। খাতাটা হয়তো তিন দিনের পুরনো, কিন্তু ব্যবসা বন্ধ করার চেয়ে ঝুঁকিটা কম।" আল-রাযি এসে ওখান থেকেই তিরিশ দিনার তুলে নিলেন। ফাতিমার শাখা সচল থাকল, খদ্দের খুশি থাকল — কিন্তু ফাতিমা এখন নিশ্চিত নন যে তাঁর খাতা সত্যি বলছে।

বসন্তে বরফ গলল, কুরিয়ার আবার চলা শুরু করল, আর তখনই আসল ঝামেলাটা বেরিয়ে এল। বিচ্ছিন্ন থাকার সময় আল-বিরুনি **দুই শাখাতেই** গিয়েছিলেন — শহরের শাখা থেকে চল্লিশ দিনার তুলেছেন, পাহাড়ের শাখার খাতাতেও একটা এন্ট্রি আছে যে তিনি ষাট দিনার জমা দিয়েছেন। দুটো খাতা এখন দুটো আলাদা গল্প বলছে। কুরিয়ার মিলিয়ে দিতে বসল, কিন্তু মেলাবে কীভাবে? সবচেয়ে সহজ নিয়ম — "যে এন্ট্রির সময় বেশি নতুন, সেটাই থাকবে, অন্যটা বাদ" — কাগজে সহজ শোনায়, কিন্তু এতে আল-বিরুনির একটা পুরো লেনদেন নিঃশব্দে হাওয়া হয়ে যায়, আর কেউ কোনোদিন জানবেও না। বুদ্ধিমান কুরিয়ার তাই অন্য কিছু করে: দুটো এন্ট্রিই রাখে, কারণ জমা আর উত্তোলন পরস্পরবিরোধী নয় — এদের যোগ করা যায়। কিন্তু "এই অ্যাকাউন্টের মালিকের নাম কী" নিয়ে দুই খাতায় দুই রকম লেখা থাকলে যোগ করার উপায় নেই; তখন হয় একজন মানুষকে ডেকে জিজ্ঞেস করতে হয়, নয়তো একটা নিয়ম বানিয়ে একটাকে জেতাতে হয় আর অন্যটা হারাতে হয়।

আর সবচেয়ে মজার ব্যাপারটা হলো — গিরিপথ যখন **খোলা**, তখনও একটা দাম দিতে হয়। ইবনে সিনা চাইলে নিয়ম করতে পারতেন: "কোনো শাখা কোনো লেনদেন তখনই চূড়ান্ত করবে যখন অন্য শাখা থেকে লিখিত সম্মতি আসবে।" এতে দুই খাতা কখনো আলাদা হতো না, কোনো conflict-ই থাকত না। কিন্তু তার মানে প্রতিটা খদ্দেরকে একদিন অপেক্ষা করতে হতো, কারণ কুরিয়ারের যাওয়া-আসাতেই দিন লেগে যায়। বরফ পড়ুক বা না পড়ুক, দূরত্ব নিজেই একটা দাম — আর এই দামটা ইবনে সিনাকে প্রতিদিন দিতে হতো, বছরে দুই সপ্তাহ নয়।

মিলিয়ে নিই: দুই শাখা হলো দুটো **replica**, কুরিয়ার হলো **replication**, বরফে বন্ধ গিরিপথ হলো **network partition**। মরিয়মের "কুরিয়ার না এলে সার্ভিস বন্ধ" হলো **CP** — partition-এর সময় consistency বাঁচাতে availability ছেড়ে দেওয়া। ফাতিমার "পুরনো খাতা ধরেই চলুক" হলো **AP** — availability বাঁচাতে consistency ছেড়ে দেওয়া। আল-বিরুনির দুই খাতায় দুই গল্প হলো **conflict**, "নতুনটা জিতবে" নিয়মটা হলো **last-write-wins** আর তাতে হারানো লেনদেনটা হলো **silent data loss**; জমা-উত্তোলন যোগ করে ফেলা হলো **CRDT**-র মূল বুদ্ধি, আর মানুষ ডেকে জিজ্ঞেস করা হলো **application-level merge**। আর গিরিপথ খোলা থাকা সত্ত্বেও প্রতিটা লেনদেনে একদিন অপেক্ষা করার সেই দামটাই হলো **PACELC**-র "else" অংশ — যেটা আপনি বছরের ৯৯.৯৯% সময় দিয়ে যাচ্ছেন, অথচ CAP নিয়ে আলোচনায় সেটার নামই ওঠে না।

## CAP theorem, নির্ভুলভাবে

CAP নিয়ে সবচেয়ে প্রচলিত বাক্যটা হলো — "Consistency, Availability, Partition tolerance — তিনটার মধ্যে দুটো বেছে নাও।" এই বাক্যটা এত ভুল যে এটা মনে রাখার চেয়ে ভুলে যাওয়া ভালো।

আসল উপপাদ্যটা (Gilbert আর Lynch, ২০০২) অনেক সংকীর্ণ আর অনেক নির্দিষ্ট। শব্দগুলোর মানে আগে ঠিক করি:

- **C (Consistency)** — এখানে consistency মানে **linearizability**। অর্থাৎ পুরো distributed সিস্টেমটা বাইরে থেকে দেখতে ঠিক একটা সিঙ্গল কপির মতো আচরণ করবে: একটা write সফল হওয়ার পরে শুরু হওয়া প্রতিটা read সেই write বা তার পরের কিছু দেখবে, কে কোন নোডে গেল তাতে কিছু যায় আসে না।
- **A (Availability)** — যে নোডটা বেঁচে আছে আর রিকোয়েস্ট পাচ্ছে, সেটা অবশ্যই একটা non-error উত্তর দেবে। "একটু ধীরে দেবে" নয়, "৫০৩ দেবে না" — এটাই শর্ত।
- **P (Partition tolerance)** — নেটওয়ার্ক নোডগুলোর মধ্যে যেকোনো সংখ্যক মেসেজ ইচ্ছেমতো ফেলে দিতে পারে, তাতেও সিস্টেম কাজ করতে থাকবে।

উপপাদ্যটা তখন বলে: **একটা partition চলাকালে আপনি একসাথে linearizable আর available থাকতে পারবেন না।** ব্যস। এর বাইরে এটা আর কিছু বলে না।

<Callout type="warning">

"তিনটার মধ্যে দুটো" কথাটা ভুল, কারণ **P কোনো পছন্দ নয়** — এটা একটা প্রাকৃতিক ঘটনা। আপনি নেটওয়ার্ককে বলতে পারবেন না "partition কোরো না"। সুইচ পুড়বে, কেবল কাটা পড়বে, একটা ভুল BGP আপডেট দুটো ডেটাসেন্টারকে আলাদা করে দেবে, একটা GC pause একটা নোডকে ১৫ সেকেন্ডের জন্য "মৃত" বানিয়ে দেবে। তাই একাধিক মেশিনে চলা প্রতিটা সিস্টেমই বাধ্য হয়ে P। আসল পছন্দটা হলো **CP না AP**, আর সেটাও শুধু **যতক্ষণ partition চলছে ততক্ষণের জন্য**।

</Callout>

<Mermaid
title="What CAP actually constrains"
code={`graph TD
  N["Network partition happens<br/>not optional, not preventable"] --> Q["A node cannot reach its peers"]
  Q --> CP["CP choice<br/>refuse the request<br/>return error or block<br/>stay linearizable"]
  Q --> AP["AP choice<br/>answer from local state<br/>stay available<br/>accept divergence"]
  CP --> R1["Cost: downtime for the<br/>minority side"]
  AP --> R2["Cost: conflicts to resolve<br/>when the partition heals"]`}
/>

আরেকটা জিনিস খেয়াল করুন — partition **নেই** এমন সময়ে CAP আপনাকে কিছুই বলে না। কোনো নিষেধাজ্ঞা নেই। partition ছাড়া অবস্থায় একটা সিস্টেম একসাথে consistent আর available দুটোই হতে পারে। অথচ বাস্তব সিস্টেমের জীবনের ৯৯.৯৯% সময় ঠিক সেই অবস্থাতেই কাটে। মানে CAP আপনার সিস্টেমের প্রায় পুরো জীবনটা নিয়ে **নীরব**। এটাই CAP-এর সবচেয়ে বড় সীমাবদ্ধতা, আর এখান থেকেই PACELC আসে।

### "MongoDB CP, Cassandra AP" — এই লেবেলগুলোও ভুল

ইন্টারনেটে ডেটাবেসগুলোকে CP বা AP বাক্সে ফেলে দেওয়া একটা জনপ্রিয় খেলা। বাস্তবে বেশিরভাগ আধুনিক ডেটাবেস **কনফিগারযোগ্য**, এমনকি একই ক্লাস্টারে query-ভিত্তিক:

- Cassandra-তে আপনি per-query consistency level দেন। `ONE` মানে AP আচরণ, `QUORUM` মানে অনেকটা CP আচরণ, `ALL` মানে কার্যত এক নোড পড়লেই সব বন্ধ।
- MongoDB-তে `writeConcern` আর `readConcern` মিলিয়ে আপনি linearizable read থেকে শুরু করে "যা পাই তাই" পর্যন্ত পুরো স্পেকট্রামে ঘুরতে পারেন।
- DynamoDB প্রতিটা read-এ জিজ্ঞেস করে আপনি strongly consistent read চান নাকি eventually consistent — দ্বিতীয়টা অর্ধেক দামে আর কম latency-তে।

তাই সঠিক প্রশ্নটা "এই ডেটাবেসটা কি CP" নয়। সঠিক প্রশ্ন — **"এই নির্দিষ্ট query-টা কোন গ্যারান্টি চায়, আর আমি সেটা কীভাবে কনফিগার করব?"**

## PACELC: সৎ সম্প্রসারণ

Daniel Abadi-র PACELC ব্যাপারটাকে দুই ভাগে ভাগ করে, আর ভাগটা এতটাই স্পষ্ট যে একবার শুনলে আর ভোলা যায় না:

> **if (P)artition, then (A)vailability or (C)onsistency; (E)lse, (L)atency or (C)onsistency.**

প্রথম অংশটা CAP-ই — partition-এর সময় availability না consistency। দ্বিতীয় অংশটা নতুন এবং অনেক বেশি প্রাসঙ্গিক: **partition না থাকলেও** আপনাকে বেছে নিতে হয় — latency না consistency।

কারণটা সরল পদার্থবিদ্যা। একটা write-কে যদি একাধিক replica-তে (বিশেষত একাধিক রিজিয়নে) নিশ্চিত করতে হয় তার আগেই ack দেওয়া যাবে না, তাহলে সেই write-এর latency-তে অন্তত একটা cross-node round trip যোগ হবেই। সমরকন্দ থেকে কর্ডোবা একটা রাউন্ড ট্রিপ ১৫০ মিলিসেকেন্ড — সেটা কোনো কোড অপটিমাইজেশনে কমবে না।

| সিস্টেম                                             | Partition হলে           | Partition না থাকলে                  |
| --------------------------------------------------- | ----------------------- | ----------------------------------- |
| DynamoDB (eventual read)                            | PA — উত্তর দিতেই থাকে   | EL — কম latency, stale হতে পারে     |
| Cassandra (`ONE`)                                   | PA                      | EL                                  |
| Cassandra (`QUORUM`)                                | PC — quorum না পেলে ফেল | EC — quorum-এর জন্য অপেক্ষা         |
| Spanner / CockroachDB                               | PC — minority side অচল  | EC — consensus-এর latency মেনে নেয় |
| MongoDB (majority)                                  | PC                      | EC                                  |
| একটা সাধারণ single-primary Postgres + async replica | PC (primary)            | EL (replica থেকে পড়লে)             |

<Callout type="info">

শেষ সারিটা ভালো করে দেখুন — এটাই সবচেয়ে বেশি দেখা যায় এমন প্রোডাকশন কনফিগারেশন, আর এটাই সবচেয়ে কম বোঝা হয়। একটা async replica-সহ Postgres ক্লাস্টার একই সাথে দুরকম আচরণ করে: primary থেকে পড়লে আপনি strong consistency পান, replica থেকে পড়লে eventual। চ্যাপ্টার ১০-এর replication lag আসলে PACELC-র "EL" শাখাটা বেছে নেওয়ার সরাসরি ফল — আপনি জেনে বা না জেনে latency-র পক্ষে ভোট দিয়েছেন।

</Callout>

## CAP-এর C আর ACID-এর C — এই দুটো শব্দের কোনো সম্পর্ক নেই

এটা distributed systems শেখার পথে সবচেয়ে বড় নামকরণ-দুর্ঘটনা, আর এটা পরিষ্কার না হলে বাকিটা কখনো পরিষ্কার হবে না।

- **ACID-এর C (Consistency)** মানে — একটা transaction ডেটাবেসকে এক valid অবস্থা থেকে আরেক valid অবস্থায় নিয়ে যাবে, অর্থাৎ আপনার ঘোষিত constraint (foreign key, unique, check) ভাঙবে না। এটা মূলত **অ্যাপ্লিকেশন আর স্কিমার invariant** নিয়ে কথা। অনেক গবেষকই বলেন C-টা ACID-এ আসলে শুধু শব্দটাকে উচ্চারণযোগ্য করার জন্য ঢোকানো হয়েছিল।
- **CAP-এর C (Consistency)** মানে — **linearizability**, অর্থাৎ একাধিক কপি থাকা সত্ত্বেও বাইরে থেকে সিস্টেমটাকে একটা কপির মতো দেখাবে। এটা **সময় আর অর্ডারিং** নিয়ে কথা, constraint নিয়ে নয়।

একটা সিস্টেম পুরোপুরি ACID হয়েও non-linearizable হতে পারে (single-node Postgres থেকে একটা async replica পড়া — transaction গুলো নিখুঁত ACID, কিন্তু replica stale)। উল্টোটাও সম্ভব — একটা linearizable key-value store যেখানে কোনো transaction-ই নেই, তাই ACID-এর প্রশ্নই ওঠে না (etcd, ZooKeeper)।

তৃতীয় একটা C-ও আছে যেটা আরও বিভ্রান্তি বাড়ায় — **isolation level**-এর জগতে "consistency" শব্দটা প্রায়ই অন্য অর্থে ব্যবহৃত হয়। এই চ্যাপ্টারের শেষভাগে আমরা isolation আলাদা করেই দেখব, কারণ সেটা একটা **সম্পূর্ণ আলাদা অক্ষ**: CAP/PACELC বলে একটা ডেটার একাধিক কপির মধ্যে সমন্বয়ের কথা, isolation বলে একই ডেটার উপর একাধিক concurrent transaction-এর মধ্যে সমন্বয়ের কথা।

## Consistency model-এর সিঁড়ি

"Strong না eventual" — এই বাইনারিটাও একটা সরলীকরণ। বাস্তবে গ্যারান্টিগুলো একটা সিঁড়ির মতো, উপরে গেলে বেশি নিশ্চয়তা কিন্তু বেশি খরচ, নিচে নামলে সস্তা কিন্তু বেশি চিন্তা করতে হয়।

<Mermaid
title="The consistency model ladder"
code={`graph TD
  L["Linearizable<br/>one global order, real time respected<br/>cost: consensus round trips"] --> S["Sequential<br/>one global order<br/>real time not respected"]
  S --> C["Causal<br/>cause is always seen before effect"]
  C --> RYW["Read your writes<br/>a session sees its own writes"]
  RYW --> MR["Monotonic reads<br/>time never goes backwards in a session"]
  MR --> MW["Monotonic writes<br/>a session writes are applied in order"]
  MW --> E["Eventual<br/>if writes stop, replicas converge<br/>cost: almost nothing"]`}
/>

মাঝের তিনটে — read-your-writes, monotonic reads, monotonic writes — একসাথে **session guarantees** বলা হয়। এগুলোর সৌন্দর্য হলো: এরা global কিছু গ্যারান্টি করে না, শুধু **একজন ইউজারের নিজের অভিজ্ঞতাটা** সঙ্গতিপূর্ণ রাখে। আর বাস্তবে ইউজার ঠিক এটুকুই টের পায়।

| Model            | যা গ্যারান্টি করে                           | যা করে না                 | প্রোডাক্ট উদাহরণ                                                   |
| ---------------- | ------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| Linearizable     | write সফল হওয়ার পর প্রতিটা read সেটা দেখবে | সস্তা হওয়া               | ইনভেন্টরির শেষ একটা সিট বুক করা, distributed lock, leader election |
| Sequential       | সবাই একই ক্রমে সব অপারেশন দেখবে             | ঘড়ির সময় মানা           | একটা replicated state machine-এর কমান্ড লগ                         |
| Causal           | কারণ সবসময় ফলাফলের আগে দেখা যাবে           | সম্পর্কহীন অপারেশনের ক্রম | কমেন্ট থ্রেড — উত্তরের আগে মূল কমেন্ট দেখা যাবে                    |
| Read-your-writes | নিজের write নিজে দেখবে                      | অন্যের write দেখা         | প্রোফাইল এডিট করে সেভ করার পর নিজের প্রোফাইল পেজ                   |
| Monotonic reads  | একবার দেখা ডেটা পরে "উধাও" হবে না           | সর্বশেষ ডেটা পাওয়া       | নোটিফিকেশন লিস্ট স্ক্রল করা                                        |
| Monotonic writes | নিজের write গুলো নিজেদের ক্রমেই বসবে        | অন্যের সাথে ক্রম          | ফাইল আপলোড করে তারপর সেটার ক্যাপশন বদলানো                          |
| Eventual         | write থামলে সবাই একদিন মিলবে                | কখন মিলবে                 | ফলোয়ার কাউন্ট, ভিউ কাউন্ট, সার্চ ইনডেক্স                          |

### Read-your-writes ভাঙার দৃশ্যটা

চ্যাপ্টার ১০-এর সমস্যাটা এবার ঠিক কোথায় ভাঙে সেটা দেখে নিই।

<Mermaid
title="A read-your-writes violation across an async replica"
code={`sequenceDiagram
  participant U as "Al-Kindi browser"
  participant API as "API server"
  participant P as "primary-baghdad-01"
  participant R as "replica-cordoba-02"
  U->>API: "PUT /profile name Al-Kindi al-Baghdadi"
  API->>P: "UPDATE profiles SET name"
  P-->>API: "OK, lsn 4821"
  API-->>U: "200 saved"
  Note over P,R: "replication is async, lag about 300 ms"
  U->>API: "GET /profile 40 ms later"
  API->>R: "SELECT name FROM profiles"
  R-->>API: "old name, applied lsn 4816"
  API-->>U: "200 with the OLD name"
  Note over U: "User thinks the save failed<br/>and clicks save again"
  P->>R: "replicate lsn 4817 to 4821"`}
/>

এখানে কোনো bug নেই। প্রতিটা কম্পোনেন্ট ঠিক যা করার কথা তাই করেছে। যা ভেঙেছে সেটা হলো ইউজারের **মানসিক মডেল** — সে ধরে নিয়েছে "200 saved" মানে পরের read-এ নতুন ডেটা থাকবে। সিস্টেম সেটা কখনো প্রতিশ্রুতি দেয়নি।

### Session guarantee গুলো আসলে কীভাবে বানানো হয়

তিনটে বাস্তব কৌশল আছে, সহজ থেকে কঠিন ক্রমে:

**১. Sticky reads to primary (সবচেয়ে সহজ, সবচেয়ে অপচয়ী).** write করার পর একটা নির্দিষ্ট সময় (ধরুন ১০ সেকেন্ড) ওই ইউজারের সব read primary-তে পাঠান। কুকিতে বা session-এ একটা টাইমস্ট্যাম্প রাখলেই হয়। কাজ করে, লিখতে পাঁচ মিনিট লাগে — কিন্তু প্রচুর read অকারণে primary-তে যায়, আর ঠিক সেই কারণেই আপনি replica বসিয়েছিলেন।

**২. Causal token / version token (সঠিক উত্তর).** write শেষে ডেটাবেস আপনাকে একটা অবস্থান দেয় — Postgres-এ LSN (log sequence number), MySQL-এ GTID, MongoDB-তে operation time। সেটাকে ক্লায়েন্টের session-এ রাখুন। পরের read-এ router প্রতিটা replica-র **applied position** দেখে বেছে নেয়: যার position ওই token-এর সমান বা বেশি, সে নিরাপদ। কেউ যদি এখনো ধরতে না পারে, তখন primary-তে fallback। এতে বেশিরভাগ read replica-তেই থাকে, শুধু write-এর ঠিক পরের কয়েকটা read primary-তে যায়।

**৩. Monotonic reads-ও একই টোকেন দিয়ে.** ক্লায়েন্টের session-এ শুধু write-এর token নয়, **সে যত position পর্যন্ত দেখে ফেলেছে** সেটাও রাখুন, আর প্রতি read-এ দুটোর মধ্যে বড়টা ব্যবহার করুন। এতে ইউজার একবার lsn 4821 দেখে ফেললে তাকে আর কখনো 4816-এ থাকা replica-তে পাঠানো হবে না — সময় পেছনে যায় না।

<Callout type="tip">

Token-টা **ক্লায়েন্টে** রাখবেন না যদি সেটা ইউজার এডিট করতে পারে — কেউ একটা অসম্ভব বড় LSN পাঠিয়ে দিলে আপনার router চিরকাল primary-তে fallback করতে থাকবে, আর সেটা একটা সস্তা DoS। হয় server-side session store-এ রাখুন, নয়তো signed cookie-তে (চ্যাপ্টার ৯-এর stateless session-এর মতোই), আর একটা উপরের সীমা দিয়ে clamp করুন।

</Callout>

## Eventual consistency আর conflict resolution

Eventual consistency-র সংজ্ঞাটা যতটা দুর্বল শোনায়, ততটাই দুর্বল: **যদি নতুন write আসা বন্ধ হয়ে যায়, তাহলে একসময় সব replica একই ভ্যালুতে মিলবে।** কখন মিলবে সেটা বলা নেই, আর মেলার আগে কে কী দেখবে তারও কোনো নিয়ম নেই।

কিন্তু আসল প্রশ্নটা সংজ্ঞায় নেই — **দুটো replica-তে একই key-তে দুটো আলাদা write হয়ে গেলে "মিলবে" মানে কী?** কোনটা জিতবে? এই সিদ্ধান্তটাই conflict resolution, আর এখানেই বেশিরভাগ প্রোডাকশন দুর্ঘটনা ঘটে।

### Last-write-wins এবং কেন এটা নিঃশব্দে ডেটা খায়

সবচেয়ে সহজ নিয়ম: প্রতিটা write-এর সাথে একটা টাইমস্ট্যাম্প রাখো, merge-এর সময় বড় টাইমস্ট্যাম্পটা জিতুক।

সমস্যা তিনটে, আর তিনটেই মারাত্মক:

- **ঘড়ি মেলে না।** দুটো সার্ভারের ঘড়িতে NTP থাকা সত্ত্বেও কয়েক মিলিসেকেন্ড থেকে কয়েকশো মিলিসেকেন্ড পার্থক্য থাকা স্বাভাবিক। একটা সার্ভারের ঘড়ি ৩ সেকেন্ড এগিয়ে থাকলে সেই সার্ভারের লেখা পুরনো ডেটা নতুন ডেটাকে হারিয়ে দেবে — অনির্দিষ্টকালের জন্য।
- **হারানোটা নীরব।** LWW কোনো error দেয় না, কোনো লগ লেখে না। আল-রাযি তাঁর ফোন থেকে ঠিকানা বদলালেন, আল-কিন্দি (সাপোর্ট এজেন্ট) একই মুহূর্তে অ্যাডমিন প্যানেল থেকে ফোন নম্বর বদলালেন — পুরো row-টা যদি একক ইউনিট হিসেবে LWW হয়, একজনের পরিবর্তন সম্পূর্ণ মুছে যাবে, আর কেউ কোনোদিন জানবে না।
- **এটা কিছু কিছু ডেটার জন্য একদম ঠিক আছে।** একটা sensor-এর সর্বশেষ পাঠ, একটা ইউজারের "last seen at" — এখানে পুরনোটা হারালে কিছুই যায় আসে না। তাই LWW খারাপ নয়, **ভুল জায়গায় LWW** খারাপ।

<Callout type="warning">

Cassandra-তে LWW ডিফল্ট আচরণ, এবং এটা **cell-level** — অর্থাৎ প্রতিটা কলাম আলাদাভাবে জেতে-হারে, পুরো row একসাথে নয়। এটা অনেক ক্ষেত্রেই বাঁচিয়ে দেয়, কিন্তু "সবসময় নিরাপদ" ভাবার কারণ নয়: একই কলামে concurrent write হলে একটা নিঃশব্দে মরবেই।

</Callout>

### Vector clock — "কে কার পরে" প্রশ্নটা সঠিকভাবে করা

ঘড়ির সময়ের বদলে প্রতিটা replica-র নিজস্ব একটা কাউন্টার রাখা যায়, আর প্রতিটা ভ্যালুর সাথে সব কাউন্টারের একটা vector রাখা যায়। দুটো ভার্সন তুলনা করলে তিনটে ফলাফলের একটা হয়: A নিশ্চিতভাবে B-র আগে, B নিশ্চিতভাবে A-র আগে, অথবা **দুটো concurrent** — কেউ কারো পরে নয়।

এখানে লাভটা "conflict সমাধান হয়ে গেল" নয়। লাভটা হলো — **conflict আছে কিনা আপনি নিশ্চিতভাবে জানতে পারলেন**। DynamoDB-র পূর্বসূরি Dynamo ঠিক এটাই করত: concurrent ভার্সনগুলো আলাদা করে রেখে দিত (siblings) আর অ্যাপ্লিকেশনকে বলত "তুমি ঠিক করো"। Riak-ও একই পথে গিয়েছিল। খরচ: vector-টা replica সংখ্যার সাথে বাড়ে, আর অ্যাপ্লিকেশনকে merge লজিক লিখতেই হবে।

### CRDT — যে ডেটা স্ট্রাকচার conflict-এ পড়তেই পারে না

সবচেয়ে মার্জিত সমাধান হলো ডেটা স্ট্রাকচারটাই এমনভাবে বানানো, যাতে merge অপারেশনটা **commutative, associative আর idempotent** হয় — অর্থাৎ কে আগে কে পরে তাতে ফলাফল বদলায় না, আর একই জিনিস দুবার merge করলেও কিছু বদলায় না (চ্যাপ্টার ১১-এর idempotency এখানে ফিরে এসেছে, লক্ষ করুন)।

কয়েকটা বাস্তব CRDT:

- **G-Counter** — শুধু বাড়ে এমন কাউন্টার। প্রতিটা নোড নিজের অংশ বাড়ায়, মোট মান হলো সবার যোগফল। লাইক কাউন্ট, ভিউ কাউন্টের জন্য নিখুঁত।
- **PN-Counter** — দুটো G-Counter, একটা বাড়ার জন্য একটা কমার জন্য। ফলোয়ার কাউন্টের জন্য (ফলো আর আনফলো)।
- **OR-Set (observed-remove set)** — প্রতিটা যোগ করা এলিমেন্টের সাথে একটা ইউনিক ট্যাগ, আর মোছা মানে দেখা ট্যাগগুলো মোছা। শপিং কার্ট, ট্যাগ লিস্ট, রিঅ্যাকশন সেট।
- **LWW-Register** — হ্যাঁ, LWW-ও একটা CRDT। এটা converge করে, শুধু সঠিক উত্তরটা রাখে না।

Figma-র multiplayer editing, Redis Enterprise-এর active-active geo-replication, আর প্রায় সব local-first sync ইঞ্জিন (Automerge, Yjs) এই ভিত্তির উপরই দাঁড়ানো।

### Application-level merge

সবচেয়ে পুরনো এবং প্রায়ই সবচেয়ে সৎ পথ: conflict-টা মানুষের কাছে নিয়ে যাওয়া। git-এর merge conflict এটাই। Google Docs-এর version history এটাই। একটা ব্যাংকিং সিস্টেমে "এই দুটো লেনদেন একসাথে হয়েছে, একজন অপারেটর দেখুন" — এটাও এটাই।

নিয়মটা সোজা: **যেখানে ভুল merge-এর দাম বেশি, সেখানে অটোমেটিক merge করবেন না।** টাকার হিসাবে LWW বসানোর চেয়ে একটা ম্যানুয়াল রিভিউ কিউ অনেক সস্তা।

## Quorum: W + R এবং overlap

Leaderless বা multi-leader সিস্টেমে (Dynamo, Cassandra, Riak) একটা সাধারণ কৌশল হলো quorum। N হলো একটা key-র কপি সংখ্যা, W হলো একটা write সফল বলার জন্য কত কপিতে লিখতে হবে, R হলো একটা read-এ কত কপি থেকে পড়তে হবে।

মূল নিয়ম: **W + R এর মান N এর চেয়ে বড় হলে** read set আর write set-এর মধ্যে অন্তত একটা নোড অবশ্যই মিলবে (pigeonhole principle), তাই সবচেয়ে সাম্প্রতিক write টা read-এর ফলাফলে থাকবেই — আপনি version নম্বর দেখে সেটাকে বেছে নেবেন।

<Mermaid
title="Quorum overlap when W plus R exceeds N"
code={`graph LR
  W1["Write goes to<br/>node-baghdad<br/>node-cordoba"] --> OV["node-cordoba is in both sets<br/>so the newest version is visible"]
  R1["Read goes to<br/>node-cordoba<br/>node-samarkand"] --> OV
  OV --> RES["Pick the highest version<br/>and repair the stale node"]`}
/>

সাধারণ কনফিগারেশনগুলো:

| N   | W   | R   | আচরণ                           | কখন                           |
| --- | --- | --- | ------------------------------ | ----------------------------- |
| 3   | 2   | 2   | overlap আছে, ভারসাম্যপূর্ণ     | ডিফল্ট পছন্দ                  |
| 3   | 3   | 1   | read খুব দ্রুত, write ভঙ্গুর   | প্রায় শুধু পড়া হয় এমন ডেটা |
| 3   | 1   | 3   | write খুব দ্রুত, read ধীর      | লগ, টেলিমেট্রি ingest         |
| 3   | 1   | 1   | overlap নেই, পুরোপুরি eventual | কাউন্টার, মেট্রিক             |
| 5   | 3   | 3   | দুটো নোড হারালেও চলে           | ক্রস-রিজিয়ন                  |

### কিন্তু quorum linearizable নয়

এটা সবচেয়ে বেশি ভুল বোঝা অংশ। "W + R এর মান N এর বেশি রেখেছি, তাই strong consistency পেয়ে গেছি" — এই বাক্যটা ভুল, অন্তত তিনটে কারণে:

**Sloppy quorum.** partition-এর সময় Dynamo-ধরনের সিস্টেম প্রায়ই "যে কোনো W টা নোড" গ্রহণ করে, key-র জন্য নির্ধারিত N টা নোড না হলেও চলে। write গুলো hinted handoff হিসেবে অন্য নোডে জমা থাকে, পরে আসল নোডে পৌঁছে দেওয়া হয়। এতে availability বাড়ে, কিন্তু overlap-এর গ্যারান্টিটাই ভেঙে যায় — read set-এ সেই hint-ধারী নোড না-ও থাকতে পারে।

**আংশিক write.** একটা write W টা নোডে পৌঁছানোর আগেই ক্লায়েন্ট মারা গেল, ধরুন ৩টার মধ্যে ১টাতে পৌঁছেছে। write টা "ব্যর্থ" ঘোষিত হলো, কিন্তু ওই একটা নোডে ভ্যালুটা রয়ে গেল। এখন কিছু read সেটা দেখবে, কিছু দেখবে না — আর কোনো rollback নেই।

**Concurrent write-এর ক্রম।** দুটো write একই সময়ে ভিন্ন নোডে গেলে quorum আপনাকে বলে না কে আগে; সেটা আবার LWW বা vector clock-এর হাতে ফিরে যায়।

<Callout type="warning">

সত্যিকারের linearizability-র জন্য quorum যথেষ্ট নয় — একটা **consensus protocol** লাগে (Raft, Paxos, বা Spanner-এর TrueTime-ভিত্তিক পদ্ধতি) যেখানে একটা নির্বাচিত leader অপারেশনগুলোর একটা global order ঠিক করে দেয়। quorum হলো consensus-এর একটা উপাদান, পুরোটা নয়। Cassandra-তে `QUORUM` read আপনাকে "সাম্প্রতিক ডেটা পাওয়ার খুব ভালো সম্ভাবনা" দেয়, "গ্যারান্টি" দেয় না — গ্যারান্টি চাইলে lightweight transaction (Paxos) লাগে, যেটা দশ গুণ ধীর।

</Callout>

## একটা session-consistency লেয়ার, সম্পূর্ণ কোডে

নিচের ইমপ্লিমেন্টেশনে এই চ্যাপ্টারের তিনটে জিনিস একসাথে আছে: (১) causal token দিয়ে read-your-writes আর monotonic reads, (২) একটা quorum read/write সিমুলেটর যেটা W + R এর সাথে N-এর সম্পর্ক হাতে-কলমে দেখায়, আর (৩) last-write-wins বনাম merge-ভিত্তিক conflict resolution-এর তুলনা।

```typescript
/**
 * A session-consistency layer over an async primary/replica setup.
 *
 * Goals:
 *   1. read-your-writes  - a session always sees its own writes
 *   2. monotonic reads    - a session never travels backwards in time
 *   3. keep most reads on replicas, fall back to the primary only when needed
 *
 * Plus a quorum simulator and an LWW-vs-merge comparison.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** Log sequence number: a monotonically increasing position in the write log. */
export type LSN = number;

/** The causal token handed back to a client after a write. */
export interface CausalToken {
	lsn: LSN;
	issuedAt: number;
}

export interface Account {
	id: string;
	owner: string;
	city: string;
	balanceDinars: number;
	updatedAt: number;
}

interface LogEntry {
	lsn: LSN;
	account: Account;
}

// ---------------------------------------------------------------------------
// Primary
// ---------------------------------------------------------------------------

export class Primary {
	readonly name = 'primary-baghdad-01';

	private data = new Map<string, Account>();
	private log: LogEntry[] = [];
	private lsn: LSN = 0;

	write(account: Omit<Account, 'updatedAt'>): CausalToken {
		this.lsn += 1;
		const stored: Account = { ...account, updatedAt: Date.now() };
		this.data.set(stored.id, stored);
		this.log.push({ lsn: this.lsn, account: stored });
		return { lsn: this.lsn, issuedAt: stored.updatedAt };
	}

	read(id: string): Account | null {
		return this.data.get(id) ?? null;
	}

	currentLsn(): LSN {
		return this.lsn;
	}

	/** Replication feed: everything strictly after the given position. */
	entriesAfter(after: LSN): LogEntry[] {
		return this.log.filter((e) => e.lsn > after);
	}
}

// ---------------------------------------------------------------------------
// Replica
// ---------------------------------------------------------------------------

export class Replica {
	private data = new Map<string, Account>();
	private applied: LSN = 0;
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		readonly name: string,
		private primary: Primary,
		private lagMs: number
	) {}

	appliedLsn(): LSN {
		return this.applied;
	}

	read(id: string): Account | null {
		return this.data.get(id) ?? null;
	}

	/** Pull replication: apply everything the primary has, after an artificial delay. */
	start(): void {
		this.timer = setInterval(() => this.pump(), this.lagMs);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	private pump(): void {
		const batch = this.primary.entriesAfter(this.applied);
		for (const entry of batch) {
			this.data.set(entry.account.id, entry.account);
			this.applied = entry.lsn;
		}
		if (batch.length > 0) {
			console.log(`[replica ${this.name}] applied up to lsn=${this.applied}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Session store: the client's causal position
// ---------------------------------------------------------------------------

interface SessionState {
	/** Highest LSN this session has written OR read. Both matter. */
	watermark: LSN;
	updatedAt: number;
}

export class SessionStore {
	private sessions = new Map<string, SessionState>();

	/** Never let a client push the watermark above what the primary actually has. */
	constructor(private maxAheadTolerance = 0) {}

	watermark(sessionId: string): LSN {
		return this.sessions.get(sessionId)?.watermark ?? 0;
	}

	/** Watermarks only ever move forward - this is what makes reads monotonic. */
	advance(sessionId: string, lsn: LSN, primaryLsn: LSN): void {
		const clamped = Math.min(lsn, primaryLsn + this.maxAheadTolerance);
		const current = this.sessions.get(sessionId);
		if (current && current.watermark >= clamped) return;
		this.sessions.set(sessionId, { watermark: clamped, updatedAt: Date.now() });
	}

	expire(olderThanMs: number): number {
		const cutoff = Date.now() - olderThanMs;
		let removed = 0;
		for (const [id, state] of this.sessions) {
			if (state.updatedAt < cutoff) {
				this.sessions.delete(id);
				removed += 1;
			}
		}
		return removed;
	}
}

// ---------------------------------------------------------------------------
// The router: picks primary or replica based on the session watermark
// ---------------------------------------------------------------------------

export interface RouteStats {
	replicaReads: number;
	primaryFallbacks: number;
	writes: number;
}

export class SessionConsistentRouter {
	readonly stats: RouteStats = { replicaReads: 0, primaryFallbacks: 0, writes: 0 };

	constructor(
		private primary: Primary,
		private replicas: Replica[],
		private sessions: SessionStore
	) {}

	/** Writes always go to the primary and always advance the session watermark. */
	write(sessionId: string, account: Omit<Account, 'updatedAt'>): CausalToken {
		const token = this.primary.write(account);
		this.sessions.advance(sessionId, token.lsn, this.primary.currentLsn());
		this.stats.writes += 1;
		console.log(
			`[router] write id=${account.id} session=${sessionId} lsn=${token.lsn} -> ${this.primary.name}`
		);
		return token;
	}

	/**
	 * Reads prefer a replica that has caught up past the session watermark.
	 * If none has, fall back to the primary - correctness beats load shedding.
	 */
	read(sessionId: string, id: string): Account | null {
		const need = this.sessions.watermark(sessionId);

		const caughtUp = this.replicas
			.filter((r) => r.appliedLsn() >= need)
			.sort((a, b) => b.appliedLsn() - a.appliedLsn());

		if (caughtUp.length > 0) {
			// Pick a random caught-up replica so load spreads evenly.
			const chosen = caughtUp[Math.floor(Math.random() * caughtUp.length)];
			this.stats.replicaReads += 1;
			this.sessions.advance(sessionId, chosen.appliedLsn(), this.primary.currentLsn());
			console.log(
				`[router] read id=${id} session=${sessionId} need=${need} -> ${chosen.name} (applied=${chosen.appliedLsn()})`
			);
			return chosen.read(id);
		}

		this.stats.primaryFallbacks += 1;
		this.sessions.advance(sessionId, this.primary.currentLsn(), this.primary.currentLsn());
		console.log(
			`[router] read id=${id} session=${sessionId} need=${need} -> ${this.primary.name} (no replica caught up)`
		);
		return this.primary.read(id);
	}
}

// ---------------------------------------------------------------------------
// Quorum simulator: demonstrates why W + R must exceed N
// ---------------------------------------------------------------------------

interface VersionedValue {
	value: string;
	version: number;
	writtenBy: string;
}

class QuorumNode {
	private store = new Map<string, VersionedValue>();
	reachable = true;

	constructor(readonly name: string) {}

	put(key: string, value: VersionedValue): boolean {
		if (!this.reachable) return false;
		const current = this.store.get(key);
		if (current && current.version >= value.version) return true;
		this.store.set(key, value);
		return true;
	}

	get(key: string): VersionedValue | null {
		if (!this.reachable) return null;
		return this.store.get(key) ?? null;
	}
}

export class QuorumCluster {
	private nodes: QuorumNode[];
	private version = 0;

	constructor(
		nodeNames: string[],
		private W: number,
		private R: number
	) {
		this.nodes = nodeNames.map((n) => new QuorumNode(n));
		const N = this.nodes.length;
		if (this.W + this.R > N) {
			console.log(`[quorum] N=${N} W=${W} R=${R} -> read and write sets overlap, reads see latest`);
		} else {
			console.log(`[quorum] N=${N} W=${W} R=${R} -> NO overlap, reads may be stale`);
		}
	}

	partition(nodeNames: string[]): void {
		for (const n of this.nodes) {
			if (nodeNames.includes(n.name)) n.reachable = false;
		}
		console.log(`[quorum] partitioned away: ${nodeNames.join(', ')}`);
	}

	heal(): void {
		for (const n of this.nodes) n.reachable = true;
		console.log('[quorum] partition healed');
	}

	/** Returns false when fewer than W nodes acknowledged - a CP-style refusal. */
	write(key: string, value: string, writer: string): boolean {
		this.version += 1;
		const payload: VersionedValue = { value, version: this.version, writtenBy: writer };

		let acks = 0;
		for (const node of this.nodes) {
			if (node.put(key, payload)) acks += 1;
		}

		const ok = acks >= this.W;
		console.log(
			`[quorum] write key=${key} value=${value} version=${payload.version} acks=${acks}/${this.W} ${ok ? 'OK' : 'REJECTED'}`
		);
		return ok;
	}

	/** Returns the highest version seen across R responding nodes, plus repair hints. */
	read(key: string): VersionedValue | null {
		const responses: Array<{ node: QuorumNode; value: VersionedValue | null }> = [];

		for (const node of this.nodes) {
			if (responses.length >= this.R) break;
			if (!node.reachable) continue;
			responses.push({ node, value: node.get(key) });
		}

		if (responses.length < this.R) {
			console.log(
				`[quorum] read key=${key} only ${responses.length}/${this.R} responded -> REJECTED`
			);
			return null;
		}

		let winner: VersionedValue | null = null;
		for (const r of responses) {
			if (r.value && (!winner || r.value.version > winner.version)) winner = r.value;
		}

		// Read repair: push the winner back to any node that was behind.
		for (const r of responses) {
			if (winner && (!r.value || r.value.version < winner.version)) {
				r.node.put(key, winner);
				console.log(`[quorum] read repair sent to ${r.node.name}`);
			}
		}

		console.log(
			`[quorum] read key=${key} -> ${winner ? `${winner.value} v${winner.version}` : 'null'}`
		);
		return winner;
	}
}

// ---------------------------------------------------------------------------
// Conflict resolution: last-write-wins vs an additive merge
// ---------------------------------------------------------------------------

interface LedgerReplicaState {
	name: string;
	/** Every entry that this branch recorded while it was isolated. */
	entries: Array<{ id: string; deltaDinars: number; at: number }>;
	/** The single scalar an LWW system would keep instead. */
	lwwBalance: number;
	lwwAt: number;
}

/** Last-write-wins: the newer timestamp wins and the other write vanishes. */
export function resolveLww(a: LedgerReplicaState, b: LedgerReplicaState): number {
	const winner = a.lwwAt >= b.lwwAt ? a : b;
	const loser = winner === a ? b : a;
	console.log(
		`[lww] ${winner.name} (${winner.lwwAt}) beats ${loser.name} (${loser.lwwAt}) -> balance ${winner.lwwBalance}, ` +
			`silently discarded ${loser.lwwBalance}`
	);
	return winner.lwwBalance;
}

/**
 * Additive merge: deposits and withdrawals commute, so union the entry sets
 * by id and sum the deltas. This is the core idea behind a PN-Counter CRDT -
 * commutative, associative, and idempotent, so replay order does not matter.
 */
export function resolveMerge(starting: number, ...replicas: LedgerReplicaState[]): number {
	const seen = new Map<string, number>();
	for (const r of replicas) {
		for (const e of r.entries) {
			seen.set(e.id, e.deltaDinars); // idempotent: same id, same delta
		}
	}
	let total = starting;
	for (const delta of seen.values()) total += delta;
	console.log(`[merge] combined ${seen.size} unique entries -> balance ${total}`);
	return total;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

export async function demo(): Promise<void> {
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	// --- 1. Session consistency ---
	const primary = new Primary();
	const cordoba = new Replica('replica-cordoba-02', primary, 300);
	const samarkand = new Replica('replica-samarkand-03', primary, 900);
	cordoba.start();
	samarkand.start();

	const sessions = new SessionStore();
	const router = new SessionConsistentRouter(primary, [cordoba, samarkand], sessions);

	router.write('session-al-kindi', {
		id: 'acct-1',
		owner: 'Al-Kindi',
		city: 'Baghdad',
		balanceDinars: 100
	});

	// Immediately after the write: no replica has caught up, so we hit the primary.
	router.read('session-al-kindi', 'acct-1');

	await sleep(400); // Cordoba has now applied the write.
	router.read('session-al-kindi', 'acct-1');

	// A different session with no watermark can be served by any replica.
	router.read('session-al-razi', 'acct-1');

	console.log('[router] stats', router.stats);
	cordoba.stop();
	samarkand.stop();

	// --- 2. Quorum ---
	const good = new QuorumCluster(['node-baghdad', 'node-cordoba', 'node-samarkand'], 2, 2);
	good.write('rate:dinar-dirham', '13.5', 'writer-cairo');
	good.read('rate:dinar-dirham');

	good.partition(['node-samarkand']);
	good.write('rate:dinar-dirham', '13.8', 'writer-cairo'); // still 2 acks -> OK
	good.read('rate:dinar-dirham');
	good.heal();

	const risky = new QuorumCluster(['node-fez', 'node-damascus', 'node-bukhara'], 1, 1);
	risky.write('rate:dinar-dirham', '14.1', 'writer-fez');
	risky.read('rate:dinar-dirham'); // may or may not see the newest value

	// --- 3. Conflict resolution ---
	const cityBranch: LedgerReplicaState = {
		name: 'branch-samarkand-city',
		entries: [{ id: 'txn-a1', deltaDinars: -40, at: 1000 }],
		lwwBalance: 60,
		lwwAt: 1000
	};
	const passBranch: LedgerReplicaState = {
		name: 'branch-samarkand-pass',
		entries: [{ id: 'txn-b7', deltaDinars: 60, at: 1200 }],
		lwwBalance: 160,
		lwwAt: 1200
	};

	resolveLww(cityBranch, passBranch); // 160 - the withdrawal is gone
	resolveMerge(100, cityBranch, passBranch); // 120 - both entries survive
}
```

এই কোডে যে সিদ্ধান্তগুলো প্রোডাকশন-গ্রেড:

- **Watermark শুধু সামনে যায়** — read আর write দুটোই watermark এগোয়, তাই read-your-writes আর monotonic reads একই মেকানিজম থেকে বেরিয়ে আসে
- **Fallback সবসময় primary-তে** — কোনো replica যদি সময়মতো না ধরে, correctness-এর পক্ষে ভোট, load shedding-এর পক্ষে নয়
- **Watermark clamp করা** — জাল টোকেন দিয়ে সব read primary-তে পাঠিয়ে দেওয়ার আক্রমণ ঠেকে
- **Read repair** — quorum read যে stale নোড খুঁজে পায়, সেটাকে সাথে সাথে সারিয়ে দেয়, তাই সময়ের সাথে ক্লাস্টার নিজেই converge করে
- **Merge idempotent** — একই entry id দুবার এলে ব্যালেন্স দুবার বদলায় না, যেটা চ্যাপ্টার ১১-এর at-least-once delivery-র সাথে সরাসরি মেলে

## Transaction isolation: সম্পূর্ণ আলাদা অক্ষ

এতক্ষণ আমরা কথা বলেছি **একটা ডেটার অনেকগুলো কপি** নিয়ে। Isolation level কথা বলে **একটা ডেটার উপর অনেকগুলো concurrent transaction** নিয়ে। একটা single-node ডেটাবেসেও isolation-এর সব সমস্যা পুরোদমে হাজির থাকে — সেখানে কোনো partition নেই, কোনো replica নেই।

| Isolation level    | Dirty read | Non-repeatable read | Phantom read | Write skew |
| ------------------ | ---------- | ------------------- | ------------ | ---------- |
| Read uncommitted   | সম্ভব      | সম্ভব               | সম্ভব        | সম্ভব      |
| Read committed     | ঠেকে       | সম্ভব               | সম্ভব        | সম্ভব      |
| Repeatable read    | ঠেকে       | ঠেকে                | সম্ভব (ANSI) | সম্ভব      |
| Snapshot isolation | ঠেকে       | ঠেকে                | ঠেকে         | **সম্ভব**  |
| Serializable       | ঠেকে       | ঠেকে                | ঠেকে         | ঠেকে       |

anomaly গুলোর সংজ্ঞা এক লাইনে:

- **Dirty read** — অন্য transaction যা এখনো commit করেনি, সেটা পড়ে ফেলা। ওই transaction rollback করলে আপনি এমন ডেটা দেখলেন যা কোনোদিন ছিলই না।
- **Non-repeatable read** — একই transaction-এ একই row দুবার পড়ে দুরকম মান পাওয়া, কারণ মাঝখানে অন্য কেউ commit করেছে।
- **Phantom read** — একই query দুবার চালিয়ে **নতুন row** পাওয়া (row বদলায়নি, সংখ্যা বদলেছে)। রেঞ্জ query-তে হয়।
- **Write skew** — সবচেয়ে সূক্ষ্ম। দুটো transaction একই ডেটা **পড়ে**, দুজনেই দেখে নিয়ম ভাঙছে না, তারপর দুজনে **আলাদা আলাদা row-তে লেখে** — আর ফলাফলে একটা invariant ভেঙে যায় যা কোনো একক transaction ভাঙেনি।

<Callout type="warning">

নাম নিয়ে সাবধান। Postgres-এ `REPEATABLE READ` চাইলে আপনি আসলে snapshot isolation পান (phantom-ও ঠেকে), MySQL InnoDB-র `REPEATABLE READ` আবার gap lock দিয়ে অন্যভাবে কাজ করে, আর Oracle-এ `SERIALIZABLE` চাইলে আপনি snapshot isolation পান — সত্যিকারের serializability নয়। **আপনার নির্দিষ্ট ডেটাবেসের ডকুমেন্টেশন পড়ুন**, ANSI স্ট্যান্ডার্ডের নাম দেখে ধরে নেবেন না।

</Callout>

### একটা কাজ করা write skew উদাহরণ

বাগদাদের বিমারিস্তানে নিয়ম: যেকোনো সময় অন্তত একজন চিকিৎসক on-call থাকতেই হবে। এই মুহূর্তে দুজন আছেন — আল-রাযি আর ইবনে সিনা। দুজনেই ক্লান্ত, দুজনেই একই সেকেন্ডে নিজেকে off-call করতে চাইছেন।

```sql
-- Setup
CREATE TABLE on_call (
  physician   text PRIMARY KEY,
  hospital    text NOT NULL,
  is_on_call  boolean NOT NULL
);

INSERT INTO on_call VALUES
  ('al-razi',  'bimaristan-baghdad', true),
  ('ibn-sina', 'bimaristan-baghdad', true);
```

এখন দুটো transaction, দুটোই `REPEATABLE READ` (Postgres-এ snapshot isolation) চালাচ্ছে:

```sql
-- Transaction A (al-razi)                  -- Transaction B (ibn-sina)
BEGIN ISOLATION LEVEL REPEATABLE READ;      BEGIN ISOLATION LEVEL REPEATABLE READ;

SELECT count(*) FROM on_call
 WHERE hospital = 'bimaristan-baghdad'
   AND is_on_call;
-- returns 2, so "it is safe to leave"
                                            SELECT count(*) FROM on_call
                                             WHERE hospital = 'bimaristan-baghdad'
                                               AND is_on_call;
                                            -- also returns 2, from its own snapshot

UPDATE on_call SET is_on_call = false
 WHERE physician = 'al-razi';
                                            UPDATE on_call SET is_on_call = false
                                             WHERE physician = 'ibn-sina';

COMMIT;                                     COMMIT;

-- Final state: zero physicians on call. The invariant is broken.
```

কেন কোনো lock conflict হলো না সেটা লক্ষ করুন — A লিখেছে `al-razi` row-তে, B লিখেছে `ibn-sina` row-তে। **দুটো ভিন্ন row**, তাই row-level lock কখনো মুখোমুখি হয়নি। snapshot isolation প্রতিটা transaction-কে তার নিজের ধারাবাহিক snapshot দিয়েছে, দুটোই সেই snapshot অনুযায়ী সঠিক সিদ্ধান্ত নিয়েছে। তবু ফলাফলটা এমন একটা অবস্থা যা কোনো serial ক্রমে (আগে A তারপর B, বা আগে B তারপর A) কখনোই হতে পারত না।

তিনটে সমাধান, বাড়তে থাকা খরচের ক্রমে:

**১. Materializing the conflict — `SELECT FOR UPDATE`.** যে row গুলোর উপর সিদ্ধান্তটা নির্ভর করছে, সেগুলোকে পড়ার সময়ই lock করুন।

```sql
BEGIN;

SELECT count(*) FROM on_call
 WHERE hospital = 'bimaristan-baghdad'
   AND is_on_call
 FOR UPDATE;             -- now both transactions contend on the same rows

UPDATE on_call SET is_on_call = false
 WHERE physician = 'al-razi';

COMMIT;
```

দ্বিতীয় transaction প্রথমটার commit-এর জন্য অপেক্ষা করবে, তারপর নতুন করে পড়বে, দেখবে count এখন 1, আর নিজেকে থামাবে। খেয়াল রাখুন — `FOR UPDATE` শুধু **বিদ্যমান** row lock করে, তাই phantom-ধরনের write skew (নতুন row ঢোকানো) এতে ঠেকে না; সেখানে predicate lock বা একটা constraint লাগবে।

**২. একটা সত্যিকারের constraint দিয়ে invariant-কে ডেটাবেসের দায়িত্বে দেওয়া.**

```sql
-- Keep an explicit counter row that every writer must touch.
CREATE TABLE on_call_count (
  hospital text PRIMARY KEY,
  active   int  NOT NULL CHECK (active >= 1)
);

-- Every off-call transaction must decrement it, so the writes now
-- collide on a single row and the CHECK enforces the invariant.
UPDATE on_call_count
   SET active = active - 1
 WHERE hospital = 'bimaristan-baghdad';
```

এতে conflict-টা ইচ্ছে করে একটা single row-তে নামিয়ে আনা হলো — এটাই সবচেয়ে নির্ভরযোগ্য, কারণ কোন কোডপাথ দিয়ে write এল তাতে কিছু যায় আসে না।

**৩. `SERIALIZABLE`.** Postgres-এর SSI (serializable snapshot isolation) read-write dependency ট্র্যাক করে আর বিপজ্জনক প্যাটার্ন ধরা পড়লে একটা transaction-কে abort করে দেয়।

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;

SELECT count(*) FROM on_call
 WHERE hospital = 'bimaristan-baghdad'
   AND is_on_call;

UPDATE on_call SET is_on_call = false
 WHERE physician = 'al-razi';

COMMIT;
-- ERROR: could not serialize access due to read/write dependencies
-- among transactions  (SQLSTATE 40001)  -> the application must retry
```

সবচেয়ে সঠিক, কিন্তু একটা শর্ত আছে যেটা প্রায়ই ভুলে যাওয়া হয়: **আপনার অ্যাপ্লিকেশনকে `40001` ধরে retry করতেই হবে।** SERIALIZABLE ব্যবহার করা মানে serialization failure একটা স্বাভাবিক, প্রত্যাশিত ঘটনা — bug নয়। retry লজিক ছাড়া SERIALIZABLE চালু করলে আপনি শুধু নতুন ধরনের এরর ইউজারের মুখে ছুড়ে দিলেন। আর contention বেশি হলে abort rate বাড়ে, throughput পড়ে — এজন্যই অনেক টিম hot path-এ SERIALIZABLE-এর বদলে ২ নম্বর পদ্ধতিটা বেছে নেয়।

## কোন ফিচারে কোন গ্যারান্টি আসলে দরকার

এই টেবিলটাই এই চ্যাপ্টারের ব্যবহারিক সারাংশ। প্রতিটা সারিতে প্রশ্নটা একই — **সবচেয়ে দুর্বল গ্যারান্টি কোনটা, যেটা দিয়ে ফিচারটা সত্যিই ঠিকভাবে কাজ করে?**

| ফিচার                                 | সবচেয়ে দুর্বল যথেষ্ট গ্যারান্টি         | কেন                                                 | ভুল হলে কী হয়                                           |
| ------------------------------------- | ---------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| টাকা ট্রান্সফার (আল-কিন্দি → আল-রাযি) | Linearizable + serializable transaction  | দুটো অ্যাকাউন্টের যোগফল একটা invariant              | টাকা তৈরি বা ধ্বংস হয়, অডিট ফেল                         |
| ইনভেন্টরি রিজার্ভেশন (শেষ ১টা কপি)    | Linearizable compare-and-set             | overselling ঠেকাতে atomic decrement লাগে            | দুজনকে একই জিনিস বেচা, রিফান্ড আর সাপোর্ট খরচ            |
| ইউজারনেম uniqueness                   | Linearizable (বা একটা unique constraint) | নাম নেওয়াটা একটা global mutual exclusion           | দুজনের একই handle, পরে ম্যানুয়ালি ঠিক করতে হয়          |
| পাসওয়ার্ড / পারমিশন বদল              | Read-your-writes + দ্রুত propagation     | নিরাপত্তার সিদ্ধান্ত পুরনো ডেটায় নেওয়া যায় না    | কেড়ে নেওয়া অ্যাক্সেস কিছুক্ষণ কাজ করে — নিরাপত্তা ঘটনা |
| প্রোফাইল এডিট                         | Read-your-writes                         | ইউজার নিজের পরিবর্তন দেখতে চায়                     | "সেভ হয়নি" ভেবে বারবার সেভ, ডুপ্লিকেট                   |
| কমেন্ট থ্রেড                          | Causal                                   | উত্তরের আগে মূল কমেন্ট দেখা যেতে হবে                | অর্থহীন কথোপকথন, uncanny অভিজ্ঞতা                        |
| নোটিফিকেশন read state                 | Monotonic reads                          | পড়া নোটিফিকেশন আবার unread হলে বিরক্তিকর           | ব্যাজ কাউন্ট লাফায়, ইউজার বিশ্বাস হারায়                |
| ফাইল আপলোড তারপর ক্যাপশন এডিট         | Monotonic writes                         | নিজের write গুলো নিজেদের ক্রমে বসতে হবে             | ক্যাপশন হারায় বা পুরনো ক্যাপশন ফিরে আসে                 |
| ফিড / টাইমলাইন                        | Eventual (নিজের পোস্ট বাদে)              | কয়েক সেকেন্ড পরে অন্যের পোস্ট এলে কিছু যায় আসে না | কার্যত কিছুই না                                          |
| লাইক কাউন্ট                           | Eventual (G-Counter)                     | সঠিক সংখ্যার চেয়ে দ্রুত সংখ্যা বেশি জরুরি          | সংখ্যা কয়েক সেকেন্ড পিছিয়ে থাকে                        |
| ফলোয়ার কাউন্ট                        | Eventual (PN-Counter)                    | ফলো/আনফলো commute করে                               | সাময়িকভাবে ১-২ কম বা বেশি দেখায়                        |
| অ্যানালিটিক্স / ড্যাশবোর্ড            | Eventual, মিনিট-স্কেল                    | সিদ্ধান্ত ট্রেন্ড দেখে হয়, শেষ row দেখে নয়        | কিছুই না — বরং কড়া গ্যারান্টি চাইলে খরচ বাড়ে           |

খেয়াল করুন, নিজের পোস্ট নিজের ফিডে দেখা আর অন্যের পোস্ট দেখা — এই দুটো একই ফিচার হলেও **আলাদা গ্যারান্টি চায়**। এটাই পরের চ্যাপ্টারের capstone-এর সবচেয়ে গুরুত্বপূর্ণ ডিজাইন সিদ্ধান্ত হতে যাচ্ছে।

## দরকারের চেয়ে বেশি গ্যারান্টি নেওয়া "ফ্রি নিরাপত্তা" নয়

একটা খুব সাধারণ প্রবৃত্তি: "নিশ্চিত না থাকলে সবচেয়ে কড়া গ্যারান্টিটাই নিই, ক্ষতি তো নেই।" ক্ষতি আছে, এবং প্রতিটা ক্ষতিই মাপা যায়।

- **Latency.** Linearizable write মানে অন্তত একটা consensus রাউন্ড — একই রিজিয়নে ১–৫ ms, ক্রস-রিজিয়নে ৭০–২০০ ms। প্রতিটা লাইকের জন্য এই দাম দেওয়া মানে আপনার ফিড ব্যবহারের অযোগ্য হয়ে যাওয়া।
- **Throughput.** SERIALIZABLE-এ contention বাড়লে abort rate বাড়ে, আর abort হওয়া transaction মানে সম্পূর্ণ অপচয় হওয়া কাজ। একটা hot row-তে সবাইকে সিরিয়ালাইজ করতে বাধ্য করলে আপনার সিস্টেমের সর্বোচ্চ throughput ওই একটা row-র lock hold time দিয়ে নির্ধারিত হয়ে যায়।
- **Availability.** CP মানে partition-এর সময় minority side পুরোপুরি অচল। "লাইক কাউন্ট দেখানোর জন্য" পুরো ফিচার বন্ধ হয়ে যাওয়াটা একটা অদ্ভুত trade-off।
- **স্কেলিংয়ের সীমা.** যা linearizable, তা কোনো না কোনো coordination point-এর মধ্য দিয়ে যায়। coordination point কখনো horizontally স্কেল করে না — এটাই শেষ পর্যন্ত আপনার সিস্টেমের সিলিং।
- **খরচ.** DynamoDB-তে strongly consistent read literally eventually consistent read-এর দ্বিগুণ দাম। Spanner-এর দাম-কাঠামোই এর গ্যারান্টির প্রতিফলন।

<Callout type="tip">

সিদ্ধান্তটা কোড রিভিউয়ে বসে নেবেন না — প্রোডাক্টের সাথে বসে নিন। প্রশ্নটা টেকনিক্যাল নয়: **"এই ডেটাটা ৩ সেকেন্ড পুরনো দেখালে ইউজারের কী ক্ষতি হবে, আর সেটা কি ৩০০ ms বাড়তি latency-র চেয়ে বড় ক্ষতি?"** বেশিরভাগ ফিচারে উত্তরটা "না"। কয়েকটাতে উত্তরটা "হ্যাঁ, এবং সেটা টাকার ক্ষতি" — ঠিক ওইখানেই আপনার consistency বাজেট খরচ করুন।

</Callout>

## চ্যাপ্টার ১৪-এর আগে

পরের চ্যাপ্টারে আপনি একটা social feed ডিজাইন করবেন, আর সেখানে এই চ্যাপ্টারের প্রতিটা সিদ্ধান্ত হাতে-কলমে নিতে হবে: পোস্ট করার পর নিজের ফিডে সেটা সাথে সাথে দেখা (read-your-writes), অন্যের পোস্ট কয়েক সেকেন্ড পরে আসা (eventual), লাইক কাউন্ট কাউন্টার হিসেবে রাখা (G-Counter), কমেন্ট থ্রেডে ক্রম ঠিক রাখা (causal), আর ইউজারনেম দাবি করার সময় একটা কড়া uniqueness (linearizable)। একটাই প্রোডাক্ট, পাঁচটা আলাদা consistency সিদ্ধান্ত — এবং সেটাই স্বাভাবিক।

<div class="takeaways">

### মূল শেখা

- CAP "তিনটার মধ্যে দুটো" নয়। P কোনো পছন্দ নয়, একটা বাস্তবতা — তাই আসল প্রশ্ন **CP না AP**, আর সেটাও **শুধু partition চলাকালে**
- CAP আপনার সিস্টেমের জীবনের ৯৯.৯৯% সময় নিয়ে নীরব। **PACELC** সেই ফাঁকটা ভরে — partition না থাকলে আপনি প্রতিদিন **latency বনাম consistency** বেছে নিচ্ছেন, জেনে হোক বা না জেনে
- CAP-এর C মানে **linearizability**, ACID-এর C মানে **constraint সংরক্ষণ** — এই দুটো শব্দের কোনো সম্পর্ক নেই, আর isolation level আরেকটা সম্পূর্ণ আলাদা অক্ষ
- Consistency একটা বাইনারি নয়, একটা সিঁড়ি। মাঝের **session guarantee** গুলোই (read-your-writes, monotonic reads/writes) ইউজার আসলে টের পায়, আর এগুলো একটা **causal token / LSN watermark** দিয়ে সস্তায় পাওয়া যায়
- **Last-write-wins নিঃশব্দে ডেটা খায়** — ঘড়ি মেলে না, আর হারানোটা কোনো লগ বা এররে ধরা পড়ে না। commutative merge (CRDT) বা application-level merge অনেক জায়গায় সঠিক উত্তর
- **W + R এর মান N এর বেশি** হলে overlap নিশ্চিত, কিন্তু সেটা linearizability নয় — sloppy quorum, আংশিক write আর concurrent write-এর ক্রম এখনো ফাঁক রেখে দেয়; সত্যিকারের linearizability-র জন্য consensus লাগে
- **Write skew** snapshot isolation-এ ঘটে কারণ transaction গুলো ভিন্ন row-তে লেখে, তাই lock কখনো মুখোমুখি হয় না। সমাধান: `SELECT FOR UPDATE`, conflict-টাকে একটা row-তে materialize করা, বা `SERIALIZABLE` + **retry লজিক**
- দরকারের চেয়ে কড়া গ্যারান্টি নেওয়া ফ্রি নয় — latency, throughput, availability, স্কেলিং সিলিং আর সরাসরি টাকা, পাঁচটাতেই দাম দিতে হয়

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Google Spanner** TrueTime আর atomic clock ব্যবহার করে গ্লোবাল স্কেলে externally consistent transaction দেয় — এবং ঠিক সেই কারণেই এটা PC/EC: partition-এ minority side অচল হয়, আর স্বাভাবিক সময়েও commit-এ ইচ্ছাকৃত অপেক্ষা যোগ হয়। Google নিজেই বলে, তারা latency দিয়ে consistency কিনেছে
- **Amazon DynamoDB** প্রতিটা read-এ পছন্দটা ডেভেলপারের হাতে ছেড়ে দেয় — eventually consistent read অর্ধেক দামে, strongly consistent read দ্বিগুণ দামে; এর পূর্বসূরি Dynamo পেপারই vector clock আর sloppy quorum ধারণাগুলো জনপ্রিয় করে
- **Facebook/Meta** TAO-তে ইচ্ছাকৃতভাবে eventual consistency নেয়, কিন্তু ইউজারের নিজের write-এর জন্য read-your-writes আলাদা করে নিশ্চিত করে — ঠিক এই চ্যাপ্টারের session-guarantee পদ্ধতিতে
- **Figma আর Google Docs** multiplayer editing-এ CRDT বা OT ব্যবহার করে, কারণ দুজন একসাথে টাইপ করলে "কে জিতবে" প্রশ্নটারই কোনো গ্রহণযোগ্য উত্তর নেই — merge করতেই হবে

</div>
