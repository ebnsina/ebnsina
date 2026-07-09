---
title: 'Load Balancing — রোডম্যাপ'
subtitle: 'HAProxy আর nginx। L4 vs L7, health check, sticky session, weighted routing।'
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

ব্যস্ত মোড়ে দাঁড়ানো একজন ট্রাফিক পুলিশ: সে প্রতিটা গাড়ি দেখে, ঠিক করে কোনটা কোন রাস্তায় যাবে, আর দুর্ঘটনা হলে সঙ্গে সঙ্গে ঘুরিয়ে দেয়। একটা load balancer HTTP request-এর জন্য ঠিক এই কাজটাই করে — প্রতিটা connection দেখে, বুদ্ধি খাটিয়ে route করে, আর মৃত server-গুলোকে rotation থেকে বের করে রাখে।

</Callout>

## যা যা শিখবেন

একটা server-এর একটা সীমা আছে। Load balancer সেই সীমা সরিয়ে দেয় — কিন্তু শুধু তখনই, যখন আপনি বুঝবেন তারা কী দেখতে পারে আর কী পারে না। এই track-এ পুরো ছবিটা কভার করা হয়েছে: L4 আর L7 routing-এর পার্থক্য, কোন algorithm ঠিক করে কোন request কোন server-এ যাবে, কীভাবে health check মৃত backend-গুলোকে rotation-এর বাইরে রাখে, SSL termination, আর HAProxy-র ভেতরের যেসব ব্যাপার production-grade routing সম্ভব করে।

## এই track-এর chapter-গুলো

1. **L4 vs L7 Load Balancing** — প্রতিটা layer কী inspect করতে পারে, IP দিয়ে route করা vs URL দিয়ে route করা
2. **Algorithms** — round-robin, least connections, IP hash, weighted, consistent hashing
3. **Health Checks** — active vs passive detection, threshold, connection draining
4. **SSL Termination** — LB-তে TLS, cert automation, end-to-end encryption, SNI
5. **HAProxy in Depth** — frontend, backend, ACL, stats page, runtime API, rate limiting
6. **Advanced Patterns** — blue-green deployment, global load balancing, GeoDNS, anycast
