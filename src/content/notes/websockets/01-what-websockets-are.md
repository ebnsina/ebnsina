---
title: 'What WebSockets are and when to use them'
subtitle: 'A WebSocket is a bidirectional, persistent TCP connection that starts life as an HTTP request. Useful when neither REST nor RPC fits. Misused often.'
chapter: 1
level: 'beginner'
readingTime: '10 min'
topics: ['websockets', 'sse', 'realtime', 'polling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A WebSocket is the answer to "I need to push to a browser, low-latency, both directions, on a connection that stays open." It is one of the few protocols that browsers speak natively that is not request-response. Every other shape — REST, GraphQL, gRPC — assumes the client speaks first.

That property changes what kinds of features you can ship. It also opens a category of bugs that does not exist for stateless protocols.

<Callout type="info">

**Real-World Analogy**

HTTP is like sending letters — you write, wait for a reply, and repeat; a WebSocket is a live phone call where both sides can speak freely at any moment.

</Callout>

## The big picture

A WebSocket starts as a regular HTTP/1.1 GET request with `Upgrade: websocket`. The server agrees, the connection switches protocols, and from that point it is a raw bidirectional pipe carrying **frames** (small length-prefixed binary records). Either side sends frames at any time. The connection lives until somebody closes it or the network drops.

```
Client                                    Server
  |  GET /ws HTTP/1.1                       |
  |  Upgrade: websocket                     |
  |  Sec-WebSocket-Key: dGhlIHNhbXBsZQ==    |
  |---------------------------------------->|
  |                                         |
  |  HTTP/1.1 101 Switching Protocols       |
  |  Upgrade: websocket                     |
  |  Sec-WebSocket-Accept: ...              |
  |<----------------------------------------|
  |                                         |
  |  [text frame] {"type":"hello"}          |
  |---------------------------------------->|
  |                                         |
  |  [text frame] {"type":"world"}          |
  |<----------------------------------------|
  |  [binary frame] <bytes>                 |
  |<----------------------------------------|
  |                                         |
  |  [close frame] 1000 normal              |
  |---------------------------------------->|
  |  [close frame] 1000 normal              |
  |<----------------------------------------|
```

The handshake is HTTP. The post-handshake traffic is its own protocol (RFC 6455). Knowing both halves lets you debug the parts that are misconfigured.

## The four shapes of "realtime"

|                              | Direction       | Connection                       | Latency              | Browser native   |
| ---------------------------- | --------------- | -------------------------------- | -------------------- | ---------------- |
| **Polling**                  | client → server | one per poll                     | high (poll interval) | yes              |
| **Long-polling**             | client → server | one per cycle, idle until update | medium               | yes              |
| **SSE** (Server-Sent Events) | server → client | one persistent                   | low                  | yes              |
| **WebSockets**               | both            | one persistent                   | low                  | yes              |
| **gRPC streams**             | both            | one persistent (HTTP/2)          | low                  | no (needs proxy) |

Picking the wrong one is a category of bug.

**Polling** is fine for "this might change every 30 seconds and the user won't notice 5 seconds of staleness." Order status pages, deploy dashboards, anything where exact timing does not matter.

**Long-polling** is what jQuery did before SSE. Mostly historical now; SSE replaces it cleanly.

**SSE** is the unsung hero. One-way (server pushes, client receives), works through any HTTP proxy, auto-reconnects in the browser, dead simple to implement. Most "realtime" features (notifications, live counters, log tails) only need one-way push. **If one direction is enough, choose SSE first.** Chapter 5 has the full pattern.

**WebSockets** when you actually need bidirectional traffic with low latency: chat, collaborative editing, multiplayer games, agent control, live trading.

**gRPC streaming** when both ends are services (or your client SDK ships gRPC-Web with a proxy). Native browser support is limited.

<Callout type="warn">

**WebSockets are not a magic upgrade for "more realtime."** A REST endpoint polled every 200 ms is faster than a WebSocket reconnecting every 30 s. The win is not in the protocol; it is in the _connection model_ — one persistent pipe avoids the per-call overhead. If your data updates once a minute, polling is the right answer.

</Callout>

## When WebSockets are right

- **Chat, comments, presence.** Both sides type at unpredictable times.
- **Collaborative editing.** Operational transforms or CRDTs flowing in both directions.
- **Multiplayer games.** State sync, input events, low-latency.
- **Live agent UIs.** Server pushes status, client sends control commands.
- **Streaming dashboards** where the user can also configure filters live.

A heuristic: **does the client need to send data on the same connection without a request/response handshake?** If yes, WebSocket. If the client only consumes, SSE. If the client only sends bursts, batched HTTP.

## When WebSockets are wrong

- **You only push, the client never sends.** SSE — half the protocol, twice the simplicity.
- **You only get bursts of writes.** Just POST. Connection setup cost is not worth it.
- **You need request/response semantics with retries and per-call timeouts.** REST or gRPC.
- **The data shape is rigid and typed.** gRPC streaming gives you protobuf + HTTP/2 with the same persistent connection model.
- **Your traffic crosses an HTTP proxy you don't control.** Some proxies do not support `Upgrade`. SSE works everywhere HTTP/1.1 works.

## The mental model

A WebSocket is two state machines (one per side) sending frames over a single TCP connection. There is no concept of "request" or "response" once the handshake completes. There are no headers per message. Either side can send a frame at any time, including a close frame.

This sounds simple. The complications:

1. **Connections are stateful and long-lived.** A server holding 50,000 WebSocket connections is holding 50,000 file descriptors and 50,000 goroutines (in Go) or 50,000 sockets (in Node). Tuning the OS and the runtime matters.
2. **Messages are unordered across connections.** Two messages on the same connection arrive in order. Two messages on two connections do not.
3. **No built-in delivery guarantees.** A frame sent that the kernel buffered and the network dropped is gone. If you need at-least-once, you build it on top.
4. **No request/response correlation.** If the client wants a reply to a message, you build a request ID system on top.

Chapters 4 and 9 cover the protocol design choices that make these manageable.

## What rides on top — the message protocol

Raw WebSocket frames carry text or binary bytes. Above that, you choose your own protocol:

- **JSON over text frames** — the default for browser apps. Easy to debug, slow to parse at scale.
- **MessagePack or CBOR over binary frames** — compact, fast, polyglot. Worth it for high-volume traffic.
- **Protobuf over binary frames** — same protobuf you used in gRPC. Strict schemas, fast, polyglot.
- **Custom binary** — for games where every byte matters.

Most apps land on JSON until benchmarks demand otherwise. Chapter 4 walks through the tradeoffs and the framing decisions you need to make either way.

## The libraries you will use

**Go:** `github.com/coder/websocket` (formerly `nhooyr.io/websocket`). Modern, idiomatic, context-aware, uses `net/http` directly. Replaces the older `gorilla/websocket` (still maintained but with a clunkier API).

**Node:** `ws` for the server, the native browser `WebSocket` API for the client.

**Python:** `websockets` (asyncio-native) or `aiohttp` for integrated HTTP + WS.

**Browser:** `new WebSocket(url)` is built in. Or `partysocket` / `reconnecting-websocket` for auto-reconnect.

This track uses Go with `coder/websocket`. The patterns translate directly.

## What "realtime" actually means

Three latency tiers worth keeping in mind:

- **Under 50 ms end-to-end** — interactive, feels instant. Multiplayer games, live cursor positions, voice/video signaling.
- **Under 500 ms end-to-end** — feels fast. Chat, notifications, presence updates.
- **Under 5 s end-to-end** — feels live. Dashboards, comment threads, deploy progress.

WebSockets get you into all three, but most of the latency is your code, not the protocol. A WebSocket message with a database write and a fan-out to 1000 subscribers can easily blow 500 ms — not because of WebSockets, but because of everything else. Knowing which tier you need shapes architecture choices later.

## What we ship by chapter 10

A self-hosted Go service that:

- Accepts WebSocket connections at `wss://example.com/ws` (TLS, behind nginx).
- Verifies a session/token at the handshake (chapter 8).
- Joins clients to rooms (chapter 7).
- Pushes messages from one process to clients connected to other processes via Redis pub/sub (chapter 6).
- Survives slow clients with bounded buffers and drop policies (chapter 9).
- Runs as a systemd service with metrics, logs, and graceful shutdown (chapter 10).

Same operational shape as the GraphQL and gRPC tracks. Vendor-neutral, on a VPS, no managed services.

## Recap

- WebSocket = HTTP/1.1 Upgrade + bidirectional frames over one TCP connection.
- Compare with polling, long-polling, SSE, gRPC streams. SSE is the right call surprisingly often.
- Right for chat, collaboration, games, agent UIs. Wrong when one direction is enough or when you need request/response.
- Long-lived connections mean OS tuning and stateful server-side bookkeeping.
- Message protocol on top is your choice — JSON for ease, msgpack/protobuf for scale.
- Library: `coder/websocket` for Go in this track. Patterns generalize.

Next: [The handshake and frame protocol](/notes/websockets/02-handshake-frames) — what's actually on the wire, byte by byte.
