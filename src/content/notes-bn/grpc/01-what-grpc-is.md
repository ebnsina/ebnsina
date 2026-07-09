---
title: 'gRPC কী আর কখন ব্যবহার করবেন'
subtitle: 'gRPC হলো HTTP/2, সাথে protobuf, সাথে codegen। এই তিনটা মিলে আপনাকে একটা typed, দ্রুত, polyglot RPC system দেয়। প্রতিটা layer কী করছে সেটা জানাই এটা ভালোভাবে ব্যবহার করার অর্ধেক দক্ষতা।'
chapter: 1
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['grpc', 'rpc', 'rest', 'graphql', 'protobuf']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

আপনি path-এর অধ্যায় 5-এ REST লিখেছেন। আগের topic-এ GraphQL লিখেছেন। দুটোই HTTP/1.1-এর ওপর JSON বলে। দুটোই প্রতিটা request-এ field গুলো name আর string key দিয়ে serialize করে। দুটোই যেকোনো HTTP client-কে হাত দিয়ে API ঘাঁটাঘাঁটি করতে দেয়।

gRPC এগুলোর কোনোটাই না। এটা একটা **binary** protocol, চলে **HTTP/2**-এর ওপর, একটা **schema-first** contract সহ যা আপনার ভাষায় কোড জেনারেট করে। আপনি HTTP handler লেখেন না; আপনি একটা service implementation লেখেন, framework network plumbing জুড়ে দেয়।

এটা খুবই আলাদা একটা shape। এই অধ্যায় হলো সেই shape কখন সঠিক তা ঠিক করা নিয়ে।

<Callout type="info">

**Real-World Analogy**

gRPC আপনাকে অন্য একটা কম্পিউটারে একটা function কল করতে দেয় ঠিক যতটা সহজভাবে একটা local function কল করা যায় — network অদৃশ্য হয়ে যায়।

</Callout>

## একটা gRPC কল দেখার মতো

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

কোনো URL নেই। কোনো JSON নেই। হাতে বানানো কোনো status code নেই। wire format হলো binary protobuf; function call টা দেখতে একটা local function call-এর মতো। এটাই RPC-র পুরো pitch: remote call গুলোকে local-এর মতো অনুভব করানো।

যে contract এটা সম্ভব করে তা হলো একটা `.proto` ফাইল:

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

`protoc` সেই ফাইলটা পড়ে আর Go (বা Node, বা Python, বা Rust) কোড emit করে। server service টা implement করে; client সেটা কল করে।

## gRPC-র তিনটা layer

প্রতিটা না জেনে আপনি gRPC ভালোভাবে ব্যবহার করতে পারবেন না।

**1. Protocol Buffers** — schema language আর wire format। আপনি `.proto` লেখেন, আপনি binary ship করেন। JSON-এর চেয়ে ছোট, parse করতে দ্রুত, কড়াকড়িভাবে typed। অধ্যায় 2।

**2. HTTP/2** — transport। Multiplexed (একটা TCP connection-এ অনেকগুলো concurrent call), header-compressed, server push আর bidirectional stream সাপোর্ট করে। অধ্যায় 3।

**3. framework** — `grpc-go`, `@grpc/grpc-js`, `grpcio`। `.proto` থেকে কোড জেনারেট করে, serialization handle করে, HTTP/2 connection গুলো manage করে, deadline, error, metadata সামনে আনে।

আপনার বেশিরভাগ সময় কাটবে layer 3-এ। কিন্তু যখন কিছু ভুল হয় — stream-এর মাঝখানে একটা connection drop করে, একটা deadline propagate করে না, tcpdump-এ একটা binary রহস্য দেখা দেয় — তখন আপনাকে তিনটাই বুঝতে হবে।

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

মনে রাখার মতো তিনটা সংখ্যা:

- **Wire size:** binary protobuf সমতুল্য JSON-এর চেয়ে মোটামুটি 3–10× ছোট।
- **Parse time:** binary parsing JSON parsing-এর চেয়ে মোটামুটি 5–20× দ্রুত।
- **Connections:** HTTP/2 একটা TCP socket-এ শত শত concurrent call multiplex করে। HTTP/1.1-এর প্রতি call-এ একটা connection লাগে (বা browser pooling-এ সর্বোচ্চ 6টা)।

একটা টাইট cluster-এর মধ্যে service-to-service traffic-এর জন্য, এই সংখ্যাগুলো একে অপরের সাথে যোগ হয়ে বড় হয়।

## কখন gRPC সঠিক পছন্দ

- **আপনার নিজের infrastructure-এর ভেতরে service-to-service।** দুটো Go service একে অপরের সাথে কথা বলছে? gRPC। দুই প্রান্তই typed, দুটোই polyglot, wire দ্রুত, আর আপনার নিয়ন্ত্রণের বাইরে কোনো client নেই।
- **Polyglot টিম।** একটা Python data টিমের একটা Go service কল করা দরকার। `.proto` হলো contract; দুই টিমই নিজেদের client জেনারেট করে। কেউ হাত দিয়ে একটা "client SDK" লেখে না।
- **High-throughput, latency-sensitive path।** Realtime trading, telemetry pipeline, streaming job। binary + HTTP/2-এর গতিই এখানে পুরো ব্যাপার।
- **Bidirectional streaming।** Realtime দুই-দিকের communication। Chat, video signaling, live dashboard। gRPC-র streaming RPC first-class, উপরে জোড়া লাগানো কিছু না।
- **শক্ত contract evolution।** একটা protobuf message-এ field যোগ করা default-ভাবেই backward-compatible। wire format এটার জন্যই ডিজাইন করা হয়েছিল।

## কখন gRPC ভুল পছন্দ

- **ইন্টারনেটের ওপর public API।** Browser natively gRPC বলতে পারে না। Mobile app পারে কিন্তু SDK ভারী। ecosystem-এর নাগালের জন্য REST + JSON জেতে। gRPC-Web আছে কিন্তু সেটা asterisk-সহ gRPC।
- **মানুষের ব্যবহার।** একটা JSON API-এর বিরুদ্ধে একটা `curl` হলো দশ সেকেন্ডের debug। gRPC-র জন্য `grpcurl` (বা একটা code client) আর হাতে একটা `.proto` ফাইল লাগে।
- **Static caching / CDN।** REST `GET` request edge-এ বিনামূল্যে cache হয়। gRPC হলো HTTP/2-এর ওপর `POST` — bespoke proxy ছাড়া কোনো edge caching নেই।
- **ছোট এক-টিমের service।** আপনার টিম যদি এক বা দুইজন engineer হয় আর API-তে আটটা endpoint থাকে, তাহলে REST ship করা দ্রুত।

<Callout type="warn">

**gRPC কোনো জাদুর গতি না।** একটা naive gRPC service একটা tuned REST service-এর চেয়ে ধীর হতে পারে। জয়গুলো আসে HTTP/2 reuse, binary serialization, codegen, আর streaming-এর _সংমিশ্রণ_ থেকে। আপনি যদি streaming ছাড়া আর ছোট message নিয়ে HTTP/1.1-এর ওপর gRPC ব্যবহার করেন (gRPC-Web fallback), তাহলে keep-alive HTTP/1.1-এর ওপর JSON তুলনীয়।

</Callout>

## RPC-র চার রকম

gRPC চার রকম call shape সাপোর্ট করে — আপনার data flow-এর সাথে যেটা মেলে সেটা বেছে নিন:

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

বেশিরভাগ API unary ব্যবহার করে। Streaming হলো সেই lever যেটার দিকে আপনি হাত বাড়ান যখন data সত্যিই দীর্ঘ-জীবী: log tail, telemetry, realtime collaboration।

## gRPC-র জন্য "self-hosted" দেখতে কেমন

পুরো track টা vendor-neutral থাকে। আপনি একটা VPS-এ, nginx-এর পেছনে, mTLS আর Prometheus metrics সহ gRPC service চালাবেন। কোনো "use Cloud Run" বা "deploy to Anthos" নেই। একটা static Go binary, একটা systemd unit, একটা nginx config — REST আর GraphQL track গুলোর মতোই একই operational shape।

পরের নয়টা অধ্যায়ে আপনি যেসব tool ইনস্টল করবেন:

- `protoc` — protocol buffers compiler (`apt install protobuf-compiler`)।
- `protoc-gen-go` আর `protoc-gen-go-grpc` — Go code generator (`go install`)।
- `grpcurl` — gRPC-র জন্য `curl`-এর মতো। Debugging-এর জন্য অপরিহার্য।
- `buf` — `protoc`-এর আধুনিক বিকল্প, linting আর breaking-change detection সহ।

## grpc-go বনাম grpc-go-experimental নিয়ে একটা নোট

grpc-go হলো canonical Go implementation। এটা একটা Google project, Google-এর ভেতরে ব্যবহৃত, stable আর battle-tested। আমরা সর্বত্র এটা ব্যবহার করি। নির্দিষ্ট কারণ না থাকলে fork আর experimental client এড়িয়ে চলুন; wire compatibility সর্বজনীন তাই framework পছন্দ পুরোপুরি ergonomics-এর ব্যাপার।

## REST gateway আর gRPC-Web নিয়ে কী

এখনই জেনে রাখার মতো দুটো adapter, যদিও অধ্যায় 10-এর আগে আমরা এগুলো ব্যবহার করি না:

- **grpc-gateway** — আপনার `.proto` থেকে একটা REST/JSON proxy জেনারেট করে। Browser (বা যেকোনো HTTP client) REST কল করে; gateway সেটা gRPC-তে অনুবাদ করে। ভালো যখন একটা service-কে দুই implementation না লিখে internal caller (gRPC) আর public caller (REST) — দুইকেই serve করতে হয়।
- **gRPC-Web** — browser-এর জন্য একটা wire-compatible variant। gRPC-Web থেকে native gRPC-তে অনুবাদ করতে একটা proxy (Envoy, nginx, বা Connect) লাগে।

আপনি যদি এমন একটা service শুরু করেন যা সম্পূর্ণ backend-to-backend, তাহলে আপনার কোনোটাই লাগবে না। আপনার যদি একটা browser-কে সরাসরি gRPC কল করাতে হয়, তাহলে অধ্যায় 10-এ gRPC-Web-এর পরিকল্পনা করুন।

## রিক্যাপ

- gRPC = HTTP/2 + protobuf + codegen। তিনটা layer, সবগুলোই বোঝার মতো।
- wire binary, contract বাধ্যতামূলক, codegen বিনামূল্যে।
- service-to-service, polyglot, streaming, latency-sensitive path-এর জন্য সঠিক।
- public API, browser-native, মানুষের-debug-বান্ধব endpoint, edge caching-এর জন্য ভুল।
- চার রকম call shape: unary, server-streaming, client-streaming, bidirectional।
- আমরা primary runtime হিসেবে grpc-go ব্যবহার করি; Node আর Python অধ্যায় 5-এ।
- Self-hosted, একটা VPS-এ, nginx-এর পেছনে — path-এর বাকি অংশের মতোই একই operational shape।

পরবর্তী: [Protocol Buffers](/notes/grpc/02-protobuf) — schema language, wire format, আর সেই evolution rule যা আপনার service গুলোকে বছরের পর বছর compatible রাখে।
