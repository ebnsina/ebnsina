---
title: 'Types, Variables & Control Flow'
subtitle: "Go's type system is simple but strict — learn the building blocks before you build anything real."
chapter: 2
level: 'beginner'
readingTime: '18 min'
topics: ['types', 'variables', 'constants', 'if/else', 'loops', 'switch']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Go's Type Philosophy

Go is **statically typed** — every variable has a type known at compile time. But unlike Java or C++, Go keeps its type system deliberately small. No generics chaos (until Go 1.18), no type hierarchies, no operator overloading.

<Callout type="info">

**Real-World Analogy**

Go's type system is like a well-organized toolbox. Every drawer is labeled. You can't put a wrench in the screwdriver slot. It's restrictive, but you never waste time searching — you always know exactly what you're working with.

</Callout>

## Basic Types

```go
package main

import "fmt"

func main() {
    // Integers
    var age int = 30          // Platform-dependent size (usually 64-bit)
    var port int16 = 8080     // Explicitly 16-bit
    var userCount int64 = 1_000_000  // Underscores for readability

    // Floating point
    var price float64 = 29.99
    var pi float32 = 3.14

    // Boolean
    var isActive bool = true

    // String (immutable, UTF-8 encoded)
    var name string = "Gopher"

    // Byte and Rune
    var initial byte = 'G'    // alias for uint8
    var emoji rune = '🚀'     // alias for int32 (Unicode code point)

    fmt.Println(age, port, userCount, price, pi, isActive, name, initial, emoji)
}
```

### Zero Values: Go's Default Initialization

In Go, every variable is initialized to its **zero value** if you don't assign one. No `null`, no `undefined`, no garbage memory.

```go
var count int      // 0
var total float64  // 0.0
var name string    // "" (empty string)
var active bool    // false
var data []byte    // nil (slices, maps, pointers, channels)
```

<Callout type="tip">

**Why zero values matter in production:**

Zero values eliminate an entire class of bugs. A `string` is always safe to use — it's `""`, not `null`. An `int` is always `0`, not random memory. Many Go types are designed so their zero value is useful: `sync.Mutex{}` is an unlocked mutex, `bytes.Buffer{}` is an empty buffer ready to write.

</Callout>

## Declaring Variables

Go gives you multiple ways to declare variables, each with a purpose:

```go
// 1. Full declaration (rarely used — verbose)
var name string = "Fatima"

// 2. Type inference (Go figures out the type)
var name = "Fatima"  // inferred as string

// 3. Short declaration (most common inside functions)
name := "Fatima"     // := declares AND assigns

// 4. Multiple declarations
x, y := 10, 20
first, last := "Ahmad", "al-Razi"

// 5. Block declaration (for package-level vars)
var (
    host     = "localhost"
    port     = 8080
    maxRetry = 3
)
```

<Callout type="warning">

**`:=` only works inside functions.** At the package level, you must use `var`. This is intentional — package-level variables should be obvious and explicit.

</Callout>

## Constants

Constants are computed at compile time and never change:

```go
const maxConnections = 100
const apiVersion = "v2"
const pi = 3.14159265358979

// Typed vs untyped constants
const typedMax int64 = 100        // Can only be used as int64
const untypedMax = 100            // Can be used as any numeric type

// iota: auto-incrementing constants (enums)
type Role int

const (
    Admin    Role = iota  // 0
    Editor                // 1
    Viewer                // 2
)

// iota with bit shifting (permissions)
type Permission int

const (
    Read    Permission = 1 << iota  // 1  (binary: 001)
    Write                           // 2  (binary: 010)
    Execute                         // 4  (binary: 100)
)

// Combine permissions with bitwise OR
userPerms := Read | Write  // 3 (binary: 011)
```

<Callout type="info">

**Real-World Analogy**

`iota` is like numbered tickets at a bakery. The first customer gets 0, the next gets 1, and so on. But with bit shifting, each ticket represents a different power of 2 — like having separate on/off switches that can be combined.

</Callout>

## Type Conversions

Go has **no implicit type conversions**. You must be explicit:

```go
var i int = 42
var f float64 = float64(i)    // Must convert explicitly
var u uint = uint(f)          // Must convert explicitly

// String conversions
import "strconv"

numStr := strconv.Itoa(42)           // int → string: "42"
num, err := strconv.Atoi("42")       // string → int: 42
price, err := strconv.ParseFloat("29.99", 64)  // string → float64

// This does NOT work the way you might expect:
s := string(65)  // "A" (treats 65 as a rune/Unicode code point, NOT "65")
```

## If/Else

```go
// Standard if/else
if age >= 18 {
    fmt.Println("Adult")
} else if age >= 13 {
    fmt.Println("Teenager")
} else {
    fmt.Println("Child")
}

// If with initialization statement (idiomatic Go)
if err := doSomething(); err != nil {
    // err is only in scope inside this if block
    fmt.Println("Error:", err)
}
// err doesn't exist here — keeps scope tight
```

<Callout type="tip">

**The `if err != nil` pattern** is Go's most common idiom. You'll see it hundreds of times in any Go codebase. The initialization form (`if err := ...; err != nil`) keeps the error variable scoped to where it's handled, preventing accidental reuse.

</Callout>

## For Loops (The Only Loop)

Go has **one** loop keyword: `for`. It replaces `while`, `do-while`, and `for` from other languages.

```go
// Classic for loop
for i := 0; i < 10; i++ {
    fmt.Println(i)
}

// While-style loop
count := 0
for count < 10 {
    count++
}

// Infinite loop
for {
    // runs forever until break or return
    if shouldStop() {
        break
    }
}

// Range over slice
fruits := []string{"apple", "banana", "cherry"}
for index, value := range fruits {
    fmt.Printf("%d: %s\n", index, value)
}

// Range over map
ages := map[string]int{"Fatima": 30, "Omar": 25}
for name, age := range ages {
    fmt.Printf("%s is %d\n", name, age)
}

// Skip index or value with _
for _, fruit := range fruits {
    fmt.Println(fruit)  // don't need the index
}

// Range over string (iterates runes, not bytes)
for i, ch := range "Hello 🌍" {
    fmt.Printf("byte %d: %c\n", i, ch)
}
```

## Switch

Go's `switch` is cleaner than most languages — no `break` needed, and it can match expressions:

```go
// Basic switch (no break needed — Go doesn't fall through by default)
switch day {
case "Monday":
    fmt.Println("Start of the week")
case "Friday":
    fmt.Println("Almost weekend")
case "Saturday", "Sunday":  // Multiple values
    fmt.Println("Weekend!")
default:
    fmt.Println("Midweek")
}

// Switch with no condition (cleaner than if/else chains)
switch {
case temperature > 35:
    fmt.Println("Too hot")
case temperature > 20:
    fmt.Println("Nice")
case temperature > 0:
    fmt.Println("Cold")
default:
    fmt.Println("Freezing")
}

// Type switch (used with interfaces)
switch v := value.(type) {
case int:
    fmt.Printf("Integer: %d\n", v)
case string:
    fmt.Printf("String: %s\n", v)
case bool:
    fmt.Printf("Boolean: %t\n", v)
default:
    fmt.Printf("Unknown type: %T\n", v)
}
```

<Callout type="info">

**Real-World Analogy**

Go's switch without a condition is like a bouncer checking a list of rules from top to bottom: "Are you on the VIP list? No. Are you over 21? No. Do you have a ticket? Yes — come in." The first matching rule wins.

</Callout>

## Slices: Go's Dynamic Arrays

Arrays in Go have a fixed size. In practice, you almost always use **slices** — dynamic, flexible views over arrays.

```go
// Creating slices
nums := []int{1, 2, 3, 4, 5}           // Slice literal
names := make([]string, 0, 10)          // Empty slice with capacity 10

// Appending (creates a new underlying array if capacity exceeded)
nums = append(nums, 6, 7)
names = append(names, "Fatima", "Omar")

// Slicing (half-open interval: includes start, excludes end)
first3 := nums[0:3]   // [1, 2, 3]
last2 := nums[len(nums)-2:]  // [6, 7]

// Length vs Capacity
fmt.Println(len(nums))  // 7 (current elements)
fmt.Println(cap(nums))  // depends on growth strategy
```

## Maps: Key-Value Storage

```go
// Creating maps
ages := map[string]int{
    "Fatima": 30,
    "Omar":   25,
}

// Or with make
scores := make(map[string]int)
scores["math"] = 95
scores["physics"] = 88

// Reading (returns zero value if key doesn't exist)
age := ages["Fatima"]       // 30
unknown := ages["Yusuf"] // 0 (zero value for int)

// Check if key exists (comma ok idiom)
age, exists := ages["Yusuf"]
if !exists {
    fmt.Println("Yusuf not found")
}

// Delete
delete(ages, "Omar")

// Iterate (order is NOT guaranteed)
for name, age := range ages {
    fmt.Printf("%s: %d\n", name, age)
}
```

<Callout type="warning">

**Maps are not safe for concurrent use.** If multiple goroutines read and write to the same map, your program will crash with a fatal error. Use `sync.Map` or protect with a `sync.RWMutex` in concurrent code.

</Callout>

## Key Takeaways

1. **Zero values eliminate null bugs** — every type has a safe default (`0`, `""`, `false`, `nil`)
2. **`:=` for short declarations** inside functions, `var` for package level
3. **`for` is the only loop** — it covers classic, while, infinite, and range iteration
4. **Switch doesn't fall through** by default — no `break` needed, multiple values per case
5. **Slices over arrays** — use `make` for pre-allocation, `append` for growing
6. **Maps need the comma-ok idiom** — `v, ok := m[key]` to distinguish "not found" from "zero value"
7. **No implicit type conversions** — `float64(myInt)` is required, Go won't guess for you
