---
title: 'Pointers ও Memory'
subtitle: 'Pointer আপনাকে ডেটা কপি না করেই শেয়ার করতে দেয় — একবার বুঝে নিলে & আর * নিয়ে আর কখনো ধন্দে পড়বেন না।'
chapter: 4
level: 'beginner'
readingTime: '16 মিনিট'
topics: ['pointers', 'memory', 'stack', 'heap', 'nil', 'pass by value']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Pointer কী?

একটা pointer হলো এমন একটা variable যা আরেকটা variable-এর **memory address** ধরে রাখে। মানটা নিজে ধরে রাখার বদলে, এটা মানটা যেখানে আছে সেখানকার দিকনির্দেশনা ধরে রাখে।

```go
name := "Fatima"     // A string variable
ptr := &name        // A pointer to that string (&name = "address of name")

fmt.Println(name)   // "Fatima"  — the value
fmt.Println(ptr)    // 0xc0000b4000 — the memory address
fmt.Println(*ptr)   // "Fatima"  — dereferencing: follow the address to get the value
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা pointer অনেকটা কাগজে লেখা একটা বাড়ির ঠিকানার মতো। কাগজটায় বাড়ি নেই — এতে বাড়িটা যেখানে আছে সেই ঠিকানা আছে। `&name` আপনাকে ঠিকানা দেয়। `*ptr` অনেকটা সেই ঠিকানায় গাড়ি চালিয়ে গিয়ে বাড়িটা দেখার মতো। একাধিক মানুষের কাছে একই ঠিকানা লেখা থাকতে পারে, আর তারা সবাই একই বাড়িটাই দেখবে।

</Callout>

## Pointer কেন আছে

Go সবকিছু **by value** পাস করে — function argument সবসময় copy। Pointer ছাড়া আপনি মূল ডেটা পরিবর্তন করতে পারবেন না:

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

## দুটি Operator

| Operator | নাম         | কী করে                                | উদাহরণ          |
| -------- | ----------- | ------------------------------------- | --------------- |
| `&`      | Address-of  | একটা variable-এর memory address নেয়  | `ptr := &name`  |
| `*`      | Dereference | value পেতে/সেট করতে pointer ধরে এগোয় | `value := *ptr` |

```go
x := 42
p := &x       // p is *int (pointer to int)

fmt.Println(p)   // 0xc0000b4008 (memory address)
fmt.Println(*p)  // 42 (value at that address)

*p = 100         // Change the value through the pointer
fmt.Println(x)   // 100 — x changed because p points to x
```

## Pointer Types

`*T` type-এর মানে "T type-এর একটা value-র দিকে pointer":

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

একটা pointer-এর zero value হলো `nil`। একটা nil pointer dereference করলে **panic** (crash) হয়:

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

**Nil pointer dereference হলো Go-র সবচেয়ে সাধারণ runtime panic।** `*ptr` ব্যবহারের আগে একটা pointer nil হতে পারে কিনা সবসময় চেক করুন। struct field, function return, আর interface value-র ক্ষেত্রে এটা বিশেষভাবে গুরুত্বপূর্ণ।

</Callout>

## Pointer এবং Structs

এখানেই বাস্তব Go কোডে pointer অপরিহার্য হয়ে ওঠে:

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

**বাস্তব জীবনের উপমা**

একটা struct-কে by value পাস করা অনেকটা একটা নথির ফটোকপি করে কপিটা হাতে দেওয়ার মতো — কপিতে করা এডিট মূলটায় প্রভাব ফেলে না। একটা pointer পাস করা অনেকটা একটা Google Doc-এর লিংক শেয়ার করার মতো — লিংক থাকা সবাই একই নথি এডিট করে।

</Callout>

### Automatic Dereferencing

Go struct pointer access সহজ করে দেয় — আপনার `(*ptr).Field` লাগে না:

```go
user := &User{Name: "Fatima"}

// These are equivalent:
fmt.Println((*user).Name)  // Explicit dereference
fmt.Println(user.Name)     // Go does it automatically
```

## Stack বনাম Heap

Go automatically memory ম্যানেজ করে, কিন্তু ডেটা কোথায় থাকে সেটা বোঝা দ্রুততর কোড লিখতে সাহায্য করে:

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

**বাস্তব জীবনের উপমা**

**Stack** = অফিসে আপনার ডেস্ক। জিনিস রাখা আর তোলা দ্রুত, কিন্তু আপনি দিন শেষে চলে গেলে (function return) আপনার ডেস্ক পরিষ্কার হয়ে যায়। **Heap** = কোম্পানির স্টোরেজ রুম। কারো কাছে চাবি (pointer) থাকা পর্যন্ত জিনিস সেখানে থাকে। ঝাড়ুদার (garbage collector) মাঝেমধ্যে দেখে কোন জিনিসের দিকে আর কোনো চাবি তাক করা নেই আর সেগুলো পরিষ্কার করে।

</Callout>

### Escape Analysis

Go-র compiler ঠিক করে stack-এ নাকি heap-এ allocate করবে। আপনি তার সিদ্ধান্তগুলো দেখতে পারেন:

```bash
go build -gcflags="-m" ./...
# ./main.go:10:2: x escapes to heap
# ./main.go:15:2: y does not escape
```

**মূলনীতি:**

- আপনি যদি একটা local variable-এর দিকে pointer return করেন, তা heap-এ escape করে
- আপনি যদি একটা দীর্ঘস্থায়ী struct-এ একটা pointer store করেন, তা escape করে
- একটা variable যদি stack-এর জন্য বড্ড বড় হয়, তা heap-এ যায়
- Stack allocation প্রায় ফ্রি; heap allocation-এ GC জড়িত

## সাধারণ Patterns

### Optional Values

Go-তে `Optional` বা `Maybe` নেই। Pointer এই উদ্দেশ্য পূরণ করে:

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

### বড় Copy এড়ানো

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

## কখন Pointer বনাম Value ব্যবহার করবেন

| Pointer `*T` ব্যবহার করুন                      | Value `T` ব্যবহার করুন          |
| ---------------------------------------------- | ------------------------------- |
| মূলটা পরিবর্তন করা দরকার                       | Read-only access                |
| Struct বড় (>64 bytes)                         | ছোট struct (Point, Color, Time) |
| "optional" প্রকাশ করা (nil = অনুপস্থিত)        | Value সবসময় দরকার              |
| goroutine-এর মধ্যে ডেটা শেয়ার করা             | স্বাধীন copy ঠিক আছে            |
| pointer receiver দিয়ে একটা interface পূরণ করা | Immutable data type             |

<Callout type="tip">

**সন্দেহ হলে, struct-এর জন্য pointer ব্যবহার করুন।** ছোট struct-এর জন্য performance-এর পার্থক্য নগণ্য, কিন্তু pointer semantics (পরিবর্তনযোগ্যতা, nil হওয়ার সম্ভাবনা) সাধারণত application কোডে আপনি যা চান তা-ই। ছোট, immutable type যেমন `time.Time`, `netip.Addr`, বা আপনার নিজের `Money` type-এর জন্য value ব্যবহার করুন।

</Callout>

## মূল যেসব শিখলেন

1. **`&` address নেয়**, **`*` address ধরে এগোয়** — pointer-এর ব্যাপার এটুকুই
2. **Go pass-by-value** — pointer ছাড়া function copy নিয়ে কাজ করে
3. **Nil pointer dereference হলো #1 panic** — `*ptr` ব্যবহারের আগে সবসময় চেক করুন
4. **Go struct pointer auto-dereference করে** — `user` `User` হোক বা `*User`, `user.Name` কাজ করে
5. **Stack দ্রুত, heap-এ GC লাগে** — local-এর দিকে pointer return করলে সেগুলো heap-এ চলে যায়
6. **Optionality-র জন্য pointer ব্যবহার করুন** — `*float64` যেখানে nil মানে "specified নয়"
7. **বড় struct-এর জন্য pointer ব্যবহার করুন** — প্রতি function কল-এ কিলোবাইট ডেটা copy করা এড়ায়
