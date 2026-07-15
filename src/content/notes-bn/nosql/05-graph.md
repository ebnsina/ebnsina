---
title: 'গ্রাফ ডেটাবেস'
subtitle: 'Node, edge, আর property first-class নাগরিক হিসেবে। Neo4j আর Cypher, traversal, এবং যেসব query-তে গ্রাফ join-কে পেছনে ফেলে দেয়।'
chapter: 5
level: 'advanced'
readingTime: '11 মিনিট'
topics: ['graph', 'neo4j', 'traversal']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন গোয়েন্দার কর্কবোর্ড: মানুষের ছবি পিন করা, সুতো দিয়ে সেগুলো জোড়া লাগানো — "চেনে," "কল করেছে," "টাকা দিয়েছে।" "সন্দেহভাজনকে ভুক্তভোগীর সাথে কে জোড়ে?" এর উত্তর দিতে গোয়েন্দা টেবিল cross-reference করা একটা কার্ড ক্যাটালগ উল্টে দেখে না; তারা এক ছবি থেকে পরের ছবিতে সুতো অনুসরণ করে। একটা গ্রাফ ডেটাবেস ডেটাকে ঠিক সেই বোর্ডের মতোই স্টোর করে। সংযোগগুলো foreign key থেকে চাহিদামতো হিসাব করা হয় না — এগুলো শারীরিক লিংক যা engine সরাসরি হেঁটে যায়, আর এই কারণেই relationship অনুসরণ করা এর মহাশক্তি।

</Callout>

## গল্পে বুঝি

মহল্লার ঘটক ফাতেমা খালার কাছে বিয়ের সম্বন্ধ আসে সবচেয়ে বেশি। তার মাথায় আর ডায়েরিতে গোটা এলাকার একটা বিশাল জাল আঁকা — কে কার আত্মীয়, কে কাকে চেনে, কার সাথে কার পরিচয়। করিমের ভাই রহিমকে চেনে, রহিম আবার পাশের পাড়ার ফাতেমার (আরেকজন) মামাকে চেনে — এভাবে মানুষগুলো সুতোর মতো একে অপরের সাথে জোড়া লাগানো। কেউ এসে বলল, "খালা, আমার ছেলের জন্য এমন একটা মেয়ে দেখেন যার সাথে আমাদের দুই ঘর দূরের চেনা-পরিচয় আছে" — খালা তখন আলাদা আলাদা বংশের খাতা টেনে বের করে পাতা উল্টে মেলাতে বসেন না। তিনি সরাসরি একজন থেকে তার পরিচিত, সেখান থেকে আবার তার পরিচিত — এভাবে সংযোগের সুতো ধরে ধরে এগিয়ে গিয়ে উপযুক্ত সম্বন্ধ বের করে ফেলেন।

মজার ব্যাপার হলো, খালার কাছে "সম্পর্ক" জিনিসটাই আসল সম্পদ। মানুষ কে সেটা যতটা জরুরি, তার চেয়েও জরুরি কে কার সাথে কীভাবে যুক্ত। তাই এলাকা যত বড়ই হোক, "দুই হাত ঘুরে চেনা কাউকে খুঁজে দাও" প্রশ্নের উত্তর দিতে তার সেকেন্ড লাগে — কারণ সংযোগগুলো আগে থেকেই তার মাথায় সুতো দিয়ে বাঁধা, নতুন করে খাতা মেলাতে হয় না।

এই গল্পটাই আসলে **graph database**। প্রতিটা মানুষ হলো একটা **node**, আর "চেনে"/"আত্মীয়" সম্পর্কগুলো হলো first-class **edge** (relationship) — যেগুলো সরাসরি এক node থেকে আরেক node-এ যাওয়ার সুতো। খালার সুতো ধরে ধরে এগোনোটাই **traversal**, আর "দুই হাত ঘুরে চেনা কেউ" খুঁজে বের করাই সেই বিখ্যাত **friends-of-friends** query। বাস্তবে social network-এ mutual connection দেখানো, e-commerce-এ recommendation বের করা, বা fraud ring খুঁজে বের করা — এসবই ঠিক এভাবে সংযোগ ধরে হাঁটার কাজ, আর Neo4j-এর মতো graph database ঠিক এই কাজটাই relational join-এর স্তূপের চেয়ে অনেক দ্রুত করে ফেলে।

## Node, Edge, Property

একটা গ্রাফ ডেটাবেস ডেটাকে তিনটা উপাদান সহ একটা **property graph** হিসেবে মডেল করে:

- **Node** — এন্টিটি (একজন মানুষ, একটা পণ্য, একটা অ্যাকাউন্ট)। Node **label** (তাদের type) আর **property** (key-value attribute) বহন করে।
- **Edge** (relationship) — node-দের মধ্যে typed, **directed** সংযোগ। Edge first-class: তাদের একটা type, একটা direction, আর নিজস্ব property আছে।
- **Property** — node বা edge যেকোনোটার ওপর key-value ডেটা।

```text
(Person {name: "Zubaida"})  -[:FOLLOWS {since: 2024}]->  (Person {name: "Idris"})
(Person {name: "Zubaida"})  -[:PURCHASED {date: ...}]->  (Product {sku: "BK-101"})
```

সংজ্ঞায়ক বৈশিষ্ট্য হলো **index-free adjacency**: প্রতিটা node তার প্রতিবেশী node-দের সরাসরি pointer স্টোর করে। এক node থেকে তার প্রতিবেশীদের কাছে লাফ দেওয়ার খরচ একই থাকে সামগ্রিক গ্রাফ যত বড়ই হোক না কেন — আপনি pointer অনুসরণ করেন, আপনি একটা index খোঁজেন না। এটাই deep relationship query-কে দ্রুত করে যেখানে SQL হিমশিম খাবে।

## গ্রাফ কেন Join-কে হারায়

একটা রিলেশনাল ডেটাবেসে, একটা relationship হলো একটা foreign key, আর সেটা traverse করা একটা **join**। একটা join সস্তা। কিন্তু "বন্ধুর বন্ধুর বন্ধু" তিনটা join, প্রতিটা intermediate row গুণ করে, আর খরচ depth-এর সাথে বিস্ফোরকভাবে বাড়ে। পাঁচ বা ছয় hop গভীর একটা query একটা রিলেশনাল schema-তে কার্যত unrunnable হতে পারে।

```text
Relational "friends of friends of friends":
   JOIN friendships f1 ... JOIN friendships f2 ... JOIN friendships f3 ...
   cost grows with the size of the tables at every hop

Graph equivalent:
   start at one node, follow FOLLOWS edges out 3 times
   cost grows only with the number of neighbors actually visited
```

সাধারণ নিয়ম: একটা গ্রাফ ডেটাবেস জেতে যখন আপনার query **ডেটার মধ্যেকার সংযোগ** নিয়ে হয়, বিশেষ করে **variable-depth** বা **path-finding** query, flat রেকর্ড filter ও aggregate করা নিয়ে নয়। tabular ডেটার ওপর এক- বা দুই-hop relationship-এর জন্য, একটা রিলেশনাল ডেটাবেস সাধারণত সহজ আর ঠিক ততটাই দ্রুত — অকালে একটা গ্রাফ স্টোরের দিকে হাত বাড়াবেন না।

## Neo4j আর Cypher

Neo4j হলো সবচেয়ে বহুল ব্যবহৃত গ্রাফ ডেটাবেস। এর query ভাষা, **Cypher**, ASCII-art প্যাটার্নের চারপাশে তৈরি: বন্ধনীতে node, direction দেখানো তীর সহ square bracket-এ relationship।

```text
// Create nodes and a relationship
CREATE (m:Person {name: "Zubaida"})
CREATE (a:Person {name: "Idris"})
CREATE (m)-[:FOLLOWS {since: 2024}]->(a)

// Find who Zubaida follows
MATCH (m:Person {name: "Zubaida"})-[:FOLLOWS]->(target)
RETURN target.name

// Friends-of-friends Zubaida does NOT already follow (recommendation)
MATCH (m:Person {name: "Zubaida"})-[:FOLLOWS]->()-[:FOLLOWS]->(fof)
WHERE NOT (m)-[:FOLLOWS]->(fof) AND fof <> m
RETURN fof.name, count(*) AS mutuals
ORDER BY mutuals DESC
```

প্যাটার্নগুলো বাঁ থেকে ডানে একটা বাক্যের মতো পড়ুন: "Zubaida নামের একজন Person-কে match করো, যে কাউকে follow করে, যে একজন friend-of-friend-কে follow করে।" তীরের direction গুরুত্বপূর্ণ — `-[:FOLLOWS]->` আর `<-[:FOLLOWS]-` এক নয়। এই declarative, ভিজ্যুয়াল স্টাইল traversal query-কে সমতুল্য nested SQL join-এর চেয়ে নাটকীয়ভাবে স্পষ্ট করে তোলে।

## Traversal আর Path Finding

fixed-depth প্যাটার্নের বাইরে, গ্রাফ **variable-length** traversal আর shortest-path query-তে জ্বলে ওঠে — ঠিক সেই প্রশ্নগুলো যা SQL-এ যন্ত্রণাদায়ক বা অসম্ভব।

```text
// Variable depth: anyone reachable from Zubaida within 1 to 4 FOLLOWS hops
MATCH (m:Person {name: "Zubaida"})-[:FOLLOWS*1..4]->(reachable)
RETURN DISTINCT reachable.name

// Shortest path between two people through any relationship
MATCH p = shortestPath(
  (a:Person {name: "Zubaida"})-[*]-(b:Person {name: "Bilal"})
)
RETURN p
```

`*1..4` syntax বলে "এই relationship এক থেকে চারবারের মধ্যে অনুসরণ করো।" সেটা SQL-এ প্রকাশ করা মানে হয় একটা unbounded recursive CTE নয়তো self-join-এর একটা fixed cascade — দুটোই বিশ্রী, দুটোই ধীর। গ্রাফ engine pointer হেঁটে যায় আর পৌঁছালে থামে, তাই খরচ প্রকৃতপক্ষে explore করা path-কে অনুসরণ করে, টেবিলের আকারকে নয়।

<Callout type="tip">

**নোট:** একটা গ্রাফ ডেটাবেসের সুবিধা হলো _local_ traversal, _global_ scanning নয়। "এই ইউজার থেকে সেই পণ্যের recommendation path খুঁজে বের করো" একটা গ্রাফের sweet spot। "গত quarter-এ region অনুসারে revenue যোগ করো" একটা analytical aggregation — একটা columnar/SQL warehouse সেটা অনেক ভালো করে। connectedness প্রশ্নের জন্য গ্রাফ ব্যবহার করুন, bulk number-crunching-এর জন্য নয়।

</Callout>

## গ্রাফ কখন জেতে

তিনটা ডোমেইন যেখানে গ্রাফ ডেটাবেস স্বাভাবিক ফিট:

**Recommendation।** "আপনি যা কিনেছেন তা যারা কিনেছে তারা আরও কিনেছে…" একটা two-hop traversal: আপনার থেকে, আপনার কেনাকাটায়, অন্য ক্রেতাদের কাছে, _তাদের_ কেনাকাটায়। Collaborative filtering একটা গ্রাফ walk।

**Fraud detection।** Fraud ring ডিভাইস, ঠিকানা, আর কার্ড শেয়ার করে। একটা single transaction পরিষ্কার দেখায়; _সংযোগের প্যাটার্নটাই_ — অনেক অ্যাকাউন্ট এক ডিভাইসের মধ্য দিয়ে চলা — সংকেত। গ্রাফ query real time-এ shared-attribute edge অনুসরণ করে সেই ring-গুলো সামনে আনে।

**Social network আর access control।** Friend graph, "mutual connection," আর "কে permission-এর একটা chain-এর মধ্য দিয়ে এই ডকুমেন্টে পৌঁছাতে পারে" সহজাতভাবেই relationship query। Network আর dependency graph (microservice call map, package dependency) একই আকৃতিতে ফিট করে।

<Callout type="warning">

**সতর্কতা:** গ্রাফ ডেটাবেস বিশেষজ্ঞ। এগুলো high-volume key lookup, bulk analytics, বা বড় opaque blob স্টোর করার জন্য তৈরি নয়, আর এগুলো সাধারণত wide-column স্টোরের মতো অনায়াসে horizontally scale করে না — traversal দ্রুত রেখে মেশিন জুড়ে একটা গ্রাফ partition করা সত্যিই কঠিন। আপনার সিস্টেমের যে অংশটা relationship নিয়ে _সেই_ অংশের জন্য একটা গ্রাফ ডেটাবেস আনুন, আর বাকি ডেটা যে স্টোরে সবচেয়ে ভালো ফিট করে তাতেই রাখুন। সেই mix-and-match পদ্ধতিই polyglot persistence, chapter 8-এর বিষয়।

</Callout>

মানসিক পরীক্ষাটা সহজ: আপনি যে সবচেয়ে মূল্যবান প্রশ্নগুলো জিজ্ঞেস করেন সেগুলো যদি "X কীভাবে Y-এর সাথে যুক্ত?" বা "A থেকে B-এর path কী?" দিয়ে শুরু হয়, একটা গ্রাফ ডেটাবেস সেগুলোর উত্তর যেকোনো join-এর স্তূপের চেয়ে দ্রুত আর অনেক বেশি সহজবোধ্যভাবে দেবে।
