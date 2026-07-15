---
title: 'Advanced Concurrency Pattern'
subtitle: 'Context, sync primitive, worker pool, আর যেসব pattern স্কেলে Go চালায় — Uber থেকে Cloudflare পর্যন্ত।'
chapter: 11
level: 'intermediate'
readingTime: '22 মিনিট'
topics: ['context', 'sync', 'mutex', 'semaphore', 'pipeline', 'errgroup']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ধরুন করিমের একটা বড় ক্যাটারিং অপারেশন — একসাথে হাজার লোকের বিয়ের অর্ডার সামলাতে হয়। রান্নাঘরে একটা বড় অর্ডার-বোর্ড টাঙানো, তাতে একের পর এক কাজের চিরকুট আটকানো থাকে। করিম যত খুশি বাবুর্চি রাখে না — গোনা দশজন বাবুর্চি, প্রত্যেকে বোর্ড থেকে একটা করে চিরকুট নেয়, রান্না শেষ করে আবার পরেরটা তোলে। বোর্ডে কাজ থাকলে কেউ বসে থাকে না, আবার একসাথে দশজনের বেশি চুলাও জ্বলে না। বিশাল একটা অর্ডার এলে ম্যানেজার রহিম সেটাকে ভাগ করে কয়েকটা টিমকে বিলিয়ে দেয়, আর প্রত্যেক টিম শেষ করলে সব রান্না এক জায়গায় এনে একটা থালায় সাজায়।

রান্নাঘরের সুপারভাইজার ফাতেমা দাঁড়িয়ে থাকে কয়েকটা কাউন্টারের মাঝখানে — একদিকে ভাতের হাঁড়ি, একদিকে মাংসের কড়াই, একদিকে ডেজার্টের টেবিল। যেটা আগে "রেডি" বলে হাঁক দেয়, ফাতেমা সাথে সাথে সেটাই তুলে পরিবেশনে পাঠায়; সব একসাথে হওয়ার জন্য অপেক্ষা করে না। আবার রান্নাঘরে একটাই বিশাল বিরিয়ানির ডেগ, একসাথে দুজন নাড়লে সব লেগে যাবে — তাই একটা কাঠের হাতা আছে, যার হাতে হাতা সে-ই কেবল নাড়তে পারে, বাকিরা হাতা হাতবদল না হওয়া পর্যন্ত অপেক্ষা করে।

এই পুরোটাই আসলে advanced concurrency। বোর্ড থেকে চিরকুট তোলা গোনা দশজন বাবুর্চি হলো **worker pool** — নির্দিষ্ট সংখ্যক goroutine একটা shared queue থেকে কাজ তোলে (chapter-এ `errgroup`-এর `SetLimit` আর semaphore এই কাজটাই করে)। রহিমের বড় অর্ডার ভাগ করে টিমে বিলিয়ে দিয়ে শেষে এক থালায় সাজানো হলো **fan-out/fan-in** — এক কাজ অনেক goroutine-এ ছড়িয়ে, ফল আবার এক channel-এ জড়ো করা (`fetchAllData`-র errgroup ঠিক এটাই)। ফাতেমার "যেটা আগে রেডি সেটাই তুলি" হলো **select** — একাধিক channel-এর মধ্যে যেটা আগে সাড়া দেয় সেটাই process করা। আর একটামাত্র হাতা দিয়ে ডেগ নাড়া হলো **mutex** — shared state একসাথে একজনই ছুঁতে পারে (`sync.Mutex`/`RWMutex`)। বাস্তবে Uber, Cloudflare-এর মতো সিস্টেম হাজারো request ঠিক এভাবেই সামলায় — গোনা worker, ছড়িয়ে-জড়ো করা কাজ, আর shared state-এ একটামাত্র লক।

## Context: Cancellation-এর মেরুদণ্ড

`context.Context` হলো request lifecycle ম্যানেজ করার Go-এর কৌশল — timeout, cancellation, আর request-scoped value। যেকোনো production Go function যা I/O করে, সেটার প্রথম argument হিসেবে একটা context নেওয়া উচিত।

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

**বাস্তব জীবনের উপমা**

Context অনেকটা একটা কনস্ট্রাকশন দলের walkie-talkie-র মতো। ফোরম্যান (parent context) সবাইকে থামতে বলতে পারে (cancel)। যদি ফোরম্যানের বস (parent-এর parent) পুরো প্রজেক্ট cancel করে, ফোরম্যানের cancel-ও সব worker-এ ছড়িয়ে পড়ে। প্রতিটা worker দামি কাজ শুরু করার আগে তার walkie-talkie চেক করে।

</Callout>

### Context-এর Best Practice

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

## sync.Mutex: Shared State রক্ষা করা

যখন goroutine-দের state শেয়ার করতেই হয় (channel দিয়ে যা communicate করা যায় না), তখন mutex ব্যবহার করুন:

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

**যখন read লেখার (write) চেয়ে বহুগুণ বেশি হয় তখন `sync.RWMutex` ব্যবহার করুন** (যেমন একটা cache)। একাধিক goroutine `RLock()` দিয়ে একসাথে read করতে পারে, কিন্তু `Lock()` দিয়ে write করা exclusive। write-heavy workload-এর জন্য সাধারণ `sync.Mutex`-এর overhead কম।

</Callout>

## sync.Once: এক-বারের Initialization

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

## errgroup: Error Handling সহ Goroutine

`golang.org/x/sync/errgroup` হলো error return করা goroutine চালানোর standard উপায়:

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

**বাস্তব জীবনের উপমা**

`errgroup` অনেকটা তিনজন কর্মচারীকে আলাদা আলাদা জিনিস আনতে পাঠানোর মতো। এদের যেকোনো একজন সমস্যা জানালে ("দোকান বন্ধ"), আপনি বাকিদের cancel করেন আর error-টা সামলান। তিনজনই সফল হলে, আপনার যা দরকার সব পেয়ে যান।

</Callout>

### Concurrency Limit সহ errgroup

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

সর্বোচ্চ কতগুলো concurrent operation চলবে তা নিয়ন্ত্রণ করুন:

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

এমন stage-গুলো চেইন করুন যেখানে প্রতিটা stage একটা goroutine যা একটা stream process করে:

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

**বাস্তব জীবনের উপমা**

একটা pipeline অনেকটা কারখানার assembly line-এর মতো। Station 1 ধাতু কাটে, Station 2 বাঁকায়, Station 3 রং করে। প্রতিটা station একই সময়ে আলাদা আলাদা টুকরোর উপর কাজ করে। কারখানা বন্ধ হয়ে গেলে (context cancelled), প্রতিটা station থেমে যায়।

</Callout>

## বাস্তব উদাহরণ: Rate-Limited API Client

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

## মূল শিক্ষা

1. **I/O-এর জন্য Context বাধ্যতামূলক** — সবসময় প্রথম parameter হিসেবে `context.Context` পাঠান
2. **`defer cancel()`** — resource leak ঠেকাতে আপনার তৈরি করা context-এ সবসময় cancel কল করুন
3. **read-heavy shared state-এর জন্য `sync.RWMutex`**, write-heavy-র জন্য `sync.Mutex`
4. **`errgroup`** হলো error handling সহ concurrent operation-এর production standard
5. **Pipeline** stage-গুলোকে goroutine-চালিত channel হিসেবে গাঁথে — প্রতিটা stage concurrent-ভাবে চলে
6. **Rate limiting + concurrency limiting** আলাদা বিষয় — production API client-এ দুটোই ব্যবহার করুন
7. **long-running loop-এ `ctx.Done()` চেক করুন** যাতে cancellation সাপোর্ট করা যায়
