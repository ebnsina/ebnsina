---
title: "Packages, Modules & Testing"
subtitle: "How to organize Go code for real projects — dependency management, package design, and writing tests that catch real bugs."
chapter: 8
level: "intermediate"
readingTime: "20 min"
topics: ["packages", "modules", "testing", "benchmarks", "table-driven tests"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Package Design

Every Go file belongs to a package. Packages are Go's unit of code organization, visibility, and compilation.

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

**Real-World Analogy**

Packages are like departments in a company. The Engineering department (package) has its own internal processes (unexported functions) that other departments can't see. But it publishes APIs (exported functions) that Sales or Marketing can use. The `internal/` directory is like classified projects — only your own company can access them.

</Callout>

### Naming Conventions

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

**The `internal/` directory is compiler-enforced.** Code in `myapp/internal/auth` can only be imported by code under `myapp/`. External projects cannot import it. Use this for code that's not part of your public API.

</Callout>

## Go Modules

Modules are Go's dependency management system. Every project starts with `go mod init`.

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

The `go.sum` file contains cryptographic checksums of every dependency. It ensures that builds are **reproducible** — the same code runs everywhere.

```
github.com/gorilla/mux v1.8.1 h1:TuMoUvkRETdXqEx+iyz...
github.com/gorilla/mux v1.8.1/go.mod h1:DVbg23sWSpFR...
```

<Callout type="warning">

**Always commit `go.sum` to version control.** It protects against supply chain attacks — if a dependency is tampered with, the checksum won't match and the build fails.

</Callout>

## Testing in Go

Go has testing built into the language. No framework needed — just the `testing` package and `go test`.

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

The idiomatic Go testing pattern. Used extensively at Google, Uber, and throughout the standard library:

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

**Real-World Analogy**

Table-driven tests are like a QA checklist. Instead of writing separate test procedures for each scenario, you have one procedure and a table of inputs and expected outputs. Run down the checklist — if any row fails, you know exactly which scenario broke.

</Callout>

## Testing HTTP Handlers

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

Go has built-in benchmarking. Essential for performance-critical code:

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

## TestMain: Setup and Teardown

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

## Key Takeaways

1. **Package names are short and singular** — `user`, not `users` or `userPackage`
2. **`internal/` is compiler-enforced privacy** — external code cannot import from it
3. **Always commit `go.sum`** — it prevents supply chain attacks with checksum verification
4. **Table-driven tests** are the Go standard — one test function, many cases
5. **`t.Helper()`** in test utilities — shows the caller's line number on failure
6. **Benchmarks are built in** — `go test -bench=. -benchmem` for performance analysis
7. **`go test -race`** — always run the race detector in CI

