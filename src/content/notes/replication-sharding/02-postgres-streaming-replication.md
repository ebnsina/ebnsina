---
title: 'Postgres Streaming Replication by Hand'
subtitle: 'Setting up a primary, configuring pg_basebackup, streaming WAL to a standby — no managed service, no Patroni, just Postgres.'
chapter: 2
level: 'intermediate'
readingTime: '12 min'
topics: ['PostgreSQL', 'streaming replication', 'pg_basebackup', 'WAL', 'standby', 'failover']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Training a replacement employee by giving them a complete copy of your work history (pg_basebackup) and then letting them shadow every new task you do in real time (streaming WAL). When you leave, they're fully up to date and can take over immediately.

</Callout>

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

## Creating the Replica

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

`--write-recovery-conf` creates two files:

- `standby.signal` — presence of this file tells Postgres to start as a standby
- `postgresql.auto.conf` — contains `primary_conninfo` pointing to the primary

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

## postgresql.conf on Replica

```bash
# postgresql.conf on replica
hot_standby = on                  # allow read queries
hot_standby_feedback = on         # prevent primary from vacuuming rows replica still needs
max_standby_streaming_delay = 30s # max delay before cancelling queries that conflict with WAL
max_standby_archive_delay = 30s
```

`hot_standby_feedback` tells the primary which rows the replica is reading so the primary doesn't vacuum them away. The trade-off: table bloat on the primary if the replica has long-running queries.

## Verifying Replication

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

Write a row on the primary, check it appears on the replica:

```bash
# Primary
psql -h 10.0.0.10 -c "INSERT INTO test_replication VALUES (1);"

# Replica (should appear within milliseconds)
psql -h 10.0.0.11 -c "SELECT * FROM test_replication;"
```

## Manual Failover

If the primary fails, promote a replica:

```bash
# On the replica to promote
pg_ctlcluster 16 main promote
# Or:
pg_ctl promote -D /var/lib/postgresql/16/main

# Verify it's now primary
psql -c "SELECT pg_is_in_recovery();"
# f  → it's now primary
```

After promotion:

1. Update application connection strings to point to the new primary
2. Re-point any other replicas to the new primary
3. If the old primary recovers, it must be rebuilt as a replica (it has diverged)

**Rebuilding the old primary as a new replica:**

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

## Replication with Multiple Replicas

```bash
# Primary postgresql.conf
max_wal_senders = 10              # one per replica

# Synchronous commit with one sync replica, rest async
synchronous_standby_names = 'ANY 1 (replica1, replica2)'
# Primary waits for any 1 of these two to confirm WAL receipt
```

Cascade replication (replica replicates from another replica):

```bash
# replica2 replicates from replica1 instead of primary
# primary_conninfo in replica2's postgresql.auto.conf
primary_conninfo = 'host=10.0.0.11 port=5432 user=replicator ...'
# replica1 must also be configured to allow WAL streaming
```

Cascade reduces network load on the primary but increases replication lag (replica2 = primary lag + replica1 lag).

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

WAL archiving keeps old WAL segments for PITR:

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

With WAL archiving + base backup, you can restore to any point in time:

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
