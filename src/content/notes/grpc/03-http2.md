---
title: "HTTP/2 underneath"
subtitle: "gRPC is HTTP/2 with a particular set of headers and a particular way of framing protobuf bytes. Knowing what HTTP/2 actually does explains every gRPC failure mode you will hit in production."
chapter: 3
level: "beginner"
readingTime: "12 min"
topics: ["grpc", "http2", "framing", "multiplexing", "flow control"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

The gRPC framework hides HTTP/2 behind generated code. Most days that is fine. But the moment you debug a stuck stream, a balancer that pinned all calls to one backend, or a connection that died silently, HTTP/2 stops being an implementation detail and becomes the thing you must understand.

This chapter is HTTP/2 from gRPC's angle. Not the spec; just the parts that change how you operate.

<Callout type="info">

**Real-World Analogy**

HTTP/2 is like a highway with multiple lanes versus a single-lane road — HTTP/1.1 is one lane, HTTP/2 opens many simultaneously.

</Callout>

## The shape of HTTP/2

HTTP/1.1 is a text protocol. One request per TCP connection at a time (or pipelined, if anyone supported it, which they don't). New connection per call, or six-way browser pool.

HTTP/2 is a binary protocol with **frames** flowing in both directions over one TCP connection. Each frame belongs to a **stream**. Streams are multiplexed — frames from different streams interleave on the same connection. This is the whole story.

```
HTTP/1.1: client → request → server → response → client (one at a time)

HTTP/2:   client ↔ frame frame frame frame frame ↔ server
                  stream 1 stream 3 stream 1 stream 5
```

Streams have IDs (odd numbers from clients, even from servers). They are full-duplex — both sides can send frames at any time. Streams open, exchange frames, and close.

## How a gRPC call rides on HTTP/2

A unary gRPC call is one HTTP/2 stream. The frames that flow:

```
Client → Server: HEADERS  :method=POST :path=/UserService/GetUser
                          content-type=application/grpc
                          te=trailers
Client → Server: DATA     <length-prefix>  <protobuf bytes>
                          (END_STREAM flag set)
Server → Client: HEADERS  :status=200
                          content-type=application/grpc
Server → Client: DATA     <length-prefix>  <protobuf bytes>
Server → Client: HEADERS  grpc-status=0  grpc-message=...
                          (END_STREAM flag set; this is "trailers")
```

That last HEADERS frame — sent *after* the DATA — is gRPC's **trailers**. HTTP/1.1 cannot send headers after the body started; HTTP/2 can. gRPC uses trailers to carry the status code and message. That is why every gRPC client demands trailer support.

For streaming RPCs, multiple DATA frames flow on the same stream. The framing format is `[1-byte compressed flag][4-byte length][message bytes]`, repeated. A reader pulls one length-prefixed message at a time.

## Multiplexing — the killer feature

One TCP connection. Hundreds of concurrent streams. No connection setup per call.

For service-to-service traffic that is normally chatty, this is huge. Compare:

| | HTTP/1.1 | HTTP/2 |
|---|---|---|
| TCP handshakes for 100 calls | 100 (or 17 with keep-alive + pool of 6) | 1 |
| TLS handshakes | 100 (or 17) | 1 |
| Concurrent in-flight | 6 per origin (browser limit) | hundreds |
| Head-of-line blocking | yes (next request waits for prior) | no (per-stream) |

Real-world impact: a Go service calling another Go service over gRPC sustains tens of thousands of RPCs per second on one connection without breaking a sweat. The same workload on HTTP/1.1 + JSON spends most of its time on connection churn.

<Callout type="info">

**One connection per backend, not per call.** gRPC clients hold a long-lived `ClientConn` to each backend. Reuse it; do not dial per call. Misusing the client (creating a fresh `ClientConn` for every request) destroys the multiplexing benefit and is the most common gRPC performance bug.

</Callout>

## Flow control — backpressure built in

HTTP/2 has per-stream and per-connection **flow control windows**. A receiver advertises "I have N bytes of buffer for this stream." Senders must not exceed that.

When the sender hits the window, it stops sending DATA frames until the receiver sends a `WINDOW_UPDATE` saying "I have processed M bytes, you can send M more."

For streaming RPCs this is essential. A slow consumer naturally slows the producer down — no buffers blow up, no out-of-memory deaths from runaway streams. Backpressure is the protocol, not something you build.

The default window is small (65 KB) and tuned for browsers. For server-to-server streaming, increase it:

```go
grpc.WithInitialWindowSize(1 << 20)        // 1 MiB per stream
grpc.WithInitialConnWindowSize(1 << 23)    // 8 MiB per connection
```

Without that, large streaming throughput is starved by tiny windows.

## Header compression — HPACK

HTTP/2 compresses headers with HPACK, which keeps a dictionary of seen names and values. The first time you send `:path=/UserService/GetUser` it costs bytes; the second time it is one or two bytes.

For gRPC, this matters because every call carries some standard headers (`content-type`, `te`, the path). Across thousands of calls on one connection, header bytes drop to near zero.

A consequence: very long custom headers (`Authorization` with a giant JWT, custom trace headers) defeat HPACK on the first call but win after that. Avoid changing them per call where possible.

## Connection lifecycle and PINGs

A gRPC connection is supposed to stay open. The client and server both send periodic `PING` frames as keepalives — without these, NAT boxes and load balancers drop "idle" connections after a few minutes.

Default keepalive is conservative. For service-to-service over the internet (or anywhere with unreliable middleboxes), tighten it:

```go
keepalive.ClientParameters{
    Time:                10 * time.Second, // ping every 10s
    Timeout:             3 * time.Second,  // wait 3s for ack
    PermitWithoutStream: true,             // ping even if no streams
}
```

The server side must allow it (`keepalive.EnforcementPolicy{MinTime: 5 * time.Second, PermitWithoutStream: true}`) or it will RST aggressive clients with `ENHANCE_YOUR_CALM` errors. Yes that is a real error code.

## Stream cancellation and deadlines

A client cancellation sends `RST_STREAM` with a CANCEL code. The server's stream context is canceled; the handler should return promptly. Same for deadline expiry — the framework cancels the stream automatically when the deadline passes, and the server context's `<-ctx.Done()` fires.

This is why every gRPC handler must be deadline-aware:

```go
func (s *server) Slow(ctx context.Context, req *pb.Req) (*pb.Resp, error) {
    select {
    case <-time.After(5 * time.Second):
        return &pb.Resp{}, nil
    case <-ctx.Done():
        return nil, status.FromContextError(ctx.Err()).Err()
    }
}
```

Code that ignores `ctx` will keep working after the client gave up. Wasted CPU, wasted DB queries, possible cascading failures. Deadlines are non-negotiable in production gRPC; chapter 7 has the full pattern.

## Load balancing — where HTTP/2 makes life harder

HTTP/2 long-lived connections + multiplexing are great for throughput. They are *terrible* for naïve load balancing.

A standard L4 (TCP) load balancer sees one connection from the client and routes it to one backend. All hundreds of streams ride that connection. The other backends sit idle. You scaled to ten replicas; one is taking 100% of the traffic.

Three fixes, in order of preference:

1. **Client-side load balancing.** The client opens connections to all backends and round-robins streams across them. gRPC supports this natively (`grpc.WithDefaultServiceConfig` with round-robin). Best for service-to-service inside your network.
2. **L7 (HTTP/2-aware) load balancer.** Envoy, nginx (with `http2` enabled), Linkerd, traefik. Routes individual streams, not connections. Best for traffic that crosses trust boundaries.
3. **DNS-based with short TTLs.** Worse than the others; mentioned for completeness.

Do not put a vanilla TCP load balancer in front of gRPC unless you accept the imbalance. Chapter 10 has the full pattern.

## TLS and ALPN

gRPC over the public internet is TLS 1.2 or 1.3, with **ALPN** (Application-Layer Protocol Negotiation) selecting `h2` during the handshake. Without ALPN, the server can't tell HTTP/2 from HTTP/1.1.

Locally and inside trusted networks, plaintext HTTP/2 (`h2c`) is fine. The gRPC framework defaults to TLS; you opt into plaintext explicitly:

```go
// Client
conn, err := grpc.NewClient("localhost:9000",
    grpc.WithTransportCredentials(insecure.NewCredentials()))

// Server
s := grpc.NewServer()  // plaintext by default; add credentials for TLS
```

Chapter 9 covers TLS and mTLS in full.

## Tooling — seeing what's on the wire

**`grpcurl`** — like `curl`, for gRPC.

```bash
brew install grpcurl
grpcurl -plaintext localhost:9000 list
grpcurl -plaintext -d '{"id": 42}' localhost:9000 user.v1.UserService/GetUser
```

You need server reflection enabled (chapter 4) or a `.proto` file in your hand. Indispensable for sanity-checking deployed services.

**`tcpdump` + Wireshark** — see actual HTTP/2 frames. Wireshark decodes HTTP/2 cleanly:

```bash
sudo tcpdump -i lo -w grpc.pcap port 9000
wireshark grpc.pcap  # filter: http2
```

For TLS-encrypted traffic, you need to dump the session keys (`SSLKEYLOGFILE` env in some clients) or run plaintext locally for the dump. Worth doing once per career to demystify the wire.

**`netstat`/`ss`** — see active connections.

```bash
ss -tan state established '( dport = :9000 or sport = :9000 )'
```

If a client is supposed to multiplex but you see fifty connections, your client config is wrong.

## Common HTTP/2-flavored gRPC bugs

**1. Tons of new connections instead of multiplexing.** Client is creating a fresh `ClientConn` per call. Fix: hold one `ClientConn` per backend, share it.

**2. One backend takes all traffic.** L4 load balancer in front; client opened one connection. Fix: client-side LB or L7 proxy.

**3. Connection dies after 60 seconds idle.** NAT or middlebox dropped it. Fix: tighten keepalive on both client and server.

**4. Streaming throughput tops out at a few MB/s.** Default flow control window. Fix: increase initial window sizes.

**5. `ENHANCE_YOUR_CALM` errors.** Client is pinging too often for the server's policy. Fix: align both keepalive policies.

## Recap

- HTTP/2 is binary frames over one TCP connection, multiplexed by stream ID.
- A gRPC call is one stream — HEADERS, DATA frames, trailers (post-body HEADERS).
- Multiplexing kills HTTP/1.1's connection churn — one client connection per backend handles thousands of concurrent calls.
- Flow control windows are backpressure. Increase for streaming.
- HPACK compresses headers across calls on the same connection.
- Keepalive is mandatory across NAT and load balancers. Tighten the defaults.
- Cancellations and deadlines flow as `RST_STREAM` and via `ctx.Done()`. Handlers must be ctx-aware.
- L4 load balancers ruin gRPC. Use client-side LB or L7 proxy.
- ALPN selects `h2` in TLS; `h2c` is plaintext for trusted networks.
- `grpcurl` and Wireshark are your debugging eyes.

Next: [Your first server and client](/notes/grpc/04-first-server) — Go end-to-end, codegen included, in code you understand.

