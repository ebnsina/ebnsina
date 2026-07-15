---
title: 'Data নিয়ে কাজ করা'
subtitle: 'JSON, HTTP client, database, আর file I/O — প্রতিটা Go backend service-এর নিত্যদিনের হাতিয়ার।'
chapter: 12
level: 'intermediate'
readingTime: '22 মিনিট'
topics: ['JSON', 'HTTP', 'database', 'SQL', 'file I/O', 'REST API']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একজন প্লাম্বারের টুলকিট — JSON হলো পাইপ, HTTP client হলো ফিটিং, SQL হলো রেঞ্চ। প্রতিটা টুল একটা করে কাজ ভালোভাবে করে; এই অধ্যায় আপনাকে শেখায় কীভাবে এগুলো একসাথে ব্যবহার করবেন কোনো লিক ছাড়াই।

</Callout>

## গল্পে বুঝি

পাসপোর্ট অফিসের বাইরে একটা ছোট কাউন্টারে ফাতেমা বসে ফর্ম পূরণ করে দেয়। এক লোক এসে হাতে লেখা নিজের একটা কাগজ দিল — নাম, বাবার নাম, ঠিকানা, জন্মতারিখ সব নিজের মতো করে সাজানো। এই কাগজ দিয়ে তো অফিসে জমা দেওয়া যাবে না; অফিস শুধু ওদের নির্দিষ্ট ছাপানো ফর্মটাই নেয়, যেখানে প্রতিটা ঘরের নাম আর ক্রম বাঁধা। তাই ফাতেমা লোকটার কাগজের প্রতিটা তথ্য তুলে অফিসের সেই স্ট্যান্ডার্ড ফর্মের ঠিক ঠিক ঘরে বসিয়ে দেয় — এই ঘরে নাম, ওই ঘরে জন্মতারিখ। এবার ফর্মটা খামে ভরে অফিসে পাঠানো যায়।

কিছুক্ষণ পর অফিস থেকে একটা জবাবি খাম এল — ভেতরে আবার সেই একই ছাপানো ফরম্যাটে অফিসের সিদ্ধান্ত লেখা। ফাতেমা খাম খুলে ফর্মটার ঘরে ঘরে চোখ বুলিয়ে তথ্যগুলো নিজের একটা সাদা ওয়ার্কশিটে টুকে নেয়, যাতে লোকটাকে সহজ ভাষায় বুঝিয়ে দিতে পারে। দুই পক্ষই ওই একই ছাপানো ফরম্যাট মানে বলেই ফাতেমা মাঝখানে বসে দোভাষীর কাজটা করতে পারছে।

গল্পটাই আসলে JSON নিয়ে কাজ করা। লোকটার হাতে লেখা কাগজ, মানে নিজের মতো সাজানো ওয়ার্কশিট, হলো Go-এর **struct**; আর দুই পক্ষের মানা সেই ছাপানো স্ট্যান্ডার্ড ফর্ম হলো **JSON**। struct থেকে তথ্য তুলে স্ট্যান্ডার্ড ফর্মে বসিয়ে বাইরে পাঠানোর কাজটাই **marshal** (encode), আর বাইরে থেকে আসা ফর্ম খুলে আবার নিজের struct-এ টুকে নেওয়াটাই **unmarshal** (decode)। বাস্তবে HTTP API-তে ঠিক এটাই ঘটে — আপনি request পাঠানোর সময় struct-কে marshal করে JSON body বানান, আর response-এর JSON body-কে unmarshal করে আবার struct-এ ফেরত আনেন। দুই সার্ভিস আলাদা ভাষায় লেখা হলেও, JSON নামের ওই সাধারণ ফরম্যাট মানে বলেই একে অন্যের সাথে কথা বলতে পারে।

## JSON: সর্বজনীন Data Format

প্রতিটা Go backend-কে JSON নিয়ে কাজ করতে হয়। Go-এর `encoding/json` package serialization নিয়ন্ত্রণ করতে struct tag ব্যবহার করে।

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

### Streaming JSON (বড় Data)

বড় payload-এর জন্য `Marshal`/`Unmarshal`-এর বদলে `json.Encoder`/`json.Decoder` ব্যবহার করুন:

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

**HTTP request body-র জন্য `json.Decoder` ব্যবহার করুন**, `json.Unmarshal` নয়। decoder পুরো body-কে memory-তে buffer না করে সরাসরি stream থেকে read করে। এটা `DisallowUnknownFields()`-ও সাপোর্ট করে যা field name-এ typo ধরে ফেলে।

</Callout>

## HTTP Server বানানো

Go-এর `net/http` package বাক্সের বাইরে থেকেই production-ready। কোনো framework লাগে না।

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

**বাস্তব জীবনের উপমা**

Go-এর `net/http` অনেকটা এমন একটা সুইস আর্মি নাইফের মতো যেটা আবার একটা শেফের ছুরিও। বেশিরভাগ ভাষায় web server বানাতে একটা framework লাগে (Express, Flask, Spring)। Go-এর standard library এতটাই ভালো যে Cloudflare-এর মতো কোম্পানি সরাসরি এতে production service চালায়। Gin বা Echo-র মতো framework সুবিধা যোগ করে, কিন্তু বাধ্যতামূলক নয়।

</Callout>

## HTTP Middleware

Middleware cross-cutting concern যোগ করতে handler-কে মুড়ে দেয়:

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

## HTTP Request পাঠানো

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

**production-এ কখনো `http.DefaultClient` ব্যবহার করবেন না।** এতে কোনো timeout নেই — একটা ধীর server আপনার goroutine-কে চিরকালের জন্য ঝুলিয়ে রাখবে। সবসময় একটা explicit timeout দিয়ে client তৈরি করুন।

</Callout>

## `database/sql` দিয়ে Database Access

Go-এর `database/sql` হলো SQL database-এর উপর একটা পাতলা, শক্তিশালী abstraction:

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

### CRUD Operation

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

**query result iterate করার সময় সবসময় `rows.Close()` কল করুন আর `rows.Err()` চেক করুন।** `Close()` ভুলে গেলে database connection leak হয়। `Err()` ভুলে গেলে iteration-এর সময় ঘটা error নীরবে হারিয়ে যায়।

</Callout>

### Transaction

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

## মূল শিক্ষা

1. **JSON field name নিয়ন্ত্রণ করতে struct tag ব্যবহার করুন** — `json:"field_name,omitempty"`
2. **HTTP body-র জন্য `json.Decoder`** ব্যবহার করুন, in-memory data-র জন্য `json.Marshal`
3. **Go 1.22+-এ built-in routing আছে** — `mux.HandleFunc("GET /users/{id}", handler)`
4. **সবসময় HTTP client-এ timeout সেট করুন** — `&http.Client{Timeout: 10 * time.Second}`
5. **`database/sql` connection pool ম্যানেজ করে** — `MaxOpenConns` আর `MaxIdleConns` কনফিগার করুন
6. **iteration-এর পর `rows.Err()` চেক করুন** — নীরব error-ই সবচেয়ে খারাপ ধরনের
7. **transaction-এর জন্য `defer tx.Rollback()` ব্যবহার করুন** — `Commit()`-এর পর এটা no-op
