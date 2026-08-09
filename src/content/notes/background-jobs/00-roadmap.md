---
title: 'Background Jobs — রোডম্যাপ'
subtitle: 'Worker loop, Redis ও Postgres-backed queue, retry, DLQ, idempotency, cron, এবং প্রোডাকশন প্যাটার্ন।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব উদাহরণ**

একটি পোস্ট অফিসের সর্টিং ফ্যাসিলিটি: চিঠি এসে পৌঁছায়, সেগুলো বিভিন্ন বিনে (queue) সর্ট করা হয়, হ্যান্ডলাররা (worker) প্রতিটি বিন প্রসেস করে, ডেলিভারি করা যায় না এমন চিঠি একটি হোল্ডিং এরিয়ায় (dead-letter queue) চলে যায়, আর কোনো সর্টার শিফটের মাঝখানে বাড়ি চলে গেলেও গুরুত্বপূর্ণ কিছু হারায় না (graceful shutdown)।

</Callout>

## যা শিখবেন

বেশিরভাগ web app-এই শেষ পর্যন্ত এমন কাজের দরকার পড়ে যা HTTP request-এর মধ্যে থাকা উচিত নয় — email পাঠানো, upload প্রসেস করা, data sync করা, report তৈরি করা। এই ট্র্যাকটি পুরো ছবিটা কভার করে: একটি queue backend বাছাই করা, data হারানো ছাড়াই failure সামলানো, job-কে retry করার জন্য নিরাপদ বানানো, একই কাজ দুবার না চালিয়ে recurring কাজ schedule করা, এবং প্রোডাকশনে worker নির্ভরযোগ্যভাবে চালানোর অপারেশনাল প্যাটার্ন।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **Why Background Jobs** — কী queue-তে যাবে বনাম inline, worker architecture, backend বাছাই
2. **Queue Backends** — Redis-এ BullMQ বনাম Postgres-এ pg-boss, internals, transactional enqueueing
3. **Retries & Backoff** — exponential backoff, jitter, transient বনাম permanent error আলাদা করা, DLQ
4. **Idempotency** — at-least-once delivery, job-কে একাধিকবার চালানোর জন্য নিরাপদ বানানো, fencing token
5. **Cron & Scheduled Jobs** — queue-backed cron, leader election, timezone handling, missed run
6. **Worker Patterns & Production** — graceful shutdown, priority queue, fan-out, rate limiting, metrics
