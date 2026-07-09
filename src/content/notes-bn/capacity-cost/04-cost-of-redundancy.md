---
title: 'The Cost of Redundancy'
subtitle: 'Multi-AZ, N+1, active-active — প্রতিটা availability pattern আসলে কত খরচ করে আর একটা বেছে নেওয়ার পেছনের হিসাব।'
chapter: 4
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['redundancy', 'high availability', 'multi-AZ', 'N+1', 'active-active', 'SLA']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

আপনার গাড়ির spare tire: একটা spare টায়ারের খরচ দ্বিগুণ করে কিন্তু আপনাকে রাস্তায় আটকে যাওয়া থেকে বাঁচায়। দুটো spare আর একটা tow-truck subscription মানে আপনি কখনো meeting মিস করবেন না — কিন্তু এখন আপনি trip-এর চেয়ে contingency-তে বেশি খরচ করে ফেলেছেন। প্রতিটা availability tier-এর একটা দাম আছে, আর সঠিকটা নির্ভর করে আটকে যাওয়া আসলে আপনার কত খরচ করায় তার উপর।

</Callout>

## Availability Target আর সেগুলোর মানে

```
99%    uptime = 87.6 hours/year downtime
99.9%  uptime = 8.76 hours/year downtime
99.99% uptime = 52.6 minutes/year downtime
99.999%uptime = 5.26 minutes/year downtime

Each additional "9" roughly costs 10x more in infrastructure and ops complexity.
```

একটা target বেছে নেওয়ার আগে হিসাব করুন downtime আসলে আপনার business-এর কত খরচ করায়:

```
Revenue impact:
  Monthly revenue: $500,000
  Hourly revenue: ~$700
  Cost of 8.76 hours downtime (99.9%): $6,100/year

Infrastructure cost to go 99.9% → 99.99%:
  Roughly 3x infrastructure spend = +$2,000/month = $24,000/year

99.99% costs $24,000 more per year to save $6,100 in downtime risk.
99.9% is the economically rational choice.
```

Five nines-এ commit করার আগে এই হিসাবটা করুন।

## N+1 Redundancy

Baseline: N+1 instance চালান যেখানে N হলো load serve করতে যা লাগে। একটা fail করলে বাকি N পুরো traffic সামলায়।

```
At peak: 100 RPS → need 2 app servers at 50% utilization each
N+1:     3 app servers → if 1 fails, 2 remain at 50% utilization
         Can absorb a failure without degradation

Cost: 3/2 = 1.5x the cost of a non-redundant setup

Availability gain:
  Probability both remaining fail simultaneously (MTTF = 30 days/server):
  P = (1/720)² = 0.000002 ≈ 99.9998% availability
```

Stateless application server-এর জন্য N+1 হলো default। এটা সস্তা (50% premium) আর সবচেয়ে সাধারণ failure mode (single server crash বা restart) সামলায়।

## Multi-AZ (Active-Standby)

Primary একটা availability zone-এ চালান, standby আরেকটায়। Primary fail করলে standby-তে failover — সাধারণত 30-60 সেকেন্ডের downtime।

```
AWS RDS Multi-AZ:
  Primary + synchronous standby
  Automatic failover: ~60s
  Cost: 2x single-AZ instance

Example:
  Single-AZ db.m5.large: $140/month
  Multi-AZ db.m5.large:  $280/month

What you get:
  AZ failure protection (rare but catastrophic without it)
  Storage failure protection
  OS/maintenance failover (zero-downtime patching)
```

আপনার database-এর জন্য Multi-AZ সাধারণত production-এ সঠিক সিদ্ধান্ত। 2x খরচটা AZ-level failure আর maintenance window-এর বিরুদ্ধে protection দিয়ে justify হয়।

## Active-Active vs Active-Standby

**Active-Standby:** একটা node traffic সামলায়, standby দরকার না হওয়া পর্যন্ত idle থাকে। সরল কিন্তু standby-র capacity নষ্ট করে।

**Active-Active:** দুটো node একসাথে traffic সামলায়। Failover seamless (কোনো switchover delay নেই) আর standby-র capacity আসলে ব্যবহার হয়।

```
Active-Standby (Multi-AZ):
  Cost: 2x (pay for standby that does no work)
  Failover: 30-60s automatic
  Complexity: low

Active-Active (two regions):
  Cost: 2x (same) but standby serves real traffic
  Failover: seconds (DNS switchover)
  Complexity: high — need conflict resolution for writes
```

Stateless service-এর জন্য active-active অর্থবহ (দুটো node-ই traffic serve করে = active-standby-র সমান দামে 2x capacity)। Stateful service-এর (database) জন্য এটাতে write conflict সামলাতে হয়, যা উল্লেখযোগ্য জটিলতা যোগ করে।

## Regional Redundancy (Multi-Region)

পুরো region failure-এর বিরুদ্ধে protect করে (বিরল কিন্তু বাস্তব — AWS us-east-1-এ multi-hour outage হয়েছে)।

```
Architecture: Primary region (us-east-1) + DR region (us-west-2)
  - App servers: active-active, DNS-based routing
  - Database: async replication to DR region

Cost:
  DR region: full replica of production infrastructure
  Roughly 2x total infrastructure cost
  Plus: data transfer costs for replication (~$0.09/GB)

RTO (Recovery Time Objective): hours (multi-region setup, manual failover)
              or minutes (automated failover with Route53 health checks)
RPO (Recovery Point Objective): seconds-to-minutes (async replication lag)
```

বেশিরভাগ কোম্পানির active-active multi-region দরকার নেই। একটা সহজ approach: দ্বিতীয় region-এ আপনার stack deploy করুন কিন্তু scaled down রাখুন। Disaster হলে scale up করুন আর DNS আপডেট করুন। Cold standby একটা full replica-র 20-30% খরচ করে।

## Cross-Region Replication-এর খরচ

Region-এর মধ্যে data replicate করা AWS-এ ব্যয়বহুল:

```
Data transfer between AWS regions: $0.02/GB (inter-region)
PostgreSQL WAL replication: proportional to write volume

At 100GB/day write volume:
  Monthly replication cost: 100 × 30 × $0.02 = $60/month

Object storage (S3) cross-region replication:
  Per-object replication fee: $0.015 per 1,000 objects
  Plus: storage in both regions
  Plus: data transfer fees

For read-only replicas in other regions (analytics workloads):
  DMS or pglogical replication: simpler and cheaper than full multi-region
```

## Chaos Budget: Confidence-এর জন্য টাকা দেওয়া

Redundancy একটা insurance policy। Premium হলো চলমান infrastructure cost; payout হলো downtime ছাড়া failure থেকে বেঁচে যাওয়া। আপনার আসল risk অনুযায়ী insurance-এর সাইজ ঠিক করুন:

```
Risk matrix for a B2B SaaS:
  Application server failure (weekly): N+1 handles → no downtime
  Database failure (monthly): Multi-AZ → 60s downtime
  AZ failure (yearly): Multi-AZ → handled
  Region failure (multi-year): accept the risk OR pay for multi-region

Cost to handle each:
  N+1 app servers: +50% app server cost
  Multi-AZ DB: +$140/month (2x RDS)
  Multi-region: +$2,000/month (full replica)

Acceptable risk decision: cover everything up to AZ failure, accept region failure.
Total redundancy cost: ~$350/month
```

## Redundancy-র Operational খরচ

Hardware cost দৃশ্যমান। Operational cost নয়:

**Complexity tax:**

- monitor করার জন্য বেশি component
- test করার জন্য বেশি failure mode
- লেখা আর maintain করার জন্য বেশি runbook
- প্রতি quarter-এ practice করার জন্য failover procedure

**Testing debt:** Untested failover সবচেয়ে খারাপ মুহূর্তে fail করে। Chaos testing (chaos-resilience-এর chapter) আর game day যোগ করুন। HA testing-এর জন্য প্রতি quarter-এ 1-2 engineer-day budget রাখুন।

**Simplicity premium:** অনেক team তাদের production 2 app server + managed DB + managed Redis-এ চালায়। বোঝা সহজ, কিছু ভাঙলে দ্রুত ঠিক করা যায়, operate করা সস্তা। শুধু তখনই জটিলতা যোগ করুন যখন উপরের হিসাব দেখায় সেটা পোষায়।
