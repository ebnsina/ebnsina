---
title: 'What is a Web Server'
subtitle: 'Anatomy of an HTTP request from socket to response. The four stages every web server runs through, and the names for the parts.'
chapter: 1
level: 'beginner'
readingTime: '10 min'
topics: ['http', 'web server', 'tcp', 'request lifecycle']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## A web server is a TCP listener that speaks HTTP

Strip away the frameworks, the documentation, the marketing. A web server is:

1. A process that owns a TCP port (typically 80 or 443).
2. When a connection arrives, it reads bytes off the socket.
3. It interprets those bytes as HTTP — request line, headers, body.
4. It produces an HTTP response (status line, headers, body) and writes it back.
5. It closes the connection or keeps it open for another request.

That is it. nginx is this. Apache is this. Your Express app is this. The 200-line Go program at the end of this chapter is this. Once you internalize the loop, every web server you ever encounter is just a different polish on the same five steps.

<Callout type="info">

**Real-World Analogy**

A web server is like a librarian who takes your book request, finds it on the shelf, and hands it to you — the protocol is how you ask, and the server is the one who fetches.

</Callout>

## The four stages of a request

Every HTTP request, no matter the language or framework, passes through four stages:

```text
            [ ACCEPT ] → [ PARSE ] → [ ROUTE/HANDLE ] → [ RESPOND ]
```

**1. ACCEPT.** The kernel hands the server a new socket — a TCP connection that has just completed its three-way handshake with a client. The server's job: take it off the listen queue and start reading.

**2. PARSE.** The server reads bytes off the socket and interprets them. It expects HTTP — a method line (`GET /index.html HTTP/1.1`), a block of headers (`Host: example.com`, `Accept: text/html`, ...), an empty line, and optionally a body. If anything is malformed, send back a `400 Bad Request` and move on.

**3. ROUTE/HANDLE.** The server looks at the method and path, decides what to do: serve a static file, run application code, proxy to another server, redirect, return cached content. This is where "your code" runs.

**4. RESPOND.** The server writes back the response — a status line (`HTTP/1.1 200 OK`), headers (`Content-Type: text/html`, `Content-Length: 1234`), an empty line, and the body. Either close the connection (`Connection: close`) or keep it open for the next request on the same socket.

Then it goes back to ACCEPT.

## What HTTP actually looks like on the wire

Open two terminals. In the first, listen on port 8080:

```bash
nc -l -p 8080
```

In the second, connect to it:

```bash
curl http://localhost:8080/test
```

In the first terminal, you will see:

```text
GET /test HTTP/1.1
Host: localhost:8080
User-Agent: curl/8.4.0
Accept: */*

```

That is the entire request. Plain text, line-terminated by `\r\n`. Three parts:

- **Request line** — `GET /test HTTP/1.1`. Method, path, version.
- **Headers** — `Host`, `User-Agent`, `Accept`. Each is `Name: Value` with `\r\n` between.
- **Empty line** — `\r\n` alone, signaling end of headers. Always present.
- **Body** — would come after the empty line, for `POST` and `PUT`. None here.

Now type a response in the listener and press Ctrl+D:

```text
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 13

hello, world
```

`curl` prints `hello, world` and exits. Congratulations — you just _were_ a web server, by hand, with `nc`.

<Callout type="info">

**`\r\n`, not `\n`.**

HTTP/1.x line endings are always carriage-return + line-feed (`\r\n`). Most modern parsers tolerate plain `\n`, but the spec is explicit. When you write a server, emit `\r\n`. When you debug with `nc`, your terminal handles it.

</Callout>

## The reqest line — methods and paths

```text
GET /index.html HTTP/1.1
```

Three fields, separated by single spaces:

**Method** — what to do.

| Method    | Idempotent? | Has body? | Typical use                                         |
| --------- | ----------- | --------- | --------------------------------------------------- |
| `GET`     | Yes         | No        | Read a resource.                                    |
| `POST`    | No          | Yes       | Create something.                                   |
| `PUT`     | Yes         | Yes       | Replace a resource.                                 |
| `PATCH`   | No          | Yes       | Modify a resource.                                  |
| `DELETE`  | Yes         | No        | Remove a resource.                                  |
| `HEAD`    | Yes         | No        | Like `GET` but response has no body — for metadata. |
| `OPTIONS` | Yes         | No        | What methods are supported? CORS preflight.         |

Idempotent means "doing it twice has the same effect as doing it once." Important for retries — `GET` and `PUT` are safe to retry; `POST` may not be.

**Path** — `/index.html`, `/api/users/42`, `/?q=hello`. Always starts with `/`. May include a query string after `?`. URL-encoded for non-ASCII.

**Version** — `HTTP/1.0`, `HTTP/1.1`, `HTTP/2`, `HTTP/3`. Practically every server you write speaks HTTP/1.1; HTTP/2 and HTTP/3 are typically handled by a reverse proxy that translates back down to 1.1 for your application.

## Headers

```text
Host: example.com
User-Agent: curl/8.4.0
Accept: text/html
Content-Type: application/json
Content-Length: 42
Cookie: session=abc123
```

Headers are `Name: Value` pairs. Names are case-insensitive (`Host` and `host` are the same header). Order generally does not matter, except `Set-Cookie` (server) and `Cookie` (client) where multiple values exist.

Six headers worth memorizing:

- **Host** — _which_ virtual host on this server. Required in HTTP/1.1. The same IP can serve many domains via the `Host` header.
- **Content-Type** — the MIME type of the body (`text/html`, `application/json`, `image/png`, ...).
- **Content-Length** — body length in bytes. Required for non-chunked bodies.
- **Transfer-Encoding: chunked** — alternative to Content-Length, for streaming.
- **Connection** — `keep-alive` (reuse this socket for the next request) or `close`.
- **Authorization** — credentials. `Bearer <token>` or `Basic <base64>`.

## Status codes — the response in three digits

A response always starts with a status line:

```text
HTTP/1.1 200 OK
HTTP/1.1 404 Not Found
HTTP/1.1 503 Service Unavailable
```

Five categories, by first digit:

| Range   | Meaning       | Common codes                                                                                     |
| ------- | ------------- | ------------------------------------------------------------------------------------------------ |
| **1xx** | Informational | `100 Continue`                                                                                   |
| **2xx** | Success       | `200 OK`, `201 Created`, `204 No Content`                                                        |
| **3xx** | Redirect      | `301 Moved Permanently`, `302 Found`, `304 Not Modified`                                         |
| **4xx** | Client error  | `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `429 Too Many Requests` |
| **5xx** | Server error  | `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable`, `504 Gateway Timeout` |

`4xx` means _the client did something wrong_. `5xx` means _the server did something wrong_. Knowing which side broke is the first question in any debugging session.

## Connection lifecycle — keep-alive

In HTTP/1.0, every request opened a new TCP connection: connect, request, response, close. Slow.

HTTP/1.1 introduced **persistent connections**: by default the server keeps the socket open after the response, ready for another request. The client signals "I am done" with `Connection: close` or stops sending requests. Massive speedup — TCP handshake plus TLS handshake costs hundreds of milliseconds per RTT.

```text
[client → server]    GET /a HTTP/1.1
                     Host: x.com
[server → client]    HTTP/1.1 200 OK ...
[client → server]    GET /b HTTP/1.1     ← same socket, no new handshake
                     Host: x.com
[server → client]    HTTP/1.1 200 OK ...
```

Servers cap how long they hold an idle keep-alive socket (`keepalive_timeout`, typically 60–75 seconds in nginx) to avoid running out of file descriptors.

## Pipelining and HTTP/2

Even with keep-alive, HTTP/1.1 is _serial_ per connection — you must finish reading response A before you can send request B. **Pipelining** allowed sending B before A's response, but it was poorly supported and head-of-line blocking made it fragile. Most clients never used it.

HTTP/2 fixed this with **multiplexing** — multiple logical streams over one TCP connection, interleaved frame by frame. This is one of the main reasons to put nginx (or a similar proxy) in front of your application: you get HTTP/2 termination for free, while your backend speaks plain HTTP/1.1.

HTTP/3 takes it further by replacing TCP with QUIC (UDP-based) to eliminate head-of-line blocking at the _transport_ layer. Same multiplexed-streams model.

## What "running on port 80" actually means

The server process calls:

```python
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(("0.0.0.0", 80))
s.listen(128)
while True:
    conn, addr = s.accept()
    handle(conn)
```

A few things going on:

- `0.0.0.0` means "any interface." `127.0.0.1` would be loopback only.
- Ports below 1024 require root or `CAP_NET_BIND_SERVICE` (chapter 8 of Linux & VPS).
- `listen(128)` sets the _backlog_ — how many fully-handshaked connections can queue up waiting for `accept()`. Too low, and bursts get dropped at the kernel.
- Each `accept()` returns a new socket for that one connection. The original listening socket keeps accepting new ones.

Whether the server then handles `conn` in the same thread, hands it to a worker pool, or registers it with an event loop is a design choice — chapter 4 covers it.

## Static vs dynamic, framework vs raw

A web server can serve two kinds of content:

- **Static** — files on disk (`/var/www/html/index.html`). The server reads the file and writes it to the socket. nginx is fantastic at this.
- **Dynamic** — content generated by code at request time. The server runs your function, which may query a database, call other services, render a template, and produce the response.

For dynamic content, "the server" is often two processes:

1. A _reverse proxy_ (nginx) accepting raw HTTP, handling TLS, applying rate limits, serving static assets directly.
2. An _application server_ (your Go binary, Node process, Python WSGI/ASGI app) handling the dynamic routes, fronted by the proxy.

Most production setups look like this. Chapters 6 and 7 cover the proxy half.

## Recap

- A web server accepts TCP connections, parses HTTP, routes the request, writes a response.
- HTTP/1.x is plain text. Request line, headers, blank line, body. `\r\n` line endings.
- Methods carry intent (read, create, replace). Status codes carry result. 4xx is the client; 5xx is the server.
- Keep-alive reuses connections to skip TCP/TLS handshake cost.
- HTTP/2 multiplexes streams over one connection. nginx terminates it for you.
- Static content comes from disk. Dynamic content comes from your application server, usually behind a reverse proxy.

Next chapter: speak HTTP yourself with `nc` and a few hundred lines of Go.
