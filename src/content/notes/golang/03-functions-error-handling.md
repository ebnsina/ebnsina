---
title: 'Functions ও Error Handling'
subtitle: 'Function আর error নিয়ে Go-র দৃষ্টিভঙ্গি বেশিরভাগ ভাষার চেয়ে একদম আলাদা — explicit, composable, আর এড়িয়ে যাওয়া অসম্ভব।'
chapter: 3
level: 'beginner'
readingTime: '20 মিনিট'
topics: ['functions', 'error handling', 'multiple returns', 'defer', 'closures']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমির একটা ইলেকট্রনিক্স মেরামতের দোকান আছে, সামনে একটা জব-কাউন্টার। ফাতিমা তার নষ্ট হেয়ার-ড্রায়ারটা কাউন্টারে জমা দিয়ে টোকেন নিয়ে গেল। এখানে ড্রায়ারটা হলো input — আপনি কিছু একটা হাতে তুলে দিলেন। বিকেলে ফিরে এসে ফাতিমা কাউন্টারে টোকেন দেখাল, আর খোয়ারিজমি তাকে দুটো জিনিসের একটা ফেরত দেয়: হয় ঠিক-হয়ে-যাওয়া ড্রায়ারটা, নয়তো সেই ড্রায়ার আর সাথে একটা লেখা স্লিপ — "সারানো গেল না, মোটর পুড়ে গেছে"।

মজার ব্যাপার হলো, খোয়ারিজমি কখনোই চেঁচিয়ে দোকান মাথায় তোলে না বা হঠাৎ ফাতিমাকে চমকে দেয় না। সে চুপচাপ প্রতিবার জিনিসটার সাথে স্লিপটাও হাতে ধরিয়ে দেয়, আর ফাতিমার কাজ হলো ড্রায়ার নিয়ে খুশিমনে চলে যাওয়ার আগে সেই স্লিপটা পড়া। স্লিপে যদি "সারানো গেল না" লেখা থাকে অথচ ফাতিমা না পড়েই ধরে নেয় সব ঠিক আছে, তাহলে বাসায় গিয়ে সুইচ টিপে সে বিপদে পড়বে।

এটাই Go-তে function আর error handling। function হলো খোয়ারিজমির কাউন্টার: আপনি input দেন, আর সে output ফেরত দেয়। কিন্তু Go-তে output-এর সাথে সবসময় একটা দ্বিতীয় value — error — ফেরত আসে, ঠিক সেই "সারানো গেল না" স্লিপের মতো। Python বা Java হলে দোকানদার হয়তো ব্যর্থতায় প্লেট ছুড়ে মারত (exception), কিন্তু Go ভদ্রভাবে জিনিসের পাশে স্লিপটা রেখে দেয় — আর আপনাকে প্রতিবার `if err != nil` দিয়ে সেই স্লিপ পড়তেই হয়, ধরে নেওয়া চলে না যে সব ঠিক হয়েছে। এই কারণেই বাস্তব Go কোডে file পড়া, network call, বা database query-র পরপরই আপনি এই error-check দেখতে পাবেন — ব্যর্থতা কখনো লুকিয়ে থাকে না, প্রতিটাই একটা ফেরত-আসা value হিসেবে হাতে আসে।

## Go-তে Functions

Go-তে function হলো first-class citizen। এগুলো variable-এ assign করা যায়, argument হিসেবে পাস করা যায়, আর অন্য function থেকে return করা যায়।

```go
// Basic function
func add(a, b int) int {
    return a + b
}

// Multiple return values (Go's signature feature)
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, fmt.Errorf("cannot divide by zero")
    }
    return a / b, nil
}

// Named return values (useful for documentation)
func parseConfig(path string) (host string, port int, err error) {
    // host, port, and err are pre-declared
    // "naked return" returns them all — use sparingly
    host = "localhost"
    port = 8080
    return  // returns host, port, nil
}
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

Multiple return value অনেকটা রেস্টুরেন্ট থেকে অর্ডার করার মতো। আপনি খাবার পান, সাথে একটা রসিদও। রসিদটা (error) বলে দেয় কিছু ভুল হলো কিনা। Python বা Java-তে রেস্টুরেন্ট হয়তো আপনার প্লেট দেয়ালে ছুড়ে মারে (exception) — আপনাকে সেটা ধরতে হয়। Go-তে তারা ভদ্রভাবে আপনার হাতে একটা নোট ধরিয়ে দেয় "এটা আমাদের কাছে শেষ।"

</Callout>

## Variadic Functions

```go
// Accept any number of arguments
func sum(nums ...int) int {
    total := 0
    for _, n := range nums {
        total += n
    }
    return total
}

// Usage
sum(1, 2, 3)        // 6
sum(1, 2, 3, 4, 5)  // 15

// Spread a slice into variadic args
numbers := []int{10, 20, 30}
sum(numbers...)      // 60
```

## Function যখন Value

```go
// Assign function to variable
multiply := func(a, b int) int {
    return a * b
}
result := multiply(3, 4)  // 12

// Function as parameter (higher-order function)
func apply(nums []int, transform func(int) int) []int {
    result := make([]int, len(nums))
    for i, n := range nums {
        result[i] = transform(n)
    }
    return result
}

doubled := apply([]int{1, 2, 3}, func(n int) int {
    return n * 2
})
// [2, 4, 6]
```

## Closures

একটা closure তার আশপাশের scope থেকে variable capture করে:

```go
func makeCounter() func() int {
    count := 0
    return func() int {
        count++  // captures and modifies 'count'
        return count
    }
}

counter := makeCounter()
fmt.Println(counter())  // 1
fmt.Println(counter())  // 2
fmt.Println(counter())  // 3
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা closure অনেকটা নোটবুক হাতে থাকা একজন মানুষের মতো। নোটবুকটা (`count`) তার সাথেই থেকে যায়, এমনকি যে ঘর থেকে সে এটা পেয়েছিল সেটা ছেড়ে চলে গেলেও। প্রতিবার আপনি function কল করলে সে নোটবুক খোলে, সংখ্যাটা আপডেট করে, আর আপনাকে ফলাফল জানায়।

</Callout>

### বাস্তব জীবনের Closure: Rate Limiter

```go
func newRateLimiter(maxPerSecond int) func() bool {
    tokens := maxPerSecond
    lastRefill := time.Now()
    mu := sync.Mutex{}

    return func() bool {
        mu.Lock()
        defer mu.Unlock()

        now := time.Now()
        elapsed := now.Sub(lastRefill).Seconds()
        tokens += int(elapsed * float64(maxPerSecond))
        if tokens > maxPerSecond {
            tokens = maxPerSecond
        }
        lastRefill = now

        if tokens > 0 {
            tokens--
            return true  // allowed
        }
        return false  // rate limited
    }
}

limiter := newRateLimiter(10)  // 10 requests per second
if limiter() {
    handleRequest()
}
```

## Error Handling: Go-র সুচিন্তিত সিদ্ধান্ত

Go exception-এর বদলে **explicit error return** ব্যবহার করে। এটা ভাষাটার সবচেয়ে বিতর্কিত আর সবচেয়ে গুরুত্বপূর্ণ ডিজাইন সিদ্ধান্ত।

```go
// The error interface is dead simple:
type error interface {
    Error() string
}

// Functions return errors as the last value
func readFile(path string) ([]byte, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("reading %s: %w", path, err)
    }
    return data, nil
}
```

### Exception কেন নেই?

Java বা Python-এ exception যেকোনো জায়গা থেকে throw করা যায় আর যেকোনো জায়গায় catch করা যায়। এটা একটা অদৃশ্য control flow তৈরি করে — একটা function পড়ে আপনি বুঝতে পারবেন না এটা হঠাৎ তিন স্তর উপরের কোনো catch block-এ লাফ দেবে কিনা।

```go
// Go forces you to handle every error at the call site
result, err := doSomething()
if err != nil {
    // You MUST deal with this. Right here. Right now.
    return fmt.Errorf("doing something: %w", err)
}
```

<Callout type="tip">

**`if err != nil` প্যাটার্ন Go কোডে মোটামুটি প্রতি 3 লাইন পরপর দেখা যায়।** এটা verbose, কিন্তু এর মানে:

- প্রতিটা error কোড path-এ দৃশ্যমান
- আপনি ভুলে কোনো error উপেক্ষা করতে পারবেন না
- Go কোড পড়লে আপনি সবসময় জানেন কী fail করতে পারে আর সেটা কীভাবে হ্যান্ডল হয়

</Callout>

## Error তৈরি করা

```go
import (
    "errors"
    "fmt"
)

// Simple error
err := errors.New("something went wrong")

// Formatted error
err := fmt.Errorf("user %d not found", userID)

// Wrapping errors (preserves the chain for debugging)
data, err := fetchFromDB(id)
if err != nil {
    return fmt.Errorf("fetching user %d: %w", id, err)
    // Output: "fetching user 42: connection refused"
}
```

## Sentinel Errors

আগে থেকে সংজ্ঞায়িত error, যেগুলোর সাথে caller মিলিয়ে দেখতে পারে:

```go
// Standard library examples
var ErrNotFound = errors.New("not found")
var ErrUnauthorized = errors.New("unauthorized")
var ErrTimeout = errors.New("operation timed out")

func findUser(id int) (*User, error) {
    user, err := db.Query(id)
    if err != nil {
        return nil, fmt.Errorf("finding user: %w", err)
    }
    if user == nil {
        return nil, ErrNotFound
    }
    return user, nil
}

// Caller checks with errors.Is (works through wrapping)
user, err := findUser(42)
if errors.Is(err, ErrNotFound) {
    http.Error(w, "User not found", 404)
    return
}
if err != nil {
    http.Error(w, "Internal error", 500)
    return
}
```

## Custom Error Types

যখন একটা string-এর চেয়ে বেশি context দরকার:

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation failed on %s: %s", e.Field, e.Message)
}

func validateAge(age int) error {
    if age < 0 {
        return &ValidationError{Field: "age", Message: "must be non-negative"}
    }
    if age > 150 {
        return &ValidationError{Field: "age", Message: "unrealistic value"}
    }
    return nil
}

// Caller extracts the structured error
err := validateAge(-5)
var valErr *ValidationError
if errors.As(err, &valErr) {
    fmt.Printf("Field: %s, Problem: %s\n", valErr.Field, valErr.Message)
}
```

<Callout type="info">

**`errors.Is` বনাম `errors.As`:**

- **`errors.Is(err, target)`** — "এই error (বা chain-এর যেকোনো wrapped error) কি এই নির্দিষ্ট value-র সমান?" Sentinel error-এর জন্য ব্যবহৃত হয়।
- **`errors.As(err, &target)`** — "এই chain থেকে আমি কি একটা নির্দিষ্ট error type বের করতে পারি?" Custom error type-এর জন্য ব্যবহৃত হয়।

</Callout>

## Defer: যে Cleanup কখনো ব্যর্থ হয় না

`defer` একটা function কল শিডিউল করে যা আশপাশের function return করার সময় রান হয়। এটা Go-র নিশ্চিত করার উপায় যে cleanup ঘটবেই — অনেকটা `finally` block-এর মতো, কিন্তু নির্দিষ্ট operation-এর সাথে বাঁধা।

```go
func processFile(path string) error {
    f, err := os.Open(path)
    if err != nil {
        return err
    }
    defer f.Close()  // Runs when processFile returns, no matter what

    // Even if this panics, f.Close() still runs
    data, err := io.ReadAll(f)
    if err != nil {
        return err  // f.Close() still runs
    }

    return process(data)  // f.Close() still runs
}
```

### Defer হলো LIFO (Last In, First Out)

```go
func example() {
    defer fmt.Println("first")
    defer fmt.Println("second")
    defer fmt.Println("third")
}
// Output:
// third
// second
// first
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

`defer` অনেকটা প্লেট স্তূপ করার মতো। আপনি প্রথম প্লেটটা রাখেন (প্রথম defer), তার উপর আরেকটা, তার উপর আরেকটা। পরিষ্কার করার সময় আপনি উপরের প্লেটটা আগে তোলেন (শেষ defer করা কল আগে রান হয়)। এটাই LIFO stack ক্রম।

</Callout>

### বাস্তব জীবনের Defer: Database Transaction

```go
func transferMoney(db *sql.DB, from, to int, amount float64) error {
    tx, err := db.Begin()
    if err != nil {
        return fmt.Errorf("starting transaction: %w", err)
    }
    defer func() {
        if err != nil {
            tx.Rollback()  // If anything fails, rollback
        }
    }()

    _, err = tx.Exec("UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, from)
    if err != nil {
        return fmt.Errorf("debiting account %d: %w", from, err)
    }

    _, err = tx.Exec("UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, to)
    if err != nil {
        return fmt.Errorf("crediting account %d: %w", to, err)
    }

    return tx.Commit()
}
```

## Panic এবং Recover (কম ব্যবহার করুন)

`panic` সত্যিকারের অপ্রতিরোধ্য পরিস্থিতির জন্য। `recover` panic ধরে — মূলত middleware আর framework-এ ব্যবহৃত হয়।

```go
// Panic — the program crashes with a stack trace
func mustParseConfig(path string) Config {
    data, err := os.ReadFile(path)
    if err != nil {
        panic(fmt.Sprintf("config file required: %v", err))
    }
    // ...
}

// Recover — catches a panic (usually in middleware)
func safeHandler(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if r := recover(); r != nil {
                log.Printf("panic recovered: %v\n%s", r, debug.Stack())
                http.Error(w, "Internal Server Error", 500)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

<Callout type="warning">

**মূলনীতি:** `panic` শুধু programmer error-এর জন্য ব্যবহার করুন (ভুল configuration, অসম্ভব state)। runtime-এ যুক্তিসঙ্গতভাবে ঘটতে পারে এমন যেকোনো কিছুর জন্য `error` return ব্যবহার করুন (file not found, network timeout, invalid input)। আপনি যদি একটা library লেখেন, প্রায় কখনোই panic করবেন না — এর বদলে error return করুন।

</Callout>

## মূল যেসব শিখলেন

1. **Multiple return value** হলো exception-এর প্রতি Go-র জবাব — `result, err := doThing()`
2. **`if err != nil`** হলো সবচেয়ে সাধারণ Go প্যাটার্ন — এটাকে আপন করে নিন, এর বিরুদ্ধে লড়বেন না
3. **`%w` দিয়ে error wrap করুন** — `fmt.Errorf("context: %w", err)` error chain সংরক্ষণ করে
4. **Sentinel error-এর জন্য `errors.Is`**, **typed error-এর জন্য `errors.As`** — দুটোই wrapped chain ধরে এগোয়
5. **`defer` cleanup নিশ্চিত করে** — file, lock, transaction, আর connection-এর জন্য ব্যবহার করুন
6. **Panic programmer error-এর জন্য**, runtime failure-এর জন্য নয় — user যদি এটা ঘটাতে পারে, তাহলে error return ব্যবহার করুন
