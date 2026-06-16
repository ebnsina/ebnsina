---
title: "Building a Real HTTP/1.1 Parser"
subtitle: "Request bodies, Content-Length, chunked transfer encoding, and the dozen edge cases that turn a toy parser into one you would trust in production."
chapter: 3
level: "beginner"
readingTime: "13 min"
topics: ["http", "parser", "chunked encoding", "go", "request body"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Reading a letter but stopping after the envelope — the address tells you who it's for, but the contents are the point. A parser that ignores the body has read the envelope and thrown away the letter.

</Callout>

## What our toy server can't do

The chapter-2 server only handles `GET`. If a client sends `POST /api HTTP/1.1` with a JSON body, we read the request line and headers, then ignore the body. The body sits in the kernel's receive buffer; the next read on this socket returns it as garbage; the server falls apart.

To handle bodies correctly, the parser must:

1. Recognize that there *is* a body — by `Content-Length` or `Transfer-Encoding: chunked`.
2. Read exactly the right number of bytes (no more, no less).
3. Stop at the boundary so the next request on a keep-alive connection starts cleanly.

This is what real HTTP/1.1 parsers spend most of their lines on.

## Three ways a body ends

HTTP/1.1 has exactly three valid signals for "the body is over":

**1. Content-Length: N** — read exactly N bytes after the blank line.

```text
POST /api HTTP/1.1
Host: example.com
Content-Length: 18

{"name":"Fatima"}
```

After the blank line, read 18 bytes. Stop. Done.

**2. Transfer-Encoding: chunked** — read chunks until a zero-length chunk arrives.

```text
POST /upload HTTP/1.1
Host: example.com
Transfer-Encoding: chunked

7
Mozilla
9
Developer
7
Network
0

```

Each chunk is `<size in hex>\r\n<data>\r\n`. A `0\r\n\r\n` terminates the body.

**3. Connection: close** — the body runs to EOF. Server closes the socket, client reads until the read returns 0 bytes. Used by HTTP/1.0 and by responses without a known length.

A correct parser handles all three. Anything else (a `POST` with neither `Content-Length` nor chunked) is malformed — return `400 Bad Request`.

## Adding bodies to our Go server

Extending chapter 2's server. The new function reads the body once headers are parsed:

```go
func readBody(reader *bufio.Reader, headers map[string]string) ([]byte, error) {
    if cl, ok := headers["content-length"]; ok {
        n, err := strconv.Atoi(cl)
        if err != nil || n < 0 {
            return nil, errors.New("invalid Content-Length")
        }
        if n > maxBodySize {
            return nil, errors.New("body too large")
        }
        body := make([]byte, n)
        _, err = io.ReadFull(reader, body)
        return body, err
    }
    if te, ok := headers["transfer-encoding"]; ok && te == "chunked" {
        return readChunked(reader)
    }
    return nil, nil // no body
}
```

`io.ReadFull` keeps reading until exactly `n` bytes are obtained, or it returns an error. Note we cap with `maxBodySize` (say 10MB) to prevent a malicious client from sending `Content-Length: 999999999999`.

## Implementing chunked decoding

```go
const maxChunkSize = 1 << 20 // 1MB per chunk

func readChunked(reader *bufio.Reader) ([]byte, error) {
    var body bytes.Buffer
    for {
        // Read the chunk size line
        line, err := reader.ReadString('\n')
        if err != nil {
            return nil, err
        }
        line = strings.TrimRight(line, "\r\n")
        // Hex chunk size; ignore any chunk extensions after `;`
        if idx := strings.IndexByte(line, ';'); idx >= 0 {
            line = line[:idx]
        }
        size, err := strconv.ParseInt(line, 16, 64)
        if err != nil || size < 0 {
            return nil, errors.New("invalid chunk size")
        }
        if size == 0 {
            // Read trailing CRLF after the zero-length chunk
            reader.ReadString('\n')
            return body.Bytes(), nil
        }
        if size > maxChunkSize {
            return nil, errors.New("chunk too large")
        }
        if int64(body.Len())+size > maxBodySize {
            return nil, errors.New("body too large")
        }
        chunk := make([]byte, size)
        if _, err := io.ReadFull(reader, chunk); err != nil {
            return nil, err
        }
        body.Write(chunk)
        // Consume the CRLF after the chunk data
        if _, err := reader.ReadString('\n'); err != nil {
            return nil, err
        }
    }
}
```

Notes:

- Chunk sizes are **hexadecimal** in the wire format (`7` is 7 bytes, `1F` is 31 bytes). Easy to forget — many homemade parsers fail silently on chunks of size 10–15.
- Each chunk has a *trailing* `\r\n` that you must consume.
- The terminator is a chunk of size 0, optionally followed by trailers (more headers), then a final `\r\n`. Most clients omit trailers; your parser still has to swallow the extra `\r\n`.
- Chunk extensions (after a `;`) exist in the spec but are essentially never used. Skip them.

## The dozen edge cases real parsers handle

A homemade parser usually passes "happy path" tests immediately, then dies on adversarial inputs. The list below is the difference between a weekend project and `net/http`.

**1. Header line folding.** Old HTTP allowed headers to wrap across multiple lines. `Host: \r\n example.com` is the same as `Host: example.com`. Modern HTTP/1.1 has deprecated this; reject it.

**2. Duplicate headers.** `Set-Cookie: a=1\r\nSet-Cookie: b=2` is two cookies, not one overwriting the other. The parser must store the list. Most other headers (`Content-Length`, `Host`) appearing twice should be a `400`.

**3. Header injection.** `User-Agent: evil\r\nX-Admin: true` — a client could try to smuggle an extra header by embedding `\r\n` in a value. Reject any header value containing CR or LF.

**4. Case-insensitive header names.** `Content-Length`, `content-length`, `CONTENT-LENGTH` are all the same header. Always normalize to lowercase before lookups.

**5. Whitespace tolerance.** `Content-Length: 18` and `Content-Length:18` are both valid; `Content-Length : 18` is not (space before the colon). Trim around the value, not around the name.

**6. Request smuggling.** A request with both `Content-Length` and `Transfer-Encoding: chunked` is dangerous — different proxies along the path may interpret each differently, allowing an attacker to "smuggle" a hidden second request inside the first. The safe behavior: if both are present, reject with `400`. **Always.**

**7. Massive headers.** Limit the total header section size (commonly 8KB or 16KB). Otherwise an attacker can send a 1GB header line and OOM you.

**8. Truncated input.** The client closes the socket halfway through sending. Read errors must close the connection cleanly without crashing.

**9. Slow clients (Slowloris).** A client sends one byte every 30 seconds. The connection is open but unproductive. Always set a `ReadHeaderTimeout` (e.g., 5–10 seconds) so the parser does not hang forever.

**10. Pipelined requests.** A client may have already sent the next request after this one's body. After the response, the parser must be ready for *another* request without losing buffered bytes. `bufio.Reader` does this naturally — your `for` loop just continues.

**11. CRLF vs LF.** Spec says CRLF; many clients send LF. Be lenient on input, strict on output (RFC 9110 actually still requires CRLF on input, but real parsers are forgiving).

**12. Encoding.** Headers must be ASCII (or 7-bit). Non-ASCII characters in headers must be percent-encoded or rejected. The body can be anything; that is the application's problem.

<Callout type="warn">

**Header injection (#3) and request smuggling (#6) are classified vulnerabilities** that have produced real-world breaches at companies you have heard of. If you ship a homemade parser, you must defend against both.

</Callout>

## A complete parser, with limits

Here is the chapter-2 server, extended with body parsing and the most important limits:

```go
// main.go (excerpt)
const (
    maxRequestLine = 8 * 1024
    maxHeaderSize  = 16 * 1024
    maxBodySize    = 10 * 1024 * 1024
)

func parseRequest(reader *bufio.Reader) (method, path string, headers map[string]string, body []byte, err error) {
    // 1. Request line
    line, err := readLine(reader, maxRequestLine)
    if err != nil {
        return "", "", nil, nil, err
    }
    parts := strings.SplitN(line, " ", 3)
    if len(parts) != 3 {
        return "", "", nil, nil, errors.New("malformed request line")
    }
    method, path = parts[0], parts[1]
    if parts[2] != "HTTP/1.1" && parts[2] != "HTTP/1.0" {
        return "", "", nil, nil, errors.New("unsupported HTTP version")
    }

    // 2. Headers
    headers = map[string]string{}
    headerBytes := 0
    for {
        h, err := readLine(reader, maxHeaderSize)
        if err != nil {
            return "", "", nil, nil, err
        }
        if h == "" {
            break
        }
        headerBytes += len(h)
        if headerBytes > maxHeaderSize {
            return "", "", nil, nil, errors.New("headers too large")
        }
        i := strings.IndexByte(h, ':')
        if i < 0 {
            return "", "", nil, nil, errors.New("malformed header")
        }
        name := strings.ToLower(strings.TrimSpace(h[:i]))
        val := strings.TrimSpace(h[i+1:])
        if strings.ContainsAny(val, "\r\n") {
            return "", "", nil, nil, errors.New("header injection")
        }
        // Reject duplicate Content-Length / Transfer-Encoding combos
        if (name == "content-length" || name == "transfer-encoding") && headers[name] != "" {
            return "", "", nil, nil, errors.New("duplicate length headers")
        }
        headers[name] = val
    }
    if _, hasCL := headers["content-length"]; hasCL {
        if _, hasTE := headers["transfer-encoding"]; hasTE {
            return "", "", nil, nil, errors.New("conflicting length headers")
        }
    }

    // 3. Body
    body, err = readBody(reader, headers)
    return method, path, headers, body, err
}

func readLine(reader *bufio.Reader, max int) (string, error) {
    line, err := reader.ReadString('\n')
    if err != nil {
        return "", err
    }
    if len(line) > max {
        return "", errors.New("line too long")
    }
    return strings.TrimRight(line, "\r\n"), nil
}
```

This is now a respectable HTTP/1.1 parser. Pair it with the accept loop from chapter 2 and you have something you could put in front of a small app.

## Stress-testing your parser

Once you have a parser, throw bad inputs at it. A simple script:

```bash
# Truncated request
printf 'GET /' | nc localhost 8080

# Empty body but Content-Length says 100
printf 'POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n\r\n' | nc localhost 8080

# Both Content-Length and Transfer-Encoding (smuggling attempt)
printf 'POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n' | nc localhost 8080

# Header injection attempt
printf 'GET / HTTP/1.1\r\nHost: x\r\nX-Test: a\r\nX-Admin: yes\r\n\r\n' | nc localhost 8080

# Massive header
yes 'X-Spam: AAAAAAAAAAAA' | head -10000 | { printf 'GET / HTTP/1.1\r\nHost: x\r\n'; cat; printf '\r\n'; } | nc localhost 8080
```

A parser that does not crash, does not hang, and returns sane error responses to all of these is doing its job.

## When to stop and use a real library

Right about now. The point of writing your own parser is to understand what `net/http` does. Writing it correctly to production-grade — handling every edge case in RFC 9112, surviving every fuzzing input, hitting acceptable throughput — is months of work. Use the standard library.

The mental model you have built is what carries forward:

- A request is a line, headers, blank line, body.
- The body length is signaled by `Content-Length` or chunked encoding.
- Limits are not optional; they are the difference between a server and a denial-of-service vulnerability.

In chapter 4, we look at the *concurrency* model — how a server with this parser scales to thousands of concurrent connections without spawning thousands of threads.

## Recap

- HTTP/1.1 bodies end via `Content-Length`, chunked encoding, or socket close.
- Chunked encoding has a hex size, then bytes, then CRLF; a zero-size chunk terminates.
- Real parsers handle a dozen edge cases: header injection, duplicate length headers, slow clients, large inputs, pipelining.
- Always cap header and body sizes and set timeouts. Defaults are denial-of-service vectors.
- Once you have written the parser by hand, switch to `net/http` (or your language's equivalent) for real work.

Next chapter: how the same parser scales to many connections — the threading and event-loop choices behind every web server.

