---
title: 'Streaming RPCs'
subtitle: 'Streams are the part of gRPC where it stops resembling REST. Server-streaming, client-streaming, and bidirectional — three shapes that change what kind of services you can build.'
chapter: 6
level: 'intermediate'
readingTime: '13 min'
topics: ['grpc', 'streaming', 'server stream', 'bidi']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

The four call shapes from chapter 1:

```proto
rpc Unary       (Req)        returns (Resp);          // 1 → 1
rpc ServerStream(Req)        returns (stream Resp);   // 1 → N
rpc ClientStream(stream Req) returns (Resp);          // N → 1
rpc BidiStream  (stream Req) returns (stream Resp);   // N ↔ M
```

Each is one HTTP/2 stream. Each is **first-class** in the runtime — no fallback hacks, no SSE, no WebSocket polyfill. This chapter ships all three of the streaming shapes in Go, then walks the failure modes that bite you in production.

<Callout type="info">

**Real-World Analogy**

gRPC streaming is like a live sports score feed versus refreshing the scoreboard page — the server pushes updates as they happen.

</Callout>

## A streaming-flavored proto

```proto
// proto/feed/v1/feed.proto
syntax = "proto3";

package feed.v1;
option go_package = "example.com/mygrpc/gen/feed/v1;feedv1";

import "google/protobuf/timestamp.proto";

service FeedService {
  // server-streaming: one query, many events
  rpc Watch(WatchRequest) returns (stream Event);

  // client-streaming: many writes, one ack
  rpc UploadEvents(stream Event) returns (UploadResult);

  // bidi: chat-like protocol
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}

message WatchRequest { string topic = 1; }

message Event {
  string id = 1;
  string topic = 2;
  string body = 3;
  google.protobuf.Timestamp at = 4;
}

message UploadResult { int32 received = 1; }

message ChatMessage {
  string from = 1;
  string text = 2;
}
```

After regenerating with the chapter-4 incantation, `feedv1.FeedServiceServer` exposes the streaming methods.

## Server-streaming — one request, many responses

The most common streaming shape. A query that yields many results over time.

```go
// Watch is a server-streaming RPC.
func (s *Server) Watch(req *pb.WatchRequest, stream pb.FeedService_WatchServer) error {
    sub := s.broker.Subscribe(req.GetTopic())
    defer s.broker.Unsubscribe(sub)

    for {
        select {
        case ev := <-sub.Ch:
            if err := stream.Send(&pb.Event{
                Id:    ev.ID,
                Topic: ev.Topic,
                Body:  ev.Body,
                At:    timestamppb.New(ev.At),
            }); err != nil {
                return err
            }

        case <-stream.Context().Done():
            return stream.Context().Err()
        }
    }
}
```

Three things to read carefully.

**1. The function returns `error`, not a response.** All the data flows out via `stream.Send()`. Returning nil ends the stream cleanly; returning an error ends it with a status code (chapter 7).

**2. `stream.Context()` is your lifeline.** When the client disconnects (network drop, Ctrl-C, deadline expired), the context is canceled. **You must select on it** or the goroutine leaks, the broker subscription leaks, and your service slowly degrades.

**3. `stream.Send()` blocks on flow control backpressure.** If the client is slow, `Send` waits for the HTTP/2 window to open. That is a feature — it means a slow consumer naturally throttles the producer. Don't try to "fix" it with goroutines that push into a channel; you reinvent backpressure badly.

Client side:

```go
stream, err := client.Watch(ctx, &pb.WatchRequest{Topic: "alerts"})
if err != nil {
    return err
}

for {
    ev, err := stream.Recv()
    if errors.Is(err, io.EOF) {
        return nil // server closed the stream cleanly
    }
    if err != nil {
        return err
    }
    fmt.Printf("[%s] %s\n", ev.Topic, ev.Body)
}
```

`stream.Recv()` returns `io.EOF` when the server's handler returned `nil`. Any other error is a real error.

## Client-streaming — many requests, one response

Useful for bulk uploads or aggregations: the client streams chunks, the server gives a single result at the end.

```go
func (s *Server) UploadEvents(stream pb.FeedService_UploadEventsServer) error {
    var count int32
    for {
        ev, err := stream.Recv()
        if errors.Is(err, io.EOF) {
            return stream.SendAndClose(&pb.UploadResult{Received: count})
        }
        if err != nil {
            return err
        }
        if err := s.repo.Insert(stream.Context(), ev); err != nil {
            return status.Errorf(codes.Internal, "insert: %v", err)
        }
        count++
    }
}
```

Two pieces of vocabulary: `stream.Recv()` reads one client message; `stream.SendAndClose(resp)` ends the stream with the single response. **Do not** call `Send` then return — `SendAndClose` is the pair to client-streaming.

Client:

```go
stream, err := client.UploadEvents(ctx)
if err != nil {
    return err
}
for _, e := range events {
    if err := stream.Send(e); err != nil {
        return err
    }
}
result, err := stream.CloseAndRecv()
if err != nil {
    return err
}
fmt.Printf("uploaded %d\n", result.GetReceived())
```

`CloseAndRecv` signals "no more sends" and waits for the server's single response. Always pair `Send` (client-stream) with `CloseAndRecv`.

## Bidirectional — full duplex

Both sides send and receive freely. Order is per-stream, not coordinated between the two directions. The classic example is a chat:

```go
func (s *Server) Chat(stream pb.FeedService_ChatServer) error {
    for {
        msg, err := stream.Recv()
        if errors.Is(err, io.EOF) {
            return nil
        }
        if err != nil {
            return err
        }

        // Echo with a server prefix; in real life, fan out to other subscribers.
        reply := &pb.ChatMessage{
            From: "server",
            Text: "echo: " + msg.GetText(),
        }
        if err := stream.Send(reply); err != nil {
            return err
        }
    }
}
```

Client:

```go
stream, err := client.Chat(ctx)
if err != nil {
    return err
}

// Receive in a goroutine, send from main.
done := make(chan struct{})
go func() {
    defer close(done)
    for {
        msg, err := stream.Recv()
        if errors.Is(err, io.EOF) {
            return
        }
        if err != nil {
            log.Println("recv:", err)
            return
        }
        fmt.Printf("[%s] %s\n", msg.GetFrom(), msg.GetText())
    }
}()

for _, line := range []string{"hello", "world", "bye"} {
    stream.Send(&pb.ChatMessage{From: "client", Text: line})
}
stream.CloseSend()
<-done
```

`stream.CloseSend()` says "no more from me" while still allowing receives. The server's `Recv` then returns `io.EOF` and the goroutine exits cleanly.

The send and receive directions are independent — read with one goroutine, write with another. Coordinate via channels if needed.

<Callout type="warn">

**Bidi streams are easy to leak.** A goroutine that calls `Recv()` and never sees `io.EOF` (because the server forgot to return) lives forever. Always pair: client `CloseSend()` → server `Recv` returns EOF → server returns → client `Recv` returns EOF → goroutine exits. Test the cancellation path by killing the client mid-stream and checking server logs for orphaned handlers.

</Callout>

## Backpressure across streams

HTTP/2 flow control (chapter 3) gives you per-stream backpressure for free, with one nuance: each direction has its own window.

For server-streaming, if your producer is faster than the network or the client, `stream.Send()` blocks until the client's window opens. This is what you want.

For client-streaming, if the server is slow to read, `stream.Send()` on the client blocks. Same dynamic, opposite direction.

For bidirectional, both windows operate independently. A slow receiver in one direction does not throttle the other.

The default HTTP/2 window is 64 KiB per stream. For high-throughput streams (logs, telemetry, video), raise it on both server and client (chapter 3 has the dial options). Without that, throughput tops out at one window per round-trip — a hard ceiling.

## Cancellation patterns

Three places a stream can end:

1. **Server returns** — handler done, stream closes cleanly. Client `Recv` returns `io.EOF`.
2. **Client cancels** (`ctx.cancel()` or deadline expired). Both sides' `ctx.Done()` fires; pending `Send` and `Recv` return `context.Canceled` or `context.DeadlineExceeded`.
3. **Network died.** TCP layer detects (eventually). `Send`/`Recv` return a non-EOF error.

Your handler must handle all three. The pattern:

```go
for {
    select {
    case <-stream.Context().Done():
        return stream.Context().Err()
    case ev := <-source:
        if err := stream.Send(ev); err != nil {
            return err
        }
    }
}
```

`Send` returning an error usually means the stream is dead — break out, clean up.

## Deadlines on streams

Setting a deadline on a streaming RPC means the **whole stream** must finish in that window:

```go
ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
defer cancel()

stream, _ := client.Watch(ctx, req) // server-streaming
```

Thirty seconds after `client.Watch`, the stream is forcibly closed. For long-lived streams (log tails, dashboards), use a much longer deadline — or none at all (`context.Background()`), and rely on cancellation when the consumer is done.

Streaming + tight deadlines is a common bug: a client meant to run for hours dies after one minute because the deadline was meant for unary calls.

## Resumability — gRPC does not give it to you

If a server-streaming RPC dies mid-stream and the client reconnects, the new stream starts from the beginning of the new request — the server has no idea what the client already saw. **gRPC has no built-in stream resumption.**

If you need resumable streams, build it in the application layer:

- The server includes a `cursor` or `seq` field in each event.
- The client sends `WatchRequest{Topic: "alerts", AfterCursor: "abc"}` on reconnect.
- The server resumes from after that cursor.

This is the same pattern as event store readers. Build it once, use it everywhere streaming matters.

## Multiplexing means cheap streams

Because every stream is just an HTTP/2 stream, opening a thousand of them on one connection is fine. There is no per-stream TCP handshake, no per-stream TLS work, no per-stream HTTP/1.1 head-of-line blocking.

That makes patterns possible that are awkward elsewhere:

- One long-lived stream per subscription topic, hundreds per client.
- Per-tab subscriptions for a real-time dashboard.
- Per-user agent connections that hold many streams indefinitely.

The cost is mostly memory (one buffer per stream) and GC pressure. Profile if you push past tens of thousands per process.

## When not to use streaming

- **The data is small and one-shot.** Use unary; streaming is overhead.
- **You need browser support without a proxy.** gRPC-Web supports server-streaming but not client-streaming or bidirectional.
- **The consumers are humans with curl.** Streaming is hard to inspect by hand. `grpcurl` does it, but you lose the ad-hoc-friendly story.
- **The data is request-response with a delay.** Use unary with a longer deadline. Streaming is for genuinely incremental data.

Most services have one or two genuinely streaming endpoints (logs, notifications, live updates) and a hundred unary RPCs. That is a healthy mix.

## Recap

- Four shapes: unary, server-stream, client-stream, bidi. Each is one HTTP/2 stream.
- Server-streaming returns an error, sends data via `stream.Send()`. Always select on `stream.Context().Done()`.
- Client-streaming pairs `Send` with `SendAndClose` (server) and `CloseAndRecv` (client).
- Bidi streams: send and receive independently. `CloseSend` ends the client direction.
- Backpressure is HTTP/2 flow control. Raise windows for high-throughput streams.
- Cancellations end via context done. Handle all three end states (server return, cancel, network).
- Deadlines apply to whole streams — use long ones (or none) for long-lived streams.
- Resumability is your job. Cursors, server-side replay.
- Multiplexing makes many concurrent streams cheap. Use them where the data is genuinely incremental.

Next: [Errors, deadlines, metadata](/notes/grpc/07-errors-deadlines) — status codes, deadline propagation, and the headers gRPC carries on every call.
