---
title: 'স্ট্রিমিং RPC'
subtitle: 'স্ট্রিম হলো gRPC-র সেই অংশ যেখানে এটা আর REST-এর মতো দেখতে থাকে না। Server-streaming, client-streaming, আর bidirectional — তিনটা শেপ যা বদলে দেয় আপনি কেমন ধরনের সার্ভিস বানাতে পারবেন।'
chapter: 6
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['grpc', 'streaming', 'server stream', 'bidi']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

চ্যাপ্টার ১-এর চারটা কল শেপ:

```proto
rpc Unary       (Req)        returns (Resp);          // 1 → 1
rpc ServerStream(Req)        returns (stream Resp);   // 1 → N
rpc ClientStream(stream Req) returns (Resp);          // N → 1
rpc BidiStream  (stream Req) returns (stream Resp);   // N ↔ M
```

প্রতিটাই একটা করে HTTP/2 স্ট্রিম। প্রতিটাই রানটাইমে **first-class** — কোনো fallback হ্যাক নেই, SSE নেই, WebSocket polyfill নেই। এই চ্যাপ্টারে তিনটা স্ট্রিমিং শেপই Go-তে বানানো হবে, তারপর প্রোডাকশনে যেসব failure mode আপনাকে কামড় দেয় সেগুলো ধরে ধরে দেখব।

<Callout type="info">

**বাস্তব জীবনের উপমা**

gRPC স্ট্রিমিং অনেকটা লাইভ স্পোর্টস স্কোর ফিডের মতো, স্কোরবোর্ড পেজ বারবার রিফ্রেশ করার বিপরীতে — ঘটনা ঘটার সাথে সাথে সার্ভার আপডেট পুশ করে।

</Callout>

## গল্পে বুঝি

শহরের একটা রেডিও স্টেশন, নাম ধরুন "রেডিও সমরকন্দ"। ফাতিমা আল-ফিহরি একদিন এফএম ডায়াল ঘুরিয়ে স্টেশনটা একবার টিউন করলেন — ব্যস, ওই একটা কাজ করার পর সারা দুপুর একটার পর একটা গান, খবর, আবহাওয়া অনবরত তাঁর রেডিওতে আসতেই থাকল। তিনি আর কিছু চাইলেন না, শুধু বসে শুনে গেলেন; স্টেশন নিজে থেকেই একের পর এক জিনিস পাঠিয়ে গেল।

এদিকে মাঠপর্যায়ে ইবনে সিনা একজন ফিল্ড রিপোর্টার। বন্যার খবর কাভার করতে গিয়ে তিনি ওয়াকিটকিতে অনবরত ছোট ছোট আপডেট পাঠাতে থাকলেন — "পানি বাড়ছে", "সেতু ডুবে গেছে", "লোকজন সরছে" — একটার পর একটা, অনেকক্ষণ ধরে। ডেস্কে বসা আল-খোয়ারিজমি সবগুলো আপডেট জমা করলেন, আর শেষে সব মিলিয়ে একটাই গোছানো রিপোর্ট তৈরি করে ইবনে সিনাকে ফেরত জানালেন "পেয়েছি, প্রচার হয়ে গেছে"। আর সন্ধ্যার লাইভ কল-ইন শোতে হোস্ট আল-বিরুনি আর শ্রোতা — দুজনেই একসাথে কথা বলছেন, একজন থামার অপেক্ষায় অন্যজন বসে নেই; দুই দিক থেকেই কথা যাচ্ছে-আসছে।

এই তিনটা দৃশ্যই gRPC streaming। একবার টিউন করে বসে বসে অনেক কিছু receive করা হলো **server-streaming** — এক request, অনেক response সময়ের সাথে (যেমন লাইভ ফিড বা লাইভ স্পোর্টস স্কোর)। রিপোর্টারের অনবরত আপডেট পাঠিয়ে শেষে একটাই summary পাওয়া হলো **client-streaming** — অনেক message, একটা reply (যেমন বড় ফাইল বা চাংক আপলোড)। আর লাইভ কল-ইনে দুই পক্ষ একসাথে কথা বলা হলো **bidirectional** streaming — দুই দিকই স্বাধীনভাবে stream করে (যেমন চ্যাট বা রিয়েল-টাইম কোলাবরেশন)। এই চ্যাপ্টারে তিনটাই Go দিয়ে হাতে-কলমে বানানো হবে।

## একটা স্ট্রিমিং-ঘেঁষা proto

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

চ্যাপ্টার-৪-এর সেই মন্ত্র দিয়ে আবার জেনারেট করার পর `feedv1.FeedServiceServer` স্ট্রিমিং মেথডগুলো এক্সপোজ করে।

## Server-streaming — এক রিকোয়েস্ট, অনেক রেসপন্স

সবচেয়ে কমন স্ট্রিমিং শেপ। একটা কোয়েরি যা সময়ের সাথে সাথে অনেক রেজাল্ট দেয়।

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

তিনটা জিনিস মন দিয়ে পড়ুন।

**১. ফাংশনটা `error` রিটার্ন করে, কোনো রেসপন্স নয়।** সব ডেটা বের হয় `stream.Send()` দিয়ে। nil রিটার্ন করলে স্ট্রিম পরিষ্কারভাবে শেষ হয়; error রিটার্ন করলে একটা স্ট্যাটাস কোড দিয়ে শেষ হয় (চ্যাপ্টার ৭)।

**২. `stream.Context()` আপনার lifeline।** ক্লায়েন্ট ডিসকানেক্ট হলে (নেটওয়ার্ক ড্রপ, Ctrl-C, deadline শেষ), কনটেক্সট cancel হয়ে যায়। **আপনাকে অবশ্যই এটার উপর select করতে হবে** নাহলে goroutine লিক করবে, broker সাবস্ক্রিপশন লিক করবে, আর আপনার সার্ভিস ধীরে ধীরে খারাপ হতে থাকবে।

**৩. `stream.Send()` flow control backpressure-এ ব্লক হয়।** ক্লায়েন্ট স্লো হলে `Send` HTTP/2 উইন্ডো খোলার জন্য অপেক্ষা করে। এটা একটা feature — মানে একজন স্লো কনজিউমার স্বাভাবিকভাবেই প্রোডিউসারকে থ্রটল করে। এটাকে goroutine দিয়ে channel-এ পুশ করে "ঠিক" করার চেষ্টা করবেন না; আপনি খারাপভাবে backpressure আবার নতুন করে বানাবেন।

ক্লায়েন্ট সাইড:

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

সার্ভারের হ্যান্ডলার `nil` রিটার্ন করলে `stream.Recv()` `io.EOF` রিটার্ন করে। অন্য যেকোনো error আসলেই একটা রিয়েল error।

## Client-streaming — অনেক রিকোয়েস্ট, এক রেসপন্স

bulk আপলোড বা aggregation-এর জন্য কাজে লাগে: ক্লায়েন্ট চাংক স্ট্রিম করে, সার্ভার শেষে একটা মাত্র রেজাল্ট দেয়।

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

দুটো শব্দভাণ্ডার: `stream.Recv()` একটা ক্লায়েন্ট মেসেজ পড়ে; `stream.SendAndClose(resp)` একটামাত্র রেসপন্স দিয়ে স্ট্রিম শেষ করে। `Send` কল করে তারপর return **করবেন না** — client-streaming-এর জোড়া হলো `SendAndClose`।

ক্লায়েন্ট:

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

`CloseAndRecv` সিগন্যাল দেয় "আর কিছু পাঠাব না" এবং সার্ভারের একটামাত্র রেসপন্সের জন্য অপেক্ষা করে। client-stream-এর `Send`-কে সবসময় `CloseAndRecv`-এর সাথে জোড়া লাগান।

## Bidirectional — full duplex

দুই পক্ষই স্বাধীনভাবে পাঠায় ও গ্রহণ করে। অর্ডার per-stream, দুই দিকের মধ্যে coordinate করা নয়। ক্লাসিক উদাহরণ একটা chat:

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

ক্লায়েন্ট:

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

`stream.CloseSend()` বলে "আমার দিক থেকে আর কিছু নেই" কিন্তু তখনও receive চালু রাখে। এরপর সার্ভারের `Recv` `io.EOF` রিটার্ন করে আর goroutine পরিষ্কারভাবে বেরিয়ে যায়।

send আর receive দিক দুটো স্বাধীন — এক goroutine দিয়ে পড়ুন, আরেকটা দিয়ে লিখুন। দরকার হলে channel দিয়ে coordinate করুন।

<Callout type="warn">

**Bidi স্ট্রিম লিক করা সহজ।** যে goroutine `Recv()` কল করে কিন্তু কখনো `io.EOF` দেখে না (কারণ সার্ভার return করতে ভুলে গেছে), সেটা চিরকাল বেঁচে থাকে। সবসময় জোড়া মেলান: ক্লায়েন্ট `CloseSend()` → সার্ভার `Recv` EOF রিটার্ন করে → সার্ভার return করে → ক্লায়েন্ট `Recv` EOF রিটার্ন করে → goroutine বেরিয়ে যায়। ক্লায়েন্টকে স্ট্রিমের মাঝপথে kill করে আর সার্ভার লগে অরফ্যান হ্যান্ডলার খুঁজে cancellation path টেস্ট করুন।

</Callout>

## স্ট্রিম জুড়ে backpressure

HTTP/2 flow control (চ্যাপ্টার ৩) আপনাকে per-stream backpressure ফ্রি-তে দেয়, একটা সূক্ষ্মতা সহ: প্রতিটা দিকের নিজস্ব উইন্ডো আছে।

server-streaming-এ, আপনার প্রোডিউসার যদি নেটওয়ার্ক বা ক্লায়েন্টের চেয়ে দ্রুত হয়, `stream.Send()` ক্লায়েন্টের উইন্ডো না খোলা পর্যন্ত ব্লক থাকে। এটাই আপনি চান।

client-streaming-এ, সার্ভার যদি পড়তে স্লো হয়, ক্লায়েন্টের `stream.Send()` ব্লক থাকে। একই dynamic, উল্টো দিকে।

bidirectional-এ, দুই উইন্ডো স্বাধীনভাবে চলে। এক দিকের একজন স্লো receiver অন্য দিককে থ্রটল করে না।

ডিফল্ট HTTP/2 উইন্ডো per stream ৬৪ KiB। high-throughput স্ট্রিমের (লগ, telemetry, ভিডিও) জন্য সার্ভার আর ক্লায়েন্ট দুই দিকেই এটা বাড়ান (চ্যাপ্টার ৩-এ dial option আছে)। এটা ছাড়া, throughput প্রতি round-trip-এ এক উইন্ডোতে আটকে যায় — একটা কঠিন ছাদ।

## Cancellation প্যাটার্ন

একটা স্ট্রিম তিন জায়গায় শেষ হতে পারে:

1. **সার্ভার return করে** — হ্যান্ডলার শেষ, স্ট্রিম পরিষ্কারভাবে বন্ধ হয়। ক্লায়েন্ট `Recv` `io.EOF` রিটার্ন করে।
2. **ক্লায়েন্ট cancel করে** (`ctx.cancel()` বা deadline শেষ)। দুই পক্ষের `ctx.Done()` fire করে; pending `Send` আর `Recv` `context.Canceled` বা `context.DeadlineExceeded` রিটার্ন করে।
3. **নেটওয়ার্ক মরে গেছে।** TCP লেয়ার (একসময়) টের পায়। `Send`/`Recv` একটা non-EOF error রিটার্ন করে।

আপনার হ্যান্ডলারকে তিনটাই সামলাতে হবে। প্যাটার্ন:

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

`Send` error রিটার্ন করা মানে সাধারণত স্ট্রিম মৃত — break করে বেরিয়ে আসুন, cleanup করুন।

## স্ট্রিমে deadline

একটা স্ট্রিমিং RPC-তে deadline সেট করা মানে **পুরো স্ট্রিম**-কে ওই উইন্ডোর মধ্যে শেষ হতে হবে:

```go
ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
defer cancel()

stream, _ := client.Watch(ctx, req) // server-streaming
```

`client.Watch`-এর ৩০ সেকেন্ড পর স্ট্রিম জোর করে বন্ধ হয়ে যায়। দীর্ঘজীবী স্ট্রিমের (log tail, dashboard) জন্য অনেক বড় deadline ব্যবহার করুন — বা একদম নয় (`context.Background()`), আর কনজিউমার শেষ হলে cancellation-এর উপর ভরসা করুন।

স্ট্রিমিং + টাইট deadline একটা কমন বাগ: ঘণ্টার পর ঘণ্টা চলার কথা এমন একটা ক্লায়েন্ট এক মিনিট পরই মরে যায় কারণ deadline-টা unary কলের জন্য ভাবা হয়েছিল।

## Resumability — gRPC এটা আপনাকে দেয় না

একটা server-streaming RPC যদি স্ট্রিমের মাঝপথে মরে যায় আর ক্লায়েন্ট আবার কানেক্ট করে, নতুন স্ট্রিম নতুন রিকোয়েস্টের শুরু থেকে চালু হয় — ক্লায়েন্ট আগে কী দেখেছে সার্ভারের সেটা জানা নেই। **gRPC-তে কোনো built-in স্ট্রিম resumption নেই।**

resumable স্ট্রিম দরকার হলে অ্যাপ্লিকেশন লেয়ারে বানান:

- সার্ভার প্রতিটা event-এ একটা `cursor` বা `seq` ফিল্ড রাখে।
- ক্লায়েন্ট reconnect-এ `WatchRequest{Topic: "alerts", AfterCursor: "abc"}` পাঠায়।
- সার্ভার ওই cursor-এর পর থেকে resume করে।

এটা event store reader-দের সেই একই প্যাটার্ন। একবার বানান, স্ট্রিমিং যেখানেই দরকার সেখানে ব্যবহার করুন।

## Multiplexing মানে সস্তা স্ট্রিম

যেহেতু প্রতিটা স্ট্রিম নেহাতই একটা HTTP/2 স্ট্রিম, এক কানেকশনে হাজারটা খোলা কোনো সমস্যা নয়। কোনো per-stream TCP handshake নেই, per-stream TLS কাজ নেই, per-stream HTTP/1.1 head-of-line blocking নেই।

এতে এমন প্যাটার্ন সম্ভব হয় যা অন্যত্র বেমানান:

- প্রতিটা subscription টপিকে একটা দীর্ঘজীবী স্ট্রিম, প্রতি ক্লায়েন্টে শত শত।
- রিয়েল-টাইম dashboard-এর জন্য per-tab subscription।
- per-user agent কানেকশন যা অনেক স্ট্রিম অনির্দিষ্টকাল ধরে রাখে।

খরচ বেশিরভাগই মেমরি (per stream একটা buffer) আর GC pressure। প্রতি প্রসেসে দশ হাজারের বেশি ঠেললে profile করুন।

## কখন স্ট্রিমিং ব্যবহার করবেন না

- **ডেটা ছোট আর one-shot।** unary ব্যবহার করুন; স্ট্রিমিং একটা overhead।
- **প্রক্সি ছাড়া ব্রাউজার সাপোর্ট দরকার।** gRPC-Web server-streaming সাপোর্ট করে কিন্তু client-streaming বা bidirectional করে না।
- **কনজিউমাররা curl-ওয়ালা মানুষ।** স্ট্রিমিং হাতে ইন্সপেক্ট করা কঠিন। `grpcurl` পারে, কিন্তু ad-hoc-friendly গল্পটা হারিয়ে যায়।
- **ডেটা একটা দেরিসহ request-response।** বড় deadline সহ unary ব্যবহার করুন। স্ট্রিমিং সত্যিকারের incremental ডেটার জন্য।

বেশিরভাগ সার্ভিসে একটা-দুটো সত্যিকারের স্ট্রিমিং endpoint (log, notification, live update) আর একশোটা unary RPC থাকে। এটা একটা স্বাস্থ্যকর মিশ্রণ।

## রিক্যাপ

- চারটা শেপ: unary, server-stream, client-stream, bidi। প্রতিটাই একটা করে HTTP/2 স্ট্রিম।
- server-streaming একটা error রিটার্ন করে, ডেটা পাঠায় `stream.Send()` দিয়ে। সবসময় `stream.Context().Done()`-এর উপর select করুন।
- client-streaming `Send`-কে `SendAndClose` (সার্ভার) আর `CloseAndRecv` (ক্লায়েন্ট)-এর সাথে জোড়া লাগায়।
- Bidi স্ট্রিম: send আর receive স্বাধীনভাবে। `CloseSend` ক্লায়েন্ট দিক শেষ করে।
- Backpressure হলো HTTP/2 flow control। high-throughput স্ট্রিমের জন্য উইন্ডো বাড়ান।
- Cancellation context done দিয়ে শেষ হয়। তিনটা end state-ই সামলান (সার্ভার return, cancel, নেটওয়ার্ক)।
- deadline পুরো স্ট্রিমের উপর প্রযোজ্য — দীর্ঘজীবী স্ট্রিমের জন্য বড় (বা কোনো) deadline ব্যবহার করুন।
- Resumability আপনার কাজ। cursor, সার্ভার-সাইড replay।
- Multiplexing অনেক concurrent স্ট্রিমকে সস্তা করে। যেখানে ডেটা সত্যিকারের incremental সেখানে ব্যবহার করুন।

পরবর্তী: [Errors, deadlines, metadata](/notes/grpc/07-errors-deadlines) — স্ট্যাটাস কোড, deadline propagation, আর প্রতিটা কলে gRPC যে হেডারগুলো বহন করে।
