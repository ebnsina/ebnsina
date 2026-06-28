---
title: 'Replication Fundamentals'
subtitle: 'Why replication exists, synchronous vs asynchronous, WAL-based streaming, and the consistency trade-offs every replica introduces.'
chapter: 1
level: 'beginner'
readingTime: '8 min'
topics:
  [
    'replication',
    'PostgreSQL',
    'WAL',
    'synchronous',
    'asynchronous',
    'consistency',
    'read replicas'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A legal firm keeping copies of critical documents: the original file cabinet (primary) holds the authoritative copy. Copies (replicas) exist in branch offices so work can continue if the main office burns down, and so branch staff can read documents without everyone driving to headquarters. The question is: how quickly do the copies reflect changes to the original? Immediately (synchronous) or eventually (asynchronous)?

</Callout>

## Why Replication

A single database server has three failure modes that replication addresses:

**Single point of failure:** if the server crashes, your application is down. A replica can be promoted to primary in minutes (or seconds with automation).

**Read bottleneck:** at scale, reads dominate writes (often 10:1). Read replicas distribute read load across multiple servers.

**Geographic latency:** users in Europe querying a database in US-East add ~100ms RTT. A replica in EU-West eliminates that.

Replication solves availability and read scaling — it does not solve write scaling. All writes still go to one primary. For write scaling, that's sharding.

## How Postgres Replication Works

Postgres uses the **Write-Ahead Log (WAL)**. Every change to any row is first written to the WAL before being applied to the data files. The WAL is the authoritative record of all changes.

```
Primary:
  1. Write change to WAL segment
  2. Apply change to data files
  3. Stream WAL to replicas

Replica:
  1. Receive WAL from primary
  2. Apply WAL to its own data files
  3. Data is now identical (with replication lag)
```

The replica isn't replicating the data files directly — it's replaying the same sequence of WAL records, arriving at the same state.

## Synchronous vs Asynchronous

**Asynchronous (default):** the primary commits and returns to the client. WAL is sent to replicas afterward. The replica may lag behind the primary.

```
Client → Write → Primary commits → Returns to client
                      ↓ (async, after commit)
                  Sends WAL to replica
                      ↓
                  Replica applies WAL (lag: 0ms–seconds)
```

Risk: if the primary crashes before WAL reaches the replica, those transactions are lost. The replica is promoted, but it's missing recent data.

**Synchronous:** the primary waits for at least one replica to confirm WAL receipt before returning to the client.

```
Client → Write → Primary writes WAL
                      ↓ (blocks)
                  Sends WAL to sync replica
                      ↓
                  Replica confirms receipt → Primary commits → Returns to client
```

No committed transaction is ever lost — the replica has a copy by the time the client gets confirmation. The trade-off: write latency increases by the network RTT to the sync replica (~1ms same datacenter, ~10ms cross-AZ, ~100ms cross-region).

```sql
-- Configure synchronous replication
ALTER SYSTEM SET synchronous_commit = 'on';         -- wait for WAL receipt (not disk)
ALTER SYSTEM SET synchronous_commit = 'remote_apply'; -- wait for WAL applied on replica
ALTER SYSTEM SET synchronous_commit = 'remote_write'; -- wait for WAL written to replica's OS
ALTER SYSTEM SET synchronous_commit = 'off';         -- async (default)

-- Name which replicas are synchronous
ALTER SYSTEM SET synchronous_standby_names = 'replica1';
-- Or: any 1 of these replicas
ALTER SYSTEM SET synchronous_standby_names = 'ANY 1 (replica1, replica2)';
```

## Replication Lag

The delay between a write on the primary and it appearing on the replica.

```sql
-- On the primary: check lag per replica
SELECT
  client_addr,
  state,
  sent_lsn,
  write_lsn,
  flush_lsn,
  replay_lsn,
  pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes,
  write_lag,
  flush_lag,
  replay_lag
FROM pg_stat_replication;

-- On the replica: check lag from primary
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;
```

Alert when lag exceeds your tolerance:

```yaml
# Prometheus alert
- alert: ReplicationLagHigh
  expr: pg_replication_lag_seconds > 30
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: 'Replica lag is {{ $value }}s'
```

## Read Replicas in Application Code

Route reads to replicas, writes to primary:

```typescript
import { Pool } from 'pg';

const primary = new Pool({ connectionString: process.env.DATABASE_PRIMARY_URL });
const replica = new Pool({ connectionString: process.env.DATABASE_REPLICA_URL });

// Write — always primary
async function createOrder(order: Order): Promise<Order> {
	const result = await primary.query(
		'INSERT INTO orders (customer_id, total) VALUES ($1, $2) RETURNING *',
		[order.customerId, order.total]
	);
	return result.rows[0];
}

// Read — replica (tolerate slight staleness)
async function listOrders(customerId: string): Promise<Order[]> {
	const result = await replica.query(
		'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC',
		[customerId]
	);
	return result.rows;
}

// Read after write — use primary to avoid reading stale data
async function getOrderAfterCreate(orderId: string): Promise<Order> {
	const result = await primary.query('SELECT * FROM orders WHERE id = $1', [orderId]);
	return result.rows[0];
}
```

The hardest part: deciding which reads can tolerate stale data. A product listing page: fine. The user's own order they just placed: use primary (or wait for replica to catch up).

## Consistency Levels

```
Strong consistency:    always read from primary — no lag, highest cost
Session consistency:   after a write, that user's reads go to primary for N seconds
Eventual consistency:  all reads from replica — may see stale data

// Session consistency implementation
const SESSION_STICKY_DURATION_MS = 5000;

function getDb(req: Request, isWrite: boolean): Pool {
  if (isWrite) {
    req.session.lastWrite = Date.now();
    return primary;
  }

  // If this session wrote recently, read from primary
  const timeSinceWrite = Date.now() - (req.session.lastWrite ?? 0);
  if (timeSinceWrite < SESSION_STICKY_DURATION_MS) {
    return primary;
  }

  return replica;
}
```

## Replication Slots

Replication slots ensure the primary keeps WAL until a replica has consumed it. Prevents WAL from being cleaned up before slow replicas catch up.

```sql
-- Create a physical replication slot
SELECT pg_create_physical_replication_slot('replica1');

-- View slots and lag
SELECT slot_name, active, restart_lsn,
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS lag_bytes
FROM pg_replication_slots;
```

**Warning:** a slot for a replica that's down or far behind causes WAL accumulation on the primary. If WAL fills the disk, the primary crashes. Monitor slot lag and drop slots for replicas that aren't catching up:

```sql
-- Drop a stuck slot (only if the replica is permanently gone)
SELECT pg_drop_replication_slot('replica1');
```

For Debezium CDC or logical replication, slots are mandatory — they ensure no events are missed. Monitor their lag carefully.
