---
title: 'ডেটাবেস ফান্ডামেন্টালস'
subtitle: 'PostgreSQL-এ কানেক্ট করুন, স্কিমা ডিজাইন করুন, prepared statement দিয়ে নিরাপদ কোয়েরি লিখুন আর connection pool ম্যানেজ করুন।'
chapter: 3
level: 'beginner'
readingTime: '20 মিনিট'
topics: ['PostgreSQL', 'SQL', 'connection pooling', 'prepared statements', 'migrations']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

পাড়ার লাইব্রেরিতে আল-খোয়ারিজমি চাচা লাইব্রেরিয়ান। তার একটা মোটা রেজিস্টার খাতা আছে — প্রতিটা লাইনে একজন সদস্যের তথ্য: নাম, ঠিকানা, ফোন। কিন্তু দুজন সদস্যের নাম যদি একই হয়, বা একজন ঠিকানা বদলায়, তখন কোন লাইনটা কার সেটা গুলিয়ে যায়। তাই আল-খোয়ারিজমি চাচা প্রতিটা সদস্যকে একটা নিজস্ব মেম্বারশিপ নম্বর দেন — ইবনে সিনার নম্বর ১০৪২, ফাতিমা আল-ফিহরির নম্বর ১০৪৩। এই নম্বর কখনো দুজনের এক হয় না, তাই এটা দিয়ে ঠিক এক সদস্যকেই আলাদা করে চেনা যায়।

বইয়ের হিসাব আবার আলাদা একটা খাতায় রাখা — কোন বই কে ধার নিয়েছে। সেই খাতায় সদস্যের পুরো নাম-ঠিকানা আবার লেখেন না, শুধু মেম্বারশিপ নম্বরটা লেখেন — "বই: সিন্দবাদের গল্প, সদস্য: ১০৪২"। কেউ জানতে চাইলে এই বই কে নিয়েছে, নম্বর ১০৪২ ধরে সদস্য-খাতায় গিয়ে ইবনে সিনার নাম বেরিয়ে আসে। আর হাজার সদস্যের খাতা প্রতিবার পাতা উল্টে খোঁজার বদলে চাচার আছে একটা আলফাবেটিক্যাল কার্ড বাক্স — নাম ধরে ঠেলা দিলেই কার্ডে সদস্যের নম্বর, সঙ্গে সঙ্গে সোজা সেই লাইনে।

এই গল্পটাই আসলে একটা **database**। সদস্য-রেজিস্টার হলো একটা **table**, তার প্রতিটা লাইন একটা **row** (রেকর্ড), মেম্বারশিপ নম্বর হলো **primary key** যা প্রতিটা row-কে অনন্যভাবে চেনায়। বই-খাতায় ওই নম্বর দিয়ে সদস্য-খাতাকে জোড়া লাগানোটাই **foreign key** দিয়ে relationship, আর কার্ড বাক্সটা হলো **index** — পুরো table স্ক্যান না করে সঙ্গে সঙ্গে রেকর্ড খুঁজে দেয়। বাস্তবে PostgreSQL বা MySQL-এ ঠিক এভাবেই একটা **query** লিখে এই জোড়া-লাগানো, index-নির্ভর খোঁজাখুঁজি সেকেন্ডে সেরে ফেলা হয়।

## সিস্টেম ডিজাইনে ডেটাবেস কেন গুরুত্বপূর্ণ

স্টেট সংরক্ষণ করে এমন প্রতিটা সিস্টেমের একটা ডেটাবেস দরকার। সঠিক ডেটাবেস বেছে নেওয়া আর সেটা ঠিকভাবে ব্যবহার করাই একটা স্কেল করা সিস্টেম আর 100 concurrent ইউজারে ভেঙে পড়া সিস্টেমের মধ্যে পার্থক্য গড়ে দেয়।

একটা ডেটাবেসকে খুব চালাক সেক্রেটারি সহ একটা ফাইলিং ক্যাবিনেটের মতো ভাবুন।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা চালাক সেক্রেটারি সহ ফাইলিং ক্যাবিনেটের মতো — আপনি কী চান বলেন (query), আর সে সেটা খুঁজে দেয়। ক্যাবিনেট যদি সুসংগঠিত হয় (indexed), lookup দ্রুত হয়। বেশি সেক্রেটারি (connection pool) মানে একসাথে বেশি লোককে সেবা দেওয়া।

</Callout>

আপনি সেক্রেটারিকে বলেন আপনি কী চান (query), আর সে আপনার জন্য সেটা খুঁজে দেয়। ফাইলিং ক্যাবিনেট যদি সুসংগঠিত হয় (indexed), lookup দ্রুত হয়। আপনি যদি একাধিক সেক্রেটারি রাখেন (connection pool), আপনি একসাথে বেশি লোককে সেবা দিতে পারবেন।

<Mermaid
title="Application to Database Flow"
code={`graph LR
  A["App Server"] --> B["Connection Pool<br/>Max: 20 conns"] --> C["PostgreSQL<br/>Primary"]`}
/>

## স্কিমা ডিজাইন

একটা ভালোভাবে ডিজাইন করা স্কিমা ডেটা অ্যানোমালি ঠেকায় আর কোয়েরিকে efficient বানায়। এখানে একটা ব্লগ প্ল্যাটফর্মের জন্য একটা রিয়েল স্কিমা:

```sql
-- migrations/001_initial.sql

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    VARCHAR(50) UNIQUE NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,
    bio         TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE posts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug        VARCHAR(300) UNIQUE NOT NULL,
    title       VARCHAR(300) NOT NULL,
    body        TEXT NOT NULL,
    published   BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_posts_author     ON posts(author_id);
CREATE INDEX idx_posts_published  ON posts(published) WHERE published = TRUE;
CREATE INDEX idx_posts_created    ON posts(created_at DESC);
CREATE INDEX idx_comments_post    ON comments(post_id);
CREATE INDEX idx_comments_created ON comments(created_at DESC);
```

<Callout type="info" title="Partial Indexes">

`idx_posts_published`-এর উপর থাকা `WHERE published = TRUE` একটা partial index — এটা শুধু published পোস্টগুলোকে index করে। যেহেতু বেশিরভাগ কোয়েরি `published = TRUE` দিয়ে filter করে, এই index সব row index করার চেয়ে ছোট আর দ্রুত।

</Callout>

## সম্পূর্ণ ডেটাবেস লেয়ার

<CodeTabs tsFile="database.ts" goFile="database.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import pg from 'pg';

// --- Connection Pool ---
const pool = new pg.Pool({
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT || '5432'),
	database: process.env.DB_NAME || 'blog',
	user: process.env.DB_USER || 'postgres',
	password: process.env.DB_PASSWORD || 'postgres',
	max: 20, // max connections in pool
	idleTimeoutMillis: 30000, // close idle connections after 30s
	connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
	console.error('Unexpected pool error:', err);
});

// --- Types ---
interface User {
	id: string;
	username: string;
	email: string;
	bio: string;
	createdAt: Date;
}

interface Post {
	id: string;
	authorId: string;
	slug: string;
	title: string;
	body: string;
	published: boolean;
	createdAt: Date;
	updatedAt: Date;
	author?: User;
	commentCount?: number;
}

interface ListPostsParams {
	authorId?: string;
	published?: boolean;
	cursor?: string;
	limit?: number;
}

// --- Repository ---
class PostRepository {
	// Create a post with prepared statement (prevents SQL injection)
	async create(data: {
		authorId: string;
		slug: string;
		title: string;
		body: string;
	}): Promise<Post> {
		const result = await pool.query<Post>(
			`INSERT INTO posts (author_id, slug, title, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, author_id AS "authorId", slug, title, body,
                 published, created_at AS "createdAt", updated_at AS "updatedAt"`,
			[data.authorId, data.slug, data.title, data.body]
		);
		return result.rows[0];
	}

	// Get a single post with author info using JOIN
	async getBySlug(slug: string): Promise<Post | null> {
		const result = await pool.query<Post & { authorUsername: string; authorEmail: string }>(
			`SELECT
         p.id, p.author_id AS "authorId", p.slug, p.title, p.body,
         p.published, p.created_at AS "createdAt", p.updated_at AS "updatedAt",
         u.username AS "authorUsername", u.email AS "authorEmail",
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id)::int AS "commentCount"
       FROM posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.slug = $1`,
			[slug]
		);

		if (result.rows.length === 0) return null;

		const row = result.rows[0];
		return {
			...row,
			author: {
				id: row.authorId,
				username: row.authorUsername,
				email: row.authorEmail,
				bio: '',
				createdAt: row.createdAt
			}
		};
	}

	// List posts with cursor pagination, filtering, and JOIN
	async list(params: ListPostsParams): Promise<{ posts: Post[]; hasMore: boolean }> {
		const limit = Math.min(params.limit || 20, 100);
		const conditions: string[] = [];
		const values: unknown[] = [];
		let paramIndex = 1;

		if (params.authorId) {
			conditions.push(`p.author_id = $${paramIndex++}`);
			values.push(params.authorId);
		}
		if (params.published !== undefined) {
			conditions.push(`p.published = $${paramIndex++}`);
			values.push(params.published);
		}
		if (params.cursor) {
			conditions.push(`p.created_at < (SELECT created_at FROM posts WHERE id = $${paramIndex++})`);
			values.push(params.cursor);
		}

		const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

		values.push(limit + 1); // fetch one extra to check hasMore

		const result = await pool.query<Post>(
			`SELECT
         p.id, p.author_id AS "authorId", p.slug, p.title,
         LEFT(p.body, 200) AS body,
         p.published, p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM posts p
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${paramIndex}`,
			values
		);

		const hasMore = result.rows.length > limit;
		const posts = hasMore ? result.rows.slice(0, limit) : result.rows;

		return { posts, hasMore };
	}

	// Update with optimistic locking pattern
	async update(
		id: string,
		data: Partial<Pick<Post, 'title' | 'body' | 'published'>>
	): Promise<Post | null> {
		const fields: string[] = [];
		const values: unknown[] = [];
		let idx = 1;

		if (data.title !== undefined) {
			fields.push(`title = $${idx++}`);
			values.push(data.title);
		}
		if (data.body !== undefined) {
			fields.push(`body = $${idx++}`);
			values.push(data.body);
		}
		if (data.published !== undefined) {
			fields.push(`published = $${idx++}`);
			values.push(data.published);
		}

		if (fields.length === 0) return null;

		fields.push(`updated_at = NOW()`);
		values.push(id);

		const result = await pool.query<Post>(
			`UPDATE posts SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, author_id AS "authorId", slug, title, body,
                 published, created_at AS "createdAt", updated_at AS "updatedAt"`,
			values
		);

		return result.rows[0] || null;
	}

	// Transaction: delete post and all related data
	async delete(id: string): Promise<boolean> {
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query('DELETE FROM comments WHERE post_id = $1', [id]);
			const result = await client.query('DELETE FROM posts WHERE id = $1', [id]);
			await client.query('COMMIT');
			return (result.rowCount ?? 0) > 0;
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		} finally {
			client.release();
		}
	}
}

// --- Health check ---
async function checkDB(): Promise<boolean> {
	try {
		const result = await pool.query('SELECT 1 AS ok');
		return result.rows[0]?.ok === 1;
	} catch {
		return false;
	}
}

// --- Cleanup on shutdown ---
async function shutdown(): Promise<void> {
	console.log('Closing database pool...');
	await pool.end();
	console.log('Pool closed.');
}

export { PostRepository, checkDB, shutdown };
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// --- Types ---
type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Bio       string    `json:"bio"`
	CreatedAt time.Time `json:"createdAt"`
}

type Post struct {
	ID           string    `json:"id"`
	AuthorID     string    `json:"authorId"`
	Slug         string    `json:"slug"`
	Title        string    `json:"title"`
	Body         string    `json:"body"`
	Published    bool      `json:"published"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Author       *User     `json:"author,omitempty"`
	CommentCount int       `json:"commentCount,omitempty"`
}

type ListPostsParams struct {
	AuthorID  string
	Published *bool
	Cursor    string
	Limit     int
}

// --- Database Connection ---
func NewDB() (*sql.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/blog?sslmode=disable"
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	// Connection pool settings
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return db, nil
}

// --- Repository ---
type PostRepository struct {
	db *sql.DB
}

func NewPostRepository(db *sql.DB) *PostRepository {
	return &PostRepository{db: db}
}

func (r *PostRepository) Create(ctx context.Context, authorID, slug, title, body string) (*Post, error) {
	var post Post
	err := r.db.QueryRowContext(ctx,
		`INSERT INTO posts (author_id, slug, title, body)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, author_id, slug, title, body, published, created_at, updated_at`,
		authorID, slug, title, body,
	).Scan(
		&post.ID, &post.AuthorID, &post.Slug, &post.Title,
		&post.Body, &post.Published, &post.CreatedAt, &post.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create post: %w", err)
	}
	return &post, nil
}

func (r *PostRepository) GetBySlug(ctx context.Context, slug string) (*Post, error) {
	var post Post
	var author User

	err := r.db.QueryRowContext(ctx,
		`SELECT
			p.id, p.author_id, p.slug, p.title, p.body,
			p.published, p.created_at, p.updated_at,
			u.username, u.email,
			(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id)
		 FROM posts p
		 JOIN users u ON u.id = p.author_id
		 WHERE p.slug = $1`, slug,
	).Scan(
		&post.ID, &post.AuthorID, &post.Slug, &post.Title,
		&post.Body, &post.Published, &post.CreatedAt, &post.UpdatedAt,
		&author.Username, &author.Email, &post.CommentCount,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get post by slug: %w", err)
	}

	author.ID = post.AuthorID
	post.Author = &author
	return &post, nil
}

func (r *PostRepository) List(ctx context.Context, params ListPostsParams) ([]Post, bool, error) {
	limit := params.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	conditions := []string{}
	args := []interface{}{}
	argIdx := 1

	if params.AuthorID != "" {
		conditions = append(conditions, fmt.Sprintf("p.author_id = $%d", argIdx))
		args = append(args, params.AuthorID)
		argIdx++
	}
	if params.Published != nil {
		conditions = append(conditions, fmt.Sprintf("p.published = $%d", argIdx))
		args = append(args, *params.Published)
		argIdx++
	}
	if params.Cursor != "" {
		conditions = append(conditions, fmt.Sprintf(
			"p.created_at < (SELECT created_at FROM posts WHERE id = $%d)", argIdx))
		args = append(args, params.Cursor)
		argIdx++
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	args = append(args, limit+1)
	query := fmt.Sprintf(
		`SELECT p.id, p.author_id, p.slug, p.title,
		        LEFT(p.body, 200), p.published, p.created_at, p.updated_at
		 FROM posts p %s
		 ORDER BY p.created_at DESC
		 LIMIT $%d`, where, argIdx)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, false, fmt.Errorf("list posts: %w", err)
	}
	defer rows.Close()

	var posts []Post
	for rows.Next() {
		var p Post
		if err := rows.Scan(
			&p.ID, &p.AuthorID, &p.Slug, &p.Title,
			&p.Body, &p.Published, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, false, fmt.Errorf("scan post: %w", err)
		}
		posts = append(posts, p)
	}

	hasMore := len(posts) > limit
	if hasMore {
		posts = posts[:limit]
	}

	return posts, hasMore, nil
}

// Transaction: delete post and all related data
func (r *PostRepository) Delete(ctx context.Context, id string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "DELETE FROM comments WHERE post_id = $1", id); err != nil {
		return fmt.Errorf("delete comments: %w", err)
	}
	result, err := tx.ExecContext(ctx, "DELETE FROM posts WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("delete post: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("post not found")
	}

	return tx.Commit()
}

// --- Health check ---
func HealthCheck(db *sql.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return db.PingContext(ctx)
}

func main() {
	db, err := NewDB()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	repo := NewPostRepository(db)
	log.Printf("Connected to database. Repo ready: %v", repo != nil)
}
```

</div>
</CodeTabs>

<div class="takeaways">

### মূল শিক্ষা

- সবসময় **prepared statement** ব্যবহার করুন (`$1`, `$2`) — ইউজার ইনপুট কখনো SQL স্ট্রিংয়ে জোড়া লাগাবেন না
- **Connection pooling** অপরিহার্য — প্রতি কোয়েরিতে নতুন TCP কানেকশন বানানো 100 গুণ ধীর
- একাধিক কোয়েরি একসাথে সফল বা ফেল করতে হলে **transaction** ব্যবহার করুন
- আপনার আসল কোয়েরি প্যাটার্নের জন্য **index** ডিজাইন করুন, শুধু primary key-এর জন্য নয়
- ডেটাবেস লেভেলে **cursor-based pagination** `WHERE created_at &lt; ?` ব্যবহার করে — `OFFSET`-এর চেয়ে অনেক দ্রুত

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **Instagram** PgBouncer দিয়ে connection pooling ব্যবহার করে PostgreSQL-এ 2 বিলিয়নের বেশি row সংরক্ষণ করে
- **Notion** সব স্ট্রাকচার্ড ডেটার জন্য PostgreSQL ব্যবহার করে, তাদের কোয়েরি প্যাটার্নের জন্য যত্ন করে index ডিজাইন করা
- **Discord** প্রথমে PostgreSQL ব্যবহার করত, পরে extreme scale-এ hot ডেটা ScyllaDB-তে migrate করে
- PostgreSQL দিয়ে শুরু করুন — বেশিরভাগ কোম্পানির যতটা দরকার হবে, তার চেয়ে বেশি scale এটা সামলাতে পারে

</div>
