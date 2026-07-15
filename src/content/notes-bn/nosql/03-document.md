---
title: 'ডকুমেন্ট ডেটাবেস'
subtitle: 'পুরো এন্টিটিকে JSON ডকুমেন্ট হিসেবে স্টোর করুন। MongoDB, embedding বনাম referencing সিদ্ধান্ত, indexing, এবং আপনি কীভাবে ডেটা পড়েন তার চারপাশে schema ডিজাইন করা।'
chapter: 3
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['document', 'mongodb', 'embedding']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা রিলেশনাল ডেটাবেস হলো আলাদা আলাদা ড্রয়ারে রাখা ফর্মের স্তূপ: এখানে কাস্টমার ফর্ম, ওখানে অর্ডার ফর্ম, আর line-item স্লিপ অন্য কোথাও। একটা কেনাকাটা বুঝতে হলে আপনাকে কয়েকটা ড্রয়ারে হেঁটে গিয়ে কপিগুলো একসাথে স্ট্যাপল করতে হয়। একটা ডকুমেন্ট ডেটাবেস প্রতি কাস্টমারের জন্য একটা ম্যানিলা ফোল্ডার রাখে যার ভেতরে সবকিছু গোছানো থাকে — অর্ডার, তার line item, শিপিং নোট — তাই একবার টান দিলেই পুরো গল্পটা পেয়ে যান। ট্রেড-অফ: যদি কাস্টমারের ঠিকানা বারোটা ফোল্ডারে থাকে, সেটা আপডেট করা মানে বারোটা ফোল্ডারই খোলা।

</Callout>

## গল্পে বুঝি

ফাতেমা একজন ডাক্তার, নিজের চেম্বারে বসেন। প্রতিটা রোগীর জন্য তার একটা করে আলাদা ফোল্ডার — করিমের ফোল্ডারে করিমের সবকিছু: প্রেসক্রিপশন, ব্লাড টেস্টের রিপোর্ট, এক্স-রে, আর ফাতেমার হাতে লেখা নোট, সব ওই একটা ফোল্ডারের ভেতরেই গোছানো। করিম চেম্বারে ঢুকলে ফাতেমা শুধু তার ফোল্ডারটা টেনে বের করেন, আর সাথে সাথেই পুরো ছবিটা চোখের সামনে — আগের অসুখ, চলতি ওষুধ, সব একসাথে। আলাদা আলাদা ড্রয়ার হাতড়ে টেস্ট রিপোর্ট আর প্রেসক্রিপশন জোড়া লাগাতে হয় না।

মজার ব্যাপার হলো, প্রতিটা রোগীর ফোল্ডারে এক জিনিস থাকে না। রহিমের ফোল্ডারে হয়তো একটা ইসিজি রিপোর্ট আছে, করিমের ফোল্ডারে সেটা নেই কিন্তু আছে ডায়াবেটিসের চার্ট। ফাতেমাকে আগে থেকে ঠিক করে রাখতে হয় না যে "প্রতিটা ফোল্ডারে ঠিক এই এই কাগজই থাকবে" — যার যা লাগে, তার ফোল্ডারে সেটাই ঢোকে। নতুন কোনো টেস্ট এলে সেটা এমনি ফোল্ডারে যোগ হয়ে যায়, বাকিদের ফোল্ডার ঘাঁটতে হয় না।

এই ফোল্ডারটাই আসলে একটা **document**। একজন রোগীর সব সম্পর্কিত ডেটা একটা self-contained ইউনিটে একসাথে থাকে, ভেতরে nested — রিপোর্টের ভেতরে রিপোর্ট, নোটের সাথে নোট। আর যেহেতু প্রতিটা ফোল্ডারে ভিন্ন জিনিস থাকতে পারে, schema **flexible** — একই collection-এর দুই document-এ ভিন্ন field থাকা স্বাভাবিক। বাস্তবে **MongoDB** ঠিক এভাবেই কাজ করে: এক রোগীর (বা এক অর্ডারের, এক ইউজারের) সব কিছু একটা JSON document-এ রেখে দেয়, তাই একটা query-তেই পুরো এন্টিটি হাতে চলে আসে — অনেক টেবিল join করে জোড়া লাগাতে হয় না।

## ডকুমেন্ট মডেল

একটা ডকুমেন্ট ডেটাবেস ডেটাকে **document** হিসেবে স্টোর করে — self-describing, nested রেকর্ড, সাধারণত JSON (MongoDB একটা বাইনারি রূপ স্টোর করে যাকে BSON বলে)। key-value স্টোরের বিপরীতে, ডেটাবেস ডকুমেন্টের গঠন _বোঝে_ এবং তার ভেতরের field গুলো index ও query করতে পারে।

```json
{
	"_id": "order_8841",
	"customer": { "id": "cust_42", "name": "Zubaida", "tier": "gold" },
	"items": [
		{ "sku": "BK-101", "title": "NoSQL Notes", "qty": 1, "price": 29 },
		{ "sku": "PN-007", "title": "Gel Pen", "qty": 3, "price": 2 }
	],
	"total": 35,
	"status": "shipped",
	"createdAt": "2026-06-15T10:00:00Z"
}
```

খেয়াল করুন একটা ডকুমেন্টের ভেতরে কত কিছু থাকে: কাস্টমার সামারি, প্রতিটা line item, টোটাল। একটা রিলেশনাল ডিজাইনে এটা হতো তিন-চারটা টেবিল join করে। এখানে এটা একটামাত্র read। ডকুমেন্ট **schema-flexible** — একই collection-এর দুটো ডকুমেন্টে ভিন্ন field থাকতে পারে — যা একটা অ্যাপ্লিকেশন বিবর্তিত করা সহজ করে তোলে: নতুন ডকুমেন্টে একটা field যোগ করুন আর পুরনোগুলো ধীরেসুস্থে backfill করুন।

## MongoDB বেসিক

MongoDB হলো প্রধান ডকুমেন্ট ডেটাবেস। ডকুমেন্ট থাকে **collection**-এ (মোটামুটি "টেবিল"), আর আপনি একটা JSON-আকৃতির filter ভাষা দিয়ে query করেন।

```javascript
// Insert a document
db.orders.insertOne({ customer: { id: 'cust_42' }, total: 35, status: 'shipped' });

// Find with a filter — note querying into nested fields with dot notation
db.orders.find({ 'customer.id': 'cust_42', status: 'shipped' });

// Query an array element and project specific fields
db.orders.find({ 'items.sku': 'BK-101' }, { total: 1, status: 1 });

// Update one field without touching the rest of the document
db.orders.updateOne({ _id: 'order_8841' }, { $set: { status: 'delivered' } });
```

MongoDB-এর একটা **aggregation pipeline**-ও আছে grouping, joining (`$lookup`), এবং ডকুমেন্ট রূপান্তরের জন্য — শক্তিশালী, কিন্তু আপনি যদি সবসময় এর ওপর নির্ভর করেন তাহলে আপনার ডেটা হয়তো আপনার access pattern-এর জন্য ভুলভাবে মডেল করা।

## Embedding বনাম Referencing

এটাই ডকুমেন্ট মডেলিংয়ের _কেন্দ্রীয়_ সিদ্ধান্ত। আপনি হয় সম্পর্কিত ডেটাকে parent ডকুমেন্টের ভেতরে **embed** করেন, নয়তো একটা id স্টোর করে সেটাকে আলাদাভাবে fetch করে **reference** করেন।

**Embedding** — child-কে parent-এর ভেতরে nest করা:

```json
{
	"_id": "post_9",
	"title": "Why NoSQL",
	"comments": [
		{ "author": "alex", "text": "great post" },
		{ "author": "sam", "text": "thanks!" }
	]
}
```

একটা read পোস্ট আর তার কমেন্ট ফেরত দেয়। child ডেটা যখন parent দ্বারা **মালিকানাধীন, তার সাথে পড়া হয়, এবং তার সাপেক্ষে সীমাবদ্ধ** থাকে তখন embedding জেতে।

**Referencing** — একটা id স্টোর করে আলাদাভাবে fetch করা:

```json
{ "_id": "post_9", "title": "Why NoSQL", "authorId": "user_42" }
{ "_id": "user_42", "name": "Zubaida", "tier": "gold" }
```

সম্পর্কিত ডেটা যখন **শেয়ার্ড, বড়, বা সীমাহীন** তখন referencing জেতে।

| বেছে নিন  | কখন                                                                          |
| --------- | ---------------------------------------------------------------------------- |
| Embed     | One-to-few, একসাথে পড়া হয়, child-এর নিজস্ব জীবন নেই, সীমাবদ্ধ আকার         |
| Reference | One-to-many/সীমাহীন, ডকুমেন্ট জুড়ে শেয়ার্ড, বড়, স্বাধীনভাবে query করা হয় |

<Callout type="tip">

**নোট:** MongoDB-তে ডকুমেন্টের একটা 16 MB আকার সীমা আছে, যা "সব embed করো" কৌশলকে বিপজ্জনক করে তোলে। একটা ব্লগ পোস্ট তার প্রথম কয়েকটা কমেন্ট embed করতে পারে, কিন্তু 200,000 কমেন্টওয়ালা একটা ভাইরাল পোস্ট সীমা ছাড়িয়ে যাবে আর প্রতিটা read-কে বিশাল করে তুলবে। সীমাবদ্ধ, hot ডেটা embed করুন; সীমাহীন লেজটাকে reference করুন।

</Callout>

## কাজের উদাহরণ: The Author Problem

পোস্ট আর author-এর কথা ভাবুন। আপনি যদি প্রতিটা পোস্টের ভেতরে author-এর পুরো profile embed করেন, read দ্রুত ও self-contained হয় — কিন্তু author যখন নিজের নাম পাল্টায়, তখন সে লেখা প্রতিটা পোস্ট আপনাকে আপডেট করতে হয়। আপনি যদি author-কে id দিয়ে reference করেন, নাম পরিবর্তনে একটা ডকুমেন্ট বদলায়, কিন্তু একটা পোস্ট render করতে এখন দ্বিতীয় একটা lookup লাগে।

সঠিক উত্তর নির্ভর করে read আর সেই ধরনের write-এর অনুপাতের ওপর, এবং duplicate করা ডেটা কতটা বাসি হতে পারে তার ওপর। একটা প্রচলিত মাঝামাঝি পথ হলো **আপনি যে field গুলো display করেন শুধু সেগুলোর একটা snapshot embed করা** (নাম, avatar) আর বাকি সবকিছুর জন্য id reference করা — মেনে নিয়ে যে snapshot একটা profile edit থেকে একটু পিছিয়ে থাকতে পারে। read-গতির জন্য এই duplication প্যাটার্নটাই NoSQL মডেলিংয়ের মূল কেন্দ্র, যা chapter 6-এ পুরোপুরি আলোচনা করা হয়েছে।

## Indexing

index ছাড়া, একটা query collection-এর প্রতিটা ডকুমেন্ট scan করে — শত শত ডকুমেন্টের জন্য ঠিক আছে, মিলিয়ন মিলিয়নের জন্য মারাত্মক। একটা index হলো একটা sorted স্ট্রাকচার (একটা B-tree) যা scan-কে একটা দ্রুত lookup-এ পরিণত করে, ঠিক SQL-এর মতোই।

```javascript
// Single-field index
db.orders.createIndex({ 'customer.id': 1 });

// Compound index — supports queries filtering on status then sorting by date
db.orders.createIndex({ status: 1, createdAt: -1 });

// See whether a query used an index or scanned the collection
db.orders.find({ status: 'shipped' }).explain('executionStats');
```

দুটো নিয়ম বেশিরভাগ ওজন বহন করে। প্রথমত, **একটা ঘন ঘন query-তে আপনি যে প্রতিটা field-এ filter বা sort করেন তার একটা index দরকার** — `explain` দিয়ে চেক করুন আর একটা পূর্ণ `COLLSCAN`-এর দিকে খেয়াল রাখুন। দ্বিতীয়ত, compound index-এর ক্রম গুরুত্বপূর্ণ: একটা `{ status, createdAt }` index সেসব query-কে সাহায্য করে যেগুলো `status` দিয়ে filter করে (ঐচ্ছিকভাবে তারপর `createdAt` দিয়ে sort করে), কিন্তু এমন একটা query-কে দক্ষভাবে সেবা দেয় _না_ যেটা শুধু `createdAt` দিয়ে filter করে। index write throughput আর storage খরচ করে, তাই আপনার বাস্তব query-র জন্য index করুন, কাল্পনিক query-র জন্য নয়।

## Access Pattern দিয়ে Schema ডিজাইন

রিলেশনাল থেকে সবচেয়ে বড় মানসিকতার পরিবর্তন: SQL-এ আপনি আগে normalize করেন আর পরে query করেন; ডকুমেন্ট মডেলিংয়ে আপনি **access pattern** থেকে শুরু করেন। জিজ্ঞেস করুন "এক read-এ স্ক্রিনটাকে render করতে কী দরকার?" আর ডকুমেন্টটাকে এমনভাবে গড়ুন যাতে সেটা একটা query-তে উত্তর দেয়।

একটা কাজের ধাপে ধাপে অগ্রগতি:

1. **আপনার query গুলো তালিকাভুক্ত করুন।** "একটা অর্ডার তার line item সহ দেখাও।" "একজন ইউজারের শেষ 20টা অর্ডার দেখাও।" "SKU X ধারণকারী সব অর্ডার দেখাও।"
2. **ডকুমেন্টগুলোকে এমনভাবে গড়ুন যাতে সবচেয়ে hot query একটা read হয়।** line item embed করা অর্ডার query one-কে শূন্য join-এ সন্তুষ্ট করে।
3. **secondary query-র জন্য index যোগ করুন।** `customer.id` আর `createdAt`-এর একটা index query two-কে সেবা দেয়; `items.sku`-এর একটা index query three-কে সেবা দেয়।
4. **কী duplicate করবেন তা ঠিক করুন।** render-এর দরকার হলে display-name snapshot embed করুন; আপডেট খরচটা মেনে নিন।

<Callout type="warning">

**সতর্কতা:** ক্লাসিক ডকুমেন্ট-ডেটাবেস antipattern হলো MongoDB-কে একটা রিলেশনাল ডেটাবেসের মতো ব্যবহার করা — অনেক ছোট ছোট, পুরোপুরি normalized collection যা প্রতিটা request-এ `$lookup` join দিয়ে সেলাই করা। আপনি ডকুমেন্ট মডেলের প্রধান সুবিধা হারান (একটা single-read পূর্ণ এন্টিটি) আর distributed-join খরচ দেন যেটার জন্য SQL ইঞ্জিন অনেক বেশি optimized। আপনার ডিজাইনে যদি সব জায়গায় join থাকে, হয় আরও আক্রমণাত্মকভাবে embed করুন নয়তো জিজ্ঞেস করুন আপনি আসলে শুরু থেকেই একটা রিলেশনাল ডেটাবেস চেয়েছিলেন কিনা।

</Callout>

সঠিকভাবে করলে, একটা ডকুমেন্ট ডেটাবেস আপনাকে object নিয়ে কাজ করার ডেভেলপার ergonomics, দ্রুত iteration-এর জন্য schema flexibility, আর পূর্ণ এন্টিটির single-read access দেয়। এর মূল্য হলো, ডেটাবেস নয়, আপনিই এখন duplication আর relationship সামলানোর জন্য দায়ী।
