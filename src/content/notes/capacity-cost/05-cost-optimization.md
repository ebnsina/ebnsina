---
title: "Cost Optimization in Practice"
subtitle: "Finding waste, rightsizing, reserved commitments, and building a culture that treats cloud spend as engineering work."
chapter: 5
level: "advanced"
readingTime: "10 min"
topics: ["cost optimization", "rightsizing", "reserved instances", "FinOps", "cloud cost"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Energy efficiency in a building: the easy wins are turning off lights in empty rooms (unused resources). The harder work is insulating the walls (architecture changes). Both matter, but the order is: quick wins first, structural improvements after you understand your actual usage patterns.

</Callout>

## Where the Money Actually Goes

Before optimizing, understand the breakdown. Most AWS bills cluster in a few categories:

```bash
# AWS Cost Explorer: service breakdown
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-02-01 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE

# Typical breakdown for a mid-size web app:
# 35% — RDS / database
# 25% — EC2 / compute
# 20% — data transfer
# 10% — ElastiCache / Redis
#  5% — S3
#  5% — other (WAF, CloudFront, load balancers)
```

Optimize largest categories first. Shaving 30% off RDS has more impact than eliminating S3 entirely.

## Quick Wins (Days of Effort)

**Identify and delete idle resources:**
```bash
# EC2 instances with <5% CPU over 14 days
aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,InstanceType]'
# Then check CloudWatch CPU for each — flag anything consistently low

# Unattached EBS volumes (paying for storage no one is using)
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[*].[VolumeId,Size,CreateTime]'

# Unused load balancers (no traffic)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name RequestCount \
  --statistics Sum \
  # check for zeros

# Old snapshots (EBS snapshots accumulate and are rarely cleaned)
aws ec2 describe-snapshots --owner-ids self \
  --query 'Snapshots[?StartTime<=`2023-01-01`].[SnapshotId,VolumeSize,StartTime]'
```

**S3 lifecycle policies:**
```json
{
  "Rules": [{
    "Status": "Enabled",
    "Filter": { "Prefix": "logs/" },
    "Transitions": [
      { "Days": 30, "StorageClass": "STANDARD_IA" },
      { "Days": 90, "StorageClass": "GLACIER" }
    ],
    "Expiration": { "Days": 365 }
  }]
}
```

**Enable S3 Intelligent-Tiering** for data with unpredictable access patterns — it automatically moves objects between tiers.

## Rightsizing Compute

The biggest sustained win: running the right instance size.

```bash
# Collect 30 days of CPU + memory data
# (requires CloudWatch agent for memory)
aws cloudwatch get-metric-statistics \
  --namespace CWAgent \
  --metric-name mem_used_percent \
  --dimensions Name=InstanceId,Value=i-xxx \
  --period 86400 \
  --statistics Average Maximum \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-02-01T00:00:00Z
```

**Decision matrix:**

| CPU avg | Mem avg | Action |
|---------|---------|--------|
| &lt;20% | &lt;40% | Downsize — likely 2x overprovisioned |
| &lt;40% | &lt;60% | Acceptable — leave headroom for spikes |
| >60% | >70% | Size up or add instances |
| &lt;20% | >80% | Memory-constrained — rightsize to memory-optimized |

```bash
# AWS Compute Optimizer: automated rightsizing recommendations
aws compute-optimizer get-ec2-instance-recommendations \
  --instance-arns arn:aws:ec2:us-east-1:123:instance/i-xxx

# Trusted Advisor: free tier shows obvious over-provisioned instances
aws support describe-trusted-advisor-checks --language en
```

## Reserved Instance Strategy

Commit to 1 or 3 years on stable baseline workloads:

```
Procedure:
1. Look at your last 90 days of compute use
2. Identify the floor (minimum running instances) — this is your commit
3. Buy reserved capacity for that floor
4. Run on-demand or spot above it

Example:
  Always running: 4 app servers, 1 primary DB, 1 Redis
  Burst to: 8 app servers at peak

  Buy reserved: 4 m5.xlarge (app), 1 db.m5.large (RDS), 1 cache.m5.large
  Run on-demand or spot: the burst 4 app servers

  Annual savings (vs all on-demand):
    4 × m5.xlarge 1yr reserved: saves ~$1,200/year
    RDS reserved: saves ~$700/year
    Total: ~$1,900/year on modest reservation
```

**Convertible reserved instances** allow changing instance type within the same family — useful if you're still optimizing your stack and might downsize.

## Spot Instances for Workers

Background job workers are the ideal spot workload:

```typescript
// Workers pull from queue — preemption just loses the current job (retried)
// Save 60-80% on worker compute

// In your queue worker startup:
process.on('SIGTERM', async () => {
  // Spot instance getting terminated — graceful shutdown
  logger.info('Spot instance termination notice');
  await worker.pause();
  await worker.close(); // waits for current job to finish
  process.exit(0);
});

// Check for termination notice (2-minute warning from AWS)
setInterval(async () => {
  try {
    const res = await fetch(
      'http://169.254.169.254/latest/meta-data/spot/instance-action',
      { signal: AbortSignal.timeout(100) },
    );
    if (res.ok) {
      logger.warn('Spot termination imminent — initiating shutdown');
      await gracefulShutdown();
    }
  } catch {
    // No termination notice — continue
  }
}, 5_000);
```

## Data Transfer Cost Reduction

Data transfer is often invisible until the bill arrives:

**CDN for static assets:**
```
Without CDN: every asset request hits your origin server
  Cost: $0.09/GB egress from AWS

With CloudFront:
  First 1TB/month: free (with CloudFront)
  After: $0.0085/GB (10x cheaper than raw egress)
  Bonus: reduced origin load
```

**Compression:**
```typescript
import compression from 'compression';

app.use(compression({
  threshold: 1024, // only compress responses > 1KB
  level: 6,        // 1 (fast) to 9 (best compression)
}));

// Effect: JSON responses typically compress 70-80%
// 10KB response → ~2KB on wire
// At 10M requests/month and 10KB avg response:
//   Without compression: 100GB egress = $9
//   With compression:    20GB egress  = $1.80
```

**Keep inter-service traffic in the same AZ:**
```
Same AZ data transfer: free
Cross-AZ data transfer: $0.01/GB (each direction)

At 100GB/day cross-AZ:
  Monthly cost: $60 — invisible but real

Fix: deploy services that talk frequently in the same AZ,
     or use internal load balancers with AZ affinity
```

## Building a Cost Culture

Technical optimization only works if the team actually does it. Process matters:

**Weekly cost review:**
```
15 minutes/week:
  - Did cost grow? By how much vs traffic?
  - Which service grew fastest?
  - Any anomalies (unexpected spike)?
  - One action item for the week
```

**Cost per feature / per team:**
Tag resources by team and feature. Then each team sees their own spend:
```bash
# Tag everything at creation
aws ec2 run-instances ... \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=team,Value=platform},{Key=feature,Value=search}]'

# Cost Explorer report by tag
aws ce get-cost-and-usage \
  --group-by Type=TAG,Key=team
```

**Alerts before bills:**
```bash
# Alert when spend exceeds threshold
aws budgets create-budget \
  --account-id 123456789012 \
  --budget '{
    "BudgetName": "monthly-compute",
    "BudgetLimit": {"Amount": "3000", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80
    },
    "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "infra@yourapp.com"}]
  }]'
```

Alert at 80% of budget — time to investigate before going over, not after.

## Optimization Priority Order

```
1. Delete idle resources (hours of work, immediate savings)
2. S3 lifecycle policies (set and forget)
3. Rightsize obviously over-provisioned instances
4. Buy reserved instances for stable baseline
5. Move workers to spot
6. Add CloudFront for static assets + compression
7. Audit cross-AZ data transfer
8. Partition and archive cold data
9. Consolidate small services (pack workloads per instance)
10. Architecture changes (harder, higher ceiling)
```

Don't jump to architecture changes before doing 1-7. Most teams have significant waste in the easy categories.

