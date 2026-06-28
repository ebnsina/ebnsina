---
title: 'RTO, RPO, and What They Actually Mean'
subtitle: 'Two numbers that define your recovery requirements — and why getting them wrong makes your DR plan useless.'
chapter: 1
level: 'beginner'
readingTime: '7 min'
topics: ['RTO', 'RPO', 'disaster recovery', 'SLA', 'business continuity']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Two questions after a house fire: "How long until we're back in a home?" (RTO — Recovery Time Objective) and "How much stuff did we lose?" (RPO — Recovery Point Objective). A family that backs up photos to the cloud daily has a 24-hour RPO for photos. A family with a hotel booked in 2 hours has a 2-hour RTO. Disaster recovery planning is answering both questions before the fire.

</Callout>

## The Two Numbers

**RTO (Recovery Time Objective):** How long can your system be down before the business suffers unacceptable harm? The maximum allowable downtime from incident to recovery.

**RPO (Recovery Point Objective):** How much data can you lose? The maximum acceptable data loss measured in time — if your RPO is 1 hour, you can afford to lose at most 1 hour of transactions.

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

These are objectives — targets you design your system to meet. They're not automatic guarantees.

## Deriving RTO and RPO from Business Requirements

Don't pick numbers arbitrarily. Work backwards from business impact:

**RTO calculation:**

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

**RPO calculation:**

```
What is the cost of losing N hours of data?
  Losing 1 hour of orders: ~500 orders × $80 avg = $40,000 unrecoverable
  Losing 5 minutes of orders: ~40 orders = $3,200

  Cost to achieve 5-minute RPO (continuous WAL archival): $200/month
  → 5-minute RPO clearly justified; 1-hour RPO is unacceptable for orders
```

Different parts of your system have different RTO/RPO requirements:

| System         | RTO                    | RPO             | Reason              |
| -------------- | ---------------------- | --------------- | ------------------- |
| Order database | 1 hour                 | 5 minutes       | Revenue impact      |
| User accounts  | 4 hours                | 1 hour          | Login disruption    |
| Analytics DB   | 24 hours               | 24 hours        | Non-operational     |
| Email logs     | 72 hours               | 24 hours        | Compliance, not ops |
| CDN assets     | Minutes (CDN failover) | N/A (no writes) | —                   |

Design and budget per system. Don't apply the tightest requirement uniformly.

## Recovery Tiers

RTO/RPO targets map to infrastructure tiers with different costs:

**Tier 1: Cold Standby (RTO: hours–days, RPO: hours)**

- Backups stored in S3/object storage
- No hot infrastructure waiting
- Recovery: provision new server, restore from backup, catch up
- Cost: storage only (~$20/month for 100GB of daily backups)

**Tier 2: Warm Standby (RTO: 15 min–1 hour, RPO: minutes)**

- Backup infrastructure running at reduced scale
- Replication keeping it near-current
- Recovery: scale up + promote replica + redirect traffic
- Cost: 30-50% of full production cost

**Tier 3: Hot Standby (RTO: seconds–minutes, RPO: seconds)**

- Full duplicate production environment
- Synchronous replication
- Recovery: DNS failover or load balancer redirect
- Cost: ~100% additional (2x total infrastructure cost)

**Tier 4: Active-Active (RTO: ~0, RPO: ~0)**

- Traffic distributed across multiple sites simultaneously
- Automatic failover with no human intervention
- Cost: 2x+ infrastructure + significant engineering complexity

Most applications live at Tier 1–2. Only systems where any downtime is catastrophic (financial trading, healthcare systems, payment processing) justify Tier 3–4.

## The Plan Is Worthless Without Testing

RTO is a commitment, not a hope. The only way to know if you can actually recover in 1 hour is to practice recovering in 1 hour — regularly, under realistic conditions.

**Types of recovery tests:**

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

If you've never actually restored from backup, your RPO is theoretical. If you've never timed a full recovery, your RTO is a guess.

## Common Failure Modes in DR Plans

**Backup exists, restore never tested:** Backups are corrupt, incomplete, or require software that's no longer installed. Discovered during actual disaster.

**RTO set by wishful thinking:** "We can restore in 1 hour" because that sounds good, not because anyone has measured it. Actual restore time: 6 hours.

**RPO mismatch with backup schedule:** Claiming 4-hour RPO with daily backups. If disaster strikes at 11pm, you've lost 23 hours of data.

**Single region, single AZ backups:** Backups stored in the same location as the primary. A region failure destroys both.

**No runbook, knowledge in one person's head:** The person who knows the restore procedure is on vacation. Or left the company.

**Document the actual measured RTO from your last drill.** If it was 4 hours and your SLA says 2 hours, you have a gap to close — not a plan to point to.
