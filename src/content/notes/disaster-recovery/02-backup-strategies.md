---
title: 'Backup Strategies'
subtitle: 'logical backup-এর জন্য pg_dump, continuous archival-এর জন্য WAL-G, retention-এর জন্য S3 lifecycle — আসলে আপনার ডেটা রাখার মেকানিক্স।'
chapter: 2
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['pg_dump', 'WAL-G', 'WAL archiving', 'backups', 'S3', 'retention']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব উদাহরণ**

একটা ডকুমেন্টের ছবি তোলা আর প্রতিটা পৃষ্ঠা লেখার সাথে সাথে সেটা ফটোকপি করার মধ্যে পার্থক্য: একটা snapshot (logical backup) একটা মুহূর্ত ধরে রাখে, কিন্তু তার পরে যা কিছু লেখা হয় সব চলে যায়। Continuous archival (WAL streaming) প্রতিটা পরিবর্তন ঘটার সাথে সাথে ধরে রাখে — আপনি শুধু শেষ snapshot নয়, যেকোনো point in time-এ replay করতে পারেন।

</Callout>

## গল্পে বুঝি

ফাতিমার পরিবারের একটা কাঠের বাক্স ভরা জরুরি কাগজ — জমির দলিল, জন্ম সনদ, পুরনো চিঠি। এসব হারালে আর ফেরত পাওয়ার উপায় নেই। তাই মাঝেমধ্যে, ধরুন বছরে একবার, ফাতিমা বসে গোটা বাক্সের প্রতিটা কাগজ ফটোকপি করেন — একটাও বাদ না দিয়ে পুরো জিনিসটা। এই কাজটা সময়সাপেক্ষ, তাই ঘনঘন করা যায় না।

মাঝের সময়টায় নতুন যে কাগজ আসে — এই মাসের একটা রসিদ, নতুন একটা সার্টিফিকেট — শুধু সেগুলোর কপি বানিয়ে আগের কপির স্তূপে যোগ করেন। গোটা বাক্স আবার নতুন করে কপি করেন না, শুধু যেটুকু নতুন। আর কপিগুলো তিনি এক জায়গায় রাখেন না: এক সেট বাড়ির তালাবদ্ধ আলমারিতে, আরেক সেট একটা USB ড্রাইভে স্ক্যান করা, আর তৃতীয় একটা সেট অন্য শহরে সিনার বাড়িতে। ফলে বাড়িতে আগুন লাগুক, চুরি হোক বা বন্যা হোক — সব কপি একসাথে কখনো হারায় না।

এই গল্পটাই backup strategy। বছরে একবার গোটা বাক্স কপি করা হলো **full backup**, আর মাঝে শুধু নতুন কাগজ যোগ করা হলো **incremental backup** — কম খরচে, ঘনঘন। আর তিন সেট কপি (3), দুই রকম মাধ্যমে — কাগজ ও USB (2), একটা অন্য শহরে (1 offsite) — এটাই **3-2-1 রুল**, যাতে কোনো একটা দুর্ঘটনা সব কপি একসাথে মুছে দিতে না পারে। বাস্তবে ঠিক এভাবেই ডেটাবেসের full backup সপ্তাহে একবার নেওয়া হয়, মাঝে WAL/incremental দিয়ে নতুন পরিবর্তন ধরা হয়, আর কপিগুলো আলাদা media ও offsite (যেমন অন্য region-এর S3) তে রাখা হয় — আর অটোমেট করার পাশাপাশি মাঝেমধ্যে restore করে যাচাই করা হয় কপিগুলো সত্যিই কাজ করে কিনা।

## Logical Backup: pg_dump

`pg_dump` একটা ডেটাবেস SQL বা কাস্টম বাইনারি ফরম্যাটে export করে। সরল, portable, ছোট ডেটাবেসের জন্য আর ঝুঁকিপূর্ণ migration-এর আগে একটা consistent snapshot নেওয়ার জন্য সঠিক টুল।

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

**pg_dump থেকে restore:**

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

**pg_dump-এর সীমাবদ্ধতা:**

- Point-in-time: dump শুরুর অবস্থা ধরে রাখে, তার পরে যা লেখা হয় সব বাদ দেয়
- সময়কাল: বড় ডেটাবেস dump করতে ঘণ্টার পর ঘণ্টা লাগে, এই সময়ে ডেটা বদলাতেই থাকে
- RPO = শেষ dump থেকে যতটুকু সময় গেছে (যদি প্রতি রাত ২টায় dump করেন, RPO ২৪ ঘণ্টা পর্যন্ত হতে পারে)

RPO ১ ঘণ্টার নিচে চাইলে আপনার WAL archiving লাগবে।

## WAL Archiving: Continuous Backup

PostgreSQL-এর Write-Ahead Log (WAL) প্রতিটা পরিবর্তন প্রয়োগ করার আগে সেটা রেকর্ড করে। WAL continuous archive করলে আপনি যেকোনো point in time-এ restore করতে পারবেন — শুধু শেষ snapshot নয়।

**WAL + base backup = PITR (Point-In-Time Recovery):**

```
Base backup (snapshot at T=0)
  + WAL segments archived from T=0 to T=now
  = Ability to restore to any point between T=0 and T=now
```

**postgresql.conf-এ WAL archiving কনফিগার করা:**

```ini
wal_level = replica          # enable WAL content needed for replication/archiving
archive_mode = on            # enable archiving
archive_command = 'cp %p /mnt/wal_archive/%f'  # command to archive each WAL file
# %p = full path of WAL file, %f = filename only

archive_timeout = 60         # archive incomplete WAL segments every 60s
                             # limits RPO even between full WAL segment fills
```

Production-এর জন্য S3-তে archive করুন — লোকাল ডিস্কে নয়:

```ini
archive_command = 'aws s3 cp %p s3://my-wal-archive/%f'
```

## WAL-G: Production WAL Archiving

[WAL-G](https://github.com/wal-g/wal-g) হলো PostgreSQL continuous backup-এর স্ট্যান্ডার্ড টুল। এটা base backup, WAL archiving, compression, encryption, আর restore — সবকিছু একটা বাইনারিতে হ্যান্ডল করে।

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

**WAL-G ব্যবহার করতে postgresql.conf কনফিগার করা:**

```ini
wal_level = replica
archive_mode = on
archive_command = 'wal-g wal-push %p'
restore_command = 'wal-g wal-fetch %f %p'
archive_timeout = 60
```

**একটা base backup নেওয়া:**

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

**cron দিয়ে অটোমেট করা:**

```bash
# /etc/cron.d/wal-g
# Full base backup every Sunday at 1am
0 1 * * 0 postgres wal-g backup-push /var/lib/postgresql/data >> /var/log/wal-g.log 2>&1

# WAL archiving is continuous via archive_command — no cron needed
```

## WAL-G দিয়ে Restore (PITR)

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

## Retention Policy

retention policy ছাড়া ব্যাকআপ চিরকাল বাড়তে থাকে। আপনার S3 bucket production ডেটাবেসের চেয়ে বেশি খরচ করার আগেই policy সেট করুন।

```bash
# WAL-G retention: keep last N base backups
wal-g delete retain FULL 7   # keep last 7 full base backups

# Delete old backups (older than 30 days, keeping minimum 3)
wal-g delete before FIND_FULL 2024-01-01T00:00:00Z
wal-g delete --confirm before FIND_FULL 2024-01-01T00:00:00Z  # --confirm to actually delete

# Automate retention with cron
0 4 * * * postgres wal-g delete retain FULL 7 --confirm >> /var/log/wal-g-cleanup.log 2>&1
```

**WAL segment-এর জন্য S3 lifecycle policy (belt and suspenders):**

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

**স্ট্যান্ডার্ড retention tier:**

```
Daily backups: keep 7 days
Weekly backups: keep 4 weeks
Monthly backups: keep 12 months
Yearly backups: keep 7 years (compliance)

WAL segments: keep as long as your oldest base backup + buffer
  If oldest base backup is 7 days old, keep 8+ days of WAL
```

## Application-Level Backup

ডেটাবেসের বাইরেও ব্যাকআপ করুন:

**Configuration আর secrets:**

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

## 3-2-1 রুল

ডেটার **3** কপি, **2** ভিন্ন media type, **1** offsite:

```
Copy 1: Live database (primary)
Copy 2: Read replica in the same region (different AZ)
Copy 3: WAL-G backups in S3 (offsite — different storage medium + region)

Meets 3-2-1: ✓
```

গুরুত্বপূর্ণ ডেটার জন্য একটা ভিন্ন cloud provider-এ বা ফিজিক্যালি air-gapped storage-এ চতুর্থ একটা কপি যোগ করুন।
