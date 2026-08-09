---
title: 'API Gateway — রোডম্যাপ'
subtitle: 'nginx, Kong, বা Envoy দিয়ে নিজের গেটওয়ে বানান। Auth, rate limit, route, transform.'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা হোটেলের concierge ডেস্ক ভাবুন: প্রতিটা অতিথিকে একটাই যোগাযোগের পয়েন্টের মধ্য দিয়ে যেতে হয়, যেটা দিকনির্দেশনা, রিজার্ভেশন, নিরাপত্তা যাচাই আর বিশেষ অনুরোধ সব সামলায় — ফলে হোটেলের আলাদা আলাদা ডিপার্টমেন্টের কাউকে এসব নিয়ে ভাবতে হয় না। একটা API gateway ঠিক সেই concierge: আপনার সার্ভিসগুলোর সামনে একটাই entry point, যেটা routing, authentication, rate limiting আর request transformation সামলায়, যাতে আপনার backend শুধু domain logic-এই মনোযোগ রাখতে পারে।

</Callout>

## আপনি যা শিখবেন

একটা API gateway হলো আপনার সিস্টেমে ঢোকার একমাত্র দরজা। ভালোভাবে করলে এটা cross-cutting concern-গুলো — auth, rate limiting, routing, observability — এক জায়গায় নিয়ে আসে, যাতে প্রতিটা backend সার্ভিসকে এগুলো আবার নতুন করে বানাতে না হয়। এই ট্র্যাক শুরু হয় একটা gateway আসলে কী আর কখন এটা লাগে তা দিয়ে, তারপর ধীরে ধীরে routing rule, edge-এ JWT/API-key auth, rate limiting algorithm, request transformation, আর production-এ একটা gateway-কে নির্ভরযোগ্য রাখার observability ও operational প্যাটার্ন পর্যন্ত এগোয়।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **What Is an API Gateway** — একটাই entry point, এটা কী কী সামলায়, nginx vs Kong vs Envoy, কখন gateway ব্যবহার করা উচিত নয়
2. **Routing & Load Balancing** — path matching, header-based routing, weighted split, health-aware balancing
3. **Auth at the Gateway** — JWT verification, API key validation, OAuth token introspection, backend-এ identity forward করা
4. **Rate Limiting at the Gateway** — fixed window, sliding window, token bucket, per-user আর per-endpoint limit
5. **Request & Response Transformation** — header manipulation, payload reshaping, protocol translation REST→gRPC
6. **Observability & Production Gateway** — access log, distributed tracing, circuit breaker, operational checklist
