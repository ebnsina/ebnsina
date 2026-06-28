---
title: 'Functions & Error Handling'
subtitle: "Go's approach to functions and errors is radically different from most languages — explicit, composable, and impossible to ignore."
chapter: 3
level: 'beginner'
readingTime: '20 min'
topics: ['functions', 'error handling', 'multiple returns', 'defer', 'closures']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Functions in Go

Functions are first-class citizens in Go. They can be assigned to variables, passed as arguments, and returned from other functions.

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

**Real-World Analogy**

Multiple return values are like ordering from a restaurant. You get your food AND a receipt. The receipt (error) tells you if something went wrong. In Python or Java, the restaurant might throw your plate at the wall (exception) — you have to catch it. In Go, they politely hand you a note saying "we're out of that."

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

## Functions as Values

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

A closure captures variables from its surrounding scope:

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

**Real-World Analogy**

A closure is like a person with a notebook. The notebook (`count`) stays with them even after they leave the room where they got it. Every time you call the function, they open the notebook, update the number, and tell you the result.

</Callout>

### Real-World Closure: Rate Limiter

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

## Error Handling: Go's Deliberate Choice

Go uses **explicit error returns** instead of exceptions. This is the most controversial and most important design decision in the language.

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

### Why No Exceptions?

In Java or Python, exceptions can be thrown from anywhere and caught anywhere. This creates invisible control flow — you can't tell by reading a function whether it might suddenly jump to a catch block three layers up.

```go
// Go forces you to handle every error at the call site
result, err := doSomething()
if err != nil {
    // You MUST deal with this. Right here. Right now.
    return fmt.Errorf("doing something: %w", err)
}
```

<Callout type="tip">

**The `if err != nil` pattern appears roughly every 3 lines in Go code.** It's verbose, but it means:

- Every error is visible in the code path
- You can't accidentally ignore an error
- Reading Go code, you always know what can fail and how it's handled

</Callout>

## Creating Errors

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

Pre-defined errors that callers can check against:

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

When you need more context than a string:

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

**`errors.Is` vs `errors.As`:**

- **`errors.Is(err, target)`** — "Is this error (or any wrapped error in the chain) equal to this specific value?" Used for sentinel errors.
- **`errors.As(err, &target)`** — "Can I extract a specific error type from this chain?" Used for custom error types.

</Callout>

## Defer: Cleanup That Never Fails

`defer` schedules a function call to run when the surrounding function returns. It's Go's way of ensuring cleanup happens — like a `finally` block, but attached to specific operations.

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

### Defer is LIFO (Last In, First Out)

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

**Real-World Analogy**

`defer` is like stacking plates. You put the first plate down (first defer), then another on top, then another. When you clean up, you pick up the top plate first (last deferred call runs first). This is the LIFO stack order.

</Callout>

### Real-World Defer: Database Transaction

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

## Panic and Recover (Use Sparingly)

`panic` is for truly unrecoverable situations. `recover` catches panics — mainly used in middleware and frameworks.

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

**Rule of thumb:** Use `panic` only for programmer errors (wrong configuration, impossible states). Use `error` returns for anything that could reasonably happen at runtime (file not found, network timeout, invalid input). If you're writing a library, almost never panic — return errors instead.

</Callout>

## Key Takeaways

1. **Multiple return values** are Go's answer to exceptions — `result, err := doThing()`
2. **`if err != nil`** is the most common Go pattern — embrace it, don't fight it
3. **Wrap errors with `%w`** — `fmt.Errorf("context: %w", err)` preserves the error chain
4. **`errors.Is` for sentinel errors**, **`errors.As` for typed errors** — both traverse the wrapped chain
5. **`defer` guarantees cleanup** — use it for files, locks, transactions, and connections
6. **Panic is for programmer errors**, not runtime failures — if the user can trigger it, use an error return instead
