---
title: 'Strings, Runes ও Encoding'
subtitle: 'Go-তে string আসলে UTF-8 byte slice — এটা জানা থাকলে international text, emoji আর binary data হ্যান্ডেল করার সময় একটা গোটা শ্রেণীর bug এড়ানো যায়।'
chapter: 9
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['strings', 'runes', 'UTF-8', 'encoding', 'bytes', 'text processing']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## String হলো Byte Slice

Go-তে একটা string হলো **read-only byte slice**। character নয়, rune নয় — byte।

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

**বাস্তব জীবনের উপমা**

Go-এর একটা string অনেকটা filmstrip-এর মতো। প্রতিটা frame (byte) হলো একেকটা টুকরো। সাধারণ ASCII character একটা করে frame ব্যবহার করে। কিন্তু জটিল character (চাইনিজ, আরবি, emoji) ২-৪টা frame ব্যবহার করে। `len()` frame গোনে, ছবি নয়। ছবি গুনতে হলে filmstrip টা decode করতে হবে।

</Callout>

## Runes: Unicode Code Point

`rune` হলো Unicode code point-এর Go-এর নাম — একটা `int32` যেটা একটা single character-কে প্রকাশ করে:

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

## সাধারণ String Operation

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

## String Building: Performance ব্যাপারটা গুরুত্বপূর্ণ

`+` দিয়ে string concatenation প্রতিবারই একটা নতুন string তৈরি করে (string immutable)। loop-এর ভেতর string বানাতে হলে `strings.Builder` ব্যবহার করুন:

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

**Benchmark পার্থক্য:** 1000 item-এর জন্য, `+` concatenation লাগে ~500μs আর ~500 allocation। `strings.Builder` লাগে ~5μs আর ~8 allocation। অর্থাৎ **100x দ্রুত**।

</Callout>

## Bytes বনাম Strings

`[]byte` হলো `string`-এর mutable কাজিন। এদের মধ্যে convert করলে data কপি হয়:

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

**কখন কোনটা ব্যবহার করবেন:**

- `string` — যে text বদলানো উচিত নয় (JSON key, log message, user display)
- `[]byte` — যে data আপনাকে modify করতে হবে, binary data, I/O buffer
- `strings.Builder` — string ধাপে ধাপে বানানোর জন্য
- `bytes.Buffer` — byte sequence বানানো, `io.Writer` implement করা

## String Conversion-এর ফাঁদ

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

## বাস্তব উদাহরণ: User Input Sanitize করা

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

## মূল শিক্ষা

1. **`len(s)` byte গোনে**, character নয় — character count-এর জন্য `utf8.RuneCountInString` ব্যবহার করুন
2. **string-এর উপর `range` rune ধরে iterate করে**, index access `s[i]` byte দেয় — text-এর জন্য range ব্যবহার করুন
3. **loop-এ concatenation-এর জন্য `strings.Builder` ব্যবহার করুন** — `+`-এর চেয়ে 100x দ্রুত
4. **`string(65)` হলো `"A"`**, `"65"` নয় — number format করতে `strconv.Itoa` ব্যবহার করুন
5. **mutable data-এর জন্য `[]byte`**, immutable text-এর জন্য `string` — conversion data কপি করে
6. **character classification-এর জন্য `unicode` package** ব্যবহার করুন — `unicode.IsLetter`, `unicode.IsDigit`
