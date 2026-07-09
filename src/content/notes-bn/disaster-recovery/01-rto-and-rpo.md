---
title: 'RTO, RPO, এবং এরা আসলে কী বোঝায়'
subtitle: 'দুটো সংখ্যা যা আপনার recovery requirement সংজ্ঞায়িত করে — আর কেন এগুলো ভুল করলে আপনার DR প্ল্যান অকেজো হয়ে যায়।'
chapter: 1
level: 'beginner'
readingTime: '7 মিনিট'
topics: ['RTO', 'RPO', 'disaster recovery', 'SLA', 'business continuity']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব উদাহরণ**

বাড়িতে আগুন লাগার পর দুটো প্রশ্ন: "আবার একটা বাড়িতে ফিরতে কতক্ষণ লাগবে?" (RTO — Recovery Time Objective) আর "কতটা জিনিস আমরা হারালাম?" (RPO — Recovery Point Objective)। যে পরিবার প্রতিদিন ছবি ক্লাউডে ব্যাকআপ করে তাদের ছবির জন্য RPO ২৪ ঘণ্টা। যে পরিবার ২ ঘণ্টার মধ্যে হোটেল বুক করে ফেলেছে তাদের RTO ২ ঘণ্টা। Disaster recovery প্ল্যানিং হলো আগুন লাগার আগেই এই দুটো প্রশ্নের উত্তর দিয়ে রাখা।

</Callout>

## দুটো সংখ্যা

**RTO (Recovery Time Objective):** বিজনেসের অগ্রহণযোগ্য ক্ষতি হওয়ার আগে আপনার সিস্টেম কতক্ষণ ডাউন থাকতে পারে? incident থেকে recovery পর্যন্ত সর্বোচ্চ যতটুকু downtime মেনে নেওয়া যায়।

**RPO (Recovery Point Objective):** আপনি কতটা ডেটা হারাতে পারেন? সময়ে মাপা সর্বোচ্চ গ্রহণযোগ্য ডেটা ক্ষতি — যদি আপনার RPO ১ ঘণ্টা হয়, তাহলে আপনি বড়জোর ১ ঘণ্টার ট্রানজ্যাকশন হারানোর ঝুঁকি নিতে পারেন।

```
Timeline of a disaster:

12:00  →  Normal operation
12:30  →  Disaster strikes (database corrupted)
         ↑
         RPO boundary: how far back can we restore?
         If backups run at midnight: RPO = 12.5 hours of lost data

12:30  →  Incident detected, recovery begins
13:30  →  System restored and accepting traffic
         ←——————————————→
         RTO: 1 hour of downtime
```

এগুলো হলো objective — টার্গেট, যেগুলো পূরণ করার জন্য আপনি আপনার সিস্টেম ডিজাইন করেন। এগুলো স্বয়ংক্রিয় গ্যারান্টি নয়।

## বিজনেস requirement থেকে RTO আর RPO বের করা

সংখ্যাগুলো এলোমেলোভাবে বাছবেন না। বিজনেস ইমপ্যাক্ট থেকে উল্টো দিকে হিসাব করুন:

**RTO হিসাব:**

```
What is the hourly cost of downtime?
  Lost revenue:          $5,000/hour
  Staff idle time:       $2,000/hour
  Customer support load: $500/hour
  Reputation damage:     hard to quantify but real

At what point does the cumulative loss justify the cost of faster recovery?
  4 hours = $30,000 in losses
  Cost to achieve 4-hour RTO: $2,000/month in standby infrastructure
  → 4-hour RTO is economically justified

  1 hour = $7,500 in losses
  Cost to achieve 1-hour RTO: $15,000/month in hot standby + ops
  → 1-hour RTO is probably not justified unless contractually required
```

**RPO হিসাব:**

```
What is the cost of losing N hours of data?
  Losing 1 hour of orders: ~500 orders × $80 avg = $40,000 unrecoverable
  Losing 5 minutes of orders: ~40 orders = $3,200

  Cost to achieve 5-minute RPO (continuous WAL archival): $200/month
  → 5-minute RPO clearly justified; 1-hour RPO is unacceptable for orders
```

আপনার সিস্টেমের বিভিন্ন অংশের বিভিন্ন RTO/RPO requirement থাকে:

| System         | RTO                    | RPO             | কারণ                  |
| -------------- | ---------------------- | --------------- | --------------------- |
| Order database | 1 hour                 | 5 minutes       | রেভিনিউ ইমপ্যাক্ট     |
| User accounts  | 4 hours                | 1 hour          | লগইন বিঘ্ন            |
| Analytics DB   | 24 hours               | 24 hours        | নন-অপারেশনাল          |
| Email logs     | 72 hours               | 24 hours        | কমপ্লায়েন্স, ops নয় |
| CDN assets     | Minutes (CDN failover) | N/A (no writes) | —                     |

প্রতিটা সিস্টেমের জন্য আলাদা করে ডিজাইন আর বাজেট করুন। সবচেয়ে কঠিন requirement সবার উপর সমানভাবে চাপিয়ে দেবেন না।

## Recovery Tier

RTO/RPO টার্গেটগুলো বিভিন্ন খরচের infrastructure tier-এর সাথে ম্যাপ করে:

**Tier 1: Cold Standby (RTO: ঘণ্টা–দিন, RPO: ঘণ্টা)**

- ব্যাকআপ S3/object storage-এ রাখা
- কোনো hot infrastructure অপেক্ষা করছে না
- Recovery: নতুন সার্ভার provision করা, ব্যাকআপ থেকে restore, catch up করা
- খরচ: শুধু storage (১০০GB দৈনিক ব্যাকআপের জন্য ~$20/month)

**Tier 2: Warm Standby (RTO: ১৫ মিনিট–১ ঘণ্টা, RPO: মিনিট)**

- ব্যাকআপ infrastructure কমানো স্কেলে চলছে
- Replication এটাকে প্রায় current রাখছে
- Recovery: scale up + replica promote + traffic redirect
- খরচ: পূর্ণ production খরচের 30-50%

**Tier 3: Hot Standby (RTO: সেকেন্ড–মিনিট, RPO: সেকেন্ড)**

- পূর্ণ ডুপ্লিকেট production environment
- Synchronous replication
- Recovery: DNS failover বা load balancer redirect
- খরচ: ~100% অতিরিক্ত (মোট 2x infrastructure খরচ)

**Tier 4: Active-Active (RTO: ~0, RPO: ~0)**

- একাধিক সাইট জুড়ে একসাথে traffic বণ্টন করা
- মানুষের হস্তক্ষেপ ছাড়াই স্বয়ংক্রিয় failover
- খরচ: 2x+ infrastructure + উল্লেখযোগ্য engineering জটিলতা

বেশিরভাগ অ্যাপ্লিকেশন Tier 1–2-তে থাকে। শুধু যেসব সিস্টেমে যেকোনো downtime বিপর্যয়কর (financial trading, healthcare সিস্টেম, payment processing) সেগুলোই Tier 3–4 justify করে।

## টেস্ট ছাড়া প্ল্যান মূল্যহীন

RTO একটা প্রতিশ্রুতি, আশা নয়। আপনি সত্যিই ১ ঘণ্টায় recover করতে পারবেন কি না তা জানার একমাত্র উপায় হলো ১ ঘণ্টায় recover করার প্র্যাকটিস করা — নিয়মিত, বাস্তবসম্মত পরিস্থিতিতে।

**Recovery টেস্টের ধরন:**

```
Tabletop exercise:
  Walk through the runbook in a meeting room
  Identify gaps in documentation and ownership
  Time: 2 hours, no infrastructure required
  Frequency: quarterly

Backup restore test:
  Restore last night's backup to a test environment
  Verify data integrity and application health
  Measure actual restore time
  Time: 2-4 hours
  Frequency: monthly

Full DR drill:
  Simulate actual disaster (production DB unavailable)
  Follow runbook under time pressure
  Measure actual RTO achievement
  Time: half day
  Frequency: twice yearly
```

আপনি যদি কখনো সত্যিই ব্যাকআপ থেকে restore না করে থাকেন, আপনার RPO তাত্ত্বিক। আপনি যদি কখনো পূর্ণ recovery-র সময় না মেপে থাকেন, আপনার RTO একটা আন্দাজ।

## DR প্ল্যানে সাধারণ failure mode

**ব্যাকআপ আছে, restore কখনো টেস্ট করা হয়নি:** ব্যাকআপ corrupt, অসম্পূর্ণ, বা এমন সফটওয়্যার লাগে যা আর ইনস্টল করা নেই। বাস্তব disaster-এর সময় ধরা পড়ে।

**RTO কল্পনা দিয়ে ঠিক করা:** "আমরা ১ ঘণ্টায় restore করতে পারব" কারণ শুনতে ভালো লাগে, কেউ মেপে দেখেছে বলে নয়। আসল restore সময়: ৬ ঘণ্টা।

**RPO আর ব্যাকআপ শিডিউলের মিল নেই:** দৈনিক ব্যাকআপ দিয়ে ৪ ঘণ্টার RPO দাবি করা। যদি রাত ১১টায় disaster হয়, আপনি ২৩ ঘণ্টার ডেটা হারিয়েছেন।

**একটা region, একটা AZ-এ ব্যাকআপ:** ব্যাকআপ primary-র একই জায়গায় রাখা। একটা region failure দুটোই ধ্বংস করে দেয়।

**কোনো runbook নেই, জ্ঞান একজনের মাথায়:** যে restore প্রসিডিওর জানে সে ছুটিতে। অথবা কোম্পানি ছেড়ে দিয়েছে।

**আপনার শেষ drill থেকে আসল মাপা RTO ডকুমেন্ট করুন।** যদি সেটা ৪ ঘণ্টা হয় আর আপনার SLA বলে ২ ঘণ্টা, তাহলে আপনার একটা gap আছে বন্ধ করার জন্য — দেখানোর মতো কোনো প্ল্যান নয়।
