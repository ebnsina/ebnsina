---
title: 'Database Internals for SREs'
subtitle: "MVCC, replication lag, hot rows, query plans, B-tree vs LSM, connection pools at scale. The DB knowledge that separates 'I run Postgres' from 'I keep Postgres up under fire.'"
chapter: 14
level: 'mastery'
readingTime: '30 min'
topics:
  ['postgres', 'mysql', 'replication', 'MVCC', 'query planning', 'connection pool', 'B-tree', 'LSM']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Knowing how a car engine works even though you're a driver — you don't rebuild it, but you know when the noise is serious.

</Callout>

## Why SREs need DB internals

A backend dev can ship a feature with `SELECT * FROM users WHERE id = $1`. A senior SRE has to answer: why does that query use 12 GB of RAM today, why did the replica lag jump to 40 minutes at 3 AM, why did `pg_stat_activity` show 800 idle-in-transaction connections, and why does the same query plan flip from index scan to seq scan once a quarter.

This chapter is the operating layer of databases. It assumes you can write SQL; it teaches you what the database _does_ when you submit it.

## Storage engines — B-tree vs LSM, and why it matters

Two families dominate modern databases. The choice constrains everything downstream — write amplification, compaction stalls, p99 latency, recovery time.

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

|                    | B-tree (Postgres)                      | LSM (Cassandra/Rocks)             |
| ------------------ | -------------------------------------- | --------------------------------- |
| What spikes p99    | Vacuum, autovacuum on hot tables       | Compaction storms                 |
| What spikes disk   | WAL bursts, full-page writes           | SSTable rewrite during compaction |
| What spikes memory | Connection sort/hash work              | Bloom filter + block cache        |
| Tail-latency knob  | `checkpoint_timeout`, `bgwriter_delay` | Compaction throttle, level sizing |
| Backup pattern     | pg_basebackup + WAL replay             | snapshot SSTables (immutable!)    |

You don't pick the engine, the team picks the database. But knowing which family you're operating tells you which knobs _exist_.

## MVCC — the source of half of Postgres's surprises

Multi-Version Concurrency Control: when you `UPDATE` a row, the database doesn't overwrite it — it writes a new row version (tuple) and marks the old version dead. Readers see the version current at their snapshot.

This is why:

```sql
-- This UPDATE doesn't free disk space.
UPDATE users SET last_login = now() WHERE id = 1;
-- It writes a new tuple. The old tuple is dead but still on disk.

-- Run this 1M times on a 1M-row table:
-- The table is now 2M tuples on disk. Half are dead.
-- VACUUM is what reclaims the space.
```

### The senior-SRE Postgres failure modes

**1. Long-running transaction blocks vacuum.**

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

Mitigation: kill the transaction, then `VACUUM`. Long-term: separate reporting onto a replica.

**2. Idle-in-transaction.**

```
App opens BEGIN, does an UPDATE, then... hangs (waiting for an external API).
The connection sits idle but holds row locks AND a snapshot.
Other writers wait. Vacuum can't progress.
```

Set `idle_in_transaction_session_timeout = '30s'`. Anything else is asking for a 3 AM page.

**3. Wraparound.**

Postgres uses a 32-bit transaction ID. If the oldest unfrozen XID is more than 2 billion behind, the database stops accepting writes ("To prevent data loss, the database is shut down.").

```sql
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;
-- Anything > 1.5 billion: page now.
```

Wraparound has taken down Sentry, Mailchimp, and others. Modern PG (14+, including PG 16/17) handles it better — incremental freezing reduces emergency vacuums — but the 32-bit XID failure mode still exists. Monitor `age(datfrozenxid)` and alert at 1.5B regardless of version.

## Replication lag — the metric you must alert on

Every read replica lags. The questions are: by how much, and what's your tolerance?

### The lag types in Postgres

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

Three causes, in order of frequency:

**1. Long-running query on the replica.** The replica pauses replay to keep query results consistent (`hot_standby_feedback`) or aborts queries that conflict (default). Either way, big BI queries cause lag spikes.

**2. WAL write throughput exceeds replica disk.** Cheap replicas with slower disks fall behind under write storms. The fix is faster disks, not "tune postgres."

**3. Single-threaded WAL replay.** Postgres replays WAL in one thread. A burst of bulk inserts on the primary that took 5 parallel writers can take 5x as long to replay. Solution at scale: logical replication that replays per-table in parallel (Postgres 16+: `parallel_apply`).

<Callout type="tip">

**Alert on lag in time, not bytes.** "10 GB behind" means nothing without write rate. "120 seconds behind" tells the user-facing impact: a query just routed to the replica might miss data they wrote 90 seconds ago.

</Callout>

### Read-after-write — the consistency you'll get sued over

A user updates their profile, then loads their profile page. App reads from a replica. Replica is 2 seconds behind. User sees stale data.

Mitigations, ordered by simplicity:

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

Most teams pick option 1 — cheap and good enough for human-driven UX.

## Query planning — why the same query is fast today and slow tomorrow

The optimizer estimates rows for each step using statistics gathered by `ANALYZE`. When estimates are wrong, it picks a bad plan. The classic failure:

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

### The plan-flip outage

The pattern that hits every PG-running company eventually:

```
3 AM: autoanalyze runs on `orders` table.
      Statistics shift slightly because of overnight batch load.
      One query's estimated row count crosses the boundary that flips
      its plan from index scan to seq scan.
      Query goes from 2 ms to 4 seconds.
      All connections fill with the slow query. Pool exhausted. App down.
```

Detection: `pg_stat_statements` shows the query's mean time spiking. Mitigation: pin the plan (`SET enable_seqscan = off` for that query, or use pg_hint_plan), then reanalyze.

Prevention: don't write queries whose plans are sensitive to small statistics changes. Use `LIMIT`. Add the right composite indexes. Treat the query plan as part of your API contract.

## The connection pool — where production really dies

A 100-RPS service with 10 ms queries needs ~1 connection on average. A typical app opens 50. With 20 app instances, the database sees 1,000 connections. Postgres's `max_connections` default is 100. Each connection costs ~10 MB of memory. At 1,000 connections, that's 10 GB just on connection state.

This is why every Postgres-at-scale shop puts **PgBouncer** (or rds-proxy, pgcat) in front:

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

Transaction pooling breaks code that uses `SET search_path` or `LISTEN/NOTIFY` or session-level prepared statements. Audit before turning it on.

### Sizing the pool

Underrated math. Pool too small: requests queue, latency rises. Pool too large: you spend cycles on lock contention and context switches in the database, throughput _drops_.

```
Optimal pool size ≈ ((cores * 2) + effective_spindle_count)

For a 16-core PG server with NVMe (treat as 1 spindle):
  optimal ≈ 32 connections

You almost never want > 4x cores on the DB side.
```

Hikaripool's docs have the original benchmark; it generalizes.

## Hot rows and lock contention

Two writers update the same row → they serialize. At 10k RPS on a single counter row, the database is single-threaded.

The classic case: a `pageviews` counter incremented on every request.

```sql
UPDATE counters SET pageviews = pageviews + 1 WHERE name = 'home';
-- Locks the row. Every other update waits.
-- Throughput cap: 1 / latency_per_update. ~5k/s on healthy PG. Then it falls over.
```

Patterns to fix:

```sql
-- 1. Sharded counters: 100 rows, increment a random one, sum on read.
UPDATE counters SET val = val + 1 WHERE name = 'home' AND shard = (random()*100)::int;
SELECT sum(val) FROM counters WHERE name = 'home';

-- 2. Async aggregation: write events to an append-only table; sum periodically.
INSERT INTO pageview_events (ts, page) VALUES (now(), 'home');
-- A cron job sums events into counters every minute.

-- 3. Move counters out of the OLTP DB entirely. Redis INCR. Or a TSDB.
```

You'll see this pattern in user-facing leaderboards, billing-event meters, and rate limiters. The fix is architectural; the DB tuning won't save you.

## Index strategy — the operational view

Indexes speed reads, slow writes, and consume disk. Senior teams treat indexes like infrastructure.

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

### CONCURRENTLY is non-negotiable

```sql
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
REINDEX INDEX CONCURRENTLY idx_users_email;
```

Without `CONCURRENTLY`, the operation takes an exclusive lock for minutes-to-hours on a big table. With it, the operation is online but takes ~2x as long. Always pay the time; never the lock.

## Migrations under load

Every team eventually does a long migration on a hot table. The traps:

```sql
-- BAD: rewrites every row, holds AccessExclusiveLock.
ALTER TABLE orders ALTER COLUMN id TYPE BIGINT;

-- BAD: in older PG, adding a column with a default rewrote the whole table.
-- (PG 11+ avoids the rewrite for non-volatile defaults.)
ALTER TABLE orders ADD COLUMN total_cents BIGINT DEFAULT 0 NOT NULL;
```

The pattern that works for online migrations:

```
1. Add the new column nullable. (Cheap metadata change.)
2. Backfill in batches (10k rows / batch, sleep 100ms between).
3. Add NOT NULL once backfill done — using CHECK NOT VALID + VALIDATE
   to avoid the table rewrite.
4. Switch the app to read/write the new column.
5. Drop the old column.
```

Tools that automate this safely: `pg_repack`, `pg_squeeze`, GitHub's `gh-ost` (MySQL).

## Backup and recovery — the SRE-level questions

Backups you haven't restored aren't backups. Test quarterly.

The questions a senior SRE asks:

```
- RPO?  How much data can you lose?           → drives backup frequency
- RTO?  How long can you be down?             → drives restore strategy
- WAL retention?  Can you PITR to T-7d?       → not just nightly snapshot
- Off-region copies?                          → survive a regional outage
- Backup encryption + key rotation?           → compliance + safety
- Quarterly restore drill: time to RPO+RTO?   → real numbers, not promises
```

Postgres patterns at scale:

- `pg_basebackup` for the snapshot, plus continuous WAL archiving (`pgbackrest`, `wal-g`).
- A test cluster restored every night from yesterday's backup; smoke tests run against it.
- Logical backup (`pg_dump`) in addition for catastrophic-corruption escape hatch.

## Connection patterns from the application side

The app-side rules that prevent most DB outages:

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

## Common pitfalls that cause Sev-1s

1. **Letting one team's `SELECT * FROM events ORDER BY ts` table-scan the OLTP DB at peak.** Use a replica or a column store; OLTP is not for analytics.
2. **`max_connections = 1000` because "we have 1000 app threads."** Always pool. Always.
3. **Untested failover.** The first time you fail over a primary in production should never be the actual outage.
4. **Schema migration without `CONCURRENTLY` or batch backfill.** A 30-minute lock on `users` is a P0.
5. **No `statement_timeout` on the app side.** A runaway report eats every connection.
6. **Vacuum disabled "to reduce noise."** You will visit wraparound. It is unfun.

## Stay current

- [PostgreSQL docs](https://www.postgresql.org/docs/current/) — version-current; the index for performance, MVCC, WAL
- [MySQL reference](https://dev.mysql.com/doc/refman/en/) — InnoDB internals
- [Use the Index, Luke](https://use-the-index-luke.com/) — index theory, free
- [Designing Data-Intensive Applications (Kleppmann)](https://dataintensive.net/) — durable database fundamentals

## Key Takeaways

1. **Storage engine determines failure mode** — B-tree dies on vacuum bloat, LSM dies on compaction.
2. **MVCC + long transactions = bloat** — set `idle_in_transaction_session_timeout`.
3. **Replication lag is a time metric, not a byte metric** — alert in seconds.
4. **Pool with PgBouncer; size at ~2x cores** — bigger is slower, not faster.
5. **Plan-flips cause silent outages** — `pg_stat_statements` is your earliest warning.
6. **Untested backups don't exist** — quarterly restore drill, with the timer running.
