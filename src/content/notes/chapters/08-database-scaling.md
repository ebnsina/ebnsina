---
title: "Database Sharding & Replication"
subtitle: "Implement read replicas, consistent hashing for sharding, and shard-aware query routing."
chapter: 8
level: "intermediate"
readingTime: "20 min"
topics: ["sharding", "replication", "consistent hashing", "read replicas"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Diagram from '$lib/components/content/Diagram.svelte';
</script>

## When One Database Isn't Enough

A single PostgreSQL instance handles thousands of queries per second. But eventually you hit limits: too many reads, too many writes, or too much data for one machine. Two strategies solve this:

- **Replication** — copy data to read replicas for read scaling
- **Sharding** — split data across multiple databases for write scaling

<Callout type="info">

**Real-World Analogy**

Like a post office sorting mail by zip code — 90210 goes to Beverly Hills, 10001 goes to Manhattan. Each office handles only its zone's mail. That's sharding.

</Callout>

<Diagram title="Replication + Sharding Architecture">
  <div class="diagram-row">
    <div class="box box-server">App Server</div>
    <div class="arrow">---&gt;</div>
    <div class="box box-lb">Router<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Read/Write Split</span></div>
  </div>
  <div class="arrow-down">v</div>
  <div class="diagram-row">
    <div style="display:flex;flex-direction:column;gap:4px;align-items:center;">
      <div class="box box-db">Primary (Writes)</div>
      <div style="font-size:0.7rem;color:var(--color-text-muted)">replicates to</div>
      <div style="display:flex;gap:8px;">
        <div class="box box-db" style="opacity:0.7;">Replica 1</div>
        <div class="box box-db" style="opacity:0.7;">Replica 2</div>
      </div>
    </div>
  </div>
</Diagram>

## Consistent Hashing for Sharding

When you shard data across N databases, you need to consistently route `user_123` to the same shard. Simple modulo (`hash(key) % N`) breaks when you add or remove shards — it reassigns almost every key. Consistent hashing minimizes this: adding a shard only moves ~1/N of the keys.

<CodeTabs tsFile="sharding.ts" goFile="sharding.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import crypto from "node:crypto";
import pg from "pg";

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
    const h = crypto.createHash("md5").update(key).digest();
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
      throw new Error("No nodes in the ring");
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

  constructor(
    shardConfigs: ShardConfig[],
    replicaConfigs?: Record<string, string[]>
  ) {
    // Create connection pools for each shard
    const nodeNames: string[] = [];
    for (const config of shardConfigs) {
      const pool = new pg.Pool({
        connectionString: config.connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
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
  async writeQuery<T>(
    shardKey: string,
    sql: string,
    params: unknown[]
  ): Promise<T[]> {
    const pool = this.getWritePool(shardKey);
    const result = await pool.query(sql, params);
    return result.rows;
  }

  async readQuery<T>(
    shardKey: string,
    sql: string,
    params: unknown[]
  ): Promise<T[]> {
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
      { name: "shard-1", connectionString: "postgres://localhost:5432/blog_shard1" },
      { name: "shard-2", connectionString: "postgres://localhost:5433/blog_shard2" },
      { name: "shard-3", connectionString: "postgres://localhost:5434/blog_shard3" },
    ],
    {
      "shard-1": ["postgres://localhost:5435/blog_shard1_replica"],
      "shard-2": ["postgres://localhost:5436/blog_shard2_replica"],
    }
  );

  const userId = "user-12345";

  // Writes go to primary
  await manager.writeQuery(
    userId,
    `INSERT INTO users (id, username, email) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [userId, "johndoe", "john@example.com"]
  );

  // Reads go to replica
  const user = await manager.readQuery(
    userId,
    "SELECT * FROM users WHERE id = $1",
    [userId]
  );

  console.log(`User on shard: ${manager.getShardName(userId)}`, user);

  // Cross-shard query (scatter-gather)
  const allUsers = await manager.queryAllShards(
    "SELECT id, username FROM users ORDER BY created_at DESC LIMIT 10",
    []
  );
  console.log("Users across all shards:", allUsers.length);

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

  Once data is sharded, JOINs across shards become scatter-gather operations. They're slower and more complex. Choose your shard key carefully — it should be the dimension you query by most often (usually `user_id` or `tenant_id`).

</Callout>

<div class="takeaways">

### Key Takeaways

- Start with **read replicas** before sharding — they're simpler and solve most read-scaling problems
- Use **consistent hashing** with virtual nodes for even distribution and minimal disruption when adding shards
- The **shard key** determines everything — pick the key you query by most frequently (typically user or tenant ID)
- Cross-shard queries (scatter-gather) are expensive — design your data model to minimize them
- **Replication lag** means reads from replicas may return slightly stale data — this is fine for most reads but critical writes should read from primary

</div>

<div class="when-to-use">

### Real-World Usage

- **Instagram** shards PostgreSQL by user ID — each user's data lives on one shard
- **Vitess** (YouTube's sharding framework) adds transparent sharding to MySQL, now used by Slack, Square, and GitHub
- **Discord** moved from one PostgreSQL to Cassandra when they hit billions of messages, sharded by channel ID
- You probably don't need sharding until you have hundreds of millions of rows. Start with read replicas and better indexing.

</div>

