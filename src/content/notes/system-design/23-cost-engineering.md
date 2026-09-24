---
title: 'কস্ট ইঞ্জিনিয়ারিং'
subtitle: 'আর্কিটেকচারকে বিল হিসেবে পড়তে শেখা — egress, storage class, idle capacity আর unit economics দিয়ে সিস্টেমের আসল দাম বের করা।'
chapter: 23
level: 'mastery'
readingTime: '২৫ মিনিট'
topics:
  ['cost engineering', 'unit economics', 'egress', 'capacity planning', 'FinOps', 'storage tiers']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একজন ব্যবসায়ী যিনি শুধু মাসের মোট বিক্রি দেখে খুশি থাকেন, আর আরেকজন যিনি প্রতিটা বাক্সে কত লাভ থাকল সেটা হিসাব করেন — একই দোকান, কিন্তু দ্বিতীয়জনই জানেন কোন পণ্যটা আসলে তাকে ডুবাচ্ছে।

</Callout>

## গল্পে বুঝি

সমরকন্দে সিনার একটা কারাভান ট্রেড হাউস। বছরে চারবার তার উট-সারি রওনা দেয় — বুখারা, দামেস্ক, কর্ডোভা, ফেজ — কাপড়, কাচ, কাগজ আর মশলা নিয়ে। খাতার প্রথম পাতায় শুধু দুটো সংখ্যা লেখা থাকে: মোট বিক্রি আর মোট কেনা। বহু বছর ধরে সিনা এই দুটো সংখ্যার ফারাক দেখে ভেবেছে ব্যবসা ভালোই চলছে। কিন্তু গত দুই মৌসুমে বিক্রি বেড়েছে প্রায় দ্বিগুণ, অথচ হাতে যে টাকা থাকছে তা আগের চেয়েও কম। একদিন রাতে সে সিদ্ধান্ত নিল — এবার সে খাতার প্রথম পাতা নয়, শেষ পাতাগুলো খুলবে, যেখানে কেরানি ফাতিমা প্রতিদিনের ছোট ছোট খরচগুলো টুকে রাখে।

সেখানেই আসল ছবিটা বেরিয়ে এল। মাল কেনার দাম আসলে তার সবচেয়ে বড় খরচই নয়। প্রতিটা শহরের ফটকে ঢুকতে-বেরোতে যে টোল দিতে হয় — বুখারার ফটকে এক দর, দামেস্কে তিন গুণ, কর্ডোভায় প্রায় দশ গুণ — সেই টোলের যোগফলই বছরের সবচেয়ে বড় লাইন। মজার ব্যাপার, মাল ভেতরে আনতে কেউ টাকা চায় না; টাকা লাগে বের করার সময়। তারপর গুদাম। সিনা শহরের মাঝখানে দামি একটা গুদাম ভাড়া নিয়ে রেখেছে, আর তার এক-তৃতীয়াংশ ভরে আছে এমন কাচের বাক্সে যেগুলো তিন বছরেও একবার নাড়া হয়নি। শহরের বাইরে সস্তা গুদাম আছে, কিন্তু সেখান থেকে মাল আনতে গেলে আলাদা গাড়ি ভাড়া আর দুই দিন সময় লাগে — তাই সে কখনো সরায়নি, আর প্রতি মাসে দামি ভাড়া গুনেই যাচ্ছে।

তারপর উট। সিনার আস্তাবলে চল্লিশটা উট, কারণ ঈদের আগের মৌসুমে একবার চল্লিশটাই লেগেছিল। বাকি নয় মাস গড়ে বারোটা উট কাজে লাগে, বাকি আটাশটা দাঁড়িয়ে দাঁড়িয়ে খায় — খাবার, রাখাল, চিকিৎসা, সবই পুরো বছরের। আর সবচেয়ে হাস্যকর খরচটা সে আবিষ্কার করল নিজের উঠোনেই: গুদামের পূর্ব ঘর থেকে পশ্চিম ঘরে মাল সাজাতে সে কুলি রেখেছে, আর কুলিরা এক-একটা বাক্স করে সারা দিন উঠোন পার হয় — দিনে হয়তো তিনশো বার। প্রতিবার পারাপারের একটা মজুরি আছে। একবারে দশটা বাক্স নিলে যা লাগত, এক-এক করে নিতে তার প্রায় ছয় গুণ লেগেছে — শুধু হাঁটার মজুরিতেই, মালের গায়ে এক পয়সাও যোগ না করে।

শেষ রাতে ফাতিমা একটা নতুন হিসাব বানাল, যেটা সিনা আগে কখনো চায়নি: মোট লাভ নয়, **প্রতি বাক্সে লাভ**। প্রতিটা বাক্সের গায়ে বসল তার নিজের ভাগের টোল, গুদাম-ভাড়া, উটের খরচ আর কুলির মজুরি। তখন দেখা গেল কর্ডোভার কাচের বাক্সে প্রতি বাক্সে লোকসান, অথচ বুখারার কাগজে বেশ ভালো লাভ — শুধু বিক্রি দেখে এটা জীবনেও ধরা পড়ত না। সিনা সেই রাতেই তিনটা সিদ্ধান্ত নিল: কর্ডোভার চালান কমাবে না, বরং কম চালানে বেশি মাল পাঠাবে; পুরনো কাচ শহরের বাইরের সস্তা গুদামে সরাবে, যদিও লাগলে আনতে দুই দিন সময় লাগবে; আর মৌসুমের বাইরে উট ভাড়ায় খাটাবে।

মিলিয়ে নিই: শহরের ফটকে বের হওয়ার টোল হলো **egress bandwidth** — ডেটা ভেতরে আনা প্রায় ফ্রি, বের করাই দামি। দামি গুদামে পড়ে থাকা তিন বছরের পুরনো কাচ হলো ভুল **storage class** — hot tier-এ রাখা cold data, আর শহরের বাইরের সস্তা গুদাম থেকে আনতে যে বাড়তি গাড়ি-ভাড়া ও দেরি, সেটাই **retrieval cost** আর retrieval latency। মৌসুমের বাইরে দাঁড়িয়ে থাকা আটাশটা উট হলো **idle / over-provisioned capacity** — peak-এর জন্য কেনা, কিন্তু বিল সারা বছরের। উঠোন পার হয়ে এক-এক বাক্স বওয়া কুলিরা হলো **cross-AZ chatter** এবং chatty service boundary — প্রতিটা hop-এর নিজের দাম আছে, আর batching না করলে সেই দাম গুণিতক হয়ে বাড়ে। আর ফাতিমার "প্রতি বাক্সে লাভ" হলো **unit economics** — cost per request, cost per active user, cost per tenant। এই একটামাত্র হিসাব ছাড়া মোট বিল দেখে আপনি কোনোদিন জানবেন না আপনার সিস্টেমের কোন অংশটা আপনাকে ডুবাচ্ছে।

## আর্কিটেকচারকে বিল হিসেবে পড়া

সিস্টেম ডিজাইনের ডায়াগ্রামে আমরা box আঁকি আর arrow টানি। বেশিরভাগ ইঞ্জিনিয়ার box নিয়ে ভাবে — কোন ডেটাবেস, কোন queue, কত replica। কিন্তু ক্লাউডের বিলে box-এর দাম প্রায়ই arrow-এর দামের চেয়ে কম। **প্রতিটা arrow মানে বাইট নড়াচড়া, আর প্রতিটা বাইট নড়াচড়ার একটা রেট আছে** — সেটা একই AZ-এর ভেতরে হলে প্রায় শূন্য, AZ পেরোলে সামান্য, region পেরোলে বেশি, আর ইন্টারনেটে বেরোলে সবচেয়ে বেশি।

কস্ট ইঞ্জিনিয়ারিংয়ের প্রথম দক্ষতা তাই খুব সাদামাটা: একটা আর্কিটেকচার ডায়াগ্রামের দিকে তাকিয়ে সেটাকে একটা invoice হিসেবে পড়তে পারা। প্রতিটা box-এ লিখুন কত vCPU আর কত GB RAM কত ঘণ্টা চলবে; প্রতিটা arrow-এ লিখুন প্রতি রিকোয়েস্টে কত KB যাবে আর সেই arrow কোন সীমানা পার হচ্ছে; প্রতিটা datastore-এ লিখুন কত GB, কোন tier, আর মাসে কত GB পড়া হয়।

<Mermaid
title="Where the Money Leaks in a Typical Architecture"
code={`graph TD
  U["Users<br/>internet"] -->|"internet egress<br/>highest rate"| CDN["CDN Edge<br/>hit ratio decides origin load"]
  CDN -->|"origin fetch<br/>egress from origin"| LB["Load Balancer<br/>per-LCU + per-GB"]
  LB -->|"cross-AZ hop<br/>billed both ways"| API["API Service<br/>provisioned for peak"]
  API -->|"chatty calls<br/>N per request"| SVC["Catalog Service<br/>cross-AZ replicas"]
  API --> CACHE["Redis<br/>managed premium"]
  SVC -->|"read replicas<br/>cross-AZ replication"| DB["Primary DB<br/>idle at night"]
  DB -->|"continuous replication<br/>cross-region egress"| DR["Standby Region<br/>paid, mostly idle"]
  API -->|"logs + traces<br/>often 3rd largest line"| OBS["Observability<br/>per-GB ingest + retention"]
  DB --> OBJ["Object Store<br/>hot tier holding cold data"]`}
/>

এই একটা ডায়াগ্রামেই ছয়টা আলাদা টাকা-ফুটো আছে, আর তার একটাও "সার্ভার বেশি দামি" নয়। CDN-এর hit ratio কমলে origin fetch বাড়ে (অধ্যায় ১৫-এর edge caching এখানে সরাসরি টাকার হিসাব)। API আর Catalog-এর মধ্যে chatty boundary মানে প্রতিটা ইউজার-রিকোয়েস্টে একাধিক cross-AZ hop। DR region-টা প্রায় পুরোটা idle কিন্তু বিল সম্পূর্ণ। আর observability pipeline — যেখানে আপনি অধ্যায় ১৮-এ metrics, logs, traces বসিয়েছিলেন — প্রায়ই কোম্পানির তৃতীয় বৃহত্তম ক্লাউড লাইন হয়ে দাঁড়ায়।

<Callout type="tip">

একটা ডায়াগ্রাম রিভিউ করার সময় নিজেকে তিনটা প্রশ্ন করুন: এই arrow-টা কোন সীমানা পার হচ্ছে? এই arrow-এ প্রতি রিকোয়েস্টে কত বাইট? এই arrow কি প্রতি রিকোয়েস্টে একবার, নাকি N বার? তৃতীয় প্রশ্নের উত্তরই সাধারণত সবচেয়ে বড় সংখ্যা বের করে আনে।

</Callout>

## আসল cost driver কোনগুলো

নতুন ইঞ্জিনিয়াররা ধরে নেয় বিলের বড় অংশ compute। বাস্তবে একটা পরিণত, ট্র্যাফিক-ভারী সিস্টেমে compute প্রায়ই অর্ধেকেরও কম, আর বাকিটা এমন সব লাইনে ছড়িয়ে থাকে যেগুলো আর্কিটেকচার ডায়াগ্রামে দেখাই যায় না।

নিচের ভাগগুলো আনুমানিক এবং illustrative — সঠিক সংখ্যা প্রোভাইডার, region আর workload অনুযায়ী বদলায়। উদ্দেশ্য order of magnitude বোঝা, দর মুখস্থ করা নয়।

| Cost driver             | সাধারণ ভাগ (আনুমানিক) | কেন লুকিয়ে থাকে                                                      | সবচেয়ে কার্যকর লিভার                         |
| ----------------------- | --------------------- | --------------------------------------------------------------------- | --------------------------------------------- |
| Compute (idle সহ)       | ৩০–৫০%                | provisioning peak ধরে হয়, বিল সারা মাসের                             | autoscaling, right-sizing, বাস্তব utilization |
| Internet egress         | ১০–৩০%                | ডেটা ঢোকা ফ্রি, তাই কেউ বেরোনোর হিসাব রাখে না                         | CDN hit ratio, compression, payload ছোট করা   |
| Observability data      | ৮–২০%                 | প্রতি সার্ভিস আলাদা করে log যোগ করে, কেউ যোগফল দেখে না                | sampling, cardinality, retention tier         |
| Storage (ভুল tier সহ)   | ৫–২০%                 | পুরনো ডেটা কেউ সরায় না, lifecycle policy নেই                         | lifecycle rule, tier + retrieval হিসাব        |
| Cross-AZ / cross-region | ৫–১৫%                 | ডায়াগ্রামে একটা সরু arrow, বিলে দুই দিকেই গোনা হয়                   | AZ-aware routing, batching, colocation        |
| Managed-service premium | ৫–১৫%                 | self-managed-এর তুলনায় ২০–৫০% বেশি, কিন্তু ops খরচ বিলে দেখা যায় না | সচেতন সিদ্ধান্ত, অন্ধভাবে নয়                 |

### Egress কেন সবচেয়ে বেশি অবাক করে

Ingress প্রায় সব প্রোভাইডারে ফ্রি, egress নয় — এটাই পুরো অর্থনীতিটাকে অসমমিত করে দেয়। ফল হলো, ডেটা ভেতরে টানার সিদ্ধান্তগুলো কেউ প্রশ্ন করে না, কিন্তু বছর দুয়েক পরে দেখা যায় সেই ডেটা প্রতিদিন কয়েকবার বাইরে বেরোচ্ছে। আরও খারাপ ব্যাপার, egress প্রায়ই আপনার সবচেয়ে সফল ফিচারের সাথে সরাসরি সমানুপাতিক — ইউজার বাড়লে ছবি, ভিডিও, API response সবই বেশি বেরোয়। তাই egress একটা variable cost যা revenue-র সাথে বাড়ে, আর সেজন্যই এটা unit economics-এর হিসাবে ঢুকতেই হবে।

### Idle capacity — যে খরচ কোনো কাজ করে না

Peak-এর জন্য provision করে সারা মাস বিল দেওয়াই সবচেয়ে সাধারণ অপচয়। একটা সার্ভিস যদি গড়ে ২০% CPU utilization-এ চলে, তবে তার compute বিলের ৮০% আসলে কিছুই করছে না। এটা সবসময় ভুল নয় — headroom দরকার, কারণ ১০০% utilization মানে প্রথম spike-এই SLO ভাঙা (অধ্যায় ১৮-এর error budget মনে করুন)। কিন্তু ৬০–৭০% গড় utilization একটা বাস্তব লক্ষ্য, আর ২০% মানে হয় autoscaling নেই, নয় instance size ভুল, নয় workload-টা আসলে event-driven হওয়ার কথা ছিল।

### Observability data — নীরবে বেড়ে ওঠা তৃতীয় বিল

প্রতিটা নতুন সার্ভিস কয়েকটা করে log line আর কয়েকটা label যোগ করে, আর কেউ কখনো যোগফল দেখে না। তিনটা জিনিস এখানে বিস্ফোরণ ঘটায়: প্রতি রিকোয়েস্টে debug-level log, উচ্চ-cardinality label (যেমন metric-এ user id বা request id বসিয়ে দেওয়া), আর সব কিছুর জন্য একই দীর্ঘ retention। সমাধান হলো tiering — সাম্প্রতিক ডেটা দামি hot store-এ, পুরনো ডেটা সস্তা archive-এ; error trace ১০০% রাখুন, success trace ১%-এ sample করুন।

<Callout type="warning">

Observability খরচ কমাতে গিয়ে incident-এর সময় যা দরকার সেটাই কেটে ফেলবেন না। নিয়ম সহজ: SLI গণনায় যে সিগন্যাল লাগে, আর যে সিগন্যাল ছাড়া গত ছয় মাসের কোনো incident debug করা যেত না — সেগুলো অছোঁয়া। বাকিটা sample বা drop করার প্রার্থী।

</Callout>

## Storage tier — দাম শুধু মাসিক ভাড়ায় নয়

Storage class বেছে নেওয়ার সময় বেশিরভাগ মানুষ শুধু GB-মাসের দর দেখে, আর retrieval cost ও retrieval latency ভুলে যায়। এটাই সবচেয়ে দামি ভুলগুলোর একটা: archive tier-এ রাখা ডেটা যদি মাসে দুইবার পুরোটা পড়া হয়, তবে সেটা hot tier-এর চেয়ে বেশি খরচ করবে।

সংখ্যাগুলো আনুমানিক, শুধু অনুপাত বোঝানোর জন্য।

| Tier                     | GB-মাস (আনুমানিক) | Retrieval প্রতি GB | প্রথম বাইট আসতে | কীসের জন্য                                |
| ------------------------ | ----------------- | ------------------ | --------------- | ----------------------------------------- |
| Hot (standard)           | $0.023            | ~$0                | মিলিসেকেন্ড     | সক্রিয় ডেটা, প্রতিদিন পড়া হয়           |
| Warm (infrequent access) | $0.0125           | ~$0.01             | মিলিসেকেন্ড     | মাসে দুই-একবার পড়া, কিন্তু দ্রুত লাগবে   |
| Cold                     | $0.004            | ~$0.02             | মিনিট           | quarterly রিপোর্ট, পুরনো tenant export    |
| Archive (deep)           | $0.001            | ~$0.09             | ঘণ্টা           | compliance, legal hold, কখনো না পড়ার আশা |

### ব্রেক-ইভেন হিসাব

কোন tier সস্তা সেটা নির্ভর করে access frequency-র উপর। ব্রেক-ইভেন বের করার সূত্রটা সরল, আর এটা প্রতিটা lifecycle policy লেখার আগে একবার করে কষে নেওয়া উচিত:

```text
monthly_cost(tier) = size_gb * storage_rate(tier)
                   + reads_per_month * read_fraction * size_gb * retrieval_rate(tier)

Example: 10 TB dataset, read fully once per month
  hot     = 10240 * 0.023  + 0                    = $235.52
  warm    = 10240 * 0.0125 + 10240 * 0.01         = $230.40
  cold    = 10240 * 0.004  + 10240 * 0.02         = $245.76
  archive = 10240 * 0.001  + 10240 * 0.09         = $931.84

Same dataset, read fully once per year (1/12 per month)
  hot     = 235.52
  warm    = 128.00 + 8.53   = $136.53
  cold    = 40.96  + 17.07  = $58.03
  archive = 10.24  + 76.80  = $87.04   <- still not the cheapest
```

লক্ষ করুন archive দুইটা ক্ষেত্রেই জেতেনি। Archive তখনই জেতে যখন ডেটা বছরে একবারও পুরোটা পড়া হয় না — অর্থাৎ যখন আপনি সত্যিই আশা করছেন এটা কখনো পড়তে হবে না। "সস্তা tier মানেই সস্তা" ভেবে lifecycle rule লেখাটাই এখানে ফাঁদ।

<Callout type="info">

Retrieval-এর দ্বিতীয় দামটা টাকায় নয়, সময়ে। Archive থেকে ফেরত আনতে ঘণ্টা লাগে — তাই যে ডেটা কোনো incident-এর সময় লাগতে পারে, সেটা কখনো archive-এ পাঠাবেন না, দর যতই লোভনীয় হোক।

</Callout>

## Unit economics — মোট বিল থেকে প্রতি-একক খরচে নামা

মোট মাসিক বিল একটা প্রায় অকেজো সংখ্যা। ট্র্যাফিক বাড়লে বিল বাড়বেই; সেটা ভালো খবর না খারাপ খবর, মোট সংখ্যা দেখে বলা যায় না। যেটা বলা যায় সেটা হলো **cost per unit** — প্রতি রিকোয়েস্টে, প্রতি active user-এ, প্রতি tenant-এ কত খরচ হচ্ছে। এই সংখ্যাটা যদি ট্র্যাফিকের সাথে কমে, আপনার আর্কিটেকচারে economies of scale আছে; যদি বাড়ে, কোথাও একটা super-linear খরচ লুকিয়ে আছে (প্রায় সবসময় fan-out বা cross-AZ chatter)।

তিনটা একক সবচেয়ে কাজে লাগে:

- **Cost per request** — আর্কিটেকচারের দক্ষতার সরাসরি মাপ। রিলিজের সাথে সাথে ট্র্যাক করলে regression ধরা পড়ে।
- **Cost per monthly active user** — প্রোডাক্টের অর্থনীতির মাপ। এটাকে ARPU-র পাশে রাখলে gross margin বেরিয়ে আসে।
- **Cost per tenant** — B2B-তে সবচেয়ে জরুরি। কারণ tenant-দের বণ্টন প্রায় সবসময় ভয়ানক অসম: শীর্ষ ৫% tenant প্রায়ই ৫০%-এর বেশি খরচ করে।

### Attribution — কোন খরচ কার

খরচ মাপা সহজ, খরচ **attribute** করা কঠিন। শেয়ার্ড infrastructure-এ কোনো একটা EC2 instance বা Redis cluster একসাথে বহু tenant-কে সার্ভ করে, তাই বিল সরাসরি ভাগ করা যায় না। বাস্তবে তিন স্তরে কাজ হয়:

1. **Tagging** — প্রতিটা resource-এ `team`, `service`, `environment`, `tenant-tier` tag বাধ্যতামূলক করুন, আর tag ছাড়া resource তৈরি হতে না দেওয়ার policy বসান। এটা shared নয় এমন খরচকে সরাসরি দায়ী করে।
2. **Metered units** — shared খরচের জন্য প্রতিটা tenant-এর ব্যবহার নিজে মাপুন: request সংখ্যা, egress বাইট, storage GB-hour, compute milliseconds, log GB। এটাই অধ্যায় ২২-এর per-tenant isolation-এর সাথে সরাসরি যুক্ত — যে সীমানা দিয়ে আপনি isolation করেছেন, সেই সীমানা দিয়েই metering হয়।
3. **Allocation** — অবশিষ্ট যে খরচ কোনোভাবেই ভাগ করা যায় না (control plane, CI, security tooling), সেটাকে একটা ঘোষিত নিয়মে ছড়িয়ে দিন — যেমন metered খরচের অনুপাতে — এবং সেই নিয়মটা লিখে রাখুন, যাতে পরে কেউ সংখ্যা নিয়ে তর্ক না করে।

<Mermaid
title="From Raw Bill to Per-Tenant Unit Cost"
code={`graph TD
  BILL["Cloud invoice<br/>one big number"] --> SPLIT["Split by resource tags<br/>team / service / env"]
  SPLIT --> DIRECT["Directly attributable<br/>dedicated resources"]
  SPLIT --> SHARED["Shared pool<br/>needs metering"]
  SHARED --> METER["Per-tenant meters<br/>requests, egress GB,<br/>storage GB-hour, compute ms"]
  METER --> ALLOC["Allocate shared cost<br/>pro rata by metered units"]
  DIRECT --> UNIT["Unit cost<br/>per request / user / tenant"]
  ALLOC --> UNIT
  UNIT --> MARGIN["Gross margin per tenant<br/>revenue minus cost"]
  MARGIN --> ACT["Action:<br/>price, optimise, or cap"]`}
/>

### একটা কস্ট মডেল তৈরি করা

নিচের প্রোগ্রামটা একটা আর্কিটেকচার (সার্ভিস, স্টোরেজ) আর একটা ট্র্যাফিক প্রোফাইল নিয়ে মাসিক বিল, cost per request, cost per active user আর প্রতি tenant-এর gross margin বের করে। এটাই সেই হিসাব যেটা spreadsheet-এ না রেখে কোডে রাখলে প্রতিটা ডিজাইন রিভিউতে আবার চালানো যায়।

```typescript
// Architecture cost model: turns a topology + traffic profile into a monthly
// bill, unit costs, and a per-tenant margin breakdown.
// All rates are illustrative; replace with your provider's published prices.

type StorageClass = 'hot' | 'warm' | 'cold' | 'archive';

interface PricingSheet {
	vcpuHour: number;
	gbRamHour: number;
	storageGbMonth: Record<StorageClass, number>;
	retrievalPerGb: Record<StorageClass, number>;
	egressInternetPerGb: number;
	egressCrossAzPerGb: number;
	egressCrossRegionPerGb: number;
	logIngestPerGb: number;
	logRetentionPerGbMonth: number;
	managedPremium: number; // multiplier on compute for managed services
}

const DEFAULT_PRICING: PricingSheet = {
	vcpuHour: 0.034,
	gbRamHour: 0.0045,
	storageGbMonth: { hot: 0.023, warm: 0.0125, cold: 0.004, archive: 0.001 },
	retrievalPerGb: { hot: 0, warm: 0.01, cold: 0.02, archive: 0.09 },
	egressInternetPerGb: 0.085,
	egressCrossAzPerGb: 0.02,
	egressCrossRegionPerGb: 0.02,
	logIngestPerGb: 0.5,
	logRetentionPerGbMonth: 0.03,
	managedPremium: 1.35
};

const HOURS_PER_MONTH = 730;
const KB_PER_GB = 1024 * 1024;

interface ServiceSpec {
	name: string;
	vcpu: number;
	ramGb: number;
	baseReplicas: number; // replicas running off-peak
	peakReplicas: number; // replicas running during peak window
	peakHoursPerDay: number;
	avgCpuUtilisation: number; // 0..1, measured, not hoped for
	managed: boolean;
	crossAzCallsPerRequest: number; // calls that leave the AZ, per origin request
	crossAzPayloadKb: number;
}

interface StorageSpec {
	name: string;
	tier: StorageClass;
	sizeGb: number;
	monthlyReadGb: number; // how much is actually read back per month
	crossRegionReplication: boolean;
	monthlyWriteGb: number; // drives cross-region replication egress
}

interface TrafficProfile {
	monthlyRequests: number;
	monthlyActiveUsers: number;
	cacheHitRatio: number; // fraction served by CDN/edge, never reaching origin
	avgResponseKb: number; // bytes leaving to the internet, cached or not
	logBytesPerRequest: number;
	logRetentionMonths: number;
}

interface TenantUsage {
	tenantId: string;
	displayName: string;
	requestShare: number; // 0..1
	storageShare: number; // 0..1
	egressShare: number; // 0..1
	monthlyRevenue: number;
}

interface LineItem {
	label: string;
	amount: number;
	note: string;
}

interface CostReport {
	lines: LineItem[];
	total: number;
	idleWaste: number;
	costPerRequest: number;
	costPerActiveUser: number;
	tenants: TenantCost[];
}

interface TenantCost {
	tenantId: string;
	displayName: string;
	allocatedCost: number;
	monthlyRevenue: number;
	grossMarginPct: number;
}

function computeCost(
	services: ServiceSpec[],
	traffic: TrafficProfile,
	pricing: PricingSheet
): { lines: LineItem[]; idleWaste: number } {
	const lines: LineItem[] = [];
	let idleWaste = 0;
	const originRequests = traffic.monthlyRequests * (1 - traffic.cacheHitRatio);

	for (const svc of services) {
		const offPeakHours = Math.max(0, 24 - svc.peakHoursPerDay);
		const avgReplicas =
			(svc.baseReplicas * offPeakHours + svc.peakReplicas * svc.peakHoursPerDay) / 24;

		const hourlyRate = svc.vcpu * pricing.vcpuHour + svc.ramGb * pricing.gbRamHour;
		const premium = svc.managed ? pricing.managedPremium : 1;
		const monthly = avgReplicas * hourlyRate * premium * HOURS_PER_MONTH;

		lines.push({
			label: `compute:${svc.name}`,
			amount: monthly,
			note: `${avgReplicas.toFixed(1)} avg replicas, ${(svc.avgCpuUtilisation * 100).toFixed(0)}% utilised`
		});

		idleWaste += monthly * (1 - svc.avgCpuUtilisation);

		if (svc.managed) {
			const premiumCost = monthly - monthly / pricing.managedPremium;
			lines.push({
				label: `managed-premium:${svc.name}`,
				amount: 0, // already inside the compute line, reported for visibility
				note: `${premiumCost.toFixed(2)} of the compute line is managed-service premium`
			});
		}

		if (svc.crossAzCallsPerRequest > 0) {
			const crossAzGb =
				(originRequests * svc.crossAzCallsPerRequest * svc.crossAzPayloadKb) / KB_PER_GB;
			// Cross-AZ traffic is commonly billed on both sides of the hop.
			lines.push({
				label: `cross-az:${svc.name}`,
				amount: crossAzGb * pricing.egressCrossAzPerGb * 2,
				note: `${crossAzGb.toFixed(0)} GB over ${svc.crossAzCallsPerRequest} hops per request`
			});
		}
	}

	return { lines, idleWaste };
}

function storageCost(stores: StorageSpec[], pricing: PricingSheet): LineItem[] {
	return stores.flatMap((store) => {
		const atRest = store.sizeGb * pricing.storageGbMonth[store.tier];
		const retrieval = store.monthlyReadGb * pricing.retrievalPerGb[store.tier];
		const items: LineItem[] = [
			{
				label: `storage:${store.name}`,
				amount: atRest + retrieval,
				note: `${store.sizeGb} GB on ${store.tier}, ${store.monthlyReadGb} GB read back`
			}
		];
		if (store.crossRegionReplication) {
			items.push({
				label: `replication:${store.name}`,
				amount: store.monthlyWriteGb * pricing.egressCrossRegionPerGb,
				note: `${store.monthlyWriteGb} GB replicated to the standby region`
			});
		}
		return items;
	});
}

function egressCost(traffic: TrafficProfile, pricing: PricingSheet): LineItem {
	// Caching lowers origin compute, but the bytes still leave the network.
	const internetGb = (traffic.monthlyRequests * traffic.avgResponseKb) / KB_PER_GB;
	return {
		label: 'egress:internet',
		amount: internetGb * pricing.egressInternetPerGb,
		note: `${internetGb.toFixed(0)} GB to users, unaffected by cache hit ratio`
	};
}

function observabilityCost(traffic: TrafficProfile, pricing: PricingSheet): LineItem {
	const ingestGb = (traffic.monthlyRequests * traffic.logBytesPerRequest) / 1e9;
	const ingest = ingestGb * pricing.logIngestPerGb;
	// Retention bills the accumulated volume, not just this month's ingest.
	const retained = ingestGb * traffic.logRetentionMonths * pricing.logRetentionPerGbMonth;
	return {
		label: 'observability:logs',
		amount: ingest + retained,
		note: `${ingestGb.toFixed(0)} GB/month ingested, kept ${traffic.logRetentionMonths} months`
	};
}

export function buildCostReport(
	services: ServiceSpec[],
	stores: StorageSpec[],
	traffic: TrafficProfile,
	tenants: TenantUsage[],
	pricing: PricingSheet = DEFAULT_PRICING
): CostReport {
	const compute = computeCost(services, traffic, pricing);
	const lines: LineItem[] = [
		...compute.lines,
		...storageCost(stores, pricing),
		egressCost(traffic, pricing),
		observabilityCost(traffic, pricing)
	];

	const total = lines.reduce((sum, l) => sum + l.amount, 0);

	// Weight each tenant by the drivers it actually moves.
	const tenantCosts: TenantCost[] = tenants.map((t) => {
		const requestDriven = lines
			.filter((l) => l.label.startsWith('compute:') || l.label.startsWith('cross-az:'))
			.reduce((s, l) => s + l.amount, 0);
		const storageDriven = lines
			.filter((l) => l.label.startsWith('storage:') || l.label.startsWith('replication:'))
			.reduce((s, l) => s + l.amount, 0);
		const egressDriven = lines
			.filter((l) => l.label.startsWith('egress:') || l.label.startsWith('observability:'))
			.reduce((s, l) => s + l.amount, 0);

		const allocated =
			requestDriven * t.requestShare +
			storageDriven * t.storageShare +
			egressDriven * t.egressShare;

		const margin =
			t.monthlyRevenue > 0 ? ((t.monthlyRevenue - allocated) / t.monthlyRevenue) * 100 : -100;

		return {
			tenantId: t.tenantId,
			displayName: t.displayName,
			allocatedCost: allocated,
			monthlyRevenue: t.monthlyRevenue,
			grossMarginPct: margin
		};
	});

	return {
		lines,
		total,
		idleWaste: compute.idleWaste,
		costPerRequest: total / traffic.monthlyRequests,
		costPerActiveUser: total / traffic.monthlyActiveUsers,
		tenants: tenantCosts
	};
}

export function formatReport(report: CostReport): string {
	const out: string[] = ['--- monthly cost model ---'];
	for (const line of report.lines) {
		if (line.amount === 0 && line.label.startsWith('managed-premium')) {
			out.push(`  (info) ${line.label.padEnd(30)} ${line.note}`);
			continue;
		}
		out.push(`  ${line.label.padEnd(30)} $${line.amount.toFixed(2).padStart(12)}  # ${line.note}`);
	}
	out.push(`  ${'TOTAL'.padEnd(30)} $${report.total.toFixed(2).padStart(12)}`);
	out.push(`  ${'idle capacity waste'.padEnd(30)} $${report.idleWaste.toFixed(2).padStart(12)}`);
	out.push(`  cost per request      $${report.costPerRequest.toFixed(8)}`);
	out.push(`  cost per active user  $${report.costPerActiveUser.toFixed(4)}`);
	out.push('--- per tenant ---');
	for (const t of [...report.tenants].sort((a, b) => a.grossMarginPct - b.grossMarginPct)) {
		out.push(
			`  ${t.displayName.padEnd(22)} cost $${t.allocatedCost.toFixed(2).padStart(10)}` +
				`  revenue $${t.monthlyRevenue.toFixed(2).padStart(10)}` +
				`  margin ${t.grossMarginPct.toFixed(1)}%`
		);
	}
	return out.join('\n');
}

// --- Example: a mid-sized multi-tenant SaaS ---
const services: ServiceSpec[] = [
	{
		name: 'api-baghdad',
		vcpu: 4,
		ramGb: 8,
		baseReplicas: 6,
		peakReplicas: 20,
		peakHoursPerDay: 8,
		avgCpuUtilisation: 0.28,
		managed: false,
		crossAzCallsPerRequest: 3,
		crossAzPayloadKb: 12
	},
	{
		name: 'catalog-cordoba',
		vcpu: 2,
		ramGb: 4,
		baseReplicas: 4,
		peakReplicas: 9,
		peakHoursPerDay: 8,
		avgCpuUtilisation: 0.41,
		managed: false,
		crossAzCallsPerRequest: 1,
		crossAzPayloadKb: 6
	},
	{
		name: 'cache-samarkand',
		vcpu: 2,
		ramGb: 26,
		baseReplicas: 3,
		peakReplicas: 3,
		peakHoursPerDay: 8,
		avgCpuUtilisation: 0.55,
		managed: true,
		crossAzCallsPerRequest: 0,
		crossAzPayloadKb: 0
	}
];

const stores: StorageSpec[] = [
	{
		name: 'primary-postgres',
		tier: 'hot',
		sizeGb: 2400,
		monthlyReadGb: 9000,
		crossRegionReplication: true,
		monthlyWriteGb: 600
	},
	{
		name: 'document-archive',
		tier: 'hot',
		sizeGb: 41000,
		monthlyReadGb: 350,
		crossRegionReplication: false,
		monthlyWriteGb: 0
	}
];

const traffic: TrafficProfile = {
	monthlyRequests: 900_000_000,
	monthlyActiveUsers: 240_000,
	cacheHitRatio: 0.74,
	avgResponseKb: 34,
	logBytesPerRequest: 900,
	logRetentionMonths: 6
};

const tenants: TenantUsage[] = [
	{
		tenantId: 'tenant_ibn_sina',
		displayName: 'Ibn Sina Clinic',
		requestShare: 0.34,
		storageShare: 0.52,
		egressShare: 0.4,
		monthlyRevenue: 14000
	},
	{
		tenantId: 'tenant_al_khwarizmi',
		displayName: 'Al-Khwarizmi Labs',
		requestShare: 0.21,
		storageShare: 0.11,
		egressShare: 0.18,
		monthlyRevenue: 9000
	},
	{
		tenantId: 'tenant_al_biruni',
		displayName: 'Al-Biruni Survey',
		requestShare: 0.09,
		storageShare: 0.06,
		egressShare: 0.08,
		monthlyRevenue: 1200
	},
	{
		tenantId: 'tenant_fatima_al_fihri',
		displayName: 'Fatima al-Fihri Trust',
		requestShare: 0.36,
		storageShare: 0.31,
		egressShare: 0.34,
		monthlyRevenue: 21000
	}
];

console.log(formatReport(buildCostReport(services, stores, traffic, tenants)));
```

মডেলটা চালালে যে জিনিসটা সবচেয়ে চোখে পড়ে সেটা হলো `document-archive` — ৪১ TB ডেটা hot tier-এ পড়ে আছে অথচ মাসে মাত্র ৩৫০ GB পড়া হয়। warm tier-এ সরালে at-rest খরচ প্রায় অর্ধেক হয়, retrieval যোগ করেও অনেক কম থাকে। দ্বিতীয় জিনিসটা হলো Al-Biruni Survey — সবচেয়ে ছোট revenue, কিন্তু ব্যবহারের অনুপাতে খরচ এত যে তার gross margin নেতিবাচক। মোট বিল দেখে এর কোনোটাই ধরা পড়ত না।

<Callout type="warning">

কস্ট মডেলকে সত্য ভাববেন না — এটা একটা hypothesis। মডেলের আউটপুট সবসময় আসল invoice-এর সাথে মিলিয়ে দেখুন। ২০%-এর বেশি ফারাক মানে আপনার মডেলে একটা cost driver অনুপস্থিত, আর সেই অনুপস্থিত driver-টাই সাধারণত পরের মাসের চমক।

</Callout>

## Caching, batching আর compression — কখন নিজের দাম তুলে আনে

এই তিনটা টুলকে সাধারণত latency-র হাতিয়ার হিসেবে শেখানো হয়। কস্টের চোখে এদের চরিত্র আলাদা, আর সেই চরিত্র না বুঝলে ভুল জায়গায় optimize করা হয়।

### Cache hit ratio বনাম origin cost

Cache hit ratio বাড়ানোর টাকা-লাভ রৈখিক নয়। origin-এ যাওয়া লোড হলো `1 - hit_ratio`, তাই ০.৫ থেকে ০.৭৫-এ গেলে origin লোড অর্ধেক হয়, কিন্তু ০.৯০ থেকে ০.৯৫-এ গেলেও আবার অর্ধেক হয়। অর্থাৎ hit ratio যত উপরে, প্রতিটা অতিরিক্ত শতাংশ তত বেশি দামি — কিন্তু ততই বেশি লাভজনকও।

```text
origin_cost = base_origin_cost * (1 - hit_ratio)

hit_ratio   origin load   origin cost (base $10,000)
0.00        100%          $10,000
0.50         50%           $5,000
0.75         25%           $2,500
0.90         10%           $1,000
0.95          5%             $500
0.99          1%             $100

Marginal saving of the last 5 points (0.90 -> 0.95): $500/month
Cost of a bigger edge cache tier to get there:       $700/month
=> not worth it at this scale; revisit at 3x traffic
```

কিন্তু একটা কথা মনে রাখা জরুরি: **caching egress কমায় না**। CDN থেকে সার্ভ করা বাইটও ইউজারের কাছে যায়, আর তারও দাম আছে (সাধারণত origin egress-এর চেয়ে সস্তা, কিন্তু শূন্য নয়)। Cache origin-এর compute, ডেটাবেসের load আর cross-AZ chatter কমায় — internet egress নয়। যারা egress বিল কমাতে cache tuning করতে বসে, তারা ভুল লিভার ধরে টানছে; সেখানে আসল লিভার হলো payload ছোট করা, compression, আর কম ঘন ঘন polling।

### Batching বনাম per-call overhead

Batching-এর কস্ট-লাভ আসে fixed per-call overhead থেকে। প্রতিটা কলে একটা constant খরচ থাকে (connection, header, TLS, per-request pricing, cross-AZ hop), আর একটা variable খরচ থাকে (payload)। Batch size বাড়ালে constant অংশটা ভাগ হয়ে যায়:

```text
cost_per_item = fixed_per_call / batch_size + variable_per_item

fixed_per_call     = $0.0000040   (cross-AZ hop + request unit)
variable_per_item  = $0.0000002

batch_size   cost_per_item   relative
1            $0.00000420     100%
10           $0.00000060      14%
100          $0.00000024       6%
1000         $0.00000021       5%
```

লক্ষ করুন লাভের প্রায় পুরোটা ১০০-এর মধ্যেই এসে যায়। batch size ১০০ থেকে ১০০০ করলে খরচ আর তেমন কমে না, কিন্তু latency, memory footprint আর ব্যর্থতার blast radius সবই বাড়ে — একটা batch ফেল করলে হাজারটা আইটেম আবার করতে হয়। তাই batching-এর সঠিক সীমা কস্ট নয়, বরং কস্ট-লাভ যেখানে সমতল হয়ে যায় তার ঠিক আশেপাশে।

### Compression বনাম CPU

Compression egress-এর বিনিময়ে CPU কেনে। লাভজনক কিনা তা ঠিক করে একটা সরল অনুপাত:

```text
saving = bytes_saved_gb * egress_rate_per_gb
cost   = cpu_seconds_spent * vcpu_hour_rate / 3600

Text/JSON, gzip level 6:  ~70% smaller, ~40 MB/s per core
  1 TB/month response bytes -> 700 GB saved -> $59.50 saved
  1 TB compressed at 40 MB/s = 26,214 CPU-seconds = $0.25
  => ~240x return. Always compress text.

Already-compressed media (JPEG, MP4, ZIP): ~0-2% smaller
  => pure CPU burn, sometimes larger output. Never re-compress.

Small payloads (< 1 KB): header overhead dominates
  => compress above a size threshold only.
```

এখানেই কস্ট ইঞ্জিনিয়ারিংয়ের একটা সাধারণ সত্য দেখা যায়: টেক্সট compression প্রায় সবসময় জেতে, কিন্তু "সব কিছু compress করো" নিয়মটা মিডিয়ার উপর প্রয়োগ করলে শুধু CPU পোড়ে।

<Callout type="tip">

তিনটাই যেখানে কাজ করে না: hit ratio খুব কম আর ট্র্যাফিক long-tail (প্রতিটা key প্রায় একবার পড়া হয়) হলে cache শুধু খরচ যোগ করে; workload যদি একেবারেই low-volume হয় তবে batching-এর জটিলতা কোনো টাকা বাঁচায় না; আর payload যদি ছোট বা ইতিমধ্যেই compressed হয় তবে compression একটা নিট লোকসান।

</Callout>

## Cost pressure কখন design বদলানোর কারণ, কখন নয়

এটা এই অধ্যায়ের সবচেয়ে গুরুত্বপূর্ণ অংশ, কারণ এখানেই বেশিরভাগ ক্ষতি হয়। কস্ট একটা বৈধ ইঞ্জিনিয়ারিং constraint, কিন্তু এটা সব constraint-এর সমান নয়।

### যা কখনো cost দিয়ে কেনা যায় না

**Correctness।** টাকা বাঁচাতে গিয়ে ledger-এর double-entry ফেলে দেওয়া, বা idempotency key-এর storage কমানো, বা replication factor এমন জায়গায় নামানো যেখানে ডেটা হারাতে পারে — এগুলো optimization নয়, এগুলো ঋণ যেটা সুদসহ ফেরত দিতে হবে। একটা corrupted ledger সারানোর খরচ কখনোই সেই storage-এর দামের কাছাকাছি নয়।

**Security।** encryption at rest বন্ধ করা, audit log-এর retention কমিয়ে compliance-এর নিচে নামানো, বা tenant isolation শিথিল করে instance ভাগ করা — এগুলো একটা breach-এর সম্ভাবনার বিনিময়ে সামান্য কিছু ডলার বাঁচায়। অধ্যায় ২২-এর isolation boundary আপনার সবচেয়ে দামি লাইন হতে পারে, কিন্তু সেটা কস্ট-অপ্টিমাইজেশনের বিষয় নয়।

**ঘোষিত reliability।** SLO যদি বাইরে ঘোষিত থাকে, তবে সেটা একটা প্রতিশ্রুতি। কস্টের চাপে redundancy কমিয়ে SLO ভাঙা মানে চুপচাপ কাস্টমারের সাথে চুক্তি ভাঙা। তবে এখানে একটা সূক্ষ্ম ব্যতিক্রম আছে: আপনি যদি প্রয়োজনের চেয়ে **বেশি** reliability কিনে থাকেন — যেমন ৯৯.৯% SLO-র জন্য ৯৯.৯৯%-এর architecture — তবে সেই অতিরিক্তটুকু কমানো বৈধ, কারণ error budget আপনাকে বলছে আপনি budget খরচই করছেন না।

### যখন cost একটা genuine architectural signal

মাঝে মাঝে একটা লাইন-আইটেম আসলে কস্টের সমস্যা নয়, ডিজাইনের সমস্যা — কস্ট শুধু তার লক্ষণ। এই ক্ষেত্রে বিল কমানোর সঠিক উপায় হলো ডিজাইন ঠিক করা, দর-কষাকষি নয়।

| যা বিলে দেখেন                             | আসল সমস্যা                                      | সঠিক ব্যবস্থা                                                |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| বিশাল cross-AZ egress                     | Chatty service boundary, ভুল জায়গায় কাটা      | Boundary পুনর্বিন্যাস, batching, AZ-aware routing            |
| Hot tier-এ পড়ে থাকা পুরনো ডেটা           | Lifecycle policy নেই, ownership নেই             | Tiering + retention policy, ডেটার মালিক নির্ধারণ             |
| Compute বিল ট্র্যাফিকের চেয়ে দ্রুত বাড়ে | Super-linear fan-out (অধ্যায় ১২-এর fan-out)    | Fan-out কমানো, read model বা materialised view               |
| Observability খরচ compute-এর সমান         | Cardinality বিস্ফোরণ, sampling নেই              | Label নিয়ন্ত্রণ, trace sampling, tiered retention           |
| Idle capacity বিলের বড় অংশ               | Provisioning peak-ভিত্তিক, autoscaling অকার্যকর | Scaling signal ঠিক করা, right-sizing, spot/burst capacity    |
| একটা tenant-এর margin নেতিবাচক            | Pricing model ব্যবহারের সাথে মেলে না            | Usage-ভিত্তিক pricing, quota, বা tenant-কে অন্য tier-এ সরানো |

<Callout type="warning">

কস্ট-অপ্টিমাইজেশন প্রজেক্ট শুরু করার আগে একবার প্রশ্ন করুন: এই কাজে যত ইঞ্জিনিয়ার-ঘণ্টা লাগবে, তার দাম কি বাঁচানো টাকার চেয়ে কম? মাসে ২০০ ডলার বাঁচাতে তিন সপ্তাহের রিফ্যাক্টর একটা লোকসান। কস্ট ইঞ্জিনিয়ারিংয়ের নিজেরও একটা unit economics আছে।

</Callout>

## Cost guardrail — বিল যেন চমক না হয়

কস্ট নিয়ে কাজ করার সবচেয়ে খারাপ ছন্দ হলো "মাসের শেষে invoice দেখে আঁতকে ওঠা"। ভালো ছন্দটা ঠিক observability-র মতো: continuous signal, threshold, alert, আর কে দায়িত্ব নেবে সেটা আগে থেকে ঠিক করা।

<Mermaid
title="Cost Guardrail Loop"
code={`graph TD
  M["Per-tenant meters<br/>requests, egress, storage, logs"] --> AGG["Hourly rollup<br/>usage to cost"]
  AGG --> BUD["Budget evaluation<br/>forecast vs monthly budget"]
  AGG --> ANO["Anomaly detection<br/>EWMA baseline + z-score"]
  BUD -->|"threshold crossed"| ALERT["Alert with owner<br/>team tag from resource"]
  ANO -->|"spike detected"| ALERT
  ALERT --> ACT["Action:<br/>throttle, page, or accept"]
  DEPLOY["Deploy pipeline"] --> REG["Cost-per-request check<br/>compare to previous release"]
  REG -->|"regression"| ALERT
  ACT --> CAP["Feeds capacity planning<br/>next quarter provisioning"]`}
/>

চারটে guardrail বাস্তবে সবচেয়ে কাজে দেয়:

- **Budget alert** — মাসিক budget-এর ৫০%, ৮০%, ১০০%-এ alert, তবে ক্যালেন্ডারের অগ্রগতির সাপেক্ষে। মাসের ৫ তারিখে ৫০% খরচ হয়ে যাওয়া আর ২৫ তারিখে ৫০% খরচ — সম্পূর্ণ ভিন্ন দুটো ঘটনা। তাই threshold-টা forecast-এর উপর বসান, spend-to-date-এর উপর নয়।
- **Anomaly detection** — গতকালের তুলনায় নয়, একটা rolling baseline-এর তুলনায়। একটা ভুল করে ছেড়ে দেওয়া debug log বা একটা runaway retry loop কয়েক ঘণ্টায় মাসের budget খেয়ে ফেলতে পারে, আর মাসিক invoice সেটা অনেক দেরিতে জানাবে।
- **Cost-per-deploy regression** — প্রতিটা রিলিজের পরে cost per request মেপে আগের রিলিজের সাথে তুলনা করুন। একটা N+1 query বা একটা নতুন cross-AZ কল latency-তে ধরা না পড়েও কস্টে স্পষ্ট দেখা দেয়। এটা performance regression test-এর অর্থনৈতিক যমজ।
- **Capacity planning-এর সাথে যোগসূত্র** — guardrail-এর ডেটাই পরের কোয়ার্টারের provisioning-এর ইনপুট। প্রতি-একক খরচ আর প্রবৃদ্ধির হার জানা থাকলে ছয় মাস পরের বিল অনুমান করা যায়, আর তখনই commitment বা reserved capacity নিয়ে আলোচনা অর্থবহ হয়।

নিচের সার্ভিসটা এই লুপের মাঝখানের অংশ — per-tenant usage metering, ঘণ্টাভিত্তিক rollup, budget threshold মূল্যায়ন আর EWMA-ভিত্তিক anomaly detection।

```typescript
// Per-tenant usage metering with budget alerts and cost anomaly detection.
// Meters accumulate in hourly buckets; a guardrail loop converts usage to
// cost, forecasts month-end spend, and flags statistical outliers.

type MeterUnit = 'requests' | 'egress_gb' | 'storage_gb_hour' | 'compute_ms' | 'log_gb';

const UNIT_PRICE: Record<MeterUnit, number> = {
	requests: 0.0000004,
	egress_gb: 0.085,
	storage_gb_hour: 0.0000315, // 0.023 per GB-month / 730
	compute_ms: 0.0000000135,
	log_gb: 0.5
};

interface UsageEvent {
	tenantId: string;
	unit: MeterUnit;
	quantity: number;
	at: number; // epoch ms
}

interface HourlyUsage {
	tenantId: string;
	hourStart: number;
	units: Partial<Record<MeterUnit, number>>;
	cost: number;
}

type AlertSeverity = 'info' | 'warning' | 'critical';

interface CostAlert {
	kind: 'budget_threshold' | 'forecast_overrun' | 'anomaly';
	severity: AlertSeverity;
	tenantId: string;
	message: string;
	at: number;
}

const HOUR_MS = 3_600_000;

function hourStartOf(ts: number): number {
	return Math.floor(ts / HOUR_MS) * HOUR_MS;
}

// --- 1. Usage meter -------------------------------------------------------
class UsageMeter {
	private buckets = new Map<string, HourlyUsage>();

	private key(tenantId: string, hourStart: number): string {
		return `${tenantId}|${hourStart}`;
	}

	record(event: UsageEvent): void {
		if (event.quantity < 0 || !Number.isFinite(event.quantity)) {
			throw new Error(`invalid quantity for ${event.tenantId}/${event.unit}`);
		}
		const hourStart = hourStartOf(event.at);
		const key = this.key(event.tenantId, hourStart);
		let bucket = this.buckets.get(key);
		if (!bucket) {
			bucket = { tenantId: event.tenantId, hourStart, units: {}, cost: 0 };
			this.buckets.set(key, bucket);
		}
		bucket.units[event.unit] = (bucket.units[event.unit] ?? 0) + event.quantity;
		bucket.cost += event.quantity * UNIT_PRICE[event.unit];
	}

	hourly(tenantId: string, fromHour: number, toHour: number): HourlyUsage[] {
		const out: HourlyUsage[] = [];
		for (let h = hourStartOf(fromHour); h <= hourStartOf(toHour); h += HOUR_MS) {
			const bucket = this.buckets.get(this.key(tenantId, h));
			out.push(bucket ?? { tenantId, hourStart: h, units: {}, cost: 0 });
		}
		return out;
	}

	spendBetween(tenantId: string, fromHour: number, toHour: number): number {
		return this.hourly(tenantId, fromHour, toHour).reduce((s, b) => s + b.cost, 0);
	}

	tenants(): string[] {
		return [...new Set([...this.buckets.values()].map((b) => b.tenantId))];
	}

	// Drop buckets older than the retention window so the meter stays bounded.
	prune(olderThan: number): number {
		let removed = 0;
		for (const [key, bucket] of this.buckets) {
			if (bucket.hourStart < olderThan) {
				this.buckets.delete(key);
				removed++;
			}
		}
		return removed;
	}
}

// --- 2. Budget guard ------------------------------------------------------
interface Budget {
	tenantId: string;
	monthlyLimit: number;
	owner: string; // team tag, so the alert has an addressee
}

class BudgetGuard {
	private budgets = new Map<string, Budget>();
	private fired = new Set<string>(); // tenant|threshold|month, prevents alert spam
	private readonly thresholds = [0.5, 0.8, 1.0];

	setBudget(budget: Budget): void {
		this.budgets.set(budget.tenantId, budget);
	}

	evaluate(tenantId: string, spendToDate: number, monthElapsed: number, now: number): CostAlert[] {
		const budget = this.budgets.get(tenantId);
		if (!budget || budget.monthlyLimit <= 0) return [];

		const alerts: CostAlert[] = [];
		const month = new Date(now).toISOString().slice(0, 7);
		const used = spendToDate / budget.monthlyLimit;

		for (const threshold of this.thresholds) {
			const key = `${tenantId}|${threshold}|${month}`;
			if (used >= threshold && !this.fired.has(key)) {
				this.fired.add(key);
				alerts.push({
					kind: 'budget_threshold',
					severity: threshold >= 1 ? 'critical' : threshold >= 0.8 ? 'warning' : 'info',
					tenantId,
					message:
						`${budget.owner}: ${tenantId} used ${(used * 100).toFixed(0)}% of a ` +
						`${budget.monthlyLimit} budget with ${((1 - monthElapsed) * 100).toFixed(0)}% of the month left`,
					at: now
				});
			}
		}

		// Forecast: straight-line projection to month end.
		if (monthElapsed > 0.1) {
			const projected = spendToDate / monthElapsed;
			const forecastKey = `${tenantId}|forecast|${month}`;
			if (projected > budget.monthlyLimit * 1.1 && !this.fired.has(forecastKey)) {
				this.fired.add(forecastKey);
				alerts.push({
					kind: 'forecast_overrun',
					severity: 'warning',
					tenantId,
					message:
						`${budget.owner}: ${tenantId} is on track for ${projected.toFixed(2)} ` +
						`against a ${budget.monthlyLimit} budget`,
					at: now
				});
			}
		}

		return alerts;
	}
}

// --- 3. Anomaly detector --------------------------------------------------
// Exponentially weighted mean and variance over hourly spend. A new hour is
// anomalous when it sits far outside the recent distribution, which catches
// runaway retries and accidental debug logging within the hour.
class AnomalyDetector {
	private mean = new Map<string, number>();
	private variance = new Map<string, number>();
	private samples = new Map<string, number>();

	constructor(
		private readonly alpha = 0.2,
		private readonly zThreshold = 3.5,
		private readonly minSamples = 24,
		private readonly floor = 1.0 // ignore noise below this hourly spend
	) {}

	observe(tenantId: string, hourlySpend: number, now: number): CostAlert | null {
		const n = (this.samples.get(tenantId) ?? 0) + 1;
		this.samples.set(tenantId, n);

		const prevMean = this.mean.get(tenantId) ?? hourlySpend;
		const prevVar = this.variance.get(tenantId) ?? 0;

		let alert: CostAlert | null = null;
		if (n > this.minSamples && hourlySpend > this.floor) {
			const stdDev = Math.sqrt(prevVar);
			const z = stdDev > 0 ? (hourlySpend - prevMean) / stdDev : 0;
			if (z > this.zThreshold) {
				alert = {
					kind: 'anomaly',
					severity: z > this.zThreshold * 2 ? 'critical' : 'warning',
					tenantId,
					message:
						`hourly spend ${hourlySpend.toFixed(2)} is ${z.toFixed(1)} sigma above ` +
						`baseline ${prevMean.toFixed(2)}`,
					at: now
				};
			}
		}

		// Update the baseline after scoring, so a spike does not hide itself.
		const diff = hourlySpend - prevMean;
		this.mean.set(tenantId, prevMean + this.alpha * diff);
		this.variance.set(tenantId, (1 - this.alpha) * (prevVar + this.alpha * diff * diff));

		return alert;
	}
}

// --- 4. Guardrail service -------------------------------------------------
class CostGuardrail {
	private lastScored = new Map<string, number>();

	constructor(
		private readonly meter: UsageMeter,
		private readonly budgets: BudgetGuard,
		private readonly detector: AnomalyDetector,
		private readonly sink: (alert: CostAlert) => void
	) {}

	record(event: UsageEvent): void {
		this.meter.record(event);
	}

	// Called once per hour by a scheduler.
	runCycle(now: number): CostAlert[] {
		const alerts: CostAlert[] = [];
		const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
		const daysInMonth = new Date(
			new Date(now).getUTCFullYear(),
			new Date(now).getUTCMonth() + 1,
			0
		).getUTCDate();
		const monthElapsed = (now - monthStart) / (daysInMonth * 24 * HOUR_MS);

		for (const tenantId of this.meter.tenants()) {
			const from = this.lastScored.get(tenantId) ?? hourStartOf(now) - HOUR_MS;
			for (const bucket of this.meter.hourly(tenantId, from, hourStartOf(now) - HOUR_MS)) {
				const anomaly = this.detector.observe(tenantId, bucket.cost, bucket.hourStart);
				if (anomaly) alerts.push(anomaly);
			}
			this.lastScored.set(tenantId, hourStartOf(now));

			const spend = this.meter.spendBetween(tenantId, monthStart, now);
			alerts.push(...this.budgets.evaluate(tenantId, spend, monthElapsed, now));
		}

		for (const alert of alerts) this.sink(alert);
		return alerts;
	}
}

// --- Example wiring -------------------------------------------------------
const meter = new UsageMeter();
const budgets = new BudgetGuard();
budgets.setBudget({ tenantId: 'tenant_ibn_sina', monthlyLimit: 9000, owner: 'team-baghdad' });
budgets.setBudget({ tenantId: 'tenant_al_biruni', monthlyLimit: 800, owner: 'team-cordoba' });

const guardrail = new CostGuardrail(meter, budgets, new AnomalyDetector(), (alert) =>
	console.log(`[COST ${alert.severity.toUpperCase()}] ${alert.kind} ${alert.message}`)
);

const t0 = Date.UTC(2026, 0, 12, 0, 0, 0);
for (let hour = 0; hour < 60; hour++) {
	const at = t0 + hour * HOUR_MS;
	// Steady baseline, then a runaway log volume spike in the final hour.
	const logGb = hour === 59 ? 320 : 4 + (hour % 5);
	guardrail.record({ tenantId: 'tenant_ibn_sina', unit: 'requests', quantity: 1_400_000, at });
	guardrail.record({ tenantId: 'tenant_ibn_sina', unit: 'egress_gb', quantity: 45, at });
	guardrail.record({ tenantId: 'tenant_ibn_sina', unit: 'log_gb', quantity: logGb, at });
}
guardrail.runCycle(t0 + 60 * HOUR_MS);
```

### এই ইমপ্লিমেন্টেশনটাকে প্রোডাকশন-যোগ্য করে যা

- **Hourly bucket** — মাসিক invoice-এর অপেক্ষা না করে ঘণ্টার দানায় সমস্যা ধরা পড়ে; runaway খরচ ঘণ্টায় ধরা পড়লে ক্ষতি হাজার গুণ কম।
- **Threshold deduplication** — একই threshold মাসে একবারই alert করে, তাই cost alert-কে কেউ mute করে ফেলে না। alert fatigue এখানে ঠিক ততটাই মারাত্মক যতটা on-call alerting-এ।
- **Forecast-ভিত্তিক alert** — spend-to-date নয়, month-end projection-এর তুলনায় বিচার; মাসের শুরুর দিকের বিস্ফোরণ তখনই ধরা পড়ে যখন কিছু করার সময় আছে।
- **Score-then-update baseline** — spike-টা আগে স্কোর করা হয়, তারপর baseline আপডেট হয়; উল্টো করলে বড় spike নিজেই নিজের baseline তুলে দিয়ে লুকিয়ে যেত।
- **Owner tag alert-এ** — প্রতিটা alert-এর সাথে দায়ী টিমের নাম যায়। মালিকহীন cost alert মানে যে alert কেউ পড়ে না।
- **Bounded memory** — pruning ছাড়া metering সার্ভিস নিজেই একটা খরচের উৎস হয়ে দাঁড়ায়, যা একটা বিশেষ রকমের বিদ্রুপ।

<Callout type="info">

Guardrail-এর ডেটা শুধু alert-এর জন্য নয় — এটাই capacity planning-এর ইনপুট। প্রতি-tenant metered unit-এর তিন মাসের ইতিহাস থাকলে পরের কোয়ার্টারের compute, storage আর egress-এর চাহিদা যুক্তিসঙ্গতভাবে অনুমান করা যায়, আর তখনই commitment বা reserved capacity নিয়ে সিদ্ধান্ত নেওয়া নিরাপদ। Commitment মানে ছাড়ের বিনিময়ে নমনীয়তা বিক্রি করা — তাই এটা কেবল সেই বেসলাইনটুকুর জন্য কিনুন যেটা নিয়ে আপনি নিশ্চিত।

</Callout>

## অনুশীলনের ছন্দ

কস্ট ইঞ্জিনিয়ারিং একটা প্রজেক্ট নয়, একটা অভ্যাস। বাস্তবে যে ছন্দটা কাজ করে:

- **প্রতিটা ডিজাইন রিভিউতে** — নতুন আর্কিটেকচারের একটা মোটামুটি cost model, বিশেষ করে নতুন কোন arrow কোন সীমানা পার হচ্ছে সেটার হিসাব।
- **প্রতিটা রিলিজে** — cost per request-এর regression চেক, ঠিক যেমন latency-র regression চেক।
- **প্রতি সপ্তাহে** — top-10 লাইন আইটেম আর top-10 tenant-এর margin, একটা ড্যাশবোর্ডে, টিমের মালিকানায়।
- **প্রতি কোয়ার্টারে** — pricing sheet রিফ্রেশ, lifecycle policy রিভিউ, আর commitment/reserved capacity-র সিদ্ধান্ত।

আর সবচেয়ে জরুরি অভ্যাসটা: **যে সংখ্যাটা কেউ দেখে না, সেটা সবসময় বাড়ে।** কস্টকে দৃশ্যমান করাই এই অধ্যায়ের আসল কাজ; বাকি সব সিদ্ধান্ত তার পরে অনেক সহজ হয়ে যায়।

<div class="takeaways">

### মূল শেখা

- আর্কিটেকচার ডায়াগ্রামের প্রতিটা arrow-এর একটা দাম আছে — box নয়, arrow-ই সাধারণত বিলের বড় অংশ ব্যাখ্যা করে
- Egress, idle capacity, cross-AZ chatter, ভুল storage tier আর observability volume — এই পাঁচটাই সবচেয়ে ঘন ঘন অবহেলিত cost driver
- মোট বিল প্রায় অর্থহীন; cost per request, per active user আর per tenant-ই আসল সিদ্ধান্ত-নেওয়ার সংখ্যা
- Caching origin cost কমায় কিন্তু egress কমায় না; batching-এর লাভ প্রায় পুরোটাই প্রথম ১০০ আইটেমে আসে; compression টেক্সটে জেতে, মিডিয়ায় হারে
- Correctness, security আর ঘোষিত reliability কখনো cost দিয়ে কেনা যায় না — তবে প্রয়োজনের চেয়ে বেশি কেনা reliability কমানো বৈধ
- কস্ট প্রায়ই ডিজাইনের লক্ষণ: বিশাল cross-AZ বিল মানে chatty boundary, বিশাল storage বিল মানে অনুপস্থিত lifecycle policy

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Netflix** নিজস্ব Open Connect CDN ISP-এর ভেতরে বসিয়ে egress-কে আর্কিটেকচারাল সমস্যা হিসেবে সমাধান করেছে, দর-কষাকষি হিসেবে নয়
- **Dropbox** নিজস্ব storage infrastructure-এ ফিরে গিয়ে (Magic Pocket) প্রতি-GB unit cost নাটকীয়ভাবে কমিয়েছিল — স্কেলে managed-service premium-এর সবচেয়ে বিখ্যাত উদাহরণ
- **Airbnb** এবং **Spotify** per-team cost attribution আর tagging policy দিয়ে ক্লাউড বিলকে ইঞ্জিনিয়ারিং টিমের দায়িত্বে নামিয়ে এনেছে
- **Datadog** ও অন্যান্য observability প্ল্যাটফর্মের বিল কাস্টমারদের নিজেদেরই cardinality আর retention নিয়ন্ত্রণে বাধ্য করেছে — observability খরচ যে একটা স্বতন্ত্র ডিজাইন সমস্যা, এটাই তার প্রমাণ
- **AWS**, **GCP** ও **Azure**-এর budget alert, anomaly detection আর cost-allocation tag এই অধ্যায়ের guardrail লুপটাই প্ল্যাটফর্ম লেভেলে বাস্তবায়ন করে

</div>
