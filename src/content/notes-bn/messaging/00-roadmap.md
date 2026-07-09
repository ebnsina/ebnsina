---
title: 'মেসেজিং ও কিউ — রোডম্যাপ'
subtitle: 'RabbitMQ বা NATS সেলফ-হোস্ট করুন। তারপর ৩টি VPS জুড়ে একটা Kafka cluster চালান।'
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

সার্ভিসগুলোর জন্য একটা ডাকঘর ব্যবস্থা: প্রতিটা সার্ভিস সরাসরি অন্য প্রতিটা সার্ভিসকে কল করার বদলে (ফোন কল, যেটা যেকোনো এক পক্ষ ব্যস্ত থাকলে ফেল করে), সার্ভিসগুলো মেসেজ জমা রাখে আর প্রস্তুত হলে সেগুলো তুলে নেয়। RabbitMQ হলো লোকাল পোস্ট অফিস, Kafka হলো জাতীয় আর্কাইভ যেটা এখন পর্যন্ত পাঠানো প্রতিটা চিঠি জমিয়ে রাখে।

</Callout>

## আপনি যা শিখবেন

সরাসরি HTTP call সার্ভিসগুলোকে সময়ের দিক থেকে couple করে ফেলে — downstream ডাউন থাকলে upstream ফেল করে। এই ট্র্যাকে থাকছে কখন async messaging এই সমস্যাটা সমাধান করে, RabbitMQ, Kafka আর NATS-এর মধ্যে কীভাবে বাছাই করবেন, প্রতিটা ভেতরে ভেতরে কীভাবে কাজ করে, আর কোন কোন pattern (outbox, saga, inbox) partial failure সত্ত্বেও distributed system-কে নির্ভরযোগ্য করে তোলে।

## এই ট্র্যাকের অধ্যায়সমূহ

1. **Why Messaging Systems** — coupling, backpressure, delivery guarantee, কখন কোন সিস্টেম ব্যবহার করবেন
2. **RabbitMQ** — AMQP model, exchanges, dead letter queue, backoff সহ retry, clustering
3. **Kafka** — topics, partitions, consumer groups, retention, transactional producer
4. **NATS** — core pub/sub, JetStream stream, KV store, request-reply, clustering
5. **Messaging Patterns** — outbox, inbox, choreography বনাম orchestration, saga, poison pill
