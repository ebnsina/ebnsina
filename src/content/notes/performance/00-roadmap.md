---
title: 'Performance Engineering — রোডম্যাপ'
subtitle: 'pprof আর perf দিয়ে profiling, flamegraph, latency budget, p99 চিন্তাভাবনা।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা রেস কারের pit crew: প্রতিটা সেকেন্ডের এক-দশমাংশও গুরুত্বপূর্ণ, তাই তারা সবকিছু মাপে, গাড়ির performance ডেটা profile করে, আর শুধু সেটাই ঠিক করে যেটাকে ডেটা বলছে ধীর — যেটা ধীর মনে হয় সেটা না। Performance engineering হলো সফটওয়্যারে প্রয়োগ করা সেই একই শৃঙ্খলা: আগে মাপো, আসল bottleneck খুঁজতে profile করো, তারপর ঠিক সেটাকেই optimize করো।

</Callout>

## যা তুমি শিখবে

বেশিরভাগ performance সমস্যাই থাকে database-এ। বেশিরভাগ ডেভেলপার অনুমান করে এটা application code-এ। এই ট্র্যাক শেখায় শৃঙ্খলাটা: latency নিয়ে কীভাবে ভাবতে হয় (percentile, budget, tail latency), Node.js আর Go application-কে flamegraph দিয়ে কীভাবে profile করতে হয়, query plan কীভাবে পড়তে হয় আর তার ওপর কীভাবে অ্যাকশন নিতে হয়, caching কীভাবে সাহায্য করে আর কখন এটা সমস্যা লুকিয়ে ফেলে, আর যেভাবে load test করলে সেটা আসলে production-কে প্রতিফলিত করে।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **Latency Thinking** — P50 vs P99, tail latency, latency budget, Little's Law
2. **Profiling** — Node.js --prof, Go pprof, Linux perf, flamegraph, continuous profiling
3. **Database Performance** — EXPLAIN ANALYZE, index strategy, N+1 query, connection pooling
4. **Caching** — cache level, Redis pattern, stampede prevention, invalidation, CDN
5. **Load Testing** — k6, autocannon, breaking point খুঁজে বের করা, বাস্তবসম্মত test data
