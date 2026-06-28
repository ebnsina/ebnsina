---
title: 'Manual Shard Routing'
subtitle: 'Building a shard router in application code — connection management, transaction boundaries, migration strategies, and avoiding common pitfalls.'
chapter: 4
level: 'intermediate'
readingTime: '11 min'
topics:
  [
    'shard routing',
    'connection management',
    'transactions',
    'migration',
    'TypeScript',
    'PostgreSQL'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A bank with regional branches: the central system knows which branch holds each account (the router). When you want to move money between accounts in different branches, the tellers at both branches coordinate (distributed transaction). The routing table is the map; the tellers are the shard connections; the coordination protocol is how you avoid losing money in transit.

</Callout>

## Shard Manager

A centralized class that owns all shard connections and routing logic:

```typescript
import { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';

interface ShardConfig {
	id: string;
	connectionString: string;
	weight?: number; // for weighted routing
}

class ShardManager {
	private shards = new Map<string, Pool>();
	private ring: ConsistentHashRing;

	constructor(configs: ShardConfig[]) {
		for (const config of configs) {
			this.shards.set(
				config.id,
				new Pool({
					connectionString: config.connectionString,
					max: 20,
					idleTimeoutMillis: 30_000,
					connectionTimeoutMillis: 3_000
				})
			);
		}
		this.ring = new ConsistentHashRing(configs.map((c) => c.id));
	}

	getShardId(key: string): string {
		return this.ring.getShard(key);
	}

	getPool(shardId: string): Pool {
		const pool = this.shards.get(shardId);
		if (!pool) throw new Error(`Unknown shard: ${shardId}`);
		return pool;
	}

	getPoolForKey(key: string): Pool {
		return this.getPool(this.getShardId(key));
	}

	// Execute on all shards (scatter-gather)
	async queryAllShards<T>(sql: string, params: any[]): Promise<T[]> {
		const results = await Promise.all(
			Array.from(this.shards.values()).map((pool) => pool.query<T>(sql, params).then((r) => r.rows))
		);
		return results.flat();
	}

	async shutdown() {
		await Promise.all(Array.from(this.shards.values()).map((p) => p.end()));
	}
}

// Singleton
export const shards = new ShardManager([
	{ id: 'shard-1', connectionString: process.env.SHARD_1_URL! },
	{ id: 'shard-2', connectionString: process.env.SHARD_2_URL! },
	{ id: 'shard-3', connectionString: process.env.SHARD_3_URL! },
	{ id: 'shard-4', connectionString: process.env.SHARD_4_URL! }
]);
```

## Repository Pattern with Shard Routing

Wrap shard-aware data access in a repository — application code never knows which shard it's talking to:

```typescript
class OrderRepository {
	async create(order: CreateOrderInput): Promise<Order> {
		const pool = shards.getPoolForKey(order.customerId);

		const result = await pool.query<Order>(
			`INSERT INTO orders (id, customer_id, total_cents, status, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
			[randomUUID(), order.customerId, order.totalCents, 'pending']
		);
		return result.rows[0];
	}

	async findById(customerId: string, orderId: string): Promise<Order | null> {
		// customerId is required to route — orderId alone isn't enough
		const pool = shards.getPoolForKey(customerId);

		const result = await pool.query<Order>(
			'SELECT * FROM orders WHERE id = $1 AND customer_id = $2',
			[orderId, customerId]
		);
		return result.rows[0] ?? null;
	}

	async findByCustomer(customerId: string): Promise<Order[]> {
		const pool = shards.getPoolForKey(customerId);

		const result = await pool.query<Order>(
			'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC',
			[customerId]
		);
		return result.rows;
	}

	// Scatter-gather: no shard key — hits all shards
	async findPendingOverdue(): Promise<Order[]> {
		const orders = await shards.queryAllShards<Order>(
			`SELECT * FROM orders
       WHERE status = 'pending'
         AND created_at < NOW() - INTERVAL '24 hours'`,
			[]
		);

		return orders.sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
		);
	}
}
```

## Transactions Within a Shard

Standard Postgres transactions work fine — as long as everything is on the same shard:

```typescript
class OrderService {
	async placeOrder(customerId: string, items: OrderItem[]): Promise<Order> {
		const pool = shards.getPoolForKey(customerId);
		const client = await pool.connect();

		try {
			await client.query('BEGIN');

			const order = await client.query(
				'INSERT INTO orders (id, customer_id, status) VALUES ($1, $2, $3) RETURNING *',
				[randomUUID(), customerId, 'pending']
			);

			for (const item of items) {
				await client.query(
					'INSERT INTO order_items (order_id, product_id, quantity, price_cents) VALUES ($1, $2, $3, $4)',
					[order.rows[0].id, item.productId, item.quantity, item.priceCents]
				);
			}

			await client.query('UPDATE orders SET status = $1 WHERE id = $2', [
				'confirmed',
				order.rows[0].id
			]);

			await client.query('COMMIT');
			return order.rows[0];
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		} finally {
			client.release();
		}
	}
}
```

All tables involved in the transaction must be on the same shard. This is why the shard key must appear in every table's primary key or composite key.

## Cross-Shard Operations (Saga Pattern)

When two customers on different shards need a coordinated operation (e.g., transferring balance):

```typescript
async function transferCredits(
	fromCustomerId: string,
	toCustomerId: string,
	amount: number
): Promise<void> {
	// These may be on different shards
	const fromShard = shards.getPoolForKey(fromCustomerId);
	const toShard = shards.getPoolForKey(toCustomerId);

	// Step 1: Deduct from sender (with idempotency key)
	const transferId = randomUUID();

	await fromShard.query(
		`INSERT INTO credit_transfers (id, customer_id, direction, amount, status)
     VALUES ($1, $2, 'debit', $3, 'pending')
     ON CONFLICT (id) DO NOTHING`,
		[transferId, fromCustomerId, amount]
	);

	const debitResult = await fromShard.query(
		`UPDATE customers
     SET credit_balance = credit_balance - $1
     WHERE id = $2 AND credit_balance >= $1
     RETURNING id`,
		[amount, fromCustomerId]
	);

	if (debitResult.rows.length === 0) {
		await fromShard.query('UPDATE credit_transfers SET status = $1 WHERE id = $2', [
			'failed_insufficient_funds',
			transferId
		]);
		throw new Error('Insufficient credits');
	}

	await fromShard.query('UPDATE credit_transfers SET status = $1 WHERE id = $2', [
		'debit_complete',
		transferId
	]);

	// Step 2: Credit the receiver
	try {
		await toShard.query(`UPDATE customers SET credit_balance = credit_balance + $1 WHERE id = $2`, [
			amount,
			toCustomerId
		]);

		await fromShard.query('UPDATE credit_transfers SET status = $1 WHERE id = $2', [
			'complete',
			transferId
		]);
	} catch (err) {
		// Compensation: refund the sender
		await fromShard.query(
			`UPDATE customers SET credit_balance = credit_balance + $1 WHERE id = $2`,
			[amount, fromCustomerId]
		);
		await fromShard.query('UPDATE credit_transfers SET status = $1 WHERE id = $2', [
			'failed_credit_error',
			transferId
		]);
		throw err;
	}
}
```

A background job handles incomplete transfers (debit_complete but not complete) — these are retried or compensated.

## Schema Migrations Across Shards

```typescript
import { Pool } from 'pg';

async function runMigration(sql: string): Promise<void> {
	const shardIds = ['shard-1', 'shard-2', 'shard-3', 'shard-4'];

	console.log('Running migration on all shards...');

	// Run sequentially to control risk (or parallel if safe)
	for (const shardId of shardIds) {
		console.log(`Migrating ${shardId}...`);
		const pool = shards.getPool(shardId);

		try {
			await pool.query(sql);
			console.log(`${shardId}: OK`);
		} catch (err) {
			console.error(`${shardId}: FAILED — ${(err as Error).message}`);
			throw err; // stop migration on first failure
		}
	}

	console.log('Migration complete on all shards');
}

// Usage
await runMigration(`
  ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
`);
```

**Safe migration practices for sharded systems:**

1. Always use `IF NOT EXISTS` / `IF EXISTS` — idempotent migrations
2. Add columns before code reads them (columns appear empty until data is written)
3. Remove columns only after code stops reading them (deploy the code change, wait, then drop)
4. Never rename columns (add new + copy + remove old)

## Adding a New Shard

```typescript
// 1. Add the new shard to the ring (consistent hashing minimizes data movement)
ring.addShard('shard-5');

// 2. Start accepting new writes to shard-5 for newly assigned keys
// Existing data for those keys is still on old shards

// 3. Background migration: copy data that now belongs to shard-5
async function migrateShard(fromShardId: string, toShardId: string) {
	const fromPool = shards.getPool(fromShardId);
	const toPool = shards.getPool(toShardId);

	let offset = 0;
	const batchSize = 1000;

	while (true) {
		const rows = await fromPool.query('SELECT * FROM orders ORDER BY id LIMIT $1 OFFSET $2', [
			batchSize,
			offset
		]);

		if (rows.rows.length === 0) break;

		// Only migrate rows that now map to the new shard
		const toMigrate = rows.rows.filter((row) => ring.getShard(row.customer_id) === toShardId);

		if (toMigrate.length > 0) {
			// Upsert (idempotent — safe to re-run)
			await toPool.query(
				`INSERT INTO orders SELECT * FROM json_populate_recordset(null::orders, $1)
         ON CONFLICT (id) DO NOTHING`,
				[JSON.stringify(toMigrate)]
			);

			// Delete from old shard (after verifying target has the data)
			const ids = toMigrate.map((r) => r.id);
			await fromPool.query('DELETE FROM orders WHERE id = ANY($1)', [ids]);
		}

		offset += batchSize;
		await sleep(10); // throttle to not overwhelm the database
	}
}
```

This is a live migration — data moves while the system is running. The dual-write period (before data migration completes) means some queries hit old location, some new. The router must handle both.

## Read Replicas Per Shard

Each shard can have its own read replica:

```typescript
interface ShardConfig {
	id: string;
	primary: string;
	replica?: string;
}

class ShardManager {
	private primaries = new Map<string, Pool>();
	private replicas = new Map<string, Pool>();

	constructor(configs: ShardConfig[]) {
		for (const config of configs) {
			this.primaries.set(config.id, new Pool({ connectionString: config.primary }));
			if (config.replica) {
				this.replicas.set(config.id, new Pool({ connectionString: config.replica }));
			}
		}
	}

	getPool(shardId: string, { write = false } = {}): Pool {
		if (write) return this.primaries.get(shardId)!;
		return this.replicas.get(shardId) ?? this.primaries.get(shardId)!;
	}
}
```

At this point, your setup is: N shards × (1 primary + 1 replica) = 2N Postgres servers. This is significant infrastructure — plan the operational overhead accordingly.
