---
title: "Advanced Concurrency Patterns"
subtitle: "Context, sync primitives, worker pools, and the patterns that power Go at scale — from Uber to Cloudflare."
chapter: 11
level: "intermediate"
readingTime: "22 min"
topics: ["context", "sync", "mutex", "semaphore", "pipeline", "errgroup"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Context: The Cancellation Backbone

`context.Context` is Go's mechanism for managing request lifecycles — timeouts, cancellation, and request-scoped values. Every production Go function that does I/O should accept a context as its first argument.

```go
// Context hierarchy: parent cancellation cascades to children
func handleRequest(w http.ResponseWriter, r *http.Request) {
    // r.Context() is cancelled when the client disconnects
    ctx := r.Context()

    // Add a timeout (whichever happens first: client disconnect or 5s)
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()  // Always call cancel to release resources

    user, err := fetchUser(ctx, userID)
    if err != nil {
        // Could be: context.DeadlineExceeded (timeout)
        //           context.Canceled (client disconnected)
        //           or an actual error
        handleError(w, err)
        return
    }
    json.NewEncoder(w).Encode(user)
}

func fetchUser(ctx context.Context, id int) (*User, error) {
    // Pass context to database query — if cancelled, query stops
    row := db.QueryRowContext(ctx,
        "SELECT id, email, name FROM users WHERE id = $1", id,
    )

    var user User
    if err := row.Scan(&user.ID, &user.Email, &user.Name); err != nil {
        return nil, err
    }
    return &user, nil
}
```

<Callout type="info">

**Real-World Analogy**

Context is like a walkie-talkie for a construction crew. The foreman (parent context) can tell everyone to stop (cancel). If the foreman's boss (parent's parent) cancels the entire project, the foreman's cancel cascades to all workers too. Each worker checks their walkie-talkie before starting expensive work.

</Callout>

### Context Best Practices

```go
// 1. Always pass context as the first parameter
func GetUser(ctx context.Context, id int) (*User, error)  // Good
func GetUser(id int, ctx context.Context) (*User, error)  // Bad

// 2. Never store context in a struct
type Service struct {
    ctx context.Context  // BAD — context is request-scoped, not service-scoped
    db  *sql.DB
}

// 3. Use context.WithValue sparingly (only for request-scoped data)
type contextKey string
const userIDKey contextKey = "userID"

ctx = context.WithValue(ctx, userIDKey, 42)
userID := ctx.Value(userIDKey).(int)

// 4. Check for cancellation in long loops
for _, item := range largeDataset {
    select {
    case <-ctx.Done():
        return ctx.Err()  // Bail out early
    default:
    }
    process(item)
}
```

## sync.Mutex: Protecting Shared State

When goroutines must share state (not communicable through channels), use a mutex:

```go
type SafeCache struct {
    mu    sync.RWMutex
    items map[string]string
}

func NewSafeCache() *SafeCache {
    return &SafeCache{
        items: make(map[string]string),
    }
}

// Multiple readers can hold RLock simultaneously
func (c *SafeCache) Get(key string) (string, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    val, ok := c.items[key]
    return val, ok
}

// Only one writer at a time (blocks all readers too)
func (c *SafeCache) Set(key, value string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.items[key] = value
}

func (c *SafeCache) Delete(key string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    delete(c.items, key)
}
```

<Callout type="tip">

**Use `sync.RWMutex` when reads vastly outnumber writes** (like a cache). Multiple goroutines can read simultaneously with `RLock()`, but writing with `Lock()` is exclusive. For write-heavy workloads, a regular `sync.Mutex` has less overhead.

</Callout>

## sync.Once: One-Time Initialization

```go
type DBConnection struct {
    once sync.Once
    db   *sql.DB
}

func (c *DBConnection) Get() *sql.DB {
    c.once.Do(func() {
        // This runs exactly once, even if 1000 goroutines call Get()
        db, err := sql.Open("postgres", connectionString)
        if err != nil {
            log.Fatal(err)
        }
        c.db = db
    })
    return c.db
}
```

## errgroup: Goroutines with Error Handling

`golang.org/x/sync/errgroup` is the standard way to run goroutines that return errors:

```go
import "golang.org/x/sync/errgroup"

func fetchAllData(ctx context.Context) (*Dashboard, error) {
    g, ctx := errgroup.WithContext(ctx)

    var users []*User
    var orders []*Order
    var metrics *Metrics

    // All three run concurrently
    g.Go(func() error {
        var err error
        users, err = fetchUsers(ctx)
        return err
    })

    g.Go(func() error {
        var err error
        orders, err = fetchOrders(ctx)
        return err
    })

    g.Go(func() error {
        var err error
        metrics, err = fetchMetrics(ctx)
        return err
    })

    // Wait for all goroutines. Returns first error (cancels others via ctx)
    if err := g.Wait(); err != nil {
        return nil, fmt.Errorf("fetching dashboard data: %w", err)
    }

    return &Dashboard{Users: users, Orders: orders, Metrics: metrics}, nil
}
```

<Callout type="info">

**Real-World Analogy**

`errgroup` is like sending three employees to get different supplies. If any one of them reports a problem ("the store is closed"), you cancel the others and deal with the error. If all three succeed, you have everything you need.

</Callout>

### errgroup with Concurrency Limit

```go
func processImages(ctx context.Context, images []Image) error {
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(10)  // Max 10 concurrent goroutines

    for _, img := range images {
        g.Go(func() error {
            return resizeAndUpload(ctx, img)
        })
    }

    return g.Wait()
}
```

## Semaphore Pattern

Control the maximum number of concurrent operations:

```go
type Semaphore struct {
    ch chan struct{}
}

func NewSemaphore(max int) *Semaphore {
    return &Semaphore{ch: make(chan struct{}, max)}
}

func (s *Semaphore) Acquire() {
    s.ch <- struct{}{}  // Blocks if buffer is full
}

func (s *Semaphore) Release() {
    <-s.ch
}

// Usage: limit concurrent API calls
sem := NewSemaphore(5)  // Max 5 concurrent

for _, url := range urls {
    sem.Acquire()
    go func() {
        defer sem.Release()
        fetch(url)
    }()
}
```

## Pipeline Pattern

Chain stages where each stage is a goroutine processing a stream:

```go
// Stage 1: Generate numbers
func generate(ctx context.Context, nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for _, n := range nums {
            select {
            case out <- n:
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}

// Stage 2: Square each number
func square(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            select {
            case out <- n * n:
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}

// Stage 3: Filter even numbers
func filterEven(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            if n%2 == 0 {
                select {
                case out <- n:
                case <-ctx.Done():
                    return
                }
            }
        }
    }()
    return out
}

// Compose the pipeline
func main() {
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // generate → square → filterEven
    pipeline := filterEven(ctx, square(ctx, generate(ctx, 1, 2, 3, 4, 5)))

    for result := range pipeline {
        fmt.Println(result)  // 4, 16 (squares of 2 and 4)
    }
}
```

<Callout type="info">

**Real-World Analogy**

A pipeline is like an assembly line in a factory. Station 1 cuts the metal, Station 2 bends it, Station 3 paints it. Each station works on a different piece at the same time. If the factory shuts down (context cancelled), every station stops.

</Callout>

## Real-World: Rate-Limited API Client

```go
type APIClient struct {
    client  *http.Client
    limiter *rate.Limiter  // golang.org/x/time/rate
}

func NewAPIClient(rps int) *APIClient {
    return &APIClient{
        client:  &http.Client{Timeout: 10 * time.Second},
        limiter: rate.NewLimiter(rate.Limit(rps), rps),  // rps requests per second, burst of rps
    }
}

func (c *APIClient) Fetch(ctx context.Context, url string) (*http.Response, error) {
    // Wait for rate limiter (respects context cancellation)
    if err := c.limiter.Wait(ctx); err != nil {
        return nil, fmt.Errorf("rate limiter: %w", err)
    }

    req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
    if err != nil {
        return nil, err
    }

    return c.client.Do(req)
}

// Fetch 1000 URLs at 50 requests/second with 10 concurrent workers
func fetchAll(ctx context.Context, urls []string) []Result {
    client := NewAPIClient(50)
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(10)

    results := make(chan Result, len(urls))

    for _, url := range urls {
        g.Go(func() error {
            resp, err := client.Fetch(ctx, url)
            if err != nil {
                results <- Result{URL: url, Err: err}
                return nil  // Don't cancel other requests
            }
            defer resp.Body.Close()
            body, _ := io.ReadAll(resp.Body)
            results <- Result{URL: url, Body: body, Status: resp.StatusCode}
            return nil
        })
    }

    go func() {
        g.Wait()
        close(results)
    }()

    var out []Result
    for r := range results {
        out = append(out, r)
    }
    return out
}
```

## Key Takeaways

1. **Context is mandatory for I/O** — always pass `context.Context` as the first parameter
2. **`defer cancel()`** — always call cancel on contexts you create to prevent resource leaks
3. **`sync.RWMutex`** for read-heavy shared state, `sync.Mutex` for write-heavy
4. **`errgroup`** is the production standard for concurrent operations with error handling
5. **Pipelines** compose stages as goroutine-driven channels — each stage runs concurrently
6. **Rate limiting + concurrency limiting** are separate concerns — use both in production API clients
7. **Check `ctx.Done()`** in long-running loops to support cancellation

