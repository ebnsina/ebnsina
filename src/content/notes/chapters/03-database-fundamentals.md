---
title: 'Database Fundamentals'
subtitle: 'Connect to PostgreSQL, design schemas, write safe queries with prepared statements, and manage connection pools.'
chapter: 3
level: 'beginner'
readingTime: '20 min'
topics: ['PostgreSQL', 'SQL', 'connection pooling', 'prepared statements', 'migrations']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## Why Databases Matter in System Design

Every system that stores state needs a database. Choosing the right database and using it correctly is the difference between a system that scales and one that falls over at 100 concurrent users.

Think of a database like a filing cabinet with a very smart secretary.

<Callout type="info">

**Real-World Analogy**

Like a filing cabinet with a smart secretary — you describe what you want (query), and they find it. If the cabinet is well-organized (indexed), lookups are fast. More secretaries (connection pool) means more people served simultaneously.

</Callout>

You tell the secretary what you want (query), and they find it for you. If the filing cabinet is well-organized (indexed), lookups are fast. If you hire multiple secretaries (connection pool), you can serve more people simultaneously.

<Mermaid
title="Application to Database Flow"
code={`graph LR
  A["App Server"] --> B["Connection Pool<br/>Max: 20 conns"] --> C["PostgreSQL<br/>Primary"]`}
/>

## Schema Design

A well-designed schema prevents data anomalies and makes queries efficient. Here's a real schema for a blog platform:

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

The `WHERE published = TRUE` on `idx_posts_published` is a partial index — it only indexes published posts. Since most queries filter by `published = TRUE`, this index is smaller and faster than indexing all rows.

</Callout>

## Complete Database Layer

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

### Key Takeaways

- Always use **prepared statements** (`$1`, `$2`) — never concatenate user input into SQL strings
- **Connection pooling** is essential — creating a new TCP connection per query is 100x slower
- Use **transactions** when multiple queries must succeed or fail together
- Design **indexes** for your actual query patterns, not just primary keys
- **Cursor-based pagination** at the database level uses `WHERE created_at &lt; ?` — much faster than `OFFSET`

</div>

<div class="when-to-use">

### Real-World Usage

- **Instagram** stores over 2 billion rows in PostgreSQL using connection pooling with PgBouncer
- **Notion** uses PostgreSQL for all structured data with careful index design for their query patterns
- **Discord** initially used PostgreSQL before migrating hot data to ScyllaDB at extreme scale
- Start with PostgreSQL — it handles more scale than most companies will ever need

</div>
