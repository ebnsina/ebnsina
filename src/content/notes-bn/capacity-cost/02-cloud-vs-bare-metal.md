---
title: 'Cloud vs Bare Metal vs VPS'
subtitle: 'প্রতিটা deployment model-এর unit economics — কখন managed সুবিধা যা বাঁচায় তার চেয়ে বেশি খরচ করায়, আর কখন করায় না।'
chapter: 2
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['cloud', 'bare metal', 'VPS', 'unit economics', 'TCO']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

গাড়ি ভাড়া করা vs কেনা: ভাড়া করা (cloud) প্রতি মাইলে বেশি খরচ, কিন্তু দরকার না থাকলে ফেরত দিতে পারেন, road trip-এর জন্য বড়টা নিতে পারেন, আর maintenance নিয়ে কখনো ভাবতে হয় না। কেনা (bare metal) প্রতি মাইলে সস্তা যদি অনেক চালান, কিন্তু repair-এর দায় আপনার, আর অব্যবহৃত থাকলে depreciate হতে থাকে।

</Callout>

## তিনটি Model

**Cloud (AWS, GCP, Azure):**

- ব্যবহারের প্রতি ঘণ্টায় pay — কোনো upfront cost নেই
- মিনিটে provision, সাথে সাথে deprovision
- সবকিছুর জন্য managed service (RDS, ElastiCache, S3)
- Premium pricing: সমতুল্য bare metal-এর খরচের 3-5x

**VPS (Hetzner, Linode, DigitalOcean, Vultr):**

- একটা virtual machine-এর জন্য fixed monthly cost
- ভালো managed add-on (managed Postgres, load balancer)
- সমতুল্য spec-এ AWS-এর চেয়ে 60-80% সস্তা
- কোনো spot instance নেই, সীমিত auto-scaling

**Bare Metal (Hetzner Dedicated, OVH, Equinix):**

- Physical server, ভাড়া করা বা মালিকানার
- Scale-এ per-core আর per-GB-RAM সবচেয়ে সস্তা
- কোনো virtualization overhead নেই
- Provision করতে lead time: কয়েক দিন থেকে সপ্তাহ
- OS level-এ সবকিছু আপনাকেই manage করতে হয়

## Unit Cost তুলনা

মোটামুটি সমতুল্য 8-core / 32GB RAM setup-এর তুলনা (2024 pricing):

| Provider          | Type         | Monthly Cost    | Notes                     |
| ----------------- | ------------ | --------------- | ------------------------- |
| AWS (m7g.2xlarge) | Cloud        | ~$230 on-demand | data transfer সহ আরও বেশি |
| AWS (m7g.2xlarge) | Reserved 1yr | ~$140           | upfront commit            |
| Hetzner CX52      | VPS          | ~$55            | ARM-based, EU/US region   |
| DigitalOcean      | VPS          | ~$96            | বেশি region, ভালো support |
| Hetzner AX102     | Bare Metal   | ~$90            | 14-core, 64GB, NVMe       |

যে একই workload AWS on-demand-এ মাসে $2,000 খরচ করে, সেটা Hetzner-এ চলে মাসে $500-600-তে। data transfer আর managed service-এর খরচ যোগ হলে ফারাক আরও বাড়ে।

## Cloud-এর আসল খরচ

Cloud bill-এ কিছু multiplier থাকে যা headline instance price লুকিয়ে রাখে:

**Data transfer (egress):**

```
AWS: $0.09/GB out to internet
At 10TB/month: $900/month just for egress

Hetzner: 20TB included in VPS plans, $1/TB after
Cloudflare (for static): free egress
```

**Managed service premium:**

```
RDS db.t3.medium (2 vCPU, 4GB):
  AWS RDS:        $60/month
  Self-hosted Postgres on $6 VPS: $6/month

ElastiCache cache.t3.micro (1 vCPU, 0.5GB):
  AWS ElastiCache: $25/month
  Self-hosted Redis on shared VPS: ~$5/month amortized
```

**Self-hosting-এর operational overhead:**

```
Self-hosted Postgres:
  Backup setup: 4 hours
  Monitoring setup: 4 hours
  Ongoing ops: 1-2 hours/month

RDS buys back this time — worth it until you're large enough to hire DBAs
```

## আসল Decision Framework

**Cloud ব্যবহার করুন যখন:**

- Team ছোট এবং ops bandwidth সীমিত — managed service premium-এর যোগ্য
- Traffic spiky বা unpredictable — auto-scaling আর pay-per-use গুরুত্বপূর্ণ
- আপনার দ্রুত global region দরকার
- আপনি early stage-এ আছেন আর runway পুড়ছে — time-to-market cost optimization-এর চেয়ে বড়
- আপনার নির্দিষ্ট managed service দরকার (ML, analytics, compliance tool)

**VPS ব্যবহার করুন যখন:**

- Steady, predictable load
- নিজের infra manage করার ops bandwidth আছে
- Cost গুরুত্বপূর্ণ — Series A এবং তার পরে সাধারণ
- Cloud primitive-এর জটিলতা ছাড়া simplicity চান

**Bare metal ব্যবহার করুন যখন:**

- High, sustained compute দরকার (ML training, video transcoding, বড় database)
- আপনার team-এর infrastructure engineering capacity আছে
- Workload যাচাই করেছেন — অব্যবহৃত capacity-তে over-provisioning নেই
- Per-core performance গুরুত্বপূর্ণ (কোনো virtualization overhead নেই)

## Spot / Preemptible Instance

Cloud provider-রা তাদের বাড়তি capacity 70-90% discount-এ spot (AWS) বা preemptible (GCP) instance হিসেবে বিক্রি করে — কিন্তু ২ মিনিটের warning দিয়ে এগুলো terminate করে দেওয়া হতে পারে।

**ভালো ব্যবহার:**

- Queue থেকে টানা stateless worker (terminate হওয়া worker শুধু তার বর্তমান job হারায়, যা retry হয়)
- Progress checkpoint করে এমন batch processing job
- CI/CD runner

**খারাপ ব্যবহার:**

- Primary database — write-এর মাঝে termination corruption ঘটায়
- দ্রুত failover ছাড়া stateful service
- Checkpointing ছাড়া ২ মিনিটের বেশি লম্বা job

```yaml
# Kubernetes: mix of on-demand and spot
nodeGroups:
  - name: on-demand
    instanceType: m5.xlarge
    minSize: 2 # always-on baseline
    maxSize: 10

  - name: spot
    instanceTypes: [m5.xlarge, m5.2xlarge, m4.xlarge]
    spot: true
    minSize: 0
    maxSize: 20 # burst on spot
    taints:
      - key: spot
        effect: NoSchedule
```

## বাস্তবে Rightsizing

বেশিরভাগ team 2-4x overprovision করে। আগে measure করুন:

```bash
# AWS Cost Explorer: rightsizing recommendations
aws ce get-rightsizing-recommendation \
  --service EC2 \
  --configuration '{"RecommendationTarget": "SAME_INSTANCE_FAMILY"}'

# Actual CPU use across your fleet
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --period 3600 \
  --statistics Average Maximum \
  --dimensions Name=InstanceId,Value=i-xxxx
```

যদি আপনার instance-গুলো 10-15% CPU-তে চলে, আপনি বিশাল overprovision করেছেন। Downsize করুন বা প্রতি instance-এ আরও বেশি workload pack করুন।

**Workload packing (একই host-এ multi-tenancy):**

```
Instead of: 4 × m5.xlarge (4 vCPU, 16GB each) for 4 services at 20% CPU
Consider:   1 × m5.4xlarge (16 vCPU, 64GB) running all 4 services

Cost: ~4x cheaper, same total resources
Trade-off: one noisy neighbor affects all, less blast radius isolation
```

## Reserved Instance-এর হিসাব

যদি আপনার baseline compute দরকার predict করতে পারেন, ১ বা ৩ বছরের reserved instance-এ commit করুন:

```
On-demand m5.xlarge: $0.192/hr = $140/month
1-year reserved:     $0.122/hr = $89/month  (35% savings)
3-year reserved:     $0.077/hr = $56/month  (60% savings)

Annual savings on a single instance: $612 (1yr) or $1,008 (3yr)
For 10 instances: $6,120 or $10,080/year
```

আপনার steady-state baseline-এর জন্য reserved instance কিনুন। Baseline-এর উপরের burst-এর জন্য on-demand বা spot ব্যবহার করুন।

## North Star হিসেবে Cost Per Request

Raw cloud spend track করার বদলে **cost per 1000 requests** (CPR) track করুন:

```
Monthly spend: $5,000
Monthly requests: 50,000,000

CPR = $5,000 / 50,000 (thousands) = $0.10 per 1000 requests
```

আপনি যত scale করবেন, CPR তত কমা উচিত (economies of scale)। যদি CPR flat বা বাড়তে থাকে, আপনার architecture efficiently scale করছে না — query cost, caching, বা instance type খতিয়ে দেখুন।

```typescript
// Dashboard metric
const costPerThousandRequests = totalMonthlyCostUsd / (totalMonthlyRequests / 1000);
```

এটা সাপ্তাহিক track করুন। এটা বলে দেয় আপনার infrastructure spend usage-এর সাথে সমানুপাতিকভাবে বাড়ছে (প্রত্যাশিত) নাকি তার চেয়ে দ্রুত (একটা সমস্যা)।
