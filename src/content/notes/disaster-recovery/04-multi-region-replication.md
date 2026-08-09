---
title: 'Multi-Region Replication'
subtitle: 'Streaming replication, logical replication, আর region জুড়ে active-passive vs active-active-এর trade-off।'
chapter: 4
level: 'advanced'
readingTime: '11 মিনিট'
topics:
  ['streaming replication', 'logical replication', 'multi-region', 'failover', 'replication lag']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা আল-ফিহরির কাপড়ের বড় ব্যবসা বুখারা শহরে। কিন্তু তিনি একটা ঝুঁকির কথা সবসময় মাথায় রাখেন — বুখারায় বন্যা হলে, বিদ্যুৎ চলে গেলে, বা পুরো শহর অচল হয়ে গেলে তার পুরো ব্যবসা এক দিনেই বসে যাবে। তাই তিনি বুখারা থেকে বহু দূরে সমরকন্দে হুবহু একই রকম আরেকটা শাখা খুললেন — একই স্টক, একই খাতা, একই দাম। শুধু খুলেই বসে থাকলেন না; প্রতিদিন প্রতিটা বিক্রি, প্রতিটা নতুন মাল বুখারার খাতা থেকে সমরকন্দের খাতায় সাথে সাথে তুলে রাখার ব্যবস্থা করলেন, যাতে দুই শহরের হিসাব সবসময় এক থাকে।

একদিন সত্যিই বুখারায় ভয়াবহ বন্যা এল, মূল দোকান পানির নিচে। ফাতিমা এক মুহূর্ত দেরি না করে সব গ্রাহককে সমরকন্দের শাখায় পাঠিয়ে দিলেন — সেখানে তো ইতিমধ্যেই সবার হিসাব, সব মাল প্রস্তুত। ব্যবসা প্রায় না থেমেই চলতে থাকল। তবে এর দাম ছিল: দুই শহরে দুই সেট দোকান, দুই সেট কর্মী চালাতে হয়েছে, আর দূরত্বের কারণে দুই খাতা নিখুঁতভাবে এক রাখাটাই ছিল সবচেয়ে কঠিন কাজ — কোনো এক বিক্রি সমরকন্দে পৌঁছাতে একটু দেরি হলেই দুই হিসাবে সামান্য গরমিল হতো।

দুই দূরের শহর মানে দুটো আলাদা region; সমরকন্দের সবসময়-sync করা ডুপ্লিকেট শাখাটাই হলো multi-region replication; বন্যার সময় গ্রাহকদের সমরকন্দে সরিয়ে দেওয়াটা হলো regional failover। আর দুই সেট সব কিছু চালানো ও দূরত্বজুড়ে হিসাব এক রাখার কষ্টটাই হলো cost আর cross-region latency/consistency-র trade-off। বাস্তবে AWS-এর মতো ক্লাউডে ঠিক এই কারণেই আলাদা region (যেমন us-east-1 আর us-west-2) জুড়ে replica রাখা হয় — একটা region পুরো ডুবে গেলেও অন্য region-এ failover করে সিস্টেম টিকে থাকে।

<Callout type="info">

**বাস্তব উদাহরণ**

একটা ব্যাংকের দুটো শাখা: একটা মূল শাখা (primary), একটা ব্যাকআপ শাখা (replica) যা প্রায় রিয়েল-টাইমে মূল শাখার সাথে তার রেকর্ড synchronized রাখে। মূল শাখা পুড়ে গেলে ব্যাকআপ শাখায় ইতিমধ্যেই সব অ্যাকাউন্ট ডেটা আছে আর সাথে সাথেই ব্যবসা শুরু করতে পারে — টেপ থেকে কোনো restore লাগে না।

</Callout>

## Streaming Replication (Physical)

PostgreSQL streaming replication রিয়েল টাইমে primary থেকে standby-তে WAL record পাঠায়। standby সেগুলো continuous replay করে, primary-র কয়েক সেকেন্ডের মধ্যে থেকে।

**এটা কীভাবে কাজ করে:**

```
Primary:  Write transaction → WAL record → Send to replica
Replica:  Receive WAL → Replay → State matches primary (with lag)
```

**primary-তে setup (`postgresql.conf`):**

```ini
wal_level = replica
max_wal_senders = 5          # allow up to 5 standbys
wal_keep_size = 1GB          # keep this much WAL for slow standbys
synchronous_standby_names = '' # async replication (see sync section below)
```

**replication user তৈরি করা:**

```sql
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'reppassword';
```

**primary-তে pg_hba.conf:**

```
host    replication  replicator  10.0.2.0/24  scram-sha-256
```

**standby সেট আপ করা:**

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

**standby চালু করা:**

```bash
systemctl start postgresql

# Check replication status on primary
psql -c "SELECT client_addr, state, sent_lsn, replay_lsn,
         (sent_lsn - replay_lsn) AS replication_lag
         FROM pg_stat_replication;"
```

## Replication Lag আর RPO-র জন্য এর মানে কী

Async replication মানে standby সবসময় সামান্য পিছিয়ে:

```sql
-- On primary: check how far behind each standby is
SELECT
  client_addr,
  state,
  pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS lag_size,
  extract(epoch FROM (now() - reply_time)) AS lag_seconds
FROM pg_stat_replication;
```

সাধারণ লোডে lag মিলিসেকেন্ড থেকে কয়েক সেকেন্ড। ভারী write লোড বা নেটওয়ার্ক সমস্যায় lag কয়েক মিনিট পর্যন্ত বাড়তে পারে।

**আপনার RPO = disaster-এর মুহূর্তে replication lag।**

যদি primary ফেল করার সময় lag ৩০ সেকেন্ড হয়, replica promote করার পর আপনি ৩০ সেকেন্ডের ডেটা হারান। monitoring কনফিগার করুন আর আপনার RPO threshold-এর উপরে lag হলে alert দিন:

```bash
# Alert if replication lag > 60 seconds
SELECT CASE
  WHEN extract(epoch FROM (now() - reply_time)) > 60
  THEN 'ALERT: Replication lag exceeds RPO'
  ELSE 'OK'
END FROM pg_stat_replication;
```

## Synchronous Replication

zero-data-loss (RPO = 0)-এর জন্য synchronous replication কনফিগার করুন। commit acknowledge করার আগে primary অন্তত একটা standby-র WAL received আর written হওয়ার নিশ্চয়তার জন্য অপেক্ষা করে।

```ini
# postgresql.conf on primary
synchronous_standby_names = 'FIRST 1 (standby1, standby2)'
# FIRST 1: wait for confirmation from 1 of the listed standbys
# (first one to respond)
```

**trade-off:**

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

Cross-region sync replication latency-তে ব্যয়বহুল। একটা কমন প্যাটার্ন: in-region standby-তে sync replication (দ্রুত, কম latency), cross-region DR standby-তে async replication (latency-তে প্রভাব নেই, কিছুটা lag)।

```ini
# Sync to in-region standby, async to cross-region
synchronous_standby_names = 'FIRST 1 (standby-az2)'
# standby-dr-region gets async replication (not listed in synchronous_standby_names)
```

## Logical Replication

Physical replication WAL byte-for-byte কপি করে — একই PostgreSQL ভার্সন আর OS দরকার। Logical replication WAL-কে logical পরিবর্তনে (INSERT/UPDATE/DELETE) decode করে আর subscriber-এ সেগুলো replay করে।

Use case:

- একটা ভিন্ন PostgreSQL major version-এ replicate করা (upgrade path)
- নির্দিষ্ট table replicate করা, পুরো ডেটাবেস নয়
- একটা ভিন্ন schema-তে replicate করা বা replication-এর সময় ডেটা transform করা
- Zero-downtime major version upgrade

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

**Logical replication-এর সীমাবদ্ধতা:**

- DDL (schema পরিবর্তন) replicate হয় না — দুই দিকেই ম্যানুয়ালি প্রয়োগ করতে হয়
- Sequence replicate হয় না — subscriber তার নিজের অবস্থান থেকে শুরু করে
- Large object replicate হয় না
- সব replicated table-এ primary key বা replica identity দরকার

## একটা Standby Promote করা

primary ফেল করলে, write গ্রহণ করার জন্য standby-কে promote করুন:

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

**Promotion-এর পর — connection string আপডেট করা:**

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

## Patroni: অটোমেটেড Failover

ম্যানুয়াল failover ধীর আর ভুলপ্রবণ। [Patroni](https://github.com/zalando/patroni) distributed consensus store হিসেবে etcd, Consul, বা ZooKeeper ব্যবহার করে এটা অটোমেট করে।

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
    ttl: 30 # primary lease duration (seconds)
    loop_wait: 10 # check interval
    retry_timeout: 10
    maximum_lag_on_failover: 1048576 # only failover if lag < 1MB

postgresql:
  listen: 0.0.0.0:5432
  connect_address: 10.0.1.10:5432
  data_dir: /var/lib/postgresql/data
  parameters:
    wal_level: replica
    max_wal_senders: 5
```

Patroni primary-র health মনিটর করে আর primary ফেল করলে সবচেয়ে up-to-date replica-কে স্বয়ংক্রিয়ভাবে promote করে, সাধারণত ৩০–৬০ সেকেন্ডের মধ্যে।

## Cross-Region আর্কিটেকচার

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

**Cross-region replica-তে read traffic** west-coast ইউজারদের জন্য query latency কমায় আর DR replica-কে warm রাখে (এটা ইতিমধ্যেই production traffic serve করছে, তাই promotion কম বিঘ্নকর)।

**Region failure-এর জন্য failover প্রসিডিওর:**

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
