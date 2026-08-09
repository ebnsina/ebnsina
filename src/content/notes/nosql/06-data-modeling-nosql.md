---
title: 'NoSQL-এর জন্য ডেটা মডেলিং'
subtitle: 'অ্যাক্সেস-প্যাটার্ন-ফার্স্ট ডিজাইন, ইচ্ছাকৃত ডিনরমালাইজেশন, DynamoDB-তে সিঙ্গেল-টেবিল ডিজাইন, আর join না থাকলে relationship কীভাবে সামলাবেন।'
chapter: 6
level: 'advanced'
readingTime: '13 মিনিট'
topics: ['access patterns', 'single-table', 'denormalization']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা লাইব্রেরি বইগুলো সাজাতে পারে বিষয় অনুযায়ী _অথবা_ লেখক অনুযায়ী _অথবা_ প্রকাশের বছর অনুযায়ী — কিন্তু ফিজিক্যাল শেলফে একসাথে যেকোনো একভাবেই। প্রতি ধরনের খোঁজাখুঁজি দ্রুত করতে লাইব্রেরিয়ানরা কার্ড ক্যাটালগ বানায়: আগে থেকে সাজানো ইনডেক্স কার্ড, আপনি যতভাবে খুঁজতে পারেন প্রতিটির জন্য আলাদা একটা ড্রয়ার। NoSQL মডেলিংও ঠিক একই ব্যাপার। আপনি প্রতি query-র জন্য শেলফ নতুন করে সাজাতে পারবেন না, তাই আগে থেকেই ঠিক করে ফেলেন কোন কোন উপায়ে জিনিস খুঁজবেন এবং প্রতিটা lookup যাতে এক টানেই পাওয়া যায় সেভাবে ডেটা ফিজিক্যালি সাজিয়ে (এবং ডুপ্লিকেট করে) রাখেন।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরি আপা একটা টিফিন সার্ভিস চালান — অফিসপাড়ায় দুপুরের খাবার পৌঁছে দেন। শুরুতে তাঁর রান্নাঘরে আলাদা আলাদা বড় গামলা ছিল: একটায় ভাত, একটায় মুরগির তরকারি, একটায় সালাদ। যখনই কোনো অর্ডার আসত, একজন লোক প্রতিটা গামলা থেকে আলাদা করে তুলে একটা বাক্সে সাজাত। কিন্তু লাঞ্চ আওয়ারে যখন একসাথে দুইশো অর্ডার এসে পড়ে, তখন এই তুলে-সাজানোর কাজটাই বটলনেক হয়ে যায় — গ্রাহকের বাক্স দেরিতে পৌঁছায়, ভাত ঠান্ডা হয়ে যায়।

তাই ফাতিমা আল-ফিহরি আপা কৌশল বদলালেন। এখন তিনি ভোরেই পুরো বাক্স আগে থেকে প্যাক করে ফেলেন — প্রতিটা বাক্সে ভাত, তরকারি আর সালাদ একসাথে গোছানো, ঠিক যেভাবে গ্রাহক অর্ডার করেছেন। অর্ডার এলেই শুধু র‍্যাক থেকে বাক্সটা তুলে দিয়ে দেওয়া, এক টানেই কাজ শেষ। হ্যাঁ, একই মুরগির তরকারি এখন একশোটা বাক্সে আলাদা আলাদা করে ঢালা আছে — জিনিসটা ডুপ্লিকেট হয়েছে। কিন্তু তাতে ঠান্ডা মাথায় তিনি রাজি, কারণ সার্ভ করার সময়ে আর কোনো জোড়া লাগানোর কাজ থাকে না।

এই গল্পটাই আসলে **NoSQL data modeling**। আলাদা গামলায় রেখে প্রতি অর্ডারে সাজানো হলো relational **normalization** — সব কিছু একবার রাখো, প্রতিবার read-এ join করে জোড়া লাগাও। আর আগে থেকে পুরো বাক্স প্যাক করাটা হলো **access pattern** ধরে মডেল করা: আপনি জানেন খাবারটা কীভাবে _সার্ভ_ হবে, তাই সেভাবেই সম্পর্কযুক্ত ডেটা **embed** করে **denormalize** করে রাখেন, এমনকি সেজন্য একই তরকারি অনেক বাক্সে **duplicate** হলেও — যাতে প্রতিটা read এক fetch-এই মিটে যায়। বাস্তবে MongoDB-তে একটা order document-এর ভেতরেই তার line item গুলো embed করে রাখাটা ঠিক এই কাজটাই করে; পড়ার সময় আর অন্য collection-এ গিয়ে জোড়া লাগাতে হয় না।

## অ্যাক্সেস-প্যাটার্ন-ফার্স্ট ডিজাইন

Relational মডেলিং শুরু হয় _ডেটা_ দিয়ে: entity গুলো চিহ্নিত করুন, normalize করুন, আর পরে যেকোনো প্রশ্ন সাজিয়ে দেওয়ার জন্য query planner-এর ওপর ভরসা রাখুন। NoSQL মডেলিং এটা উল্টে দেয়। আপনি শুরু করেন _প্রশ্ন_ দিয়ে এবং storage এমনভাবে সাজান যাতে প্রতিটা প্রশ্ন হয়ে যায় সরাসরি একটা lookup, কারণ ভরসা করার মতো কোনো general-purpose join engine এখানে নেই।

প্রক্রিয়াটা:

1. **প্রতিটা access pattern লিখে ফেলুন।** স্পষ্ট বাক্য হিসেবে লিখুন: "id দিয়ে একজন user আনো," "একজন user-এর order গুলো নতুন-আগে ক্রমে দেখাও," "একটা order তার line item সহ আনো," "SKU X আছে এমন সব order খুঁজে বের করো।"
2. **প্রতিটার frequency আর latency budget নোট করুন।** hot path-ই সবচেয়ে বেশি ডিজাইন-শ্রম পাওয়ার যোগ্য।
3. **Storage এমনভাবে ডিজাইন করুন যাতে hot pattern গুলো single-key (বা single-partition) read হয়।** document, partition key আর ডুপ্লিকেট করা টেবিল এমনভাবে গঠন করুন যাতে মিলে যায়।
4. **বিরল pattern গুলোর জন্য secondary index যোগ করুন।**

আপনি যদি আপনার access pattern গুলো লিস্ট করতে না পারেন, তাহলে আপনি এখনো NoSQL-এ মডেল করার জন্য প্রস্তুত নন — ঠিক ওই অনিশ্চয়তাটা সামলানোর জন্যই relational database-এর নমনীয়তা।

## ডিনরমালাইজেশন আর ডুপ্লিকেশন

Relational মডেলিং normalization-কে মূল্য দেয়: প্রতিটা তথ্য একবার রাখো, সব জায়গায় reference করো। NoSQL ইচ্ছা করে ঠিক উল্টোটা করে — এটা ডেটা **ডুপ্লিকেট** করে যাতে read-এর সময় join করতে না হয়।

ধরুন একটা order দেখাতে চান customer-এর নাম সহ। Normalized অবস্থায় order-এ শুধু `customerId` থাকে আর customer-কে আলাদা করে fetch করেন। Denormalized অবস্থায় নামটা order-এর ভেতরেই copy করে রাখেন:

```json
{
	"orderId": "8841",
	"customerId": "cust_42",
	"customerName": "Zubaida",
	"total": 35
}
```

এখন order render করতে একটাই read। খরচটা দেখা দেয় write-এর বেলায়: Zubaida যদি নিজের নাম বদলায়, `customerName` বহন করা প্রতিটা order আপনি update না করা পর্যন্ত পুরনো (stale) থেকে যাবে। আপনি এই বিনিময়টা মেনে নেন কারণ বেশিরভাগ workload-এ এ ধরনের write-এর তুলনায় read অনেক অনেক বেশি হয়, আর একটু পুরনো display name দেখানো ক্ষতিকর কিছু নয়।

ডিনরমালাইজেশন একটা ইচ্ছাকৃত বিনিময়: **সস্তা read আর write fan-out, বিনিময়ে write amplification আর copy গুলো sync রাখার দায়িত্ব।** দক্ষতাটা হলো _কোন_ field গুলো ডুপ্লিকেট করবেন সেটা বেছে নেওয়া — ছোট, hot, শুধু-দেখানোর field গুলো copy করুন; বড়, দ্রুত-বদলানো বা কালেভদ্রে দেখানো field গুলো reference করুন।

<Callout type="tip">

**নোট:** যে ডেটা বেশি read করেন আর কম update করেন সেটা ডুপ্লিকেট করুন। একজন user-এর display name (প্রতি order-এ read হয়, প্রায় কখনোই বদলায় না) দারুণ ডুপ্লিকেশন candidate। একজন user-এর account balance (সারাক্ষণ বদলায়, নিখুঁত হতে হবে) জঘন্য candidate — যে জিনিসকে কঠোরভাবে সঠিক থাকতে হয় তার source of truth কখনো ডুপ্লিকেট করবেন না।

</Callout>

## সিঙ্গেল-টেবিল ডিজাইন (DynamoDB)

DynamoDB-র সবচেয়ে শক্তিশালী আর প্রথম দেখায় উল্টো-মনে-হওয়া pattern হলো _একটাই টেবিলে একাধিক ধরনের entity_ রাখা। যেহেতু একটা query কার্যকরভাবে শুধু একটা টেবিল আর একটা partition-এই হিট করতে পারে, সম্পর্কযুক্ত entity গুলো একসাথে আনার উপায় হলো তাদের **একই partition share করানো**।

কৌশলটা হলো overloaded, generic key — `PK` (partition) আর `SK` (sort) — যাদের অর্থ একটা prefix দিয়ে এনকোড করা:

```json
{ "PK": "USER#42", "SK": "PROFILE",      "name": "Zubaida", "tier": "gold" }
{ "PK": "USER#42", "SK": "ORDER#8841",   "total": 35,    "status": "shipped" }
{ "PK": "USER#42", "SK": "ORDER#8842",   "total": 12,    "status": "pending" }
{ "PK": "USER#42", "SK": "ADDRESS#home", "city": "Dhaka" }
```

user 42-এর সব item একটাই partition-এ থাকে। এখন একটা query একসাথে কয়েকটা প্রশ্নের উত্তর দেয়:

```text
# Everything about user 42 (profile, orders, addresses) — one query
Query: PK = "USER#42"

# Just user 42's orders — one query, using the SK prefix
Query: PK = "USER#42" AND begins_with(SK, "ORDER#")

# Just the profile — one item
GetItem: PK = "USER#42", SK = "PROFILE"
```

যেসব access pattern partition key থেকে শুরু হয় না — যেমন "প্রতিটা user জুড়ে সব `pending` order" — তার জন্য আপনি একটা **Global Secondary Index (GSI)** যোগ করেন যা একই item গুলোকে একটা ভিন্ন key দিয়ে (এখানে `status`) নতুন করে partition করে। প্রতিটা GSI আসলে একই ডেটার ওপর আরেকটা কার্ড-ক্যাটালগ ড্রয়ার।

Single-table design ঘন আর সহজবোধ্য নয়, আর এটা তখনই যুক্তিসঙ্গত যখন বিশাল স্কেলে single-digit-millisecond latency দরকার হয়। ছোট সিস্টেমের জন্য এটা over-engineering — তবে এটা বোঝা NoSQL-এর মূল শিক্ষাটা খুলে দেয়: **key-এর গঠন _ই_ হলো ডেটা মডেল।**

## Join ছাড়াই Relationship

`JOIN` keyword ছাড়া আপনি relationship মডেল করেন গঠনগতভাবে (structurally)। সঠিক কৌশলটা নির্ভর করে cardinality-র ওপর।

**One-to-few (সীমাবদ্ধ):** child গুলোকে parent-এর ভেতরে embed করুন।

```json
{
	"orderId": "8841",
	"items": [
		{ "sku": "BK-101", "qty": 1 },
		{ "sku": "PN-007", "qty": 3 }
	]
}
```

**One-to-many (অসীম):** child গুলোকে parent-এর partition share করা আলাদা item হিসেবে রাখুন (single-table), অথবা id দিয়ে reference করে একটা secondary index-এ query করুন।

```json
{ "PK": "USER#42", "SK": "ORDER#8841" }
{ "PK": "USER#42", "SK": "ORDER#8842" }
```

**Many-to-many:** link-টাকে তার নিজের item হিসেবে রাখুন, প্রায়ই ডুপ্লিকেট করে যাতে relationship-টা _দুই_ দিক থেকেই দ্রুত read করা যায়।

```json
// "student 7 is enrolled in course 9" — written both ways for two-direction reads
{ "PK": "STUDENT#7", "SK": "COURSE#9" }
{ "PK": "COURSE#9", "SK": "STUDENT#7" }
```

Pattern-টা পরিবারভেদে বারবার আসে: MongoDB-তে আপনি embed-নাকি-reference বেছে নেন; Cassandra-তে relationship-এর প্রতি দিকের জন্য একটা করে টেবিল বানান; DynamoDB-তে partition দিয়ে একসাথে রাখেন। সবগুলোতেই, **relationship এমন একটা জিনিস যা আপনি ফিজিক্যালি সাজান আর রক্ষণাবেক্ষণ করেন, database তাৎক্ষণিকভাবে বের করে দেয় না।**

## একটা বাস্তব মডেলিং সেশন

ধরুন একটা SaaS অ্যাপের দরকার: একটা workspace আনা; একটা workspace-এর project গুলো লিস্ট করা; একটা project-এর task গুলো লিস্ট করা; আর "সব project জুড়ে আমাকে assign করা সব task দেখাও।"

প্রথম তিনটা একটা পরিষ্কার hierarchy — এদের workspace আর project দিয়ে একসাথে রাখুন যাতে প্রতিটা single-partition read হয়:

```json
{ "PK": "WS#cordoba",            "SK": "META",            "name": "Cordoba" }
{ "PK": "WS#cordoba",            "SK": "PROJ#web",        "name": "Website" }
{ "PK": "WS#cordoba#PROJ#web",   "SK": "TASK#101",        "title": "Fix nav", "assignee": "u_42" }
{ "PK": "WS#cordoba#PROJ#web",   "SK": "TASK#102",        "title": "Add auth", "assignee": "u_19" }
```

চতুর্থ pattern-টা hierarchy-র _আড়াআড়ি_ কাটে — এটা কোনো workspace বা project থেকে শুরু হয় না, তাই কোনো partition এর সেবা দেয় না। assignee দিয়ে key করা একটা secondary index-এর ঠিক textbook উদাহরণ এটা:

```text
GSI:  PK = ASSIGNEE#u_42   →   returns every task assigned to u_42, any project
```

ছন্দটা খেয়াল করুন: hierarchical read গুলো key design থেকেই বেরিয়ে আসে; আড়াআড়ি read প্রতিটা একটা করে index পায়। আপনি একটাও join লেখেননি — আপনি ডেটা এমনভাবে সাজিয়েছেন যাতে প্রশ্নগুলো নিজেরাই নিজেদের উত্তর দেয়।

<Callout type="warning">

**সতর্কতা:** NoSQL মডেলিংয়ের চরম পাপ হলো একটা normalized relational schema হুবহু বানিয়ে ফেলা এবং তারপর application code-এ join এমুলেট করা — id-এর একটা লিস্ট আনা, তারপর loop চালিয়ে প্রতিটা একে একে আনা (network জুড়ে "N+1" pattern)। এটা ধীর, ভঙ্গুর, আর NoSQL বেছে নেওয়ার কারণটাকেই ছুড়ে ফেলে দেয়। আপনার ডিজাইনে যদি প্রতি read-এ join লাগে, হয় denormalize করুন যাতে read এক lookup হয়, নয়তো মেনে নিন যে workload-টার একটা relational database দরকার ছিল আর সেটাই ব্যবহার করুন।

</Callout>

আপনি কীভাবে read করেন তার চারপাশে মডেল করুন, যা বেশি read করেন আর কম বদলান তা ডুপ্লিকেট করুন, আর প্রতিটা relationship-কে একটা ইচ্ছাকৃত গঠন বানান। এটা করলে NoSQL আপনাকে যেকোনো স্কেলে অনুমানযোগ্য performance দেবে। এটা এড়িয়ে গেলে আপনি একটা ধীরতর, বেশি বাগযুক্ত relational database বানাবেন — কোনো রকম guardrail ছাড়াই।
