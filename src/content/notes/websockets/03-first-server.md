---
title: "Your first server"
subtitle: "End-to-end Go WebSocket server in eighty lines, with a browser client. By the end you have an echo service plus a tiny chat room — both running on localhost, both real."
chapter: 3
level: "beginner"
readingTime: "11 min"
topics: ["websockets", "go", "coder/websocket", "browser"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Theory off. Code on.

This chapter ships a real WebSocket server in Go using `github.com/coder/websocket`. We start with a single-connection echo server, then expand it to a many-connection broadcast room. Both are tiny; both are foundations for everything in the rest of the track.

<Callout type="info">

**Real-World Analogy**

Building a WebSocket server is like setting up a walkie-talkie network — once the channel is open, anyone on the frequency can broadcast and everyone else hears it immediately.

</Callout>

## Setup

```bash
mkdir mywebsocket && cd mywebsocket
go mod init example.com/mywebsocket
go get github.com/coder/websocket
```

That is the dependency. Modern Go WebSocket library, ~3000 lines, idiomatic, context-aware, MIT licensed.

## The echo server

```go
// echo/main.go
package main

import (
    "context"
    "log"
    "net/http"
    "time"

    "github.com/coder/websocket"
)

func handleEcho(w http.ResponseWriter, r *http.Request) {
    c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
        OriginPatterns: []string{"localhost:*"},
    })
    if err != nil {
        log.Println("accept:", err)
        return
    }
    defer c.CloseNow()

    ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
    defer cancel()

    for {
        typ, data, err := c.Read(ctx)
        if err != nil {
            log.Println("read:", err)
            return
        }
        if err := c.Write(ctx, typ, data); err != nil {
            log.Println("write:", err)
            return
        }
    }
}

func main() {
    http.HandleFunc("/ws", handleEcho)
    http.Handle("/", http.FileServer(http.Dir("static")))

    log.Println("serving on http://localhost:8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

Read the moving parts.

**`websocket.Accept`** does the handshake — validates `Upgrade`, computes `Sec-WebSocket-Accept`, optionally negotiates extensions and subprotocols. Returns a `*websocket.Conn`. `OriginPatterns` whitelist restricts which origins may connect (see chapter 8 for the full pattern; for dev, `"localhost:*"` is fine).

**`c.CloseNow()` in `defer`** kills the connection if the handler exits without a clean close. Belt-and-braces — if anything panics or returns, the connection does not leak.

**`c.Read(ctx)` returns `(messageType, []byte, error)`.** Message type is `websocket.MessageText` or `websocket.MessageBinary`. The library reassembles fragments transparently — you see whole messages.

**`c.Write(ctx, typ, data)`** sends one frame. Atomic; no interleaving with other writers (the library has an internal write lock).

**Context timeout (10 min in this example)** caps how long any single read or write can block. For an echo server this is fine; for a real chat server with idle users, you want longer or no timeout (cancel on disconnect, not on idle).

## A browser client

```html
<!-- static/index.html -->
<!doctype html>
<html>
<body>
<input id="msg" placeholder="say something">
<button onclick="send()">send</button>
<pre id="log"></pre>

<script>
const ws = new WebSocket(`ws://${location.host}/ws`);
const log = document.getElementById("log");

ws.onopen    = () => log.textContent += "connected\n";
ws.onmessage = (e) => log.textContent += `recv: ${e.data}\n`;
ws.onclose   = (e) => log.textContent += `closed (${e.code})\n`;
ws.onerror   = (e) => log.textContent += `error\n`;

function send() {
  const v = document.getElementById("msg").value;
  ws.send(v);
  log.textContent += `sent: ${v}\n`;
}
</script>
</body>
</html>
```

```bash
mkdir static
# save the html above to static/index.html
go run ./echo
# serving on http://localhost:8080
```

Open `http://localhost:8080` in a browser, type something, press send. You see `sent: hello` then `recv: hello` — the echo round-tripped.

That is end-to-end WebSockets in Go: ~30 lines server, ~20 lines client, no external services.

## A real broadcast room

Echo is uninteresting. The actual primitive you want is "many clients connected; one client sends, all clients receive."

```go
// chat/main.go
package main

import (
    "context"
    "errors"
    "log"
    "net/http"
    "sync"
    "time"

    "github.com/coder/websocket"
)

type Room struct {
    mu      sync.Mutex
    clients map[*Client]struct{}
}

type Client struct {
    conn *websocket.Conn
    out  chan []byte
}

func (r *Room) add(c *Client) {
    r.mu.Lock()
    r.clients[c] = struct{}{}
    r.mu.Unlock()
}

func (r *Room) remove(c *Client) {
    r.mu.Lock()
    delete(r.clients, c)
    r.mu.Unlock()
    close(c.out)
}

func (r *Room) broadcast(data []byte) {
    r.mu.Lock()
    defer r.mu.Unlock()
    for c := range r.clients {
        select {
        case c.out <- data:
        default:
            // slow client: drop the message rather than blocking the room
        }
    }
}

func (r *Room) handle(w http.ResponseWriter, req *http.Request) {
    conn, err := websocket.Accept(w, req, &websocket.AcceptOptions{
        OriginPatterns: []string{"localhost:*"},
    })
    if err != nil {
        log.Println("accept:", err)
        return
    }
    defer conn.CloseNow()

    client := &Client{conn: conn, out: make(chan []byte, 64)}
    r.add(client)
    defer r.remove(client)

    ctx, cancel := context.WithCancel(req.Context())
    defer cancel()

    // writer goroutine: drains outbound queue
    go func() {
        for msg := range client.out {
            wctx, wcancel := context.WithTimeout(ctx, 5*time.Second)
            err := conn.Write(wctx, websocket.MessageText, msg)
            wcancel()
            if err != nil {
                cancel() // signal the reader to stop
                return
            }
        }
    }()

    // reader: loops until disconnect
    for {
        _, data, err := conn.Read(ctx)
        if err != nil {
            if !errors.Is(err, context.Canceled) {
                log.Println("read:", err)
            }
            return
        }
        r.broadcast(data)
    }
}

func main() {
    room := &Room{clients: map[*Client]struct{}{}}

    http.HandleFunc("/ws", room.handle)
    http.Handle("/", http.FileServer(http.Dir("static")))

    log.Println("chat on http://localhost:8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

Open two browser tabs. Send from one — it shows up in the other. That is the foundational pattern: per-connection reader and writer goroutines, a room map, broadcast pushing into per-client channels.

## Why one writer goroutine per client

A `*websocket.Conn` allows concurrent read and write, but only one writer at a time per direction. The library has internal locking, but if multiple goroutines call `Write` concurrently the messages can interleave (under the locking) in unhelpful ways.

The clean pattern is **one goroutine per direction**:

- **Reader goroutine:** the HTTP handler itself, looping on `conn.Read`.
- **Writer goroutine:** drains a per-client `chan []byte`, calls `conn.Write` one message at a time.

Anyone who wants to send to a client pushes onto the channel — they never call `Write` directly. The channel decouples the sender from the network, and the writer goroutine serializes everything cleanly.

## Handling slow clients

The `select` in `broadcast` is critical:

```go
select {
case c.out <- data:
default:
    // drop
}
```

If the client's outbound channel is full (slow consumer, slow network), broadcasting blocks. With many clients, one slow client stalls the whole room. The `default` case drops the message rather than blocking — the slow client misses an update, but other clients are unaffected.

Other policies are possible:

- **Drop oldest.** Pop one from the channel before pushing.
- **Disconnect slow clients.** If their channel is full N times in a row, close the connection.
- **Block (bad).** Don't.

Chapter 9 covers backpressure in detail. For now, dropping is the right default.

<Callout type="warn">

**Never call `conn.Write` directly from the broadcast loop.** A single slow client would block the whole room, which is exactly the failure mode the writer goroutine was designed to avoid. Always push to a buffered channel; let the writer goroutine handle the network call.

</Callout>

## Graceful close

`conn.CloseNow()` slams the connection shut without a close handshake — appropriate when we are abandoning the connection due to error.

For a clean close, use `conn.Close(code, reason)`:

```go
conn.Close(websocket.StatusNormalClosure, "")
```

This sends a close frame, waits briefly for the peer's reply, then closes TCP. Clean for the peer; the JS `onclose` event reports `code=1000`.

Add it on shutdown:

```go
sigs := make(chan os.Signal, 1)
signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
go func() {
    <-sigs
    log.Println("shutting down...")
    room.mu.Lock()
    for c := range room.clients {
        c.conn.Close(websocket.StatusGoingAway, "server shutting down")
    }
    room.mu.Unlock()
    os.Exit(0)
}()
```

Status `1001 GoingAway` is the signal for "I am leaving on purpose." Browser clients can branch on it to decide whether to reconnect. Chapter 9 has the full reconnect protocol.

## Adding `wscat` to your toolkit

`wscat` is the WebSocket equivalent of `curl`. Indispensable for testing servers without spinning up a browser.

```bash
npm install -g wscat
wscat -c ws://localhost:8080/ws
> hello
< hello
```

Or send custom Origin headers, custom subprotocols, etc. Read the manpage; it is small.

## Concurrency and limits

A naive Go server using one goroutine per connection scales surprisingly far. On a small VPS:

- ~10K concurrent connections is comfortable.
- ~50K is tight but possible if your messages are small and infrequent.
- Beyond that, look at `evio` / `gnet` (epoll-based, fewer goroutines) or split work across multiple processes.

Each connection costs:

- One goroutine for read (~8 KB stack initially).
- One goroutine for write (~8 KB stack).
- One channel buffer (the `out` chan; ~64 × message-size).
- One file descriptor.

Total ~50–100 KB per idle connection, plus whatever your message buffers are. Tune the OS limits for high counts (chapter 10).

## A common bug: the reader does not see disconnects

If you call only `conn.Write` and never `conn.Read`, you will not detect when the client disconnects until your write finally fails. That can be minutes.

**The reader goroutine is not optional**, even if you have no messages from the client to handle. It exists to:

1. Drain control frames (pings, close).
2. Detect disconnects promptly.

For a server-push-only service, the reader loop just discards everything:

```go
go func() {
    for {
        _, _, err := conn.Read(ctx)
        if err != nil {
            cancel()
            return
        }
    }
}()
```

Cheap. Always present.

## Recap

- `coder/websocket` handles handshake, framing, fragmentation, control frames.
- `Accept(w, r, opts)` upgrades; `Read(ctx)` and `Write(ctx, typ, data)` move messages.
- One reader goroutine and one writer goroutine per connection. Always.
- Broadcast pushes to per-client channels; never call `Write` directly from a fan-out loop.
- Slow clients: drop messages with `select { ... default: }`. Disconnect after N drops.
- `Close(code, reason)` for graceful shutdown; `CloseNow` for emergency.
- Tools: `wscat` for command-line WS testing.
- Reader is mandatory even on push-only services to detect disconnects and handle pings.

Next: [Message protocols on top](/notes/websockets/04-message-protocols) — JSON, msgpack, framing, versioning, and the request/response patterns you build on raw frames.

