---
title: 'Server-Sent Events'
subtitle: 'When the client only listens, SSE beats WebSockets in every dimension that matters — simpler protocol, free reconnect, plain HTTP. The default for one-way realtime.'
chapter: 5
level: 'intermediate'
readingTime: '11 min'
topics: ['sse', 'server-sent-events', 'realtime', 'http']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A radio broadcast — the station transmits continuously, listeners tune in and receive, and there's no mechanism for a listener to talk back. SSE is that model over HTTP: one direction, always on, free reconnect.

</Callout>

You read chapter 1's heuristic: if the client only consumes, choose SSE. This chapter is the case for it. By the end you will have an SSE server in Go, a browser client that reconnects automatically, and a clear sense of when SSE is the right tool and when WebSockets are.

## What SSE is

A Server-Sent Events stream is a long-running HTTP response with `Content-Type: text/event-stream`. The server writes UTF-8 text in a tiny line-based format; the browser's `EventSource` API parses each event and fires a callback.

The whole protocol fits in a paragraph. There are no frames, no opcodes, no masking. It is plain HTTP.

```
GET /events HTTP/1.1
Accept: text/event-stream
```

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: hello

data: world
event: notify
id: 42
data: {"text": "you got mail"}

retry: 5000
```

Every event is one or more `field: value` lines, terminated by a blank line. Fields:

- **`data:`** — the event payload. Multiple `data:` lines join with newlines.
- **`event:`** — the event name. Defaults to `"message"`. Browser routes by name.
- **`id:`** — a sequence ID. The browser remembers it and sends it as `Last-Event-ID` header on reconnect.
- **`retry:`** — milliseconds to wait before reconnecting. Browser respects it.

That is the whole format. RFC 6202 plus the `EventSource` spec.

## A Go SSE server

```go
// sse/main.go
package main

import (
    "fmt"
    "log"
    "net/http"
    "time"
)

func sseHandler(w http.ResponseWriter, r *http.Request) {
    flusher, ok := w.(http.Flusher)
    if !ok {
        http.Error(w, "streaming unsupported", http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")

    ticker := time.NewTicker(2 * time.Second)
    defer ticker.Stop()

    var seq int
    for {
        select {
        case <-r.Context().Done():
            log.Println("client gone")
            return

        case t := <-ticker.C:
            seq++
            fmt.Fprintf(w, "id: %d\n", seq)
            fmt.Fprintf(w, "event: tick\n")
            fmt.Fprintf(w, "data: %s\n\n", t.Format(time.RFC3339))
            flusher.Flush()
        }
    }
}

func main() {
    http.HandleFunc("/events", sseHandler)
    http.Handle("/", http.FileServer(http.Dir("static")))
    log.Println("sse on http://localhost:8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

Two pieces worth pointing at.

**`http.Flusher`** is the lever that turns a normal handler into a stream. Without `Flush()`, the response is buffered until the handler returns. With `Flush()` after each write, bytes go out immediately. Most Go web frameworks expose this.

**`r.Context().Done()`** fires when the client disconnects (TCP RST, browser tab closed, navigation). Always select on it. Without that, the goroutine ticks forever after the client is gone.

## Browser client

```html
<!doctype html>
<html>
	<body>
		<pre id="log"></pre>
		<script>
			const log = document.getElementById('log');
			const es = new EventSource('/events');

			es.onopen = () => (log.textContent += 'connected\n');
			es.onerror = (e) => (log.textContent += `error / reconnect...\n`);

			es.addEventListener('tick', (e) => {
				log.textContent += `tick: ${e.data}\n`;
			});
		</script>
	</body>
</html>
```

Three things `EventSource` does for you:

1. **Auto-reconnect.** If the connection drops, the browser retries. Default backoff a few seconds; server can override with `retry:`.
2. **Last-Event-ID resumption.** On reconnect, browser sends `Last-Event-ID: <last-id-it-saw>`. Server can resume from there — see below.
3. **Event routing.** `addEventListener("tick", cb)` only fires for events with `event: tick`. The default is `"message"`.

## Resumption with `Last-Event-ID`

If the network drops mid-stream, the browser reconnects with the `Last-Event-ID` header set to the most recent `id:` it saw. The server can then resume:

```go
lastID := r.Header.Get("Last-Event-ID")
if lastID != "" {
    // pull events from a buffer or DB starting after lastID
    for _, ev := range eventsAfter(lastID) {
        fmt.Fprintf(w, "id: %s\nevent: %s\ndata: %s\n\n", ev.ID, ev.Type, ev.JSON)
    }
    flusher.Flush()
}
// then continue with live events
```

This is at-least-once delivery for free, as long as you keep an event log. Postgres + a `seq` column, Redis Streams, Kafka, any append-only store works.

WebSockets do not have this built in. You build it yourself. SSE wins here.

## When SSE beats WebSockets

- **One-way push** — the entire reason the protocol exists.
- **HTTP middleboxes everywhere.** Corporate proxies that strip `Upgrade` headers, CDNs that buffer responses, ancient firewalls — SSE goes through. WebSockets sometimes don't.
- **Auth and routing infrastructure.** SSE is just HTTP. Your existing rate limiter, auth middleware, observability, log forwarding, CDN — they all work unchanged.
- **Free reconnection.** `EventSource` retries with backoff and resumes via `Last-Event-ID`. You write zero client code.
- **Simple debugging.** `curl -N https://example.com/events` shows the live stream. No `wscat` needed.

## When WebSockets beat SSE

- **Bidirectional.** SSE is server-to-client only. The client uses normal HTTP for sends.
- **Low-latency two-way.** The client-to-server path adds an HTTP round-trip; for chat-feel typing indicators, the latency adds up.
- **Binary frames.** SSE is text-only. Binary needs base64 — adds 33% overhead.
- **Browser limit.** Browsers cap concurrent `EventSource` connections per origin to ~6 (HTTP/1.1 limit). HTTP/2 lifts it. WebSockets are unlimited per origin.

For an admin dashboard with a "send command" button, the right shape is often SSE for receiving + plain `fetch` for sending. The button does `POST /actions`; the dashboard subscribes via SSE. Two protocols, both familiar, no WebSocket framing.

<Callout type="tip">

**A common pattern: SSE for read, REST for write.** The browser opens an `EventSource` for the live feed; user actions are normal `fetch` calls that the server processes and broadcasts back through SSE. Half the WebSocket protocol, none of the framing complexity.

</Callout>

## SSE behind nginx

Two nginx settings make or break SSE.

```nginx
location /events {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;          # critical
    proxy_read_timeout 24h;       # long-lived
    add_header X-Accel-Buffering no;
}
```

**`proxy_buffering off`** stops nginx from holding the response until it has a full buffer's worth. Without this, your tick events bunch up and arrive in batches.

**`proxy_read_timeout 24h`** lets the connection live longer than the default 60 seconds. SSE connections are meant to be long.

The `X-Accel-Buffering: no` response header tells nginx (and some CDNs) "do not buffer this response," in case the location block doesn't override.

## Heartbeats — keepalive comments

SSE has no protocol-level heartbeat. To keep middleboxes from closing idle connections, send a periodic comment:

```go
case <-keepalive.C:
    fmt.Fprint(w, ": keepalive\n\n")
    flusher.Flush()
```

Lines starting with `:` are comments. The browser ignores them. Send one every 15–30 seconds.

## Compression

SSE benefits from gzip just like any HTTP response:

```nginx
location /events {
    gzip on;
    gzip_types text/event-stream;
    ...
}
```

For JSON payloads, this halves bandwidth. Like `permessage-deflate` for WebSockets, the cost is CPU; for chat-rate traffic it is free.

## Scaling SSE

The architectural shape is the same as WebSockets:

- One process can hold tens of thousands of SSE connections (each is a goroutine and a TCP socket).
- Multiple processes need a pub/sub bus to fan out to clients connected to other processes.

Chapter 6 covers Redis pub/sub for both SSE and WebSocket workers. The pattern is identical — same broker, same fan-out, just different per-client output (SSE writes to `http.ResponseWriter`, WebSocket writes to `conn.Write`).

## SSE for AI/LLM streaming

A real-world case where SSE is dominant: streaming LLM responses. ChatGPT, Claude, every LLM API streams token deltas via SSE. Why:

- One-way push (the model produces, the client consumes).
- HTTP-native means it works through every proxy.
- The standard fits the use case perfectly: each token is one event.
- `Last-Event-ID` semantics map to "resume from this token."

If you build an AI app, SSE is almost certainly the right choice for the model output channel.

## Common SSE bugs

**1. Buffered output.** `proxy_buffering` not turned off in nginx, or the language's HTTP framework not flushing. Symptom: events arrive in batches, not live. Fix: explicit `Flush()` and proxy config.

**2. Forgot to close on disconnect.** The handler keeps writing to a closed connection because `http.ResponseWriter.Write` swallows errors. Fix: always select on `r.Context().Done()`.

**3. CORS for cross-origin SSE.** The browser respects CORS. If your SSE endpoint is on a different origin, set `Access-Control-Allow-Origin`.

**4. Unicode and the `data:` parser.** The browser splits on `\n` per the spec; multi-line `data:` payloads need each line prefixed. JSON one-liners avoid the issue.

```go
// safe: one data line per event
fmt.Fprintf(w, "data: %s\n\n", string(jsonBytes))
```

## Recap

- SSE = HTTP/1.1 streaming response with `Content-Type: text/event-stream`.
- Wire format is line-based: `data:`, `event:`, `id:`, `retry:`. Blank line ends an event.
- `EventSource` in browsers handles auto-reconnect and `Last-Event-ID` resumption for free.
- For one-way push, SSE beats WebSockets on simplicity, ops, and middlebox compatibility.
- For bidirectional, low-latency, or binary, WebSockets win.
- nginx: `proxy_buffering off`, long `proxy_read_timeout`, `X-Accel-Buffering no`.
- Heartbeats: comment lines (`:` prefix) every 15–30s.
- LLM streaming and most "live updates" features fit SSE perfectly.

Next: [Pub/sub at scale](/notes/websockets/06-pubsub-scale) — fanning out events across many WebSocket or SSE worker processes with Redis or NATS.
