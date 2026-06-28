---
title: 'Concurrency with Goroutines'
subtitle: "Go's concurrency model is its killer feature — goroutines and channels make concurrent programming feel natural, not terrifying."
chapter: 10
level: 'intermediate'
readingTime: '22 min'
topics: ['goroutines', 'channels', 'select', 'WaitGroup', 'concurrency patterns']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Concurrency Matters

A modern web server handles thousands of requests at once. A data pipeline processes millions of records. A chat application manages thousands of simultaneous connections. Without concurrency, each operation waits for the previous one to finish — your server handles one request at a time.

<Callout type="info">

**Real-World Analogy**

Think of a restaurant. **Sequential** = one waiter handles one table at a time. Takes the order, goes to the kitchen, waits for the food, delivers it, then moves to the next table. **Concurrent** = one waiter handles many tables. Takes an order, sends it to the kitchen, moves to the next table while the food cooks. The waiter is the CPU, the tables are goroutines.

</Callout>

## Goroutines: Lightweight Threads

A goroutine is a function that runs concurrently. It costs ~2KB of memory (vs ~1MB for an OS thread). You can run millions of them.

```go
func fetchURL(url string) {
    resp, err := http.Get(url)
    if err != nil {
        log.Printf("Error fetching %s: %v", url, err)
        return
    }
    defer resp.Body.Close()
    fmt.Printf("%s: %d\n", url, resp.StatusCode)
}

func main() {
    urls := []string{
        "https://api.github.com",
        "https://httpbin.org/get",
        "https://jsonplaceholder.typicode.com/posts/1",
    }

    // Sequential: ~3 seconds (1 second per request)
    for _, url := range urls {
        fetchURL(url)
    }

    // Concurrent: ~1 second (all run at the same time)
    for _, url := range urls {
        go fetchURL(url)  // The 'go' keyword launches a goroutine
    }

    // Problem: main() exits before goroutines finish!
    time.Sleep(3 * time.Second)  // Bad solution — don't do this
}
```

## WaitGroup: Waiting for Goroutines

`sync.WaitGroup` tracks when all goroutines are done:

```go
func main() {
    urls := []string{
        "https://api.github.com",
        "https://httpbin.org/get",
        "https://jsonplaceholder.typicode.com/posts/1",
    }

    var wg sync.WaitGroup

    for _, url := range urls {
        wg.Add(1)  // Increment counter
        go func() {
            defer wg.Done()  // Decrement when done
            fetchURL(url)
        }()
    }

    wg.Wait()  // Block until counter reaches 0
    fmt.Println("All requests completed")
}
```

<Callout type="info">

**Real-World Analogy**

`WaitGroup` is like a headcount at a field trip. Before each kid gets on the bus (`Add(1)`), you note their name. When they come back (`Done()`), you check them off. `Wait()` is the teacher standing at the bus door, not leaving until every kid is accounted for.

</Callout>

## Channels: Communication Between Goroutines

Channels are typed pipes that goroutines use to send data to each other.

```go
// Create a channel
ch := make(chan string)

// Send data into channel
go func() {
    ch <- "hello"  // Blocks until someone receives
}()

// Receive data from channel
msg := <-ch  // Blocks until someone sends
fmt.Println(msg)  // "hello"
```

### Go's Concurrency Proverb

> **"Don't communicate by sharing memory; share memory by communicating."**

Instead of multiple goroutines accessing shared variables (with locks), pass data through channels.

### Buffered vs Unbuffered Channels

```go
// Unbuffered: sender blocks until receiver is ready (synchronous)
ch := make(chan int)

// Buffered: sender can send up to N values without blocking
ch := make(chan int, 10)  // Buffer of 10

// Buffered channel example: job queue
jobs := make(chan Job, 100)

// Producer — can add up to 100 jobs without waiting
go func() {
    for _, job := range allJobs {
        jobs <- job
    }
    close(jobs)
}()

// Consumer — processes jobs as they arrive
for job := range jobs {
    process(job)
}
```

<Callout type="info">

**Real-World Analogy**

**Unbuffered channel** = a phone call. Both parties must be on the line at the same time. The caller waits until someone picks up.

**Buffered channel** = a mailbox. You can drop off letters even if no one is home. But once the mailbox is full (buffer size), you have to wait until someone empties it.

</Callout>

## Channel Directions

Restrict channels to send-only or receive-only for safety:

```go
// Send-only channel parameter
func producer(out chan<- int) {
    for i := 0; i < 10; i++ {
        out <- i
    }
    close(out)
}

// Receive-only channel parameter
func consumer(in <-chan int) {
    for val := range in {
        fmt.Println(val)
    }
}

func main() {
    ch := make(chan int, 5)
    go producer(ch)
    consumer(ch)  // Blocks until channel is closed
}
```

## Select: Multiplexing Channels

`select` lets a goroutine wait on multiple channels simultaneously:

```go
func fetchWithTimeout(url string, timeout time.Duration) (string, error) {
    result := make(chan string, 1)
    errCh := make(chan error, 1)

    go func() {
        resp, err := http.Get(url)
        if err != nil {
            errCh <- err
            return
        }
        defer resp.Body.Close()
        body, _ := io.ReadAll(resp.Body)
        result <- string(body)
    }()

    select {
    case body := <-result:
        return body, nil
    case err := <-errCh:
        return "", err
    case <-time.After(timeout):
        return "", fmt.Errorf("request to %s timed out after %v", url, timeout)
    }
}
```

<Callout type="info">

**Real-World Analogy**

`select` is like waiting at a bus stop where three different bus lines pass. You take whichever bus arrives first. If no bus comes in 10 minutes (timeout), you give up and call a cab.

</Callout>

## Real-World Pattern: Worker Pool

The worker pool is the most common concurrency pattern in Go production code:

```go
type Job struct {
    ID      int
    Payload string
}

type Result struct {
    JobID  int
    Output string
    Err    error
}

func worker(id int, jobs <-chan Job, results chan<- Result) {
    for job := range jobs {
        // Simulate work
        output, err := processPayload(job.Payload)
        results <- Result{
            JobID:  job.ID,
            Output: output,
            Err:    err,
        }
    }
}

func processJobs(allJobs []Job, workerCount int) []Result {
    jobs := make(chan Job, len(allJobs))
    results := make(chan Result, len(allJobs))

    // Start workers
    for i := 0; i < workerCount; i++ {
        go worker(i, jobs, results)
    }

    // Send jobs
    for _, job := range allJobs {
        jobs <- job
    }
    close(jobs)

    // Collect results
    var output []Result
    for i := 0; i < len(allJobs); i++ {
        output = append(output, <-results)
    }
    return output
}

// Usage: process 1000 jobs with 10 workers
results := processJobs(myJobs, 10)
```

## Real-World Pattern: Fan-Out, Fan-In

Distribute work across goroutines (fan-out) and collect results (fan-in):

```go
func fanOut(urls []string) <-chan FetchResult {
    results := make(chan FetchResult)

    var wg sync.WaitGroup
    for _, url := range urls {
        wg.Add(1)
        go func() {
            defer wg.Done()
            resp, err := http.Get(url)
            if err != nil {
                results <- FetchResult{URL: url, Err: err}
                return
            }
            defer resp.Body.Close()
            body, _ := io.ReadAll(resp.Body)
            results <- FetchResult{URL: url, Body: body, Status: resp.StatusCode}
        }()
    }

    // Close results channel when all goroutines are done
    go func() {
        wg.Wait()
        close(results)
    }()

    return results
}

// Consume results as they arrive
for result := range fanOut(urls) {
    if result.Err != nil {
        log.Printf("Failed: %s: %v", result.URL, result.Err)
        continue
    }
    log.Printf("OK: %s (%d bytes)", result.URL, len(result.Body))
}
```

## Common Mistakes

### 1. Goroutine Leak

```go
// BAD: goroutine runs forever if nobody reads from ch
func leaky() {
    ch := make(chan int)
    go func() {
        val := expensiveComputation()
        ch <- val  // Blocks forever if leaky() returns early
    }()
    // If we return here without reading ch, the goroutine leaks
}

// GOOD: use buffered channel so goroutine can finish
func safe() {
    ch := make(chan int, 1)  // Buffer of 1
    go func() {
        ch <- expensiveComputation()  // Won't block even if nobody reads
    }()
}
```

### 2. Race Condition

```go
// BAD: multiple goroutines writing to shared variable
counter := 0
for i := 0; i < 1000; i++ {
    go func() {
        counter++  // DATA RACE!
    }()
}

// GOOD: use atomic operations
var counter atomic.Int64
for i := 0; i < 1000; i++ {
    go func() {
        counter.Add(1)  // Thread-safe
    }()
}

// Or use a channel
counterCh := make(chan int, 1000)
for i := 0; i < 1000; i++ {
    go func() {
        counterCh <- 1
    }()
}
total := 0
for i := 0; i < 1000; i++ {
    total += <-counterCh
}
```

<Callout type="tip">

**Always run `go test -race ./...`** during development and CI. Go's race detector finds data races at runtime. It's not 100% but catches most bugs. Many companies make it a CI requirement.

</Callout>

## Key Takeaways

1. **Goroutines are cheap** — launch thousands, use `go func()` to start one
2. **`sync.WaitGroup`** tracks completion — `Add` before launch, `Done` on finish, `Wait` to block
3. **Channels communicate data** — unbuffered for synchronization, buffered for queues
4. **`select` multiplexes channels** — wait on multiple channels, take the first one ready
5. **Worker pools** are the go-to pattern for bounded concurrency in production
6. **Always check for goroutine leaks** — buffered channels and context cancellation prevent them
7. **Run the race detector** — `go test -race` is non-negotiable in production code
