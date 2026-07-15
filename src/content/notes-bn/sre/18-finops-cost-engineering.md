---
title: 'FinOps ও Cost Engineering'
subtitle: "Unit economics, rightsizing, spot, savings plans, cost-aware SLOs। যে senior SRE skill 'cloud bill অনেক বেশি'-কে একটা tracked, owned, কমতে থাকা সংখ্যায় পরিণত করে।"
chapter: 18
level: 'mastery'
readingTime: '26 মিনিট'
topics: ['FinOps', 'cost', 'rightsizing', 'spot', 'savings plans', 'unit economics', 'cloud bill']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা household budget — টাকা ঠিক কোথায় যায় সেটা জানা হলো ভালোভাবে খরচ করার পূর্বশর্ত।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরির বিশাল হাভেলিতে চারটা wing — একেকটায় আলাদা পরিবার, রান্নাঘর, অতিথিশালা। মাসের বিদ্যুৎ-পানির bill হঠাৎ দ্বিগুণ, কিন্তু কেউ বলতে পারে না টাকাটা ঠিক কোথায় যাচ্ছে। একটাই মিটার পুরো হাভেলির — তাই bill মানে শুধু মাথার উপর ঝোলা একটা মোটা সংখ্যা, কেউ দায়ী নয়, কেউ কমানোর তাগিদও অনুভব করে না।

তখন হাভেলির সুবিবেচক কোষাধ্যক্ষ ইবনে সিনা প্রতিটা wing-এ আলাদা sub-meter বসিয়ে দিলেন — এবার স্পষ্ট দেখা গেল কোন wing কত পোড়ায়। প্রতিটা খরচ তিনি যে পরিবার ঘটিয়েছে তার নামে লিখে রাখলেন, যাতে হিসাব ন্যায্যভাবে ভাগ হয়। তারপর চোখে পড়া অপচয় ছাঁটলেন — অতিথিশালার যে গিজার সারাদিন অকারণে জ্বলত সেটা বন্ধ, আর যে বড় প্যাকেজ কেউ পুরো ব্যবহারই করত না সেটা ছোট করে আনলেন। শেষে নিয়ম করলেন — প্রতিটা wing নিজের অংশের জন্য নিজেই জবাবদিহি করবে। ব্যস, যে যা লাগে না সব বন্ধ করে দিল, আর মাসের bill নেমে এল।

এই গল্পটাই আসলে **FinOps**। sub-meter বসিয়ে প্রতি wing-এর ব্যবহার দেখতে পাওয়াটা হলো cost **visibility**; প্রতিটা খরচ যে ঘটিয়েছে তার নামে লিখে রাখা হলো cost **allocation** ও **tagging**; অকারণে জ্বলা গিজার আর অতিরিক্ত-বড় প্যাকেজ ছাঁটাই হলো **optimization** — waste কাটা আর **right-size** করা; আর প্রতিটা wing নিজের বিলের জন্য জবাবদিহি করা হলো **accountability**। বাস্তবে ঠিক এভাবেই cloud bill-কে tag করা হয়, per-team dashboard-এ visible করা হয়, rightsizing ও spot দিয়ে trim করা হয়, আর team-কে নিজের spend-এর মালিক বানানো হয় — তখন "cloud bill অনেক বেশি" একটা tracked, owned, কমতে থাকা সংখ্যায় পরিণত হয়।

## এটা কেন একটা SRE topic

CFO engineering-এ ঢোকে: "AWS bill এই quarter-এ 40% বেড়েছে। কেন?"

কেউ জানে না। Engineering bill দেখে না। Finance `c6g.4xlarge` বোঝে না। যতক্ষণ না layoff-এর কথা ওঠে ততক্ষণ bill মাসে 5% করে বেড়ে চলে।

এই gap-টাই FinOps পূরণ করে। প্রতিটা well-run আধুনিক shop-এর senior SRE-রা — কমপক্ষে — তাদের service-এর _unit economics_-এর মালিক: cost per request, cost per active user, cost per gigabyte stored। এই সংখ্যাগুলো cloud spend-কে একটা measurable target সহ একটা engineering সমস্যায় পরিণত করে।

## তিনটা FinOps phase

FinOps Foundation framework। আপনি প্রতিটা workload-এ ক্রমাগত এগুলোর মধ্য দিয়ে যান:

```
Inform   — see the bill, attribute to teams, build dashboards.
Optimize — rightsize, commit, refactor expensive paths.
Operate  — automate, alert, embed cost in code review and design.
```

বেশিরভাগ team Inform-এ আটকে আছে। leverage হলো প্রতিটা workload-কে Optimize, তারপর Operate-এ নেওয়ায়।

## Cost model: আপনি আসলে কীসের দাম দেন

Cloud invoice সহজে ভুল পড়া যায়। একজন senior SRE এটাকে চার bucket-এ ভাঙে:

```
Compute       — EC2, Fargate, GKE nodes, Lambda. ~40-60% of bill.
Storage       — EBS, S3, EFS, snapshots. ~10-20%.
Data transfer — egress (cross-AZ, cross-region, internet). ~10-25%.
Managed       — RDS, ElastiCache, MSK, opensearch. ~10-20%.
```

যে দুটো সবসময় চমকে দেয়:

- **Cross-AZ data transfer.** $0.01/GB শুনতে সামান্য। ভিন্ন ভিন্ন AZ-তে থাকা service জুড়ে 100 TB/day-তে, এটা $30k/month। AWS সেই bucket-কে standard Cost Explorer-এ query করা ~অসম্ভব করে রাখে।
- **Snapshot storage.** পুরনো EBS snapshot চিরকাল auto-charged। অনেক team শেষ পর্যন্ত যখন দেখে তখন $50k-এর orphaned snapshot আবিষ্কার করে।

## Unit economics — দীর্ঘমেয়াদে একমাত্র যে metric গুরুত্বপূর্ণ

Total cloud spend scale context ছাড়া আপনাকে কিছুই বলে না। Cost per unit-of-business বলে:

```
- $/request                  (API service)
- $/active user/month        (consumer SaaS)
- $/event ingested           (data platform)
- $/GB stored / $/GB queried (analytics)
- $/transaction              (payments)
```

framing পাল্টে যায়: "AWS bill অনেক বেশি"-র বদলে, কথোপকথন হয় "cost per request Q1-এ ছিল $0.0008, Q2-তে $0.0011 — কী পাল্টাল আর কীভাবে $0.0008-এ ফিরব?"

এখন engineering কাজ করতে পারে। তারা profile করতে, refactor করতে, feature kill করতে, instance type switch করতে, আর line track করতে পারে।

### একটা সরল unit-economics dashboard

```
For each service:
  cost_per_request_24h_avg
  cost_per_request_7d_p95
  cost_per_request_30d_trend (sparkline)

Alert when:
  cost_per_request_24h > 1.5 * cost_per_request_30d_avg
```

cost-এ একটা regression-detection alert latency-র উপরেরটার মতো একই আকারের — আর ঠিক ততটাই actionable।

## Cost attribution — bill হলো একটা labeling সমস্যা

আপনি যা attribute করতে পারেন না তা optimize করতে পারেন না। non-negotiable ভিত্তি:

```
- Tagging policy enforced from day one.
  Required tags: team, service, env, cost_center, on_call_email.
- Tag enforcement at provision time (Terraform validation, IaC policy).
- Untagged spend rolled up under "no_owner" — visible to finance.
- Per-K8s-namespace cost via tools like Kubecost / OpenCost.
```

এগুলো ছাড়া, cost-explorer dashboard হলো org-এর মাথায় একটা single line। এগুলো সহ, আপনি সেই team-এ একটা Slack message route করতে পারেন যারা $80k/month-এর CloudFront distribution-এর মালিক।

### K8s allocation সমস্যা

K8s cluster team জুড়ে node share করে। naïve allocation বলে "team X 30% CPU ব্যবহার করেছে, তাই তারা 30% দেয়।" কিন্তু team X একইসাথে 50% memory reservation idle ধরেছিল। **OpenCost / Kubecost** actual scheduling cost দিয়ে allocate করে: request-এর max(CPU%, memory%, GPU%), node price দিয়ে weighted।

একবার এটা team-দের কাছে একটা Slack-bot weekly হিসেবে ship করলে, দুই সপ্তাহে behavior পাল্টায়। হঠাৎ লোকজন সঠিক request _সেট করে_।

## Rightsizing — সবচেয়ে নিচের ঝুলন্ত ফল

Rightsizing মানে reservation আর instance type-কে actual usage-এর সাথে মেলানো।

### CPU/memory rightsizing

pattern:

```
1. Measure actual P95 utilization over 14 days.
2. Set requests at P95 + 30% buffer.
3. Set limits at P95 + 100% buffer (or memory request = limit; see ch.16).
4. Re-evaluate quarterly.
```

VPA (Vertical Pod Autoscaler) এটা "recommend" mode-এ স্বয়ংক্রিয়ভাবে করতে পারে (কিছু না পাল্টে কী সেট করবেন তা দেখায়)। সেখান থেকে শুরু করুন। প্রথম quarter-এ manually apply করুন; তারপর automation-এ ভরসা করুন।

### Instance type rightsizing

Cloud catalog ঘন। দুটো heuristic:

```
- Use Graviton/ARM instances where supported. Often 20-40% cheaper at
  comparable performance. Most modern runtimes (Java 17+, Go, Node 20+,
  Python 3.11+) work fine.
- Match memory:CPU ratio. A workload using 1 GB per CPU on r5 (8 GB:CPU)
  is paying for 7 GB/CPU it doesn't use. Move to c5 (2 GB:CPU).
```

একটা বাস্তব উদাহরণ: একটা Go service `r5.2xlarge`-এ ($0.504/hr) 30% memory ব্যবহার করে চলছিল, `c6g.2xlarge`-এ ($0.272/hr) সরানো হলো। একই throughput। 46% সস্তা। bill থেকে বছরে এক-চতুর্থাংশ মিলিয়ন ডলার।

## Commitment-ভিত্তিক discount

Cloud forecastable spend-কে পুরস্কৃত করে।

```
On-demand        — pay for what you use, no commitment. Most expensive.
Savings Plans    — commit to $/hour for 1 or 3 years. ~30-66% off.
                   Compute Savings Plans cover EC2, Fargate, Lambda.
                   EC2 Instance Savings Plans are tighter, more savings.
Reserved Instances — older. Mostly replaced by Savings Plans for compute.
                     RDS still uses RIs.
Spot instances    — bid on spare capacity. ~70-90% off. Can be reclaimed
                    with 2-min notice.
```

Senior team যে strategy-তে converge করে:

```
~70% Reserved/Savings Plans (covers steady-state baseline)
~20% Spot                   (covers stateless burst, batch, CI)
~10% On-demand              (covers spikes + non-spot-tolerant workloads)
```

commit %-এর নিচে, আপনার _actual_ coverage গুরুত্বপূর্ণ: লক্ষ্য **95% compute hour RI/SP দিয়ে covered**। এর নিচে, আপনি steady load-এর জন্য on-demand দিচ্ছেন।

### Spot strategy

Spot stateless বা fault-tolerant workload-এর জন্য free money।

```
Good for:    Stateless web tier behind PDB + autoscale, batch jobs,
             CI runners, ephemeral compute, K8s data-plane behind PDB.

Bad for:     Stateful single-instance things, anything where startup
             time > 2 minutes (the spot reclaim notice).
```

Pattern:

- 10+ instance type জুড়ে থাকা **Mixed-instance Auto Scaling Group / Karpenter NodePool**। Spot interruption rate per-instance-type; ছড়ানো "all-at-once" risk কমায়।
- K8s-কে একসাথে সব spot pod drain করা থেকে ঠেকাতে **Pod Disruption Budget**।
- **Capacity Rebalance** event: AWS reclaim-এর আগে সতর্ক করে। node-টা gracefully drain করুন।

একটা well-configured spot fleet প্রতি pod প্রতি week-এ &lt; 1 interruption দেখে আর সেই capacity-তে 70%+ সাশ্রয় করে।

## Storage cost — নীরব বৃদ্ধিকারী

```
EBS gp3 (general SSD)    $0.08/GB/mo + provisioned IOPS
S3 Standard               $0.023/GB/mo + per-request charges
S3 Standard-IA            $0.0125/GB/mo + retrieval per GB
S3 Glacier Instant        $0.004/GB/mo + retrieval per GB
S3 Glacier Deep           $0.00099/GB/mo + retrieval cost + delay
Snapshots                 ~ $0.05/GB/mo (incremental, but never deleted)
```

Senior-team checklist:

```
- S3 Lifecycle policies on every bucket. Tier to IA at 30 d, Glacier at 90 d,
  expire at 365 d unless marked "keep forever."
- Snapshot lifecycle policies. Delete > 30 d unless tagged "retain".
- Enable S3 Storage Lens. It exposes the multi-million-key buckets where
  most of the cost lives.
- Multipart-upload abandonment cleanup. Failed uploads charge forever.
- Intelligent-Tiering for unpredictable-access buckets.
```

একটা mid-sized account-এ এটা করতে একটা বিকেল প্রায়ই storage 30-50% কমায়।

## Network egress — যে cost কেউ আশা করে না

মূল নিয়ম: **data যদি একটা billing boundary পার করে, আপনি দাম দেন।**

```
Same AZ, same VPC                    free
Cross-AZ, same VPC                   $0.01/GB (each direction!)
Cross-region                         $0.02/GB
To internet                          $0.05–0.09/GB depending on volume
S3 → CloudFront                      free
S3 → EC2 same region                 free
EC2 → S3 same region                 free
NAT Gateway data processing          $0.045/GB on top of egress
```

যে ফাঁদগুলো bill মেরে ফেলে:

- **S3-র সামনে NAT Gateway।** এর বদলে একটা VPC Gateway Endpoint ব্যবহার করুন। high-volume traffic-এর জন্য $0 vs $45k/month।
- **Cross-AZ pod-to-pod chatter।** যে microservice mesh নিকটতম replica-তে pod pin করে না সেটা প্রতিটা internal call-এ cross-AZ দেয়। Topology-aware routing (K8s `service.kubernetes.io/topology-mode: Auto`) সাহায্য করে।
- **আরেকটা region থেকে image pull।** আপনার registry per-region mirror করুন।
- **Log আর metric cross-region ship করা।** আগে in-region aggregate করুন; summary ship করুন।

## Data transfer architecture সিদ্ধান্ত

এগুলো এমন design পছন্দ যা যৌগিক হয়:

```
- Multi-region active-active doubles compute + storage AND adds cross-region
  replication egress. Justify the cost against the actual RTO/RPO need.
- Cross-cloud (e.g. AWS → GCP) traffic is brutal — egress out of AWS costs more
  than across two AWS regions.
- "Data lake on S3, query from cloud A and cloud B" — pick one cloud for the
  data; don't replicate.
- For high-traffic public endpoints, CloudFront in front of S3 can be cheaper
  than direct S3 egress because volume tiers + cached responses don't re-egress.
```

## Managed service — convenience tax-এর হিসাব

Managed service (RDS, ElastiCache, MSK, OpenSearch) self-hosted-এর উপর একটা premium নেয়। হিসাব:

```
Self-hosted Postgres on EC2:
  c6g.2xlarge ($175/mo) + EBS + your time

RDS Postgres on db.r6g.2xlarge:
  ~ $640/mo + IOPS + backups + multi-AZ surcharge

Premium: ~3x for managed.
```

সেই 3x কখন worth it:

```
- You don't have a DBA.
- Cost of an outage > the savings.
- Compliance requires the audit trail managed services provide.
- Team time freed up is more valuable than the dollars.
```

কখন নয়:

```
- You have specific tuning needs the managed service won't expose.
- Storage is huge (you pay 2x for the same bytes on managed).
- You're already operating a fleet of stateful systems.
```

একটা "আমরা সবকিছু RDS-এ সরাচ্ছি" সিদ্ধান্ত size করা উচিত; এটা একটা $1M/year line হতে পারে।

## Cost-aware SLOs

classic SRE move: cost-এর বিনিময়ে reliability trade করা।

```
Going from 99.9% → 99.99% might mean:
  - 2x replicas (always-on standby)
  - Multi-region (more egress + standby compute)
  - Premium support tier
  - More on-call hours

Going from 99.99% → 99.999% might mean:
  - Active-active across 3 regions
  - Spanner-class storage
  - 24/7/365 staffed NOC

The cost ratio: each "9" roughly 2-5x previous.
```

এটা product review-এ আনুন: "99.99% SLO-র খরচ 99.9%-এর চেয়ে $X/month বেশি। আপনি এটা এখানে খরচ করতে চান নাকি নতুন feature-এ?" এখন reliability একটা budget কথোপকথন, একটা slogan নয়।

## Code review-এ cost

যে সাংস্কৃতিক পরিবর্তন গুরুত্বপূর্ণ:

```
PR template additions:
  - "Estimated cost impact (best/worst case):"
  - "Egress impact: cross-AZ?  cross-region?"
  - "Storage growth rate: GB/month at current request rate"

CI checks:
  - block PRs that add resource requests > X without an exception tag
  - flag PRs that add a new managed service with no cost estimate
```

এটা ভারী শোনায় যতক্ষণ না আপনি একটা single PR-কে $200k/year-এর S3 PUT request যোগ করতে দেখেছেন।

## Cost incident — হ্যাঁ, এগুলো একটা জিনিস

রাত 2টায় একটা 5x egress spike একটা incident। এটাকে সেভাবেই treat করুন।

```
Page-worthy cost anomalies:
  - Daily spend > 2x 30-day average
  - Any single instance type's spend > 2x its 7-day average
  - New top-10 service appearing in cost report (unusual provisioning)
  - NAT Gateway data processing > 2x baseline (likely misconfigured route)

Post-incident:
  - Postmortem with cost root cause + dollar impact
  - Action items to prevent recurrence (often: a guardrail or quota)
```

একটা বাস্তব incident: একজন developer কোনো lifecycle policy ছাড়া একটা bucket-এ CloudFront access log enable করল। 90 দিন পর, bucket 200 TB। Postmortem lifecycle policy _আর_ যে IaC template-এর এটা enforce করা উচিত ছিল সেটা — দুটোই ফিক্স করল।

## commit-এর বাইরে compute-এর জন্য reserved capacity

Savings Plans-এর বাইরে, স্কেলে আরও দুটো lever:

```
- AWS Capacity Reservations: pay for capacity in a specific AZ.
  Critical for "we MUST have N c6i.32xlarge for the launch."
- Compute Optimizer recommendations: AWS's own data on which workloads
  are over/under-provisioned. Surprisingly accurate.
- Karpenter (K8s) with diverse instance types: opportunistic best-fit
  per pod's request. Cuts node spend ~20-30% vs fixed-type ASGs.
```

## FinOps tools

```
Cost visibility:
  - Native: AWS Cost Explorer + Budgets + Anomaly Detection
  - Third-party: Vantage, CloudHealth, Apptio Cloudability, Cast.AI
  - K8s: OpenCost (open source), Kubecost (managed)

Spend control / automation:
  - AWS Compute Optimizer, AWS Trusted Advisor
  - Karpenter for K8s node spend
  - Spot.io / Cast.AI for managed spot fleets
  - Infracost for PR-time cost diff (Terraform)

Cultural:
  - Slack bot: per-team weekly spend report with WoW delta
  - "Who runs that thing?" registry in your IDP
```

## Common ভুল

1. **কোনো tagging discipline নেই।** প্রতিটা cost প্রশ্ন একটা forensic exercise হয়ে যায়।
2. **cost-কে finance-এর সমস্যা হিসেবে treat করা।** Engineering dial-এর মালিক।
3. **কোনো commitment coverage নেই।** steady-state load-এর জন্য on-demand দেওয়া মানে 30-50% ছেড়ে দেওয়া।
4. **প্রতিবর্তীভাবে multi-region।** cost দ্বিগুণ করে; শুধু বাস্তব DR/latency প্রয়োজনে justified।
5. **পুরনো snapshot, orphaned EBS volume, dead Elastic IP ভুলে যাওয়া।** quarterly audit করুন।
6. **Cost-anomaly alert যার কেউ মালিক নয়।** team-এর Slack-এ route করুন, একটা generic channel-এ নয়।

## আপডেটেড থাকুন

- [FinOps Foundation](https://www.finops.org/) — framework, certification, community
- [AWS pricing](https://aws.amazon.com/pricing/) আর [AWS Cost Management docs](https://docs.aws.amazon.com/cost-management/) — current rate + tooling
- [Google Cloud cost optimization](https://cloud.google.com/architecture/framework/cost-optimization) — counterpart guidance
- [OpenCost](https://www.opencost.io/) — vendor-neutral K8s cost allocation

## মূল শিক্ষা

1. **Unit economics হলো সেই line যা spend-কে engineering action-এ পরিণত করে।**
2. **Tagging + per-team dashboard** হলো বাকি সবকিছুর পূর্বশর্ত।
3. **CPU/memory rightsizing + Graviton + সঠিক instance ratio** হলো সবচেয়ে সস্তা 30%।
4. **70% Savings Plan / 20% Spot / 10% On-demand** হলো steady-state আকার।
5. **Network egress হলো সেই cost যা কেউ আশা করে না** — VPC endpoint, topology-aware routing, in-region aggregation।
6. **Cost-aware SLO reliability-কে একটা slogan-এর বদলে একটা product কথোপকথন বানায়।**
7. **একটা cost spike একটা incident** — latency-র মতো একই কঠোরতায় treat করুন।
