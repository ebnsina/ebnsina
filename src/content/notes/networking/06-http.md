---
title: "HTTP/1.1, HTTP/2, and HTTP/3"
subtitle: "The evolution of the web's protocol — from text-based request/response to multiplexed streams over QUIC."
chapter: 6
level: "intermediate"
readingTime: "17 min"
topics: ["HTTP", "HTTP/2", "HTTP/3", "QUIC", "multiplexing"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## HTTP/1.1 — The Foundation

HTTP/1.1 is text-based and simple. One request, one response, over a TCP connection.

<Callout type="info">

**Real-World Analogy**

Like filling out forms at a government office — you submit a form (request) with specific fields (headers), wait for processing, and receive a response with a status: "Approved" (200), "Wrong form" (400), "Come back later" (503).

</Callout>

```typescript
// HTTP/1.1 request (what your browser actually sends)
const request = `GET /api/users HTTP/1.1\r
Host: api.example.com\r
Accept: application/json\r
Connection: keep-alive\r
\r\n`;

// HTTP/1.1 response
const response = `HTTP/1.1 200 OK\r
Content-Type: application/json\r
Content-Length: 27\r
\r
{"users": [{"id": 1}]}`;
```

### The Problem: Head-of-Line Blocking

HTTP/1.1 processes requests **sequentially** on each connection. If request #1 is slow, requests #2 and #3 wait behind it — even if the server could answer them instantly.

Workarounds (all have downsides):
- **Multiple connections** — browsers open 6 parallel connections per domain (wastes resources)
- **Domain sharding** — serve assets from `img1.example.com`, `img2.example.com` (DNS overhead)
- **Bundling** — combine many files into one (can't cache individually)

## HTTP/2 — Multiplexing

HTTP/2 solves head-of-line blocking by multiplexing many requests over a **single TCP connection** using streams.

```typescript
// HTTP/2 sends binary frames, not text
interface HTTP2Frame {
  length: number;
  type: "HEADERS" | "DATA" | "SETTINGS" | "PUSH_PROMISE" | "GOAWAY";
  flags: number;
  streamId: number; // which request this frame belongs to
  payload: Uint8Array;
}

// Multiple requests fly simultaneously on one connection:
// Stream 1: GET /api/users     → response body chunk 1
// Stream 3: GET /api/posts     → response body chunk 1
// Stream 1: (continued)        → response body chunk 2
// Stream 5: GET /style.css     → complete response
// Stream 3: (continued)        → response body chunk 2

// No waiting! Responses interleave freely.
```

### Key HTTP/2 Features

```typescript
// 1. Header compression (HPACK)
// Headers like Host, Accept, Cookie repeat on every request
// HPACK compresses them using a shared dictionary
// Reduces header overhead from ~800 bytes to ~20 bytes for repeat requests

// 2. Server Push (mostly deprecated)
// Server can proactively send resources before client asks
// Rarely used in practice — hard to get right

// 3. Stream prioritization
// Client can hint which responses matter most
// Browser: "HTML first, then CSS, then images"
```

<Callout type="info">

**HTTP/2 still has a problem**: It runs over TCP, and TCP treats ALL streams as one byte stream. If one TCP packet is lost, ALL streams stall until it's retransmitted — TCP-level head-of-line blocking.

</Callout>

## HTTP/3 — QUIC

HTTP/3 replaces TCP with **QUIC** (built on UDP). Each stream is independent at the transport layer — a lost packet in stream 1 doesn't block stream 3.

```typescript
// QUIC advantages over TCP:

// 1. Independent streams — no head-of-line blocking
// Lost packet in stream A? Stream B keeps flowing.

// 2. Faster connection setup
// TCP: 1 RTT handshake + 1 RTT TLS = 2 RTT before data
// QUIC: 1 RTT for connection + TLS combined
// QUIC 0-RTT: reconnecting to known server = 0 RTT!

// 3. Connection migration
// TCP connections are tied to (srcIP, srcPort, dstIP, dstPort)
// Switch from WiFi to cellular? TCP connection dies.
// QUIC uses connection IDs — survives network changes.

interface QUICConnection {
  connectionId: Uint8Array; // survives IP changes
  streams: Map<number, QUICStream>;
  tlsState: TLSState; // encryption is built-in, not layered on
}

interface QUICStream {
  id: number;
  state: "open" | "half-closed" | "closed";
  sendBuffer: Uint8Array[];
  recvBuffer: Uint8Array[];
  // Each stream has independent flow control
  // and independent loss recovery
}
```

## Protocol Comparison

| Feature | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---------|----------|--------|--------|
| Transport | TCP | TCP | QUIC (UDP) |
| Multiplexing | No (1 req/conn) | Yes (streams) | Yes (independent streams) |
| Header format | Text | Binary (HPACK) | Binary (QPACK) |
| HOL blocking | Application + TCP | TCP only | None |
| Connection setup | 2-3 RTT | 2-3 RTT | 1 RTT (0-RTT reconnect) |
| Connection migration | No | No | Yes |

## What to Use

```typescript
// In practice, you don't choose — the browser negotiates.
// Your job is to enable HTTP/2 and HTTP/3 on your server.

// Nginx HTTP/2 config
// listen 443 ssl http2;

// Caddy enables HTTP/2 and HTTP/3 by default
// example.com {
//   reverse_proxy localhost:3000
// }

// Node.js HTTP/2
import http2 from "node:http2";

const server = http2.createSecureServer({
  key: readFileSync("server.key"),
  cert: readFileSync("server.crt"),
});

server.on("stream", (stream, headers) => {
  stream.respond({ ":status": 200, "content-type": "text/plain" });
  stream.end("Hello HTTP/2!");
});

server.listen(443);
```

<Callout type="tip">

**For most developers**: Enable HTTP/2 on your reverse proxy (Nginx, Caddy, CloudFlare) and you're done. HTTP/3 adoption is growing fast — CloudFlare and major CDNs already support it.

</Callout>

## Key Takeaways

1. **HTTP/1.1's sequential model** forced workarounds like bundling and domain sharding
2. **HTTP/2 multiplexes streams** over one TCP connection but still has TCP-level HOL blocking
3. **HTTP/3 (QUIC) eliminates HOL blocking** entirely with independent streams over UDP
4. **Connection migration** (QUIC) is critical for mobile — WiFi/cellular switching is seamless
5. **Enable HTTP/2+ on your reverse proxy** — don't worry about it in application code

