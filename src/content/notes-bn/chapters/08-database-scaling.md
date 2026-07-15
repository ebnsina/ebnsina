---
title: 'ডেটাবেস শার্ডিং ও রেপ্লিকেশন'
subtitle: 'read replica, শার্ডিংয়ের জন্য consistent hashing আর shard-aware query routing implement করুন।'
chapter: 8
level: 'intermediate'
readingTime: '20 মিনিট'
topics: ['sharding', 'replication', 'consistent hashing', 'read replicas']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনা কাজ করে দেশের জাতীয় ভূমি ও জন্মনিবন্ধন রেজিস্ট্রিতে। শুরুতে গোটা দেশের সব রেকর্ড এক প্রধান অফিসেই রাখা হতো, কিন্তু ফাইল বাড়তে বাড়তে একটা অফিসের আলমারিতে আর জায়গা হচ্ছিল না, খুঁজতেও ঘণ্টার পর ঘণ্টা লাগত। তাই সিদ্ধান্ত হলো — রেকর্ডগুলো এলাকা ধরে ভাগ করে দেওয়া হবে। ঢাকা জেলার ফাইল থাকবে ঢাকার জেলা অফিসে, চট্টগ্রামের ফাইল চট্টগ্রামের অফিসে, রংপুরেরটা রংপুরে। এখন প্রতিটা জেলা অফিস শুধু তার নিজের এলাকার ফাইলটুকুই সামলায়, পুরো দেশের বোঝা একা কাউকে টানতে হয় না।

কিন্তু আরেকটা সমস্যা রয়ে গেল। আল-খোয়ারিজমি বা ফাতিমা আল-ফিহরির মতো সাধারণ মানুষ প্রতিদিন এসে নিজের জমির দলিল বা জন্মসনদ দেখতে চায় — একসাথে এত মানুষ যদি একটাই মূল ফাইল ঘাঁটতে চায়, লাইন লেগে যায়। তাই প্রতিটা জেলা অফিস তার ফাইলগুলোর ফটোকপি বানিয়ে আশপাশের কয়েকটা শাখার পাঠকক্ষে রেখে দেয়। যাদের শুধু দেখতে হবে, তারা ভিড় না করে যেকোনো শাখার পাঠকক্ষে গিয়ে কপি পড়ে নেয়। কিন্তু কোনো তথ্য বদলাতে হলে — নতুন মালিকের নাম তোলা, জন্মতারিখ সংশোধন — সেটা শুধু মূল অফিসেই করা যায়, তারপর সেই বদল আবার সব পাঠকক্ষের কপিতে ছড়িয়ে দেওয়া হয়।

এই পুরো ব্যবস্থাটাই আসলে ডেটাবেস স্কেল করার দুই কৌশল। এলাকা ধরে ফাইল আলাদা অফিসে ভাগ করাটাই **sharding** — এখানে এলাকা হলো **shard key**, আর প্রতিটা জেলা অফিস একেকটা shard যেটা পুরো ডেটার একটা টুকরো ধরে রাখে। আর পাঠকক্ষের ফটোকপিগুলো হলো **read replica**, যেখান থেকে অনেকে একসাথে পড়তে পারে, আর যেখানে মূল বদল হয় সেই মূল অফিসটাই **primary** — বদল primary-তে হয়ে replica-তে ছড়ায়। বাস্তবে Instagram user ID দিয়ে এভাবে shard করে আর read replica দিয়ে পড়ার চাপ সামলায়, যাতে বিলিয়ন বিলিয়ন রেকর্ডেও সিস্টেম দ্রুত থাকে।

## যখন একটা ডেটাবেস যথেষ্ট নয়

একটা মাত্র PostgreSQL ইনস্ট্যান্স প্রতি সেকেন্ডে হাজার হাজার কোয়েরি হ্যান্ডল করে। কিন্তু একসময় আপনি সীমায় পৌঁছান: খুব বেশি read, খুব বেশি write, বা এক মেশিনের জন্য খুব বেশি ডেটা। দুটো স্ট্র্যাটেজি এটা সমাধান করে:

- **Replication** — read scaling-এর জন্য ডেটা read replica-তে কপি করা
- **Sharding** — write scaling-এর জন্য ডেটা একাধিক ডেটাবেসে ভাগ করা

<Callout type="info">

**বাস্তব জীবনের উপমা**

জিপ কোড দিয়ে চিঠি সাজানো একটা পোস্ট অফিসের মতো — 90210 যায় Beverly Hills-এ, 10001 যায় Manhattan-এ। প্রতিটা অফিস শুধু তার জোনের চিঠি সামলায়। সেটাই sharding।

</Callout>

<Mermaid
title="Replication + Sharding Architecture"
code={`graph TD
  A["App Server"] --> R["Router<br/>Read/Write Split"]
  R --> P["Primary<br/>Writes"]
  P -- replicates to --> R1["Replica 1"]
  P -- replicates to --> R2["Replica 2"]`}
/>

## শার্ডিংয়ের জন্য Consistent Hashing

আপনি যখন N-টা ডেটাবেসে ডেটা শার্ড করেন, তখন আপনাকে `user_123`-কে ধারাবাহিকভাবে একই শার্ডে route করতে হবে। সাধারণ modulo (`hash(key) % N`) ভেঙে পড়ে যখন আপনি শার্ড যোগ বা সরান — এটা প্রায় প্রতিটা key পুনরায় assign করে ফেলে। Consistent hashing এটা কমিয়ে দেয়: একটা শার্ড যোগ করলে শুধু ~1/N key সরে।

<CodeTabs tsFile="sharding.ts" goFile="sharding.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import crypto from 'node:crypto';
import pg from 'pg';

// --- Consistent Hash Ring ---
class ConsistentHashRing {
	private ring: Map<number, string> = new Map();
	private sortedKeys: number[] = [];
	private virtualNodes: number;

	constructor(nodes: string[], virtualNodes = 150) {
		this.virtualNodes = virtualNodes;
		for (const node of nodes) {
			this.addNode(node);
		}
	}

	private hash(key: string): number {
		const h = crypto.createHash('md5').update(key).digest();
		return h.readUInt32BE(0);
	}

	addNode(node: string): void {
		for (let i = 0; i < this.virtualNodes; i++) {
			const virtualKey = `${node}:v${i}`;
			const hash = this.hash(virtualKey);
			this.ring.set(hash, node);
			this.sortedKeys.push(hash);
		}
		this.sortedKeys.sort((a, b) => a - b);
	}

	removeNode(node: string): void {
		for (let i = 0; i < this.virtualNodes; i++) {
			const virtualKey = `${node}:v${i}`;
			const hash = this.hash(virtualKey);
			this.ring.delete(hash);
			this.sortedKeys = this.sortedKeys.filter((k) => k !== hash);
		}
	}

	getNode(key: string): string {
		if (this.sortedKeys.length === 0) {
			throw new Error('No nodes in the ring');
		}

		const hash = this.hash(key);

		// Binary search for the first node clockwise from the hash
		let low = 0;
		let high = this.sortedKeys.length - 1;

		if (hash > this.sortedKeys[high]) {
			// Wrap around to first node
			return this.ring.get(this.sortedKeys[0])!;
		}

		while (low < high) {
			const mid = (low + high) >>> 1;
			if (this.sortedKeys[mid] < hash) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}

		return this.ring.get(this.sortedKeys[low])!;
	}
}

// --- Shard Manager ---
interface ShardConfig {
	name: string;
	connectionString: string;
}

class ShardManager {
	private shards: Map<string, pg.Pool> = new Map();
	private ring: ConsistentHashRing;
	private readReplicas: Map<string, pg.Pool[]> = new Map();

	constructor(shardConfigs: ShardConfig[], replicaConfigs?: Record<string, string[]>) {
		// Create connection pools for each shard
		const nodeNames: string[] = [];
		for (const config of shardConfigs) {
			const pool = new pg.Pool({
				connectionString: config.connectionString,
				max: 10,
				idleTimeoutMillis: 30000
			});
			this.shards.set(config.name, pool);
			nodeNames.push(config.name);
		}

		// Create read replica pools
		if (replicaConfigs) {
			for (const [shard, replicas] of Object.entries(replicaConfigs)) {
				const pools = replicas.map(
					(connStr) => new pg.Pool({ connectionString: connStr, max: 10 })
				);
				this.readReplicas.set(shard, pools);
			}
		}

		this.ring = new ConsistentHashRing(nodeNames);
	}

	// Get the shard for a given key
	getShardName(shardKey: string): string {
		return this.ring.getNode(shardKey);
	}

	// Get write pool (primary)
	getWritePool(shardKey: string): pg.Pool {
		const shardName = this.getShardName(shardKey);
		const pool = this.shards.get(shardName);
		if (!pool) throw new Error(`Shard ${shardName} not found`);
		return pool;
	}

	// Get read pool (replica or primary fallback)
	getReadPool(shardKey: string): pg.Pool {
		const shardName = this.getShardName(shardKey);
		const replicas = this.readReplicas.get(shardName);

		if (replicas && replicas.length > 0) {
			// Round-robin across replicas
			const idx = Math.floor(Math.random() * replicas.length);
			return replicas[idx];
		}

		// Fallback to primary
		return this.getWritePool(shardKey);
	}

	// --- Query helpers ---
	async writeQuery<T>(shardKey: string, sql: string, params: unknown[]): Promise<T[]> {
		const pool = this.getWritePool(shardKey);
		const result = await pool.query(sql, params);
		return result.rows;
	}

	async readQuery<T>(shardKey: string, sql: string, params: unknown[]): Promise<T[]> {
		const pool = this.getReadPool(shardKey);
		const result = await pool.query(sql, params);
		return result.rows;
	}

	// Scatter-gather: query all shards and merge results
	async queryAllShards<T>(sql: string, params: unknown[]): Promise<T[]> {
		const promises = Array.from(this.shards.values()).map((pool) =>
			pool.query(sql, params).then((r) => r.rows as T[])
		);

		const results = await Promise.all(promises);
		return results.flat();
	}

	async close(): Promise<void> {
		for (const pool of this.shards.values()) {
			await pool.end();
		}
		for (const replicas of this.readReplicas.values()) {
			for (const pool of replicas) {
				await pool.end();
			}
		}
	}
}

// --- Usage Example ---
async function main() {
	const manager = new ShardManager(
		[
			{ name: 'shard-1', connectionString: 'postgres://localhost:5432/blog_shard1' },
			{ name: 'shard-2', connectionString: 'postgres://localhost:5433/blog_shard2' },
			{ name: 'shard-3', connectionString: 'postgres://localhost:5434/blog_shard3' }
		],
		{
			'shard-1': ['postgres://localhost:5435/blog_shard1_replica'],
			'shard-2': ['postgres://localhost:5436/blog_shard2_replica']
		}
	);

	const userId = 'user-12345';

	// Writes go to primary
	await manager.writeQuery(
		userId,
		`INSERT INTO users (id, username, email) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
		[userId, 'ahmadrazi', 'ahmad@example.com']
	);

	// Reads go to replica
	const user = await manager.readQuery(userId, 'SELECT * FROM users WHERE id = $1', [userId]);

	console.log(`User on shard: ${manager.getShardName(userId)}`, user);

	// Cross-shard query (scatter-gather)
	const allUsers = await manager.queryAllShards(
		'SELECT id, username FROM users ORDER BY created_at DESC LIMIT 10',
		[]
	);
	console.log('Users across all shards:', allUsers.length);

	await manager.close();
}

main().catch(console.error);
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"crypto/md5"
	"database/sql"
	"encoding/binary"
	"fmt"
	"log"
	"math/rand"
	"sort"
	"sync"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// --- Consistent Hash Ring ---
type ConsistentHashRing struct {
	ring         map[uint32]string
	sortedKeys   []uint32
	virtualNodes int
	mu           sync.RWMutex
}

func NewConsistentHashRing(nodes []string, virtualNodes int) *ConsistentHashRing {
	r := &ConsistentHashRing{
		ring:         make(map[uint32]string),
		virtualNodes: virtualNodes,
	}
	for _, node := range nodes {
		r.AddNode(node)
	}
	return r
}

func (r *ConsistentHashRing) hash(key string) uint32 {
	h := md5.Sum([]byte(key))
	return binary.BigEndian.Uint32(h[:4])
}

func (r *ConsistentHashRing) AddNode(node string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := 0; i < r.virtualNodes; i++ {
		vkey := fmt.Sprintf("%s:v%d", node, i)
		h := r.hash(vkey)
		r.ring[h] = node
		r.sortedKeys = append(r.sortedKeys, h)
	}
	sort.Slice(r.sortedKeys, func(i, j int) bool {
		return r.sortedKeys[i] < r.sortedKeys[j]
	})
}

func (r *ConsistentHashRing) RemoveNode(node string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := 0; i < r.virtualNodes; i++ {
		vkey := fmt.Sprintf("%s:v%d", node, i)
		h := r.hash(vkey)
		delete(r.ring, h)
	}
	newKeys := make([]uint32, 0, len(r.sortedKeys))
	for _, k := range r.sortedKeys {
		if _, exists := r.ring[k]; exists {
			newKeys = append(newKeys, k)
		}
	}
	r.sortedKeys = newKeys
}

func (r *ConsistentHashRing) GetNode(key string) string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if len(r.sortedKeys) == 0 {
		panic("no nodes in ring")
	}

	h := r.hash(key)

	// Binary search for first node clockwise
	idx := sort.Search(len(r.sortedKeys), func(i int) bool {
		return r.sortedKeys[i] >= h
	})

	if idx >= len(r.sortedKeys) {
		idx = 0 // wrap around
	}

	return r.ring[r.sortedKeys[idx]]
}

// --- Shard Manager ---
type ShardConfig struct {
	Name             string
	ConnectionString string
}

type ShardManager struct {
	shards       map[string]*sql.DB
	readReplicas map[string][]*sql.DB
	ring         *ConsistentHashRing
}

func NewShardManager(configs []ShardConfig, replicaConfigs map[string][]string) (*ShardManager, error) {
	sm := &ShardManager{
		shards:       make(map[string]*sql.DB),
		readReplicas: make(map[string][]*sql.DB),
	}

	nodeNames := make([]string, 0, len(configs))
	for _, cfg := range configs {
		db, err := sql.Open("pgx", cfg.ConnectionString)
		if err != nil {
			return nil, fmt.Errorf("open shard %s: %w", cfg.Name, err)
		}
		db.SetMaxOpenConns(10)
		db.SetMaxIdleConns(3)
		sm.shards[cfg.Name] = db
		nodeNames = append(nodeNames, cfg.Name)
	}

	for shard, replicas := range replicaConfigs {
		for _, connStr := range replicas {
			db, err := sql.Open("pgx", connStr)
			if err != nil {
				return nil, fmt.Errorf("open replica for %s: %w", shard, err)
			}
			db.SetMaxOpenConns(10)
			sm.readReplicas[shard] = append(sm.readReplicas[shard], db)
		}
	}

	sm.ring = NewConsistentHashRing(nodeNames, 150)
	return sm, nil
}

func (sm *ShardManager) GetShardName(key string) string {
	return sm.ring.GetNode(key)
}

func (sm *ShardManager) GetWriteDB(shardKey string) *sql.DB {
	name := sm.ring.GetNode(shardKey)
	return sm.shards[name]
}

func (sm *ShardManager) GetReadDB(shardKey string) *sql.DB {
	name := sm.ring.GetNode(shardKey)
	replicas := sm.readReplicas[name]
	if len(replicas) > 0 {
		return replicas[rand.Intn(len(replicas))]
	}
	return sm.shards[name] // fallback to primary
}

// Scatter-gather across all shards
func (sm *ShardManager) QueryAllShards(ctx context.Context, query string, args ...interface{}) ([]map[string]interface{}, error) {
	var mu sync.Mutex
	var wg sync.WaitGroup
	var allResults []map[string]interface{}
	var firstErr error

	for _, db := range sm.shards {
		wg.Add(1)
		go func(db *sql.DB) {
			defer wg.Done()
			rows, err := db.QueryContext(ctx, query, args...)
			if err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
				return
			}
			defer rows.Close()

			cols, _ := rows.Columns()
			for rows.Next() {
				values := make([]interface{}, len(cols))
				ptrs := make([]interface{}, len(cols))
				for i := range values {
					ptrs[i] = &values[i]
				}
				rows.Scan(ptrs...)

				row := make(map[string]interface{})
				for i, col := range cols {
					row[col] = values[i]
				}

				mu.Lock()
				allResults = append(allResults, row)
				mu.Unlock()
			}
		}(db)
	}

	wg.Wait()
	return allResults, firstErr
}

func (sm *ShardManager) Close() {
	for _, db := range sm.shards {
		db.Close()
	}
	for _, replicas := range sm.readReplicas {
		for _, db := range replicas {
			db.Close()
		}
	}
}

func main() {
	sm, err := NewShardManager(
		[]ShardConfig{
			{Name: "shard-1", ConnectionString: "postgres://localhost:5432/blog_shard1?sslmode=disable"},
			{Name: "shard-2", ConnectionString: "postgres://localhost:5433/blog_shard2?sslmode=disable"},
			{Name: "shard-3", ConnectionString: "postgres://localhost:5434/blog_shard3?sslmode=disable"},
		},
		map[string][]string{
			"shard-1": {"postgres://localhost:5435/blog_shard1_replica?sslmode=disable"},
		},
	)
	if err != nil {
		log.Fatal(err)
	}
	defer sm.Close()

	userID := "user-12345"
	shard := sm.GetShardName(userID)
	log.Printf("User %s maps to %s", userID, shard)
}
```

</div>
</CodeTabs>

<Callout type="warning" title="Cross-Shard Queries Are Expensive">

একবার ডেটা শার্ড হয়ে গেলে, শার্ড জুড়ে JOIN করা scatter-gather অপারেশনে পরিণত হয়। এগুলো ধীর আর বেশি জটিল। আপনার শার্ড key যত্ন করে বেছে নিন — এটা হওয়া উচিত সেই dimension যেটা দিয়ে আপনি সবচেয়ে বেশি কোয়েরি করেন (সাধারণত `user_id` বা `tenant_id`)।

</Callout>

<div class="takeaways">

### মূল শিক্ষা

- শার্ডিংয়ের আগে **read replica** দিয়ে শুরু করুন — এগুলো সহজ আর বেশিরভাগ read-scaling সমস্যা সমাধান করে
- সমান distribution আর শার্ড যোগ করার সময় ন্যূনতম disruption-এর জন্য virtual node সহ **consistent hashing** ব্যবহার করুন
- **শার্ড key** সবকিছু নির্ধারণ করে — যে key দিয়ে সবচেয়ে বেশি কোয়েরি করেন সেটা বেছে নিন (সাধারণত user বা tenant ID)
- Cross-shard কোয়েরি (scatter-gather) খরুচে — এগুলো কমাতে আপনার ডেটা মডেল ডিজাইন করুন
- **Replication lag** মানে replica থেকে read কিছুটা বাসি ডেটা ফেরত দিতে পারে — বেশিরভাগ read-এর জন্য এটা ঠিক আছে, কিন্তু গুরুত্বপূর্ণ write-এর পর primary থেকে read করা উচিত

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **Instagram** user ID দিয়ে PostgreSQL শার্ড করে — প্রতিটা ইউজারের ডেটা একটা শার্ডে থাকে
- **Vitess** (YouTube-এর শার্ডিং framework) MySQL-এ স্বচ্ছ শার্ডিং যোগ করে, এখন Slack, Square আর GitHub ব্যবহার করে
- **Discord** বিলিয়ন বিলিয়ন মেসেজে পৌঁছালে এক PostgreSQL থেকে Cassandra-তে সরে যায়, channel ID দিয়ে শার্ড করা
- কয়েকশ মিলিয়ন row না হওয়া পর্যন্ত আপনার সম্ভবত শার্ডিং লাগবে না। read replica আর ভালো indexing দিয়ে শুরু করুন।

</div>
