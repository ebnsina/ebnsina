---
title: 'Microservices — রোডম্যাপ'
subtitle: 'কখন একটা monolith ভাঙবেন, service-দের মধ্যে gRPC, Consul দিয়ে service discovery।'
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

একটা ছোট রেস্তোরাঁ বনাম একটা food court: একটা রেস্তোরাঁর (monolith) থাকে একটাই রান্নাঘর, একটাই বিল, একটাই স্টাফ — মেনু বিস্ফোরিত না হওয়া পর্যন্ত আর রান্নাঘর সামলাতে না পারা পর্যন্ত চালানো সহজ। একটা food court-এ (microservices) থাকে বিশেষায়িত স্টল, যেগুলো স্বাধীনভাবে খুলতে-বন্ধ হতে পারে, নিজেদের মতো scale করতে পারে, এবং পুরো court বন্ধ না করে একাই fail করতে পারে। এর trade-off হলো coordination: অর্ডার কে নেয়, আর sushi কীভাবে জানবে যে stir-fry রেডি?

</Callout>

## আপনি যা শিখবেন

Microservices কোনো default নয় — এটা একটা trade-off। এই track-এ কভার করা হয়েছে ভাঙার আসল খরচগুলো (distributed transactions, network calls, operational overhead), কাটার আগে সঠিক seam কীভাবে খুঁজে বের করবেন, আর যে infrastructure service-গুলোকে একসাথে ধরে রাখে: gRPC contracts, service discovery, API gateway pattern, এবং reliability pattern (circuit breakers, bulkheads, retries) যেগুলো একটা slow service-কে পুরো outage-এ cascade হওয়া থেকে ঠেকায়।

## এই track-এর chapter-গুলো

1. **Monolith vs Microservices** — কখন ভাঙবেন, strangler fig pattern, মাঝামাঝি সমাধান হিসেবে modular monolith
2. **gRPC Between Services** — Protocol Buffers, code generation, streaming, error handling, schema evolution
3. **Service Discovery** — DNS-based discovery, Consul, client-side vs server-side LB, service mesh
4. **API Gateway** — routing, auth, rate limiting, request transformation, gateway-এ কী রাখবেন না
5. **Inter-Service Reliability** — timeouts, retries, circuit breakers, bulkheads, hedged requests
