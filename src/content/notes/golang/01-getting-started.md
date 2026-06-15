---
title: "Getting Started with Go"
subtitle: "Why Go exists, how to set it up, and your first program — understand the philosophy before writing a single line."
chapter: 1
level: "beginner"
readingTime: "15 min"
topics: ["setup", "hello world", "go philosophy", "toolchain"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Go?

Go was created at Google in 2007 by Robert Griesemer, Rob Pike, and Ken Thompson. They were frustrated — C++ compilations took 45 minutes, Python was too slow for infrastructure, and Java was too verbose. They wanted a language that compiled fast, ran fast, and was easy to read.

<Callout type="info">

**Real-World Analogy**

Go is like a Toyota Camry. It's not the flashiest car (Rust) or the most luxurious (Python). But it starts every morning, gets incredible mileage, and anyone can drive it. That's why companies like Google, Uber, Dropbox, and Cloudflare use it for their most critical infrastructure.

</Callout>

## Who Uses Go in Production?

- **Google** — Kubernetes, the system that runs most of the world's containers, is written in Go
- **Uber** — Their highest-throughput services handling millions of rides
- **Cloudflare** — Edge computing and DNS infrastructure
- **Docker** — The entire container runtime
- **Twitch** — Chat and video delivery systems

The common thread: Go excels at **networked services** that need to handle **thousands of concurrent connections** with **predictable performance**.

## Installing Go

```bash
# macOS (Homebrew)
brew install go

# Linux
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin

# Verify installation
go version
# go version go1.22.0 darwin/arm64
```

## Your First Go Program

```go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
```

Let's break down every line:

- **`package main`** — Every Go file belongs to a package. `main` is special — it's the entry point of an executable program. Think of it as the front door of a building.
- **`import "fmt"`** — Brings in the `fmt` (format) package from Go's standard library. Like importing a toolbox before doing work.
- **`func main()`** — The function that runs when you execute the program. Every executable needs exactly one.
- **`fmt.Println`** — Prints a line to stdout. Notice `Println` starts with a capital letter — in Go, that means it's **exported** (public). Lowercase = private.

```bash
# Run it directly
go run main.go

# Or build a binary first, then run
go build -o hello main.go
./hello
```

## Go Modules: Managing Your Project

Every real Go project uses **modules** — Go's dependency management system.

```bash
# Create a new project
mkdir myapp && cd myapp
go mod init github.com/yourname/myapp
```

This creates a `go.mod` file:

```go
module github.com/yourname/myapp

go 1.22.0
```

<Callout type="info">

**Real-World Analogy**

`go.mod` is like a `package.json` in Node.js or `requirements.txt` in Python. It declares your module name and tracks dependencies. But unlike npm, Go modules are fully reproducible — `go.sum` locks exact versions and checksums.

</Callout>

## Project Structure: The Standard Layout

Go doesn't enforce project structure, but the community follows conventions:

```
myapp/
├── go.mod              # Module definition
├── go.sum              # Dependency checksums
├── main.go             # Entry point
├── internal/           # Private packages (can't be imported externally)
│   ├── handler/
│   │   └── user.go
│   └── service/
│       └── auth.go
├── pkg/                # Public packages (optional, less common now)
├── cmd/                # Multiple entry points
│   ├── server/
│   │   └── main.go
│   └── worker/
│       └── main.go
└── config/
    └── config.go
```

The key rule: **`internal/` packages can only be imported by code in the parent directory**. This is enforced by the compiler, not convention. It's Go's way of saying "this is private, stay out."

## The Go Toolchain

Go ships with everything you need built in. No third-party tools required for the basics:

```bash
# Run a file without building
go run main.go

# Build a binary
go build -o myapp .

# Run tests
go test ./...

# Format code (non-negotiable — everyone uses gofmt)
go fmt ./...

# Detect common mistakes
go vet ./...

# Download dependencies
go mod tidy

# View documentation
go doc fmt.Println
```

<Callout type="tip">

**`go fmt` is not optional.**

In most languages, code formatting is a style choice. In Go, `gofmt` is the standard. Every Go developer, every CI pipeline, every company uses it. Tabs, not spaces. No arguments. This eliminates an entire category of bikeshedding and makes every Go codebase look the same.

</Callout>

## Go vs Other Languages: A Quick Comparison

| Feature | Go | Python | Java | Rust |
|---------|-----|--------|------|------|
| Compilation | Fast (~seconds) | Interpreted | Slow (~minutes) | Slow (~minutes) |
| Concurrency | Goroutines (built-in) | asyncio / threads | Threads / Virtual Threads | async / threads |
| Error handling | Explicit returns | Exceptions | Exceptions | Result type |
| Memory | GC (low-latency) | GC | GC | No GC (ownership) |
| Binary output | Single static binary | Requires runtime | Requires JVM | Single static binary |
| Learning curve | Low | Very low | Medium | High |

## Key Takeaways

1. **Go was designed for simplicity** — fewer features, less to learn, easier to read other people's code
2. **Single binary deployment** — `go build` produces one file with zero dependencies, copy it anywhere and it runs
3. **Tooling is built in** — formatting, testing, benchmarking, profiling, documentation all ship with the language
4. **Exported = capitalized** — `fmt.Println` is public, `fmt.println` would be private. No `public`/`private` keywords needed
5. **Modules manage dependencies** — `go mod init` starts a project, `go mod tidy` keeps it clean

