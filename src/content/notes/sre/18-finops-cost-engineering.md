---
title: 'FinOps & Cost Engineering'
subtitle: "Unit economics, rightsizing, spot, savings plans, cost-aware SLOs. The senior SRE skill that turns 'the cloud bill is too high' into a tracked, owned, falling number."
chapter: 18
level: 'mastery'
readingTime: '26 min'
topics: ['FinOps', 'cost', 'rightsizing', 'spot', 'savings plans', 'unit economics', 'cloud bill']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A household budget — knowing exactly where the money goes is the prerequisite to spending it better.

</Callout>

## Why this is an SRE topic

CFO walks into engineering: "AWS bill is up 40% this quarter. Why?"

Nobody knows. Engineering doesn't see the bill. Finance doesn't understand `c6g.4xlarge`. The bill keeps growing 5% a month until layoffs are on the table.

This is the gap FinOps fills. The senior SREs at every well-run modern shop own — at minimum — the _unit economics_ of their service: cost per request, cost per active user, cost per gigabyte stored. Those numbers turn cloud spend into an engineering problem with a measurable target.

## The three FinOps phases

The FinOps Foundation framework. You move through these continuously per workload:

```
Inform   — see the bill, attribute to teams, build dashboards.
Optimize — rightsize, commit, refactor expensive paths.
Operate  — automate, alert, embed cost in code review and design.
```

Most teams are stuck at Inform. The leverage is in moving each workload into Optimize, then Operate.

## The cost model: what you actually pay for

Cloud invoices are easy to misread. A senior SRE breaks it into four buckets:

```
Compute       — EC2, Fargate, GKE nodes, Lambda. ~40-60% of bill.
Storage       — EBS, S3, EFS, snapshots. ~10-20%.
Data transfer — egress (cross-AZ, cross-region, internet). ~10-25%.
Managed       — RDS, ElastiCache, MSK, opensearch. ~10-20%.
```

The two that always surprise:

- **Cross-AZ data transfer.** $0.01/GB sounds tiny. At 100 TB/day across services that all live in different AZs, it's $30k/month. AWS makes that bucket ~impossible to query in the standard Cost Explorer.
- **Snapshot storage.** Old EBS snapshots auto-charged forever. Many teams discover $50k of orphaned snapshots when they finally look.

## Unit economics — the only metric that matters long-term

Total cloud spend tells you nothing without scale context. Cost per unit-of-business does:

```
- $/request                  (API service)
- $/active user/month        (consumer SaaS)
- $/event ingested           (data platform)
- $/GB stored / $/GB queried (analytics)
- $/transaction              (payments)
```

The framing flip: instead of "AWS bill is too high," the conversation becomes "cost per request was $0.0008 in Q1, $0.0011 in Q2 — what changed and how do we get back to $0.0008?"

Now engineering can act. They can profile, refactor, kill features, switch instance types, and track the line.

### A simple unit-economics dashboard

```
For each service:
  cost_per_request_24h_avg
  cost_per_request_7d_p95
  cost_per_request_30d_trend (sparkline)

Alert when:
  cost_per_request_24h > 1.5 * cost_per_request_30d_avg
```

A regression-detection alert on cost is the same shape as one on latency — and just as actionable.

## Cost attribution — bills are a labeling problem

You cannot optimize what you can't attribute. The non-negotiable foundations:

```
- Tagging policy enforced from day one.
  Required tags: team, service, env, cost_center, on_call_email.
- Tag enforcement at provision time (Terraform validation, IaC policy).
- Untagged spend rolled up under "no_owner" — visible to finance.
- Per-K8s-namespace cost via tools like Kubecost / OpenCost.
```

Without these, the cost-explorer dashboard is a single line at the top of the org. With them, you can route a Slack message to the team that owns the $80k/month CloudFront distribution.

### The K8s allocation problem

K8s clusters share nodes across teams. Naïve allocation says "team X used 30% of CPU, so they pay 30%." But team X also held 50% of memory reservation idle. **OpenCost / Kubecost** allocate by the actual scheduling cost: max(CPU%, memory%, GPU%) of requests, weighted by node price.

Once you ship that to teams as a Slack-bot weekly, behaviors change in two weeks. Suddenly people _do_ set the right requests.

## Rightsizing — the lowest-hanging fruit

Rightsizing means matching reservations and instance types to actual usage.

### CPU/memory rightsizing

The pattern:

```
1. Measure actual P95 utilization over 14 days.
2. Set requests at P95 + 30% buffer.
3. Set limits at P95 + 100% buffer (or memory request = limit; see ch.16).
4. Re-evaluate quarterly.
```

VPA (Vertical Pod Autoscaler) can do this automatically in "recommend" mode (it shows you what to set without changing things). Start there. Apply manually for the first quarter; then trust automation.

### Instance type rightsizing

Cloud catalogs are dense. Two heuristics:

```
- Use Graviton/ARM instances where supported. Often 20-40% cheaper at
  comparable performance. Most modern runtimes (Java 17+, Go, Node 20+,
  Python 3.11+) work fine.
- Match memory:CPU ratio. A workload using 1 GB per CPU on r5 (8 GB:CPU)
  is paying for 7 GB/CPU it doesn't use. Move to c5 (2 GB:CPU).
```

A real example: a Go service running on `r5.2xlarge` ($0.504/hr) using 30% of memory, moved to `c6g.2xlarge` ($0.272/hr). Same throughput. 46% cheaper. Quarter-million dollars a year off the bill.

## Commitment-based discounts

The cloud rewards forecastable spend.

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

The strategy senior teams converge on:

```
~70% Reserved/Savings Plans (covers steady-state baseline)
~20% Spot                   (covers stateless burst, batch, CI)
~10% On-demand              (covers spikes + non-spot-tolerant workloads)
```

Underneath the commit %, your _actual_ coverage matters: aim for **95% of compute hours covered by RIs/SPs.** Below that, you're paying on-demand for steady load.

### Spot strategy

Spot is free money for stateless or fault-tolerant workloads.

```
Good for:    Stateless web tier behind PDB + autoscale, batch jobs,
             CI runners, ephemeral compute, K8s data-plane behind PDB.

Bad for:     Stateful single-instance things, anything where startup
             time > 2 minutes (the spot reclaim notice).
```

Patterns:

- **Mixed-instance Auto Scaling Groups / Karpenter NodePools** that span 10+ instance types. Spot interruption rate is per-instance-type; spreading reduces "all-at-once" risk.
- **Pod Disruption Budgets** to prevent K8s from draining all spot pods at once.
- **Capacity Rebalance** events: AWS warns before reclaim. Drain the node gracefully.

A well-configured spot fleet sees &lt; 1 interruption / pod / week and saves 70%+ on that capacity.

## Storage cost — the silent grower

```
EBS gp3 (general SSD)    $0.08/GB/mo + provisioned IOPS
S3 Standard               $0.023/GB/mo + per-request charges
S3 Standard-IA            $0.0125/GB/mo + retrieval per GB
S3 Glacier Instant        $0.004/GB/mo + retrieval per GB
S3 Glacier Deep           $0.00099/GB/mo + retrieval cost + delay
Snapshots                 ~ $0.05/GB/mo (incremental, but never deleted)
```

The senior-team checklist:

```
- S3 Lifecycle policies on every bucket. Tier to IA at 30 d, Glacier at 90 d,
  expire at 365 d unless marked "keep forever."
- Snapshot lifecycle policies. Delete > 30 d unless tagged "retain".
- Enable S3 Storage Lens. It exposes the multi-million-key buckets where
  most of the cost lives.
- Multipart-upload abandonment cleanup. Failed uploads charge forever.
- Intelligent-Tiering for unpredictable-access buckets.
```

A single afternoon doing this on a mid-sized account often cuts storage 30-50%.

## Network egress — the cost no one expects

The cardinal rule: **if data crosses a billing boundary, you pay.**

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

The traps that kill bills:

- **NAT Gateway in front of S3.** Use a VPC Gateway Endpoint instead. $0 vs $45k/month for high-volume traffic.
- **Cross-AZ pod-to-pod chatter.** A microservice mesh that doesn't pin pods to nearest replicas pays cross-AZ on every internal call. Topology-aware routing (K8s `service.kubernetes.io/topology-mode: Auto`) helps.
- **Image pulls from another region.** Mirror your registry per-region.
- **Logs and metrics shipped cross-region.** Aggregate in-region first; ship summaries.

## Data transfer architecture decisions

These are design choices that compound:

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

## Managed services — convenience tax math

Managed services (RDS, ElastiCache, MSK, OpenSearch) charge a premium over self-hosted. The math:

```
Self-hosted Postgres on EC2:
  c6g.2xlarge ($175/mo) + EBS + your time

RDS Postgres on db.r6g.2xlarge:
  ~ $640/mo + IOPS + backups + multi-AZ surcharge

Premium: ~3x for managed.
```

When that 3x is worth it:

```
- You don't have a DBA.
- Cost of an outage > the savings.
- Compliance requires the audit trail managed services provide.
- Team time freed up is more valuable than the dollars.
```

When it isn't:

```
- You have specific tuning needs the managed service won't expose.
- Storage is huge (you pay 2x for the same bytes on managed).
- You're already operating a fleet of stateful systems.
```

A "we're moving everything to RDS" decision should be sized; it can be a $1M/year line.

## Cost-aware SLOs

The classic SRE move: trade reliability for cost.

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

Bring this to product reviews: "the 99.99% SLO costs $X/month more than 99.9%. Do you want to spend it here or on the new feature?" Now reliability is a budget conversation, not a slogan.

## Cost in code review

The cultural shift that matters:

```
PR template additions:
  - "Estimated cost impact (best/worst case):"
  - "Egress impact: cross-AZ?  cross-region?"
  - "Storage growth rate: GB/month at current request rate"

CI checks:
  - block PRs that add resource requests > X without an exception tag
  - flag PRs that add a new managed service with no cost estimate
```

This sounds heavy until you've seen a single PR add $200k/year of S3 PUT requests.

## Cost incidents — yes, they're a thing

A 5x egress spike at 2 AM is an incident. Treat it like one.

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

A real incident: a developer enabled CloudFront access logs to a bucket with no lifecycle policy. 90 days later, the bucket was 200 TB. Postmortem fixed the lifecycle policy _and_ the IaC template that should have enforced it.

## Reserved capacity for compute beyond commits

Beyond Savings Plans, two more levers at scale:

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

## Common mistakes

1. **No tagging discipline.** Every cost question becomes a forensic exercise.
2. **Treating cost as finance's problem.** Engineering owns the dial.
3. **No commitment coverage.** Paying on-demand for steady-state load is leaving 30-50% on the table.
4. **Reflexive multi-region.** Doubles cost; only justified by real DR/latency needs.
5. **Forgetting old snapshots, orphaned EBS volumes, dead Elastic IPs.** Audit quarterly.
6. **Cost-anomaly alerts that no one owns.** Route to the team's Slack, not a generic channel.

## Stay current

- [FinOps Foundation](https://www.finops.org/) — framework, certifications, community
- [AWS pricing](https://aws.amazon.com/pricing/) and [AWS Cost Management docs](https://docs.aws.amazon.com/cost-management/) — current rates + tooling
- [Google Cloud cost optimization](https://cloud.google.com/architecture/framework/cost-optimization) — counterpart guidance
- [OpenCost](https://www.opencost.io/) — vendor-neutral K8s cost allocation

## Key Takeaways

1. **Unit economics is the line that turns spend into engineering action.**
2. **Tagging + per-team dashboards** are the prerequisite for everything else.
3. **Rightsizing CPU/memory + Graviton + correct instance ratio** is the cheapest 30%.
4. **70% Savings Plan / 20% Spot / 10% On-demand** is the steady-state shape.
5. **Network egress is the cost no one expects** — VPC endpoints, topology-aware routing, in-region aggregation.
6. **Cost-aware SLOs make reliability a product conversation** instead of a slogan.
7. **A cost spike is an incident** — treat it with the same rigor as latency.
