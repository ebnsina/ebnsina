---
title: 'HTTP from a Raw Socket'
subtitle: 'netcat দিয়ে হাতে-কলমে HTTP বলুন। তারপর 60-লাইনের একটি Go server লিখুন যা ঠিক একই কাজ করে — কোনো framework নেই, কোনো চমক নেই।'
chapter: 2
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['http', 'sockets', 'tcp', 'go', 'netcat']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

আল-খোয়ারিজমি বাগদাদের এক পুরনো টেলিগ্রাফ ঘরে ঢুকলেন জরুরি একটা খবর পাঠাতে। কিন্তু কপাল খারাপ — যে কেরানি সাধারণত বার্তা সাজিয়ে দিত, সে আজ নেই। সামনে শুধু খালি টেলিগ্রাফ লাইনটা পড়ে আছে, তার দুই মাথা দিয়ে শুধু কাঁচা অক্ষর যায়-আসে, আর কিছুই না। ওপারের লোক কোনো আন্দাজ করবে না, কোনো ভুল শুধরে দেবে না — আপনি হুবহু যা পাঠাবেন, ঠিক সেটাই সে পড়বে।

তাই আল-খোয়ারিজমিকে গোটা বার্তা নিজের হাতে, নিয়ম মেনে লিখতে হলো। প্রথম লাইনে অনুরোধটা — "FETCH /page — version 1.1"। তারপর প্রতিটা বাড়তি তথ্য আলাদা আলাদা লাইনে, একেকটা header-এর মতো — কে পাঠাচ্ছে, কোন ভাষায় উত্তর চাই। এরপর একটা পুরো খালি লাইন, যেটা বলে দেয় "তথ্য শেষ, এবার মূল কথা আসছে"। তারপর নিচে আসল বার্তার শরীর। ইবনে সিনা পাশ থেকে বললেন, "একটা লাইন এদিক-সেদিক হলেই ওপারের ফাতিমা আল-ফিহরি পুরো বার্তার মানে হারিয়ে ফেলবে।" কথাটা সত্যি — খালি লাইনটা এক লাইন আগে দিলে বাকিটুকু হয় হারিয়ে যায়, নয়তো ঝুলে থাকে।

এই খালি টেলিগ্রাফ লাইনটাই হলো একটা raw TCP socket — সে শুধু bytes বয়ে নেয়, HTTP-র কিছুই জানে না। আর আল-খোয়ারিজমির নিজ হাতে নিয়ম মেনে বার্তা সাজানোটাই হলো হাতে-কলমে HTTP text তৈরি করা: প্রথম লাইনে request line (method + path + version), তারপর একেক লাইনে header, তারপর আবশ্যক খালি লাইন, আর শেষে body। framework না থাকলে এই গোটা layout-টা আপনাকেই লিখতে হয় — একটা `\r\n` ভুল হলে ওপারের client পুরো response ছেঁটে ফেলে বা অপেক্ষায় ঝুলে থাকে। এই অধ্যায়ে ঠিক সেটাই `nc` দিয়ে হাতে করে দেখব।

## কেন socket থেকে server লিখবেন

কারণ একবার এটা করে ফেললে, আপনি যত framework-এ হাত দেবেন সবই একই call-গুলোর ওপর একটা মিষ্টি প্রলেপ মাত্র। Express, Gin, Flask, Sinatra — সবগুলোই শেষমেশ `bind()`, `listen()`, `accept()` কল করে, bytes পড়ে, bytes লেখে। নিচে কী আছে জানলে আপনি দ্রুত debug করেন, ভালো design করেন, আর যেকোনো HTTP library-র source না-কেঁপে পড়তে পারেন।

এই অধ্যায় তিন ধাপে যায়:

1. `nc` দিয়ে server হোন (কোনো কোড নেই)।
2. `nc` দিয়ে client হোন (কোনো কোড নেই)।
3. Go-তে একটি সত্যিকারের server লিখুন (60 লাইন)।

শেষে গিয়ে magic-টা আর থাকে না — আর সেটাই ভালো।

<Callout type="info">

**বাস্তব জীবনের উপমা**

raw socket থেকে HTTP পড়া অনেকটা একটা ফোন কলের transcript পড়ার মতো — কোনো interpretation বা summarization layer লাগানোর আগে ঠিক কী বলা হয়েছিল, শব্দে শব্দে আপনি তা দেখতে পান।

</Callout>

## ধাপ 1 — netcat দিয়ে server হোন

`netcat` (`nc`) একটি raw TCP socket খোলে। সবচেয়ে সরল রূপে: একটি port-এ listen করো, যা আসে তা প্রিন্ট করো, আর যা টাইপ করো তা ফেরত পাঠাও।

```bash
nc -l -p 8080
```

দ্বিতীয় একটা terminal-এ:

```bash
curl -v http://localhost:8080/hello
```

প্রথম terminal দেখায়:

```text
GET /hello HTTP/1.1
Host: localhost:8080
User-Agent: curl/8.4.0
Accept: */*

```

`curl` এখন আটকে আছে, একটা response-এর অপেক্ষায়। listening terminal-এ response টাইপ করুন আর শেষ হলে Ctrl+D চাপুন:

```text
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 14

hello, client
```

`curl` body প্রিন্ট করে বেরিয়ে যায়। আপনি এইমাত্র পুরোপুরি হাতে-কলমে একটা HTTP server চালালেন।

<Callout type="info">

**এটা কাজ করে কেন?**

কারণ HTTP হলো text। কোনো magic নেই — `curl` একটা text request পাঠাল, আপনি একটা text response টাইপ করলেন, kernel এদের মাঝে bytes pipe করে দিল। প্রতিটি web server ঠিক এটাই করছে, আরও দ্রুত, আর একসাথে অনেক client-কে।

</Callout>

কয়েকটা জিনিস খেয়াল করুন:

- `Content-Length: 14` — body-র bytes নিখুঁতভাবে গুনুন। `hello, client\n` হলো 14 bytes (13টি অক্ষর আর newline)। length নিয়ে মিথ্যা বললে client হয় আরও data-র অপেক্ষায় ঝুলে থাকে, নয়তো response ছেঁটে ফেলে।
- headers আর body-র মাঝের খালি লাইনটা আবশ্যক।
- `curl -v` একই আদান-প্রদানের client-এর দৃষ্টিভঙ্গি দেখায় — request আর response পাশাপাশি।

## ধাপ 2 — netcat দিয়ে client হোন

ভূমিকা উল্টে দিন। request সরাসরি টাইপ করুন:

```bash
{ printf 'GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n'; } \
  | nc example.com 80
```

remote server তার homepage-এর HTML ফেরত পাঠায়, সামনে response headers বসানো। একটা সত্যিকারের HTTP client। `curl` কী করে তা এখন আপনি জানেন — একটু বেশি পালিশ করা, কিন্তু একই নীতি।

`openssl`-এর মধ্য দিয়ে রুট করে TLS-এ চেষ্টা করুন:

```bash
{ printf 'GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n'; } \
  | openssl s_client -connect example.com:443 -quiet
```

একই request, পথে encrypted।

## ধাপ 3 — Go-তে একটি সত্যিকারের server লিখুন

এবার কোড। আমরা পুরো request/response loop লিখব শুধু standard `net` package দিয়ে — কোনো `net/http` নেই, কোনো framework নেই। উদ্দেশ্য _bytes দেখা_।

```go
// main.go
package main

import (
    "bufio"
    "fmt"
    "io"
    "log"
    "net"
    "strings"
)

func main() {
    ln, err := net.Listen("tcp", ":8080")
    if err != nil {
        log.Fatal(err)
    }
    log.Println("listening on :8080")

    for {
        conn, err := ln.Accept()
        if err != nil {
            log.Println("accept error:", err)
            continue
        }
        go handle(conn)
    }
}

func handle(conn net.Conn) {
    defer conn.Close()
    reader := bufio.NewReader(conn)

    // 1. Read the request line
    line, err := reader.ReadString('\n')
    if err != nil {
        return
    }
    line = strings.TrimRight(line, "\r\n")
    parts := strings.Fields(line)
    if len(parts) != 3 {
        writeStatus(conn, 400, "Bad Request", "malformed request line")
        return
    }
    method, path, version := parts[0], parts[1], parts[2]
    log.Printf("%s %s %s", method, path, version)

    // 2. Read headers until blank line
    headers := map[string]string{}
    for {
        h, err := reader.ReadString('\n')
        if err != nil {
            return
        }
        h = strings.TrimRight(h, "\r\n")
        if h == "" {
            break
        }
        i := strings.IndexByte(h, ':')
        if i < 0 {
            continue
        }
        name := strings.ToLower(strings.TrimSpace(h[:i]))
        val := strings.TrimSpace(h[i+1:])
        headers[name] = val
    }

    // 3. Route
    switch path {
    case "/":
        writeStatus(conn, 200, "OK", "hello from a hand-rolled server\n")
    case "/about":
        writeStatus(conn, 200, "OK", "this is /about\n")
    default:
        writeStatus(conn, 404, "Not Found", "no such path: "+path+"\n")
    }
}

func writeStatus(w io.Writer, code int, status string, body string) {
    fmt.Fprintf(w, "HTTP/1.1 %d %s\r\n", code, status)
    fmt.Fprintf(w, "Content-Type: text/plain\r\n")
    fmt.Fprintf(w, "Content-Length: %d\r\n", len(body))
    fmt.Fprintf(w, "Connection: close\r\n")
    fmt.Fprintf(w, "\r\n")
    fmt.Fprint(w, body)
}
```

চালান:

```bash
go run main.go
# 2026/05/04 10:42:11 listening on :8080
```

হিট করুন:

```bash
$ curl -i http://localhost:8080/
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 33
Connection: close

hello from a hand-rolled server
```

ষাট লাইন, কোনো framework নেই, সত্যিকারের HTTP। `curl`, `Postman`, আপনার browser — সবই এর বিপরীতে কাজ করে। accept loop-এ `go handle(conn)`-এর কারণে multi-client।

## এই server যা ঠিক করে

- **request line আর headers পড়ে।** বেশিরভাগ "homemade HTTP server" tutorial headers পুরোপুরি বাদ দেয় — সেটা ভুল; parse না করে আপনি `Host:`-এ route করতে বা `Accept-Encoding:` মানতে পারবেন না।
- **প্রতি connection-এ একটি goroutine spawn করে।** accept loop কখনো block হয় না, তাই পরের client সাথে সাথে accept হয়।
- **Content-Length আর Connection সহ একটি সত্যিকারের response লেখে।** client জানে response কখন শেষ হয়।
- **অজানা path 404 দিয়ে সামলায়।** crash নয়, ঝুলে থাকা নয়।

## এই server যা ভুল করে (ইচ্ছাকৃতভাবে)

- **কোনো request body নেই।** এটি POST body পড়ে না। পরের অধ্যায়ে ঠিক করব।
- **কোনো keep-alive নেই।** এটি সবসময় `Connection: close` পাঠায় আর একটি request-এর পরই socket বন্ধ করে দেয়। সত্যিকারের server connection পুনরায় ব্যবহার করে।
- **কোনো timeout নেই।** একটি ধীর client অনন্তকাল connection ধরে রাখতে পারে, goroutine নিঃশেষ করে। সত্যিকারের server `ReadTimeout`, `WriteTimeout`, `IdleTimeout` সেট করে।
- **কোনো request size limit নেই।** একটি ক্ষতিকর client একটি 10MB header line পাঠিয়ে box-টা OOM করে ফেলতে পারে।
- **কোনো URL decoding নেই।** `/?q=hello%20world` আক্ষরিকভাবে `%20` সহ আসে, space হিসেবে নয়।
- **কোনো HTTPS নেই।** Plain text। পরের ট্র্যাকে TLS যোগ করব।
- **Headers naive-ভাবে parse করা।** `Set-Cookie` একাধিকবার আসতে পারে; এই implementation overwrite করে দেয়।

এগুলো "দুর্বলতা" নয় — এগুলো এমন feature যা ইচ্ছাকৃতভাবে যোগ করা হয়*নি* যাতে গঠনটা দৃশ্যমান থাকে। পরের অধ্যায়ে আমরা সত্যিকারের parsing যোগ করব। তারপর standard library-র `net/http` আপনার জন্য এসবই করবে, আর আপনি ঠিক জানবেন সেটা কী করছে।

## net/http-এর সাথে তুলনা

এই একই server Go-র standard library দিয়ে লেখা:

```go
package main

import (
    "fmt"
    "log"
    "net/http"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "hello from net/http")
    })
    http.HandleFunc("/about", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "this is /about")
    })
    log.Println("listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

ষাটের বদলে বারো লাইন। `net/http` করে:

- Request line আর header parsing।
- Body পড়া আর decoding।
- Keep-alive আর pipelining।
- Timeout আর limit।
- TLS চালু করলে HTTP/2।
- `ServeMux`-এর মাধ্যমে path multiplexing।

আপনি যত লাইন বাঁচালেন প্রতিটাই এমন এক লাইন যা `net/http` আপনার হয়ে চালাচ্ছে। একবার লম্বা সংস্করণটা লিখে ফেললে, ছোট সংস্করণটা আর রহস্যময় থাকে না।

## অন্য ভাষায় একই ধারণার এক ঝলক

**Python** — একই গঠন, `socket` দিয়ে:

```python
import socket

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("0.0.0.0", 8080))
s.listen(128)

while True:
    conn, _ = s.accept()
    request = conn.recv(8192).decode("latin-1")
    line = request.split("\r\n", 1)[0]
    method, path, version = line.split(" ")
    body = f"hello, {path}\n"
    response = (
        f"HTTP/1.1 200 OK\r\n"
        f"Content-Type: text/plain\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Connection: close\r\n\r\n"
        f"{body}"
    )
    conn.sendall(response.encode())
    conn.close()
```

**Node** — ডিফল্টভাবেই async, তাই loop-টা implicit:

```javascript
import { createServer } from 'node:net';

createServer((conn) => {
	let buf = '';
	conn.on('data', (chunk) => {
		buf += chunk.toString();
		if (buf.includes('\r\n\r\n')) {
			const [line] = buf.split('\r\n');
			const [, path] = line.split(' ');
			const body = `hello, ${path}\n`;
			conn.write(
				`HTTP/1.1 200 OK\r\n` +
					`Content-Type: text/plain\r\n` +
					`Content-Length: ${Buffer.byteLength(body)}\r\n` +
					`Connection: close\r\n\r\n` +
					body
			);
			conn.end();
		}
	});
}).listen(8080, () => console.log('listening on :8080'));
```

ভাষা আলাদা। মডেল আলাদা নয়।

## রিক্যাপ

- HTTP হলো text; `nc` দিয়ে আপনি হাতে-কলমে এটা বলতে পারেন।
- একটি web server হলো একটি `bind / listen / accept / read / write / close` loop।
- 60 লাইন Go আপনাকে routing সহ একটি কার্যকর multi-client HTTP/1.1 server দেয়।
- সত্যিকারের framework যোগ করে: timeout, limit, body parsing, keep-alive, HTTP/2, TLS — এসবই অপরিহার্য, কোনোটাই রহস্যময় নয়।

পরের অধ্যায়: এই খেলনা parser-কে একটি সত্যিকারের HTTP/1.1 parser-এ রূপান্তরিত করুন যা body আর chunked encoding সামলায়।
