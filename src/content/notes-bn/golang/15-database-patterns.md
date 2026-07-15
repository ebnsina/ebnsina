---
title: 'Database Pattern'
subtitle: 'Migration, repository pattern, connection pooling, আর query builder — যে database layer স্কেল করে।'
chapter: 15
level: 'intermediate'
readingTime: '22 মিনিট'
topics:
  ['database', 'migrations', 'repository pattern', 'sqlc', 'transactions', 'connection pooling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

আল-খোয়ারিজমির একটা বড় মুদির দোকান — সামনে বিক্রির কাউন্টার, আর পেছনে বিশাল গুদাম। নিয়ম একটাই কড়া: কোনো সেলসম্যান নিজে গুদামে ঢুকে জিনিস হাতড়াতে পারবে না। গুদামের ভেতরের সাজানো-গোছানো, কোন তাকে কী আছে, কোনটা কীভাবে বের করতে হয় — এসব শুধু ফাতিমা আল-ফিহরি জানে, দোকানের একমাত্র গুদাম-রক্ষক। সেলসম্যানকে কিছু লাগলে সে শুধু কাউন্টারে দাঁড়িয়ে ফাতিমা আল-ফিহরিকে বলে "পাঁচ কেজি চাল দাও", ব্যস। চাল কোন বস্তায়, কোন তাকে, সেটা তার জানার দরকার নেই — একটা পরিষ্কার কাউন্টারের পেছনেই পুরো গুদামের ঝামেলা লুকানো।

আরেকটা মজার ব্যবস্থা আছে আল-খোয়ারিজমির। প্রতিটা অর্ডার ডেলিভারি দিতে সে প্রতিবার নতুন ডেলিভারি বয় ভাড়া করে না — সেটা তো সময় আর টাকা দুটোই নষ্ট। বরং তিন-চারজন ডেলিভারি বয় সবসময় দোকানেই বসা থাকে; একজন ডেলিভারি সেরে ফিরলেই তাকে পরের অর্ডারে পাঠানো হয়। ভিড় বেশি হলে সবাই ব্যস্ত, তখন নতুন অর্ডার একটু অপেক্ষা করে খালি হওয়া বয়ের জন্য। আর কেউ যদি ঘণ্টার পর ঘণ্টা বসেই থাকে, আল-খোয়ারিজমি তাকে ছুটি দিয়ে দেয় — বসিয়ে খাওয়ানোর মানে হয় না।

এটাই আসলে এই চ্যাপ্টারের **repository pattern** আর **connection pool**। ফাতিমা আল-ফিহরি হলো repository — সব ডেটা অ্যাক্সেস একটাই পরিষ্কার কাউন্টার (interface) দিয়ে যায়, ভেতরের SQL বা গুদামের বিন্যাস বাইরের service layer কখনো দেখে না। আর ডেলিভারি বয়দের দলটা হলো connection pool — কয়েকটা database connection বারবার শেয়ার করে reuse হয়, প্রতিবার নতুন connection খোলার খরচ বাঁচে; সবাই ব্যস্ত থাকলে নতুন query অপেক্ষা করে (`MaxOpenConns`), আর বেশিক্ষণ বসে থাকা idle connection বন্ধ হয়ে যায় (`ConnMaxIdleTime`)। বাস্তবে Go-র `database/sql` ঠিক এভাবেই pool চালায়, আর একটা ডেলিভারি বয়কে কয়েকটা কাজ একসাথে করতে বলা — আগে ইনভেন্টরি কমাও, তারপর অর্ডার লেখো, দুটোর একটা ভুল হলে পুরোটা বাতিল — সেটাই **transaction**, হয় সব হবে নয় কিছুই না।

## Database Migration

Schema পরিবর্তন অবশ্যই version-করা, পুনরুৎপাদনযোগ্য (reproducible), আর reversible হতে হবে। কখনো হাতে হাতে production schema বদলাবেন না।

```sql
-- migrations/001_create_users.up.sql
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255) UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    password    VARCHAR(255) NOT NULL,
    role        VARCHAR(20) DEFAULT 'user',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

```sql
-- migrations/001_create_users.down.sql
DROP TABLE IF EXISTS users;
```

`golang-migrate` ব্যবহার করে:

```bash
# Install
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Create migration
migrate create -ext sql -dir migrations -seq create_books

# Run migrations
migrate -path migrations -database "postgres://localhost/myapp?sslmode=disable" up

# Rollback last migration
migrate -path migrations -database "postgres://localhost/myapp?sslmode=disable" down 1
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

Migration অনেকটা একটা ভবনের version-controlled নকশার মতো। Migration 001 ভিত গাঁথে। Migration 002 দোতলা যোগ করে। Migration 003 পাইপলাইন বসায়। আপনি সবসময় ইতিহাস দেখে ঠিক জানতে পারেন কী কখন বানানো হয়েছিল। Rollback আগের কাজ নষ্ট না করে শেষ পরিবর্তনটা ভেঙে ফেলে।

</Callout>

### কোডে Migration চালানো

```go
import (
    "github.com/golang-migrate/migrate/v4"
    _ "github.com/golang-migrate/migrate/v4/database/postgres"
    _ "github.com/golang-migrate/migrate/v4/source/file"
)

func runMigrations(dbURL string) error {
    m, err := migrate.New("file://migrations", dbURL)
    if err != nil {
        return fmt.Errorf("creating migrator: %w", err)
    }

    if err := m.Up(); err != nil && err != migrate.ErrNoChange {
        return fmt.Errorf("running migrations: %w", err)
    }

    slog.Info("migrations completed")
    return nil
}
```

## Repository Pattern

Repository একটা interface-এর পেছনে database access-কে abstract করে। service layer কখনো SQL দেখে না:

```go
// internal/repository/user.go
package repository

type UserRepository struct {
    db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
    return &UserRepository{db: db}
}

func (r *UserRepository) GetByID(ctx context.Context, id int) (*model.User, error) {
    var user model.User
    err := r.db.QueryRowContext(ctx,
        `SELECT id, email, name, role, created_at, updated_at
         FROM users WHERE id = $1`, id,
    ).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt)

    if err == sql.ErrNoRows {
        return nil, service.ErrNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("query user %d: %w", id, err)
    }
    return &user, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.User, error) {
    var user model.User
    err := r.db.QueryRowContext(ctx,
        `SELECT id, email, name, password, role, created_at
         FROM users WHERE email = $1`, email,
    ).Scan(&user.ID, &user.Email, &user.Name, &user.Password, &user.Role, &user.CreatedAt)

    if err == sql.ErrNoRows {
        return nil, service.ErrNotFound
    }
    return &user, err
}

func (r *UserRepository) Create(ctx context.Context, user *model.User) error {
    return r.db.QueryRowContext(ctx,
        `INSERT INTO users (email, name, password, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        user.Email, user.Name, user.Password, user.Role, user.CreatedAt, user.UpdatedAt,
    ).Scan(&user.ID)
}

func (r *UserRepository) List(ctx context.Context, limit, offset int) ([]*model.User, error) {
    rows, err := r.db.QueryContext(ctx,
        `SELECT id, email, name, role, created_at FROM users
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        limit, offset,
    )
    if err != nil {
        return nil, fmt.Errorf("listing users: %w", err)
    }
    defer rows.Close()

    var users []*model.User
    for rows.Next() {
        var u model.User
        if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt); err != nil {
            return nil, fmt.Errorf("scanning user: %w", err)
        }
        users = append(users, &u)
    }
    return users, rows.Err()
}
```

## sqlc দিয়ে Type-Safe SQL

`sqlc` SQL query থেকে Go কোড generate করে — কোনো ORM নেই, কোনো runtime reflection নেই:

```yaml
# sqlc.yaml
version: '2'
sql:
  - engine: 'postgresql'
    queries: 'queries/'
    schema: 'migrations/'
    gen:
      go:
        package: 'db'
        out: 'internal/db'
```

```sql
-- queries/users.sql

-- name: GetUser :one
SELECT id, email, name, role, created_at FROM users WHERE id = $1;

-- name: ListUsers :many
SELECT id, email, name, role, created_at FROM users
ORDER BY created_at DESC LIMIT $1 OFFSET $2;

-- name: CreateUser :one
INSERT INTO users (email, name, password, role, created_at, updated_at)
VALUES ($1, $2, $3, $4, NOW(), NOW())
RETURNING id, email, name, role, created_at;

-- name: UpdateUser :exec
UPDATE users SET name = $2, updated_at = NOW() WHERE id = $1;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;
```

```bash
# Generate Go code
sqlc generate
```

sqlc type-safe function generate করে:

```go
// Auto-generated — internal/db/users.sql.go
func (q *Queries) GetUser(ctx context.Context, id int32) (User, error) { ... }
func (q *Queries) ListUsers(ctx context.Context, arg ListUsersParams) ([]User, error) { ... }
func (q *Queries) CreateUser(ctx context.Context, arg CreateUserParams) (User, error) { ... }
```

<Callout type="tip">

**Go database access-এর জন্য sqlc হলো industry recommendation।** এটা compile time-এই SQL error ধরে, zero-reflection কোড generate করে, আর আপনার বিদ্যমান migration-এর সাথে কাজ করে। কোনো ORM জাদু নেই — আপনি SQL লেখেন, এটা Go generate করে।

</Callout>

## Connection Pool Configuration

```go
func setupDB(dbURL string) (*sql.DB, error) {
    db, err := sql.Open("postgres", dbURL)
    if err != nil {
        return nil, err
    }

    // Pool settings — tune for your workload
    db.SetMaxOpenConns(25)                  // Max simultaneous connections
    db.SetMaxIdleConns(5)                   // Idle connections kept alive
    db.SetConnMaxLifetime(5 * time.Minute)  // Recycle connections
    db.SetConnMaxIdleTime(1 * time.Minute)  // Close idle connections

    // Verify connectivity
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    if err := db.PingContext(ctx); err != nil {
        return nil, fmt.Errorf("pinging database: %w", err)
    }

    return db, nil
}
```

**Tuning গাইড:**

- `MaxOpenConns`: 25 দিয়ে শুরু করুন। `db.Stats()` মনিটর করুন — যদি `WaitCount` বেশি হয়, বাড়ান
- `MaxIdleConns`: 5-10 সাধারণ। বেশি হলে resource নষ্ট, কম হলে reconnection overhead
- `ConnMaxLifetime`: database failover-এর পর 5 মিনিট stale connection ঠেকায়

## Helper দিয়ে Transaction

```go
// Generic transaction helper — eliminates boilerplate
func WithTx(ctx context.Context, db *sql.DB, fn func(tx *sql.Tx) error) error {
    tx, err := db.BeginTx(ctx, nil)
    if err != nil {
        return fmt.Errorf("beginning transaction: %w", err)
    }

    if err := fn(tx); err != nil {
        if rbErr := tx.Rollback(); rbErr != nil {
            return fmt.Errorf("rollback failed: %v (original error: %w)", rbErr, err)
        }
        return err
    }

    return tx.Commit()
}

// Usage
func (s *OrderService) PlaceOrder(ctx context.Context, order Order) error {
    return WithTx(ctx, s.db, func(tx *sql.Tx) error {
        // Deduct inventory
        _, err := tx.ExecContext(ctx,
            `UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
            order.Quantity, order.ProductID,
        )
        if err != nil {
            return fmt.Errorf("deducting inventory: %w", err)
        }

        // Create order
        _, err = tx.ExecContext(ctx,
            `INSERT INTO orders (user_id, product_id, quantity, total) VALUES ($1, $2, $3, $4)`,
            order.UserID, order.ProductID, order.Quantity, order.Total,
        )
        if err != nil {
            return fmt.Errorf("creating order: %w", err)
        }

        return nil
    })
}
```

## NULL Value সামলানো

```go
// Option 1: sql.NullXxx types
var bio sql.NullString
err := db.QueryRow("SELECT bio FROM users WHERE id = $1", id).Scan(&bio)
if bio.Valid {
    fmt.Println(bio.String)
}

// Option 2: Pointer fields (cleaner for JSON)
type User struct {
    ID   int     `json:"id"`
    Name string  `json:"name"`
    Bio  *string `json:"bio"`  // nil = NULL
}

var bio *string
err := db.QueryRow("SELECT bio FROM users WHERE id = $1", id).Scan(&bio)
```

## Bulk Operation

```go
func (r *UserRepository) BulkCreate(ctx context.Context, users []*model.User) error {
    // Build batch insert
    var sb strings.Builder
    sb.WriteString("INSERT INTO users (email, name, role) VALUES ")

    args := make([]any, 0, len(users)*3)
    for i, u := range users {
        if i > 0 {
            sb.WriteByte(',')
        }
        sb.WriteString(fmt.Sprintf("($%d, $%d, $%d)", i*3+1, i*3+2, i*3+3))
        args = append(args, u.Email, u.Name, u.Role)
    }

    _, err := r.db.ExecContext(ctx, sb.String(), args...)
    return err
}
```

## মূল শিক্ষা

1. **আপনার schema version করুন** — migration tool ব্যবহার করুন, কখনো হাতে হাতে production schema বদলাবেন না
2. **Repository pattern** SQL-কে business logic থেকে আলাদা করে — service interface-এর উপর নির্ভর করে
3. **type-safe, compile-time-checked SQL-এর জন্য sqlc ব্যবহার করুন** — কোনো ORM overhead নেই
4. **connection pool কনফিগার করুন** — `MaxOpenConns=25`, `MaxIdleConns=5`, `ConnMaxLifetime=5m`
5. **`WithTx` helper** transaction boilerplate দূর করে — success-এ commit, error-এ rollback
6. **`sql.NullString`-এর বদলে `*string` ব্যবহার করুন** — পরিচ্ছন্ন API, JSON-এর সাথে স্বাভাবিকভাবে কাজ করে
