---
title: 'SRE-দের জন্য Database Internals'
subtitle: "MVCC, replication lag, hot rows, query plans, B-tree vs LSM, স্কেলে connection pools। যে DB জ্ঞান 'আমি Postgres চালাই'-কে 'আমি চাপের মুখেও Postgres টিকিয়ে রাখি' থেকে আলাদা করে।"
chapter: 14
level: 'mastery'
readingTime: '30 মিনিট'
topics:
  ['postgres', 'mysql', 'replication', 'MVCC', 'query planning', 'connection pool', 'B-tree', 'LSM']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

আপনি ড্রাইভার হলেও গাড়ির engine কীভাবে কাজ করে সেটা জানা — আপনি এটা নতুন করে বানান না, কিন্তু কখন শব্দটা গুরুতর সেটা বোঝেন।

</Callout>

## গল্পে বুঝি

শহরের সবচেয়ে বড় রেকর্ড-আর্কাইভের ম্যানেজার ফাতিমা আল-ফিহরি। লক্ষ লক্ষ ফাইল, সারি সারি তাক। কিন্তু আর্কাইভটা মসৃণভাবে চলে শুধু একটাই কারণে — ফাতিমা ভেতরের যন্ত্রপাতিটা বোঝেন। কেউ একটা নথি খুঁজতে এলে তিনি জানেন, সামনের index-card ক্যাটালগ থেকে দেখলে সেকেন্ডে তাকের নম্বর পাওয়া যায়; কিন্তু ক্যাটালগ এড়িয়ে গোটা তাক এক এক করে খুঁজলে সেই একই কাজে আধা ঘণ্টা লেগে যায়। তাই ধীরগতির অভিযোগ এলে তিনি আগে দেখেন — খোঁজাটা ক্যাটালগ ধরে হচ্ছে, নাকি পুরো তাক scan করে।

একদিন সকালে কাজ থমকে গেল। এক ক্লার্ক একটা ড্রয়ার সম্পাদনার জন্য খুলে সেটায় তালা দিয়ে বসে আছে — বাকি সবাই সেই এক ড্রয়ারের জন্য লাইনে দাঁড়িয়ে অপেক্ষা করছে, কেউ এগোতে পারছে না। এদিকে শাখা-অফিস ফোন করে বলছে তাদের নথিটা এখনও পুরনো, কারণ শাখার ফটোকপি-করা ক্যাটালগ মূল ক্যাটালগের চেয়ে সবসময় কয়েক মিনিট পিছিয়ে থাকে। আর সামনের ডেস্কে অনুরোধের স্তূপ জমছে — কারণ ফাতিমার হাতে গোনা কয়েকজন রানার-বয়, সবাই এখন ব্যস্ত, তাই নতুন অনুরোধ কেউ তুলছেই না, শুধু জমছে। ফাতিমা এক এক করে আসল কারণ ধরে ঠিক করলেন: তালা-দেওয়া ক্লার্ককে দ্রুত শেষ করালেন, শাখাকে বললেন জরুরি নথি মূল ক্যাটালগ থেকেই দেখতে, আর রানার-বয়ের সংখ্যার বেশি অনুরোধ যেন একসাথে না ঢোকে সেই বন্দোবস্ত করলেন।

এই আর্কাইভটাই একটা database, আর ফাতিমা হলেন SRE। index-card ক্যাটালগ বনাম গোটা-তাক scan — এটাই **query plan** আর **index**: ক্যাটালগ থাকলে (আর optimizer সেটা ব্যবহার করলে) খোঁজা দ্রুত, না থাকলে full seq scan-এ crawl করে। একটা ড্রয়ারে তালা দিয়ে সবাইকে লাইনে দাঁড় করানো — এটাই **lock contention**: এক row-তে writer বসে থাকলে বাকিরা serialize হয়ে অপেক্ষা করে। শাখার ক্যাটালগ মূলটার চেয়ে পিছিয়ে থাকা — এটাই **replication lag**, replica সবসময় primary-র কয়েক সেকেন্ড/মিনিট পেছনে। আর সব রানার-বয় ব্যস্ত থাকায় অনুরোধ জমে যাওয়া — এটাই **connection pool** exhaustion: pool-এর সব connection আটকে গেলে নতুন request queue-তে পড়ে থাকে, service কার্যত down। বাস্তবে Postgres চালানো SRE ঠিক এভাবেই কাজ করেন — `EXPLAIN ANALYZE`-এ plan দেখেন, `pg_stat_activity`-তে lock আর long transaction ধরেন, replication lag-এ time দিয়ে alert দেন, আর PgBouncer দিয়ে connection pool সামলান। ভেতরের যন্ত্রপাতি জানেন বলেই তিনি উপসর্গ নয়, আসল কারণটা সারান।

## SRE-দের কেন DB internals লাগে

একজন backend dev `SELECT * FROM users WHERE id = $1` দিয়ে একটা feature ship করতে পারে। একজন senior SRE-কে জবাব দিতে হয়: আজ কেন এই query 12 GB RAM খাচ্ছে, রাত 3টায় replica lag কেন হঠাৎ 40 মিনিটে লাফ দিল, কেন `pg_stat_activity`-তে 800টা idle-in-transaction connection দেখাল, আর কেন একই query plan quarter-এ একবার index scan থেকে seq scan-এ flip করে যায়।

এই chapter হলো database-এর operating layer। ধরে নেওয়া হচ্ছে আপনি SQL লিখতে পারেন; এটা শেখায় আপনি submit করার পর database আসলে _কী করে_।

## Storage engines — B-tree vs LSM, আর কেন এটা গুরুত্বপূর্ণ

আধুনিক database-এ দুটো family প্রাধান্য পায়। এই পছন্দ downstream-এর সবকিছু নির্ধারণ করে দেয় — write amplification, compaction stalls, p99 latency, recovery time।

### B-tree (Postgres, MySQL InnoDB, SQL Server)

```
- Pages of fixed size (typically 8 KB or 16 KB).
- Updates rewrite pages in place (with WAL/redo log for crash recovery).
- Read latency very predictable: O(log N) with high fan-out → 3–4 disk reads.
- Write latency = WAL fsync + buffer pool dirty page eventually flushed.
- Wins for: read-heavy + balanced read/write workloads.
- Loses on: write-amplified workloads (every random write = page rewrite).
```

### LSM-tree (RocksDB, Cassandra, ScyllaDB, BigTable, Pebble)

```
- Writes go to an in-memory memtable, then flushed to immutable SSTables.
- Reads check memtable + multiple SSTables (bloom filters skip most).
- Background compaction merges SSTables to limit read amplification.
- Writes are sequential (no in-place updates) → great for SSDs at write-heavy scale.
- p99 latency suffers during compaction storms — this is the operational pain.
- Wins for: write-heavy, append-mostly workloads (timeseries, logs, KV).
```

### Operational implications

|                   | B-tree (Postgres)                      | LSM (Cassandra/Rocks)              |
| ----------------- | -------------------------------------- | ---------------------------------- |
| যা p99 বাড়ায়    | Vacuum, hot table-এ autovacuum         | Compaction storms                  |
| যা disk বাড়ায়   | WAL bursts, full-page writes           | Compaction-এর সময় SSTable rewrite |
| যা memory বাড়ায় | Connection sort/hash work              | Bloom filter + block cache         |
| Tail-latency knob | `checkpoint_timeout`, `bgwriter_delay` | Compaction throttle, level sizing  |
| Backup pattern    | pg_basebackup + WAL replay             | snapshot SSTables (immutable!)     |

আপনি engine বাছেন না, team database বাছে। কিন্তু আপনি কোন family চালাচ্ছেন সেটা জানা মানে জানা কোন knob-গুলো আসলে _আছে_।

## MVCC — Postgres-এর অর্ধেক চমকের উৎস

Multi-Version Concurrency Control: আপনি যখন একটা row `UPDATE` করেন, database সেটা overwrite করে না — একটা নতুন row version (tuple) লেখে আর পুরনো version-কে dead হিসেবে mark করে। Reader-রা তাদের snapshot অনুযায়ী current version দেখে।

এই কারণেই:

```sql
-- This UPDATE doesn't free disk space.
UPDATE users SET last_login = now() WHERE id = 1;
-- It writes a new tuple. The old tuple is dead but still on disk.

-- Run this 1M times on a 1M-row table:
-- The table is now 2M tuples on disk. Half are dead.
-- VACUUM is what reclaims the space.
```

### Senior-SRE-দের Postgres failure mode

**1. Long-running transaction vacuum block করে।**

```
A reporting query runs for 4 hours.
That query holds a snapshot — vacuum can't clean dead tuples newer than the snapshot.
Bloat grows. Hot tables triple in size. Indexes thrash. p99 doubles.
```

Detection:

```sql
SELECT pid, now() - xact_start AS xact_age, query
FROM pg_stat_activity
WHERE state != 'idle' AND xact_start < now() - interval '5 minutes'
ORDER BY xact_age DESC;
```

Mitigation: transaction-টা kill করুন, তারপর `VACUUM`। দীর্ঘমেয়াদে: reporting আলাদা করে একটা replica-তে নিন।

**2. Idle-in-transaction।**

```
App opens BEGIN, does an UPDATE, then... hangs (waiting for an external API).
The connection sits idle but holds row locks AND a snapshot.
Other writers wait. Vacuum can't progress.
```

`idle_in_transaction_session_timeout = '30s'` সেট করুন। এর বাইরে যা কিছু মানে রাত 3টার page ডেকে আনা।

**3. Wraparound।**

Postgres 32-bit transaction ID ব্যবহার করে। সবচেয়ে পুরনো unfrozen XID যদি 2 billion-এর বেশি পিছিয়ে যায়, database write নেওয়া বন্ধ করে দেয় ("To prevent data loss, the database is shut down.")।

```sql
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;
-- Anything > 1.5 billion: page now.
```

Wraparound Sentry, Mailchimp আর আরও অনেককে ধসিয়ে দিয়েছে। আধুনিক PG (14+, PG 16/17 সহ) এটা ভালোভাবে সামলায় — incremental freezing emergency vacuum কমায় — কিন্তু 32-bit XID-এর failure mode-টা এখনও আছে। version যাই হোক, `age(datfrozenxid)` monitor করুন আর 1.5B-তে alert দিন।

## Replication lag — যে metric-এ আপনাকে alert করতেই হবে

প্রতিটা read replica lag করে। প্রশ্ন হলো: কতটা, আর আপনার tolerance কী?

### Postgres-এ lag-এর ধরন

```sql
-- Bytes of WAL not yet sent
SELECT client_addr,
       pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS sent_lag_bytes,
       pg_wal_lsn_diff(pg_current_wal_lsn(), write_lsn) AS write_lag_bytes,
       pg_wal_lsn_diff(pg_current_wal_lsn(), flush_lsn) AS flush_lag_bytes,
       pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS replay_lag_bytes
FROM pg_stat_replication;

-- On the replica: how far behind in time
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag_time;
```

তিনটা কারণ, frequency অনুযায়ী সাজানো:

**1. Replica-তে long-running query।** Replica query result consistent রাখতে replay pause করে (`hot_standby_feedback`) অথবা conflicting query abort করে (default)। যেভাবেই হোক, বড় BI query lag spike ঘটায়।

**2. WAL write throughput replica disk-কে ছাড়িয়ে যায়।** slower disk-ওয়ালা সস্তা replica write storm-এ পিছিয়ে পড়ে। সমাধান দ্রুত disk, "tune postgres" নয়।

**3. Single-threaded WAL replay।** Postgres এক thread-এ WAL replay করে। primary-তে 5টা parallel writer যে bulk insert-এর burst নিয়েছে সেটা replay করতে 5x সময় লাগতে পারে। স্কেলে সমাধান: logical replication যা per-table parallel-এ replay করে (Postgres 16+: `parallel_apply`)।

<Callout type="tip">

**lag-এ alert দিন time-এ, byte-এ নয়।** write rate ছাড়া "10 GB behind"-এর কোনো মানে নেই। "120 seconds behind" user-facing impact বলে দেয়: replica-তে route হওয়া একটা query হয়তো 90 second আগে user-এর লেখা data মিস করবে।

</Callout>

### Read-after-write — যে consistency-র জন্য আপনার নামে মামলা হবে

একজন user তার profile update করে, তারপর profile page load করে। App replica থেকে read করে। Replica 2 second পিছিয়ে। User stale data দেখে।

Mitigation, simplicity অনুযায়ী সাজানো:

```typescript
// 1. Sticky reads after writes — keep reads on the primary for N seconds
//    after a user's write. Track in session/cookie.
async function getUser(id, session) {
  const recentlyWroteToUser = session.lastWriteAt > Date.now() - 5000;
  return recentlyWroteToUser ? primaryDb.get(id) : replicaDb.get(id);
}

// 2. Causal read on the replica — wait for replica to catch up to the LSN
//    of the write before serving the read.
async function readAfterWrite(writeLsn) {
  while ((await replicaDb.lastReplayLsn()) < writeLsn) await sleep(50);
  return replicaDb.query(...);
}

// 3. Use a stronger replication mode (synchronous_commit = on) for
//    user-visible writes. Costs latency on every write.
```

বেশিরভাগ team option 1 বাছে — সস্তা আর human-driven UX-এর জন্য যথেষ্ট ভালো।

## Query planning — কেন একই query আজ fast আর কাল slow

Optimizer `ANALYZE`-এর জমানো statistics দিয়ে প্রতিটা step-এর row estimate করে। estimate ভুল হলে খারাপ plan বাছে। classic failure:

```sql
-- Statistics say this column has 100 distinct values, evenly distributed.
-- Reality: 99% of rows have value 'A'.
-- The optimizer estimates `WHERE category = 'A'` returns 10k rows.
-- It picks an index scan that fetches 10k rows... but actually fetches 990k.
-- Query runs 100x slower than it should.
```

Diagnosis:

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ... ;
--                              ^ tells you actual rows + actual time
--                                vs estimated rows.
-- Big estimate-vs-actual gap = bad statistics.
```

Fixes:

```sql
ANALYZE my_table;                              -- update stats
ALTER TABLE my_table ALTER COLUMN category SET STATISTICS 1000;  -- finer histogram
CREATE STATISTICS my_table_extstats (dependencies)
  ON category, status FROM my_table;          -- multi-column correlations
```

### Plan-flip outage

যে pattern শেষ পর্যন্ত প্রতিটা PG-চালানো company-কে আঘাত করে:

```
3 AM: autoanalyze runs on `orders` table.
      Statistics shift slightly because of overnight batch load.
      One query's estimated row count crosses the boundary that flips
      its plan from index scan to seq scan.
      Query goes from 2 ms to 4 seconds.
      All connections fill with the slow query. Pool exhausted. App down.
```

Detection: `pg_stat_statements`-এ query-র mean time spike দেখায়। Mitigation: plan pin করুন (ঐ query-র জন্য `SET enable_seqscan = off`, অথবা pg_hint_plan ব্যবহার), তারপর reanalyze।

Prevention: এমন query লিখবেন না যার plan সামান্য statistics পরিবর্তনে sensitive। `LIMIT` ব্যবহার করুন। ঠিক composite index যোগ করুন। query plan-কে আপনার API contract-এর অংশ হিসেবে ভাবুন।

## Connection pool — যেখানে production আসলে মরে

10 ms query-ওয়ালা একটা 100-RPS service-এর গড়ে ~1 connection লাগে। সাধারণ একটা app 50টা খোলে। 20টা app instance-এ database 1,000 connection দেখে। Postgres-এর `max_connections`-এর default 100। প্রতিটা connection-এ ~10 MB memory খরচ। 1,000 connection-এ শুধু connection state-এ 10 GB।

এই কারণেই প্রতিটা Postgres-at-scale shop সামনে **PgBouncer** (বা rds-proxy, pgcat) বসায়:

```
App instances (200) → PgBouncer (transaction pooling, ~100 conns each)
                   → Postgres (200 backend processes total)
```

### Pool modes

```
session pooling     — connection assigned for whole client session.
                      Useful for: prepared statements, SET commands.
transaction pooling — connection released after each transaction.
                      The mode you actually want at scale.
                      Restriction: no session-level state across txns.
statement pooling   — released after each statement. Usually too aggressive.
```

Transaction pooling সেই code ভাঙে যা `SET search_path` বা `LISTEN/NOTIFY` বা session-level prepared statement ব্যবহার করে। চালু করার আগে audit করুন।

### Pool-এর size ঠিক করা

underrated math। Pool খুব ছোট: request queue করে, latency বাড়ে। Pool খুব বড়: database-এ lock contention আর context switch-এ cycle খরচ হয়, throughput _কমে_।

```
Optimal pool size ≈ ((cores * 2) + effective_spindle_count)

For a 16-core PG server with NVMe (treat as 1 spindle):
  optimal ≈ 32 connections

You almost never want > 4x cores on the DB side.
```

HikariCP-র docs-এ original benchmark আছে; এটা সাধারণভাবে প্রযোজ্য।

## Hot rows আর lock contention

দুজন writer একই row update করে → তারা serialize হয়। একটা single counter row-তে 10k RPS-এ database single-threaded।

classic case: প্রতিটা request-এ increment হওয়া একটা `pageviews` counter।

```sql
UPDATE counters SET pageviews = pageviews + 1 WHERE name = 'home';
-- Locks the row. Every other update waits.
-- Throughput cap: 1 / latency_per_update. ~5k/s on healthy PG. Then it falls over.
```

সমাধানের pattern:

```sql
-- 1. Sharded counters: 100 rows, increment a random one, sum on read.
UPDATE counters SET val = val + 1 WHERE name = 'home' AND shard = (random()*100)::int;
SELECT sum(val) FROM counters WHERE name = 'home';

-- 2. Async aggregation: write events to an append-only table; sum periodically.
INSERT INTO pageview_events (ts, page) VALUES (now(), 'home');
-- A cron job sums events into counters every minute.

-- 3. Move counters out of the OLTP DB entirely. Redis INCR. Or a TSDB.
```

এই pattern আপনি user-facing leaderboard, billing-event meter আর rate limiter-এ দেখবেন। সমাধান architectural; DB tuning আপনাকে বাঁচাবে না।

## Index strategy — operational দৃষ্টিভঙ্গি

Index read দ্রুত করে, write ধীর করে আর disk খায়। Senior team-রা index-কে infrastructure-এর মতো treat করে।

```sql
-- Find unused indexes (eligible for drop)
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname NOT IN ('pg_catalog');

-- Find duplicate indexes (covered by another index)
-- Use pg_extension `pgstattuple` or queries from pgexperts/pg_squeeze.

-- Check index bloat after heavy update workloads
SELECT * FROM pgstattuple('my_index'::regclass);
-- > 30% wasted space? REINDEX CONCURRENTLY.
```

### CONCURRENTLY non-negotiable

```sql
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
REINDEX INDEX CONCURRENTLY idx_users_email;
```

`CONCURRENTLY` ছাড়া operation-টা বড় table-এ কয়েক মিনিট থেকে কয়েক ঘণ্টা exclusive lock নেয়। এটা দিয়ে operation online থাকে কিন্তু ~2x বেশি সময় লাগে। সবসময় সময়টা দিন; lock-টা কখনো নয়।

## Load-এর মধ্যে migrations

প্রতিটা team শেষ পর্যন্ত একটা hot table-এ long migration করে। ফাঁদগুলো:

```sql
-- BAD: rewrites every row, holds AccessExclusiveLock.
ALTER TABLE orders ALTER COLUMN id TYPE BIGINT;

-- BAD: in older PG, adding a column with a default rewrote the whole table.
-- (PG 11+ avoids the rewrite for non-volatile defaults.)
ALTER TABLE orders ADD COLUMN total_cents BIGINT DEFAULT 0 NOT NULL;
```

online migration-এর জন্য যে pattern কাজ করে:

```
1. Add the new column nullable. (Cheap metadata change.)
2. Backfill in batches (10k rows / batch, sleep 100ms between).
3. Add NOT NULL once backfill done — using CHECK NOT VALID + VALIDATE
   to avoid the table rewrite.
4. Switch the app to read/write the new column.
5. Drop the old column.
```

যে tool এটা নিরাপদে automate করে: `pg_repack`, `pg_squeeze`, GitHub-এর `gh-ost` (MySQL)।

## Backup আর recovery — SRE-level প্রশ্ন

যে backup আপনি restore করেননি সেটা backup না। quarterly test করুন।

একজন senior SRE যে প্রশ্নগুলো করে:

```
- RPO?  How much data can you lose?           → drives backup frequency
- RTO?  How long can you be down?             → drives restore strategy
- WAL retention?  Can you PITR to T-7d?       → not just nightly snapshot
- Off-region copies?                          → survive a regional outage
- Backup encryption + key rotation?           → compliance + safety
- Quarterly restore drill: time to RPO+RTO?   → real numbers, not promises
```

স্কেলে Postgres-এর pattern:

- snapshot-এর জন্য `pg_basebackup`, plus continuous WAL archiving (`pgbackrest`, `wal-g`)।
- একটা test cluster প্রতি রাতে গতকালের backup থেকে restore হয়; তার উপর smoke test চলে।
- catastrophic-corruption escape hatch-এর জন্য এর সাথে logical backup (`pg_dump`)।

## Application দিক থেকে connection patterns

যে app-side নিয়মগুলো বেশিরভাগ DB outage ঠেকায়:

```typescript
// 1. Set statement_timeout per query class.
//    OLTP: 5s. Reports: 60s. Background: 5min.
await db.query("SET LOCAL statement_timeout = '5s'");
await db.query('SELECT ...');

// 2. Always set lock_timeout for any DDL.
await db.query("SET LOCAL lock_timeout = '5s'");
await db.query('ALTER TABLE ...');

// 3. Use a queue for big batch work, not a single transaction.
//    Long transactions block vacuum (see MVCC section).

// 4. Retry on serialization failure (40001), deadlock (40P01) only.
//    Don't retry on constraint violations.

// 5. Use prepared statements via the driver, but watch session pooling
//    if you're behind PgBouncer transaction-mode.
```

## Tools tier list

```
Tier S (cold)
  pg_stat_activity, pg_stat_statements, EXPLAIN ANALYZE,
  PgBouncer (operate it daily), wal-g / pgbackrest

Tier A (worth a week)
  pg_stat_kcache, auto_explain, pg_buffercache,
  pg_repack / pg_squeeze, pgcat, pg_qualstats

Tier B (specialist)
  Datadog DBM / Aiven Insights / pganalyze (managed query analytics)
  pg_partman (partitioning), Citus (horizontal sharding)

Tier F
  Random "10 sysctl tuning tips for Postgres" blog posts
  Trusting CPU% as a DB health metric
```

## Sev-1 ঘটায় এমন common pitfall

1. **এক team-এর `SELECT * FROM events ORDER BY ts`-কে peak-এ OLTP DB table-scan করতে দেওয়া।** replica বা column store ব্যবহার করুন; OLTP analytics-এর জন্য নয়।
2. **`max_connections = 1000` কারণ "আমাদের 1000টা app thread আছে।"** সবসময় pool করুন। সবসময়।
3. **Untested failover।** production-এ প্রথমবার primary fail over করাটা কখনো actual outage-এর সময় হওয়া উচিত নয়।
4. **`CONCURRENTLY` বা batch backfill ছাড়া schema migration।** `users`-এ 30-মিনিটের lock একটা P0।
5. **App-side-এ কোনো `statement_timeout` নেই।** একটা runaway report প্রতিটা connection খেয়ে ফেলে।
6. **"noise কমাতে" Vacuum disable করা।** আপনি wraparound-এ পৌঁছবেন। এটা মজার না।

## আপডেটেড থাকুন

- [PostgreSQL docs](https://www.postgresql.org/docs/current/) — version-current; performance, MVCC, WAL-এর index
- [MySQL reference](https://dev.mysql.com/doc/refman/en/) — InnoDB internals
- [Use the Index, Luke](https://use-the-index-luke.com/) — index theory, free
- [Designing Data-Intensive Applications (Kleppmann)](https://dataintensive.net/) — টেকসই database fundamentals

## মূল শিক্ষা

1. **Storage engine failure mode নির্ধারণ করে** — B-tree vacuum bloat-এ মরে, LSM compaction-এ মরে।
2. **MVCC + long transaction = bloat** — `idle_in_transaction_session_timeout` সেট করুন।
3. **Replication lag একটা time metric, byte metric নয়** — second-এ alert দিন।
4. **PgBouncer দিয়ে pool করুন; ~2x cores-এ size করুন** — বড় মানে ধীর, দ্রুত নয়।
5. **Plan-flip নীরব outage ঘটায়** — `pg_stat_statements` আপনার সবচেয়ে আগের warning।
6. **Untested backup-এর অস্তিত্ব নেই** — timer চালু রেখে quarterly restore drill।
