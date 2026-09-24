---
title: 'Packages, Modules ও Testing'
subtitle: 'বাস্তব প্রজেক্টের জন্য কীভাবে Go কোড গোছাবেন — dependency management, package design, আর সত্যিকারের bug ধরা test লেখা।'
chapter: 8
level: 'intermediate'
readingTime: '20 মিনিট'
topics: ['packages', 'modules', 'testing', 'benchmarks', 'table-driven tests']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমির একটা ফার্নিচার ওয়ার্কশপ। শুরুর দিকে সব যন্ত্রপাতি এক জায়গায় ডাঁই করা থাকত — কেউ একটা স্ক্রু-ড্রাইভার খুঁজতে গিয়ে আধা ঘণ্টা নষ্ট করত। পরে খোয়ারিজমি সব গুছিয়ে আলাদা আলাদা লেবেল-করা টুলবক্সে রাখল — একটায় "মাপজোখ", একটায় "কাটাকাটি", একটায় "জোড়া লাগানো"। যে কারিগরের ছেনি দরকার, সে সোজা "কাটাকাটি" বাক্সে হাত দেয়, বাকি বাক্স নিয়ে মাথা ঘামাতে হয় না। প্রতিটা বাক্সের ভেতরে কিছু নিজস্ব টুকিটাকিও থাকে যা শুধু ঐ বাক্সের কাজেই লাগে, বাইরের কেউ ছোঁয় না।

খোয়ারিজমি নিজে সব পার্টস বানায় না — কব্জা, হাতল, রঙ বাইরের সাপ্লায়ার থেকে আসে। তাই সে একটা খাতা রাখে যেখানে প্রতিটা বাইরের পার্টসের ঠিক কোন সাপ্লায়ার আর কোন ভার্সনের মাল, সেটা লেখা — "ঢাকা হার্ডওয়্যারের কব্জা, মডেল v2.1"। এই খাতা থাকায় ছ'মাস পরে একই আলমারি বানাতে গেলে হুবহু একই জিনিস পাওয়া যায়, ভুল ভার্সন এসে জোড়া না-লাগার ঝামেলা হয় না। আর গুরুত্বপূর্ণ ব্যাপার — প্রতিটা পার্টস কাজে লাগানোর আগে খোয়ারিজমি আলাদা করে পরখ করে নেয়: কব্জাটা ঠিকঠাক খোলে-বন্ধ হয় কি না, রঙটা ঠিক শেডের কি না। খারাপ পার্টস আগেভাগে বাদ পড়ে, পুরো আলমারি বানানোর পর ধরা পড়ে না।

এই গল্পটাই আসলে এই চ্যাপ্টার। লেবেল-করা টুলবক্স হলো **package** — সম্পর্কিত কোড এক জায়গায় গোছানো, ভেতরের কিছু জিনিস বাইরে লুকানো (unexported)। বাইরের পার্টসের ঠিকানা-ভার্সন লেখা খাতাটাই **module** আর তার **versioned dependency** — `go.mod`/`go.sum` ঠিক এভাবেই প্রতিটা dependency-র exact version আটকে রাখে যাতে build reproducible হয়। আর কাজে লাগানোর আগে প্রতিটা পার্টস পরখ করাটাই **testing** — `go test` দিয়ে প্রতিটা unit আলাদা করে যাচাই করা, বাগ যেন প্রোডাকশনে নয়, আগেই ধরা পড়ে। বাস্তবেও বড় Go প্রজেক্ট ঠিক এভাবেই টেকে — গোছানো package, version-locked dependency, আর প্রতিটা commit-এ চলা test।

## Package Design

প্রতিটা Go ফাইল একটা package-এর অন্তর্ভুক্ত। Package হলো Go-র কোড organization, visibility, আর compilation-এর একক।

```
myapp/
├── go.mod
├── main.go              # package main
├── internal/
│   ├── user/
│   │   ├── user.go      # package user
│   │   ├── user_test.go
│   │   └── repository.go
│   ├── order/
│   │   ├── order.go     # package order
│   │   └── service.go
│   └── auth/
│       └── auth.go      # package auth
└── pkg/
    └── validator/
        └── validator.go  # package validator
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

Package অনেকটা একটা কোম্পানির বিভাগের মতো। Engineering বিভাগের (package) নিজস্ব internal প্রক্রিয়া আছে (unexported function) যা অন্য বিভাগ দেখতে পায় না। কিন্তু এটা API প্রকাশ করে (exported function) যা Sales বা Marketing ব্যবহার করতে পারে। `internal/` directory অনেকটা গোপন প্রজেক্টের মতো — শুধু আপনার নিজের কোম্পানিই সেগুলো access করতে পারে।

</Callout>

### Naming Convention

```go
// Package names should be short, lowercase, singular
package user      // Good
package users     // Bad (plural)
package userPkg   // Bad (redundant suffix)
package util      // Bad (too generic — what goes here?)

// Functions should NOT repeat the package name
user.New()        // Good
user.NewUser()    // Bad (stutters: user.NewUser)

user.Parse()      // Good
user.ParseUser()  // Bad (stutters)

// Exception: when the package name differs from the type
http.NewRequest() // Fine — http is the package, Request is the type
```

<Callout type="tip">

**`internal/` directory compiler-enforced।** `myapp/internal/auth`-এর কোড শুধু `myapp/`-এর অধীনের কোড থেকেই import করা যায়। বাইরের প্রজেক্ট এটা import করতে পারে না। এমন কোডের জন্য এটা ব্যবহার করুন যা আপনার public API-এর অংশ নয়।

</Callout>

## Go Modules

Module হলো Go-র dependency management সিস্টেম। প্রতিটা প্রজেক্ট `go mod init` দিয়ে শুরু হয়।

```bash
# Initialize a new module
go mod init github.com/yourname/myapp

# Add a dependency (automatically added when you import and build)
go get github.com/gorilla/mux@v1.8.1

# Remove unused dependencies
go mod tidy

# Vendor dependencies (copy them into your repo)
go mod vendor
```

### go.mod File

```go
module github.com/yourname/myapp

go 1.22.0

require (
    github.com/gorilla/mux v1.8.1
    github.com/lib/pq v1.10.9
    go.uber.org/zap v1.27.0
)

require (
    // indirect dependencies (used by your dependencies)
    go.uber.org/multierr v1.11.0 // indirect
)
```

### go.sum File

`go.sum` ফাইলে প্রতিটা dependency-র cryptographic checksum থাকে। এটা নিশ্চিত করে যে build **reproducible** — একই কোড সব জায়গায় চলে।

```
github.com/gorilla/mux v1.8.1 h1:TuMoUvkRETdXqEx+iyz...
github.com/gorilla/mux v1.8.1/go.mod h1:DVbg23sWSpFR...
```

<Callout type="warning">

**`go.sum` সবসময় version control-এ commit করুন।** এটা supply chain attack থেকে রক্ষা করে — কোনো dependency টেম্পার করা হলে, checksum মিলবে না আর build fail করবে।

</Callout>

## Go-তে Testing

Go-তে testing ভাষার মধ্যেই built-in। কোনো framework লাগে না — শুধু `testing` package আর `go test`।

```go
// math.go
package math

func Add(a, b int) int {
    return a + b
}

func Divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, fmt.Errorf("division by zero")
    }
    return a / b, nil
}
```

```go
// math_test.go (must end in _test.go)
package math

import "testing"

func TestAdd(t *testing.T) {
    got := Add(2, 3)
    want := 5
    if got != want {
        t.Errorf("Add(2, 3) = %d, want %d", got, want)
    }
}

func TestDivide(t *testing.T) {
    got, err := Divide(10, 2)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if got != 5.0 {
        t.Errorf("Divide(10, 2) = %f, want 5.0", got)
    }
}

func TestDivideByZero(t *testing.T) {
    _, err := Divide(10, 0)
    if err == nil {
        t.Fatal("expected error for division by zero")
    }
}
```

```bash
# Run tests
go test ./...

# Run with verbose output
go test -v ./...

# Run specific test
go test -run TestAdd ./...

# Run with race detector
go test -race ./...

# Run with coverage
go test -cover ./...
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out  # Open in browser
```

## Table-Driven Tests

Idiomatic Go testing প্যাটার্ন। Google, Uber, আর পুরো standard library জুড়ে ব্যাপকভাবে ব্যবহৃত:

```go
func TestAdd(t *testing.T) {
    tests := []struct {
        name string
        a, b int
        want int
    }{
        {name: "positive numbers", a: 2, b: 3, want: 5},
        {name: "negative numbers", a: -1, b: -2, want: -3},
        {name: "mixed signs", a: -1, b: 5, want: 4},
        {name: "zeros", a: 0, b: 0, want: 0},
        {name: "large numbers", a: 1_000_000, b: 2_000_000, want: 3_000_000},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := Add(tt.a, tt.b)
            if got != tt.want {
                t.Errorf("Add(%d, %d) = %d, want %d", tt.a, tt.b, got, tt.want)
            }
        })
    }
}
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

Table-driven test অনেকটা একটা QA চেকলিস্টের মতো। প্রতিটা scenario-র জন্য আলাদা test procedure লেখার বদলে, আপনার একটা procedure আর input ও expected output-এর একটা টেবিল থাকে। চেকলিস্ট ধরে নিচে নামুন — কোনো row fail করলে, আপনি ঠিক জানেন কোন scenario ভেঙেছে।

</Callout>

## HTTP Handler Testing

```go
func TestGetUserHandler(t *testing.T) {
    // Create a mock service
    mockService := &MockUserService{
        GetByIDFunc: func(ctx context.Context, id int) (*User, error) {
            if id == 1 {
                return &User{ID: 1, Email: "fatima@example.com"}, nil
            }
            return nil, ErrNotFound
        },
    }

    handler := NewUserHandler(mockService)

    tests := []struct {
        name       string
        url        string
        wantStatus int
        wantBody   string
    }{
        {
            name:       "existing user",
            url:        "/users/1",
            wantStatus: http.StatusOK,
            wantBody:   `"email":"fatima@example.com"`,
        },
        {
            name:       "not found",
            url:        "/users/999",
            wantStatus: http.StatusNotFound,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            req := httptest.NewRequest("GET", tt.url, nil)
            rec := httptest.NewRecorder()

            handler.ServeHTTP(rec, req)

            if rec.Code != tt.wantStatus {
                t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
            }
            if tt.wantBody != "" && !strings.Contains(rec.Body.String(), tt.wantBody) {
                t.Errorf("body = %s, want to contain %s", rec.Body.String(), tt.wantBody)
            }
        })
    }
}
```

## Benchmarks

Go-তে benchmarking built-in। Performance-critical কোডের জন্য অপরিহার্য:

```go
func BenchmarkAdd(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Add(100, 200)
    }
}

func BenchmarkJSONMarshal(b *testing.B) {
    user := User{ID: 1, Email: "fatima@example.com", FirstName: "Fatima"}
    b.ResetTimer()

    for i := 0; i < b.N; i++ {
        json.Marshal(user)
    }
}

// Compare two implementations
func BenchmarkConcatStrings(b *testing.B) {
    b.Run("plus operator", func(b *testing.B) {
        for i := 0; i < b.N; i++ {
            s := ""
            for j := 0; j < 100; j++ {
                s += "hello"
            }
        }
    })

    b.Run("strings.Builder", func(b *testing.B) {
        for i := 0; i < b.N; i++ {
            var sb strings.Builder
            for j := 0; j < 100; j++ {
                sb.WriteString("hello")
            }
            _ = sb.String()
        }
    })
}
```

```bash
# Run benchmarks
go test -bench=. ./...

# With memory allocation stats
go test -bench=. -benchmem ./...

# Output:
# BenchmarkConcatStrings/plus_operator-10    50000    25000 ns/op    50000 B/op    99 allocs/op
# BenchmarkConcatStrings/strings.Builder-10  500000   2400 ns/op     1024 B/op     8 allocs/op
```

## Test Helpers

```go
// testutil/helpers.go
package testutil

import "testing"

// AssertEqual fails the test if got != want
func AssertEqual[T comparable](t *testing.T, got, want T) {
    t.Helper()  // Reports caller's line number, not this function's
    if got != want {
        t.Errorf("got %v, want %v", got, want)
    }
}

// AssertNoError fails the test if err is not nil
func AssertNoError(t *testing.T, err error) {
    t.Helper()
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
}

// Usage in tests
func TestSomething(t *testing.T) {
    result, err := DoWork()
    testutil.AssertNoError(t, err)
    testutil.AssertEqual(t, result, 42)
}
```

## TestMain: Setup এবং Teardown

```go
func TestMain(m *testing.M) {
    // Setup: run before any tests
    db := setupTestDatabase()

    // Run all tests
    code := m.Run()

    // Teardown: run after all tests
    db.Close()
    os.Exit(code)
}
```

## মূল যেসব শিখলেন

1. **Package name ছোট আর singular** — `user`, `users` বা `userPackage` নয়
2. **`internal/` compiler-enforced privacy** — বাইরের কোড এটা থেকে import করতে পারে না
3. **`go.sum` সবসময় commit করুন** — এটা checksum verification দিয়ে supply chain attack ঠেকায়
4. **Table-driven test** হলো Go স্ট্যান্ডার্ড — একটা test function, অনেক case
5. **test utility-তে `t.Helper()`** — fail হলে caller-এর line number দেখায়
6. **Benchmark built-in** — performance analysis-এর জন্য `go test -bench=. -benchmem`
7. **`go test -race`** — CI-তে সবসময় race detector চালান
