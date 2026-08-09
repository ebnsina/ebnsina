---
title: 'Restore Drills'
subtitle: 'কীভাবে আপনার ব্যাকআপ আসলেই টেস্ট করবেন — runbook স্ট্রাকচার, কী যাচাই করবেন, আর কীভাবে drill-কে নিয়মিত প্র্যাকটিসে পরিণত করবেন।'
chapter: 3
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['restore drills', 'runbooks', 'backup verification', 'PITR', 'disaster simulation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব উদাহরণ**

একটা fire extinguisher যা কখনো টেস্ট করা হয়নি: দেখতে প্রস্তুত মনে হয়, দেয়ালে লাগানো, আর হয়তো কাজও করবে — কিন্তু দরকার পড়ার মুহূর্ত পর্যন্ত আপনি আসলে জানেন না। Untested ব্যাকআপও একই। যে ব্যাকআপ আপনি কখনো restore করেননি সেটা এমন ব্যাকআপ যা আপনার নেই।

</Callout>

## গল্পে বুঝি

ইবনে সিনা বহু বছর ধরে নিয়ম করে গাড়ির ডিকিতে একটা স্পেয়ার টায়ার নিয়ে ঘোরেন। টায়ারটা ওখানেই আছে, দেখতেও ঠিকঠাক — তাই তিনি নিশ্চিন্ত। কিন্তু একটাবারের জন্যও কখনো সেটা নামিয়ে হাওয়া চেক করেননি, জ্যাকটা আছে কি না দেখেননি। এক রাতে নির্জন রাস্তায় হঠাৎ চাকা পাংচার। এতদিনের বয়ে বেড়ানো স্পেয়ারটা তিনি বের করলেন — আর দেখলেন সেটা নিজেই চুপসানো, আর জ্যাকটাই ডিকিতে নেই। যে জিনিসের ভরসায় এতদিন নিশ্চিন্ত ছিলেন, দরকারের মুহূর্তে সেটা কাজেই এল না।

ঠিক এই সময়েই একই রাস্তা দিয়ে যাচ্ছিলেন তাঁর প্রতিবেশী আল-খোয়ারিজমি। তিনি অভ্যাসবশত প্রতি কয়েক মাস পরপর নিজের স্পেয়ার নামিয়ে ফিট করে দেখেন, হাওয়া মাপেন, জ্যাক-রেঞ্চ সব ঠিক আছে কি না যাচাই করেন। ফলে চাকা লাগানো তাঁর মুখস্থ — দশ মিনিটে ইবনে সিনার গাড়ির চাকা বদলে দিলেন। পার্থক্যটা টায়ার কেনায় নয়, টায়ার টেস্ট করায়।

এই গল্পটাই আসলে **restore drill**। ডিকিতে পড়ে থাকা, কখনো টেস্ট-না-করা স্পেয়ার হলো সেই backup যা আপনি কখনো restore করে দেখেননি — খাতায় আছে, বাস্তবে নেই। দরকারের রাতে চুপসানো টায়ার পাওয়াটাই হলো আসল disaster-এর সময় corrupt বা অকেজো backup আবিষ্কার করা, যখন আর কিছু করার নেই। আর আল-খোয়ারিজমির নিয়মিত ফিট করে দেখাটাই হলো regular restore drill — যেটা আগেভাগেই ধরিয়ে দেয় backup ভাঙা কি না, আর আসল recovery-তে ঠিক কত সময় লাগবে (আপনার true RTO)। মূল কথা: যে backup আপনি কখনো restore করেননি, সেটা backup নয় — untested backup মানে কোনো backup-ই নেই। বাস্তবে তাই টিমগুলো নিয়ম করে test environment-এ restore চালিয়ে দেখে, আর measure করে কত সময় লাগল।

## কেন Drill আসলে হয় না

Restore drill সর্বজনীনভাবে গুরুত্বপূর্ণ বলে স্বীকৃত এবং সর্বজনীনভাবে এড়িয়ে যাওয়া হয়। কারণগুলো:

- **এড়িয়ে গেলে সাথে সাথে কোনো পরিণতি নেই।** ব্যাকআপ খুব কমই দরকার পড়ে, তাই ঝুঁকিটা তাত্ত্বিক মনে হয়।
- **Drill বিঘ্নকারী।** এতে infrastructure, সময়, আর প্রসিডিওর জানা লোক দরকার।
- **কী পাব সেই ভয়।** যদি drill-এ ধরা পড়ে ব্যাকআপ কাজ করে না, সেটা অস্বস্তিকর।

শেষ কারণটাই ঠিক কেন drill গুরুত্বপূর্ণ। drill-এ ভাঙা ব্যাকআপ খুঁজে পেলে খরচ একটা বিকেল। বাস্তব disaster-এর সময় সেগুলো খুঁজে পেলে খরচ কয়েক দিনের downtime আর সম্ভবত রিকভার-না-হওয়া ডেটা।

## কী টেস্ট করবেন

একটা restore drill শুধু "ব্যাকআপ ফাইল আছে কি না" নয়। পুরো chain যাচাই করুন:

```
□ Backup file is accessible (not just listed — actually downloadable)
□ Backup file is intact (checksum matches, not corrupted)
□ Restore process completes without errors
□ Data is correct (not just that the DB started — run queries)
□ Application connects and functions (run smoke tests)
□ Restore time is within RTO target
□ Point-in-time recovery works (not just full restore)
□ Runbook is complete and accurate (someone else can follow it)
```

## Drill Frequency

```
Weekly (automated):
  Restore latest backup to a ephemeral test environment
  Run data integrity checks
  Alert if any step fails
  Time: automated, ~1 hour

Monthly (manual):
  Full restore drill with a human following the runbook
  Measure actual RTO vs target
  Verify PITR to a specific timestamp
  Time: 2-4 hours

Quarterly (full DR simulation):
  Simulate actual disaster (primary unavailable)
  Follow incident response + DR runbook end-to-end
  Include application failover, DNS changes, customer communication
  Time: half day
```

## অটোমেটেড সাপ্তাহিক Restore Verification

```bash
#!/bin/bash
# restore-verify.sh — run weekly in CI or cron

set -euo pipefail

BACKUP_BUCKET="s3://my-wal-archive"
TEST_DB_HOST="restore-test.internal"
TEST_DB_NAME="mydb_restore_test"
ALERT_WEBHOOK="https://hooks.slack.com/services/..."

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
alert() { curl -s -X POST "$ALERT_WEBHOOK" -d "{\"text\":\"DR Alert: $1\"}"; }

log "Starting restore verification"

# 1. Find and download latest backup
log "Fetching latest backup list..."
LATEST=$(wal-g backup-list | tail -1 | awk '{print $1}')
if [ -z "$LATEST" ]; then
  alert "No backups found in $BACKUP_BUCKET"
  exit 1
fi
log "Latest backup: $LATEST"

# 2. Restore to test server
log "Restoring $LATEST to $TEST_DB_HOST..."
ssh "postgres@$TEST_DB_HOST" "
  systemctl stop postgresql
  rm -rf /var/lib/postgresql/data/*
  WALG_S3_PREFIX=$BACKUP_BUCKET wal-g backup-fetch /var/lib/postgresql/data LATEST
  touch /var/lib/postgresql/data/recovery.signal
  systemctl start postgresql
  sleep 15  # wait for recovery to complete
"

# 3. Verify data integrity
log "Running integrity checks..."
RESULT=$(psql "postgresql://postgres@$TEST_DB_HOST/$TEST_DB_NAME" << 'SQL'
  SELECT
    (SELECT count(*) FROM users)               AS user_count,
    (SELECT max(created_at) FROM orders)       AS latest_order,
    (SELECT count(*) FROM orders
     WHERE created_at > NOW() - INTERVAL '24h') AS orders_last_24h;
SQL
)
log "Integrity check result: $RESULT"

# 4. Run application smoke tests against restored DB
log "Running smoke tests..."
TEST_DATABASE_URL="postgresql://postgres@$TEST_DB_HOST/$TEST_DB_NAME" \
  npm run test:smoke

# 5. Measure restore time
RESTORE_DURATION=$SECONDS
log "Restore completed in ${RESTORE_DURATION}s"

if [ "$RESTORE_DURATION" -gt 3600 ]; then  # alert if > 1 hour
  alert "Restore took ${RESTORE_DURATION}s — exceeds 1-hour RTO target"
fi

# 6. Clean up
ssh "postgres@$TEST_DB_HOST" "systemctl stop postgresql && rm -rf /var/lib/postgresql/data/*"

log "Restore verification complete"
```

এটা CI-তে সাপ্তাহিক চালান। ফেল করলে on-call-কে alert করুন। কখনো ফেল না করলে, চেক করুন এটা আসলেই চলছে কি না।

## Restore Runbook

এমনভাবে লিখুন যাতে কখনো restore না-করা কেউ রাত ৩টায় চাপের মধ্যে এটা চালাতে পারে। প্রতিটা step স্পষ্ট হতে হবে।

````markdown
# Database Disaster Recovery Runbook

**Last tested:** 2024-01-15 by @alice — actual RTO: 47 minutes
**RTO target:** 60 minutes
**RPO target:** 15 minutes

## Pre-requisites

- AWS CLI configured with DR account credentials
- wal-g binary at /usr/local/bin/wal-g
- SSH access to restore target: restore-db.internal
- Pagerduty incident opened (for comms)

## Step 1: Assess the Situation (5 minutes)

- [ ] Confirm primary database is actually down (not just monitoring issue)
- [ ] Check: can any app servers reach the primary? `psql $DATABASE_URL -c "SELECT 1"`
- [ ] Identify: is this a data corruption or infrastructure failure?
  - Infrastructure failure → promote read replica (faster, go to Step 3a)
  - Data corruption → restore from backup (go to Step 3b)
- [ ] Communicate to stakeholders: "Database incident in progress, investigating"

## Step 2: Notify (2 minutes)

- [ ] Update status page: "We are investigating a database issue"
- [ ] Post in #incidents: "@here Database DR in progress, ETA 60 minutes"
- [ ] Assign Incident Commander

## Step 3a: Promote Read Replica (if available, ~5 minutes)

```bash
# On the replica server
pg_ctl promote -D /var/lib/postgresql/data

# Update application DATABASE_URL to point to replica
# In AWS: update SSM Parameter or Secrets Manager
aws ssm put-parameter \
  --name /myapp/prod/DATABASE_URL \
  --value "postgresql://app:pass@replica.db.internal:5432/mydb" \
  --overwrite

# Restart application servers to pick up new connection string
```
````

- [ ] অ্যাপ্লিকেশন কানেক্ট করতে পারে যাচাই করুন: `curl https://api.myapp.com/health`
- [ ] ৫ মিনিট error rate মনিটর করুন
- [ ] status page আপডেট করুন: "Database recovered, monitoring"

## Step 3b: ব্যাকআপ থেকে Restore (~45 মিনিট)

```bash
# SSH to restore target server
ssh postgres@restore-db.internal

# Stop any running postgres
sudo systemctl stop postgresql

# Clear data directory
sudo rm -rf /var/lib/postgresql/data/*

# Set WAL-G credentials
export WALG_S3_PREFIX=s3://my-wal-archive
export AWS_REGION=us-east-1

# Restore latest backup
sudo -u postgres wal-g backup-fetch /var/lib/postgresql/data LATEST

# If PITR needed (data corruption at known time):
# Add to postgresql.conf before starting:
# recovery_target_time = 'YYYY-MM-DD HH:MM:SS UTC'  ← time BEFORE corruption

sudo -u postgres touch /var/lib/postgresql/data/recovery.signal
sudo systemctl start postgresql

# Monitor recovery (watch for "database system is ready to accept connections")
sudo journalctl -u postgresql -f
```

- [ ] ডেটা integrity যাচাই করুন: `psql -h restore-db.internal -U postgres -c "SELECT count(*) FROM orders"`
- [ ] DATABASE_URL restore করা সার্ভারে আপডেট করুন
- [ ] smoke test চালান: `TEST_ENV=staging npm run test:smoke`
- [ ] status page আপডেট করুন: "Database recovered from backup, monitoring"

## Step 4: Post-Recovery (চলমান)

- [ ] ৩০ মিনিট error rate আর latency মনিটর করুন
- [ ] ডেটা ক্ষতির window চিহ্নিত করুন আর জানান (অর্জিত RPO vs target)
- [ ] post-mortem issue খুলুন
- [ ] step ভুল বা missing থাকলে runbook review শিডিউল করুন

```

## What Good Looks Like

After a drill, document:
- **Actual RTO:** X minutes (vs Y target)
- **Actual RPO:** X minutes of data loss (vs Y target)
- **Issues found:** steps that were wrong, missing, or unclear
- **Actions:** specific fixes with owners and due dates

If your drill takes 3 hours and your RTO is 1 hour, that's a gap — not just documentation. Fix the process or adjust the target to be honest about your actual capability.

## Drill Anti-Patterns

**The theoretical drill:** Reviewing the runbook in a meeting without actually restoring anything. This finds documentation gaps but doesn't validate that the restore actually works.

**Restoring to the same environment:** If you restore over your production database to test DR, you've just made your disaster worse. Always restore to an isolated test environment.

**Only testing the "last backup":** Verify you can also restore to a point in time from two days ago. If WAL segments for day -2 are missing or corrupt, you'll discover it now rather than when you need them.

**Not timing it:** "The restore succeeded" is incomplete. "The restore succeeded in 52 minutes" tells you whether you're meeting your RTO.

```
