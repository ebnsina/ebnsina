---
title: "Strings, Runes & Encoding"
subtitle: "Go strings are UTF-8 byte slices — knowing this prevents an entire class of bugs when handling international text, emojis, and binary data."
chapter: 9
level: "intermediate"
readingTime: "15 min"
topics: ["strings", "runes", "UTF-8", "encoding", "bytes", "text processing"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Strings Are Byte Slices

In Go, a string is a **read-only slice of bytes**. Not characters, not runes — bytes.

```go
s := "Hello"
fmt.Println(len(s))    // 5 (bytes, not characters)
fmt.Println(s[0])      // 72 (byte value of 'H')
fmt.Println(string(s[0]))  // "H"

// UTF-8 multi-byte characters
s = "Hello 🌍"
fmt.Println(len(s))    // 10 (NOT 7!) — 🌍 is 4 bytes in UTF-8
```

<Callout type="info">

**Real-World Analogy**

A Go string is like a filmstrip. Each frame (byte) is one piece. Simple ASCII characters use one frame each. But complex characters (Chinese, Arabic, emojis) use 2-4 frames. `len()` counts frames, not pictures. To count pictures, you need to decode the filmstrip.

</Callout>

## Runes: Unicode Code Points

A `rune` is Go's name for a Unicode code point — an `int32` that represents a single character:

```go
s := "Hello 🌍"

// Iterating by BYTES — wrong for multi-byte characters
for i := 0; i < len(s); i++ {
    fmt.Printf("%d: %x\n", i, s[i])  // Shows raw bytes
}

// Iterating by RUNES — correct for characters
for i, r := range s {
    fmt.Printf("byte %d: %c (U+%04X)\n", i, r, r)
}
// byte 0: H (U+0048)
// byte 1: e (U+0065)
// byte 2: l (U+006C)
// byte 3: l (U+006C)
// byte 4: o (U+006F)
// byte 5:   (U+0020)
// byte 6: 🌍 (U+1F30D)  — starts at byte 6, spans 4 bytes

// Correct character count
fmt.Println(utf8.RuneCountInString(s))  // 7 (not 10)
```

## Common String Operations

```go
import "strings"

s := "Hello, World!"

strings.Contains(s, "World")        // true
strings.HasPrefix(s, "Hello")       // true
strings.HasSuffix(s, "!")           // true
strings.ToUpper(s)                  // "HELLO, WORLD!"
strings.ToLower(s)                  // "hello, world!"
strings.TrimSpace("  hello  ")      // "hello"
strings.Split("a,b,c", ",")        // ["a", "b", "c"]
strings.Join([]string{"a","b"}, "-") // "a-b"
strings.ReplaceAll(s, "World", "Go") // "Hello, Go!"
strings.Count(s, "l")              // 3
strings.Index(s, "World")          // 7
strings.Repeat("ha", 3)            // "hahaha"

// Fields splits on any whitespace (better than Split for parsing)
strings.Fields("  foo   bar  baz ")  // ["foo", "bar", "baz"]
```

## String Building: Performance Matters

String concatenation with `+` creates a new string every time (strings are immutable). For building strings in loops, use `strings.Builder`:

```go
// BAD: O(n²) — copies the entire string each iteration
func badConcat(items []string) string {
    result := ""
    for _, s := range items {
        result += s + ","  // Allocates a new string every time
    }
    return result
}

// GOOD: O(n) — writes to an internal buffer
func goodConcat(items []string) string {
    var sb strings.Builder
    for i, s := range items {
        if i > 0 {
            sb.WriteByte(',')
        }
        sb.WriteString(s)
    }
    return sb.String()
}

// BEST for simple join: use strings.Join
result := strings.Join(items, ",")
```

<Callout type="tip">

**Benchmark difference:** For 1000 items, `+` concatenation takes ~500μs with ~500 allocations. `strings.Builder` takes ~5μs with ~8 allocations. That's **100x faster**.

</Callout>

## Bytes vs Strings

`[]byte` is the mutable cousin of `string`. Converting between them copies the data:

```go
s := "hello"
b := []byte(s)    // Copies "hello" into a mutable byte slice
b[0] = 'H'        // Can modify bytes
s2 := string(b)   // Copies back to string: "Hello"

// bytes package mirrors strings package
import "bytes"

data := []byte("Hello, World!")
bytes.Contains(data, []byte("World"))
bytes.ToUpper(data)
bytes.Split(data, []byte(","))

// bytes.Buffer for building byte sequences
var buf bytes.Buffer
buf.WriteString("Hello")
buf.WriteByte(' ')
buf.WriteString("World")
result := buf.Bytes()  // []byte("Hello World")
```

**When to use which:**
- `string` — text that shouldn't change (JSON keys, log messages, user display)
- `[]byte` — data you need to modify, binary data, I/O buffers
- `strings.Builder` — building strings incrementally
- `bytes.Buffer` — building byte sequences, implementing `io.Writer`

## String Conversion Gotchas

```go
// Converting number to string does NOT give you the decimal representation
s := string(65)    // "A" (treats 65 as a Unicode code point)
s := string(128522) // "😊"

// Use strconv for number-to-string conversion
s := strconv.Itoa(65)         // "65"
s := strconv.FormatFloat(3.14, 'f', 2, 64)  // "3.14"
s := fmt.Sprintf("%d", 65)   // "65" (slower but more flexible)

// Parsing strings to numbers
n, err := strconv.Atoi("42")              // 42
f, err := strconv.ParseFloat("3.14", 64)  // 3.14
b, err := strconv.ParseBool("true")       // true
```

## Real-World: Sanitizing User Input

```go
func sanitizeUsername(input string) (string, error) {
    // Trim whitespace
    input = strings.TrimSpace(input)

    // Check length in runes (not bytes) for international names
    runeCount := utf8.RuneCountInString(input)
    if runeCount < 2 || runeCount > 30 {
        return "", fmt.Errorf("username must be 2-30 characters, got %d", runeCount)
    }

    // Validate each rune
    for i, r := range input {
        if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '_' && r != '-' {
            return "", fmt.Errorf("invalid character at position %d: %c", i, r)
        }
    }

    return strings.ToLower(input), nil
}

// Works correctly with international text
sanitizeUsername("Ähmed_123")   // "ähmed_123", nil
sanitizeUsername("用户名")       // "用户名", nil
sanitizeUsername("ab")          // "ab", nil
sanitizeUsername("a")           // error: too short
```

## Key Takeaways

1. **`len(s)` counts bytes**, not characters — use `utf8.RuneCountInString` for character count
2. **`range` over strings iterates runes**, index access `s[i]` gives bytes — use range for text
3. **Use `strings.Builder`** for concatenation in loops — 100x faster than `+`
4. **`string(65)` is `"A"`**, not `"65"` — use `strconv.Itoa` for number formatting
5. **`[]byte` for mutable data**, `string` for immutable text — conversion copies the data
6. **Use `unicode` package** for character classification — `unicode.IsLetter`, `unicode.IsDigit`

