---
title: 'HTTP from a Raw Socket'
subtitle: 'Speak HTTP by hand with netcat. Then write a 60-line Go server that does exactly the same thing — no framework, no surprises.'
chapter: 2
level: 'beginner'
readingTime: '12 min'
topics: ['http', 'sockets', 'tcp', 'go', 'netcat']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why write a server from sockets

Because once you have done it, every framework you ever touch is just sugar over the same calls. Express, Gin, Flask, Sinatra — all of them eventually call `bind()`, `listen()`, `accept()`, read bytes, write bytes. If you know what is underneath, you debug faster, design better, and can read the source of any HTTP library without flinching.

This chapter goes in three steps:

1. Be a server with `nc` (no code).
2. Be a client with `nc` (no code).
3. Write a real server in Go (60 lines).

By the end, the magic is gone — and that is good.

<Callout type="info">

**Real-World Analogy**

Reading HTTP from a raw socket is like reading the transcript of a phone call — you see exactly what was said, word for word, before any interpretation or summarization layers are applied.

</Callout>

## Step 1 — Be a server with netcat

`netcat` (`nc`) opens a raw TCP socket. In its simplest form: listen on a port, print whatever arrives, send whatever you type back.

```bash
nc -l -p 8080
```

In a second terminal:

```bash
curl -v http://localhost:8080/hello
```

The first terminal shows:

```text
GET /hello HTTP/1.1
Host: localhost:8080
User-Agent: curl/8.4.0
Accept: */*

```

`curl` is now blocked, waiting for a response. Type the response into the listening terminal and press Ctrl+D when done:

```text
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 14

hello, client
```

`curl` prints the body and exits. You just ran an HTTP server entirely by hand.

<Callout type="info">

**Why does this work?**

Because HTTP is text. There is no magic — `curl` sent a text request, you typed a text response, the kernel piped the bytes between them. Every web server is doing exactly this, faster, and to many clients at once.

</Callout>

A few things to notice:

- `Content-Length: 14` — count the bytes of the body precisely. `hello, client\n` is 14 bytes (13 letters plus the newline). If you lie about the length, the client either hangs waiting for more data or truncates the response.
- The blank line between headers and body is required.
- `curl -v` shows the client's view of the same exchange — request and response side by side.

## Step 2 — Be a client with netcat

Reverse the roles. Type the request directly:

```bash
{ printf 'GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n'; } \
  | nc example.com 80
```

The remote server sends back its homepage's HTML, prefixed by the response headers. A real HTTP client. You now know what `curl` does — slightly more polished, but the same principle.

Try it with TLS by routing through `openssl`:

```bash
{ printf 'GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n'; } \
  | openssl s_client -connect example.com:443 -quiet
```

Same request, encrypted in transit.

## Step 3 — Write a real server in Go

Now the code. We will write the entire request/response loop using only the standard `net` package — no `net/http`, no frameworks. The point is to _see the bytes_.

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

Run it:

```bash
go run main.go
# 2026/05/04 10:42:11 listening on :8080
```

Hit it:

```bash
$ curl -i http://localhost:8080/
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 33
Connection: close

hello from a hand-rolled server
```

Sixty lines, no framework, real HTTP. `curl`, `Postman`, your browser — all of them work against this. Multi-client because of `go handle(conn)` in the accept loop.

## What this server gets right

- **Reads the request line and headers.** Most "homemade HTTP server" tutorials skip headers entirely — that is wrong; you cannot route on `Host:` or honor `Accept-Encoding:` without parsing them.
- **Spawns a goroutine per connection.** The accept loop never blocks, so the next client gets accepted immediately.
- **Writes a real response with Content-Length and Connection.** Client knows when the response ends.
- **Handles unknown paths with 404.** Not a crash, not a hang.

## What this server gets wrong (intentionally)

- **No request body.** It does not read POST bodies. We will fix that next chapter.
- **No keep-alive.** It always sends `Connection: close` and closes the socket after one request. Real servers reuse connections.
- **No timeouts.** A slow client can hold a connection forever, exhausting goroutines. Real servers set `ReadTimeout`, `WriteTimeout`, `IdleTimeout`.
- **No request size limits.** A malicious client could send a 10MB header line and OOM the box.
- **No URL decoding.** `/?q=hello%20world` arrives literally with `%20`, not as a space.
- **No HTTPS.** Plain text. We add TLS in the next track.
- **Headers parsed naively.** `Set-Cookie` can appear multiple times; this implementation overwrites.

These are not "weaknesses" — they are features deliberately _not_ added so the structure stays visible. Next chapter we add real parsing. After that, the standard library's `net/http` will do all of this for you, and you will know exactly what it is doing.

## Comparing to net/http

Here is the same server written with Go's standard library:

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

Twelve lines instead of sixty. `net/http` does:

- Request line and header parsing.
- Body reading and decoding.
- Keep-alive and pipelining.
- Timeouts and limits.
- HTTP/2 if you enable TLS.
- Path multiplexing through `ServeMux`.

Every line you saved is a line `net/http` is running for you. Once you have written the long version once, the short version is no longer mysterious.

## A look at the same idea in other languages

**Python** — same shape, with `socket`:

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

**Node** — already async by default, so the loop is implicit:

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

The languages differ. The model does not.

## Recap

- HTTP is text; you can speak it by hand with `nc`.
- A web server is a `bind / listen / accept / read / write / close` loop.
- 60 lines of Go gives you a working multi-client HTTP/1.1 server with routing.
- Real frameworks add: timeouts, limits, body parsing, keep-alive, HTTP/2, TLS — all of which are essential, none of which are mysterious.

Next chapter: turn the toy parser into a real HTTP/1.1 parser that handles bodies and chunked encoding.
