---
title: 'Manual Shard Routing'
subtitle: 'Application code-এ একটি shard router বানানো — connection management, transaction boundary, migration strategy, এবং সাধারণ ভুল এড়ানো।'
chapter: 4
level: 'intermediate'
readingTime: '11 মিনিট'
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

**বাস্তব জীবনের উপমা**

আঞ্চলিক শাখাসহ একটি ব্যাংক: কেন্দ্রীয় সিস্টেম জানে কোন শাখায় কোন account আছে (router)। যখন আপনি ভিন্ন শাখার account-এর মধ্যে টাকা সরাতে চান, দুই শাখার teller-রা সমন্বয় করে (distributed transaction)। Routing table হলো মানচিত্র; teller-রা হলো shard connection; আর coordination protocol হলো কীভাবে আপনি চলার পথে টাকা হারানো এড়ান।

</Callout>

## গল্পে বুঝি

ফাতিমার একটা বিশাল গুদাম, ভেতরে সারি সারি নম্বর দেওয়া স্টোররুম — রুম ১, রুম ২, রুম ৩, রুম ৪। প্রতিদিন শত শত পার্সেল আসে, আর প্রতিটার গায়ে গ্রাহকের একটা আইডি নম্বর লেখা। এখন কথা হলো, কোন পার্সেল কোন রুমে রাখা হবে, সেটা মনে রাখার জন্য ফাতিমা কোনো খাতা-রেজিস্টার রাখেন না। তিনি ডিসপ্যাচ ক্লার্ক খোয়ারিজমিকে একটা বাঁধা নিয়ম শিখিয়ে দিয়েছেন: "আইডি নম্বরটা নাও, রুমের সংখ্যা দিয়ে ভাগ করো, যে ভাগশেষ থাকে সেটাই রুম নম্বর।" আইডি ৪২, রুম ৪টা — ভাগশেষ ২, মানে রুম ২-এ যাবে। পরে যখন সেই পার্সেল আবার লাগবে, খোয়ারিজমি একই হিসাব কষে সোজা রুম ২-এ চলে যান। কোনো কেন্দ্রীয় খাতা লাগে না, হিসাবটাই ঠিকানা বলে দেয়।

কয়েক মাস সব মসৃণ চলল। কিন্তু একদিন গুদাম উপচে পড়তে লাগল, সিনা পরামর্শ দিলেন — আরেকটা স্টোররুম বসাও, রুম ৫। যেই না পঞ্চম রুম যোগ হলো, খোয়ারিজমির নিয়মটাই বদলে গেল: এখন ভাগ হবে ৫ দিয়ে, ৪ দিয়ে নয়। ফলে পুরনো প্রায় সব পার্সেলের হিসাব মিলছে না — যে পার্সেল আগে রুম ২-তে ছিল, নতুন নিয়মে সেটা হয়তো রুম ৫-এ যাওয়ার কথা। বাধ্য হয়ে গোটা গুদামের বিশাল স্তূপ নামিয়ে, একটা একটা করে নতুন হিসাবে মিলিয়ে আবার সাজাতে হলো। কয়েক দিন ধরে সেই এলাহি কাণ্ড চলল।

এই গল্পটাই আসলে **manual shard routing**। ডিসপ্যাচ ক্লার্কের বাঁধা নিয়ম প্রয়োগ করা মানে হলো **application** নিজেই হিসাব কষে ঠিক করছে ডেটা কোন shard-এ আছে — "আইডি রুম-সংখ্যা দিয়ে ভাগ করে ভাগশেষ নাও" মানে `hash(key) % N`, প্রতিটা নম্বর দেওয়া স্টোররুম একেকটা **shard**, আর কোনো কেন্দ্রীয় index ছাড়াই হিসাবই ঠিকানা বলে দেয়। কিন্তু নতুন রুম যোগ করতেই যেমন `N` বদলে পুরো স্তূপ নতুন করে সাজাতে হলো, ঠিক তেমনি shard সংখ্যা বাড়ালে `% N`-এর ফল বদলে যায় আর প্রায় সব key নতুন shard-এ সরাতে হয় — এটাই খরুচে **resharding**-এর যন্ত্রণা। বাস্তবেও তাই বড় সিস্টেমগুলো এই ব্যথা কমাতে সরাসরি `% N`-এর বদলে consistent hashing ব্যবহার করে, যাতে নতুন shard যোগ করলে সব key নয়, অল্প কিছু key-ই সরাতে হয় (এই chapter-এর কোডেও `ConsistentHashRing` তাই দেখবেন)।

## Shard Manager

একটি কেন্দ্রীয় class যা সব shard connection এবং routing logic-এর মালিক:

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

## Shard Routing সহ Repository Pattern

Shard-aware data access-কে একটি repository-তে মুড়ে দিন — application code কখনও জানে না সে কোন shard-এর সাথে কথা বলছে:

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

## এক Shard-এর মধ্যে Transaction

Standard Postgres transaction ঠিকঠাক কাজ করে — যতক্ষণ সবকিছু একই shard-এ থাকে:

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

Transaction-এ জড়িত সব table একই shard-এ থাকতে হবে। এই কারণেই shard key প্রতিটি table-এর primary key বা composite key-তে থাকতে হবে।

## Cross-Shard Operation (Saga Pattern)

যখন ভিন্ন shard-এ থাকা দুই customer-এর একটি সমন্বিত operation দরকার (যেমন, balance স্থানান্তর):

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

একটি background job অসম্পূর্ণ transfer সামলায় (debit_complete কিন্তু complete নয়) — এগুলো retry বা compensate করা হয়।

## Shard জুড়ে Schema Migration

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

**Sharded system-এর জন্য নিরাপদ migration অনুশীলন:**

1. সবসময় `IF NOT EXISTS` / `IF EXISTS` ব্যবহার করুন — idempotent migration
2. Code column পড়ার আগে column যোগ করুন (data লেখার আগ পর্যন্ত column খালি দেখায়)
3. Code পড়া বন্ধ করার পরেই column সরান (code পরিবর্তন deploy করুন, অপেক্ষা করুন, তারপর drop করুন)
4. কখনও column rename করবেন না (নতুন যোগ + copy + পুরনো সরানো)

## নতুন Shard যোগ করা

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

এটি একটি live migration — data সরে যখন system চলছে। Dual-write সময়কাল (data migration সম্পূর্ণ হওয়ার আগে) মানে কিছু query পুরনো location-এ hit করে, কিছু নতুন-তে। Router-কে দুটোই সামলাতে হবে।

## প্রতি Shard-এ Read Replica

প্রতিটি shard-এর নিজস্ব read replica থাকতে পারে:

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

এই পর্যায়ে, আপনার setup হলো: N shard × (1 primary + 1 replica) = 2N Postgres server। এটি উল্লেখযোগ্য infrastructure — সেই অনুযায়ী operational overhead-এর পরিকল্পনা করুন।
