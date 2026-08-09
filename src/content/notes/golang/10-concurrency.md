---
title: 'Goroutine দিয়ে Concurrency'
subtitle: 'Go-এর concurrency model-ই এর সেরা ফিচার — goroutine আর channel concurrent programming-কে ভয়ঙ্কর নয়, বরং স্বাভাবিক মনে করায়।'
chapter: 10
level: 'intermediate'
readingTime: '22 মিনিট'
topics: ['goroutines', 'channels', 'select', 'WaitGroup', 'concurrency patterns']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ঢাকার এক ব্যস্ত রেস্তোরাঁর রান্নাঘর কল্পনা করুন। লাঞ্চের সময় একসাথে শত শত অর্ডার আসছে। একটামাত্র শেফ থাকলে সব রান্না একের পর এক হতো — একটা বিরিয়ানি নামিয়ে তারপর কাবাব, তারপর ডাল — লাইন লম্বা হয়ে যেত। তাই ম্যানেজার সহজ একটা কাজ করে: অনেকজন সস্তা রাঁধুনি রাখে। ইবনে সিনা শুধু কাবাব সেঁকে, আল-খোয়ারিজমি শুধু ডাল রাঁধে, ফাতিমা আল-ফিহরি শুধু বিরিয়ানি বসায় — প্রত্যেকে নিজের একটা কাজ নিয়ে একই সময়ে হাত চালায়। একজনকে রাখা এত সস্তা যে ভিড় বাড়লে ম্যানেজার আরও দশজন রাঁধুনি নামিয়ে দেয়, কোনো চিন্তা ছাড়াই।

কিন্তু গোলমাল বাঁধে তখন, যখন দুইজন একই কড়াইয়ে হাত দেয় বা একে অপরের হাত থেকে থালা টেনে নেয় — খাবার ছিটকে পড়ে, কে কোনটা রাঁধছিল হিসাব থাকে না। তাই এই রান্নাঘরে একটাই নিয়ম: কেউ অন্যের হাত থেকে কিছু কাড়ে না। রান্না শেষ হলে রাঁধুনি থালাটা রান্নাঘর আর সার্ভিং এরিয়ার মাঝের একটা সরু জানালা — সার্ভিং হ্যাচ — দিয়ে বাড়িয়ে দেয়। ওয়েটার ওই হ্যাচ থেকেই থালা তুলে নেয়। কেউ চেঁচিয়ে "আমার ডালটা কই" বলে না, সবাই শুধু হ্যাচ দিয়ে জিনিস পাস করে দেয় — এতে দুই হাত কখনো এক থালায় ঠোকাঠুকি খায় না।

এই রান্নাঘরটাই আসলে Go-এর concurrency। প্রতিটা সস্তা রাঁধুনি একেকটা **goroutine** — এত হালকা যে হাজার হাজার চালানো যায়, প্রত্যেকে নিজের কাজ একই সময়ে করে। আর ওই সার্ভিং হ্যাচটা হলো **channel** — একটা নিরাপদ জানালা যা দিয়ে একটা goroutine তার শেষ করা কাজ আরেকজনের কাছে পাস করে দেয়, শেয়ার করা কড়াইয়ে হাত ঠোকাঠুকি না করেই। Go-এর বিখ্যাত প্রবাদটা ঠিক এটাই — "shared memory দিয়ে যোগাযোগ কোরো না, যোগাযোগ দিয়ে memory শেয়ার করো।" বাস্তবে একটা web crawler বা image processing pipeline এভাবেই কাজ করে: কাজগুলো অনেক goroutine-এ ভাগ করে দেওয়া হয়, আর প্রতিটা goroutine তার result channel দিয়ে ফেরত পাঠায় — কোনো lock বা race condition ছাড়াই।

## Concurrency কেন গুরুত্বপূর্ণ

একটা modern web server একসাথে হাজার হাজার request হ্যান্ডেল করে। একটা data pipeline লক্ষ লক্ষ record process করে। একটা chat application হাজার হাজার একসাথের connection ম্যানেজ করে। concurrency ছাড়া প্রতিটা operation আগেরটা শেষ হওয়ার জন্য অপেক্ষা করে — আপনার server একবারে একটা request হ্যান্ডেল করে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা রেস্তোরাঁর কথা ভাবুন। **Sequential** = একজন ওয়েটার একবারে একটা টেবিল সামলায়। অর্ডার নেয়, রান্নাঘরে যায়, খাবারের জন্য অপেক্ষা করে, সেটা দিয়ে আসে, তারপর পরের টেবিলে যায়। **Concurrent** = একজন ওয়েটার অনেকগুলো টেবিল সামলায়। একটা অর্ডার নেয়, রান্নাঘরে পাঠায়, খাবার রান্না হওয়ার ফাঁকে পরের টেবিলে চলে যায়। ওয়েটার হলো CPU, টেবিলগুলো হলো goroutine।

</Callout>

## Goroutine: হালকা Thread

একটা goroutine হলো এমন একটা function যা concurrent-ভাবে চলে। এর খরচ ~2KB memory (OS thread-এর ~1MB-এর তুলনায়)। আপনি লক্ষ লক্ষ চালাতে পারেন।

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

## WaitGroup: Goroutine-এর জন্য অপেক্ষা করা

`sync.WaitGroup` ট্র্যাক করে সব goroutine কখন শেষ হলো:

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

**বাস্তব জীবনের উপমা**

`WaitGroup` অনেকটা স্কুল ট্রিপে হেডকাউন্ট করার মতো। প্রতিটা বাচ্চা বাসে ওঠার আগে (`Add(1)`), আপনি তার নাম টুকে রাখেন। যখন তারা ফিরে আসে (`Done()`), আপনি টিক দেন। `Wait()` হলো শিক্ষক বাসের দরজায় দাঁড়িয়ে আছেন, প্রতিটা বাচ্চার হিসাব না মেলা পর্যন্ত রওনা দিচ্ছেন না।

</Callout>

## Channel: Goroutine-দের মধ্যে যোগাযোগ

Channel হলো typed pipe যা goroutine-রা একে অপরের কাছে data পাঠাতে ব্যবহার করে।

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

### Go-এর Concurrency প্রবাদ

> **"Don't communicate by sharing memory; share memory by communicating."**

একাধিক goroutine দিয়ে shared variable অ্যাক্সেস (lock দিয়ে) করার বদলে, channel-এর মধ্য দিয়ে data পাঠান।

### Buffered বনাম Unbuffered Channel

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

**বাস্তব জীবনের উপমা**

**Unbuffered channel** = ফোন কল। দুই পক্ষকেই একই সময়ে লাইনে থাকতে হবে। কল করা লোকটা কেউ ধরা পর্যন্ত অপেক্ষা করে।

**Buffered channel** = চিঠির বাক্স। বাড়িতে কেউ না থাকলেও আপনি চিঠি ফেলে যেতে পারেন। কিন্তু একবার বাক্স ভরে গেলে (buffer size), কেউ খালি না করা পর্যন্ত আপনাকে অপেক্ষা করতে হবে।

</Callout>

## Channel Direction

নিরাপত্তার জন্য channel-কে send-only বা receive-only-তে সীমাবদ্ধ করুন:

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

## Select: Channel Multiplex করা

`select` একটা goroutine-কে একসাথে একাধিক channel-এর উপর অপেক্ষা করতে দেয়:

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

**বাস্তব জীবনের উপমা**

`select` অনেকটা এমন একটা বাস স্টপে অপেক্ষা করার মতো যেখানে তিনটা আলাদা বাস লাইন যায়। যে বাসটা আগে আসে সেটাতেই উঠে পড়েন। ১০ মিনিটেও কোনো বাস না এলে (timeout), হাল ছেড়ে ক্যাব ডাকেন।

</Callout>

## বাস্তব Pattern: Worker Pool

Worker pool হলো Go প্রোডাকশন কোডে সবচেয়ে সাধারণ concurrency pattern:

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

## বাস্তব Pattern: Fan-Out, Fan-In

goroutine-দের মধ্যে কাজ ভাগ করে দিন (fan-out) আর result সংগ্রহ করুন (fan-in):

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

## সাধারণ ভুল

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

**development আর CI-তে সবসময় `go test -race ./...` চালান।** Go-এর race detector runtime-এ data race খুঁজে বের করে। এটা 100% নয় কিন্তু বেশিরভাগ bug ধরে ফেলে। অনেক কোম্পানি একে CI-এর বাধ্যতামূলক শর্ত বানায়।

</Callout>

## মূল শিক্ষা

1. **Goroutine সস্তা** — হাজার হাজার চালান, একটা শুরু করতে `go func()` ব্যবহার করুন
2. **`sync.WaitGroup`** completion ট্র্যাক করে — launch-এর আগে `Add`, শেষে `Done`, block করতে `Wait`
3. **Channel data communicate করে** — synchronization-এর জন্য unbuffered, queue-এর জন্য buffered
4. **`select` channel multiplex করে** — একাধিক channel-এর উপর অপেক্ষা করে, যেটা প্রথমে ready হয় সেটা নেয়
5. **Worker pool** হলো production-এ bounded concurrency-র go-to pattern
6. **সবসময় goroutine leak চেক করুন** — buffered channel আর context cancellation এগুলো ঠেকায়
7. **race detector চালান** — production কোডে `go test -race` নন-নেগোশিয়েবল
