---
title: 'Postgres Streaming Replication নিজ হাতে'
subtitle: 'একটি primary সেটআপ করা, pg_basebackup কনফিগার করা, একটি standby-তে WAL stream করা — কোনো managed service নেই, কোনো Patroni নেই, শুধু Postgres।'
chapter: 2
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['PostgreSQL', 'streaming replication', 'pg_basebackup', 'WAL', 'standby', 'failover']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একজন প্রতিস্থাপন কর্মীকে প্রশিক্ষণ দেওয়া, তাকে আপনার পুরো কাজের ইতিহাসের একটি সম্পূর্ণ কপি দিয়ে (pg_basebackup) এবং তারপর আপনার করা প্রতিটি নতুন কাজ রিয়েল-টাইমে তাকে ছায়ার মতো অনুসরণ করতে দিয়ে (streaming WAL)। আপনি চলে গেলে, সে পুরোপুরি হালনাগাদ এবং সাথে সাথেই দায়িত্ব নিতে পারে।

</Callout>

## গল্পে বুঝি

ঢাকার এক পুরনো ব্যবসাপ্রতিষ্ঠানের প্রধান হিসাবরক্ষক সিনা। তার হাতে মূল খাতা — প্রতিটি লেনদেন সবার আগে এখানেই ওঠে। কিন্তু সিনার একটা অন্যরকম অভ্যাস আছে: টেবিলের পাশে একটা টেলিফোন লাইন সবসময় খোলা রাখা থাকে, আর সেই লাইনের ওপাশে বসে থাকে শাখা অফিসের জুনিয়র হিসাবরক্ষক ফাতিমা। সিনা যেই মুহূর্তে খাতায় একটা এন্ট্রি লেখেন, ঠিক সেই মুহূর্তেই সেটা গলা ছেড়ে বলে দেন — "অ্যাকাউন্ট বারো-তে ক্রেডিট পাঁচশো... এবার অ্যাকাউন্ট সাতে ডেবিট দুইশো..."।

ওপাশে ফাতিমা প্রতিটা কথা যে ক্রমে বলা হচ্ছে ঠিক সেই ক্রমে নিজের খাতায় হুবহু তুলে নেন — একটা এন্ট্রিও এদিক-ওদিক করেন না, একটাও বাদ দেন না। তিনি সবসময় সিনার থেকে মাত্র এক হৃৎস্পন্দন পেছনে — মূল খাতায় কালি শুকানোর আগেই শাখার খাতায় একই লাইন উঠে যায়। ফলে শাখার খাতা কার্যত মূল খাতার এক জীবন্ত প্রতিচ্ছবি। কোনো একদিন সিনা যদি হঠাৎ টেবিলেই লুটিয়ে পড়েন, ফাতিমা এক সেকেন্ডও দেরি না করে কলম তুলে ঠিক যেখানে থেমেছিল সেখান থেকে কাজ চালিয়ে নিতে পারবেন — একটা লেনদেনও হারাবে না।

এই গল্পটাই আসলে **Postgres streaming replication**। সিনার মূল খাতা হলো **primary**, আর প্রতিটা এন্ট্রি লেখার মুহূর্তেই খোলা লাইনে বলে দেওয়া হলো WAL (write-ahead log) একটানা **stream** করা। ফাতিমা প্রতিটা এন্ট্রি একই ক্রমে তুলে নেওয়া হলো **standby**-এর সেই WAL রেকর্ডগুলো ক্রমে **replay** করা, যাতে সে near-real-time একটা কপি হয়ে থাকে। আর "এক হৃৎস্পন্দন পেছনে, যেকোনো মুহূর্তে দায়িত্ব নিতে প্রস্তুত" — এটাই **hot standby**, যা primary হঠাৎ মারা গেলে **failover**-এ সাথে সাথে promote হয়ে নতুন primary হয়ে যায়। বাস্তবে এভাবেই read replica আর high-availability সেটআপ চলে — এই অধ্যায়ে আমরা managed service ছাড়াই খালি হাতে ঠিক এই জিনিসটা দাঁড় করাবো।

## Primary Configuration

```bash
# postgresql.conf on primary
wal_level = replica             # minimum for replication (logical for Debezium)
max_wal_senders = 5             # max concurrent WAL sender processes
max_replication_slots = 5       # if using replication slots
wal_keep_size = 1GB             # keep 1GB of WAL segments (backup if replica falls behind)
hot_standby = on                # replica can serve reads

# Optional: track commit timestamps (needed for some HA tools)
track_commit_timestamp = on
```

```bash
# pg_hba.conf on primary — allow replica to connect for replication
# TYPE  DATABASE    USER        ADDRESS         METHOD
host    replication replicator  10.0.0.11/32    scram-sha-256
host    replication replicator  10.0.0.12/32    scram-sha-256
```

```sql
-- Create replication user
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'strong-password';
```

```bash
# Apply changes
pg_ctlcluster 16 main reload
```

## Replica তৈরি করা

```bash
# On the replica server — stop any existing Postgres
pg_ctlcluster 16 main stop

# Wipe data directory
rm -rf /var/lib/postgresql/16/main/*

# Take base backup from primary (pg_basebackup streams data and WAL simultaneously)
pg_basebackup \
  --host=10.0.0.10 \                # primary IP
  --username=replicator \
  --pgdata=/var/lib/postgresql/16/main \
  --wal-method=stream \             # stream WAL during backup (consistent snapshot)
  --write-recovery-conf \           # write standby.signal + postgresql.auto.conf
  --checkpoint=fast \               # don't wait for natural checkpoint
  --progress \
  --verbose
```

`--write-recovery-conf` দুটি file তৈরি করে:

- `standby.signal` — এই file-এর উপস্থিতি Postgres-কে বলে standby হিসেবে শুরু হতে
- `postgresql.auto.conf` — এতে `primary_conninfo` থাকে যা primary-কে নির্দেশ করে

```bash
# postgresql.auto.conf (written by pg_basebackup)
primary_conninfo = 'host=10.0.0.10 port=5432 user=replicator password=strong-password application_name=replica1'
```

```bash
# Start the replica
pg_ctlcluster 16 main start

# Verify it's running as a standby
psql -c "SELECT pg_is_in_recovery();"
# t  → it's a replica

# Check replication on primary
psql -h 10.0.0.10 -c "SELECT * FROM pg_stat_replication;"
```

## Replica-তে postgresql.conf

```bash
# postgresql.conf on replica
hot_standby = on                  # allow read queries
hot_standby_feedback = on         # prevent primary from vacuuming rows replica still needs
max_standby_streaming_delay = 30s # max delay before cancelling queries that conflict with WAL
max_standby_archive_delay = 30s
```

`hot_standby_feedback` primary-কে জানায় replica কোন row গুলো পড়ছে যাতে primary সেগুলো vacuum করে না ফেলে। Trade-off: replica-তে দীর্ঘ-চলমান query থাকলে primary-তে table bloat।

## Replication যাচাই করা

```sql
-- On primary
SELECT
  application_name,
  client_addr,
  state,           -- streaming, catchup, startup
  sync_state,      -- async, sync, quorum
  replay_lag,
  write_lag,
  flush_lag
FROM pg_stat_replication;

-- On replica
SELECT
  now() - pg_last_xact_replay_timestamp() AS replication_lag,
  pg_is_in_recovery(),
  pg_last_wal_receive_lsn(),
  pg_last_wal_replay_lsn();
```

Primary-তে একটি row লিখুন, সেটি replica-তে আসে কিনা দেখুন:

```bash
# Primary
psql -h 10.0.0.10 -c "INSERT INTO test_replication VALUES (1);"

# Replica (should appear within milliseconds)
psql -h 10.0.0.11 -c "SELECT * FROM test_replication;"
```

## Manual Failover

Primary fail করলে, একটি replica promote করুন:

```bash
# On the replica to promote
pg_ctlcluster 16 main promote
# Or:
pg_ctl promote -D /var/lib/postgresql/16/main

# Verify it's now primary
psql -c "SELECT pg_is_in_recovery();"
# f  → it's now primary
```

Promotion-এর পর:

1. Application connection string গুলো নতুন primary-কে নির্দেশ করতে আপডেট করুন
2. অন্য যেকোনো replica-কে নতুন primary-তে re-point করুন
3. পুরনো primary যদি recover করে, সেটাকে replica হিসেবে আবার বানাতে হবে (এটি diverge করেছে)

**পুরনো primary-কে নতুন replica হিসেবে আবার বানানো:**

```bash
# On old primary (now demoted)
pg_ctlcluster 16 main stop
rm -rf /var/lib/postgresql/16/main/*

pg_basebackup \
  --host=10.0.0.11 \     # new primary (former replica)
  --username=replicator \
  --pgdata=/var/lib/postgresql/16/main \
  --wal-method=stream \
  --write-recovery-conf \
  --checkpoint=fast

pg_ctlcluster 16 main start
```

## একাধিক Replica সহ Replication

```bash
# Primary postgresql.conf
max_wal_senders = 10              # one per replica

# Synchronous commit with one sync replica, rest async
synchronous_standby_names = 'ANY 1 (replica1, replica2)'
# Primary waits for any 1 of these two to confirm WAL receipt
```

Cascade replication (একটি replica অন্য একটি replica থেকে replicate করে):

```bash
# replica2 replicates from replica1 instead of primary
# primary_conninfo in replica2's postgresql.auto.conf
primary_conninfo = 'host=10.0.0.11 port=5432 user=replicator ...'
# replica1 must also be configured to allow WAL streaming
```

Cascade primary-তে network load কমায় কিন্তু replication lag বাড়ায় (replica2 = primary lag + replica1 lag)।

## Monitoring Script

```bash
#!/bin/bash
# /usr/local/bin/check-replication.sh

PRIMARY="10.0.0.10"
REPLICAS=("10.0.0.11" "10.0.0.12")
MAX_LAG_SECONDS=30

for replica in "${REPLICAS[@]}"; do
  lag=$(psql -h "$replica" -U postgres -tAc \
    "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int")

  if [ "$lag" -gt "$MAX_LAG_SECONDS" ]; then
    echo "ALERT: $replica is ${lag}s behind primary"
    # Send to alertmanager, PagerDuty, etc.
    curl -X POST "$ALERTMANAGER_URL/api/v1/alerts" \
      -d "[{\"labels\":{\"alertname\":\"ReplicationLagHigh\",\"replica\":\"$replica\"},\"annotations\":{\"lag\":\"${lag}s\"}}]"
  else
    echo "OK: $replica is ${lag}s behind primary"
  fi
done
```

```bash
# Add to cron
*/5 * * * * /usr/local/bin/check-replication.sh >> /var/log/replication-check.log 2>&1
```

## WAL Archiving (Point-in-Time Recovery)

WAL archiving PITR-এর জন্য পুরনো WAL segment গুলো ধরে রাখে:

```bash
# postgresql.conf
archive_mode = on
archive_command = 'aws s3 cp %p s3://my-wal-archive/%f'
# %p = full path of WAL file, %f = filename

# Verify archiving works
psql -c "SELECT * FROM pg_stat_archiver;"
# last_archived_wal should be recent
# failed_count should be 0
```

WAL archiving + base backup থাকলে, আপনি যেকোনো সময়ের পয়েন্টে restore করতে পারেন:

```bash
# 1. Restore base backup
pg_basebackup --host=... --pgdata=/var/lib/postgresql/16/restore ...

# 2. Configure PITR target
cat >> /var/lib/postgresql/16/restore/postgresql.conf <<EOF
restore_command = 'aws s3 cp s3://my-wal-archive/%f %p'
recovery_target_time = '2024-01-15 14:30:00'
recovery_target_action = 'promote'
EOF

# 3. Create recovery signal
touch /var/lib/postgresql/16/restore/recovery.signal

# 4. Start Postgres — it replays WAL up to the target time
pg_ctlcluster 16 restore start
```
