---
title: 'Database Patterns'
subtitle: 'Migrations, repository pattern, connection pooling, and query builders — the database layer that scales.'
chapter: 15
level: 'intermediate'
readingTime: '22 min'
topics:
  ['database', 'migrations', 'repository pattern', 'sqlc', 'transactions', 'connection pooling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Database Migrations

Schema changes must be versioned, reproducible, and reversible. Never modify production schemas by hand.

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

Using `golang-migrate`:

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

**Real-World Analogy**

Migrations are like version-controlled blueprints for a building. Migration 001 lays the foundation. Migration 002 adds the second floor. Migration 003 installs plumbing. You can always look at the history and know exactly what was built and when. Rolling back tears down the last change without destroying earlier work.

</Callout>

### Running Migrations in Code

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

## The Repository Pattern

Repositories abstract database access behind an interface. The service layer never sees SQL:

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

## Type-Safe SQL with sqlc

`sqlc` generates Go code from SQL queries — no ORM, no runtime reflection:

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

sqlc generates type-safe functions:

```go
// Auto-generated — internal/db/users.sql.go
func (q *Queries) GetUser(ctx context.Context, id int32) (User, error) { ... }
func (q *Queries) ListUsers(ctx context.Context, arg ListUsersParams) ([]User, error) { ... }
func (q *Queries) CreateUser(ctx context.Context, arg CreateUserParams) (User, error) { ... }
```

<Callout type="tip">

**sqlc is the industry recommendation** for Go database access. It catches SQL errors at compile time, generates zero-reflection code, and works with your existing migrations. No ORM magic — you write SQL, it generates Go.

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

**Tuning guide:**

- `MaxOpenConns`: Start with 25. Monitor `db.Stats()` — if `WaitCount` is high, increase
- `MaxIdleConns`: 5-10 is typical. Too many wastes resources, too few causes reconnection overhead
- `ConnMaxLifetime`: 5 minutes prevents stale connections after database failover

## Transactions with Helper

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

## Handling NULL Values

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

## Bulk Operations

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

## Key Takeaways

1. **Version your schema** — use migration tools, never modify production schemas by hand
2. **Repository pattern** separates SQL from business logic — services depend on interfaces
3. **Use sqlc** for type-safe, compile-time-checked SQL — no ORM overhead
4. **Configure connection pools** — `MaxOpenConns=25`, `MaxIdleConns=5`, `ConnMaxLifetime=5m`
5. **`WithTx` helper** eliminates transaction boilerplate — commit on success, rollback on error
6. **Use `*string` over `sql.NullString`** — cleaner API, works naturally with JSON
