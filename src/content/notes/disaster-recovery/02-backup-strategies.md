---
title: 'Backup Strategies'
subtitle: 'pg_dump for logical backups, WAL-G for continuous archival, S3 lifecycle for retention — the mechanics of actually keeping your data.'
chapter: 2
level: 'intermediate'
readingTime: '12 min'
topics: ['pg_dump', 'WAL-G', 'WAL archiving', 'backups', 'S3', 'retention']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

The difference between photographing a document and photocopying it page by page as each page is written: a snapshot (logical backup) captures a moment in time, but everything written after it is gone. Continuous archival (WAL streaming) captures every change as it happens — you can replay to any point in time, not just the last snapshot.

</Callout>

## Logical Backups: pg_dump

`pg_dump` exports a database to SQL or a custom binary format. Simple, portable, the right tool for smaller databases and for taking a consistent snapshot before risky migrations.

```bash
# Basic SQL dump
pg_dump -U postgres mydb > backup.sql

# Custom format (smaller, parallel restore, recommended)
pg_dump -U postgres -Fc mydb > backup.dump

# With connection string
pg_dump "postgresql://user:pass@host:5432/mydb" -Fc > backup.dump

# Compressed (for SQL format)
pg_dump -U postgres mydb | gzip > backup.sql.gz

# Dump specific tables
pg_dump -U postgres -t orders -t order_items mydb -Fc > orders_backup.dump

# All databases (includes roles and tablespaces)
pg_dumpall -U postgres > full_cluster.sql
```

**Restore from pg_dump:**

```bash
# SQL format
psql -U postgres -d mydb < backup.sql

# Custom format (faster, can parallelize)
pg_restore -U postgres -d mydb -j 4 backup.dump
# -j 4: 4 parallel restore jobs

# Create database first, then restore
createdb -U postgres mydb_restored
pg_restore -U postgres -d mydb_restored backup.dump
```

**Limitations of pg_dump:**

- Point-in-time: captures state at dump start, misses everything written after
- Duration: large databases take hours to dump, during which data keeps changing
- RPO = time since last dump (if you dump nightly at 2am, RPO is up to 24 hours)

For RPO below 1 hour, you need WAL archiving.

## WAL Archiving: Continuous Backup

PostgreSQL's Write-Ahead Log (WAL) records every change before it's applied. Archive the WAL continuously and you can restore to any point in time — not just the last snapshot.

**WAL + base backup = PITR (Point-In-Time Recovery):**

```
Base backup (snapshot at T=0)
  + WAL segments archived from T=0 to T=now
  = Ability to restore to any point between T=0 and T=now
```

**Configure WAL archiving in postgresql.conf:**

```ini
wal_level = replica          # enable WAL content needed for replication/archiving
archive_mode = on            # enable archiving
archive_command = 'cp %p /mnt/wal_archive/%f'  # command to archive each WAL file
# %p = full path of WAL file, %f = filename only

archive_timeout = 60         # archive incomplete WAL segments every 60s
                             # limits RPO even between full WAL segment fills
```

For production, archive to S3 — not local disk:

```ini
archive_command = 'aws s3 cp %p s3://my-wal-archive/%f'
```

## WAL-G: Production WAL Archiving

[WAL-G](https://github.com/wal-g/wal-g) is the standard tool for PostgreSQL continuous backup. It handles base backups, WAL archiving, compression, encryption, and restore — all in one binary.

**Setup:**

```bash
# Install
curl -L https://github.com/wal-g/wal-g/releases/latest/download/wal-g-pg-ubuntu-20.04 \
  -o /usr/local/bin/wal-g && chmod +x /usr/local/bin/wal-g

# Configure via environment variables
export WALG_S3_PREFIX=s3://my-backup-bucket/postgres
export AWS_REGION=us-east-1
export WALG_COMPRESSION_METHOD=brotli   # or lz4, zstd
export WALG_DELTA_MAX_STEPS=7           # base backup every 7 deltas
export PGPASSWORD=yourpassword
export PGUSER=postgres
export PGHOST=localhost
```

**Configure postgresql.conf to use WAL-G:**

```ini
wal_level = replica
archive_mode = on
archive_command = 'wal-g wal-push %p'
restore_command = 'wal-g wal-fetch %f %p'
archive_timeout = 60
```

**Take a base backup:**

```bash
# Full base backup — run initially and then periodically (weekly recommended)
wal-g backup-push /var/lib/postgresql/data
# Compresses and uploads to S3
# WAL-G handles incremental backups (delta) between full backups

# List backups
wal-g backup-list
# name                          last_modified        wal_segment_backup_start
# base_000000010000000000000012 2024-01-15T02:00:00Z 000000010000000000000012
# base_000000010000000000000018 2024-01-22T02:00:00Z 000000010000000000000018
```

**Automate with cron:**

```bash
# /etc/cron.d/wal-g
# Full base backup every Sunday at 1am
0 1 * * 0 postgres wal-g backup-push /var/lib/postgresql/data >> /var/log/wal-g.log 2>&1

# WAL archiving is continuous via archive_command — no cron needed
```

## Restore with WAL-G (PITR)

```bash
# Stop PostgreSQL
systemctl stop postgresql

# Clear the data directory (careful!)
rm -rf /var/lib/postgresql/data/*

# Restore base backup (latest, or specify by name)
wal-g backup-fetch /var/lib/postgresql/data LATEST

# Or restore a specific backup
wal-g backup-fetch /var/lib/postgresql/data base_000000010000000000000018

# Create recovery configuration
cat > /var/lib/postgresql/data/postgresql.conf << 'EOF'
restore_command = 'wal-g wal-fetch %f %p'

# For PITR: stop replay at a specific time
recovery_target_time = '2024-01-15 14:30:00 UTC'
recovery_target_action = promote   # promote to primary after reaching target
EOF

# Create recovery signal file (Postgres 12+)
touch /var/lib/postgresql/data/recovery.signal

# Start PostgreSQL — it will replay WAL until recovery_target_time
systemctl start postgresql

# Watch recovery progress
tail -f /var/log/postgresql/postgresql.log
# LOG:  starting point-in-time recovery to 2024-01-15 14:30:00 UTC
# LOG:  restored log file "000000010000000000000013" from archive
# ...
# LOG:  recovery stopping before commit of transaction 1234, time 2024-01-15 14:30:05
# LOG:  pausing at the end of recovery
```

## Retention Policies

Backups without retention policies grow forever. Set policies before your S3 bucket costs more than your production database.

```bash
# WAL-G retention: keep last N base backups
wal-g delete retain FULL 7   # keep last 7 full base backups

# Delete old backups (older than 30 days, keeping minimum 3)
wal-g delete before FIND_FULL 2024-01-01T00:00:00Z
wal-g delete --confirm before FIND_FULL 2024-01-01T00:00:00Z  # --confirm to actually delete

# Automate retention with cron
0 4 * * * postgres wal-g delete retain FULL 7 --confirm >> /var/log/wal-g-cleanup.log 2>&1
```

**S3 lifecycle policy for WAL segments (belt and suspenders):**

```json
{
	"Rules": [
		{
			"Status": "Enabled",
			"Filter": { "Prefix": "postgres/wal_005/" },
			"Expiration": { "Days": 35 }
		}
	]
}
```

**Standard retention tiers:**

```
Daily backups: keep 7 days
Weekly backups: keep 4 weeks
Monthly backups: keep 12 months
Yearly backups: keep 7 years (compliance)

WAL segments: keep as long as your oldest base backup + buffer
  If oldest base backup is 7 days old, keep 8+ days of WAL
```

## Application-Level Backups

Beyond the database, back up:

**Configuration and secrets:**

```bash
# Export application config (not secrets — those live in secrets manager)
kubectl get configmap -A -o yaml > configmaps-backup.yaml
kubectl get secret -A -o yaml > secrets-backup.yaml  # encrypted at rest

# Store in versioned S3 bucket
aws s3 cp configmaps-backup.yaml s3://my-config-backup/$(date +%Y%m%d)/
```

**Object storage (S3):**

```bash
# Enable S3 versioning — accidental deletes are recoverable
aws s3api put-bucket-versioning \
  --bucket my-uploads \
  --versioning-configuration Status=Enabled

# Cross-region replication for DR
aws s3api put-bucket-replication \
  --bucket my-uploads \
  --replication-configuration file://replication.json
```

**Infrastructure as Code:**

```bash
# If you use Terraform: your IaC repo IS your infra backup
# Ensure state backend is backed up
terraform state pull > terraform.tfstate.backup
aws s3 cp terraform.tfstate.backup s3://my-tf-state-backup/
```

## The 3-2-1 Rule

**3** copies of data, **2** different media types, **1** offsite:

```
Copy 1: Live database (primary)
Copy 2: Read replica in the same region (different AZ)
Copy 3: WAL-G backups in S3 (offsite — different storage medium + region)

Meets 3-2-1: ✓
```

For critical data, add a fourth copy in a different cloud provider or physically air-gapped storage.
