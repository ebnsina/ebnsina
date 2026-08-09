---
title: 'Horizontal Scaling — রোডম্যাপ'
subtitle: 'Stateless সার্ভিস, load balancer, auto-scaling, ডেটাবেস bottleneck, এবং একাধিক instance জুড়ে WebSocket fan-out।'
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

মুদি দোকানে checkout lane যোগ করা: একটা lane দিয়ে ঠিকঠাক চলে যতক্ষণ না লাইন লম্বা হয়, তারপর আপনি আরও lane খোলেন। Horizontal scaling সফটওয়্যারের ক্ষেত্রে ঠিক এটাই করে — একটা load balancer-এর পেছনে আরও instance যোগ করে। শর্ত হলো প্রতিটা lane (instance) যেন যেকোনো গ্রাহককে স্বাধীনভাবে সেবা দিতে পারে, এমন কোনো লুকানো state ছাড়াই যা একজন গ্রাহককে নির্দিষ্ট একটা lane-এর সাথে বেঁধে রাখে।

</Callout>

## আপনি যা শিখবেন

Vertical scaling (আরও বড় সার্ভার) একটা সীমায় গিয়ে আটকে যায়। Horizontal scaling (আরও সার্ভার) আটকায় না — কিন্তু এর জন্য আপনার অ্যাপ্লিকেশনকে সেভাবে ডিজাইন করতে হয়। এই ট্র্যাকে পুরো ছবিটা তুলে ধরা হয়েছে: সার্ভিসগুলোকে সত্যিকারের stateless বানানো, একাধিক instance জুড়ে ট্রাফিক load balance করা, বাস্তব চাহিদার ভিত্তিতে auto-scaling করা, অ্যাপ সার্ভার scale হওয়ার সময় যে ডেটাবেস bottleneck তৈরি হয় তা সামলানো, এবং multi-instance fleet জুড়ে WebSocket connection চালু রাখা।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **Stateless Services** — twelve-factor-এর পূর্বশর্ত, session ও file আলাদা করা, statelessness পরীক্ষা করা
2. **Load Balancers** — L4 বনাম L7, algorithm, health check, connection draining, SSL termination
3. **Auto-Scaling** — target tracking, scheduled scaling, HPA, queue-driven worker-এর জন্য KEDA
4. **Scaling the Database Layer** — PgBouncer, read replica, caching, কখন shard করবেন
5. **WebSockets & Shared State** — Redis adapter, presence tracking, sticky session, বিকল্প হিসেবে SSE
