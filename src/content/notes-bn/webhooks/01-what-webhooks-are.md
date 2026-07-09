---
title: 'Webhooks কী এবং কখন ব্যবহার করবেন'
subtitle: 'কিছু একটা ঘটলে অন্য কারও server-এ আপনি যে HTTP POST পাঠান, সেটাই একটা webhook। protocol-টা তুচ্ছ; কিন্তু failure mode-গুলো নয়।'
chapter: 1
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['webhooks', 'events', 'rest', 'queues']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

আপনি Stripe-এ sign up করলেন। একজন customer পেমেন্ট করল। Stripe-কে আপনার server-কে জানাতে হলো। তারা আপনাকে প্রতি মিনিটে একটা API poll করাতে পারত, কিন্তু তার বদলে আপনার দেওয়া একটা URL-এ POST করল। ওই POST-টাই ছিল একটা webhook।

Webhooks হলো inter-service push-এর সবচেয়ে সরল primitive। এটা আবার সেই জায়গা যেখানে বেশিরভাগ টিম তাদের প্রথম আসল distributed-system bug ship করে — কারণ "fire-and-forget HTTP POST" শুনতে সহজ লাগে অথচ failure case-গুলো সূক্ষ্ম।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা webhook অনেকটা এমন একটা smoke detector-এর মতো যেটা নিজে থেকেই fire station-এ ফোন করে, ধোঁয়া আছে কিনা কেউ এসে দেখবে তার অপেক্ষায় বসে থাকে না।

</Callout>

## একটা webhook-এর গড়ন

```
POST /your/webhook/url HTTP/1.1
Host: app.example.com
Content-Type: application/json
X-Webhook-ID: evt_abc123
X-Webhook-Timestamp: 1714831200
X-Webhook-Signature: t=1714831200,v1=abc...

{
  "id": "evt_abc123",
  "type": "payment.succeeded",
  "created": "2026-05-04T12:00:00Z",
  "data": { "amount": 4200, "currency": "usd", "customer": "cus_42" }
}
```

পুরো protocol-টা এটুকুই। একটা POST। JSON body। কয়েকটা header যা event ID, timestamp, আর HMAC signature বহন করে। receiver `2xx` দিয়ে acknowledge করে অথবা `5xx`/timeout দিয়ে fail করে।

এই track-এর বাকি সবকিছু — signing, retries, idempotency, dead-letter queue — হলো ওই সরল POST-টাকে এমন নেটওয়ার্কের ওপর নির্ভরযোগ্য করার অপারেশনাল গল্প, যে নেটওয়ার্ক packet drop করে, যেখানে receiver ঘণ্টার পর ঘণ্টা down থাকে, আর যেখানে attacker-রা event জাল করতে মুখিয়ে থাকে।

## Push vs pull

একটা সিস্টেম কীভাবে জানবে যে অন্য একটা সিস্টেমে কিছু ঘটেছে — এর দুটো উপায়।

**Pull (polling)।** আপনার কোড প্রতি মিনিটে `GET /api/payments?since=...` কল করে। লিখতে সহজ, চালাতে খরচসাপেক্ষ, latency = polling interval। যখন event বিরল আর বাসি data-তেও চলে, তখন এটা ঠিক আছে।

**Push (webhook)।** কিছু ঘটলে তারা আপনাকে কল করে। Low-latency, low-overhead, কিন্তু পুরো একটা নতুন failure surface নিয়ে আসে: তাদের POST পৌঁছানোর সময় যদি আপনার server down থাকে, তাহলে কী হবে?

বেশিরভাগ production integration শেষমেশ দুটোই ব্যবহার করে: low-latency notification-এর জন্য webhooks, আর মিস হওয়া event ধরার জন্য safety net হিসেবে polling।

## Webhooks vs message queue vs WebSockets

|             | Webhooks                          | Message queues                | WebSockets                     |
| ----------- | --------------------------------- | ----------------------------- | ------------------------------ |
| Direction   | producer → receiver, push         | producer → broker → consumer  | দুইমুখী (bidirectional)        |
| Transport   | HTTP POST                         | AMQP / Kafka / SQS / NATS     | WebSocket frame                |
| Coupling    | producer receiver-এর URL জানে     | দুজনেই broker চেনে            | persistent connection          |
| Reach       | internet-এর যেকোনো HTTPS endpoint | সাধারণত এক trust zone-এর ভেতর | সাধারণত browser ↔ আপনার server |
| Operational | মূলত producer                     | মূলত broker                   | দুই প্রান্তই                   |
| Replay      | producer replay করে               | broker replay করে             | reconnect + resume             |

Webhooks-ই সঠিক উত্তর যখন:

- receiver ভিন্ন কোনো organisation, network, বা trust zone-এ থাকে।
- আপনাকে অনেকগুলো স্বাধীন receiver-কে জানাতে হয় (একটা event, একাধিক subscriber, প্রত্যেকের নিজস্ব URL)।
- আপনি চান receiver শুধু plain HTTPS ব্যবহার করুক — কোনো broker SDK নেই, কোনো WebSocket library নেই।
- receiver ঠিক করে কখন এবং আদৌ consume করবে কিনা; producer প্রতি consumer-এর জন্য আলাদা queue রাখে না।

এগুলো ভুল যখন:

- দুই পক্ষই আপনার নিয়ন্ত্রণে থাকা এক infrastructure-এর ভেতরে। একটা queue ব্যবহার করুন (path-এ পরে **Messaging & queues** অধ্যায়)।
- আপনার browser-এ realtime UI update দরকার। WebSockets বা SSE ব্যবহার করুন (যে track আপনি সবেমাত্র শেষ করলেন)।
- "eventually delivered"-এর চেয়ে শক্ত ordering guarantee লাগে। Retry-এর সময় webhooks reorder করে।
- প্রতি receiver-এ throughput টানা >1K events/sec। HTTP overhead-ই তখন প্রধান হয়ে যায়; একটা queue-তে switch করুন আর receiver-কে drain করতে দিন।

## চারটে কঠিন অংশ

একটা POST request মানে একটা HTTP call। কিন্তু একটা _production_ webhook সিস্টেমকে solve করতে হয়:

**১. Authenticity।** receiver-কে নিশ্চিত হতে হবে POST-টা সত্যিই আপনার কাছ থেকে এসেছে, URL আন্দাজ করে ফেলা কোনো attacker-এর কাছ থেকে নয়। → HMAC signing (অধ্যায় ৪)।

**২. At-least-once delivery।** নেটওয়ার্ক drop করে। Receiver প্রসেসিংয়ের মাঝপথে crash করে। receiver acknowledge না করা পর্যন্ত producer-কে retry করতে হবে। → backoff সহ Retries (অধ্যায় ৬)।

**৩. Idempotency।** Retry মানে একই event একাধিকবার পৌঁছায়। receiver-কে সেটা একবারই process করতে হবে। → Event ID আর dedup (অধ্যায় ৭)।

**৪. Durability।** যে producer database-এ লিখে ফেলার পর কিন্তু POST পাঠানোর আগে crash করে, সে event-টা চিরতরে হারায়। → outbox pattern (অধ্যায় ১০)।

এর যেকোনো একটা বাদ দিলে webhooks হয়ে যায় "প্রায়-সঠিক event" — নীরব data loss, double-charge, মিস হওয়া notification। চারটে একসাথেই সেই পার্থক্য গড়ে দেয় — demo-তে কাজ করা feature আর বছরের পর বছর কাজ করা feature-এর মধ্যে।

## একটা আসল webhook সিস্টেম

Stripe-এর webhook infrastructure হলো canonical reference। এর গড়ন:

- Producer (Stripe) প্রতিটা state change-এর জন্য event generate করে।
- প্রতিটা customer এক বা একাধিক endpoint URL register করে এবং তারা যে event type নিয়ে ভাবে সেগুলো বেছে নেয়।
- Producer প্রতিটা payload customer-এর secret দিয়ে sign করে।
- Producer delivery-র চেষ্টা করে; non-2xx বা timeout হলে, ৩ দিন পর্যন্ত exponential backoff-এ retry করে।
- Customer-এর receiver signature verify করে, event ID দিয়ে dedupe করে, process করে, 200 return করে।
- Stripe একটা dashboard expose করে — যেখানে delivery history, প্রতিটা attempt-এর request/response, আর manual retry বাটন থাকে।

ওই dashboard-টাই হলো আসল ইঙ্গিত। Webhooks কোনো fire-and-forget feature নয়; এটা একটা _operated_ feature। আপনি সিস্টেমটা _এবং_ সেটা debug করার tooling — দুটোই বানান।

## Receiver-এর দৃষ্টিভঙ্গি

আপনি যদি অন্য কারও webhook-এর সাথে integrate করেন, নিয়মগুলো সরল:

- **তাড়াতাড়ি 200 return করুন** (কয়েক সেকেন্ডের মধ্যে)। ধীর কাজ background queue-তে defer করুন।
- **এই event ID আগে দেখলেও 200 return করুন।** Idempotency আপনার দায়িত্ব।
- **প্রতিটা request-এ signature verify করুন।** check ফেল করে এমন যেকোনো কিছু reject করুন।
- **আপনার replay window-এর চেয়ে পুরনো event reject করুন** (সাধারণত ৫ মিনিট)।
- **Duplicate পাওয়ার জন্য তৈরি থাকুন** — at-least-once-ই হলো contract।

বেশিরভাগ bug আসে সেসব receiver থেকে যারা webhook handler-এই ধীর synchronous কাজ করে। producer timeout করে, retry করে, আর এখন আপনার হাতে একই payment-এর N কপি process হয়ে বসে।

<Callout type="warn">

**Receiver-দের idempotent হতেই হবে।** একদম নিখুঁত retry policy সহ একটা producer-ও কিছু event দুবার deliver করবে, যখন receiver-এর 200 response TCP আর আপনার application-এর মাঝে হারিয়ে যায়। receiver dedupe করে; producer exactly-once গ্যারান্টি দিতে পারে না।

</Callout>

## যখন webhooks fail করে অথচ আপনি টের পান না

তিনটে নীরব failure mode মনে রাখার মতো:

**১. Receiver 200 return করে কিন্তু পরে throw করে।** producer ভাবে event পৌঁছে গেছে। receiver সেটা মেঝেতে ফেলে দিয়েছে। ফিক্স: receiver-রা event persist করার _পরে_ acknowledge করে, আগে নয়।

**২. Producer side-effect-এর পরে, পাঠানোর আগে crash করে।** আপনার DB-তে একটা payment record হয়েছে কিন্তু কোনো webhook যায়নি। Customer-দের সিস্টেম কখনও জানতেই পারে না। ফিক্স: outbox pattern (অধ্যায় ১০)।

**৩. স্থায়ী failure নজরে পড়ে না।** receiver URL মৃত, producer ৩ দিন retry করে, হাল ছেড়ে দেয়, কাউকে page করা হয় না। ফিক্স: alerting সহ dead-letter queue (অধ্যায় ৮)।

আপনার webhook সিস্টেমে এর একটাও না থাকলে, আপনি এটা এখনও বানানই নি — আপনি শুধু এর happy path ship করেছেন।

## "Self-hosted" দেখতে কেমন

পুরো track-টা vendor-neutral থাকে। কোনো "AWS EventBridge ব্যবহার করো" বা "Hookdeck-এ deploy করো" নেই। আমরা একটা Go producer, একটা Go receiver, outbox আর inbox-এর জন্য Postgres বানাই, আর একটা VPS-এ nginx-এর পেছনে ship করি। path-এর বাকি অংশের মতোই একই অপারেশনাল গড়ন।

আপনি operator-এর যন্ত্রণাটাও অনুভব করার সুযোগ পান। Webhooks চালানো আপনাকে শেখায় managed service-রা কেন এর জন্য টাকা নেয় — তারা মৃত receiver, noisy retry, replay UI সামলায়। একবার নিজে বানিয়ে ফেললে আপনি ঠিক করতে পারবেন build করবেন নাকি buy।

## রিক্যাপ

- একটা webhook হলো কিছু ঘটলে আপনার করা একটা POST। JSON body, কয়েকটা header, 2xx ack।
- Push হলো polling-এর বিকল্প। Latency কম, operation কঠিন।
- Webhooks খাটে cross-trust-boundary push-এ, অনেক receiver-এর কাছে; queue খাটে এক infra-এর ভেতরে।
- চারটে কঠিন অংশ: authenticity (HMAC), at-least-once (retries), idempotency (dedup), durability (outbox)।
- Receiver-দের দ্রুত response দিতে হবে, dedupe করতে হবে, signature verify করতে হবে, replay accept করতে হবে।
- নীরব failure আসে receiver খুব তাড়াতাড়ি ack করা থেকে, producer side-effect-এর পরে crash করা থেকে, আর নজরে না পড়া স্থায়ী failure থেকে।
- আমরা এটা Go + Postgres-এ VPS-এ self-hosted বানাই — Stripe-এর মতোই গড়ন, আপনার scale-এ।

পরবর্তী: [Event contract design](/notes/webhooks/02-event-contract) — type, field, idempotency key, আর সেই schema-evolution নিয়ম যা আপনার customer-দের কোড চালু রাখে।
