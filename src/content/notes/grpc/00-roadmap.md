---
title: 'gRPC Building — Roadmap'
subtitle: "Ten chapters that go from 'protobuf is a config language' to a polyglot, mTLS-secured, observable gRPC service running behind nginx, with streaming RPCs and tight deadlines."
chapter: 0
level: 'beginner'
readingTime: '5 min'
topics: ['roadmap', 'grpc', 'protobuf', 'http2', 'rpc']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What you will be able to do at the end

You will be able to design `.proto` files, generate code in Go, Node, and Python, ship a gRPC server with unary and streaming RPCs, set deadlines and propagate them, write interceptors for auth and logging, secure with mTLS, and deploy a self-hosted gRPC service behind nginx. By the end you will know exactly when gRPC is the right shape — and when REST or GraphQL fits better.

<Callout type="info">

**Prereqs:** finish the **Linux & VPS basics**, **Networking**, and **TLS & Certificates** tracks. gRPC rides on HTTP/2 and TLS — without those tracks, the failure modes will mystify you. The **REST API building** and **Web Server fundamentals** tracks help too. Go is the primary language; the polyglot chapter covers Node and Python.

</Callout>

## The 10 chapters, in order

**Foundations**

1. **What gRPC is and when to use it** — RPC vs REST vs GraphQL, the actual tradeoffs
2. **Protocol Buffers** — proto3 syntax, wire format, schema evolution
3. **HTTP/2 underneath** — multiplexing, framing, flow control, why it matters
4. **Your first server and client** — Go end-to-end, codegen, unary RPC

**Real services**

5. **Polyglot — Node and Python clients** — same proto, three languages
6. **Streaming RPCs** — server, client, and bidirectional streams
7. **Errors, deadlines, metadata** — status codes, timeouts, headers
8. **Interceptors** — middleware for auth, logging, retries, recovery

**Production**

9. **TLS and mTLS** — certs, identity, peer authentication
10. **Production self-host** — load balancing, observability, behind nginx

## How to use this track

Read in order. The first three chapters explain the moving parts; chapter 4 ships running code. From there each chapter adds a real production capability. Total reading: ~3 hours. Hands-on, the first time you build it all: a long weekend.

You need Go 1.22+, the `protoc` compiler, Node 20+ and Python 3.11+ for chapter 5, and a VPS with a domain pointed at it for chapter 10. Everything else runs on `localhost`.
