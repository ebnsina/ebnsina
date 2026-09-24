---
title: 'সিস্টেম ডিজাইন আসলে কী'
subtitle: 'ডায়াগ্রাম আঁকা নয় — trade-off সামলানো। শব্দভাণ্ডার, চিন্তার কাঠামো, আর সাদা পাতা থেকে শুরু করার পদ্ধতি।'
chapter: 1
level: 'beginner'
readingTime: '১৬ মিনিট'
topics: ['system design', 'trade-offs', 'architecture', 'fundamentals']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

দুইজন মিস্ত্রি একই জমিতে বাড়ি বানাচ্ছে। একজন জিজ্ঞেস করে "কয় তলা?" আরেকজন জিজ্ঞেস করে "কতজন থাকবে, বাজেট কত, ভবিষ্যতে বাড়াবেন কিনা, মাটি কেমন?" — দ্বিতীয়জন সিস্টেম ডিজাইন করছে, প্রথমজন শুধু নির্মাণ করছে।

</Callout>

## গল্পে বুঝি

কর্ডোবার এক গলিতে ফাতিমার একটা ছোট বইয়ের দোকান আছে। শুরুতে দোকানটা এক কামরার — একটা তাক, দুইশো বই, আর ফাতিমা নিজে। কেউ বই চাইলে সে মনে করে বলে দেয় "তিন নম্বর তাকে, বাঁ দিক থেকে চতুর্থ"। কোনো নকশার দরকার নেই, কোনো ক্যাটালগের দরকার নেই। মাথায় সব ধরে যায়।

দশ বছর পরে সেই দোকান কর্ডোবার সবচেয়ে বড় গ্রন্থাগার। এক লাখ বই, দিনে দুই হাজার পাঠক, বারোজন কর্মচারী, তিনতলা ভবন। এখন "মনে করে বলে দেওয়া" আর সম্ভব নয়। এখন প্রতিটা সিদ্ধান্তের পেছনে একটা করে **trade-off** দাঁড়িয়ে আছে, এবং প্রতিটা সিদ্ধান্তেই কিছু একটা পাওয়া যায়, কিছু একটা হারায়।

ফাতিমা যদি বইগুলো বিষয় অনুযায়ী সাজায় — চিকিৎসা এক তলায়, গণিত আরেক তলায় — তাহলে বিষয়ভিত্তিক খোঁজা সহজ, কিন্তু কেউ লেখকের নাম জানলে তাকে সব তলা ঘুরতে হবে। যদি লেখক অনুযায়ী সাজায়, উল্টোটা। সে দুইটাই চাইলে? তাহলে একটা আলাদা কার্ড-ক্যাটালগ বানাতে হবে — যেখানে লেখকের নাম দেখে তাকের নম্বর পাওয়া যায়। কিন্তু নতুন বই এলে এখন দুই জায়গায় লিখতে হবে: তাকে বই রাখা, আর কার্ডে এন্ট্রি করা। খোঁজা দ্রুত হলো, কিন্তু নতুন বই ঢোকানো ধীর হলো। এটাই **index** — পড়া দ্রুত করার জন্য লেখার খরচ বাড়ানো।

জনপ্রিয় বইগুলো — সিনার কানুন, খোয়ারিজমির বীজগণিত — দিনে পঞ্চাশবার চাওয়া হয়। প্রতিবার তিনতলায় দৌড়ানো বোকামি। ফাতিমা সেগুলোর কয়েক কপি সামনের কাউন্টারে রেখে দিল। খোঁজা এখন প্রায় তাৎক্ষণিক, কিন্তু নতুন সংস্করণ এলে কাউন্টারের কপিগুলোও বদলাতে হবে — না বদলালে পাঠক পুরনো তথ্য নিয়ে ফিরে যাবে। এটাই **cache**, এবং সেই ঝুঁকিটার নাম **stale data**।

একজন কর্মচারী দিয়ে দুই হাজার পাঠক সামলানো যায় না, তাই বারোজন। কিন্তু বারোজন থাকলে নতুন প্রশ্ন — কে কোন পাঠককে দেখবে? দরজায় একজন দাঁড়িয়ে বণ্টন করে (**load balancer**)। আবার একজন কর্মচারী ছুটিতে গেলে যেন কাজ না আটকায়, তাই কেউই কোনো পাঠকের ব্যক্তিগত তথ্য নিজের পকেটের কাগজে রাখে না — সব কেন্দ্রীয় রেজিস্টারে (**stateless service**)। আর আগুন লাগলে এক লাখ বই ছাই হয়ে যাবে, তাই দামি পাণ্ডুলিপির নকল কপি ফেজ শহরের আরেকটা ভবনে রাখা (**replication**, ভিন্ন **region**-এ)।

খেয়াল করুন — ফাতিমা কোনো ধাপেই "সেরা" সমাধান বাছেনি। সে প্রতিবার জিজ্ঞেস করেছে: **এখন আমার সমস্যা কোনটা, আর এই সমাধানের বদলে আমি কী হারাতে রাজি?** কার্ড-ক্যাটালগ (**index**) পড়া দ্রুত করে কিন্তু লেখা ধীর করে; কাউন্টারের কপি (**cache**) দ্রুত কিন্তু বাসি হতে পারে; বারোজন কর্মচারী (**horizontal scaling**) ক্ষমতা বাড়ায় কিন্তু সমন্বয়ের ঝামেলা আনে; ফেজের নকল কপি (**replication**) নিরাপত্তা দেয় কিন্তু খরচ আর সিঙ্ক করার দেরি (**replication lag**) যোগ করে।

সিস্টেম ডিজাইন এই প্রশ্নটারই পুনরাবৃত্তি, প্রতিটা স্তরে: **কী পাচ্ছি, বিনিময়ে কী দিচ্ছি?**

## সংজ্ঞা: সিস্টেম ডিজাইন কী

**সিস্টেম ডিজাইন হলো একগুচ্ছ constraint-এর মধ্যে থেকে একটা সফটওয়্যার সিস্টেমের কাঠামো ঠিক করা — কোন কম্পোনেন্ট থাকবে, তারা কীভাবে কথা বলবে, ডেটা কোথায় থাকবে, আর কিছু ভেঙে গেলে কী হবে।**

এই সংজ্ঞার তিনটা শব্দ আলাদা করে দেখুন:

**constraint** — অসীম টাকা আর অসীম সময় থাকলে ডিজাইন লাগত না, সব ঢেলে দিলেই হতো। ডিজাইন দরকার হয় কারণ বাজেট সীমিত, টিম ছোট, ডেডলাইন কাছে, এবং কম্পিউটারের গতি সসীম।

**কীভাবে কথা বলবে** — বেশিরভাগ কঠিন বাগ কম্পোনেন্টের _ভেতরে_ থাকে না, থাকে কম্পোনেন্টের _মাঝখানে_। দুইটা সার্ভিস একে অপরের কাছে কী আশা করে, একজন দেরি করলে আরেকজন কী করে — এগুলোই আসল ডিজাইন।

**কিছু ভেঙে গেলে কী হবে** — নতুনরা ধরে নেয় সিস্টেম মানে "সব ঠিকঠাক চললে যা ঘটে"। অভিজ্ঞরা জানে সিস্টেম মানে "কিছু একটা নষ্ট থাকা অবস্থায় যা ঘটে" — কারণ যথেষ্ট বড় সিস্টেমে সবসময়ই কিছু না কিছু নষ্ট থাকে।

<Callout type="warning">

সিস্টেম ডিজাইন মানে বাক্স আর তীর আঁকা নয়। ডায়াগ্রামটা হলো সিদ্ধান্তগুলোর _ছবি_। কেউ যদি প্রথমেই ডায়াগ্রাম আঁকা শুরু করে, বুঝবেন সে সিদ্ধান্ত না নিয়েই ছবি আঁকছে।

</Callout>

## যে শব্দগুলো আগে জানা দরকার

এই ট্র্যাকজুড়ে এই শব্দগুলো বারবার আসবে। এখানে একবার পরিষ্কার করে নিই — বাকি সবকিছু এদের ওপরে দাঁড়াবে।

| শব্দ                   | মানে                              | সহজ উদাহরণ                                 |
| ---------------------- | --------------------------------- | ------------------------------------------ |
| **Client**             | যে চায়                           | ব্রাউজার, মোবাইল অ্যাপ                     |
| **Server**             | যে দেয়                           | আপনার API চলছে যে মেশিনে                   |
| **Request / Response** | চাওয়া ও দেওয়ার একটা জোড়া       | "এই ইউজারের প্রোফাইল দাও" → JSON           |
| **Latency**            | একটা কাজ শেষ হতে কত সময়          | রিকোয়েস্ট পাঠানো থেকে উত্তর পাওয়া, ৮০ ms |
| **Throughput**         | সময়ের একক প্রতি কত কাজ           | সেকেন্ডে ৫,০০০ রিকোয়েস্ট                  |
| **Availability**       | সময়ের কত ভাগ সিস্টেম কাজ করে     | ৯৯.৯% মানে মাসে ~৪৩ মিনিট বন্ধ             |
| **Consistency**        | সবাই কি একই ডেটা দেখছে            | লিখে সাথে সাথে পড়লে নতুনটাই পাব?          |
| **Durability**         | লেখা ডেটা কি টিকে থাকবে           | সার্ভার পুড়ে গেলেও অর্ডারটা আছে?          |
| **Scalability**        | চাপ বাড়লে কি ক্ষমতা বাড়ানো যায় | ট্রাফিক ১০x হলে মেশিন ১০x দিলেই চলবে?      |
| **Bottleneck**         | যে অংশটা সবার আগে ভরে যায়        | CPU নয়, ডেটাবেসের connection pool         |

তিনটা শব্দ বিশেষভাবে গুলিয়ে যায় — latency, throughput আর bandwidth।

**Latency** হলো _একজনের_ অপেক্ষা। **Throughput** হলো _সবার_ মোট প্রবাহ। এক লেনের রাস্তায় গাড়ি ঘণ্টায় ১২০ কিমি চললে latency কম, কিন্তু লেন একটাই বলে throughput কম। দশ লেনের রাস্তায় গাড়ি ঘণ্টায় ৪০ কিমি চললে latency বেশি, throughput অনেক বেশি। দুইটা আলাদা জিনিস — এবং প্রায়ই একটা বাড়াতে গেলে আরেকটা কমে।

<Mermaid
title="Latency বনাম Throughput"
code={`graph TB
  subgraph "কম latency, কম throughput"
    A1["এক লেন<br/>দ্রুত গতি"]
  end
  subgraph "বেশি latency, বেশি throughput"
    B1["দশ লেন<br/>ধীর গতি"]
  end`}
/>

## ডিজাইন মানেই trade-off

এই ট্র্যাকের একটামাত্র বাক্য যদি মনে রাখতে হয়, সেটা এটা: **প্রতিটা ডিজাইন সিদ্ধান্ত কিছু একটা দেয় এবং কিছু একটা নেয়।** যে সমাধান শুধু দেয়, নেয় না — সেটা সমাধান নয়, সেটা আপনার এখনো না বোঝা।

কয়েকটা উদাহরণ, যেগুলো পুরো ট্র্যাকজুড়ে ফিরে আসবে:

**Cache যোগ করলে** পড়া দ্রুত হয়। বিনিময়ে ডেটা বাসি হওয়ার সম্ভাবনা তৈরি হয়, আরেকটা জিনিস নষ্ট হওয়ার মতো থাকে, আর invalidation নামের একটা চিরস্থায়ী মাথাব্যথা যোগ হয়।

**Index যোগ করলে** query দ্রুত হয়। বিনিময়ে প্রতিটা INSERT/UPDATE ধীর হয়, ডিস্ক বেশি লাগে।

**Replica যোগ করলে** পড়ার ক্ষমতা বাড়ে আর ব্যাকআপ পাওয়া যায়। বিনিময়ে replication lag আসে — অর্থাৎ replica থেকে পড়লে কয়েক মিলিসেকেন্ড পুরনো ডেটা পেতে পারেন।

**Shard করলে** ডেটাবেস আর একটা মেশিনে আটকে থাকে না। বিনিময়ে দুই shard জুড়ে JOIN করা কঠিন, transaction কঠিন, আর shard key ভুল বাছলে সংশোধন ভয়াবহ।

**Queue যোগ করলে** ধীর কাজ ব্যাকগ্রাউন্ডে চলে যায়, রিকোয়েস্ট দ্রুত হয়। বিনিময়ে সিস্টেম asynchronous হয়ে যায় — ইউজার "হয়ে গেছে" দেখে, অথচ কাজটা তখনো হয়নি।

**Microservice-এ ভাঙলে** টিমগুলো আলাদা করে ডিপ্লয় করতে পারে। বিনিময়ে একটা function call এখন একটা network call — অর্থাৎ এটা এখন ধীর হতে পারে, ব্যর্থ হতে পারে, বা টাইমআউট করতে পারে।

<Callout type="tip">

ইন্টারভিউতে (এবং বাস্তব ডিজাইন রিভিউতে) সবচেয়ে বেশি নম্বর পাওয়া বাক্যটা হলো: "আমি X বেছে নিচ্ছি, কারণ আমাদের constraint হলো Y — এর খরচ হলো Z, এবং সেটা আমরা মেনে নিতে পারি কারণ..."। শুধু "আমি Redis ব্যবহার করব" বললে কিছুই বলা হলো না।

</Callout>

## সরলতাই ডিফল্ট

নতুনদের সবচেয়ে বড় ভুল হলো ওভার-ইঞ্জিনিয়ারিং — এমন সমস্যার সমাধান বানানো যেটা এখনো নেই। দিনে ২০০ জন ইউজারের একটা অ্যাপের জন্য Kafka, Kubernetes, microservice, multi-region replication — এই সবকিছু ব্যর্থতার নতুন নতুন উপায় ছাড়া কিছুই যোগ করে না।

মনে রাখুন: **একটা মাঝারি সার্ভার আজকাল অবিশ্বাস্য রকম শক্তিশালী।** ২০২৬ সালের একটা সাধারণ ভার্চুয়াল মেশিন (৮ কোর, ৩২ GB RAM) ঠিকমতো লিখলে সহজেই কয়েক হাজার রিকোয়েস্ট প্রতি সেকেন্ড সামলায়, আর তার পাশে একটা PostgreSQL ইনস্ট্যান্স কোটি কোটি row নিয়ে দিব্যি চলে। বেশিরভাগ স্টার্টআপ যে "স্কেল সমস্যা" নিয়ে চিন্তিত, সেটা আসলে একটা মিসিং index।

তাই ডিজাইনের ক্রমটা এমন হওয়া উচিত:

<Mermaid
title="জটিলতা যোগ করার ক্রম"
code={`graph TB
  A["একটা সার্ভার + একটা DB"] --> B["মাপুন: bottleneck কোথায়?"]
  B --> C["Index / query ঠিক করুন"]
  C --> D["Cache যোগ করুন"]
  D --> E["আরও app server + load balancer"]
  E --> F["Read replica"]
  F --> G["Queue দিয়ে async কাজ সরান"]
  G --> H["Shard / আলাদা সার্ভিস"]`}
/>

প্রতিটা ধাপে থামুন এবং মাপুন। পরের ধাপে যাওয়ার একমাত্র বৈধ কারণ হলো — এই ধাপে সমস্যা মেটেনি, এবং আপনার কাছে সেটার সংখ্যাগত প্রমাণ আছে।

<Callout type="warning">

**"আমার এটা লাগবে কারণ গুগল এটা ব্যবহার করে" — এটা কোনো যুক্তি নয়।** গুগলের constraint হলো বিলিয়ন ইউজার আর হাজার ইঞ্জিনিয়ার। আপনার constraint হলো দশ হাজার ইউজার আর তিনজন ইঞ্জিনিয়ার। একই সমস্যা নয়, তাই একই সমাধানও নয়।

</Callout>

## সাদা পাতা থেকে শুরু করার পদ্ধতি

"একটা ইনস্টাগ্রাম ডিজাইন করুন" — শুনে মাথা ফাঁকা হয়ে যাওয়াটাই স্বাভাবিক। সমস্যা এত বড় যে কোথা থেকে ধরবেন বোঝা যায় না। সমাধান হলো একটা নির্দিষ্ট ক্রম মেনে চলা, প্রতিবার। এই ছয় ধাপ এই ট্র্যাকের প্রতিটা প্রজেক্ট চ্যাপ্টারে ব্যবহার করা হবে।

### ধাপ ১ — সুযোগ সংকুচিত করুন (৫ মিনিট)

"ইনস্টাগ্রাম" মানে ছবি আপলোড, ফিড, স্টোরি, রিলস, ডাইরেক্ট মেসেজ, বিজ্ঞাপন, খোঁজা, নোটিফিকেশন — সব একসাথে ডিজাইন করা অসম্ভব। তিন-চারটা কোর ফিচার বেছে নিন এবং জোরে বলে দিন বাকিগুলো আপাতত বাদ। যেমন: "আমি ছবি আপলোড, ফলো করা, আর হোম ফিড — এই তিনটা ধরছি; স্টোরি আর মেসেজিং বাদ।"

### ধাপ ২ — Requirement বের করুন

কী কাজ করবে (**functional**) আর কতটা ভালোভাবে করবে (**non-functional**) — দুইটা আলাদা করে লিখুন। "ইউজার ছবি আপলোড করতে পারবে" functional; "আপলোড p95-এ ২ সেকেন্ডের নিচে শেষ হবে, ৯৯.৯% সময় সার্ভিস চালু থাকবে" non-functional। পরের চ্যাপ্টার পুরোটাই এই নিয়ে।

### ধাপ ৩ — হিসাব করুন

কত ইউজার, দিনে কতবার, তাহলে সেকেন্ডে কত রিকোয়েস্ট, কত ডেটা জমবে, কত ব্যান্ডউইথ লাগবে। এই সংখ্যাগুলোই ঠিক করে দেয় আপনার ডিজাইনটা এক মেশিনের সমস্যা নাকি একশো মেশিনের সমস্যা। চ্যাপ্টার ৩-এ পুরো অঙ্ক।

### ধাপ ৪ — API আর ডেটা মডেল

বাইরের দুনিয়া আপনার সিস্টেমের সাথে কীভাবে কথা বলবে (endpoint, request, response), আর ভেতরে ডেটা কীভাবে থাকবে (টেবিল, key, ইনডেক্স)। এই ধাপে সবচেয়ে বেশি ভুল ধরা পড়ে — কারণ ডেটা মডেল বানাতে গেলেই বোঝা যায় requirement-এ কী কী অস্পষ্ট ছিল।

### ধাপ ৫ — উঁচু স্তরের ডিজাইন

এবার বাক্স আর তীর। Client, load balancer, app server, cache, database, queue, object storage — যতটুকু লাগে ততটুকুই। তারপর একটা করে গুরুত্বপূর্ণ পথ (যেমন "ছবি আপলোডের পুরো যাত্রা") আঙুল দিয়ে ট্রেস করুন।

### ধাপ ৬ — গভীরে যান আর ভাঙার কথা ভাবুন

Bottleneck কোথায়? ট্রাফিক ১০x হলে প্রথমে কী ভাঙবে? ডেটাবেস মরে গেলে কী হয়? cache মরে গেলে? একই ছবি দুইবার আপলোড হলে? — এই প্রশ্নগুলোর উত্তরই একজন জুনিয়র আর সিনিয়র ডিজাইনারের পার্থক্য।

<Callout type="tip">

ধাপ ১ থেকে ৪ পর্যন্ত কোনো ডায়াগ্রাম আঁকবেন না। শুধু লিখুন — বুলেট পয়েন্ট, সংখ্যা, endpoint-এর তালিকা। ছবি আসবে ধাপ ৫-এ, যখন সিদ্ধান্তগুলো ইতিমধ্যেই নেওয়া হয়ে গেছে।

</Callout>

## একটা সিস্টেমের সরলতম রূপ

তত্ত্ব যথেষ্ট হয়েছে। নিচে একটা সম্পূর্ণ, চালানো যায় এমন সার্ভিস — বুকমার্ক সেভ করার একটা API। এটাই "একটা সার্ভার, একটা ডেটাবেস" আর্কিটেকচারের বাস্তব রূপ, এবং সত্যি বলতে বেশিরভাগ প্রোডাক্টের প্রথম দুই বছর এর চেয়ে বেশি কিছু লাগে না।

কোডটা পড়ার সময় খেয়াল করুন — এখানে কোনো cache নেই, কোনো queue নেই, কোনো replica নেই। কিন্তু আছে: input validation, নির্দিষ্ট error contract, request logging, graceful shutdown, আর একটা health endpoint। এই জিনিসগুলো "সিম্পল" সিস্টেমেও বাদ দেওয়া যায় না — এগুলো জটিলতা নয়, এগুলো ন্যূনতম দায়িত্ব।

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// The simplest complete system: one process, one in-memory store.
// Swap the store for Postgres and this is a real production service.
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);

interface Bookmark {
	id: string;
	owner: string;
	url: string;
	title: string;
	createdAt: string;
}

interface ApiError {
	error: string;
	message: string;
	requestId: string;
}

// --- Storage layer -------------------------------------------------------
// Behind an interface on purpose: today it is a Map, tomorrow it is Postgres,
// and the handlers never need to know which.
interface BookmarkStore {
	insert(b: Bookmark): Promise<void>;
	listByOwner(owner: string, limit: number): Promise<Bookmark[]>;
	findById(id: string): Promise<Bookmark | null>;
	delete(id: string, owner: string): Promise<boolean>;
}

class MemoryBookmarkStore implements BookmarkStore {
	private byId = new Map<string, Bookmark>();
	private byOwner = new Map<string, string[]>();

	async insert(b: Bookmark): Promise<void> {
		this.byId.set(b.id, b);
		const list = this.byOwner.get(b.owner) ?? [];
		list.unshift(b.id); // newest first — this is our "index"
		this.byOwner.set(b.owner, list);
	}

	async listByOwner(owner: string, limit: number): Promise<Bookmark[]> {
		const ids = this.byOwner.get(owner) ?? [];
		const out: Bookmark[] = [];
		for (const id of ids.slice(0, limit)) {
			const b = this.byId.get(id);
			if (b) out.push(b);
		}
		return out;
	}

	async findById(id: string): Promise<Bookmark | null> {
		return this.byId.get(id) ?? null;
	}

	async delete(id: string, owner: string): Promise<boolean> {
		const b = this.byId.get(id);
		if (!b || b.owner !== owner) return false;
		this.byId.delete(id);
		const list = this.byOwner.get(owner);
		if (list) {
			this.byOwner.set(
				owner,
				list.filter((x) => x !== id)
			);
		}
		return true;
	}
}

const store: BookmarkStore = new MemoryBookmarkStore();

// --- Validation ----------------------------------------------------------
const MAX_TITLE = 200;

function validateBookmarkInput(body: unknown): { url: string; title: string } | string {
	if (typeof body !== 'object' || body === null) return 'body must be a JSON object';
	const b = body as Record<string, unknown>;

	if (typeof b.url !== 'string' || b.url.length === 0) return 'url is required';
	let parsed: URL;
	try {
		parsed = new URL(b.url);
	} catch {
		return 'url is not a valid absolute URL';
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return 'url must use http or https';
	}

	const title = typeof b.title === 'string' ? b.title.trim() : '';
	if (title.length === 0) return 'title is required';
	if (title.length > MAX_TITLE) return `title must be at most ${MAX_TITLE} characters`;

	return { url: parsed.toString(), title };
}

// --- HTTP helpers --------------------------------------------------------
function sendJSON(res: http.ServerResponse, status: number, payload: unknown): void {
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Content-Length': Buffer.byteLength(body),
		'Cache-Control': 'no-store'
	});
	res.end(body);
}

function sendError(
	res: http.ServerResponse,
	status: number,
	error: string,
	message: string,
	requestId: string
): void {
	const payload: ApiError = { error, message, requestId };
	sendJSON(res, status, payload);
}

function readJSON(req: http.IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		req.on('data', (chunk: Buffer) => {
			size += chunk.length;
			if (size > maxBytes) {
				reject(new Error('payload too large'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => {
			const raw = Buffer.concat(chunks).toString('utf-8');
			if (raw.length === 0) return resolve({});
			try {
				resolve(JSON.parse(raw));
			} catch {
				reject(new Error('invalid JSON'));
			}
		});
		req.on('error', reject);
	});
}

// The owner would normally come from a verified session token. Keeping it as a
// header here makes the request path obvious without dragging auth into
// chapter one.
function ownerFrom(req: http.IncomingMessage): string | null {
	const owner = req.headers['x-user'];
	return typeof owner === 'string' && owner.length > 0 ? owner : null;
}

// --- Handlers ------------------------------------------------------------
async function createBookmark(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	requestId: string
): Promise<void> {
	const owner = ownerFrom(req);
	if (!owner) return sendError(res, 401, 'unauthorized', 'X-User header required', requestId);

	let body: unknown;
	try {
		body = await readJSON(req);
	} catch (err) {
		return sendError(res, 400, 'bad_request', (err as Error).message, requestId);
	}

	const validated = validateBookmarkInput(body);
	if (typeof validated === 'string') {
		return sendError(res, 422, 'validation_failed', validated, requestId);
	}

	const bookmark: Bookmark = {
		id: crypto.randomUUID(),
		owner,
		url: validated.url,
		title: validated.title,
		createdAt: new Date().toISOString()
	};

	await store.insert(bookmark);
	sendJSON(res, 201, bookmark);
}

async function listBookmarks(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	url: URL,
	requestId: string
): Promise<void> {
	const owner = ownerFrom(req);
	if (!owner) return sendError(res, 401, 'unauthorized', 'X-User header required', requestId);

	const rawLimit = url.searchParams.get('limit');
	const limit = Math.min(Math.max(parseInt(rawLimit || '20', 10) || 20, 1), 100);

	const items = await store.listByOwner(owner, limit);
	sendJSON(res, 200, { items, count: items.length, limit });
}

async function deleteBookmark(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	id: string,
	requestId: string
): Promise<void> {
	const owner = ownerFrom(req);
	if (!owner) return sendError(res, 401, 'unauthorized', 'X-User header required', requestId);

	const removed = await store.delete(id, owner);
	if (!removed) return sendError(res, 404, 'not_found', `bookmark ${id} not found`, requestId);

	res.writeHead(204);
	res.end();
}

// --- Router --------------------------------------------------------------
async function router(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
	const requestId = crypto.randomUUID();
	const startedAt = process.hrtime.bigint();
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const method = req.method || 'GET';

	res.setHeader('X-Request-Id', requestId);

	res.on('finish', () => {
		const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
		// One structured line per request. This is the cheapest observability
		// you will ever buy, and the first thing you miss when it is absent.
		console.log(
			JSON.stringify({
				requestId,
				method,
				path: url.pathname,
				status: res.statusCode,
				durationMs: Number(ms.toFixed(2))
			})
		);
	});

	try {
		if (url.pathname === '/healthz' && method === 'GET') {
			return sendJSON(res, 200, { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
		}

		if (url.pathname === '/bookmarks' && method === 'POST') {
			return await createBookmark(req, res, requestId);
		}

		if (url.pathname === '/bookmarks' && method === 'GET') {
			return await listBookmarks(req, res, url, requestId);
		}

		const match = url.pathname.match(/^\/bookmarks\/([A-Za-z0-9-]+)$/);
		if (match && method === 'DELETE') {
			return await deleteBookmark(req, res, match[1], requestId);
		}

		sendError(res, 404, 'not_found', `no route for ${method} ${url.pathname}`, requestId);
	} catch (err) {
		console.error(JSON.stringify({ requestId, level: 'error', message: String(err) }));
		sendError(res, 500, 'internal_error', 'something went wrong', requestId);
	}
}

// --- Server + graceful shutdown -----------------------------------------
const server = http.createServer(router);

server.listen(PORT, () => {
	console.log(`bookmark service listening on http://localhost:${PORT}`);
});

let shuttingDown = false;
function shutdown(signal: string): void {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`${signal} received, draining connections`);
	server.close(() => {
		console.log('closed cleanly');
		process.exit(0);
	});
	// Never hang forever waiting for a stuck connection.
	setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

## এই কোডটা কোথায় ভাঙবে

উপরের সার্ভিসটা নিখুঁত নয় — এবং সেটাই শেখার আসল জায়গা। এখন প্রশ্ন করুন: কোথায় প্রথম ফাটল ধরবে?

**প্রসেস রিস্টার্ট করলেই সব ডেটা উধাও।** স্টোরটা মেমরিতে। সমাধান: একটা আসল ডেটাবেস — চ্যাপ্টার ৫-এ কোনটা বাছবেন।

**দ্বিতীয় সার্ভার চালালে দুইজনের দুই রকম ডেটা।** সিনার বুকমার্ক সার্ভার-১-এ, বিরুনির সার্ভার-২-এ। এই কারণেই state অ্যাপ সার্ভারের বাইরে রাখতে হয় — চ্যাপ্টার ১৩।

**একই ইউজার বাটনে দুইবার ক্লিক করলে দুইটা এন্ট্রি।** কোনো idempotency নেই — চ্যাপ্টার ৮।

**একজন ইউজার দশ লাখ বুকমার্ক বানিয়ে ফেললে?** কোনো quota নেই, কোনো rate limit নেই — চ্যাপ্টার ১৪।

**`listByOwner` তালিকার আকার বাড়লে ধীর হবে**, আর আসল ডেটাবেসে index না থাকলে পুরো টেবিল স্ক্যান করবে — চ্যাপ্টার ১০।

খেয়াল করুন: এই ট্র্যাকের প্রায় পুরোটাই এই ছোট্ট সার্ভিসটার সমস্যাগুলো একে একে সমাধান করা। জটিল আর্কিটেকচার আকাশ থেকে পড়ে না — সরল আর্কিটেকচারের ব্যথা থেকে জন্মায়।

<Callout type="tip">

নতুন কোনো সিস্টেম বোঝার সবচেয়ে ভালো উপায়: জিজ্ঞেস করুন "এটা এত জটিল কেন?" এবং প্রতিটা জটিলতার পেছনে যে ব্যথাটা ছিল সেটা খুঁজে বের করুন। ব্যথাটা খুঁজে না পেলে সম্ভবত জটিলতাটা অপ্রয়োজনীয়।

</Callout>

## একজন ভালো ডিজাইনার যেভাবে ভাবে

**সংখ্যা দিয়ে ভাবে, বিশেষণ দিয়ে নয়।** "অনেক ইউজার" নয় — "দিনে ৫০ লাখ, পিকে সেকেন্ডে ৩,০০০ রিকোয়েস্ট"। "দ্রুত" নয় — "p95-এ ২০০ ms-এর নিচে"।

**সবচেয়ে খারাপ কেসটা আগে ভাবে।** গড় ব্যবহারকারী নয়, সবচেয়ে বেশি ফলোয়ার থাকা ব্যবহারকারী; গড় দিন নয়, ঈদের দিন।

**ব্যর্থতাকে স্বাভাবিক ধরে নেয়।** নেটওয়ার্ক কল ব্যর্থ _হতে পারে_ নয় — ব্যর্থ _হবে_। প্রশ্নটা "যদি" নয়, "কখন এবং তখন কী"।

**যা মাপা যায় না, তা উন্নত করা যায় না।** ডিজাইনের অংশ হিসেবেই ঠিক করে "সিস্টেমটা ভালো চলছে কিনা আমি কীভাবে বুঝব"।

**সরল দিয়ে শুরু করে, জটিলতা অর্জন করতে হয়।** প্রতিটা নতুন কম্পোনেন্টকে প্রমাণ করতে হয় সে কেন আছে।

<div class="takeaways">

### মূল শেখা

- সিস্টেম ডিজাইন হলো constraint-এর মধ্যে trade-off সামলানো — ডায়াগ্রাম আঁকা এর ফলাফল, কারণ নয়
- প্রতিটা সিদ্ধান্ত কিছু দেয় এবং কিছু নেয়; যে সমাধানের কোনো খরচ দেখছেন না, সেটা আপনি এখনো বোঝেননি
- Latency (একজনের অপেক্ষা), throughput (সবার প্রবাহ) আর availability (কত সময় চালু) — তিনটা আলাদা জিনিস, প্রায়ই একে অপরের বিরুদ্ধে
- ডিফল্ট হলো সরলতা: একটা সার্ভার, একটা ডেটাবেস। জটিলতা যোগ করার আগে সংখ্যা দিয়ে প্রমাণ করুন যে দরকার
- সাদা পাতা থেকে শুরু করার ক্রম: সুযোগ সংকুচিত → requirement → estimation → API ও ডেটা মডেল → উঁচু স্তরের ডিজাইন → গভীরে ও ফেইলিওর
- বড় সিস্টেমে সবসময়ই কিছু না কিছু নষ্ট থাকে; ডিজাইনের আসল পরীক্ষা হলো তখন কী ঘটে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **নতুন ফিচারের কিকঅফ মিটিংয়ে** — কোড লেখার আগে এক পাতায় requirement, সংখ্যা আর trade-off লিখে ফেলা; বেশিরভাগ ভুল এই এক পাতাতেই ধরা পড়ে
- **ডিজাইন রিভিউতে** — "এই কম্পোনেন্টটা কোন ব্যথার সমাধান?" প্রশ্নটা করে অপ্রয়োজনীয় জটিলতা ছেঁটে ফেলা
- **ইন্টারভিউয়ের system design রাউন্ডে** — ছয় ধাপের কাঠামোটা মেনে চলা, এবং প্রতিটা পছন্দের সাথে তার খরচ উচ্চারণ করা
- **পুরনো কোডবেস বোঝার সময়** — প্রতিটা জটিলতার পেছনের ঐতিহাসিক ব্যথা খুঁজে বের করা, যাতে কোনটা এখনো দরকার আর কোনটা নয় তা বোঝা যায়
- **incident review-তে** — "আমরা কোন trade-off নিয়েছিলাম, আর আজ যেটা ভাঙল সেটা কি সেই trade-off-এরই দাম?"

</div>
