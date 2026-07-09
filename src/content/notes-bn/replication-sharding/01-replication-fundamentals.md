---
title: 'Replication Fundamentals'
subtitle: 'Replication কেন আছে, synchronous vs asynchronous, WAL-ভিত্তিক streaming, এবং প্রতিটি replica যে consistency trade-off নিয়ে আসে।'
chapter: 1
level: 'beginner'
readingTime: '8 মিনিট'
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

**বাস্তব জীবনের উপমা**

একটি আইন-সংস্থা তাদের গুরুত্বপূর্ণ ডকুমেন্টের কপি রাখছে: মূল ফাইল-কেবিনেট (primary) নির্ভরযোগ্য কপিটি ধরে রাখে। কপি (replica) শাখা অফিসগুলোতে থাকে যাতে মূল অফিস পুড়ে গেলেও কাজ চালিয়ে যাওয়া যায়, এবং যাতে শাখার কর্মীরা সদর দপ্তরে না গিয়েই ডকুমেন্ট পড়তে পারে। প্রশ্নটা হলো: মূল কপির পরিবর্তনগুলো কপিগুলোতে কত দ্রুত প্রতিফলিত হয়? সাথে সাথে (synchronous) নাকি কিছুক্ষণ পরে (asynchronous)?

</Callout>

## Replication কেন

একটি single database server-এর তিনটি failure mode আছে যা replication সমাধান করে:

**Single point of failure:** server crash করলে আপনার application ডাউন। একটি replica কয়েক মিনিটে (বা automation থাকলে কয়েক সেকেন্ডে) primary-তে promote করা যায়।

**Read bottleneck:** scale-এ read গুলো write-এর চেয়ে বেশি হয় (প্রায়ই 10:1)। Read replica একাধিক server-এ read load ভাগ করে দেয়।

**Geographic latency:** ইউরোপের user যদি US-East-এর একটি database query করে, তাহলে প্রায় ~100ms RTT যোগ হয়। EU-West-এ একটি replica সেটা দূর করে।

Replication সমাধান করে availability এবং read scaling — এটি write scaling সমাধান করে না। সব write এখনও এক primary-তেই যায়। Write scaling-এর জন্য দরকার sharding।

## Postgres Replication কীভাবে কাজ করে

Postgres **Write-Ahead Log (WAL)** ব্যবহার করে। যেকোনো row-এর প্রতিটি পরিবর্তন data file-এ apply হওয়ার আগে প্রথমে WAL-এ লেখা হয়। WAL হলো সব পরিবর্তনের নির্ভরযোগ্য রেকর্ড।

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

Replica সরাসরি data file গুলো replicate করছে না — এটি একই WAL record-এর ধারাবাহিকতা আবার replay করছে, এবং একই state-এ পৌঁছাচ্ছে।

## Synchronous vs Asynchronous

**Asynchronous (default):** primary commit করে এবং client-কে ফেরত দেয়। WAL এরপরে replica-তে পাঠানো হয়। Replica primary-র চেয়ে পিছিয়ে থাকতে পারে।

```
Client → Write → Primary commits → Returns to client
                      ↓ (async, after commit)
                  Sends WAL to replica
                      ↓
                  Replica applies WAL (lag: 0ms–seconds)
```

ঝুঁকি: WAL replica-তে পৌঁছানোর আগেই যদি primary crash করে, তাহলে সেই transaction গুলো হারিয়ে যায়। Replica promote হয়, কিন্তু তার সাম্প্রতিক data নেই।

**Synchronous:** primary অন্তত একটি replica-র WAL receipt confirm করার জন্য অপেক্ষা করে, তারপর client-কে ফেরত দেয়।

```
Client → Write → Primary writes WAL
                      ↓ (blocks)
                  Sends WAL to sync replica
                      ↓
                  Replica confirms receipt → Primary commits → Returns to client
```

কোনো committed transaction কখনও হারায় না — client confirmation পাওয়ার সময়ই replica-র কাছে একটি কপি থাকে। Trade-off: sync replica-তে network RTT-এর কারণে write latency বাড়ে (~1ms একই datacenter, ~10ms cross-AZ, ~100ms cross-region)।

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

Primary-তে একটি write এবং replica-তে সেটি দেখা যাওয়ার মধ্যকার বিলম্ব।

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

Lag আপনার সহনসীমা ছাড়িয়ে গেলে alert দিন:

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

## Application Code-এ Read Replica

Read গুলো replica-তে, write গুলো primary-তে route করুন:

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

সবচেয়ে কঠিন অংশ: কোন read গুলো stale data সহ্য করতে পারে তা ঠিক করা। একটি product listing page: ঠিক আছে। User যে order মাত্রই দিয়েছে সেটা: primary ব্যবহার করুন (অথবা replica catch up করার জন্য অপেক্ষা করুন)।

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

Replication slot নিশ্চিত করে যে primary WAL ততক্ষণ ধরে রাখবে যতক্ষণ না একটি replica সেটি consume করে। এটি ধীরগতির replica catch up করার আগেই WAL পরিষ্কার হয়ে যাওয়া ঠেকায়।

```sql
-- Create a physical replication slot
SELECT pg_create_physical_replication_slot('replica1');

-- View slots and lag
SELECT slot_name, active, restart_lsn,
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS lag_bytes
FROM pg_replication_slots;
```

**সতর্কতা:** যে replica ডাউন বা অনেক পিছিয়ে আছে তার একটি slot primary-তে WAL জমতে থাকার কারণ হয়। WAL যদি disk ভরে ফেলে, primary crash করে। Slot lag monitor করুন এবং যেসব replica catch up করছে না তাদের slot drop করুন:

```sql
-- Drop a stuck slot (only if the replica is permanently gone)
SELECT pg_drop_replication_slot('replica1');
```

Debezium CDC বা logical replication-এর জন্য slot বাধ্যতামূলক — এগুলো নিশ্চিত করে যে কোনো event মিস হয় না। এদের lag সাবধানে monitor করুন।
