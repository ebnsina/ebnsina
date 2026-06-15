---
title: "Cloud vs Bare Metal vs VPS"
subtitle: "Unit economics for each deployment model — when managed convenience costs more than it saves, and when it doesn't."
chapter: 2
level: "intermediate"
readingTime: "10 min"
topics: ["cloud", "bare metal", "VPS", "unit economics", "TCO"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Renting vs buying a car: renting (cloud) costs more per mile but you can return it when you don't need it, get a bigger one for a road trip, and never worry about maintenance. Buying (bare metal) is cheaper per mile if you drive a lot, but you're on the hook for repairs, and it sits depreciating when unused.

</Callout>

## The Three Models

**Cloud (AWS, GCP, Azure):**
- Pay per hour of use — no upfront cost
- Provision in minutes, deprovision immediately
- Managed services for everything (RDS, ElastiCache, S3)
- Premium pricing: 3-5x the cost of equivalent bare metal

**VPS (Hetzner, Linode, DigitalOcean, Vultr):**
- Fixed monthly cost for a virtual machine
- Good managed add-ons (managed Postgres, load balancers)
- 60-80% cheaper than AWS for equivalent specs
- No spot instances, limited auto-scaling

**Bare Metal (Hetzner Dedicated, OVH, Equinix):**
- Physical server, rented or owned
- Cheapest per-core and per-GB-RAM at scale
- No virtualization overhead
- Lead time to provision: days to weeks
- You manage everything at the OS level

## Unit Cost Comparison

Comparing a roughly equivalent 8-core / 32GB RAM setup (2024 pricing):

| Provider | Type | Monthly Cost | Notes |
|----------|------|-------------|-------|
| AWS (m7g.2xlarge) | Cloud | ~$230 on-demand | More with data transfer |
| AWS (m7g.2xlarge) | Reserved 1yr | ~$140 | Commit upfront |
| Hetzner CX52 | VPS | ~$55 | ARM-based, EU/US regions |
| DigitalOcean | VPS | ~$96 | More regions, better support |
| Hetzner AX102 | Bare Metal | ~$90 | 14-core, 64GB, NVMe |

The same workload that costs $2,000/month on AWS on-demand runs for $500-600/month on Hetzner. The gap grows with data transfer and managed service costs.

## True Cost of Cloud

Cloud bills have multipliers that the headline instance price hides:

**Data transfer (egress):**
```
AWS: $0.09/GB out to internet
At 10TB/month: $900/month just for egress

Hetzner: 20TB included in VPS plans, $1/TB after
Cloudflare (for static): free egress
```

**Managed services premium:**
```
RDS db.t3.medium (2 vCPU, 4GB):
  AWS RDS:        $60/month
  Self-hosted Postgres on $6 VPS: $6/month

ElastiCache cache.t3.micro (1 vCPU, 0.5GB):
  AWS ElastiCache: $25/month
  Self-hosted Redis on shared VPS: ~$5/month amortized
```

**Operational overhead of self-hosting:**
```
Self-hosted Postgres:
  Backup setup: 4 hours
  Monitoring setup: 4 hours
  Ongoing ops: 1-2 hours/month

RDS buys back this time — worth it until you're large enough to hire DBAs
```

## The Real Decision Framework

**Use cloud when:**
- Team is small and ops bandwidth is limited — managed services are worth the premium
- Traffic is spiky or unpredictable — auto-scaling and pay-per-use matter
- You need global regions quickly
- You're early and burning runway — time-to-market beats cost optimization
- You need specific managed services (ML, analytics, compliance tools)

**Use VPS when:**
- Steady, predictable load
- You have ops bandwidth to manage your own infra
- Cost matters — common at Series A and beyond
- You want simplicity without the complexity of cloud primitives

**Use bare metal when:**
- High, sustained compute need (ML training, video transcoding, large databases)
- Your team has infrastructure engineering capacity
- You've verified the workload — no over-provisioning on unused capacity
- Per-core performance matters (no virtualization overhead)

## Spot / Preemptible Instances

Cloud providers sell excess capacity at 70-90% discount as spot (AWS) or preemptible (GCP) instances — but they can be terminated with 2 minutes warning.

**Good uses:**
- Stateless workers pulling from a queue (a terminated worker just loses its current job, which retries)
- Batch processing jobs that checkpoint progress
- CI/CD runners

**Bad uses:**
- Primary database — termination mid-write causes corruption
- Stateful services with no fast failover
- Jobs longer than 2 minutes without checkpointing

```yaml
# Kubernetes: mix of on-demand and spot
nodeGroups:
  - name: on-demand
    instanceType: m5.xlarge
    minSize: 2         # always-on baseline
    maxSize: 10

  - name: spot
    instanceTypes: [m5.xlarge, m5.2xlarge, m4.xlarge]
    spot: true
    minSize: 0
    maxSize: 20        # burst on spot
    taints:
      - key: spot
        effect: NoSchedule
```

## Rightsizing in Practice

Most teams overprovision by 2-4x. Measure first:

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

If your instances run at 10-15% CPU, you're massively overprovisioned. Downsize or pack more workloads per instance.

**Packing workloads (multi-tenancy on a single host):**
```
Instead of: 4 × m5.xlarge (4 vCPU, 16GB each) for 4 services at 20% CPU
Consider:   1 × m5.4xlarge (16 vCPU, 64GB) running all 4 services

Cost: ~4x cheaper, same total resources
Trade-off: one noisy neighbor affects all, less blast radius isolation
```

## Reserved Instance Math

If you can predict your baseline compute need, commit to 1 or 3-year reserved instances:

```
On-demand m5.xlarge: $0.192/hr = $140/month
1-year reserved:     $0.122/hr = $89/month  (35% savings)
3-year reserved:     $0.077/hr = $56/month  (60% savings)

Annual savings on a single instance: $612 (1yr) or $1,008 (3yr)
For 10 instances: $6,120 or $10,080/year
```

Buy reserved instances for your steady-state baseline. Use on-demand or spot for burst above baseline.

## Cost Per Request as a North Star

Instead of tracking raw cloud spend, track **cost per 1000 requests** (CPR):

```
Monthly spend: $5,000
Monthly requests: 50,000,000

CPR = $5,000 / 50,000 (thousands) = $0.10 per 1000 requests
```

As you scale, CPR should decrease (economies of scale). If CPR is flat or rising, your architecture isn't scaling efficiently — investigate query costs, caching, or instance types.

```typescript
// Dashboard metric
const costPerThousandRequests =
  totalMonthlyCostUsd / (totalMonthlyRequests / 1000);
```

Track this weekly. It tells you whether your infrastructure spend is growing proportionally to usage (expected) or faster (a problem).

