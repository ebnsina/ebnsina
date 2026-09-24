---
title: 'Disaster Recovery & Backups'
subtitle: 'RTO, RPO, multi-region failover, আর সেই restore drill যেটা প্রমাণ করে আপনার backup আসলেই আছে।'
chapter: 9
level: 'advanced'
readingTime: '16 মিনিট'
topics: ['disaster recovery', 'DR', 'RTO', 'RPO', 'backups', 'failover']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

পদ্মার একটা জরুরি খেয়াঘাটে ফাতিমার ফেরি কোম্পানি হাজার হাজার যাত্রী পার করে। মূল ফেরিটা যদি হঠাৎ ইঞ্জিন বিকল হয়ে মাঝনদীতে থেমে যায়, পুরো পারাপার বন্ধ — তাই ফাতিমা ঘাটেই একটা পুরো তেল-ভরা বাড়তি ফেরি আর একটা প্রশিক্ষিত standby ক্রু সবসময় প্রস্তুত রাখেন। শুধু রাখাই যথেষ্ট নয় জেনে, তিনি প্রতি মাসে একবার সত্যিকারের drill চালান — ঘোষণা দিয়ে সব যাত্রীকে মূল ফেরি থেকে বাড়তি ফেরিতে সরিয়ে দেন, ঘড়ি ধরে দেখেন হস্তান্তরটা প্রতিশ্রুত সময়ের মধ্যে আসলেই হয় কিনা।

ফাতিমা দুটো সংখ্যাও মুখস্থ রাখেন। এক, বিপর্যয়ের পর কত দ্রুত আবার পারাপার শুরু করতেই হবে — ধরুন পনেরো মিনিট, এর বেশি হলে ঘাটে যাত্রীর ভিড় সামলানো অসম্ভব। দুই, শেষ যেবার টিকিটের হিসাবের কপি নেওয়া হয়েছিল তার পর থেকে সর্বোচ্চ কত টিকিট-রেকর্ড হারানো গ্রহণযোগ্য। সিনা যখন নতুন হিসাবরক্ষক হিসেবে যোগ দেন, খোয়ারিজমি তাকে এই দুটো সংখ্যা আর মাসিক drill-এর রুটিন বুঝিয়ে দেন — যাতে সত্যিকারের দুর্যোগের দিনে কাউকে হাতড়াতে না হয়।

গল্পটাই আসলে **disaster recovery**। ঘাটে প্রস্তুত বাড়তি ফেরি আর standby ক্রু হলো failover-এর জন্য একটা tested standby/backup; প্রতি মাসের switch-over drill হলো failover-টা নিয়মিত drill করা — যাতে recovery সত্যিই সময়মতো কাজ করে, শুধু কাগজে-কলমে নয়। কত দ্রুত পারাপার ফেরাতে হবে সেটাই **RTO**, আর কত সাম্প্রতিক রেকর্ড হারানো চলে সেটাই **RPO**। বাস্তবে multi-region failover-ও ঠিক এভাবেই চলে — Netflix থেকে শুরু করে বড় ব্যাংক পর্যন্ত সবাই standby region প্রস্তুত রাখে, RTO/RPO ঠিক করে, আর নিয়মিত drill চালিয়ে প্রমাণ করে backup আর failover আসলেই কাজ করবে।

## RTO আর RPO — দুটো সংখ্যা

প্রতিটা disaster recovery সিদ্ধান্ত দুটো সংখ্যার সাথে বাঁধা। এগুলো মুখস্থ করুন।

```
RTO — Recovery Time Objective
      How long can the system be DOWN after a disaster?
      "We must be back online within 30 minutes."

RPO — Recovery Point Objective
      How much DATA can we lose?
      "We must not lose more than 5 minutes of writes."
```

সংখ্যা যত কম, খরচ exponentially তত বেশি।

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

business need মেটায় এমন সবচেয়ে সস্তা tier বেছে নিন। **T0-এর দিকে যাবেন না শুধু কারণ সেটা শুনতে চিত্তাকর্ষক** — খরচটা বাস্তব।

<Callout type="info">

**বাস্তব জগতের উদাহরণ**

একটা jewelry store-এর safe বনাম একটা bank vault। store insurance থেকে কয়েক দিনে আবার গড়ে তুলতে পারে (RTO=72h, সস্তা safe)। একটা central bank 5 মিনিটের transaction হারাতে পারে না (RTO≈0, RPO≈0, multi-region replication, বিলিয়ন ডলার খরচ)। একই সমস্যা, খরচে চার order of magnitude পার্থক্য।

</Callout>

## backup hierarchy

Backup একটা জিনিস নয়। একটা বাস্তব strategy তিনটা layer ব্যবহার করে:

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

Snapshot fail করে যখন storage backend corrupt হয়। Logical backup fail করে যদি schema migration ভাঙা থাকে। Archive fail করে যদি আপনার data-টা গত সপ্তাহের চেয়ে সাম্প্রতিক লাগত। আপনার তিনটাই লাগবে।

## 3-2-1 নিয়ম

```
3 copies of your data
2 different storage media (or providers)
1 offsite copy

Modern cloud version:
  3 copies (primary, replica, backup)
  2 providers (e.g., AWS + GCP)
  1 in cold archive (Glacier or equivalent)
```

"two providers" নিয়মটাই আপনাকে region-wide cloud provider outage থেকে বাঁচায় (যেটা গত 5 বছরে AWS, GCP, আর Azure-এর ঘটেছে)।

## বাস্তব Terraform-এ backup automation

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

শেষ alarm-টা খেয়াল করুন। **একটা নীরব backup failure কোনো backup না থাকার চেয়েও খারাপ** — আপনার একটা মিথ্যা নিরাপত্তার অনুভূতি থাকে। সবসময় backup freshness-এর উপর alarm করুন, শুধু success-এর উপর নয়।

## restore drill (আসল test)

যে backup কখনো restore করা হয়নি, সেটা backup নয়। সেটা byte-এর একটা আশাবাদী সংগ্রহ।

বাস্তব team প্রতি quarter-এ একটা restore drill চালায়। drill মানে "backup file আছে কিনা যাচাই করা" নয়। এটা হলো:

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

script-টা elapsed time মাপে। সেই মাপা সময়টাই এই scenario-র জন্য আপনার **আসল** RTO, আপনার আকাঙ্ক্ষিত RTO নয়। আপনি যদি দাবি করেন RTO=30min আর drill-এ 4 ঘণ্টা লাগে, তাহলে documented RTO ভুল — documentation ঠিক করুন বা recovery procedure ঠিক করুন।

<Callout type="warning">

**যে quarterly drill কখনো চালানো হয়নি সেটা একটা কল্পকাহিনি।** drill-টা SRE team-এর quarterly calendar-এ একটা hard deadline সহ রাখুন। ব্যর্থ drill একটা postmortem-grade investigation তৈরি করবে, reschedule হবে না।

</Callout>

## Multi-region failover (architecture)

Active-passive হলো সবচেয়ে সাধারণ production multi-region pattern। মূল component-গুলো:

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

failover playbook (বাস্তব, সাজানো, tested):

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

এই runbook-এর প্রতিটা command একটা drill-এর সময় চালানো হয়েছে। team জানে এটা কাজ করে। তারা একটা আসল disaster-এর সময় improvise করছে না।

## বাস্তব failover-এ যা ভুল হয়

public postmortem থেকে বাস্তব জগতের গল্প:

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

এগুলোর প্রতিটাই একটা পুঙ্খানুপুঙ্খ drill দিয়ে প্রতিরোধযোগ্য। এগুলো শুধু planning দিয়ে প্রতিরোধযোগ্য নয়।

## Backup security (ransomware সমস্যা)

সাম্প্রতিক বছরগুলোতে (2024–2026), একাধিক ransomware attack বিশেষভাবে আগে backup system-কে target করেছে, তারপর production encrypt করেছে। আধুনিক backup hygiene:

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

শুধু "separate credentials" নিয়মটাই বেশিরভাগ ransomware playbook হারিয়ে দেয়।

## আপডেটেড থাকুন

- [AWS Disaster Recovery whitepaper](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-workloads-on-aws.html) — RTO/RPO tier ব্যাখ্যা করা
- [Google SRE Book — Data Integrity](https://sre.google/sre-book/data-integrity/) — backup theory ঠিকমতো করা
- [PostgreSQL backup docs](https://www.postgresql.org/docs/current/backup.html) — version-current
- [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html) — immutable backup primitive

## মূল কথাগুলো

1. **RTO আর RPO-ই একমাত্র দুটো DR সংখ্যা** — need মেটায় এমন সবচেয়ে সস্তা tier বেছে নিন
2. **3-2-1 backup নিয়ম + immutable + air-gapped** — ransomware-এর বিরুদ্ধে প্রতিরক্ষা
3. **untested backup আসলে backup নয়** — quarterly restore drill বাধ্যতামূলক
4. **DR region-কে primary load-এর 100% সামলাতে হবে** — 30% নয়
5. **failover runbook-এর প্রতিটা step একটা drill-এ চালানো হয়েছে** — improvisation-ই হলো failure mode
