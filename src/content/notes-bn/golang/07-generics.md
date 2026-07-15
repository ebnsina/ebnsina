---
title: 'Generics'
subtitle: 'যেকোনো type-এর সাথে কাজ করে এমন কোড লিখুন — Go 1.18-এর সবচেয়ে বড় feature type safety না হারিয়েই boilerplate মুছে দেয়।'
chapter: 7
level: 'intermediate'
readingTime: '18 মিনিট'
topics: ['generics', 'type parameters', 'constraints', 'type inference']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতেমার একটা ছোট বেকারি-কাম-হস্তশিল্পের দোকান। ঈদের সময় সে বিস্কুট বানায়, শীতে বাচ্চাদের জন্য মাটির খেলনা গড়ে, আবার একটা কর্নারে হাতে বানানো সাবানও বিক্রি করে। মজার ব্যাপার হলো — তিন জিনিসের নকশা একই: তারার আকৃতি। আগে সে ভাবত প্রতিটা জিনিসের জন্য আলাদা তারা-ছাঁচ লাগবে, একটা বিস্কুটের জন্য, একটা মাটির খেলনার জন্য, আরেকটা সাবানের জন্য। তিনটে আলাদা ছাঁচ কেনা, তিনটে জায়গায় রাখা, একটা ভাঙলে আবার ঠিক ওই মাপেরটা খুঁজে আনা — খুব ঝামেলা।

তারপর করিম, ফাতেমার কারিগর, একটা মজবুত ধাতুর তারা-ছাঁচ বানিয়ে দিল। এখন ফাতেমা যা-ই চাপ দিক না কেন — বিস্কুটের কাঁচা খামির, নরম মাটি, বা গলানো সাবান — একই ছাঁচ চেপে ঠিক একই তারার আকৃতি বেরিয়ে আসে। ছাঁচটা কিন্তু যেকোনো জিনিস নেয় না; যা চাপা যায়, ছাঁচে ধরে এমন উপাদানই নেয়। ফলে ফল সবসময় নিখুঁত তারা — কোনোবার বেঢপ কিছু বেরোয় না।

এই এক ছাঁচ-বহু-উপাদানের গল্পটাই আসলে **generics**। ছাঁচ হলো একটা generic function, আর যে উপাদানটা চাপছেন সেটাই **type parameter** — একই function বিস্কুট (int), মাটি (string), সাবান (struct) সব type-এই কাজ করে, প্রতিটার জন্য আলাদা function লিখতে হয় না (duplication বাদ)। আবার ছাঁচ যেমন যা-খুশি নেয় না, তেমনি constraint দিয়ে ঠিক করে দেওয়া হয় কোন type গুলো চলবে — তাই ফল সবসময় সঠিক আকৃতি, মানে **type safety** বজায় থাকে। বাস্তবে Go-র `slices.Sort` বা `Contains` ঠিক এভাবেই একটাই function হয়ে int, string, float — সব slice-এ কাজ করে, compile-time-এ টাইপ ঠিক আছে কিনা যাচাই করেই।

## Generics যে সমস্যার সমাধান করে

Generics-এর আগে (Go 1.18), reusable কোড লেখার জন্য আপনার হাতে দুটো বাজে অপশন ছিল:

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

**বাস্তব জীবনের উপমা**

Generics অনেকটা একটা universal adapter প্লাগের মতো। Generics ছাড়া, প্রতিটা দেশের জন্য আপনার আলাদা adapter লাগে (প্রতি type-এ একটা function)। Generics দিয়ে, আপনার একটা adapter আছে যা সব জায়গায় কাজ করে — কিন্তু এটা এখনও নিয়মটা enforce করে যে "প্লাগের আকার ঠিক থাকতে হবে" (type constraint)।

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

### একাধিক Type Parameter

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

## Constraints: Type Parameter সীমিত করা

Constraint সংজ্ঞায়িত করে একটা type parameter কোন operation সমর্থন করে:

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

Generics শুধু function-এর জন্য নয় — আপনি generic struct-ও তৈরি করতে পারেন:

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

যেসব function fail করতে পারে তাদের জন্য একটা সাধারণ প্যাটার্ন:

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

## বাস্তব জীবনের Generic Utility

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

## কখন Generics ব্যবহার করবেন না

<Callout type="warning">

**শুধু পারেন বলেই generics ব্যবহার করবেন না।** Go টিমের গাইডলাইন: আপনি যদি একই কোড ভিন্ন type নিয়ে তিনবার লিখছেন, তাহলে generics বিবেচনা করুন। একবার বা দুবার হলে, শুধু concrete version-ই লিখুন।

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

## `slices` এবং `maps` Standard Library

Go 1.21+ generic utility package যোগ করেছে:

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

## মূল যেসব শিখলেন

1. **Generics type-নির্দিষ্ট boilerplate মুছে দেয়** — একটা `Contains[T]` `ContainsInt`, `ContainsString` ইত্যাদির জায়গা নেয়
2. **সমতার জন্য `comparable`**, **ক্রমের জন্য `cmp.Ordered`** — ঠিক constraint ব্যবহার করুন
3. **Custom constraint হলো interface** type union সহ (`int | float64 | string`)
4. **Generic struct** data structure-এর জন্য শক্তিশালী — `Stack[T]`, `Cache[K, V]`, `Result[T]`
5. **`slices` আর `maps` package ব্যবহার করুন** — standard library-তে ইতিমধ্যেই সাধারণ generic utility আছে
6. **Generics-এর অতিরিক্ত ব্যবহার করবেন না** — concrete type বা interface কাজ করলে, সেটাই বেছে নিন। Generics data structure আর utility-র জন্য, business logic-এর জন্য নয়
