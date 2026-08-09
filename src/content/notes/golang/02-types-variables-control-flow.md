---
title: 'Types, Variables ও Control Flow'
subtitle: 'Go-র type system সরল কিন্তু কড়া — বাস্তব কিছু বানানোর আগে বিল্ডিং ব্লকগুলো শিখে নিন।'
chapter: 2
level: 'beginner'
readingTime: '18 মিনিট'
topics: ['types', 'variables', 'constants', 'if/else', 'loops', 'switch']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা আল-ফিহরির রান্নাঘরে তাকের উপর সারি সারি কাচের বয়াম, প্রতিটার গায়ে স্পষ্ট লেবেল সাঁটা — একটায় লেখা "চিনি", পাশেরটায় "লবণ", তারপর "হলুদ", "মরিচ"। চিনির বয়ামে শুধু চিনিই থাকে, আর কিছু না। একদিন ইবনে সিনা রান্নায় হাত লাগাতে এসে ভুল করে লবণের চামচ চিনির বয়ামে ঢালতে গেল, ফাতিমা আল-ফিহরি সাথে সাথে হাত ধরে ফেলল — "এই বয়াম চিনির, এতে লবণ ঢোকানো যাবে না।" প্রতিটা বয়াম আগেই ঠিক করা কোন জিনিসের জন্য, আর সেটা বদলায় না।

রান্নার সময় ফাতিমা আল-ফিহরি রেসিপি ধরে ধরে এগোয়। "ঝোল যদি বেশি পাতলা হয়, আরেকটু জ্বাল দাও" — এটা একটা শর্ত। "যতক্ষণ না পেঁয়াজ সোনালি হয়, নাড়তে থাকো" — এটা একটা পুনরাবৃত্তি। আবার আজ কী রান্না হবে সেটার উপর নির্ভর করে ধাপ বদলায়: মাংস হলে এক পথ, মাছ হলে আরেক পথ, ডাল হলে অন্য পথ — যেটা মেলে সেই ধাপেই সে ঢোকে।

এই গল্পটাই আসলে Go-র বিল্ডিং ব্লক। লেবেল সাঁটা বয়াম হলো **static typing** — প্রতিটা variable আগেই ঠিক করা একটা type-এর মান ধরে রাখে (চিনির বয়াম মানে `string`, লবণের বয়াম মানে `int`), আর ভুল type ঢোকাতে গেলে compiler ফাতিমা আল-ফিহরির মতোই হাত ধরে ফেলে। বয়ামগুলো নিজেই হলো **variable**, আর রেসিপির শর্ত-পুনরাবৃত্তি-বাছাই হলো **control flow** — `if` দিয়ে শর্ত, `for` দিয়ে লুপ, `switch` দিয়ে অনেক পথের মধ্যে একটা বাছাই। বাস্তবেও ঠিক এ কারণেই Go-তে ভুল type-এর অনেক bug কোড চালানোর আগেই compile time-এ ধরা পড়ে, প্রোডাকশনে গিয়ে ক্র্যাশ করে না।

## Go-র Type Philosophy

Go **statically typed** — প্রতিটা variable-এর type compile time-এই জানা থাকে। কিন্তু Java বা C++-এর সাথে অমিল হলো, Go তার type system-কে ইচ্ছে করেই ছোট রাখে। কোনো generics-এর হুলুস্থুল নেই (Go 1.18 পর্যন্ত), কোনো type hierarchy নেই, কোনো operator overloading নেই।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Go-র type system অনেকটা একটা গোছানো টুলবক্সের মতো। প্রতিটা ড্রয়ারে লেবেল লাগানো। screwdriver-এর জায়গায় আপনি একটা wrench রাখতে পারবেন না। এটা কড়া, কিন্তু আপনি কখনো খুঁজতে সময় নষ্ট করেন না — আপনি সবসময় ঠিক জানেন কী নিয়ে কাজ করছেন।

</Callout>

## বেসিক Types

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

### Zero Values: Go-র ডিফল্ট Initialization

Go-তে, আপনি কোনো মান না দিলে প্রতিটা variable তার **zero value**-তে initialize হয়। কোনো `null` নেই, কোনো `undefined` নেই, কোনো এলোমেলো memory নেই।

```go
var count int      // 0
var total float64  // 0.0
var name string    // "" (empty string)
var active bool    // false
var data []byte    // nil (slices, maps, pointers, channels)
```

<Callout type="tip">

**Production-এ zero value কেন গুরুত্বপূর্ণ:**

Zero value একটা পুরো শ্রেণির bug মুছে দেয়। একটা `string` সবসময় ব্যবহার করা নিরাপদ — এটা `""`, `null` নয়। একটা `int` সবসময় `0`, এলোমেলো memory নয়। অনেক Go type এমনভাবে ডিজাইন করা যেন তাদের zero value কাজে লাগে: `sync.Mutex{}` একটা unlocked mutex, `bytes.Buffer{}` লেখার জন্য প্রস্তুত একটা খালি buffer।

</Callout>

## Variable ঘোষণা করা

Go আপনাকে variable ঘোষণার একাধিক উপায় দেয়, প্রতিটার নিজস্ব উদ্দেশ্য আছে:

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

**`:=` শুধু ফাংশনের ভেতরে কাজ করে।** package level-এ আপনাকে `var` ব্যবহার করতেই হবে। এটা ইচ্ছাকৃত — package-level variable স্পষ্ট আর explicit হওয়া উচিত।

</Callout>

## Constants

Constant compile time-এ হিসাব করা হয় আর কখনো বদলায় না:

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

**বাস্তব জীবনের উপমা**

`iota` অনেকটা বেকারিতে নম্বর দেওয়া টিকিটের মতো। প্রথম কাস্টমার পায় 0, পরেরজন পায় 1, এভাবে চলতে থাকে। কিন্তু bit shifting দিয়ে, প্রতিটা টিকিট 2-এর আলাদা একটা power প্রকাশ করে — অনেকটা আলাদা আলাদা on/off সুইচের মতো যেগুলো একসাথে মেলানো যায়।

</Callout>

## Type Conversions

Go-তে **কোনো implicit type conversion নেই**। আপনাকে explicit হতে হবে:

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

**`if err != nil` প্যাটার্ন** হলো Go-র সবচেয়ে সাধারণ idiom। যেকোনো Go কোডবেসে আপনি এটা শত শতবার দেখবেন। Initialization ফর্মটা (`if err := ...; err != nil`) error variable-কে যেখানে হ্যান্ডল করা হচ্ছে সেখানেই scope-এ রাখে, ভুলে আবার ব্যবহার করা ঠেকায়।

</Callout>

## For Loop (একমাত্র Loop)

Go-তে **একটাই** loop keyword: `for`। এটা অন্য ভাষার `while`, `do-while`, আর `for`-এর কাজ করে।

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

Go-র `switch` বেশিরভাগ ভাষার চেয়ে পরিষ্কার — কোনো `break` লাগে না, আর এটা expression-ও match করতে পারে:

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

**বাস্তব জীবনের উপমা**

কন্ডিশন ছাড়া Go-র switch অনেকটা একজন bouncer-এর মতো, যে উপর থেকে নিচে নিয়মের একটা লিস্ট চেক করে: "আপনি কি VIP লিস্টে আছেন? না। আপনার বয়স কি 21-এর বেশি? না। আপনার কি টিকিট আছে? হ্যাঁ — ভেতরে আসুন।" প্রথম যেটা মেলে সেটাই জেতে।

</Callout>

## Slices: Go-র Dynamic Array

Go-তে array-র সাইজ fixed। বাস্তবে আপনি প্রায় সবসময়ই **slice** ব্যবহার করেন — dynamic, flexible, array-র উপর একটা view।

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

## Maps: Key-Value স্টোরেজ

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

**Map concurrent ব্যবহারের জন্য নিরাপদ নয়।** একাধিক goroutine যদি একই map-এ read আর write করে, আপনার প্রোগ্রাম একটা fatal error দিয়ে ক্র্যাশ করবে। Concurrent কোডে `sync.Map` ব্যবহার করুন অথবা একটা `sync.RWMutex` দিয়ে protect করুন।

</Callout>

## মূল যেসব শিখলেন

1. **Zero value null bug মুছে দেয়** — প্রতিটা type-এর একটা নিরাপদ ডিফল্ট আছে (`0`, `""`, `false`, `nil`)
2. **short declaration-এ `:=`** ফাংশনের ভেতরে, package level-এ `var`
3. **`for`-ই একমাত্র loop** — এটা classic, while, infinite, আর range iteration সবই কভার করে
4. **Switch ডিফল্টভাবে fall through করে না** — কোনো `break` লাগে না, প্রতি case-এ একাধিক value
5. **Array-র চেয়ে slice** — pre-allocation-এর জন্য `make`, বড় করার জন্য `append`
6. **Map-এ comma-ok idiom লাগে** — "not found" আর "zero value"-এর ফারাক বোঝাতে `v, ok := m[key]`
7. **কোনো implicit type conversion নেই** — `float64(myInt)` লাগবেই, Go আপনার হয়ে অনুমান করবে না
