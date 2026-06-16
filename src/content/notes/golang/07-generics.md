---
title: "Generics"
subtitle: "Write code that works with any type — Go 1.18's biggest feature eliminates boilerplate without sacrificing type safety."
chapter: 7
level: "intermediate"
readingTime: "18 min"
topics: ["generics", "type parameters", "constraints", "type inference"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Problem Generics Solve

Before generics (Go 1.18), you had two bad options for writing reusable code:

```go
// Option 1: Write the same function for every type (boilerplate)
func ContainsInt(slice []int, target int) bool {
    for _, v := range slice {
        if v == target { return true }
    }
    return false
}

func ContainsString(slice []string, target string) bool {
    for _, v := range slice {
        if v == target { return true }
    }
    return false
}
// Repeat for float64, bool, uint, ...

// Option 2: Use interface{} and lose type safety
func Contains(slice []interface{}, target interface{}) bool {
    for _, v := range slice {
        if v == target { return true }
    }
    return false
}
// No compile-time checks — can compare apples to oranges
```

<Callout type="info">

**Real-World Analogy**

Generics are like a universal adapter plug. Without generics, you need a different adapter for every country (function per type). With generics, you have one adapter that works everywhere — but it still enforces the rule that "the plug must be the right shape" (type constraints).

</Callout>

## Generic Functions

```go
// T is a type parameter — the caller decides what type T is
func Contains[T comparable](slice []T, target T) bool {
    for _, v := range slice {
        if v == target {
            return true
        }
    }
    return false
}

// Usage — Go infers T from the arguments
Contains([]int{1, 2, 3}, 2)           // T = int, returns true
Contains([]string{"a", "b"}, "c")     // T = string, returns false

// Explicit type parameter (rarely needed)
Contains[float64]([]float64{1.1, 2.2}, 2.2)
```

### Multiple Type Parameters

```go
func Map[T any, R any](slice []T, fn func(T) R) []R {
    result := make([]R, len(slice))
    for i, v := range slice {
        result[i] = fn(v)
    }
    return result
}

// Convert []int to []string
names := Map([]int{1, 2, 3}, func(n int) string {
    return fmt.Sprintf("Item #%d", n)
})
// ["Item #1", "Item #2", "Item #3"]

// Extract field from structs
emails := Map(users, func(u User) string {
    return u.Email
})
```

## Constraints: Limiting Type Parameters

Constraints define what operations a type parameter supports:

```go
// Built-in constraints
// comparable — supports == and != (most types except slices, maps, functions)
// any        — no restrictions (alias for interface{})

// The constraints package (golang.org/x/exp/constraints or cmp)
import "cmp"

// cmp.Ordered — supports <, >, <=, >= (int, float, string)
func Min[T cmp.Ordered](a, b T) T {
    if a < b {
        return a
    }
    return b
}

Min(3, 7)         // 3
Min("abc", "xyz") // "abc"
Min(3.14, 2.71)   // 2.71
```

### Custom Constraints

```go
// A constraint is just an interface
type Number interface {
    int | int8 | int16 | int32 | int64 |
    float32 | float64
}

func Sum[T Number](nums []T) T {
    var total T
    for _, n := range nums {
        total += n
    }
    return total
}

Sum([]int{1, 2, 3})         // 6
Sum([]float64{1.1, 2.2})    // 3.3

// Constraint with methods
type Stringer interface {
    String() string
}

func JoinStrings[T Stringer](items []T, sep string) string {
    var sb strings.Builder
    for i, item := range items {
        if i > 0 {
            sb.WriteString(sep)
        }
        sb.WriteString(item.String())
    }
    return sb.String()
}

// Combining type sets and methods
type OrderedStringer interface {
    cmp.Ordered
    String() string
}
```

## Generic Types

Generics aren't just for functions — you can create generic structs:

```go
// Generic stack
type Stack[T any] struct {
    items []T
}

func (s *Stack[T]) Push(item T) {
    s.items = append(s.items, item)
}

func (s *Stack[T]) Pop() (T, bool) {
    if len(s.items) == 0 {
        var zero T
        return zero, false
    }
    item := s.items[len(s.items)-1]
    s.items = s.items[:len(s.items)-1]
    return item, true
}

func (s *Stack[T]) Peek() (T, bool) {
    if len(s.items) == 0 {
        var zero T
        return zero, false
    }
    return s.items[len(s.items)-1], true
}

func (s *Stack[T]) Len() int {
    return len(s.items)
}

// Usage
intStack := &Stack[int]{}
intStack.Push(1)
intStack.Push(2)
val, _ := intStack.Pop()  // 2

strStack := &Stack[string]{}
strStack.Push("hello")
```

### Generic Result Type

A common pattern for functions that might fail:

```go
type Result[T any] struct {
    Value T
    Err   error
}

func NewResult[T any](val T, err error) Result[T] {
    return Result[T]{Value: val, Err: err}
}

func (r Result[T]) Unwrap() (T, error) {
    return r.Value, r.Err
}

// Useful for channel-based concurrency
func fetchAsync[T any](ctx context.Context, fn func() (T, error)) <-chan Result[T] {
    ch := make(chan Result[T], 1)
    go func() {
        val, err := fn()
        ch <- NewResult(val, err)
    }()
    return ch
}

result := <-fetchAsync(ctx, func() (User, error) {
    return userService.GetByID(ctx, 42)
})
user, err := result.Unwrap()
```

## Real-World Generic Utilities

### Filter, Reduce, Find

```go
func Filter[T any](slice []T, predicate func(T) bool) []T {
    result := make([]T, 0)
    for _, v := range slice {
        if predicate(v) {
            result = append(result, v)
        }
    }
    return result
}

func Reduce[T any, R any](slice []T, initial R, fn func(R, T) R) R {
    result := initial
    for _, v := range slice {
        result = fn(result, v)
    }
    return result
}

func Find[T any](slice []T, predicate func(T) bool) (T, bool) {
    for _, v := range slice {
        if predicate(v) {
            return v, true
        }
    }
    var zero T
    return zero, false
}

// Usage
activeUsers := Filter(users, func(u User) bool {
    return u.IsActive
})

totalAge := Reduce(users, 0, func(sum int, u User) int {
    return sum + u.Age
})

admin, found := Find(users, func(u User) bool {
    return u.Role == "admin"
})
```

### Generic Cache

```go
type Cache[K comparable, V any] struct {
    mu    sync.RWMutex
    items map[K]cacheEntry[V]
    ttl   time.Duration
}

type cacheEntry[V any] struct {
    value     V
    expiresAt time.Time
}

func NewCache[K comparable, V any](ttl time.Duration) *Cache[K, V] {
    return &Cache[K, V]{
        items: make(map[K]cacheEntry[V]),
        ttl:   ttl,
    }
}

func (c *Cache[K, V]) Get(key K) (V, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()

    entry, ok := c.items[key]
    if !ok || time.Now().After(entry.expiresAt) {
        var zero V
        return zero, false
    }
    return entry.value, true
}

func (c *Cache[K, V]) Set(key K, value V) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.items[key] = cacheEntry[V]{
        value:     value,
        expiresAt: time.Now().Add(c.ttl),
    }
}

// Type-safe caches
userCache := NewCache[int, *User](5 * time.Minute)
userCache.Set(1, &User{Name: "Fatima"})

configCache := NewCache[string, string](1 * time.Hour)
configCache.Set("theme", "dark")
```

## When NOT to Use Generics

<Callout type="warning">

**Don't use generics just because you can.** The Go team's guidance: if you're writing the same code three times with different types, consider generics. If it's once or twice, just write the concrete version.

</Callout>

```go
// DON'T: Generics where a concrete type is fine
func PrintUser[T User](u T) { ... }  // Just use User directly

// DON'T: Generics where an interface works better
func Process[T interface{ Validate() error }](item T) error {
    return item.Validate()
}
// Better as:
func Process(item Validator) error {
    return item.Validate()
}

// DO: Generics for data structures and utility functions
type Set[T comparable] struct { ... }
func Map[T, R any](slice []T, fn func(T) R) []R { ... }
func Keys[K comparable, V any](m map[K]V) []K { ... }
```

## The `slices` and `maps` Standard Library

Go 1.21+ added generic utility packages:

```go
import (
    "slices"
    "maps"
)

// slices package
nums := []int{3, 1, 4, 1, 5, 9}
slices.Sort(nums)                           // [1, 1, 3, 4, 5, 9]
slices.Contains(nums, 4)                    // true
idx := slices.Index(nums, 5)               // 4
slices.Reverse(nums)                        // [9, 5, 4, 3, 1, 1]
compact := slices.Compact([]int{1,1,2,2,3}) // [1, 2, 3]

// maps package
m := map[string]int{"a": 1, "b": 2, "c": 3}
keys := maps.Keys(m)       // ["a", "b", "c"] (unordered)
values := maps.Values(m)   // [1, 2, 3] (unordered)
maps.DeleteFunc(m, func(k string, v int) bool {
    return v < 2
})
// m = {"b": 2, "c": 3}
```

## Key Takeaways

1. **Generics eliminate type-specific boilerplate** — one `Contains[T]` replaces `ContainsInt`, `ContainsString`, etc.
2. **`comparable` for equality**, **`cmp.Ordered` for ordering** — use the right constraint
3. **Custom constraints are interfaces** with type unions (`int | float64 | string`)
4. **Generic structs** are powerful for data structures — `Stack[T]`, `Cache[K, V]`, `Result[T]`
5. **Use `slices` and `maps` packages** — standard library already has common generic utilities
6. **Don't overuse generics** — if a concrete type or interface works, prefer that. Generics are for data structures and utilities, not business logic

