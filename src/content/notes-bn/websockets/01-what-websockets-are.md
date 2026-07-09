---
title: 'WebSockets কী এবং কখন ব্যবহার করবেন'
subtitle: 'একটা WebSocket হলো একটা bidirectional, persistent TCP connection যা জীবন শুরু করে একটা HTTP request হিসেবে। যখন REST বা RPC কোনোটাই মানায় না তখন কাজে লাগে। প্রায়ই ভুলভাবে ব্যবহৃত হয়।'
chapter: 1
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['websockets', 'sse', 'realtime', 'polling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

WebSocket হলো "আমাকে একটা browser-এ push করতে হবে, low-latency, দুই দিকেই, এমন একটা connection-এ যেটা খোলা থাকে" — এর উত্তর। যে কয়টা protocol browser নেটিভভাবে বোঝে তার মধ্যে এটাই এমন একটা যা request-response নয়। বাকি প্রতিটা shape — REST, GraphQL, gRPC — ধরে নেয় client আগে কথা বলবে।

এই বৈশিষ্ট্য বদলে দেয় আপনি কী ধরনের feature ship করতে পারবেন। এটা এমন একটা bug-এর ক্যাটাগরিও খুলে দেয় যা stateless protocol-এ নেই।

<Callout type="info">

**বাস্তব উদাহরণ**

HTTP হলো চিঠি পাঠানোর মতো — আপনি লেখেন, উত্তরের জন্য অপেক্ষা করেন, আবার একই কাজ করেন; একটা WebSocket হলো একটা লাইভ ফোন কল যেখানে দুই পক্ষ যেকোনো মুহূর্তে অবাধে কথা বলতে পারে।

</Callout>

## বড় ছবিটা

একটা WebSocket শুরু হয় একটা সাধারণ HTTP/1.1 GET request হিসেবে, সাথে `Upgrade: websocket`। server রাজি হয়, connection protocol switch করে, আর সেই মুহূর্ত থেকে এটা একটা raw bidirectional pipe যা **frame** (ছোট length-prefixed binary record) বহন করে। দুই পক্ষের যেকোনোটা যেকোনো সময় frame পাঠায়। কেউ বন্ধ না করা বা network ড্রপ না করা পর্যন্ত connection বেঁচে থাকে।

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

handshake হলো HTTP। handshake-পরবর্তী traffic নিজের একটা আলাদা protocol (RFC 6455)। দুই অর্ধেকই জানলে যে অংশগুলো misconfigured সেগুলো debug করা সহজ হয়।

## "realtime"-এর চারটি shape

|                              | দিক             | Connection                              | Latency              | Browser native  |
| ---------------------------- | --------------- | --------------------------------------- | -------------------- | --------------- |
| **Polling**                  | client → server | প্রতি poll-এ একটা                       | high (poll interval) | yes             |
| **Long-polling**             | client → server | প্রতি cycle-এ একটা, update পর্যন্ত idle | medium               | yes             |
| **SSE** (Server-Sent Events) | server → client | একটা persistent                         | low                  | yes             |
| **WebSockets**               | দুই দিকেই       | একটা persistent                         | low                  | yes             |
| **gRPC streams**             | দুই দিকেই       | একটা persistent (HTTP/2)                | low                  | no (proxy লাগে) |

ভুলটা বাছাই করাটা এক ধরনের bug।

**Polling** ঠিক আছে "এটা হয়তো প্রতি 30 সেকেন্ডে বদলাতে পারে আর user 5 সেকেন্ডের staleness টের পাবে না" — এমন ক্ষেত্রে। Order status page, deploy dashboard, যেখানে exact timing গুরুত্বপূর্ণ নয় এমন যেকোনো কিছু।

**Long-polling** হলো SSE-র আগে jQuery যা করত। এখন বেশিরভাগই ইতিহাস; SSE একে পরিষ্কারভাবে replace করে।

**SSE** হলো অপ্রশংসিত নায়ক। One-way (server push করে, client receive করে), যেকোনো HTTP proxy-র ভেতর দিয়ে কাজ করে, browser-এ auto-reconnect করে, implement করা ভীষণ সহজ। বেশিরভাগ "realtime" feature (notification, live counter, log tail) শুধু one-way push দরকার। **যদি এক দিক যথেষ্ট হয়, প্রথমে SSE বেছে নিন।** চ্যাপ্টার 5-এ পুরো প্যাটার্ন আছে।

**WebSockets** যখন আপনার সত্যিই low latency সহ bidirectional traffic দরকার: chat, collaborative editing, multiplayer game, agent control, live trading।

**gRPC streaming** যখন দুই প্রান্তই service (বা আপনার client SDK একটা proxy সহ gRPC-Web ship করে)। নেটিভ browser support সীমিত।

<Callout type="warn">

**WebSockets "আরও realtime"-এর জন্য জাদুকরী upgrade নয়।** প্রতি 200 ms-এ poll করা একটা REST endpoint প্রতি 30 s-এ reconnect করা একটা WebSocket-এর চেয়ে দ্রুত। জিতটা protocol-এ নয়; এটা _connection model_-এ — একটা persistent pipe প্রতি-call overhead এড়ায়। যদি আপনার data মিনিটে একবার update হয়, polling-ই সঠিক উত্তর।

</Callout>

## কখন WebSockets সঠিক

- **Chat, comments, presence.** দুই পক্ষই অনিশ্চিত সময়ে type করে।
- **Collaborative editing.** Operational transform বা CRDT দুই দিকেই বইছে।
- **Multiplayer game.** State sync, input event, low-latency।
- **Live agent UI.** Server status push করে, client control command পাঠায়।
- **Streaming dashboard** যেখানে user লাইভ filter-ও configure করতে পারে।

একটা heuristic: **client-কে কি request/response handshake ছাড়াই একই connection-এ data পাঠাতে হবে?** যদি হ্যাঁ, WebSocket। client যদি শুধু consume করে, SSE। client যদি শুধু burst পাঠায়, batched HTTP।

## কখন WebSockets ভুল

- **আপনি শুধু push করেন, client কখনো পাঠায় না।** SSE — অর্ধেক protocol, দ্বিগুণ সরলতা।
- **আপনি শুধু write-এর burst পান।** শুধু POST করুন। Connection setup-এর খরচ পোষায় না।
- **আপনার retry আর per-call timeout সহ request/response semantics দরকার।** REST বা gRPC।
- **data shape rigid আর typed।** gRPC streaming আপনাকে একই persistent connection model সহ protobuf + HTTP/2 দেয়।
- **আপনার traffic এমন একটা HTTP proxy পার হয় যা আপনি control করেন না।** কিছু proxy `Upgrade` support করে না। SSE যেখানে HTTP/1.1 কাজ করে সেখানে সব জায়গায় কাজ করে।

## mental model

একটা WebSocket হলো দুটো state machine (প্রতি পক্ষে একটা) যা একটা single TCP connection-এর উপর frame পাঠায়। handshake শেষ হওয়ার পর "request" বা "response" বলে কোনো ধারণা নেই। প্রতি message-এ কোনো header নেই। দুই পক্ষের যেকোনোটা যেকোনো সময় একটা frame পাঠাতে পারে, close frame সহ।

শুনতে সরল। জটিলতাগুলো:

1. **Connection stateful আর long-lived।** ৫০,০০০ WebSocket connection ধরে থাকা একটা server আসলে ৫০,০০০ file descriptor আর ৫০,০০০ goroutine (Go-তে) বা ৫০,০০০ socket (Node-এ) ধরে আছে। OS আর runtime tune করাটা গুরুত্বপূর্ণ।
2. **Connection জুড়ে message unordered।** একই connection-এ দুটো message ক্রমে পৌঁছায়। দুটো connection-এ দুটো message পৌঁছায় না।
3. **কোনো built-in delivery guarantee নেই।** kernel যে frame buffer করেছিল আর network যেটা ড্রপ করেছে সেটা চলে গেছে। at-least-once লাগলে, আপনি সেটা উপরে বানান।
4. **কোনো request/response correlation নেই।** client যদি একটা message-এর reply চায়, আপনি উপরে একটা request ID system বানান।

চ্যাপ্টার 4 আর 9 এই protocol design পছন্দগুলো cover করে যা এগুলো ম্যানেজেবল করে।

## উপরে যা চলে — message protocol

Raw WebSocket frame text বা binary byte বহন করে। তার উপরে, আপনি নিজের protocol বাছেন:

- **JSON over text frames** — browser app-এর জন্য default। Debug করা সহজ, scale-এ parse করা slow।
- **MessagePack বা CBOR over binary frames** — compact, fast, polyglot। High-volume traffic-এর জন্য মূল্যবান।
- **Protobuf over binary frames** — gRPC-তে যে protobuf ব্যবহার করেছিলেন সেটাই। Strict schema, fast, polyglot।
- **Custom binary** — game-এর জন্য যেখানে প্রতিটা byte গুরুত্বপূর্ণ।

বেশিরভাগ app benchmark দাবি না করা পর্যন্ত JSON-এ থিতু হয়। চ্যাপ্টার 4 tradeoff আর framing decision-গুলো নিয়ে হাঁটে যা যেভাবেই হোক আপনাকে নিতে হবে।

## যে library-গুলো ব্যবহার করবেন

**Go:** `github.com/coder/websocket` (আগে `nhooyr.io/websocket`)। Modern, idiomatic, context-aware, সরাসরি `net/http` ব্যবহার করে। পুরোনো `gorilla/websocket`-কে replace করে (এখনো maintained কিন্তু আরও ক্লাঙ্কি API সহ)।

**Node:** server-এর জন্য `ws`, client-এর জন্য নেটিভ browser `WebSocket` API।

**Python:** `websockets` (asyncio-native) বা integrated HTTP + WS-এর জন্য `aiohttp`।

**Browser:** `new WebSocket(url)` built in। বা auto-reconnect-এর জন্য `partysocket` / `reconnecting-websocket`।

এই ট্র্যাক Go-তে `coder/websocket` ব্যবহার করে। প্যাটার্নগুলো সরাসরি খাটে।

## "realtime" আসলে কী বোঝায়

মনে রাখার মতো তিনটা latency tier:

- **End-to-end 50 ms-এর নিচে** — interactive, instant মনে হয়। Multiplayer game, live cursor position, voice/video signaling।
- **End-to-end 500 ms-এর নিচে** — fast মনে হয়। Chat, notification, presence update।
- **End-to-end 5 s-এর নিচে** — live মনে হয়। Dashboard, comment thread, deploy progress।

WebSockets আপনাকে তিনটাতেই নিয়ে যায়, কিন্তু বেশিরভাগ latency আপনার code-এ, protocol-এ নয়। একটা database write আর 1000 subscriber-এ fan-out সহ একটা WebSocket message সহজেই 500 ms পার করতে পারে — WebSockets-এর কারণে নয়, বরং বাকি সবকিছুর কারণে। কোন tier আপনার দরকার তা জানলে পরে architecture পছন্দ শেপ হয়।

## চ্যাপ্টার 10-এ আমরা কী ship করি

একটা self-hosted Go service যা:

- `wss://example.com/ws`-এ WebSocket connection নেয় (TLS, nginx-এর পেছনে)।
- handshake-এ একটা session/token verify করে (চ্যাপ্টার 8)।
- client-দের room-এ join করায় (চ্যাপ্টার 7)।
- Redis pub/sub-এর মাধ্যমে এক process থেকে অন্য process-এ connected client-দের message push করে (চ্যাপ্টার 6)।
- bounded buffer আর drop policy দিয়ে slow client-এ টিকে থাকে (চ্যাপ্টার 9)।
- metric, log আর graceful shutdown সহ একটা systemd service হিসেবে চলে (চ্যাপ্টার 10)।

GraphQL আর gRPC ট্র্যাকের মতোই একই operational shape। Vendor-neutral, একটা VPS-এ, কোনো managed service নেই।

## Recap

- WebSocket = HTTP/1.1 Upgrade + একটা TCP connection-এর উপর bidirectional frame।
- polling, long-polling, SSE, gRPC stream-এর সাথে তুলনা করুন। SSE বিস্ময়করভাবে প্রায়ই সঠিক পছন্দ।
- Chat, collaboration, game, agent UI-এর জন্য সঠিক। এক দিক যথেষ্ট হলে বা request/response লাগলে ভুল।
- Long-lived connection মানে OS tuning আর stateful server-side bookkeeping।
- উপরে message protocol আপনার পছন্দ — সহজতার জন্য JSON, scale-এর জন্য msgpack/protobuf।
- Library: এই ট্র্যাকে Go-র জন্য `coder/websocket`। প্যাটার্ন generalize করে।

পরবর্তী: [handshake আর frame protocol](/notes/websockets/02-handshake-frames) — wire-এ আসলে কী আছে, byte by byte।
