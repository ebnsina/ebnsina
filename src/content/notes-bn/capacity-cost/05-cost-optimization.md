---
title: 'Cost Optimization in Practice'
subtitle: 'Waste খুঁজে বের করা, rightsizing, reserved commitment, আর এমন একটা culture গড়া যা cloud spend-কে engineering work হিসেবে দেখে।'
chapter: 5
level: 'advanced'
readingTime: '10 মিনিট'
topics: ['cost optimization', 'rightsizing', 'reserved instances', 'FinOps', 'cloud cost']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা building-এ energy efficiency: সহজ জয় হলো খালি ঘরের light বন্ধ করা (unused resource)। কঠিন কাজ হলো দেয়াল insulate করা (architecture change)। দুটোই গুরুত্বপূর্ণ, কিন্তু ক্রম হলো: আগে quick win, আপনার আসল usage pattern বোঝার পরে structural improvement।

</Callout>

## টাকা আসলে কোথায় যায়

Optimize করার আগে breakdown বুঝুন। বেশিরভাগ AWS bill কয়েকটা category-তে জমা হয়:

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

সবচেয়ে বড় category আগে optimize করুন। RDS থেকে 30% কমানো পুরো S3 বাদ দেওয়ার চেয়ে বেশি impact ফেলে।

## Quick Win (কয়েক দিনের পরিশ্রম)

**Idle resource শনাক্ত করে delete করুন:**

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

**S3 lifecycle policy:**

```json
{
	"Rules": [
		{
			"Status": "Enabled",
			"Filter": { "Prefix": "logs/" },
			"Transitions": [
				{ "Days": 30, "StorageClass": "STANDARD_IA" },
				{ "Days": 90, "StorageClass": "GLACIER" }
			],
			"Expiration": { "Days": 365 }
		}
	]
}
```

Unpredictable access pattern-এর data-র জন্য **S3 Intelligent-Tiering enable করুন** — এটা automatically object-গুলোকে tier-এর মধ্যে সরিয়ে নেয়।

## Compute Rightsizing

সবচেয়ে বড় sustained জয়: সঠিক instance size চালানো।

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

| CPU avg | Mem avg | Action                                                 |
| ------- | ------- | ------------------------------------------------------ |
| &lt;20% | &lt;40% | Downsize — সম্ভবত 2x overprovisioned                   |
| &lt;40% | &lt;60% | গ্রহণযোগ্য — spike-এর জন্য headroom রাখুন              |
| >60%    | >70%    | Size up বা instance যোগ করুন                           |
| &lt;20% | >80%    | Memory-constrained — memory-optimized-এ rightsize করুন |

```bash
# AWS Compute Optimizer: automated rightsizing recommendations
aws compute-optimizer get-ec2-instance-recommendations \
  --instance-arns arn:aws:ec2:us-east-1:123:instance/i-xxx

# Trusted Advisor: free tier shows obvious over-provisioned instances
aws support describe-trusted-advisor-checks --language en
```

## Reserved Instance Strategy

Stable baseline workload-এ ১ বা ৩ বছরে commit করুন:

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

**Convertible reserved instance** একই family-র মধ্যে instance type বদলাতে দেয় — যদি আপনি এখনো আপনার stack optimize করছেন আর downsize করতে পারেন তবে কাজের।

## Worker-এর জন্য Spot Instance

Background job worker হলো আদর্শ spot workload:

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
		const res = await fetch('http://169.254.169.254/latest/meta-data/spot/instance-action', {
			signal: AbortSignal.timeout(100)
		});
		if (res.ok) {
			logger.warn('Spot termination imminent — initiating shutdown');
			await gracefulShutdown();
		}
	} catch {
		// No termination notice — continue
	}
}, 5_000);
```

## Data Transfer খরচ কমানো

Bill আসার আগ পর্যন্ত data transfer প্রায়ই অদৃশ্য থাকে:

**Static asset-এর জন্য CDN:**

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

app.use(
	compression({
		threshold: 1024, // only compress responses > 1KB
		level: 6 // 1 (fast) to 9 (best compression)
	})
);

// Effect: JSON responses typically compress 70-80%
// 10KB response → ~2KB on wire
// At 10M requests/month and 10KB avg response:
//   Without compression: 100GB egress = $9
//   With compression:    20GB egress  = $1.80
```

**Inter-service traffic একই AZ-তে রাখুন:**

```
Same AZ data transfer: free
Cross-AZ data transfer: $0.01/GB (each direction)

At 100GB/day cross-AZ:
  Monthly cost: $60 — invisible but real

Fix: deploy services that talk frequently in the same AZ,
     or use internal load balancers with AZ affinity
```

## Cost Culture গড়া

Technical optimization তখনই কাজ করে যখন team আসলে সেটা করে। Process গুরুত্বপূর্ণ:

**Weekly cost review:**

```
15 minutes/week:
  - Did cost grow? By how much vs traffic?
  - Which service grew fastest?
  - Any anomalies (unexpected spike)?
  - One action item for the week
```

**Cost per feature / per team:**
Team আর feature অনুযায়ী resource tag করুন। তখন প্রতিটা team তাদের নিজের spend দেখতে পায়:

```bash
# Tag everything at creation
aws ec2 run-instances ... \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=team,Value=platform},{Key=feature,Value=search}]'

# Cost Explorer report by tag
aws ce get-cost-and-usage \
  --group-by Type=TAG,Key=team
```

**Bill আসার আগে alert:**

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

Budget-এর 80%-এ alert দিন — সীমা পার হওয়ার পরে নয়, আগেই তদন্ত করার সময়।

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

1-7 করার আগে architecture change-এ ঝাঁপ দেবেন না। বেশিরভাগ team-এর সহজ category-গুলোতেই উল্লেখযোগ্য waste থাকে।
