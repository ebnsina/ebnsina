---
title: 'System Design — রোডম্যাপ'
subtitle: 'শূন্য থেকে শুরু। Estimation, storage, scaling, failure — আর ছয়টা পূর্ণাঙ্গ প্রজেক্ট ডিজাইন।'
chapter: 0
level: 'beginner'
readingTime: '৮ মিনিট'
topics: ['roadmap', 'system design']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একজন স্থপতি বাড়ির নকশা করার সময় শুধু "সুন্দর দেখতে" ছবি আঁকেন না। তিনি জানতে চান কতজন থাকবে, মাটি কেমন, বাজেট কত, ভূমিকম্প হলে কী হবে, বিশ বছর পরে আরেকটা তলা তোলা যাবে কিনা। System design ঠিক তা-ই — সফটওয়্যারের স্থাপত্য। ডায়াগ্রাম আঁকা এখানে শেষ ধাপ, প্রথম ধাপ নয়।

</Callout>

## গল্পে বুঝি

ধরুন বাগদাদের এক তরুণ কারিগর, নাম ইবনে সিনা, শহরের মাঝখানে একটা ছোট চায়ের দোকান খুলল। প্রথম দিন দশজন খদ্দের। এক কেটলি, এক চুলা, এক কাপ ধোয়ার বালতি — সব চলে যায়। ইবনে সিনা নিজেই অর্ডার নেয়, নিজেই বানায়, নিজেই হিসাব রাখে।

ছয় মাস পরে দোকানটা বিখ্যাত হয়ে গেল। দিনে দুই হাজার খদ্দের। এখন এক চুলায় হয় না — লাইন লম্বা হয়ে রাস্তা পর্যন্ত চলে যায়। ইবনে সিনা আরও দুইটা চুলা বসাল (**horizontal scaling**)। কিন্তু তখন নতুন সমস্যা: কোন খদ্দের কোন চুলার লাইনে দাঁড়াবে? সে একজনকে দরজায় দাঁড় করাল, যে এসে বলে দেয় "আপনি ওই লাইনে যান, ওটা ছোট" (**load balancer**)। আরও দেখা গেল, দিনের সবচেয়ে জনপ্রিয় জিনিস — দুধ চা — প্রতিবার নতুন করে বানাতে গেলে সময় নষ্ট; তাই সে বড় ফ্লাস্কে আগেই বানিয়ে রাখে (**cache**)।

হিসাবের খাতা একটা ছিল, এখন সেটা সামলানো যাচ্ছে না — একজন লিখতে গেলে আরেকজন অপেক্ষা করে। তাই সে খাতা ভাগ করল: সকালের বিক্রি এক খাতায়, বিকেলের আরেক খাতায় (**sharding**)। আর খাতা হারিয়ে গেলে সব শেষ, তাই প্রতিদিন রাতে একটা নকল কপি বানিয়ে বাড়িতে রেখে আসে (**replication**)। কেক সাপ্লায়ার কর্ডোবা থেকে আসে, মাঝে মাঝে দেরি করে — তাই সে অর্ডারটা একটা কাগজে লিখে বাক্সে ফেলে রাখে, সাপ্লায়ার সুবিধামতো এসে বাক্স খালি করে (**message queue**)। ভিড়ের সময় একেকজন যাতে বিশ কাপ চা নিয়ে সবার সময় নষ্ট না করে, সে নিয়ম করল — একজন সর্বোচ্চ পাঁচ কাপ (**rate limiting**)। আর দিনশেষে সে খাতায় লিখে রাখে কত কাপ বিক্রি হলো, কত অর্ডার ফেরত গেল, গড়ে কতক্ষণ লাইনে দাঁড়াতে হলো (**observability**)।

মিলিয়ে নিই: বাড়তি চুলা হলো **horizontal scaling**, দরজার লোকটা **load balancer**, আগে বানানো ফ্লাস্ক **cache**, খাতা ভাগ করা **sharding**, নকল কপি **replication**, অর্ডারের বাক্স **message queue**, পাঁচ কাপের নিয়ম **rate limiting**, আর দিনশেষের হিসাব **observability**। এই পুরো ট্র্যাকটা আসলে এই একটাই গল্প — শুধু চায়ের দোকানের জায়গায় সার্ভার, আর খদ্দেরের জায়গায় HTTP রিকোয়েস্ট।

<Mermaid
title="এই ট্র্যাকের চারটি ধাপ"
code={`graph LR
  A["Fundamentals<br/>১-৭"] --> B["Building Blocks<br/>৮-১৫"] --> C["Distributed<br/>১৬-২৩"] --> D["Mastery<br/>২৪-২৭"]`}
/>

## যা যা শিখবেন

এই ট্র্যাকটা ধরে নিচ্ছে আপনি জীবনে কখনো কোনো সিস্টেম ডিজাইন করেননি। প্রথম চ্যাপ্টারে "সিস্টেম ডিজাইন" শব্দটার মানে কী, সেটা থেকেই শুরু। ধীরে ধীরে আপনি শিখবেন কীভাবে একটা ঝাপসা দাবি ("আমাদের একটা ইনস্টাগ্রাম বানাতে হবে") থেকে সংখ্যাসহ স্পেসিফিকেশন বের করতে হয়, খাতা-কলমে হিসাব করে বুঝতে হয় কয়টা সার্ভার লাগবে, কোন ডেটাবেস কেন বেছে নেবেন, ট্রাফিক দশগুণ বাড়লে কোথায় প্রথম ফাটল ধরবে, এবং কিছু একটা ভেঙে গেলে সিস্টেম কীভাবে মরে না গিয়ে খুঁড়িয়ে চলবে।

সবচেয়ে গুরুত্বপূর্ণ: এখানে ছয়টা **পূর্ণাঙ্গ প্রজেক্ট ডিজাইন** আছে — URL shortener, ফাইল আপলোড সার্ভিস, নোটিফিকেশন সিস্টেম, চ্যাট, নিউজ ফিড আর ভিডিও স্ট্রিমিং। প্রতিটাতে requirement থেকে শুরু করে estimation, API, schema, cache, scaling — শেষ পর্যন্ত। তত্ত্ব পড়ে ভুলে যাওয়া সহজ; একটা সিস্টেম গোড়া থেকে দাঁড় করানোর অভিজ্ঞতা ভোলা কঠিন।

<Callout type="tip">

চ্যাপ্টারগুলো ক্রমানুসারে পড়ুন। প্রতিটি চ্যাপ্টার আগেরটার শব্দভাণ্ডার ধরে নিয়ে এগোয় — ৩ নম্বর চ্যাপ্টারের হিসাব না জানলে ৭ নম্বরের প্রজেক্টটা শুধু ছবি দেখা হয়ে যাবে।

</Callout>

## এই ট্র্যাকের চ্যাপ্টারগুলো

### ধাপ ১ — ভিত্তি (Fundamentals)

1. **সিস্টেম ডিজাইন আসলে কী** — শব্দভাণ্ডার, trade-off ম্যানেজমেন্ট, সাদা পাতা থেকে শুরু করার পদ্ধতি
2. **Requirements ও Constraints** — functional বনাম non-functional, ঝাপসা দাবিকে প্রশ্ন করে স্পেসে নামানো
3. **Estimation** — QPS, read/write ratio, storage growth, bandwidth, সার্ভার সংখ্যা — খাতা-কলমের অঙ্ক
4. **একটা রিকোয়েস্টের শরীরবৃত্ত** — DNS, TLS, load balancer, app server, cache, DB — প্রতিটা হপের খরচ ও ফেইলিওর
5. **ডেটা স্টোর বেছে নেওয়া** — relational, document, key-value, wide-column, search, object storage
6. **Latency Numbers ও Percentile** — মুখস্থ রাখার মতো সংখ্যা, p50/p95/p99, গড় কেন মিথ্যা বলে
7. **প্রজেক্ট ১: URL Shortener** — প্রথম পূর্ণাঙ্গ ডিজাইন, requirement থেকে scaling পর্যন্ত

### ধাপ ২ — নির্মাণ-উপকরণ (Building Blocks)

8. **API ডিজাইন** — resource মডেলিং, pagination, versioning, idempotency, error contract
9. **ডেটা মডেলিং ও Schema** — normalization, denormalization, access pattern থেকে টেবিল বানানো
10. **Indexing ও Query Performance** — B-tree, composite index, কেন query ধীর হয়, EXPLAIN পড়া
11. **Caching লেয়ার** — browser, CDN, application, database — কোন স্তরে কী ক্যাশ করবেন
12. **Load Balancing** — L4 বনাম L7, algorithm, health check, sticky session
13. **Stateless সার্ভিস ও Horizontal Scaling** — state কোথায় রাখবেন, auto-scaling, graceful shutdown
14. **Rate Limiting ও Quota** — token bucket, sliding window, distributed rate limiter
15. **প্রজেক্ট ২: ফাইল আপলোড ও মিডিয়া সার্ভিস** — object storage, presigned URL, thumbnail pipeline, CDN

### ধাপ ৩ — ডিস্ট্রিবিউটেড দুনিয়া (Distributed Systems)

16. **Replication** — leader-follower, sync বনাম async, replication lag, failover
17. **Sharding ও Partitioning** — shard key বাছাই, hot partition, resharding, consistent hashing
18. **Consistency, CAP ও PACELC** — strong, eventual, read-your-writes — বাস্তবে কোনটা কখন
19. **Message Queue ও Async Processing** — producer/consumer, at-least-once, retry, dead-letter queue
20. **প্রজেক্ট ৩: নোটিফিকেশন সিস্টেম** — fan-out, deduplication, retry, ইউজার প্রেফারেন্স, throttling
21. **Event-Driven Architecture** — event log, outbox pattern, CDC, saga, exactly-once-এর মিথ
22. **Search ও Inverted Index** — কেন `LIKE '%x%'` স্কেল করে না, ranking, autocomplete
23. **প্রজেক্ট ৪: চ্যাট সিস্টেম** — WebSocket, connection routing, presence, message ordering, offline delivery

### ধাপ ৪ — পরিপক্বতা (Mastery)

24. **Failure ও Resilience** — timeout, retry, circuit breaker, bulkhead, graceful degradation
25. **Observability, SLO ও Capacity Planning** — metric/log/trace, error budget, খরচের অঙ্ক
26. **প্রজেক্ট ৫: নিউজ ফিড** — fan-out on write বনাম read, celebrity সমস্যা, ranking, feed cache
27. **প্রজেক্ট ৬: ভিডিও স্ট্রিমিং প্ল্যাটফর্ম** — upload, transcoding pipeline, adaptive bitrate, CDN, খরচ

## এই ট্র্যাক কাদের জন্য

**যাদের জন্য একদম উপযুক্ত** — যারা কিছুদিন কোড লিখেছেন (একটা CRUD অ্যাপ বানাতে পারেন, একটা API কল করতে জানেন), কিন্তু "আপনার সিস্টেমটা এক মিলিয়ন ইউজারে কীভাবে স্কেল করবে" প্রশ্নটা শুনলে মাথা ফাঁকা হয়ে যায়। যারা ইন্টারভিউয়ের system design রাউন্ডের জন্য প্রস্তুতি নিচ্ছেন। যারা টিমের সিনিয়রদের আলোচনায় "replication lag", "eventual consistency", "p99" শব্দগুলো শুনে চুপ করে থাকেন।

**যাদের জন্য নয়** — যারা এখনো প্রোগ্রামিংয়ের একদম শুরুতে (আগে একটা ভাষা আর একটা ডেটাবেস নিয়ে কাজ করে আসুন), অথবা যারা ইতিমধ্যেই মাল্টি-রিজিয়ন ডিস্ট্রিবিউটেড সিস্টেম প্রোডাকশনে চালান — তাদের জন্য প্রথম দুই ধাপ পুনরাবৃত্তি মনে হবে।

**যা লাগবে** — যেকোনো একটা প্রোগ্রামিং ভাষার সাধারণ জ্ঞান (কোড উদাহরণগুলো TypeScript আর Go-তে), SQL-এর প্রাথমিক ধারণা, আর একটা খাতা-কলম। হ্যাঁ, সত্যিই খাতা-কলম — estimation চ্যাপ্টারের অঙ্কগুলো নিজে হাতে করলে যা শিখবেন, পড়ে গেলে তার অর্ধেকও হবে না।

<Callout type="warning">

System design-এ "সঠিক উত্তর" বলে কিছু নেই — আছে ভালো ট্রেড-অফ আর খারাপ ট্রেড-অফ। কেউ যদি আপনাকে বলে "এই আর্কিটেকচারটাই সঠিক", তার কাছে জিজ্ঞেস করুন "কোন scale-এ, কোন constraint-এ?" — উত্তর না পেলে বুঝবেন সে নকশা মুখস্থ করেছে, বোঝেনি।

</Callout>
