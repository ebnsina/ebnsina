---
title: 'Monolith vs Microservices'
subtitle: 'ভাঙার আসল খরচ — কখন monolith-ই সঠিক সিদ্ধান্ত, কখন নয়, আর কাটার আগে কীভাবে seam গুলো চিনবেন।'
chapter: 1
level: 'beginner'
readingTime: '9 মিনিট'
topics: ['microservices', 'monolith', 'architecture', 'domain boundaries', 'decomposition']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনা শহরের মাঝে একটা বিশাল ডিপার্টমেন্ট স্টোর খুললেন — এক ছাদের নিচে জামা, জুতা, বই, মুদি, সবকিছু। একটাই ম্যানেজমেন্ট, একটাই ক্যাশ কাউন্টার, একটাই বিদ্যুৎ লাইন। দোকান খোলা দারুণ সহজ ছিল — এক জায়গায় সব সাজিয়ে দিলেই হলো, আলাদা করে কারও সাথে সমন্বয়ের ঝামেলা নেই। কিন্তু কয়েক মাস পর জুতার সেকশন এত জনপ্রিয় হলো যে জায়গা বাড়াতে হবে — আর সেটা করতে গিয়ে দেখা গেল আধা স্টোর ভেঙে নতুন করে সাজাতে হচ্ছে, এই কদিন পুরো দোকানই এলোমেলো। তার ওপর একদিন একটা ফিউজ উড়ে গেল, আর গোটা বিল্ডিং অন্ধকার — জুতা, বই, মুদি সব বন্ধ।

পাশের এলাকায় আবার আল-খোয়ারিজমি আর ফাতিমা আল-ফিহরি একটা মার্কেট গড়লেন — আলাদা আলাদা মালিকের ছোট ছোট বিশেষায়িত দোকান। জুতার দোকান নিজের মতো বড় করে, বই-এর দোকান নিজের মতো সাজায়, একটা দোকান বন্ধ থাকলেও বাকিরা দিব্যি চলে। একটা দোকানে লোডশেডিং হলে পাশেরটা তবু খোলা। কিন্তু এবার দরকার হলো রাস্তা, সাইনবোর্ড, দোকানে দোকানে হাঁটাহাঁটি, আর কে কোথায় আছে তার সমন্বয় — একটা ছাদের সরলতা আর নেই।

এই গল্পটাই monolith বনাম microservices। এক ছাদের ডিপার্টমেন্ট স্টোর হলো **monolith** — শুরু করা আর চালানো সহজ, কিন্তু সব একে অপরের সাথে coupled, তাই এক অংশ scale করতে গেলে গোটাটায় হাত দিতে হয় আর একটা failure পুরো system নামিয়ে দেয়। আলাদা দোকানের মার্কেট হলো **microservices** — প্রতিটা service স্বাধীনভাবে deploy আর scale হয়, একটার failure বাকিদের ফেলে না, কিন্তু বিনিময়ে আসে network আর operational complexity (রাস্তা মানে network call, সমন্বয় মানে service discovery, monitoring, coordination)। বাস্তবে Amazon বা Netflix ঠিক এই কারণেই বহু ছোট service-এ ভাগ হয়েছে — তবে বেশিরভাগ ছোট team-এর জন্য এক ছাদের স্টোর দিয়ে শুরু করাটাই সঠিক।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা Swiss Army knife বনাম একজন পেশাদার শেফের ছুরির সেট: Swiss Army knife একটাই প্যাকেজে সবকিছু করে — বহন করা সহজ, কোনো coordination লাগে না। শেফের সেটে থাকে বিশেষায়িত টুল, প্রতিটা একটা কাজ দুর্দান্তভাবে করে। কিন্তু শেফের সেটে জানতে হয় কোন ছুরি ধরতে হবে, সবগুলোকে ধারালো রাখতে হয়, আর একটাও হারানো চলবে না। সঠিক পছন্দ নির্ভর করে আপনি কী রাঁধছেন আর রান্নাঘরে কতজন রাঁধুনি আছে তার ওপর।

</Callout>

## Monolith শত্রু নয়

একটা ভালোভাবে গঠিত monolith develop করা দ্রুততর, debug করা সহজ, deploy করা সরল, এবং একটা microservices architecture-এর তুলনায় এর operational overhead কম। বেশিরভাগ team খুব তাড়াতাড়ি ভাঙে, খুব দেরিতে নয়।

একটা monolith আপনাকে যা দেয়:

- **In-process calls** — কোনো network latency নেই, কোনো serialization নেই, component-দের মধ্যে কোনো partial failure নেই
- **Atomic transactions** — একটাই database, সব operation জুড়ে ACID
- **Simple deployment** — একটা artifact, একটা deploy, একটা rollback
- **Easy debugging** — একটা process, একটা log stream, একটা stack trace

Monolith তখনই সমস্যা হয়ে দাঁড়ায় যখন নির্দিষ্ট কিছু constraint দেখা দেয়:

- **Independent deployment** — দুটো team release coordinate না করেই deploy করতে চায়
- **Independent scaling** — checkout flow-এর 10x resource দরকার কিন্তু admin panel-এর কিছুই লাগে না
- **Technology isolation** — ML team-এর Python দরকার; বাকি codebase Node
- **Fault isolation** — একটা অনির্ভরযোগ্য component পুরো system নামিয়ে ফেলবে না

এসব constraint-এর কোনোটাই যদি প্রযোজ্য না হয়, তাহলে monolith-ই সঠিক পছন্দ।

## Microservices-এর আসল খরচ

আপনি যত service boundary আঁকবেন, প্রতিটা যোগ করে:

**Function calls-এর জায়গায় network calls আসে:**

```typescript
// Monolith — in-process, never fails due to network
const user = userRepository.findById(userId);

// Microservices — can fail, can be slow, needs timeout/retry
const user = await userServiceClient.getUser(userId, { timeout: 5000, retries: 3 });
```

**ACID transactions-এর জায়গায় distributed transactions আসে:**

```typescript
// Monolith — one transaction, all-or-nothing
await db.transaction(async (tx) => {
	await tx.update('orders', { status: 'confirmed' });
	await tx.insert('payments', { orderId, amount });
	await tx.update('inventory', { itemId, quantity: quantity - 1 });
});

// Microservices — three services, three databases, eventual consistency
// If payment succeeds but inventory update fails: manual compensation needed
await orderService.confirm(orderId); // can succeed
await paymentService.charge(orderId); // can succeed
await inventoryService.decrement(itemId); // can fail — now what?
```

**Operational overhead বহুগুণ বেড়ে যায়:**

- 10টা service = 10টা CI pipeline, 10টা deployment config, 10টা monitoring dashboard
- প্রতিটা call-এর জন্য service discovery, load balancing, circuit breaker দরকার
- একটা request-কে service জুড়ে follow করতে distributed tracing লাগে
- Local development-এ সব dependency চালাতে হয় (বা mock করতে হয়)

## Domain Boundary চিহ্নিত করা

ভাঙার আগে seam খুঁজুন। ভালো seam-এর থাকে:

1. **ভেতরে high cohesion** — একটা boundary-র ভেতরের data ও logic একসাথে পরিবর্তন হয়
2. **বাইরে low coupling** — boundary অন্যদের সাথে একটা সরু, stable interface-এর মাধ্যমে interact করে
3. **Independent lifecycle** — দায়িত্বপ্রাপ্ত team coordinate না করেই deploy করতে পারে

একটা কাজের heuristic: যদি একটা feature বদলাতে হলে 2টার বেশি bounded context-এ code পরিবর্তন করতে হয়, তাহলে আপনার boundary ভুল।

**একটা টুল হিসেবে event storming:** team-কে জড়ো করুন, সব domain event একটা timeline-এ map করুন (`OrderPlaced`, `PaymentCharged`, `ItemShipped`)। যেসব event সবসময় একসাথে বদলায় সেগুলোকে cluster করুন — ওই cluster-গুলোই আপনার bounded context।

```
[OrderPlaced] [OrderCancelled]     → Order domain
[PaymentCharged] [PaymentRefunded] → Payment domain
[ItemReserved] [ItemShipped]       → Fulfillment domain
[UserRegistered] [UserDeleted]     → Identity domain
```

## Strangler Fig Pattern

Rewrite করবেন না — ধাপে ধাপে migrate করুন। monolith-এর পাশাপাশি নতুন service বানান; নির্দিষ্ট path গুলো সেটার দিকে redirect করুন; সময়ের সাথে monolith ছোট করে আনুন।

```nginx
# API gateway or nginx: route by path
location /api/v2/payments/ {
    proxy_pass http://payment-service;   # new microservice
}

location /api/ {
    proxy_pass http://monolith;          # everything else still in monolith
}
```

ধাপগুলো:

1. যেটা extract করবেন সেটা চিহ্নিত করুন (high-value ও well-defined)
2. নিজের database সহ নতুন service বানান
3. Traffic নতুন service-এ route করুন
4. Monolith থেকে সংশ্লিষ্ট code মুছে ফেলুন
5. আবার করুন

প্রতিটা migration-এর সাথে monolith ছোট হয়। আপনার কখনো একটা big-bang rewrite করতে হয় না।

## Data Ownership

প্রতিটা service-কে নিজের data-র মালিক হতে হবে। কোনো service সরাসরি অন্য service-এর database পড়ে না।

```
✗ PaymentService reads FROM orders table in OrderService's DB
✓ PaymentService calls OrderService API or consumes order events
```

Shared database লুকানো coupling তৈরি করে — এক service-এ একটা schema পরিবর্তন আরেকটাকে ভেঙে দেয়। নিজের schema-র মালিক হোন; নিজের data API বা event-এর মাধ্যমে expose করুন।

**Database-per-service pattern:**

- একই PostgreSQL instance-এ ভিন্ন schema (সস্তা, ছোট team-এর জন্য গ্রহণযোগ্য)
- ভিন্ন PostgreSQL instance (প্রকৃত isolation, বেশি ops খরচ)
- প্রতি service-এ ভিন্ন database technology (order-এর জন্য Postgres, session-এর জন্য Redis, search-এর জন্য Elasticsearch)

## কখন ভাঙবেন

একটা service extract করার আগে একটা কাজের checklist:

```
[ ] Two teams actively block each other on deploys (not just occasionally)
[ ] This component needs to scale independently (10x traffic differential)
[ ] This component needs a different technology stack (ML model, Go for performance)
[ ] This component fails in a way that takes down unrelated features
[ ] The domain boundary is clear and stable (not actively evolving)
[ ] The team owns the full lifecycle (not a shared component)
```

যদি 3টার কম box টিক করা থাকে: এটা monolith-এই রাখুন। coordination overhead-টা যুক্তিযুক্ত নয়।

## Modular Monolith — মাঝামাঝি সমাধান

জোরদার করা module boundary সহ একটা monolith operational overhead ছাড়াই microservice-এর অনেক সুবিধা পায়:

```typescript
// src/modules/orders/
//   orders.service.ts
//   orders.repository.ts
//   orders.types.ts
//   index.ts  ← public API of this module

// src/modules/payments/
//   payments.service.ts
//   payments.repository.ts
//   index.ts

// Enforce: payments can only import from orders/index.ts
// Never: import { OrderRepository } from '../orders/orders.repository'
```

`eslint-plugin-boundaries`-এর মতো টুল linter level-এ module constraint জোরদার করে। boundary-টা বাস্তব — এটা পার হতে হলে public interface দিয়ে যেতে হয়। যখন একটা service extract করার সময় আসে, seam-টা ইতিমধ্যে বিদ্যমান থাকে।

বেশিরভাগ team-এর জন্য এটাই সঠিক শুরুর বিন্দু। নির্দিষ্ট চাপ যখন যুক্তিযুক্ত করে কেবল তখনই service extract করুন।
