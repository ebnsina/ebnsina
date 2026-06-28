---
title: 'What gRPC is and when to use it'
subtitle: 'gRPC is HTTP/2, plus protobuf, plus codegen. That trio gives you a typed, fast, polyglot RPC system. Knowing what each layer is doing is half the skill of using it well.'
chapter: 1
level: 'beginner'
readingTime: '10 min'
topics: ['grpc', 'rpc', 'rest', 'graphql', 'protobuf']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

You wrote REST in chapter 5 of the path. You wrote GraphQL in the previous topic. Both speak JSON over HTTP/1.1. Both serialize fields with names and string keys on every request. Both let any HTTP client poke around the API by hand.

gRPC is none of those things. It is a **binary** protocol over **HTTP/2**, with a **schema-first** contract that generates code in your language. You do not write HTTP handlers; you write a service implementation, the framework wires the network plumbing.

That is a very different shape. This chapter is about deciding when that shape is right.

<Callout type="info">

**Real-World Analogy**

gRPC lets you call a function on another computer as naturally as calling a local function — the network disappears.

</Callout>

## A gRPC call worth looking at

Server (Go):

```go
func (s *server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    user, err := s.repo.UserByID(ctx, req.GetId())
    if err != nil {
        return nil, status.Error(codes.NotFound, "user not found")
    }
    return &pb.User{Id: user.ID, Name: user.Name, Email: user.Email}, nil
}
```

Client (Go):

```go
resp, err := client.GetUser(ctx, &pb.GetUserRequest{Id: 42})
if err != nil { return err }
fmt.Println(resp.Name)
```

No URLs. No JSON. No status codes hand-rolled. The wire format is binary protobuf; the function call looks like a local function call. That is the entire pitch of RPC: make remote calls feel local.

The contract that makes this possible is a `.proto` file:

```proto
syntax = "proto3";

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
}

message GetUserRequest { int64 id = 1; }

message User {
  int64 id = 1;
  string name = 2;
  string email = 3;
}
```

`protoc` reads that file and emits Go (or Node, or Python, or Rust) code. The server implements the service; the client calls it.

## The three layers of gRPC

You cannot use gRPC well without knowing each.

**1. Protocol Buffers** — the schema language and wire format. You write `.proto`, you ship binary. Smaller than JSON, faster to parse, strictly typed. Chapter 2.

**2. HTTP/2** — the transport. Multiplexed (many concurrent calls on one TCP connection), header-compressed, supports server push and bidirectional streams. Chapter 3.

**3. The framework** — `grpc-go`, `@grpc/grpc-js`, `grpcio`. Generates code from `.proto`, handles serialization, manages the HTTP/2 connections, surfaces deadlines, errors, metadata.

Most of your time is at layer 3. But when something goes wrong — a connection drops mid-stream, a deadline does not propagate, a binary mystery shows up in tcpdump — you need to understand all three.

## RPC vs REST vs GraphQL

|                 | REST               | GraphQL       | gRPC                    |
| --------------- | ------------------ | ------------- | ----------------------- |
| Transport       | HTTP/1.1           | HTTP/1.1      | HTTP/2                  |
| Wire format     | JSON               | JSON          | Protobuf binary         |
| Contract        | OpenAPI (optional) | SDL           | `.proto` (mandatory)    |
| Codegen         | optional           | optional      | mandatory               |
| Streaming       | SSE / WebSocket    | Subscriptions | Built-in (4 kinds)      |
| Browser-native  | yes                | yes           | no — needs gateway      |
| Polyglot        | yes (manual)       | yes (manual)  | yes (free, codegen)     |
| Discoverability | URLs, curl         | introspection | reflection, server side |
| Debugging       | great              | good          | needs tooling           |
| Speed           | baseline           | baseline      | 2–10× faster            |

Three numbers worth memorizing:

- **Wire size:** binary protobuf is roughly 3–10× smaller than equivalent JSON.
- **Parse time:** binary parsing is roughly 5–20× faster than JSON parsing.
- **Connections:** HTTP/2 multiplexes hundreds of concurrent calls on one TCP socket. HTTP/1.1 needs a connection per call (or 6 max with browser pooling).

For service-to-service traffic in a tight cluster, those numbers compound.

## When gRPC is the right call

- **Service-to-service inside your own infrastructure.** Two Go services talking to each other? gRPC. Both ends are typed, both are polyglot, the wire is fast, and there is no client outside your control.
- **Polyglot teams.** A Python data team needs to call a Go service. The `.proto` is the contract; both teams generate their own client. No one writes a "client SDK" by hand.
- **High-throughput, latency-sensitive paths.** Realtime trading, telemetry pipelines, streaming jobs. The speed of binary + HTTP/2 is the whole point.
- **Bidirectional streaming.** Realtime two-way communication. Chat, video signaling, live dashboards. gRPC's streaming RPCs are first-class, not bolted on.
- **Strong contract evolution.** Adding fields to a protobuf message is backward-compatible by default. The wire format was designed for it.

## When gRPC is the wrong call

- **Public APIs over the internet.** Browsers cannot speak gRPC natively. Mobile apps can but the SDK is heavy. REST + JSON wins for ecosystem reach. gRPC-Web exists but is gRPC-with-an-asterisk.
- **Human consumption.** A `curl` against a JSON API is a ten-second debug. gRPC needs `grpcurl` (or a code client) and a `.proto` file in hand.
- **Static caching / CDN.** REST `GET` requests cache for free at the edge. gRPC is `POST` over HTTP/2 — no edge caching without bespoke proxies.
- **Small one-team service.** REST is faster to ship if your team is one or two engineers and the API has eight endpoints.

<Callout type="warn">

**gRPC is not magic speed.** A naive gRPC service can be slower than a tuned REST one. The wins come from the _combination_ of HTTP/2 reuse, binary serialization, codegen, and streaming. If you are using gRPC over HTTP/1.1 (gRPC-Web fallback) without streaming and with small messages, JSON over keep-alive HTTP/1.1 is comparable.

</Callout>

## The four kinds of RPC

gRPC supports four call shapes — pick the one that matches your data flow:

```proto
service Demo {
  // 1. Unary: one request, one response. Like a function call.
  rpc GetUser (UserId) returns (User);

  // 2. Server streaming: one request, stream of responses.
  rpc ListNotifications (UserId) returns (stream Notification);

  // 3. Client streaming: stream of requests, one response.
  rpc UploadChunks (stream Chunk) returns (UploadResult);

  // 4. Bidirectional streaming: stream both ways.
  rpc Chat (stream ChatMessage) returns (stream ChatMessage);
}
```

Most APIs use unary. Streaming is the lever you reach for when the data is genuinely long-lived: log tails, telemetry, realtime collaboration.

## What "self-hosted" looks like for gRPC

The whole track stays vendor-neutral. You will run gRPC services on a VPS, behind nginx, with mTLS and Prometheus metrics. No "use Cloud Run" or "deploy to Anthos." A static Go binary, a systemd unit, an nginx config — same operational shape as the REST and GraphQL tracks.

Tools you will install over the next nine chapters:

- `protoc` — the protocol buffers compiler (`apt install protobuf-compiler`).
- `protoc-gen-go` and `protoc-gen-go-grpc` — Go code generators (`go install`).
- `grpcurl` — like `curl` for gRPC. Indispensable for debugging.
- `buf` — modern alternative to `protoc`, with linting and breaking-change detection.

## A note on grpc-go vs grpc-go-experimental

grpc-go is the canonical Go implementation. It is a Google project, used by Google internally, stable and battle-tested. We use it throughout. Avoid forks and experimental clients unless you have a specific reason; the wire compatibility is universal so the framework choice is purely ergonomics.

## What about REST gateways and gRPC-Web

Two adapters worth knowing now, even though we don't use them until chapter 10:

- **grpc-gateway** — generates a REST/JSON proxy from your `.proto`. Browsers (or any HTTP client) call REST; the gateway translates to gRPC. Good when one service must serve both internal callers (gRPC) and public callers (REST) without writing two implementations.
- **gRPC-Web** — a wire-compatible variant for browsers. Needs a proxy (Envoy, nginx, or Connect) to translate from gRPC-Web to native gRPC.

If you are starting a service that is purely backend-to-backend, you do not need either. If you need a browser to call gRPC directly, plan for gRPC-Web in chapter 10.

## Recap

- gRPC = HTTP/2 + protobuf + codegen. Three layers, all worth understanding.
- The wire is binary, the contract is mandatory, the codegen is free.
- Right for service-to-service, polyglot, streaming, latency-sensitive paths.
- Wrong for public APIs, browser-native, human-debug-friendly endpoints, edge caching.
- Four call shapes: unary, server-streaming, client-streaming, bidirectional.
- We use grpc-go as the primary runtime; Node and Python in chapter 5.
- Self-hosted, on a VPS, behind nginx — same operational shape as the rest of the path.

Next: [Protocol Buffers](/notes/grpc/02-protobuf) — the schema language, the wire format, and the evolution rules that keep your services compatible for years.
