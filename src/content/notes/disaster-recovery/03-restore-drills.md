---
title: "Restore Drills"
subtitle: "How to actually test your backups — the runbook structure, what to verify, and how to make drills a regular practice."
chapter: 3
level: "intermediate"
readingTime: "9 min"
topics: ["restore drills", "runbooks", "backup verification", "PITR", "disaster simulation"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A fire extinguisher that's never been tested: it looks ready, it's mounted on the wall, and it might work — but you don't actually know until the moment you need it. Untested backups are the same. A backup you've never restored is a backup you don't have.

</Callout>

## Why Drills Fail to Happen

Restore drills are universally acknowledged as important and universally skipped. The reasons:

- **No immediate consequence for skipping.** Backups rarely needed, so the risk feels theoretical.
- **Drills are disruptive.** Requires infrastructure, time, and people who know the procedure.
- **Fear of what we'll find.** If the drill reveals the backup doesn't work, that's uncomfortable.

The last reason is exactly why drills matter. Finding broken backups in a drill costs an afternoon. Finding them during an actual disaster costs days of downtime and potentially unrecoverable data.

## What to Test

A restore drill isn't just "does the backup file exist." Verify the full chain:

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

## Automated Weekly Restore Verification

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

Run this in CI weekly. If it fails, alert on-call. If it's never failed, check that it's actually running.

## The Restore Runbook

Write it so that someone who has never done a restore before can execute it under pressure at 3am. Every step must be explicit.

```markdown
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

- [ ] Verify application can connect: `curl https://api.myapp.com/health`
- [ ] Monitor error rate for 5 minutes
- [ ] Update status page: "Database recovered, monitoring"

## Step 3b: Restore from Backup (~45 minutes)

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

- [ ] Verify data integrity: `psql -h restore-db.internal -U postgres -c "SELECT count(*) FROM orders"`
- [ ] Update DATABASE_URL to restored server
- [ ] Run smoke tests: `TEST_ENV=staging npm run test:smoke`
- [ ] Update status page: "Database recovered from backup, monitoring"

## Step 4: Post-Recovery (ongoing)

- [ ] Monitor error rates and latency for 30 minutes
- [ ] Identify and communicate data loss window (RPO achieved vs target)
- [ ] Open post-mortem issue
- [ ] Schedule runbook review if steps were wrong or missing
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

