---
title: 'The Cost of Redundancy'
subtitle: 'Multi-AZ, N+1, active-active — what each availability pattern actually costs and the math behind choosing one.'
chapter: 4
level: 'intermediate'
readingTime: '9 min'
topics: ['redundancy', 'high availability', 'multi-AZ', 'N+1', 'active-active', 'SLA']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A spare tire in your car: one spare doubles the cost of tires but prevents you being stranded. Two spares and a tow-truck subscription means you never miss a meeting — but now you've spent more on contingency than on the trip. Every availability tier has a price, and the right one depends on what being stuck actually costs you.

</Callout>

## Availability Targets and What They Mean

```
99%    uptime = 87.6 hours/year downtime
99.9%  uptime = 8.76 hours/year downtime
99.99% uptime = 52.6 minutes/year downtime
99.999%uptime = 5.26 minutes/year downtime

Each additional "9" roughly costs 10x more in infrastructure and ops complexity.
```

Before choosing a target, calculate what downtime actually costs your business:

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

Do this math before committing to five nines.

## N+1 Redundancy

The baseline: run N+1 instances where N is what you need to serve load. If one fails, the remaining N handle full traffic.

```
At peak: 100 RPS → need 2 app servers at 50% utilization each
N+1:     3 app servers → if 1 fails, 2 remain at 50% utilization
         Can absorb a failure without degradation

Cost: 3/2 = 1.5x the cost of a non-redundant setup

Availability gain:
  Probability both remaining fail simultaneously (MTTF = 30 days/server):
  P = (1/720)² = 0.000002 ≈ 99.9998% availability
```

N+1 is the default for stateless application servers. It's cheap (50% premium) and handles the most common failure mode (single server crash or restart).

## Multi-AZ (Active-Standby)

Run primary in one availability zone, standby in another. On primary failure, failover to standby — typically 30-60 seconds of downtime.

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

Multi-AZ for your database is usually the right call for production. The 2x cost is justified by protection against AZ-level failures and maintenance windows.

## Active-Active vs Active-Standby

**Active-Standby:** One node handles traffic, standby is idle until needed. Simple but wastes the standby's capacity.

**Active-Active:** Both nodes handle traffic simultaneously. Failover is seamless (no switchover delay) and the standby's capacity is actually used.

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

Active-active makes sense for stateless services (both nodes serve traffic = 2x capacity at the same price as active-standby). For stateful services (databases), it requires handling write conflicts, which adds significant complexity.

## Regional Redundancy (Multi-Region)

Protects against entire region failures (rare but real — AWS us-east-1 has had multi-hour outages).

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

Most companies don't need active-active multi-region. A simpler approach: deploy your stack in a second region but keep it scaled down. On disaster, scale up and update DNS. Cold standby costs 20-30% of a full replica.

## The Cost of Cross-Region Replication

Replicating data between regions is expensive on AWS:

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

## Chaos Budgets: Trading Money for Confidence

Redundancy is an insurance policy. The premium is ongoing infrastructure cost; the payout is surviving failures without downtime. Size your insurance to your actual risk:

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

## Operational Cost of Redundancy

Hardware cost is visible. Operational cost is not:

**Complexity tax:**

- More components to monitor
- More failure modes to test
- More runbooks to write and maintain
- Failover procedures to practice quarterly

**Testing debt:** Untested failover fails at the worst moment. Add chaos testing (chapter in chaos-resilience) and game days. Budget 1-2 engineer-days per quarter for HA testing.

**The simplicity premium:** Many teams run their production on 2 app servers + managed DB + managed Redis. Simple to reason about, fast to fix when something breaks, cheap to operate. Add complexity only when the math above shows it pays off.
