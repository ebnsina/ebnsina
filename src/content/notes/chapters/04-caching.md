---
title: 'Caching Basics'
subtitle: 'Integrate Redis for cache-aside pattern, TTL management, and cache invalidation strategies.'
chapter: 4
level: 'beginner'
readingTime: '15 min'
topics: ['Redis', 'cache-aside', 'TTL', 'cache invalidation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## Why Caching?

Database queries take 5-50ms. Network calls take 50-500ms. Reading from Redis takes 0.1-1ms. Caching stores frequently accessed data in memory so you skip the expensive operation entirely.

Think of it like keeping your most-used books on your desk instead of walking to the library every time.

<Callout type="info">

**Real-World Analogy**

Like keeping your most-used books on your desk instead of walking to the library every time. The desk is small (limited memory), so you only keep what you actually use.

</Callout>

The desk is small (limited memory), so you only keep what you actually use.

<Mermaid
title="Cache-Aside Pattern"
code={`graph LR
  C["Client"] --> S["App Server"] --> R["Redis Cache<br/>Check first"]
  R -- cache miss --> D["PostgreSQL<br/>Fetch from source"]
  D -. store in cache .-> R`}
/>

## Cache-Aside Pattern

The most common caching strategy:

1. Check cache first
2. On **cache hit** — return cached data
3. On **cache miss** — query the database, store result in cache, return it

<CodeTabs tsFile="cache.ts" goFile="cache.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import Redis from 'ioredis';
import pg from 'pg';

// --- Redis connection ---
const redis = new Redis({
	host: process.env.REDIS_HOST || 'localhost',
	port: parseInt(process.env.REDIS_PORT || '6379'),
	maxRetriesPerRequest: 3,
	retryStrategy(times: number) {
		const delay = Math.min(times * 200, 5000);
		return delay;
	}
});

redis.on('error', (err) => console.error('Redis error:', err));

const db = new pg.Pool({
	connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/blog',
	max: 20
});

// --- Types ---
interface Post {
	id: string;
	slug: string;
	title: string;
	body: string;
	authorId: string;
	published: boolean;
}

interface CacheStats {
	hits: number;
	misses: number;
	ratio: number;
}

// --- Cache service ---
class CacheService {
	private hits = 0;
	private misses = 0;

	private key(prefix: string, id: string): string {
		return `blog:${prefix}:${id}`;
	}

	async getPost(slug: string): Promise<Post | null> {
		const cacheKey = this.key('post', slug);

		// 1. Check cache
		const cached = await redis.get(cacheKey);
		if (cached) {
			this.hits++;
			return JSON.parse(cached);
		}

		// 2. Cache miss — query database
		this.misses++;
		const result = await db.query<Post>(
			`SELECT id, slug, title, body, author_id AS "authorId", published
       FROM posts WHERE slug = $1`,
			[slug]
		);

		if (result.rows.length === 0) {
			// Cache negative result to prevent repeated DB lookups
			await redis.set(cacheKey, JSON.stringify(null), 'EX', 60);
			return null;
		}

		const post = result.rows[0];

		// 3. Store in cache with TTL
		await redis.set(cacheKey, JSON.stringify(post), 'EX', 300); // 5 min TTL
		return post;
	}

	async getPostList(page: number, limit: number): Promise<Post[]> {
		const cacheKey = `blog:posts:page:${page}:${limit}`;

		const cached = await redis.get(cacheKey);
		if (cached) {
			this.hits++;
			return JSON.parse(cached);
		}

		this.misses++;
		const offset = (page - 1) * limit;
		const result = await db.query<Post>(
			`SELECT id, slug, title, LEFT(body, 200) AS body,
              author_id AS "authorId", published
       FROM posts
       WHERE published = TRUE
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
			[limit, offset]
		);

		// Shorter TTL for list views since they change more frequently
		await redis.set(cacheKey, JSON.stringify(result.rows), 'EX', 60);
		return result.rows;
	}

	// --- Cache Invalidation ---

	// Invalidate single post cache
	async invalidatePost(slug: string): Promise<void> {
		await redis.del(this.key('post', slug));
		// Also invalidate list caches since they may contain this post
		await this.invalidatePostLists();
	}

	// Invalidate all post list caches using pattern scan
	async invalidatePostLists(): Promise<void> {
		const stream = redis.scanStream({
			match: 'blog:posts:page:*',
			count: 100
		});

		const pipeline = redis.pipeline();
		let count = 0;

		for await (const keys of stream) {
			for (const key of keys as string[]) {
				pipeline.del(key);
				count++;
			}
		}

		if (count > 0) {
			await pipeline.exec();
		}
	}

	// Update post: write-through (update DB + cache simultaneously)
	async updatePost(slug: string, data: Partial<Post>): Promise<Post | null> {
		const fields: string[] = [];
		const values: unknown[] = [];
		let idx = 1;

		if (data.title) {
			fields.push(`title = $${idx++}`);
			values.push(data.title);
		}
		if (data.body) {
			fields.push(`body = $${idx++}`);
			values.push(data.body);
		}
		if (data.published !== undefined) {
			fields.push(`published = $${idx++}`);
			values.push(data.published);
		}

		if (fields.length === 0) return null;

		fields.push(`updated_at = NOW()`);
		values.push(slug);

		const result = await db.query<Post>(
			`UPDATE posts SET ${fields.join(', ')}
       WHERE slug = $${idx}
       RETURNING id, slug, title, body, author_id AS "authorId", published`,
			values
		);

		if (result.rows.length === 0) return null;

		const post = result.rows[0];

		// Write-through: update cache with fresh data
		const cacheKey = this.key('post', slug);
		await redis.set(cacheKey, JSON.stringify(post), 'EX', 300);

		// Invalidate list caches
		await this.invalidatePostLists();

		return post;
	}

	// Delete post: invalidate cache
	async deletePost(slug: string): Promise<boolean> {
		const result = await db.query('DELETE FROM posts WHERE slug = $1', [slug]);
		await this.invalidatePost(slug);
		return (result.rowCount ?? 0) > 0;
	}

	// --- Stats ---
	getStats(): CacheStats {
		const total = this.hits + this.misses;
		return {
			hits: this.hits,
			misses: this.misses,
			ratio: total > 0 ? this.hits / total : 0
		};
	}
}

// --- Usage ---
async function main() {
	const cache = new CacheService();

	// First call: cache miss, hits DB
	const post1 = await cache.getPost('hello-world');
	console.log('First fetch:', post1?.title, cache.getStats());

	// Second call: cache hit, skips DB
	const post2 = await cache.getPost('hello-world');
	console.log('Second fetch:', post2?.title, cache.getStats());

	// Update: write-through
	await cache.updatePost('hello-world', { title: 'Updated Title' });

	// Cleanup
	await redis.quit();
	await db.end();
}

main().catch(console.error);
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// --- Types ---
type Post struct {
	ID        string `json:"id"`
	Slug      string `json:"slug"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	AuthorID  string `json:"authorId"`
	Published bool   `json:"published"`
}

type CacheStats struct {
	Hits   int64   `json:"hits"`
	Misses int64   `json:"misses"`
	Ratio  float64 `json:"ratio"`
}

// --- Cache Service ---
type CacheService struct {
	rdb    *redis.Client
	db     *sql.DB
	hits   atomic.Int64
	misses atomic.Int64
}

func NewCacheService(rdb *redis.Client, db *sql.DB) *CacheService {
	return &CacheService{rdb: rdb, db: db}
}

func (c *CacheService) key(prefix, id string) string {
	return fmt.Sprintf("blog:%s:%s", prefix, id)
}

func (c *CacheService) GetPost(ctx context.Context, slug string) (*Post, error) {
	cacheKey := c.key("post", slug)

	// 1. Check cache
	val, err := c.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		c.hits.Add(1)
		var post Post
		if err := json.Unmarshal([]byte(val), &post); err != nil {
			return nil, fmt.Errorf("unmarshal cached post: %w", err)
		}
		return &post, nil
	}
	if err != redis.Nil {
		log.Printf("Redis get error (non-fatal): %v", err)
	}

	// 2. Cache miss — query database
	c.misses.Add(1)
	var post Post
	err = c.db.QueryRowContext(ctx,
		`SELECT id, slug, title, body, author_id, published
		 FROM posts WHERE slug = $1`, slug,
	).Scan(&post.ID, &post.Slug, &post.Title, &post.Body, &post.AuthorID, &post.Published)

	if err == sql.ErrNoRows {
		// Cache negative result
		c.rdb.Set(ctx, cacheKey, "null", 60*time.Second)
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query post: %w", err)
	}

	// 3. Store in cache with TTL
	data, _ := json.Marshal(post)
	c.rdb.Set(ctx, cacheKey, data, 5*time.Minute)

	return &post, nil
}

func (c *CacheService) GetPostList(ctx context.Context, page, limit int) ([]Post, error) {
	cacheKey := fmt.Sprintf("blog:posts:page:%d:%d", page, limit)

	val, err := c.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		c.hits.Add(1)
		var posts []Post
		json.Unmarshal([]byte(val), &posts)
		return posts, nil
	}

	c.misses.Add(1)
	offset := (page - 1) * limit
	rows, err := c.db.QueryContext(ctx,
		`SELECT id, slug, title, LEFT(body, 200), author_id, published
		 FROM posts WHERE published = TRUE
		 ORDER BY created_at DESC
		 LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("query posts: %w", err)
	}
	defer rows.Close()

	var posts []Post
	for rows.Next() {
		var p Post
		rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Body, &p.AuthorID, &p.Published)
		posts = append(posts, p)
	}

	data, _ := json.Marshal(posts)
	c.rdb.Set(ctx, cacheKey, data, 60*time.Second)

	return posts, nil
}

// --- Cache Invalidation ---
func (c *CacheService) InvalidatePost(ctx context.Context, slug string) error {
	pipe := c.rdb.Pipeline()
	pipe.Del(ctx, c.key("post", slug))

	// Scan and delete list caches
	iter := c.rdb.Scan(ctx, 0, "blog:posts:page:*", 100).Iterator()
	for iter.Next(ctx) {
		pipe.Del(ctx, iter.Val())
	}

	_, err := pipe.Exec(ctx)
	return err
}

// Write-through update
func (c *CacheService) UpdatePost(ctx context.Context, slug, title, body string) (*Post, error) {
	var post Post
	err := c.db.QueryRowContext(ctx,
		`UPDATE posts SET title = $1, body = $2, updated_at = NOW()
		 WHERE slug = $3
		 RETURNING id, slug, title, body, author_id, published`,
		title, body, slug,
	).Scan(&post.ID, &post.Slug, &post.Title, &post.Body, &post.AuthorID, &post.Published)
	if err != nil {
		return nil, err
	}

	// Write-through: update cache
	data, _ := json.Marshal(post)
	c.rdb.Set(ctx, c.key("post", slug), data, 5*time.Minute)
	c.InvalidatePost(ctx, slug)

	return &post, nil
}

func (c *CacheService) Stats() CacheStats {
	hits := c.hits.Load()
	misses := c.misses.Load()
	total := hits + misses
	ratio := 0.0
	if total > 0 {
		ratio = float64(hits) / float64(total)
	}
	return CacheStats{Hits: hits, Misses: misses, Ratio: ratio}
}

func main() {
	rdb := redis.NewClient(&redis.Options{
		Addr:       "localhost:6379",
		PoolSize:   10,
		MaxRetries: 3,
	})
	defer rdb.Close()

	db, err := sql.Open("pgx", "postgres://localhost:5432/blog?sslmode=disable")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	cache := NewCacheService(rdb, db)
	ctx := context.Background()

	post, _ := cache.GetPost(ctx, "hello-world")
	log.Printf("First fetch: %v, stats: %+v", post, cache.Stats())

	post, _ = cache.GetPost(ctx, "hello-world")
	log.Printf("Second fetch: %v, stats: %+v", post, cache.Stats())
}
```

</div>
</CodeTabs>

<Callout type="warning" title="Cache Invalidation Is Hard">

Phil Karlton famously said: "There are only two hard things in Computer Science: cache invalidation and naming things." When you update data, you must invalidate all cached versions. Miss one, and users see stale data. The write-through pattern above handles this by updating cache immediately after DB writes.

</Callout>

## Cache Strategies Compared

| Strategy      | How It Works                           | Best For                     |
| ------------- | -------------------------------------- | ---------------------------- |
| Cache-Aside   | App checks cache, falls back to DB     | General purpose, read-heavy  |
| Write-Through | App writes to cache and DB together    | Data that must be consistent |
| Write-Behind  | App writes to cache, async flush to DB | High write throughput        |
| Read-Through  | Cache itself fetches from DB on miss   | CDN-style caching            |

<div class="takeaways">

### Key Takeaways

- Cache-aside is the most common and safest pattern — start here
- Always set a TTL — stale cache is better than no cache, but infinite staleness is a bug
- Cache negative results (null/404) to prevent repeated DB lookups for missing data
- Use pipeline/batch operations when invalidating multiple keys
- Monitor your cache hit ratio — below 80% means your TTLs or keys need tuning

</div>

<div class="when-to-use">

### Real-World Usage

- **Twitter** caches timelines in Redis — each user's home timeline is pre-computed and cached
- **GitHub** caches repository metadata, user profiles, and API responses in Memcached/Redis
- **Stack Overflow** serves 5.5 billion page views/month with heavy Redis caching and achieves sub-10ms response times
- Add caching when your database becomes the bottleneck (high CPU, slow queries, connection exhaustion)

</div>
