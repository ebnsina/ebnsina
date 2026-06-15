---
title: "Multi-Region Replication"
subtitle: "Streaming replication, logical replication, and the trade-offs of active-passive vs active-active across regions."
chapter: 4
level: "advanced"
readingTime: "11 min"
topics: ["streaming replication", "logical replication", "multi-region", "failover", "replication lag"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Two branches of a bank: one is the main branch (primary), one is a backup branch (replica) that keeps its records synchronized with the main branch in near real-time. If the main branch burns down, the backup branch already has all the account data and can open for business immediately — no restore from tapes needed.

</Callout>

## Streaming Replication (Physical)

PostgreSQL streaming replication sends WAL records from primary to standby in real time. The standby replays them continuously, staying within seconds of the primary.

**How it works:**
```
Primary:  Write transaction → WAL record → Send to replica
Replica:  Receive WAL → Replay → State matches primary (with lag)
```

**Setup on primary (`postgresql.conf`):**
```ini
wal_level = replica
max_wal_senders = 5          # allow up to 5 standbys
wal_keep_size = 1GB          # keep this much WAL for slow standbys
synchronous_standby_names = '' # async replication (see sync section below)
```

**Create replication user:**
```sql
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'reppassword';
```

**pg_hba.conf on primary:**
```
host    replication  replicator  10.0.2.0/24  scram-sha-256
```

**Set up standby:**
```bash
# On standby server: take base backup from primary
pg_basebackup \
  -h primary.db.internal \
  -U replicator \
  -D /var/lib/postgresql/data \
  -P -Xs -R    # -R creates standby.signal + postgresql.auto.conf

# The -R flag creates:
# standby.signal    → tells PostgreSQL to start as standby
# postgresql.auto.conf with:
#   primary_conninfo = 'host=primary.db.internal user=replicator ...'
```

**Start standby:**
```bash
systemctl start postgresql

# Check replication status on primary
psql -c "SELECT client_addr, state, sent_lsn, replay_lsn,
         (sent_lsn - replay_lsn) AS replication_lag
         FROM pg_stat_replication;"
```

## Replication Lag and What It Means for RPO

Async replication means the standby is always slightly behind:

```sql
-- On primary: check how far behind each standby is
SELECT
  client_addr,
  state,
  pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS lag_size,
  extract(epoch FROM (now() - reply_time)) AS lag_seconds
FROM pg_stat_replication;
```

Under normal load, lag is milliseconds to a few seconds. Under heavy write load or network issues, lag can grow to minutes.

**Your RPO = replication lag at the moment of disaster.**

If lag is 30 seconds when the primary fails, you lose 30 seconds of data after promoting the replica. Configure monitoring and alert on lag above your RPO threshold:

```bash
# Alert if replication lag > 60 seconds
SELECT CASE
  WHEN extract(epoch FROM (now() - reply_time)) > 60
  THEN 'ALERT: Replication lag exceeds RPO'
  ELSE 'OK'
END FROM pg_stat_replication;
```

## Synchronous Replication

For zero-data-loss (RPO = 0), configure synchronous replication. The primary waits for at least one standby to confirm it has received and written the WAL before acknowledging the commit.

```ini
# postgresql.conf on primary
synchronous_standby_names = 'FIRST 1 (standby1, standby2)'
# FIRST 1: wait for confirmation from 1 of the listed standbys
# (first one to respond)
```

**The trade-off:**
```
Async replication:
  Commit latency: +0ms (fire and forget)
  RPO: seconds to minutes of potential data loss
  Write throughput: unaffected by standby performance

Synchronous replication:
  Commit latency: +latency to nearest standby (e.g., +2ms same AZ, +50ms cross-region)
  RPO: zero (standby confirmed write before primary ack'd commit)
  Write throughput: limited by standby's write speed + network RTT
```

Cross-region sync replication is expensive in latency. A common pattern: sync replication to an in-region standby (fast, low latency), async replication to a cross-region DR standby (no latency impact, some lag).

```ini
# Sync to in-region standby, async to cross-region
synchronous_standby_names = 'FIRST 1 (standby-az2)'
# standby-dr-region gets async replication (not listed in synchronous_standby_names)
```

## Logical Replication

Physical replication copies WAL byte-for-byte — requires identical PostgreSQL versions and OS. Logical replication decodes WAL into logical changes (INSERT/UPDATE/DELETE) and replays them on the subscriber.

Use cases:
- Replicate to a different PostgreSQL major version (upgrade path)
- Replicate specific tables, not the full database
- Replicate to a different schema or transform data during replication
- Zero-downtime major version upgrades

```sql
-- On publisher (source)
ALTER SYSTEM SET wal_level = 'logical';
-- Restart PostgreSQL

-- Create publication
CREATE PUBLICATION orders_pub FOR TABLE orders, order_items;

-- On subscriber (destination)
CREATE SUBSCRIPTION orders_sub
  CONNECTION 'host=primary.db.internal dbname=mydb user=replicator password=...'
  PUBLICATION orders_pub;

-- Monitor replication
SELECT subname, received_lsn, latest_end_lsn, latest_end_time
FROM pg_stat_subscription;
```

**Logical replication limitations:**
- DDL (schema changes) are not replicated — must apply manually on both sides
- Sequences not replicated — subscriber starts at its own position
- Large objects not replicated
- Requires primary keys or replica identity on all replicated tables

## Promoting a Standby

When the primary fails, promote the standby to accept writes:

```bash
# Method 1: pg_ctl promote
pg_ctl promote -D /var/lib/postgresql/data

# Method 2: touch trigger file (if configured)
touch /tmp/postgresql.trigger

# Method 3: pg_promote() function (Postgres 12+, from inside psql)
SELECT pg_promote();

# Verify promotion
psql -c "SELECT pg_is_in_recovery();"
# f = primary (no longer in recovery)
```

**After promotion — update connection strings:**
```bash
# Update application environment to point to new primary
aws ssm put-parameter \
  --name /myapp/prod/DATABASE_URL \
  --value "postgresql://app:pass@replica.db.internal:5432/mydb" \
  --type SecureString \
  --overwrite

# Restart or signal app servers to pick up new config
kubectl rollout restart deployment/api
```

## Patroni: Automated Failover

Manual failover is slow and error-prone. [Patroni](https://github.com/zalando/patroni) automates it using etcd, Consul, or ZooKeeper as a distributed consensus store.

```yaml
# patroni.yml
scope: postgres-cluster
name: node1

restapi:
  listen: 0.0.0.0:8008
  connect_address: 10.0.1.10:8008

etcd:
  hosts: 10.0.0.10:2379,10.0.0.11:2379,10.0.0.12:2379

bootstrap:
  dcs:
    ttl: 30               # primary lease duration (seconds)
    loop_wait: 10         # check interval
    retry_timeout: 10
    maximum_lag_on_failover: 1048576  # only failover if lag < 1MB

postgresql:
  listen: 0.0.0.0:5432
  connect_address: 10.0.1.10:5432
  data_dir: /var/lib/postgresql/data
  parameters:
    wal_level: replica
    max_wal_senders: 5
```

Patroni monitors primary health and automatically promotes the most up-to-date replica when the primary fails, typically within 30–60 seconds.

## Cross-Region Architecture

```
Region: us-east-1 (primary)
  Primary DB (read/write)
    ↓ sync replication
  Standby-AZ2 (hot standby, same region)
    ↓ async replication
  ↓
Region: us-west-2 (DR)
  Read Replica (accepts read queries, ready for promotion)
  WAL-G backups to S3 (cross-region backup)
```

**Read traffic to cross-region replica** reduces query latency for west-coast users and keeps the DR replica warm (it's already serving production traffic, so promotion is less disruptive).

**Failover procedure for region failure:**
```bash
# 1. Confirm primary region is unavailable
aws ec2 describe-instances --region us-east-1 --query 'Reservations[*].Instances[*].State'

# 2. Promote DR replica
ssh postgres@dr-db.us-west-2.internal
pg_ctl promote -D /var/lib/postgresql/data

# 3. Update global DNS (Route53 health check should do this automatically)
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch '{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "db.myapp.com",
      "Type": "CNAME",
      "TTL": 60,
      "ResourceRecords": [{"Value": "dr-db.us-west-2.internal"}]
    }
  }]
}'

# 4. Update app config if not using DNS
aws ssm put-parameter --region us-west-2 \
  --name /myapp/prod/DATABASE_URL \
  --value "postgresql://app:pass@dr-db.us-west-2.internal:5432/mydb" \
  --overwrite

# 5. Deploy/restart apps in DR region
```

## Replication Monitoring Checklist

```
□ Replication lag monitored and alerted (threshold = RPO target)
□ pg_stat_replication checked in weekly ops review
□ WAL sender and receiver counts alerted (should be > 0)
□ Standby disk space monitored (replica needs same space as primary)
□ pg_basebackup test: can you take a fresh backup from primary?
□ Promotion tested quarterly (see restore drills chapter)
□ DNS/load balancer failover tested (not just DB promotion)
□ Application reconnection after failover tested (connection pool behavior)
```

