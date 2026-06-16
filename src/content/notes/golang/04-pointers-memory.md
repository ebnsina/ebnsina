---
title: "Pointers & Memory"
subtitle: "Pointers let you share data without copying it — understand them once and never be confused by & and * again."
chapter: 4
level: "beginner"
readingTime: "16 min"
topics: ["pointers", "memory", "stack", "heap", "nil", "pass by value"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What Is a Pointer?

A pointer is a variable that holds the **memory address** of another variable. Instead of holding the value itself, it holds directions to where the value lives.

```go
name := "Fatima"     // A string variable
ptr := &name        // A pointer to that string (&name = "address of name")

fmt.Println(name)   // "Fatima"  — the value
fmt.Println(ptr)    // 0xc0000b4000 — the memory address
fmt.Println(*ptr)   // "Fatima"  — dereferencing: follow the address to get the value
```

<Callout type="info">

**Real-World Analogy**

A pointer is like a house address written on a piece of paper. The paper doesn't contain the house — it contains the address where the house is. `&name` gives you the address. `*ptr` is like driving to the address and looking at the house. Multiple people can have the same address written down, and they'd all be looking at the same house.

</Callout>

## Why Pointers Exist

Go passes everything **by value** — function arguments are always copies. Without pointers, you can't modify the original data:

```go
// WITHOUT pointers — the original doesn't change
func tryToModify(name string) {
    name = "Omar"  // Modifies the COPY, not the original
}

original := "Fatima"
tryToModify(original)
fmt.Println(original)  // Still "Fatima"

// WITH pointers — you modify the original
func actuallyModify(name *string) {
    *name = "Omar"  // Follow the pointer, modify what's there
}

original := "Fatima"
actuallyModify(&original)  // Pass the address
fmt.Println(original)       // "Omar" — it changed!
```

## The Two Operators

| Operator | Name | What It Does | Example |
|----------|------|-------------|---------|
| `&` | Address-of | Gets the memory address of a variable | `ptr := &name` |
| `*` | Dereference | Follows a pointer to get/set the value | `value := *ptr` |

```go
x := 42
p := &x       // p is *int (pointer to int)

fmt.Println(p)   // 0xc0000b4008 (memory address)
fmt.Println(*p)  // 42 (value at that address)

*p = 100         // Change the value through the pointer
fmt.Println(x)   // 100 — x changed because p points to x
```

## Pointer Types

The type `*T` means "pointer to a value of type T":

```go
var intPtr *int        // Pointer to int (zero value is nil)
var strPtr *string     // Pointer to string
var userPtr *User      // Pointer to User struct

// Creating pointers
num := 42
intPtr = &num          // Point to existing variable

// Or use new() — allocates and returns pointer
intPtr = new(int)      // Points to a new int (value = 0)
*intPtr = 42           // Set the value
```

## Nil Pointers

A pointer's zero value is `nil`. Dereferencing a nil pointer causes a **panic** (crash):

```go
var ptr *int          // nil
fmt.Println(ptr)      // <nil>
// fmt.Println(*ptr)  // PANIC: runtime error: invalid memory address

// Always check for nil before dereferencing
if ptr != nil {
    fmt.Println(*ptr)
}
```

<Callout type="warning">

**Nil pointer dereference is Go's most common runtime panic.** Always check if a pointer might be nil before using `*ptr`. This is especially important with struct fields, function returns, and interface values.

</Callout>

## Pointers and Structs

This is where pointers become essential in real Go code:

```go
type User struct {
    Name  string
    Email string
    Age   int
}

// Without pointer — works on a COPY (56+ bytes copied)
func birthday(u User) {
    u.Age++  // Only modifies the copy
}

// With pointer — works on the ORIGINAL (8 bytes copied — just the address)
func birthday(u *User) {
    u.Age++  // Modifies the actual user
    // Note: Go automatically dereferences — no need to write (*u).Age++
}

user := &User{Name: "Fatima", Age: 29}
birthday(user)
fmt.Println(user.Age)  // 30
```

<Callout type="info">

**Real-World Analogy**

Passing a struct by value is like photocopying a document and handing out the copy — edits to the copy don't affect the original. Passing a pointer is like sharing a Google Doc link — everyone with the link edits the same document.

</Callout>

### Automatic Dereferencing

Go simplifies struct pointer access — you don't need `(*ptr).Field`:

```go
user := &User{Name: "Fatima"}

// These are equivalent:
fmt.Println((*user).Name)  // Explicit dereference
fmt.Println(user.Name)     // Go does it automatically
```

## Stack vs Heap

Go manages memory automatically, but understanding where data lives helps write faster code:

```go
// Stack allocation (fast — automatic cleanup)
func stackExample() int {
    x := 42        // Lives on the stack
    return x        // Copied out, stack frame released
}

// Heap allocation (slower — needs garbage collection)
func heapExample() *int {
    x := 42        // x ESCAPES to the heap because we return a pointer to it
    return &x       // Go detects this and allocates x on the heap
}
```

<Callout type="info">

**Real-World Analogy**

**Stack** = your desk at work. Fast to put things on and take off, but when you leave for the day (function returns), your desk is cleared. **Heap** = the company storage room. Things stay there as long as someone has the key (pointer). The janitor (garbage collector) periodically checks if any items have no keys pointing to them and cleans them up.

</Callout>

### Escape Analysis

Go's compiler decides whether to allocate on stack or heap. You can see its decisions:

```bash
go build -gcflags="-m" ./...
# ./main.go:10:2: x escapes to heap
# ./main.go:15:2: y does not escape
```

**Rules of thumb:**
- If you return a pointer to a local variable, it escapes to heap
- If you store a pointer in a long-lived struct, it escapes
- If a variable is too large for the stack, it goes to heap
- Stack allocation is nearly free; heap allocation involves GC

## Common Patterns

### Optional Values

Go doesn't have `Optional` or `Maybe`. Pointers serve this purpose:

```go
type SearchParams struct {
    Query    string
    MinPrice *float64  // nil = not specified
    MaxPrice *float64  // nil = not specified
    Page     *int      // nil = use default
}

func search(params SearchParams) []Product {
    query := db.Where("name LIKE ?", params.Query)

    if params.MinPrice != nil {
        query = query.Where("price >= ?", *params.MinPrice)
    }
    if params.MaxPrice != nil {
        query = query.Where("price <= ?", *params.MaxPrice)
    }

    page := 1
    if params.Page != nil {
        page = *params.Page
    }
    // ...
}

// Helper for creating pointers to literals
func Ptr[T any](v T) *T {
    return &v
}

// Usage
search(SearchParams{
    Query:    "laptop",
    MinPrice: Ptr(500.0),
    // MaxPrice is nil — no upper limit
})
```

### Avoiding Large Copies

```go
type Report struct {
    Title    string
    Data     [10000]float64  // 80KB!
    Metadata map[string]string
}

// BAD: copies 80KB+ every call
func processReport(r Report) { ... }

// GOOD: passes 8 bytes (the pointer)
func processReport(r *Report) { ... }
```

## When to Use Pointers vs Values

| Use a pointer `*T` | Use a value `T` |
|---|---|
| Need to modify the original | Read-only access |
| Struct is large (>64 bytes) | Small structs (Point, Color, Time) |
| Representing "optional" (nil = absent) | Value is always required |
| Sharing data between goroutines | Independent copies are fine |
| Satisfying an interface with pointer receivers | Immutable data types |

<Callout type="tip">

**When in doubt, use a pointer for structs.** The performance difference is negligible for small structs, but pointer semantics (modifiability, nil-ability) are usually what you want in application code. Use values for small, immutable types like `time.Time`, `netip.Addr`, or your own `Money` type.

</Callout>

## Key Takeaways

1. **`&` gets the address**, **`*` follows the address** — that's all there is to pointers
2. **Go is pass-by-value** — without pointers, functions work on copies
3. **Nil pointer dereference is the #1 panic** — always check before using `*ptr`
4. **Go auto-dereferences struct pointers** — `user.Name` works whether `user` is `User` or `*User`
5. **Stack is fast, heap needs GC** — returning pointers to locals moves them to the heap
6. **Use pointers for optionality** — `*float64` where nil means "not specified"
7. **Use pointers for large structs** — avoids copying kilobytes of data per function call

