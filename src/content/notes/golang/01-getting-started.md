---
title: 'Go দিয়ে শুরু করা'
subtitle: 'Go কেন আছে, কীভাবে সেটআপ করবেন, আর আপনার প্রথম প্রোগ্রাম — একটা লাইন লেখার আগে এর philosophy বুঝে নিন।'
chapter: 1
level: 'beginner'
readingTime: '15 মিনিট'
topics: ['setup', 'hello world', 'go philosophy', 'toolchain']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনা নতুন একটা কাঠমিস্ত্রির ওয়ার্কশপ খুলবে। আগে কিছু বানানোর তাড়া নেই — প্রথমে সে দোকানে গিয়ে করাত, হাতুড়ি, বাটালি, স্কেল — কাজের পুরো টুলের সেটটা কিনে আনল আর একটা বাক্সে গুছিয়ে রাখল। তারপর ঘরের এক কোণে একটা পরিষ্কার ওয়ার্কবেঞ্চ পাতল, যাতে প্রতিটা জিনিসের জায়গা নির্দিষ্ট থাকে আর কিছু হারিয়ে না যায়। সবকিছু আসলেই ঠিকঠাক চলছে কিনা তা যাচাই করতে সে বড় কোনো ফার্নিচার না বানিয়ে আগে একটা ছোট কাঠের টুল বানিয়ে দেখল — কাঠ মাপল, কাটল, জোড়া দিল। টুলটা মজবুত দাঁড়িয়ে গেল, মানে ওয়ার্কশপ কাজের জন্য তৈরি।

খেয়াল করুন ইবনে সিনা দুই ধাপে কাজটা করল। কখনো সে হাতে হাতে কাঠ কেটে তখনই টুলটা বানিয়ে ফেলল — একবারে বানাও, একবারে দাঁড়াও। আবার বড় অর্ডারের সময় সে আগে আস্ত জিনিসটা বানিয়ে, রং করে, শুকিয়ে রেডি রাখল — যাতে খদ্দের এলে শুধু হাতে তুলে দিলেই হয়, তখন আর বানানোর অপেক্ষা করতে হয় না।

এই গল্পটাই আসলে **Go দিয়ে শুরু করা**। দোকান থেকে টুলের সেট কিনে আনাটা হলো Go **toolchain** ইনস্টল করা (`go version` দিয়ে যাচাই), গোছানো ওয়ার্কবেঞ্চটা হলো **module**/workspace সেটআপ (`go mod init`), আর ছোট ট্রায়াল টুল বানানোটাই আপনার প্রথম প্রোগ্রাম — সেই "Hello, World!"। হাতে হাতে বানিয়ে তখনই চালানোটা হলো `go run`, আর আগে বানিয়ে-শুকিয়ে রেডি রাখাটা হলো `go build` দিয়ে একটা **compiled binary** তৈরি করা, যা পরে যেকোনো জায়গায় নিয়ে সরাসরি চালানো যায়। বাস্তবেও তাই — Docker বা Kubernetes-এর মতো টুল এই একই single binary হিসেবে সার্ভারে কপি করে চালানো হয়, কোনো আলাদা runtime লাগে না।

## Go কেন?

Go তৈরি হয়েছিল Google-এ ২০০৭ সালে, Robert Griesemer, Rob Pike, আর Ken Thompson-এর হাতে। তাঁরা বিরক্ত ছিলেন — C++ কম্পাইল হতে ৪৫ মিনিট লাগত, Python ইনফ্রাস্ট্রাকচারের জন্য বড্ড ধীর, আর Java বড্ড verbose। তাঁরা চেয়েছিলেন এমন একটা ভাষা যা দ্রুত কম্পাইল হয়, দ্রুত চলে, আর পড়তে সহজ।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Go অনেকটা Toyota Camry-র মতো। এটা সবচেয়ে ঝলমলে গাড়ি (Rust) নয়, সবচেয়ে বিলাসবহুলও (Python) নয়। কিন্তু এটা প্রতিদিন সকালে স্টার্ট নেয়, দুর্দান্ত mileage দেয়, আর যে কেউ এটা চালাতে পারে। এই কারণেই Google, Uber, Dropbox, আর Cloudflare-এর মতো কোম্পানিগুলো তাদের সবচেয়ে ক্রিটিক্যাল ইনফ্রাস্ট্রাকচারে এটা ব্যবহার করে।

</Callout>

## Production-এ কারা Go ব্যবহার করে?

- **Google** — Kubernetes, যে সিস্টেমটা পৃথিবীর বেশিরভাগ কন্টেইনার চালায়, তা Go-তে লেখা
- **Uber** — তাদের সবচেয়ে বেশি throughput-এর সার্ভিসগুলো, যা লাখ লাখ রাইড হ্যান্ডল করে
- **Cloudflare** — Edge computing আর DNS ইনফ্রাস্ট্রাকচার
- **Docker** — পুরো কন্টেইনার runtime
- **Twitch** — চ্যাট আর ভিডিও ডেলিভারি সিস্টেম

সাধারণ যোগসূত্র: Go সেসব **networked service**-এ দুর্দান্ত যেগুলোকে **predictable performance** নিয়ে **হাজার হাজার concurrent connection** হ্যান্ডল করতে হয়।

## Go ইনস্টল করা

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

## আপনার প্রথম Go প্রোগ্রাম

```go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
```

চলুন প্রতিটা লাইন ভেঙে দেখি:

- **`package main`** — প্রতিটা Go ফাইল কোনো না কোনো package-এর অন্তর্ভুক্ত। `main` বিশেষ — এটা একটা executable প্রোগ্রামের entry point। একে একটা বিল্ডিংয়ের সদর দরজা হিসেবে ভাবুন।
- **`import "fmt"`** — Go-র standard library থেকে `fmt` (format) package নিয়ে আসে। কাজ শুরুর আগে একটা টুলবক্স import করার মতো।
- **`func main()`** — যে ফাংশনটা প্রোগ্রাম চালানোর সময় রান হয়। প্রতিটা executable-এ ঠিক একটাই থাকতে হয়।
- **`fmt.Println`** — stdout-এ একটা লাইন প্রিন্ট করে। খেয়াল করুন `Println` বড় হাতের অক্ষরে শুরু হয়েছে — Go-তে এর মানে এটা **exported** (public)। ছোট হাতের অক্ষর = private।

```bash
# Run it directly
go run main.go

# Or build a binary first, then run
go build -o hello main.go
./hello
```

## Go Modules: আপনার প্রজেক্ট ম্যানেজ করা

প্রতিটা বাস্তব Go প্রজেক্ট **module** ব্যবহার করে — Go-র dependency management সিস্টেম।

```bash
# Create a new project
mkdir myapp && cd myapp
go mod init github.com/yourname/myapp
```

এটা একটা `go.mod` ফাইল তৈরি করে:

```go
module github.com/yourname/myapp

go 1.22.0
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

`go.mod` অনেকটা Node.js-এর `package.json` বা Python-এর `requirements.txt`-এর মতো। এটা আপনার module-এর নাম ঘোষণা করে আর dependency ট্র্যাক করে। কিন্তু npm-এর সাথে অমিল হলো, Go modules পুরোপুরি reproducible — `go.sum` ঠিক version আর checksum লক করে রাখে।

</Callout>

## প্রজেক্ট স্ট্রাকচার: স্ট্যান্ডার্ড লেআউট

Go প্রজেক্ট স্ট্রাকচার জোর করে চাপায় না, কিন্তু কমিউনিটি কিছু convention মেনে চলে:

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

মূল নিয়ম: **`internal/` package শুধু parent directory-র কোড থেকেই import করা যায়**। এটা compiler enforce করে, convention নয়। এটা Go-র বলার ধরন "এটা private, দূরে থাকো।"

## Go Toolchain

Go-র সাথে আপনার দরকারি সবকিছু বিল্ট-ইন আসে। বেসিক কাজের জন্য কোনো third-party টুল লাগে না:

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

**`go fmt` ঐচ্ছিক নয়।**

বেশিরভাগ ভাষায় কোড ফরম্যাটিং একটা স্টাইলের ব্যাপার। Go-তে `gofmt`-ই স্ট্যান্ডার্ড। প্রতিটা Go ডেভেলপার, প্রতিটা CI pipeline, প্রতিটা কোম্পানি এটা ব্যবহার করে। Tab, space নয়। কোনো তর্ক নেই। এটা একটা পুরো bikeshedding-এর ক্যাটাগরি মুছে দেয় আর প্রতিটা Go কোডবেসকে একই রকম দেখায়।

</Callout>

## Go বনাম অন্য ভাষা: একটা দ্রুত তুলনা

| Feature        | Go                    | Python            | Java                      | Rust                 |
| -------------- | --------------------- | ----------------- | ------------------------- | -------------------- |
| Compilation    | Fast (~seconds)       | Interpreted       | Slow (~minutes)           | Slow (~minutes)      |
| Concurrency    | Goroutines (built-in) | asyncio / threads | Threads / Virtual Threads | async / threads      |
| Error handling | Explicit returns      | Exceptions        | Exceptions                | Result type          |
| Memory         | GC (low-latency)      | GC                | GC                        | No GC (ownership)    |
| Binary output  | Single static binary  | Requires runtime  | Requires JVM              | Single static binary |
| Learning curve | Low                   | Very low          | Medium                    | High                 |

## মূল যেসব শিখলেন

1. **Go সরলতার জন্য ডিজাইন করা** — কম feature, কম শেখার, অন্যের কোড পড়া সহজ
2. **Single binary deployment** — `go build` একটা ফাইল তৈরি করে, zero dependency, যেকোনো জায়গায় কপি করলেই চলে
3. **Tooling বিল্ট-ইন** — formatting, testing, benchmarking, profiling, documentation সবই ভাষার সাথে আসে
4. **Exported = capitalized** — `fmt.Println` public, `fmt.println` হতো private। কোনো `public`/`private` keyword লাগে না
5. **Modules dependency ম্যানেজ করে** — `go mod init` দিয়ে প্রজেক্ট শুরু, `go mod tidy` দিয়ে পরিষ্কার রাখা
