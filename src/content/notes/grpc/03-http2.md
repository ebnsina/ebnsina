---
title: 'নিচে যে HTTP/2 চলছে'
subtitle: 'gRPC হলো HTTP/2 — একটা নির্দিষ্ট সেট হেডার আর protobuf বাইটকে ফ্রেম করার একটা নির্দিষ্ট উপায় সহ। HTTP/2 আসলে কী করে সেটা জানলে প্রোডাকশনে আপনি যত gRPC failure mode-এ পড়বেন তার সবগুলোই ব্যাখ্যা হয়ে যায়।'
chapter: 3
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['grpc', 'http2', 'framing', 'multiplexing', 'flow control']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

gRPC ফ্রেমওয়ার্ক জেনারেটেড কোডের পেছনে HTTP/2 লুকিয়ে রাখে। বেশিরভাগ দিন এটা ঠিকঠাকই চলে। কিন্তু যেই মুহূর্তে আপনি একটা আটকে থাকা stream, এমন একটা balancer যেটা সব কল একই backend-এ pin করে দিয়েছে, বা নিঃশব্দে মরে যাওয়া একটা connection ডিবাগ করবেন — সেই মুহূর্তে HTTP/2 আর কোনো implementation detail থাকে না, বরং হয়ে যায় এমন জিনিস যেটা আপনাকে বুঝতেই হবে।

এই অধ্যায়টা gRPC-এর দৃষ্টিকোণ থেকে HTTP/2। স্পেক নয়; শুধু সেই অংশগুলো যেগুলো আপনি কীভাবে অপারেট করেন তা বদলে দেয়।

<Callout type="info">

**বাস্তব জীবনের উপমা**

HTTP/2 হলো একটা মাল্টি-লেন হাইওয়ে বনাম সিঙ্গেল-লেন রাস্তার মতো — HTTP/1.1 হলো একটা লেন, HTTP/2 একসঙ্গে অনেকগুলো খুলে দেয়।

</Callout>

## গল্পে বুঝি

বিরুনির অফিসটা পুরনো আমলের — সাততলা দালান, আর প্রতি ফ্লোরের মধ্যে চিঠি-নথি পাঠানোর জন্য দেয়ালের ভেতর দিয়ে গেছে একটাই নিউম্যাটিক-টিউব পাইপ। ছোট ছোট ক্যাপসুলে কাগজ ভরে টিউবে ফেললেই হাওয়ার চাপে হুশ করে সেটা চলে যায় গন্তব্যে। মজার ব্যাপার হলো, প্রতিটা ক্যাপসুলের গায়ে একটা লেবেল সাঁটা থাকে — "৩ নম্বর ফ্লোর, হিসাব বিভাগ", "৫ নম্বর ফ্লোর, সিনা"। নিচতলার সর্টিং ঘরে ফাতিমা লেবেল দেখেই বুঝে নেন কোন ক্যাপসুল কোথায় পাঠাতে হবে।

গুরুত্বপূর্ণ কথাটা হলো — পাইপটা কিন্তু সবসময় বসানোই থাকে, প্রতিবার নতুন করে পাইপ পাততে হয় না। একই সেকেন্ডে হিসাব বিভাগের তিনটা ক্যাপসুল, খোয়ারিজমির দুটো নথি, আর উপর থেকে নিচে আসা কয়েকটা জবাব — সব একসাথে একই পাইপের ভেতর দিয়ে দুই দিকেই হুশ হুশ করে ছুটছে। লেবেল থাকার কারণে কোনোটা কোনোটার সাথে গুলিয়ে যায় না, সর্টার ঠিকঠাক আলাদা করে ফেলে। ডজনখানেক আলাদা কথোপকথন একটামাত্র পাইপ ভাগাভাগি করে চলছে, অথচ কারও জন্য কাউকে অপেক্ষা করতে হচ্ছে না।

এই গল্পটাই আসলে HTTP/2। সবসময় বসানো ওই একটা পাইপ হলো একটা persistent connection — প্রতি মেসেজে নতুন connection খুলতে হয় না। প্রতিটা লেবেল-করা ক্যাপসুল হলো একেকটা stream বা frame, আর একসাথে দুই দিকে বয়ে চলা অনেকগুলো ক্যাপসুল হলো multiplexing আর bidirectional traffic। gRPC ঠিক এভাবেই কাজ করে — একটা long-lived HTTP/2 connection-এর ওপর শত শত stream একসাথে interleave হয়ে দুই দিকে চলে, প্রতি কলে নতুন connection সেটআপের খরচ ছাড়াই। বাস্তবে এই কারণেই একটা Go service আরেকটাকে একটামাত্র connection দিয়ে সেকেন্ডে হাজার হাজার RPC পাঠাতে পারে।

## HTTP/2-এর আকৃতি

HTTP/1.1 একটা টেক্সট প্রোটোকল। একটা TCP connection-এ একবারে একটা request (বা pipelined, যদি কেউ এটা সাপোর্ট করত, যেটা তারা করে না)। প্রতি কলে নতুন connection, নয়তো ছয়-ওয়ে browser pool।

HTTP/2 একটা বাইনারি প্রোটোকল যেখানে একটা TCP connection-এ দুই দিকেই **frame** বয়ে চলে। প্রতিটা frame একটা **stream**-এর অন্তর্ভুক্ত। Stream-গুলো multiplexed — ভিন্ন ভিন্ন stream-এর frame একই connection-এ interleave হয়। এটাই পুরো গল্প।

```
HTTP/1.1: client → request → server → response → client (one at a time)

HTTP/2:   client ↔ frame frame frame frame frame ↔ server
                  stream 1 stream 3 stream 1 stream 5
```

Stream-এর ID থাকে (client থেকে বিজোড় সংখ্যা, server থেকে জোড়)। এগুলো full-duplex — দুই পক্ষই যেকোনো সময় frame পাঠাতে পারে। Stream খোলে, frame আদান-প্রদান করে, আর বন্ধ হয়।

## একটা gRPC কল HTTP/2-এর ওপর কীভাবে চড়ে

একটা unary gRPC কল হলো একটা HTTP/2 stream। যে frame-গুলো বয়ে চলে:

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

ওই শেষ HEADERS frame-টা — যেটা DATA-এর _পরে_ পাঠানো হয় — সেটাই gRPC-এর **trailers**। HTTP/1.1 body শুরু হয়ে গেলে আর হেডার পাঠাতে পারে না; HTTP/2 পারে। gRPC status code আর message বহন করতে trailers ব্যবহার করে। এই কারণেই প্রতিটা gRPC client-এর trailer support লাগে।

Streaming RPC-এর ক্ষেত্রে একই stream-এ একাধিক DATA frame বয়ে চলে। Framing ফরম্যাটটা হলো `[1-byte compressed flag][4-byte length][message bytes]`, যা বারবার হয়। একটা reader একবারে একটা length-prefixed message টেনে নেয়।

## Multiplexing — মোক্ষম ফিচার

একটা TCP connection। শত শত concurrent stream। প্রতি কলে কোনো connection setup নেই।

যে service-to-service traffic সাধারণত খুব chatty, তার জন্য এটা বিশাল ব্যাপার। তুলনা করুন:

|                             | HTTP/1.1                                      | HTTP/2          |
| --------------------------- | --------------------------------------------- | --------------- |
| ১০০ কলের জন্য TCP handshake | 100 (বা keep-alive + ৬-এর pool দিয়ে 17)      | 1               |
| TLS handshake               | 100 (বা 17)                                   | 1               |
| একসঙ্গে in-flight           | origin প্রতি 6 (browser limit)                | শত শত           |
| Head-of-line blocking       | হ্যাঁ (পরের request আগেরটার জন্য অপেক্ষা করে) | না (per-stream) |

বাস্তব প্রভাব: একটা Go service gRPC-এর ওপর আরেকটা Go service কল করলে একটা connection-এই সেকেন্ডে হাজার হাজার RPC অনায়াসে টিকিয়ে রাখে। একই workload HTTP/1.1 + JSON-এ তার বেশিরভাগ সময় connection churn-এ কাটিয়ে দেয়।

<Callout type="info">

**প্রতি backend-এ একটা connection, প্রতি কলে নয়।** gRPC client প্রতিটা backend-এর জন্য একটা long-lived `ClientConn` ধরে রাখে। সেটা reuse করুন; প্রতি কলে dial করবেন না। client-কে ভুলভাবে ব্যবহার করা (প্রতি request-এ একটা নতুন `ClientConn` বানানো) multiplexing-এর সুবিধা নষ্ট করে দেয় এবং এটাই সবচেয়ে common gRPC performance বাগ।

</Callout>

## Flow control — বিল্ট-ইন backpressure

HTTP/2-এ per-stream আর per-connection **flow control window** থাকে। একটা receiver জানান দেয় "এই stream-এর জন্য আমার কাছে N বাইট buffer আছে।" Sender-রা সেটা ছাড়িয়ে যেতে পারবে না।

Sender যখন window-তে পৌঁছে যায়, তখন DATA frame পাঠানো বন্ধ করে দেয় যতক্ষণ না receiver একটা `WINDOW_UPDATE` পাঠায় যেটা বলে "আমি M বাইট প্রসেস করেছি, তুমি আরও M পাঠাতে পারো।"

Streaming RPC-এর জন্য এটা অপরিহার্য। একটা slow consumer স্বাভাবিকভাবেই producer-কে ধীর করে দেয় — কোনো buffer ফেটে যায় না, runaway stream থেকে out-of-memory-তে মরে যাওয়াও ঘটে না। Backpressure প্রোটোকলের অংশ, আপনার বানানো কিছু নয়।

ডিফল্ট window ছোট (65 KB) আর browser-এর জন্য tuned করা। server-to-server streaming-এর জন্য এটা বাড়ান:

```go
grpc.WithInitialWindowSize(1 << 20)        // 1 MiB per stream
grpc.WithInitialConnWindowSize(1 << 23)    // 8 MiB per connection
```

এটা ছাড়া বড় streaming throughput ছোট window-এর কারণে অভুক্ত থেকে যায়।

## Header compression — HPACK

HTTP/2 HPACK দিয়ে হেডার compress করে, যেটা দেখা নাম আর value-এর একটা dictionary রাখে। প্রথমবার যখন আপনি `:path=/UserService/GetUser` পাঠান তখন এর জন্য বাইট খরচ হয়; দ্বিতীয়বার এটা এক-দুই বাইট।

gRPC-এর জন্য এটা গুরুত্বপূর্ণ কারণ প্রতিটা কল কিছু standard হেডার বহন করে (`content-type`, `te`, path)। একটা connection-এ হাজার হাজার কলের মধ্যে হেডার বাইট প্রায় শূন্যে নেমে আসে।

এর একটা পরিণাম: খুব লম্বা custom হেডার (বিশাল JWT সহ `Authorization`, custom trace header) প্রথম কলে HPACK-কে হারিয়ে দেয় কিন্তু তার পরে জিতে যায়। যেখানে সম্ভব সেখানে প্রতি কলে এগুলো বদলানো এড়িয়ে চলুন।

## Connection lifecycle আর PING

একটা gRPC connection খোলা থাকার কথা। client আর server দুই পক্ষই keepalive হিসেবে নিয়মিত `PING` frame পাঠায় — এগুলো ছাড়া NAT box আর load balancer কয়েক মিনিট পর "idle" connection ফেলে দেয়।

ডিফল্ট keepalive রক্ষণশীল। ইন্টারনেটের ওপর service-to-service-এর জন্য (বা যেখানেই অনির্ভরযোগ্য middlebox আছে), এটা আঁটসাঁট করুন:

```go
keepalive.ClientParameters{
    Time:                10 * time.Second, // ping every 10s
    Timeout:             3 * time.Second,  // wait 3s for ack
    PermitWithoutStream: true,             // ping even if no streams
}
```

Server দিক থেকে এটা অনুমোদন করতে হবে (`keepalive.EnforcementPolicy{MinTime: 5 * time.Second, PermitWithoutStream: true}`) নয়তো এটা আক্রমণাত্মক client-দের `ENHANCE_YOUR_CALM` error দিয়ে RST করবে। হ্যাঁ, ওটা আসলেই একটা real error code।

## Stream cancellation আর deadline

একটা client cancellation CANCEL code সহ `RST_STREAM` পাঠায়। Server-এর stream context cancel হয়ে যায়; handler-এর দ্রুত return করা উচিত। Deadline expiry-এর জন্যও একই — deadline পার হলে ফ্রেমওয়ার্ক স্বয়ংক্রিয়ভাবে stream cancel করে দেয়, আর server context-এর `<-ctx.Done()` ফায়ার করে।

এই কারণেই প্রতিটা gRPC handler-কে deadline-aware হতে হবে:

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

যে কোড `ctx` উপেক্ষা করে, client হাল ছেড়ে দেওয়ার পরও সেটা কাজ করতে থাকবে। নষ্ট CPU, নষ্ট DB query, সম্ভাব্য cascading failure। প্রোডাকশন gRPC-তে deadline non-negotiable; পুরো প্যাটার্নটা অধ্যায় 7-এ আছে।

## Load balancing — যেখানে HTTP/2 জীবন আরও কঠিন করে দেয়

HTTP/2-এর long-lived connection + multiplexing throughput-এর জন্য দারুণ। কিন্তু naïve load balancing-এর জন্য এগুলো _ভয়ানক_।

একটা standard L4 (TCP) load balancer client থেকে একটা connection দেখে আর সেটা একটা backend-এ route করে। সব কয়টা stream ওই একটা connection-এ চড়ে। বাকি backend-গুলো বসে থাকে। আপনি দশটা replica-তে scale করলেন; একটা নিচ্ছে 100% traffic।

তিনটা fix, পছন্দের ক্রমানুসারে:

1. **Client-side load balancing.** client সব backend-এ connection খোলে আর সেগুলোর মধ্যে round-robin করে stream ছড়িয়ে দেয়। gRPC এটা native ভাবে সাপোর্ট করে (round-robin সহ `grpc.WithDefaultServiceConfig`)। আপনার network-এর ভেতরে service-to-service-এর জন্য সবচেয়ে ভালো।
2. **L7 (HTTP/2-aware) load balancer.** Envoy, nginx (`http2` enabled সহ), Linkerd, traefik। connection নয়, একেকটা stream route করে। যে traffic trust boundary পার হয় তার জন্য সবচেয়ে ভালো।
3. **DNS-based, ছোট TTL সহ।** বাকিগুলোর চেয়ে খারাপ; সম্পূর্ণতার জন্য উল্লেখ করা হলো।

gRPC-এর সামনে একটা সাধারণ TCP load balancer বসাবেন না, যদি না আপনি imbalance মেনে নেন। পুরো প্যাটার্নটা অধ্যায় 10-এ আছে।

## TLS আর ALPN

পাবলিক ইন্টারনেটের ওপর gRPC হলো TLS 1.2 বা 1.3, যেখানে **ALPN** (Application-Layer Protocol Negotiation) handshake-এর সময় `h2` বেছে নেয়। ALPN ছাড়া server HTTP/2-কে HTTP/1.1 থেকে আলাদা করতে পারে না।

লোকালি আর বিশ্বস্ত network-এর ভেতরে plaintext HTTP/2 (`h2c`) ঠিক আছে। gRPC ফ্রেমওয়ার্ক ডিফল্টে TLS ধরে; আপনি স্পষ্টভাবে plaintext-এ opt-in করেন:

```go
// Client
conn, err := grpc.NewClient("localhost:9000",
    grpc.WithTransportCredentials(insecure.NewCredentials()))

// Server
s := grpc.NewServer()  // plaintext by default; add credentials for TLS
```

অধ্যায় 9 TLS আর mTLS পুরোপুরি কভার করে।

## Tooling — তারে কী আছে দেখা

**`grpcurl`** — gRPC-এর জন্য `curl`-এর মতো।

```bash
brew install grpcurl
grpcurl -plaintext localhost:9000 list
grpcurl -plaintext -d '{"id": 42}' localhost:9000 user.v1.UserService/GetUser
```

আপনার server reflection enabled থাকা লাগবে (অধ্যায় 4) নয়তো হাতে একটা `.proto` ফাইল। deploy করা service-এর sanity-check-এর জন্য অপরিহার্য।

**`tcpdump` + Wireshark** — আসল HTTP/2 frame দেখুন। Wireshark HTTP/2 পরিষ্কারভাবে decode করে:

```bash
sudo tcpdump -i lo -w grpc.pcap port 9000
wireshark grpc.pcap  # filter: http2
```

TLS-encrypted traffic-এর জন্য আপনাকে session key dump করতে হবে (কিছু client-এ `SSLKEYLOGFILE` env) বা dump-এর জন্য লোকালি plaintext চালাতে হবে। তারটা রহস্যমুক্ত করার জন্য career-এ একবার করার মতো।

**`netstat`/`ss`** — active connection দেখুন।

```bash
ss -tan state established '( dport = :9000 or sport = :9000 )'
```

একটা client-এর multiplex করার কথা থাকলেও যদি আপনি পঞ্চাশটা connection দেখেন, তাহলে আপনার client config ভুল।

## সাধারণ HTTP/2-ধাঁচের gRPC বাগ

**1. multiplexing-এর বদলে গাদা গাদা নতুন connection।** client প্রতি কলে একটা নতুন `ClientConn` বানাচ্ছে। Fix: প্রতি backend-এ একটা `ClientConn` ধরে রাখুন, share করুন।

**2. একটা backend সব traffic নিচ্ছে।** সামনে L4 load balancer; client একটা connection খুলেছে। Fix: client-side LB বা L7 proxy।

**3. 60 সেকেন্ড idle থাকার পর connection মরে যায়।** NAT বা middlebox ফেলে দিয়েছে। Fix: client আর server দুই দিকেই keepalive আঁটসাঁট করুন।

**4. Streaming throughput কয়েক MB/s-এ আটকে যায়।** ডিফল্ট flow control window। Fix: initial window size বাড়ান।

**5. `ENHANCE_YOUR_CALM` error।** server-এর policy-র জন্য client বড্ড বেশি ping করছে। Fix: দুই দিকের keepalive policy মিলিয়ে নিন।

## রিক্যাপ

- HTTP/2 হলো একটা TCP connection-এর ওপর বাইনারি frame, stream ID দিয়ে multiplexed।
- একটা gRPC কল হলো একটা stream — HEADERS, DATA frame, trailers (body-পরবর্তী HEADERS)।
- Multiplexing HTTP/1.1-এর connection churn শেষ করে দেয় — প্রতি backend-এ একটা client connection হাজার হাজার concurrent কল সামলায়।
- Flow control window হলো backpressure। Streaming-এর জন্য বাড়ান।
- HPACK একই connection-এ কলের মধ্যে হেডার compress করে।
- NAT আর load balancer পার হতে keepalive বাধ্যতামূলক। ডিফল্টগুলো আঁটসাঁট করুন।
- Cancellation আর deadline `RST_STREAM` হিসেবে আর `ctx.Done()`-এর মাধ্যমে বয়ে চলে। Handler-কে ctx-aware হতে হবে।
- L4 load balancer gRPC নষ্ট করে। client-side LB বা L7 proxy ব্যবহার করুন।
- ALPN TLS-এ `h2` বেছে নেয়; `h2c` হলো বিশ্বস্ত network-এর জন্য plaintext।
- `grpcurl` আর Wireshark আপনার ডিবাগিং-এর চোখ।

পরবর্তী: [আপনার প্রথম server আর client](/notes/grpc/04-first-server) — Go end-to-end, codegen সহ, এমন কোডে যা আপনি বোঝেন।
