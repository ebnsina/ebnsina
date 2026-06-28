---
title: 'WebSockets & realtime — Roadmap'
subtitle: "Ten chapters that go from 'what is the WebSocket handshake' to a self-hosted, horizontally scaled realtime server with Redis pub/sub, presence, auth, and nginx in front."
chapter: 0
level: 'beginner'
readingTime: '5 min'
topics: ['roadmap', 'websockets', 'sse', 'realtime', 'pubsub']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What you will be able to do at the end

You will know exactly what a WebSocket is at the wire level, when to use one and when SSE or polling is the right call, how to write a Go server that handles thousands of concurrent connections, how to fan out messages across many server processes with Redis or NATS, how to track presence, and how to deploy the whole thing self-hosted behind nginx with TLS and sane timeouts.

<Callout type="info">

**Prereqs:** finish **Linux & VPS basics**, **Networking**, and **Web Server fundamentals**. WebSockets ride on HTTP/1.1 Upgrade — without those tracks, "why does nginx drop the connection at 60 seconds" mystifies you. Go is the primary language; the patterns translate to Node and Python.

</Callout>

## The 10 chapters, in order

**Foundations**

1. **What WebSockets are and when to use them** — vs SSE, vs polling, vs gRPC streams
2. **The handshake and frame protocol** — Upgrade, masking, opcodes, close codes
3. **Your first server** — Go, end-to-end, in 80 lines
4. **Message protocols on top** — JSON, msgpack, framing, versioning

**Real services**

5. **Server-Sent Events** — when one-way is enough, and how to do it well
6. **Pub/sub at scale** — Redis and NATS, fan-out across processes
7. **Presence and rooms** — tracking who is online, joining channels
8. **Auth, origin, rate limits** — production-safe connection handshakes

**Production**

9. **Backpressure, reconnects, heartbeats** — surviving slow clients and bad networks
10. **Production self-host** — nginx, systemd, observability, scaling out

## How to use this track

Read in order. The first three chapters explain what a WebSocket is and ship a working server. From chapter 4 onward each chapter adds a real production capability. Total reading time: ~3 hours. Hands-on time, the first time you build it all: a long weekend.

You need Go 1.22+, Redis (for chapter 6 onward), and a VPS with a domain pointed at it for chapter 10. Everything else runs on `localhost`.
