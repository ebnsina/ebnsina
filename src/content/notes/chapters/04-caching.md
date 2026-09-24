---
title: 'ক্যাশিং বেসিকস'
subtitle: 'cache-aside প্যাটার্ন, TTL ম্যানেজমেন্ট আর cache invalidation স্ট্র্যাটেজির জন্য Redis ইন্টিগ্রেট করুন।'
chapter: 4
level: 'beginner'
readingTime: '15 মিনিট'
topics: ['Redis', 'cache-aside', 'TTL', 'cache invalidation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

মোড়ের মাথায় সিনার একটা চায়ের দোকান। সবচেয়ে বেশি বিক্রি হয় দুধ চা — চিনি, চা-পাতা, দুধ। এই জিনিসগুলো যদি প্রতিবার দোকানের পেছনের গুদাম থেকে এনে বানাতে হতো, প্রতি কাপে পাঁচ মিনিট চলে যেত, সামনে লাইন লম্বা হয়ে যেত। তাই সিনা চালাক — যেগুলো ঘনঘন লাগে, সেগুলো সে সামনের কাউন্টারেই হাতের নাগালে সাজিয়ে রাখে। অর্ডার এলেই সেকেন্ডে চা রেডি।

কিন্তু কাউন্টার তো ছোট, সব জিনিস তো আর রাখা যায় না। তাই শুধু যেগুলো সত্যিই বেশি লাগে সেগুলোই থাকে। কেউ হঠাৎ লেবু চা চাইলে আর লেবু কাউন্টারে না থাকলে সিনা একবার গুদাম পর্যন্ত হেঁটে যায়, লেবু এনে চা বানায়, আর কয়েকটা লেবু কাউন্টারে রেখে দেয় — পরেরবার যেন আর হাঁটতে না হয়। আবার দুধ তো কয়েক ঘণ্টা পরেই টকে যায়, তখন কাউন্টারের দুধ ফেলে গুদাম থেকে টাটকা দুধ আনতে হয়।

এই গল্পটাই আসলে **caching**। কাউন্টার হলো cache (দ্রুত, কিন্তু ছোট মেমরি), আর পেছনের গুদাম হলো database (ধীর, কিন্তু সব ডেটা ওখানেই)। কাউন্টারে জিনিস না পেয়ে গুদাম থেকে এনে রেখে দেওয়াটাই **cache-aside** প্যাটার্ন, আর কয়েক ঘণ্টা পর দুধ ফেলে দেওয়াটাই **TTL** দিয়ে cache expire করা। বাস্তবে Redis বা Memcached দিয়ে ঠিক এভাবেই database-এর উপর চাপ কমানো হয় — Facebook, YouTube থেকে শুরু করে প্রায় সব বড় সাইট ঘনঘন লাগা ডেটা এভাবেই ক্যাশে রাখে।

## ক্যাশিং কেন?

ডেটাবেস কোয়েরিতে 5-50ms লাগে। নেটওয়ার্ক কলে 50-500ms লাগে। Redis থেকে পড়তে লাগে 0.1-1ms। ক্যাশিং প্রায়ই ব্যবহৃত ডেটা মেমরিতে রাখে যাতে আপনি খরুচে অপারেশনটা পুরোপুরি এড়িয়ে যেতে পারেন।

এটাকে এমনভাবে ভাবুন — প্রতিবার লাইব্রেরিতে হেঁটে যাওয়ার বদলে আপনার সবচেয়ে বেশি ব্যবহৃত বইগুলো ডেস্কেই রেখে দেওয়া।

<Callout type="info">

**বাস্তব জীবনের উপমা**

প্রতিবার লাইব্রেরিতে হেঁটে যাওয়ার বদলে আপনার সবচেয়ে বেশি ব্যবহৃত বইগুলো ডেস্কে রাখার মতো। ডেস্ক ছোট (সীমিত মেমরি), তাই আপনি শুধু যেগুলো আসলে ব্যবহার করেন সেগুলোই রাখেন।

</Callout>

ডেস্ক ছোট (সীমিত মেমরি), তাই আপনি শুধু যেগুলো আসলে ব্যবহার করেন সেগুলোই রাখেন।

<Mermaid
title="Cache-Aside Pattern"
code={`graph LR
  C["Client"] --> S["App Server"] --> R["Redis Cache<br/>Check first"]
  R -- cache miss --> D["PostgreSQL<br/>Fetch from source"]
  D -. store in cache .-> R`}
/>

## Cache-Aside প্যাটার্ন

সবচেয়ে প্রচলিত ক্যাশিং স্ট্র্যাটেজি:

1. আগে ক্যাশ চেক করুন
2. **cache hit** হলে — ক্যাশ করা ডেটা ফেরত দিন
3. **cache miss** হলে — ডেটাবেস কোয়েরি করুন, রেজাল্ট ক্যাশে রাখুন, তারপর ফেরত দিন

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

Phil Karlton-এর বিখ্যাত উক্তি: "কম্পিউটার সায়েন্সে মাত্র দুটো কঠিন জিনিস আছে: cache invalidation আর জিনিসের নামকরণ।" আপনি যখন ডেটা আপডেট করেন, তখন সব ক্যাশ করা ভার্সন invalidate করতে হবে। একটা মিস করলেই ইউজাররা বাসি ডেটা দেখবে। উপরের write-through প্যাটার্ন DB রাইটের সাথে সাথেই ক্যাশ আপডেট করে এটা সামলায়।

</Callout>

## ক্যাশ স্ট্র্যাটেজির তুলনা

| স্ট্র্যাটেজি  | কীভাবে কাজ করে                           | কীসের জন্য সেরা              |
| ------------- | ---------------------------------------- | ---------------------------- |
| Cache-Aside   | অ্যাপ ক্যাশ চেক করে, DB-তে fall back করে | সাধারণ কাজ, read-heavy       |
| Write-Through | অ্যাপ ক্যাশ আর DB-তে একসাথে লেখে         | যে ডেটা consistent থাকতে হবে |
| Write-Behind  | অ্যাপ ক্যাশে লেখে, async করে DB-তে flush | High write throughput        |
| Read-Through  | ক্যাশ নিজেই miss-এ DB থেকে fetch করে     | CDN-স্টাইল ক্যাশিং           |

<div class="takeaways">

### মূল শিক্ষা

- Cache-aside সবচেয়ে প্রচলিত আর নিরাপদ প্যাটার্ন — এখান থেকেই শুরু করুন
- সবসময় একটা TTL সেট করুন — বাসি ক্যাশ ক্যাশ না থাকার চেয়ে ভালো, কিন্তু অসীম বাসিভাব একটা বাগ
- মিসিং ডেটার জন্য বারবার DB lookup ঠেকাতে negative রেজাল্ট (null/404) ক্যাশ করুন
- একাধিক key invalidate করার সময় pipeline/batch অপারেশন ব্যবহার করুন
- আপনার cache hit ratio মনিটর করুন — 80%-এর নিচে মানে আপনার TTL বা key টিউন করা দরকার

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **Twitter** Redis-এ টাইমলাইন ক্যাশ করে — প্রতিটা ইউজারের হোম টাইমলাইন আগে থেকে হিসাব করে ক্যাশ করা থাকে
- **GitHub** repository মেটাডেটা, ইউজার প্রোফাইল আর API রেসপন্স Memcached/Redis-এ ক্যাশ করে
- **Stack Overflow** ভারী Redis ক্যাশিং দিয়ে মাসে 5.5 বিলিয়ন page view সার্ভ করে আর sub-10ms রেসপন্স টাইম অর্জন করে
- আপনার ডেটাবেস যখন bottleneck হয়ে যায় (high CPU, ধীর কোয়েরি, connection নিঃশেষ) তখন ক্যাশিং যোগ করুন

</div>
