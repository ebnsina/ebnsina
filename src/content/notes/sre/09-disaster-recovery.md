---
title: 'Disaster Recovery & Backups'
subtitle: 'RTO, RPO, multi-region failover, and the restore drill that proves your backups exist.'
chapter: 9
level: 'advanced'
readingTime: '16 min'
topics: ['disaster recovery', 'DR', 'RTO', 'RPO', 'backups', 'failover']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## RTO and RPO — the two numbers

Every disaster recovery decision is anchored to two numbers. Memorize them.

```
RTO — Recovery Time Objective
      How long can the system be DOWN after a disaster?
      "We must be back online within 30 minutes."

RPO — Recovery Point Objective
      How much DATA can we lose?
      "We must not lose more than 5 minutes of writes."
```

Lower numbers cost exponentially more money.

```
Tier   RTO         RPO         Cost          Architecture
-------|-----------|-----------|--------------|-----------------------------
T0     0           0           $$$$$         Active-active multi-region,
                                             synchronous replication
T1     <5 min      <1 min      $$$$          Active-passive multi-region,
                                             async replication, hot standby
T2     <1 hour     <15 min     $$$           Single region, hot DB replica,
                                             warm app servers
T3     <4 hours    <1 hour     $$            Single region, cold standby,
                                             snapshot-based recovery
T4     <24 hours   <24 hours   $             Backup + restore from S3,
                                             rebuild from scratch
```

Pick the cheapest tier that meets the business need. **Do not aim for T0 because it sounds impressive** — the cost is real.

<Callout type="info">

**Real-World Analogy**

A jewelry store's safe vs a bank vault. The store can rebuild from insurance in days (RTO=72h, cheap safe). A central bank cannot lose 5 minutes of transactions (RTO≈0, RPO≈0, multi-region replication, billions in spend). Same problem, four orders of magnitude in cost.

</Callout>

## The backup hierarchy

Backups are not a single thing. A real strategy uses three layers:

```
1. Snapshots (hourly, retain 7 days)
   Fast restore. Full copy of data at point-in-time.
   Cheap on cloud-native storage (EBS, GCP PD).

2. Logical backups (daily, retain 30 days)
   pg_dump / mongodump / etc. Cross-region.
   Tests data is logically consistent. Survives storage corruption.

3. Cold archive (weekly, retain 1 year+)
   S3 Glacier / GCS Archive / Azure Cool.
   Compliance + ransomware insurance. Restore is slow but cheap.
```

Snapshots fail when the storage backend is corrupted. Logical backups fail if the schema migration is broken. Archives fail if you needed the data more recently than last week. You need all three.

## The 3-2-1 rule

```
3 copies of your data
2 different storage media (or providers)
1 offsite copy

Modern cloud version:
  3 copies (primary, replica, backup)
  2 providers (e.g., AWS + GCP)
  1 in cold archive (Glacier or equivalent)
```

The "two providers" rule is what saves you from a region-wide cloud provider outage (which has happened to AWS, GCP, and Azure within the last 5 years).

## Backup automation in real Terraform

```hcl
# terraform/backups/postgres.tf
# A real production-grade backup setup

resource "aws_db_instance" "primary" {
  identifier              = "checkout-primary"
  engine                  = "postgres"
  engine_version          = "16.1"
  instance_class          = "db.r6g.xlarge"
  allocated_storage       = 500

  # Layer 1: automated snapshots
  backup_retention_period = 7        # 7 days of automated snapshots
  backup_window           = "03:00-05:00"
  copy_tags_to_snapshot   = true

  # Layer 2: cross-region replica for fast failover
  multi_az = true
}

# Layer 2: read replica in another region (warm standby)
resource "aws_db_instance" "dr_replica" {
  provider                = aws.dr_region
  identifier              = "checkout-dr"
  replicate_source_db     = aws_db_instance.primary.arn
  instance_class          = "db.r6g.xlarge"
  backup_retention_period = 7
}

# Layer 3: scheduled logical backup to cross-cloud storage
resource "aws_lambda_function" "logical_backup" {
  function_name = "checkout-logical-backup"
  role          = aws_iam_role.backup.arn
  handler       = "main.handler"
  runtime       = "python3.12"
  filename      = "logical_backup.zip"
  timeout       = 900

  environment {
    variables = {
      DB_HOST     = aws_db_instance.primary.address
      DB_NAME     = "checkout"
      GCS_BUCKET  = "gs://my-cross-cloud-backups"
      RETENTION_DAYS = "365"
    }
  }
}

resource "aws_cloudwatch_event_rule" "daily" {
  name                = "checkout-logical-backup-daily"
  schedule_expression = "cron(0 4 * * ? *)"
}

resource "aws_cloudwatch_event_target" "lambda" {
  rule = aws_cloudwatch_event_rule.daily.name
  arn  = aws_lambda_function.logical_backup.arn
}

# Critical: alert if backup hasn't succeeded in >36h
resource "aws_cloudwatch_metric_alarm" "backup_age" {
  alarm_name          = "checkout-backup-stale"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "TimeSinceLastBackup"
  namespace           = "Custom/Backups"
  period              = 3600
  statistic           = "Maximum"
  threshold           = 36 * 3600  # 36 hours in seconds
  alarm_actions       = [aws_sns_topic.pagerduty.arn]
}
```

Note the last alarm. **A silent backup failure is worse than no backup at all** — you have a false sense of safety. Always alarm on backup freshness, not just success.

## The restore drill (the actual test)

A backup that has never been restored is not a backup. It is a hopeful collection of bytes.

Real teams run a quarterly restore drill. The drill is not "verify the backup file exists." It is:

```bash
#!/usr/bin/env bash
# bin/dr-drill-postgres
# Quarterly restore drill — must complete end-to-end

set -euo pipefail

DRILL_ID=$(date +%Y%m%d-%H%M)
DRILL_DB="checkout-drill-${DRILL_ID}"
START_TIME=$(date +%s)

echo "[1/6] Provisioning fresh DB instance..."
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "$DRILL_DB" \
  --db-snapshot-identifier "$(latest_snapshot_id)" \
  --db-instance-class db.r6g.large

echo "[2/6] Waiting for instance to become available..."
aws rds wait db-instance-available --db-instance-identifier "$DRILL_DB"

echo "[3/6] Running schema validation..."
DRILL_HOST=$(aws rds describe-db-instances \
  --db-instance-identifier "$DRILL_DB" \
  --query 'DBInstances[0].Endpoint.Address' --output text)

psql -h "$DRILL_HOST" -d checkout -c "\dt" > /tmp/drill-schema.txt
diff /tmp/drill-schema.txt expected-schema.txt

echo "[4/6] Validating row counts..."
psql -h "$DRILL_HOST" -d checkout -c "
  SELECT 'orders', COUNT(*) FROM orders
  UNION ALL
  SELECT 'users', COUNT(*) FROM users;
" > /tmp/drill-counts.txt

echo "[5/6] Running smoke test queries..."
psql -h "$DRILL_HOST" -d checkout -f sql/smoke-tests.sql

echo "[6/6] Tearing down drill instance..."
aws rds delete-db-instance \
  --db-instance-identifier "$DRILL_DB" \
  --skip-final-snapshot

ELAPSED=$(( $(date +%s) - START_TIME ))
echo "DRILL COMPLETE: ${ELAPSED}s elapsed"

# Update DR drill metric
curl -X POST https://prometheus-pushgateway/metrics/job/dr_drill \
  --data "dr_drill_last_seconds $(date +%s)" \
  --data "dr_drill_last_duration_seconds ${ELAPSED}"
```

The script measures elapsed time. That measured time is your **actual** RTO for this scenario, not your aspirational one. If you claim RTO=30min and the drill took 4 hours, the documented RTO is wrong — fix the documentation or fix the recovery procedure.

<Callout type="warning">

**A quarterly drill that has never been run is a fiction.** Put the drill on the SRE team's quarterly calendar with a hard deadline. Failed drills should generate a postmortem-grade investigation, not get rescheduled.

</Callout>

## Multi-region failover (the architecture)

Active-passive is the most common production multi-region pattern. The key components:

```
┌─────────────────────────────────────────────────────────────┐
│                   GLOBAL DNS (Route53 / Cloudflare)         │
│              Health-checked weighted routing                │
└──────────────────────┬──────────────────────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       │                               │
  ┌────▼────┐  PRIMARY            ┌────▼────┐  STANDBY
  │ us-east │  100% traffic       │ us-west │  0% traffic
  ├─────────┤                     ├─────────┤
  │ App tier│ ←── async replication ──→ │ App tier│
  │ DB rw   │ ─── replication log ───→ │ DB ro   │
  │ Cache   │                     │ Cache   │
  └─────────┘                     └─────────┘
```

The failover playbook (real, ordered, tested):

````markdown
# DR Failover Runbook: us-east-1 → us-west-2

## Pre-flight checks (must all be GREEN)

1. us-west-2 DB replica lag < 5 seconds
2. us-west-2 app tier health check passing
3. us-west-2 cache warm (hit rate > 60%)
4. PagerDuty: failover-active maintenance window scheduled

## Failover (target: 5 minutes total)

### Step 1: Promote DR DB (90s)

```bash
aws rds promote-read-replica \
  --db-instance-identifier checkout-dr \
  --backup-retention-period 7 \
  --region us-west-2
```
````

### Step 2: Update app tier config (30s)

```bash
kubectl --context us-west-2 set env deployment/checkout \
  DB_HOST=checkout-dr.us-west-2.rds.amazonaws.com \
  REGION_PRIMARY=true
```

### Step 3: Shift DNS (30s + propagation)

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234 \
  --change-batch file://failover-dns.json
```

### Step 4: Verify (60s)

- Hit /healthz from external probe
- Check error rate dashboard
- Confirm new orders flowing in us-west-2

### Step 5: Update status page

"Operating from us-west-2 (DR region). All systems nominal."

## Rollback

DR back to primary requires a new replica setup (us-east-1 ←─ us-west-2)
and a planned switchover window. Do NOT rush back to us-east-1 — verify
us-east-1 is genuinely healthy first.

````

Every command in this runbook has been run during a drill. The team knows it works. They are not improvising during a real disaster.

## What goes wrong in real failovers

Real-world stories from public postmortems:

```typescript
const realIncidents = {
  staleDNS: {
    company: "Multiple",
    issue: "DNS TTL was 24h. Browsers and CDN edges still hit dead region.",
    fix: "TTL=60s for failover-eligible records",
  },
  asymmetricCapacity: {
    company: "GitLab 2017",
    issue: "DR region was 30% of primary capacity. Users hit failover, " +
           "DR collapsed under load, situation got worse.",
    fix: "DR must be sized to handle 100% of primary load",
  },
  certExpiry: {
    company: "Multiple",
    issue: "TLS cert in DR region expired during the failover window. " +
           "Discovered only when traffic shifted.",
    fix: "Cert renewal job runs in BOTH regions; alert on age in BOTH",
  },
  splitBrain: {
    company: "Various DBs",
    issue: "Primary was actually still up; promoting DR caused two writers. " +
           "Data conflicts requiring manual reconciliation.",
    fix: "Force-stop primary BEFORE promoting DR. Use STONITH / fencing.",
  },
};
````

Every one of these is preventable with a thorough drill. They are not preventable with planning alone.

## Backup security (the ransomware problem)

In recent years (2024–2026), multiple ransomware attacks specifically targeted backup systems first, then encrypted production. Modern backup hygiene:

```
1. Immutable backups
   S3 Object Lock with COMPLIANCE mode for cold archives.
   Even root cannot delete. Cost: you pay for full retention period.

2. Separate credentials
   Backup IAM user has WRITE-ONLY to backup bucket.
   Restore IAM user has READ-ONLY and is in a different account.
   Production IAM cannot touch either.

3. Air-gapped offsite
   Weekly export to a different cloud provider (or on-prem),
   account with no cross-cloud trust to production.

4. Tested restore from offsite
   Quarterly drill includes restore from the OFFSITE copy,
   not just the in-cloud snapshot.
```

The "separate credentials" rule alone defeats most ransomware playbooks.

## Stay current

- [AWS Disaster Recovery whitepaper](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-workloads-on-aws.html) — RTO/RPO tiers explained
- [Google SRE Book — Data Integrity](https://sre.google/sre-book/data-integrity/) — backup theory done right
- [PostgreSQL backup docs](https://www.postgresql.org/docs/current/backup.html) — version-current
- [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html) — immutable backup primitive

## Key Takeaways

1. **RTO and RPO are the only two DR numbers** — pick the cheapest tier that meets need
2. **3-2-1 backup rule + immutable + air-gapped** — defense against ransomware
3. **Untested backups are not backups** — quarterly restore drills are mandatory
4. **DR region must handle 100% of primary load** — not 30%
5. **Every step in the failover runbook has been executed in a drill** — improvisation is the failure mode
