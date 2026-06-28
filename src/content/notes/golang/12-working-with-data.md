---
title: 'Working with Data'
subtitle: 'JSON, HTTP clients, databases, and file I/O — the bread and butter of every Go backend service.'
chapter: 12
level: 'intermediate'
readingTime: '22 min'
topics: ['JSON', 'HTTP', 'database', 'SQL', 'file I/O', 'REST API']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A plumber's toolkit — JSON is the pipe, HTTP clients are the fittings, SQL is the wrench. Each tool does one job well; this chapter teaches you to use them together without leaks.

</Callout>

## JSON: The Universal Data Format

Every Go backend deals with JSON. Go's `encoding/json` package uses struct tags to control serialization.

```go
type User struct {
    ID        int       `json:"id"`
    Email     string    `json:"email"`
    FirstName string    `json:"first_name"`
    LastName  string    `json:"last_name"`
    Password  string    `json:"-"`                    // Never serialize
    Bio       string    `json:"bio,omitempty"`         // Skip if empty
    CreatedAt time.Time `json:"created_at"`
}

// Struct → JSON (Marshal)
user := User{
    ID:        1,
    Email:     "fatima@example.com",
    FirstName: "Fatima",
    LastName:  "al-Khwarizmi",
    Password:  "secret123",
    CreatedAt: time.Now(),
}

data, err := json.Marshal(user)
// {"id":1,"email":"fatima@example.com","first_name":"Fatima","last_name":"al-Khwarizmi","created_at":"2024-01-15T10:30:00Z"}
// Note: Password excluded, Bio excluded (empty + omitempty)

// JSON → Struct (Unmarshal)
jsonStr := `{"id": 1, "email": "fatima@example.com", "first_name": "Fatima"}`
var parsed User
err := json.Unmarshal([]byte(jsonStr), &parsed)
```

### Streaming JSON (Large Data)

For large payloads, use `json.Encoder`/`json.Decoder` instead of `Marshal`/`Unmarshal`:

```go
// Encode directly to a writer (HTTP response, file)
func writeJSON(w http.ResponseWriter, data any) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(data)
}

// Decode directly from a reader (HTTP request, file)
func readJSON(r io.Reader, dst any) error {
    decoder := json.NewDecoder(r)
    decoder.DisallowUnknownFields()  // Reject unexpected fields
    return decoder.Decode(dst)
}
```

<Callout type="tip">

**Use `json.Decoder` for HTTP request bodies**, not `json.Unmarshal`. The decoder reads from the stream directly without buffering the entire body in memory. It also supports `DisallowUnknownFields()` which catches typos in field names.

</Callout>

## Building HTTP Servers

Go's `net/http` package is production-ready out of the box. No framework needed.

```go
package main

import (
    "encoding/json"
    "log"
    "net/http"
)

type User struct {
    ID    int    `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}

var users = []User{
    {ID: 1, Name: "Fatima", Email: "fatima@example.com"},
    {ID: 2, Name: "Omar", Email: "omar@example.com"},
}

func main() {
    mux := http.NewServeMux()

    // Go 1.22+ pattern matching
    mux.HandleFunc("GET /users", handleListUsers)
    mux.HandleFunc("GET /users/{id}", handleGetUser)
    mux.HandleFunc("POST /users", handleCreateUser)

    log.Println("Server starting on :8080")
    log.Fatal(http.ListenAndServe(":8080", mux))
}

func handleListUsers(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(users)
}

func handleGetUser(w http.ResponseWriter, r *http.Request) {
    idStr := r.PathValue("id")  // Go 1.22+ path parameter
    id, err := strconv.Atoi(idStr)
    if err != nil {
        http.Error(w, "invalid user ID", http.StatusBadRequest)
        return
    }

    for _, u := range users {
        if u.ID == id {
            w.Header().Set("Content-Type", "application/json")
            json.NewEncoder(w).Encode(u)
            return
        }
    }

    http.Error(w, "user not found", http.StatusNotFound)
}

func handleCreateUser(w http.ResponseWriter, r *http.Request) {
    var input struct {
        Name  string `json:"name"`
        Email string `json:"email"`
    }

    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        http.Error(w, "invalid JSON", http.StatusBadRequest)
        return
    }

    user := User{
        ID:    len(users) + 1,
        Name:  input.Name,
        Email: input.Email,
    }
    users = append(users, user)

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(user)
}
```

<Callout type="info">

**Real-World Analogy**

Go's `net/http` is like a Swiss Army knife that happens to also be a chef's knife. Most languages need a framework (Express, Flask, Spring) to build web servers. Go's standard library is so good that companies like Cloudflare run production services on it directly. Frameworks like Gin or Echo add convenience, but they're not required.

</Callout>

## HTTP Middleware

Middleware wraps handlers to add cross-cutting concerns:

```go
// Logging middleware
func loggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
    })
}

// Auth middleware
func authMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := r.Header.Get("Authorization")
        if token == "" {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }

        userID, err := validateToken(token)
        if err != nil {
            http.Error(w, "invalid token", http.StatusUnauthorized)
            return
        }

        // Add user ID to request context
        ctx := context.WithValue(r.Context(), "userID", userID)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// Chain middleware
func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("GET /users", handleListUsers)

    // Apply middleware (innermost runs first)
    handler := loggingMiddleware(authMiddleware(mux))
    http.ListenAndServe(":8080", handler)
}
```

## Making HTTP Requests

```go
// Simple GET
resp, err := http.Get("https://api.example.com/users")
if err != nil {
    log.Fatal(err)
}
defer resp.Body.Close()

var users []User
json.NewDecoder(resp.Body).Decode(&users)

// POST with JSON body
func createUser(apiURL string, user User) (*User, error) {
    body, err := json.Marshal(user)
    if err != nil {
        return nil, fmt.Errorf("marshaling user: %w", err)
    }

    resp, err := http.Post(apiURL+"/users", "application/json", bytes.NewReader(body))
    if err != nil {
        return nil, fmt.Errorf("POST request failed: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusCreated {
        body, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, body)
    }

    var created User
    json.NewDecoder(resp.Body).Decode(&created)
    return &created, nil
}

// Production-grade HTTP client with timeout
client := &http.Client{
    Timeout: 10 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
    },
}

req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
req.Header.Set("Authorization", "Bearer "+token)
resp, err := client.Do(req)
```

<Callout type="warning">

**Never use `http.DefaultClient` in production.** It has no timeout — a slow server will hang your goroutine forever. Always create a client with an explicit timeout.

</Callout>

## Database Access with `database/sql`

Go's `database/sql` is a thin, powerful abstraction over SQL databases:

```go
import (
    "database/sql"
    _ "github.com/lib/pq"  // PostgreSQL driver (blank import registers it)
)

func main() {
    db, err := sql.Open("postgres", "postgres://user:pass@localhost/myapp?sslmode=disable")
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    // Configure connection pool
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    db.SetConnMaxLifetime(5 * time.Minute)

    // Verify connection
    if err := db.Ping(); err != nil {
        log.Fatal(err)
    }
}
```

### CRUD Operations

```go
// CREATE
func createUser(db *sql.DB, user *User) error {
    return db.QueryRow(
        `INSERT INTO users (email, name, created_at) VALUES ($1, $2, $3) RETURNING id`,
        user.Email, user.Name, time.Now(),
    ).Scan(&user.ID)
}

// READ (single row)
func getUserByID(db *sql.DB, id int) (*User, error) {
    var user User
    err := db.QueryRow(
        `SELECT id, email, name, created_at FROM users WHERE id = $1`, id,
    ).Scan(&user.ID, &user.Email, &user.Name, &user.CreatedAt)

    if err == sql.ErrNoRows {
        return nil, ErrNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("querying user %d: %w", id, err)
    }
    return &user, nil
}

// READ (multiple rows)
func listUsers(db *sql.DB, limit, offset int) ([]*User, error) {
    rows, err := db.Query(
        `SELECT id, email, name, created_at FROM users ORDER BY id LIMIT $1 OFFSET $2`,
        limit, offset,
    )
    if err != nil {
        return nil, fmt.Errorf("listing users: %w", err)
    }
    defer rows.Close()

    var users []*User
    for rows.Next() {
        var u User
        if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt); err != nil {
            return nil, fmt.Errorf("scanning user: %w", err)
        }
        users = append(users, &u)
    }
    return users, rows.Err()  // Check for iteration errors
}

// UPDATE
func updateUser(db *sql.DB, id int, name string) error {
    result, err := db.Exec(`UPDATE users SET name = $1 WHERE id = $2`, name, id)
    if err != nil {
        return fmt.Errorf("updating user %d: %w", id, err)
    }
    rows, _ := result.RowsAffected()
    if rows == 0 {
        return ErrNotFound
    }
    return nil
}

// DELETE
func deleteUser(db *sql.DB, id int) error {
    result, err := db.Exec(`DELETE FROM users WHERE id = $1`, id)
    if err != nil {
        return fmt.Errorf("deleting user %d: %w", id, err)
    }
    rows, _ := result.RowsAffected()
    if rows == 0 {
        return ErrNotFound
    }
    return nil
}
```

<Callout type="tip">

**Always call `rows.Close()` and check `rows.Err()`** when iterating query results. Forgetting `Close()` leaks database connections. Forgetting `Err()` silently drops errors that happen during iteration.

</Callout>

### Transactions

```go
func transferFunds(db *sql.DB, fromID, toID int, amount float64) error {
    tx, err := db.Begin()
    if err != nil {
        return fmt.Errorf("starting transaction: %w", err)
    }
    // Rollback if anything fails (no-op if already committed)
    defer tx.Rollback()

    // Debit
    var balance float64
    err = tx.QueryRow(`SELECT balance FROM accounts WHERE id = $1 FOR UPDATE`, fromID).Scan(&balance)
    if err != nil {
        return fmt.Errorf("checking balance: %w", err)
    }
    if balance < amount {
        return fmt.Errorf("insufficient funds: have %.2f, need %.2f", balance, amount)
    }

    _, err = tx.Exec(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, amount, fromID)
    if err != nil {
        return fmt.Errorf("debiting: %w", err)
    }

    // Credit
    _, err = tx.Exec(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, amount, toID)
    if err != nil {
        return fmt.Errorf("crediting: %w", err)
    }

    return tx.Commit()
}
```

## File I/O

```go
// Read entire file
data, err := os.ReadFile("config.json")
if err != nil {
    log.Fatal(err)
}

// Write entire file
err := os.WriteFile("output.txt", []byte("hello world"), 0644)

// Read file line by line (memory efficient for large files)
file, err := os.Open("large-file.csv")
if err != nil {
    log.Fatal(err)
}
defer file.Close()

scanner := bufio.NewScanner(file)
for scanner.Scan() {
    line := scanner.Text()
    // process line
}
if err := scanner.Err(); err != nil {
    log.Fatal(err)
}
```

## Key Takeaways

1. **Use struct tags** to control JSON field names — `json:"field_name,omitempty"`
2. **Use `json.Decoder`** for HTTP bodies, `json.Marshal` for in-memory data
3. **Go 1.22+ has built-in routing** — `mux.HandleFunc("GET /users/{id}", handler)`
4. **Always set HTTP client timeouts** — `&http.Client{Timeout: 10 * time.Second}`
5. **`database/sql` manages connection pools** — configure `MaxOpenConns` and `MaxIdleConns`
6. **Check `rows.Err()` after iteration** — silent errors are the worst kind
7. **Use `defer tx.Rollback()`** for transactions — it's a no-op after `Commit()`
