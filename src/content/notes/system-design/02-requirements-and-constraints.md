---
title: 'Requirements ও Constraints'
subtitle: 'Functional বনাম non-functional, scale/latency/consistency/budget — একটা ঝাপসা দাবিকে প্রশ্ন করে স্পেসে নামানো।'
chapter: 2
level: 'beginner'
readingTime: '১৭ মিনিট'
topics: ['requirements', 'non-functional', 'SLO', 'constraints', 'scoping']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

দর্জির কাছে গিয়ে "একটা জামা বানিয়ে দিন" বললে সে জামা বানায় না — সে ফিতা বের করে মাপ নেয়, কাপড় জিজ্ঞেস করে, কবে লাগবে জানতে চায়, বাজেট বলে দেয়। মাপ না নিয়ে বানানো জামা কারো গায়ে লাগে না। Requirement gathering হলো সফটওয়্যারের ফিতা।

</Callout>

## গল্পে বুঝি

দামেস্কের বাজারে আল-কিন্দির একটা দর্জির দোকান। এক সকালে এক ভদ্রলোক এসে বললেন, "আমার একটা ভালো জামা দরকার।"

কম অভিজ্ঞ দর্জি হলে কাপড় কেটে ফেলত। আল-কিন্দি কাটে না। সে প্রশ্ন শুরু করে।

"কার জন্য?" — নিজের জন্য। "কী উপলক্ষে?" — মেয়ের বিয়ে। এই এক উত্তরে অর্ধেক ডিজাইন বদলে গেল: বিয়ের জামা মানে ভারী কাপড়, সূক্ষ্ম কাজ, বেশি সময়। "কবে লাগবে?" — এগারো দিন পরে। আল-কিন্দি মনে মনে হিসাব করে: হাতের কাজ করতে আঠারো দিন লাগে, এগারো দিনে হবে না। তাই সে বলে, "হাতের সূচিকর্ম এগারো দিনে সম্ভব নয়। হয় মেশিনের কাজ নিন, নয়তো তারিখ পেছান।" এটাই **constraint** — সময় একটা দেয়াল, ইচ্ছা দিয়ে সেটা সরানো যায় না।

তারপর সে মাপ নেয় — বুক, কোমর, হাতা, লম্বা। এগুলো হলো **functional requirement**: জামাটার হাতা থাকবে, বোতাম থাকবে, পকেট থাকবে। কিন্তু আল-কিন্দি এখানেই থামে না। সে জিজ্ঞেস করে, "গরমের বিয়ে না শীতের?" — গরমের। তাহলে সুতি, রেশম নয়, নইলে সারা সন্ধ্যা ঘেমে যাবেন। "অনুষ্ঠানের পরে আবার পরবেন?" — হ্যাঁ, ঈদে। তাহলে রং একটু সংযত রাখতে হবে, নইলে দ্বিতীয়বার পরা যাবে না। "ধোয়া হবে বাড়িতে না লন্ড্রিতে?" — বাড়িতে। তাহলে এমন কাপড় যা ধুলে রং যায় না। এগুলো কোনোটাই "জামায় কী থাকবে" নয় — এগুলো "জামাটা কেমন হবে": আরামদায়ক, টেকসই, ধোয়ার উপযোগী। এটাই **non-functional requirement**।

সবশেষে সে জিজ্ঞেস করে, "বাজেট কত?" ভদ্রলোক একটা সংখ্যা বলেন। আল-কিন্দি মাথা নাড়ে: "এই বাজেটে রেশমের আস্তর হবে না। আস্তর ছাড়া জামাটা ঠিকই সুন্দর হবে, একটু কম টেকসই হবে। আপনি বলুন কোনটা চান।" — এটাই সবচেয়ে গুরুত্বপূর্ণ মুহূর্ত। আল-কিন্দি নিজে সিদ্ধান্ত নেয়নি, সে **trade-off-টা খদ্দেরের সামনে সংখ্যা সহ রেখেছে**।

মিলিয়ে নিই: হাতা-পকেট-বোতাম হলো **functional requirement**, আরাম-টেকসই-ধোয়ার সুবিধা হলো **non-functional requirement**, এগারো দিন আর বাজেট হলো **constraint**, "মেয়ের বিয়ে" হলো প্রকৃত **use case** যা পুরো ডিজাইন বদলে দেয়, আর রেশমের আস্তরের প্রশ্নটা হলো **trade-off negotiation**। এবং লক্ষ করুন — আল-কিন্দি এখনো এক টুকরো কাপড়ও কাটেনি। সফটওয়্যারেও তা-ই: প্রথম লাইন কোড লেখার আগেই বেশিরভাগ গুরুত্বপূর্ণ সিদ্ধান্ত নেওয়া হয়ে যায়।

## দুই রকম requirement

<Mermaid
title="Requirement-এর দুই ভাগ"
code={`graph TB
  R["Requirements"] --> F["Functional<br/>সিস্টেম কী করবে"]
  R --> N["Non-Functional<br/>কতটা ভালোভাবে করবে"]
  F --> F1["ইউজার ছবি আপলোড করবে"]
  F --> F2["ফলো করা যাবে"]
  N --> N1["p95 latency &lt; 200ms"]
  N --> N2["availability 99.9%"]
  N --> N3["১ কোটি ইউজার পর্যন্ত"]`}
/>

### Functional requirement — সিস্টেম কী করে

এগুলো লেখা সহজ, কারণ এগুলোই সাধারণত প্রোডাক্ট টিম বলে দেয়। ভালো functional requirement একটা বাক্যে একটা কাজ বর্ণনা করে, কর্তা সহ:

- ইউজার একটা লম্বা URL জমা দিয়ে একটা ছোট লিংক পাবে
- যে কেউ ছোট লিংকে গেলে মূল URL-এ পৌঁছে যাবে
- লিংকের মালিক দেখতে পাবে কতবার সেটা ক্লিক হয়েছে
- মালিক চাইলে লিংকের মেয়াদ ঠিক করে দিতে পারবে

খারাপ functional requirement দেখতে এমন: "সিস্টেমটা ইউজার-ফ্রেন্ডলি হবে" (এটা কোনো কাজ নয়), "লিংক ম্যানেজমেন্ট থাকবে" (কে কী করবে বোঝা যাচ্ছে না)।

### Non-functional requirement — কতটা ভালোভাবে করে

এগুলোই আসল ডিজাইন ঠিক করে দেয়, এবং এগুলোই সবচেয়ে বেশি বাদ পড়ে যায়। প্রধান শ্রেণিগুলো:

| শ্রেণি           | প্রশ্ন                            | উদাহরণ                       |
| ---------------- | --------------------------------- | ---------------------------- |
| **Scale**        | কত ইউজার, কত ডেটা, কত রিকোয়েস্ট? | দিনে ১০ লাখ নতুন লিংক        |
| **Latency**      | কত দ্রুত উত্তর দিতে হবে?          | redirect p99 &lt; ৫০ ms      |
| **Availability** | কত সময় চালু থাকতে হবে?           | ৯৯.৯৫%                       |
| **Consistency**  | লেখার পরে সাথে সাথে পড়লে?        | নতুন লিংক তাৎক্ষণিক কাজ করবে |
| **Durability**   | ডেটা হারানো চলবে?                 | লিংক কখনো হারানো যাবে না     |
| **Security**     | কে কী দেখতে পাবে?                 | প্রাইভেট লিংক শুধু মালিক     |
| **Cost**         | মাসে কত টাকা?                     | ৫০০ ডলারের নিচে              |
| **Compliance**   | আইনি বাধ্যবাধকতা?                 | ইউরোপের ডেটা ইউরোপে          |

<Callout type="warning">

সবচেয়ে বেশি বাদ পড়ে **cost** আর **consistency**। খরচ না ধরলে ডিজাইনটা কাগজে সুন্দর, বাস্তবে অসাধ্য। আর consistency-র প্রশ্ন না করলে আপনি অজান্তেই সবচেয়ে কঠিন গ্যারান্টিটা ধরে নেন এবং অকারণে জটিল সিস্টেম বানান।

</Callout>

## Requirement বনাম Constraint

শব্দ দুইটা প্রায়ই একসাথে বলা হয়, কিন্তু তফাত আছে — এবং তফাতটা কাজে লাগে।

**Requirement** হলো আপনি যা অর্জন করতে চান। এটা নিয়ে দরকষাকষি করা যায়: "p99 ৫০ ms না হয়ে ১০০ ms হলে চলবে?"

**Constraint** হলো যা আপনি বদলাতে পারবেন না। টিমে তিনজন ইঞ্জিনিয়ার, ডেডলাইন ছয় সপ্তাহ, কোম্পানি ইতিমধ্যেই AWS-এ, ডেটা ভারতের বাইরে যেতে পারবে না, বাজেট মাসে ২০০ ডলার। এগুলো নিয়ে দরকষাকষি হয় না — এগুলোর ভেতরে থেকেই সমাধান বের করতে হয়।

সবচেয়ে বেশি উপেক্ষিত constraint হলো **টিমের আকার আর অভিজ্ঞতা**। তিনজনের টিমে বারোটা microservice চালানো কারিগরি সমস্যা নয়, মানবিক অসম্ভাব্যতা। "আমরা কী চালাতে পারব" প্রশ্নটা "কোনটা তাত্ত্বিকভাবে ভালো" প্রশ্নের চেয়ে বেশি গুরুত্বপূর্ণ।

<Callout type="tip">

প্রতিটা ডিজাইন ডকুমেন্টের শুরুতে একটা "Constraints" সেকশন রাখুন — টিম সাইজ, ডেডলাইন, বাজেট, বিদ্যমান স্ট্যাক, আইনি বাধ্যবাধকতা। ছয় মাস পরে কেউ যখন জিজ্ঞেস করবে "এই অদ্ভুত সিদ্ধান্তটা কেন?", উত্তরটা ওখানেই থাকবে।

</Callout>

## ঝাপসা দাবিকে প্রশ্ন করে স্পেসে নামানো

ধরুন আপনাকে বলা হলো: **"আমাদের একটা নোটিফিকেশন সিস্টেম দরকার।"**

এই বাক্যে ডিজাইন করার মতো কিছুই নেই। নিচের প্রশ্নগুলো ধরে ধরে এগোলে দশ মিনিটে এটা একটা স্পেসে পরিণত হয়। প্রশ্নগুলো পাঁচটা দলে ভাগ করা — এই কাঠামোটা যেকোনো ঝাপসা দাবিতে কাজ করে।

### দল ১ — কে এবং কেন (actors ও motivation)

- কে নোটিফিকেশন পাবে? শুধু আমাদের ইউজার, নাকি বাইরের কেউও?
- কে পাঠাবে? সিস্টেম নিজে, নাকি অন্য ইউজার, নাকি অ্যাডমিন?
- এটা না থাকলে আজ কী সমস্যা হচ্ছে? (এই প্রশ্নটা প্রায়ই আসল requirement বের করে আনে)

### দল ২ — কী ঘটবে (functional)

- কোন কোন চ্যানেল — push, email, SMS, in-app? সবগুলো, নাকি প্রথম সংস্করণে একটা?
- ইউজার কি বন্ধ করতে পারবে? চ্যানেল-ভিত্তিক, নাকি টাইপ-ভিত্তিক?
- একই ঘটনার জন্য একাধিক নোটিফিকেশন হলে কি একত্র করতে হবে? ("আপনার পোস্টে ৫ জন লাইক দিয়েছে")
- অতীতের নোটিফিকেশন দেখা যাবে? কতদিনের?

### দল ৩ — কত (scale)

- দিনে কতগুলো নোটিফিকেশন? পিক সময়ে কত?
- একটা ঘটনায় সর্বোচ্চ কতজনের কাছে যেতে পারে? (একজন সেলিব্রিটি পোস্ট করলে?)
- কত ইউজার, কত ডিভাইস প্রতি ইউজার?

### দল ৪ — কত ভালোভাবে (non-functional)

- পাঠানো থেকে পৌঁছানো পর্যন্ত কত দেরি মেনে নেওয়া যায়? এক সেকেন্ড, না এক মিনিট?
- একটা নোটিফিকেশন হারিয়ে গেলে কী হয়? (OTP হারালে সর্বনাশ, "কেউ আপনাকে ফলো করেছে" হারালে কিছুই না)
- একটা নোটিফিকেশন দুইবার গেলে কী হয়? (দুইবার "টাকা কেটে নেওয়া হয়েছে" মেসেজ পেলে ইউজার আতঙ্কিত হবে)
- ক্রম কি গুরুত্বপূর্ণ?

### দল ৫ — কীসের ভেতরে (constraints)

- কবে লাগবে? কারা বানাবে?
- বাজেট? (SMS-এর প্রতি মেসেজে খরচ আছে, push-এ নেই — এটা ডিজাইন বদলে দেয়)
- বিদ্যমান কোন সিস্টেমের সাথে মিলিয়ে চলতে হবে?

<Callout type="info">

প্রশ্ন করার সময় সবচেয়ে কার্যকর তিনটা প্রশ্ন: **"সবচেয়ে খারাপ কেসটা কী?"**, **"এটা ভুল হলে কী ক্ষতি?"**, আর **"এটা ছাড়া কি প্রথম সংস্করণ ছাড়া যায়?"** — শেষ প্রশ্নটা সবচেয়ে বেশি কাজ বাঁচায়।

</Callout>

## উত্তরগুলো কীভাবে স্পেসে দাঁড়ায়

উপরের প্রশ্নগুলোর উত্তর পাওয়ার পরে স্পেসটা দেখতে এমন হবে (কাল্পনিক উত্তর সহ):

```text
Notification Service — v1 spec

IN SCOPE
  - push (mobile) and email
  - notification types: new_follower, post_liked, comment_reply
  - per-user, per-type on/off preferences
  - in-app inbox showing last 30 days

OUT OF SCOPE (v1)
  - SMS, WhatsApp, web push
  - digest / batching ("5 people liked your post")
  - marketing campaigns

FUNCTIONAL
  F1  Any service can publish an event; the notification service decides
      channel and recipient.
  F2  A user can disable any type on any channel.
  F3  A user can list their notifications, newest first, paginated.
  F4  A notification can be marked read.

NON-FUNCTIONAL
  N1  Scale     : 2M users, 8M notifications/day, peak 5x average
  N2  Latency   : event -> device, p95 < 10s, p99 < 60s
  N3  Delivery  : at-least-once; duplicates must be suppressed by the
                  client using a stable event id
  N4  Durability: an accepted event is never silently dropped
  N5  Ordering  : not guaranteed; each notification is self-contained
  N6  Availability: 99.9% for the publish API (inbox reads may degrade)
  N7  Cost      : under USD 400/month at stated scale

CONSTRAINTS
  C1  3 engineers, 8 weeks
  C2  Existing stack: Postgres, Redis, AWS, Go services
  C3  EU user data must stay in EU regions
```

খেয়াল করুন কীভাবে **N3** ("at-least-once, ডুপ্লিকেট ক্লায়েন্ট সামলাবে") একটা পুরো শ্রেণির জটিলতা মুছে দিল। যদি লেখা থাকত "exactly-once", ডিজাইনটা কয়েক গুণ কঠিন হয়ে যেত — এবং বাস্তবে তবু গ্যারান্টি দেওয়া যেত না। **সঠিকভাবে দুর্বল গ্যারান্টি বেছে নেওয়া একটা দক্ষতা।**

## Non-functional requirement-কে সংখ্যায় নামানো

"দ্রুত হতে হবে" ডিজাইন করা যায় না। "৯৯.৯% availability" ডিজাইন করা যায় — কারণ এর একটা অঙ্ক আছে।

### Availability-র অঙ্ক

| Availability | বছরে বন্ধ  | মাসে বন্ধ  | সপ্তাহে বন্ধ |
| ------------ | ---------- | ---------- | ------------ |
| ৯৯%          | ৩.৬৫ দিন   | ৭.৩ ঘণ্টা  | ১.৬৮ ঘণ্টা   |
| ৯৯.৯%        | ৮.৭৬ ঘণ্টা | ৪৩.৮ মিনিট | ১০.১ মিনিট   |
| ৯৯.৯৫%       | ৪.৩৮ ঘণ্টা | ২১.৯ মিনিট | ৫.০ মিনিট    |
| ৯৯.৯৯%       | ৫২.৬ মিনিট | ৪.৩ মিনিট  | ১.০ মিনিট    |
| ৯৯.৯৯৯%      | ৫.২৬ মিনিট | ২৬ সেকেন্ড | ৬ সেকেন্ড    |

এই টেবিলটা মনে রাখার একটা কারণ আছে: **প্রতিটা অতিরিক্ত ৯ খরচ প্রায় দশগুণ বাড়ায়।** ৯৯.৯% থেকে ৯৯.৯৯%-এ যেতে হলে multi-region, স্বয়ংক্রিয় failover, ২৪ ঘণ্টার on-call — এসব লাগবে। তাই কেউ যখন "১০০% uptime" চায়, উত্তরটা হলো: "১০০% সম্ভব নয়। ৯৯.৯% এই খরচে, ৯৯.৯৯% এই খরচে — কোনটা নেবেন?"

আরেকটা জিনিস মনে রাখুন: **নির্ভরশীলতা গুণিতক।** আপনার সার্ভিস যদি তিনটা ডিপেন্ডেন্সির ওপর দাঁড়িয়ে থাকে, প্রতিটার ৯৯.৯%, এবং তিনটাই লাগে — আপনার সর্বোচ্চ সম্ভাব্য availability ০.৯৯৯ × ০.৯৯৯ × ০.৯৯৯ = ৯৯.৭%। চেইন যত লম্বা, ভরসা তত কম।

### Latency-র লক্ষ্য

Latency-র লক্ষ্য সবসময় **percentile সহ** লিখতে হয়। "গড় ১০০ ms" প্রায় অর্থহীন — চ্যাপ্টার ৬-এ দেখব কেন। সঠিক রূপটা এমন:

```text
GET /r/:code   (redirect)     p50 < 10ms   p95 < 30ms   p99 < 50ms
POST /links    (create)       p50 < 50ms   p95 < 150ms  p99 < 400ms
GET /stats/:id (analytics)    p50 < 100ms  p95 < 500ms  p99 < 2s
```

খেয়াল করুন প্রতিটা endpoint-এর আলাদা বাজেট। redirect হলো hot path — সেটা নির্মমভাবে দ্রুত হতে হবে। analytics দেখা কেউ দিনে একবার করে — সেখানে ২ সেকেন্ড মেনে নেওয়া যায়। **সব endpoint-কে একই latency লক্ষ্য দেওয়া মানে সবচেয়ে কড়া লক্ষ্যটা সবার ওপর চাপিয়ে দেওয়া**, যা অপ্রয়োজনীয়ভাবে ব্যয়বহুল।

### Consistency-র দাবি

এই প্রশ্নটা সবচেয়ে কম করা হয় এবং সবচেয়ে বেশি খরচ বাঁচায়। প্রতিটা read path-এর জন্য জিজ্ঞেস করুন:

- **Strong** — লেখার সাথে সাথেই সবাই নতুন মান দেখবে। (অ্যাকাউন্ট ব্যালেন্স, ইনভেন্টরি)
- **Read-your-writes** — যে লিখেছে সে অন্তত নিজের লেখা দেখবে; অন্যরা একটু পরে। (নিজের প্রোফাইল এডিট)
- **Eventual** — কিছুক্ষণের মধ্যে সবাই মিলে যাবে। (লাইক কাউন্ট, ফলোয়ার সংখ্যা, ভিউ)

বেশিরভাগ ফিচারের জন্য eventual-ই যথেষ্ট, কিন্তু ডিফল্টে সবাই strong ধরে নেয় — এবং তারপর অকারণে replica ব্যবহার না করে, অকারণে distributed transaction লেখে।

<Callout type="warning">

**"সব ডেটা সবসময় consistent থাকবে" — এই বাক্যটা লিখে ফেললে আপনি নিজের হাতে-পায়ে শিকল পরালেন।** আলাদা করে প্রতিটা ডেটার জন্য বলুন। ফলোয়ার কাউন্ট ৩০ সেকেন্ড পুরনো হলে পৃথিবীর কিছু হয় না; ওয়ালেট ব্যালেন্স ৩০ সেকেন্ড পুরনো হলে কোম্পানি ডুবে যায়।

</Callout>

## SLI, SLO, SLA — তিনটা আলাদা জিনিস

Non-functional requirement যখন প্রোডাকশনে যায়, তখন তিনটা নাম নেয়:

**SLI (Service Level Indicator)** — যা আপনি মাপছেন। যেমন: "সফল রিকোয়েস্টের অনুপাত", "p99 latency"।

**SLO (Service Level Objective)** — আপনার নিজের লক্ষ্য। যেমন: "৩০ দিনে ৯৯.৯% রিকোয়েস্ট সফল"। এটা ভাঙলে টিম থামে এবং ঠিক করে।

**SLA (Service Level Agreement)** — খদ্দেরের সাথে চুক্তি, ভাঙলে টাকা ফেরত। SLA সবসময় SLO-র চেয়ে ঢিলা রাখা হয় — নিজের লক্ষ্য ৯৯.৯৫%, চুক্তি ৯৯.৯%। ব্যবধানটাই আপনার নিরাপত্তা মার্জিন।

SLO থেকে বের হয় **error budget**: ৯৯.৯% SLO মানে ০.১% ব্যর্থতার অনুমতি। ৩০ দিনে সেটা ৪৩ মিনিট ২০ সেকেন্ড। এই বাজেট ফুরিয়ে গেলে নতুন ফিচার থেমে যায়, স্থিতিশীলতার কাজ শুরু হয়। বাজেট বাকি থাকলে ঝুঁকি নেওয়া যায়। এটা তর্ক থামানোর একটা চমৎকার যন্ত্র — মতামতের বদলে সংখ্যা।

## Requirement-কে কোডে পরিণত করা

Requirement যদি শুধু একটা ডকুমেন্টে থাকে, ছয় মাসে সেটা মিথ্যা হয়ে যায়। বেশি কাজের হলো non-functional requirement-গুলোকে একটা মেশিন-পাঠযোগ্য স্পেসে রাখা, এবং প্রোডাকশনের পরিমাপকে তার বিরুদ্ধে যাচাই করা।

নিচের মডিউলটা ঠিক তা-ই করে: SLO-র একটা তালিকা নেয়, পরিমাপের একটা উইন্ডো নেয়, তারপর বলে দেয় কোন লক্ষ্য পূরণ হয়েছে, error budget-এর কতটা খরচ হয়ে গেছে, আর এখন ফিচার ছাড়া উচিত কিনা।

```typescript
// ---------------------------------------------------------------------------
// Turns non-functional requirements into something a machine can check.
// Feed it the SLO definitions plus one window of observations, and it reports
// which objectives hold, how much error budget is left, and whether the team
// should be shipping features or fixing reliability.
// ---------------------------------------------------------------------------

export type Comparison = 'at_most' | 'at_least';

export interface LatencyObjective {
	kind: 'latency';
	name: string;
	endpoint: string;
	percentile: 50 | 90 | 95 | 99 | 999; // 999 means p99.9
	thresholdMs: number;
}

export interface AvailabilityObjective {
	kind: 'availability';
	name: string;
	endpoint: string;
	targetRatio: number; // 0.999 means 99.9%
}

export type Objective = LatencyObjective | AvailabilityObjective;

export interface Observation {
	endpoint: string;
	latencyMs: number;
	ok: boolean; // false for 5xx / timeout — 4xx is the caller's fault, not ours
}

export interface ObjectiveResult {
	name: string;
	kind: Objective['kind'];
	met: boolean;
	observed: number;
	target: number;
	sampleSize: number;
	detail: string;
}

export interface BudgetReport {
	windowDays: number;
	results: ObjectiveResult[];
	errorBudgetRemainingRatio: number;
	errorBudgetRemainingMinutes: number;
	verdict: 'ship_features' | 'slow_down' | 'freeze';
}

// --- Percentile ----------------------------------------------------------
// Nearest-rank on a sorted copy. Good enough for an offline report; a live
// system would keep a streaming histogram instead of every sample.
export function percentile(sortedAsc: number[], p: number): number {
	if (sortedAsc.length === 0) return 0;
	const fraction = p === 999 ? 0.999 : p / 100;
	const rank = Math.ceil(fraction * sortedAsc.length);
	const index = Math.min(Math.max(rank - 1, 0), sortedAsc.length - 1);
	return sortedAsc[index];
}

// --- Availability maths --------------------------------------------------
export function allowedDowntimeMinutes(targetRatio: number, windowDays: number): number {
	const windowMinutes = windowDays * 24 * 60;
	return windowMinutes * (1 - targetRatio);
}

// A chain of hard dependencies multiplies. Three 99.9% services in series can
// never beat 99.7% no matter how good your own code is.
export function chainedAvailability(parts: number[]): number {
	return parts.reduce((acc, p) => acc * p, 1);
}

// --- Evaluation ----------------------------------------------------------
function evaluateLatency(obj: LatencyObjective, samples: Observation[]): ObjectiveResult {
	const relevant = samples.filter((s) => s.endpoint === obj.endpoint);
	const sorted = relevant.map((s) => s.latencyMs).sort((a, b) => a - b);
	const observed = percentile(sorted, obj.percentile);
	const met = sorted.length > 0 && observed <= obj.thresholdMs;
	const label = obj.percentile === 999 ? 'p99.9' : `p${obj.percentile}`;

	return {
		name: obj.name,
		kind: 'latency',
		met,
		observed,
		target: obj.thresholdMs,
		sampleSize: sorted.length,
		detail:
			sorted.length === 0
				? `no traffic observed for ${obj.endpoint}`
				: `${label} = ${observed}ms (target ${obj.thresholdMs}ms)`
	};
}

function evaluateAvailability(obj: AvailabilityObjective, samples: Observation[]): ObjectiveResult {
	const relevant = samples.filter((s) => s.endpoint === obj.endpoint);
	const total = relevant.length;
	const good = relevant.filter((s) => s.ok).length;
	const observed = total === 0 ? 1 : good / total;
	const met = observed >= obj.targetRatio;

	return {
		name: obj.name,
		kind: 'availability',
		met,
		observed,
		target: obj.targetRatio,
		sampleSize: total,
		detail:
			total === 0
				? `no traffic observed for ${obj.endpoint}`
				: `${(observed * 100).toFixed(3)}% success over ${total} requests`
	};
}

export function evaluate(
	objectives: Objective[],
	samples: Observation[],
	windowDays = 30
): BudgetReport {
	const results = objectives.map((obj) =>
		obj.kind === 'latency' ? evaluateLatency(obj, samples) : evaluateAvailability(obj, samples)
	);

	// Error budget is driven by the strictest availability objective.
	const availabilityObjectives = objectives.filter(
		(o): o is AvailabilityObjective => o.kind === 'availability'
	);

	let remainingRatio = 1;
	let remainingMinutes = Number.POSITIVE_INFINITY;

	for (const obj of availabilityObjectives) {
		const result = results.find((r) => r.name === obj.name);
		if (!result) continue;

		const allowedFailureRatio = 1 - obj.targetRatio;
		const actualFailureRatio = 1 - result.observed;
		const consumed = allowedFailureRatio === 0 ? 1 : actualFailureRatio / allowedFailureRatio;
		const left = Math.max(0, 1 - consumed);

		if (left < remainingRatio) remainingRatio = left;
		const minutes = allowedDowntimeMinutes(obj.targetRatio, windowDays) * left;
		if (minutes < remainingMinutes) remainingMinutes = minutes;
	}

	if (!Number.isFinite(remainingMinutes)) remainingMinutes = 0;

	const anyLatencyMissed = results.some((r) => r.kind === 'latency' && !r.met);

	let verdict: BudgetReport['verdict'];
	if (remainingRatio <= 0) verdict = 'freeze';
	else if (remainingRatio < 0.25 || anyLatencyMissed) verdict = 'slow_down';
	else verdict = 'ship_features';

	return {
		windowDays,
		results,
		errorBudgetRemainingRatio: Number(remainingRatio.toFixed(4)),
		errorBudgetRemainingMinutes: Number(remainingMinutes.toFixed(1)),
		verdict
	};
}

// --- Human-readable report ----------------------------------------------
export function formatReport(report: BudgetReport): string {
	const lines: string[] = [];
	lines.push(`SLO report — ${report.windowDays} day window`);
	lines.push('-'.repeat(58));
	for (const r of report.results) {
		lines.push(`${r.met ? 'PASS' : 'FAIL'}  ${r.name.padEnd(28)} ${r.detail}`);
	}
	lines.push('-'.repeat(58));
	lines.push(
		`error budget left: ${(report.errorBudgetRemainingRatio * 100).toFixed(1)}% ` +
			`(${report.errorBudgetRemainingMinutes} min)`
	);
	lines.push(`verdict: ${report.verdict}`);
	return lines.join('\n');
}

// --- Example -------------------------------------------------------------
const objectives: Objective[] = [
	{
		kind: 'latency',
		name: 'redirect latency',
		endpoint: 'GET /r/:code',
		percentile: 99,
		thresholdMs: 50
	},
	{
		kind: 'latency',
		name: 'create link latency',
		endpoint: 'POST /links',
		percentile: 95,
		thresholdMs: 150
	},
	{
		kind: 'availability',
		name: 'redirect availability',
		endpoint: 'GET /r/:code',
		targetRatio: 0.9995
	}
];

function syntheticWindow(): Observation[] {
	const out: Observation[] = [];
	for (let i = 0; i < 20_000; i++) {
		// Most redirects are cache hits; a small tail goes to the database.
		const hit = i % 20 !== 0;
		out.push({
			endpoint: 'GET /r/:code',
			latencyMs: hit ? 4 + (i % 6) : 30 + (i % 40),
			ok: i % 4000 !== 0
		});
	}
	for (let i = 0; i < 800; i++) {
		out.push({ endpoint: 'POST /links', latencyMs: 40 + (i % 120), ok: true });
	}
	return out;
}

console.log(formatReport(evaluate(objectives, syntheticWindow(), 30)));
```

## স্পেস লেখার সময় যে ভুলগুলো হয়

**সব requirement সমান গুরুত্বের ধরে নেওয়া।** সেগুলো নয়। প্রতিটার পাশে "must / should / could" লিখুন। must-গুলো ডিজাইন ঠিক করে, could-গুলো শুধু ডিজাইনটাকে সেগুলোর জন্য জায়গা রাখতে বলে।

**ভবিষ্যতের কল্পিত স্কেলের জন্য ডিজাইন।** "একদিন কোটি ইউজার হবে" — হয়তো হবে। কিন্তু আজকের ডিজাইনটা আজকের সংখ্যার দশগুণের জন্য করুন, হাজারগুণের জন্য নয়। দশগুণ পরে আপনি অনেক বেশি জানবেন।

**Out-of-scope না লেখা।** যা করবেন না সেটা লিখে না রাখলে তিন সপ্তাহ পরে কেউ ধরে নেবে সেটাও আসছে।

**সমাধান আকারে requirement লেখা।** "আমাদের Kafka দরকার" কোনো requirement নয়। Requirement হলো "একটা ঘটনা থেকে একাধিক সিস্টেমে খবর যেতে হবে, এবং কোনো ঘটনা হারানো চলবে না"। Kafka হতে পারে সমাধান, কিন্তু সমস্যাটা আগে লিখুন — নইলে সহজ সমাধানগুলো কেউ ভেবেই দেখবে না।

**সংখ্যার উৎস না লেখা।** "দিনে ১০ লাখ রিকোয়েস্ট" — কোথা থেকে এলো? প্রোডাক্টের অনুমান, না গত মাসের ডেটা? পরে সংখ্যাটা ভুল প্রমাণিত হলে জানা দরকার সেটা কতটা নড়বড়ে ছিল।

<Callout type="tip">

স্পেস লেখা শেষ হলে নিজেকে প্রশ্ন করুন: **"এই ডকুমেন্ট থেকে দুইজন আলাদা ইঞ্জিনিয়ার কি একই সিস্টেম বানাবে?"** উত্তর না হলে, যেখানে দুইজন আলাদা হবে ঠিক সেই জায়গাটাই আপনার স্পেসের ফাঁক।

</Callout>

<div class="takeaways">

### মূল শেখা

- Functional requirement বলে সিস্টেম কী করবে; non-functional বলে কতটা ভালোভাবে — দ্বিতীয়টাই আর্কিটেকচার ঠিক করে দেয়
- Constraint (টিম, বাজেট, ডেডলাইন, বিদ্যমান স্ট্যাক, আইন) নিয়ে দরকষাকষি হয় না; ডিজাইন সেগুলোর ভেতরে থাকতে হয়
- ঝাপসা দাবিকে পাঁচ দল প্রশ্ন দিয়ে স্পেসে নামান: কে ও কেন, কী ঘটবে, কত, কত ভালোভাবে, কীসের ভেতরে
- প্রতিটা অতিরিক্ত ৯ খরচ প্রায় দশগুণ বাড়ায়; আর নির্ভরশীলতার availability গুণিতক, যোগফল নয়
- Latency লক্ষ্য সবসময় percentile সহ এবং endpoint-ভিত্তিক লিখুন — সব path-এ একই বাজেট মানে অপচয়
- প্রতিটা read path-এর জন্য আলাদা করে ঠিক করুন strong, read-your-writes না eventual — ডিফল্টে strong ধরে নেওয়া সবচেয়ে ব্যয়বহুল ভুল
- SLO থেকে error budget আসে, আর error budget তর্ককে সংখ্যায় নামিয়ে আনে
- Out-of-scope লেখা in-scope লেখার মতোই গুরুত্বপূর্ণ

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **প্রোডাক্ট কিকঅফে** — "আমাদের X দরকার" শুনে সরাসরি টিকিট না বানিয়ে পাঁচ দল প্রশ্ন করে এক পাতার স্পেস দাঁড় করানো
- **ইন্টারভিউয়ের প্রথম পাঁচ মিনিটে** — scope সংকুচিত করা আর non-functional সংখ্যা বের করা; এটা না করে ডায়াগ্রাম আঁকা শুরু করলে বাকি রাউন্ডটা দিশাহীন হয়
- **SRE টিমে** — SLI/SLO সংজ্ঞায়িত করা, error budget দিয়ে ফিচার বনাম স্থিতিশীলতার সিদ্ধান্ত নেওয়া
- **ভেন্ডর বা ক্লাউড সার্ভিস বাছার সময়** — তাদের SLA আপনার SLO-র সাথে গুণ করলে কী দাঁড়ায় সেটা হিসাব করা
- **পুরনো সিস্টেম বদলানোর সময়** — বর্তমান সিস্টেমের প্রকৃত non-functional আচরণ মেপে নেওয়া, যাতে নতুনটা অজান্তে খারাপ না হয়

</div>
