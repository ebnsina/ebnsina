---
title: 'Webhooks — রোডম্যাপ'
subtitle: "দশটি অধ্যায়, যেগুলো 'webhooks তো নিছক HTTP POST request' থেকে শুরু করে এমন একটা সেল্ফ-হোস্টেড, signed, retried, idempotent webhook সিস্টেম পর্যন্ত নিয়ে যায় যেটা receiver ঘণ্টার পর ঘণ্টা down থাকলেও টিকে থাকে।"
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'webhooks', 'hmac', 'retries', 'idempotency']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## শেষে গিয়ে আপনি যা করতে পারবেন

আপনি এমন event contract ডিজাইন করতে পারবেন যা client-দের ভাঙে না, HMAC payload সঠিকভাবে sign ও verify করতে পারবেন, সঠিক backoff ও deadline সহ delivery retry করতে পারবেন, receiver-এ idempotency key দিয়ে dedupe করতে পারবেন, স্থায়ীভাবে ফেল করা delivery-গুলোকে dead-letter queue-তে route করতে পারবেন, একটা replay UI expose করতে পারবেন, এবং outbox pattern ব্যবহার করে এমন একটা self-hosted producer ship করতে পারবেন যা database commit হলেও network drop করলে event হারায় না।

<Callout type="info">

**পূর্বশর্ত:** আগে **REST API building** track-টা শেষ করুন। Webhooks হলো HTTP — প্রতিটা concept সেখান থেকেই আসে। Producer-এর দিকটার জন্য **Background jobs** এবং **Messaging & queues** track জানা থাকলে সুবিধা হয়; signing-এর জন্য **TLS & Certificates** track। এখানে প্রাইমারি ভাষা Go; তবে pattern-গুলো Node আর Python-এও সরাসরি খাটে।

</Callout>

## ১০টি অধ্যায়, ক্রমানুসারে

**ভিত্তি (Foundations)**

1. **Webhooks কী এবং কখন ব্যবহার করবেন** — push vs pull, queue-এর সাথে তুলনা, WebSockets-এর সাথে তুলনা
2. **Event contract design** — type, field, versioning, idempotency key
3. **Webhooks পাঠানো** — Go-তে producer-এর দিকটা, ৬০ লাইনে
4. **Payload signing** — HMAC, timestamp, canonical string

**Receiver-এর গল্প**

5. **Signature verify করা** — timing-safe compare, replay window, key rotation
6. **Retries ও backoff** — jitter সহ exponential, deadline, হাল ছেড়ে দেওয়ার নিয়ম
7. **Receiver-এ idempotency** — event ID দিয়ে dedup, inbox pattern
8. **Delivery guarantee ও dead-letter queue** — at-least-once, কখন drop করবেন

**Production**

9. **Observability ও replay** — dashboard, per-endpoint metrics, manual replay UI
10. **Self-host** — outbox pattern, worker pool, nginx-এর পেছনে

## এই track কীভাবে ব্যবহার করবেন

ক্রমানুসারে পড়ুন। প্রথম চার অধ্যায়ে একটা কাজ করা sender ship হয়; অধ্যায় ৫–৮ receiver-এর গল্প গড়ে তোলে; শেষ দুটো অপারেশনাল। মোট পড়ার সময়: ~৩ ঘণ্টা। হাতে-কলমে, পুরো সিস্টেমটা প্রথমবার বানাতে: একটা লম্বা weekend।

অধ্যায় ১০-এর জন্য আপনার লাগবে Go 1.22+, Postgres, এবং একটা public-internet থেকে reachable VPS (webhooks-এর একটা inbound URL দরকার)। টেস্টিংয়ের জন্য **ngrok** বা **smee.io** লোকালে কাজ করবে।
