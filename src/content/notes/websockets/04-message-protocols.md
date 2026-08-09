---
title: 'উপরে message protocol'
subtitle: 'Raw frame byte বহন করে। বাস্তব app-এর type, version আর request/response correlation দরকার। বন্য পরিবেশে দশটা client আসার আগেই message envelope ডিজাইন করলে বছরের পর বছরের যন্ত্রণা বাঁচে।'
chapter: 4
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['websockets', 'json', 'protocol', 'versioning', 'envelope']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

WebSockets আপনাকে একটা pipe দেয়। দুটো endpoint, দুই দিকে frame যাচ্ছে, "এটা কী ধরনের message" বা "এটা কি ওটার reply" বলে কোনো built-in ধারণা নেই। সেটা আপনাকে নিজে ডিজাইন করতে হবে।

এটাই সেই জায়গা যেখানে greenfield project এমন সিদ্ধান্ত নেয় যা বছরের পর বছর আফসোস করে। এখন একটা বিকেল ব্যয় করুন আর পরে একটা বছরব্যাপী migration বাঁচান।

<Callout type="info">

**বাস্তব উদাহরণ**

একটা message protocol ডিজাইন করা হলো একটা কথোপকথনের আগে একটা common ভাষায় একমত হওয়ার মতো — সেটা ছাড়া, দুই পক্ষই কথা বলছে কিন্তু কেউ বোঝে না অন্যজন কী বোঝাচ্ছে।

</Callout>

## গল্পে বুঝি

আল-খোয়ারিজমি বাগদাদে বসেন, ইবনে সিনা বসেন বুখারায়। দুজনের মাঝে শুধু একটা টেলিগ্রাফের তার — সেই তার যেকোনো শব্দ বহন করতে পারে, কিন্তু নিজে থেকে জানে না কোন শব্দটা অর্ডার, কোনটা বাতিলের খবর, আর কোনটা নিছক "তুমি কি আছ?" জিজ্ঞেস করা। তার তো শুধু বিন্দু-দাগ পাঠায়, মানে বোঝা দুই প্রান্তের নিজের দায়িত্ব। প্রথম কয়েকদিন তারা এলোমেলো বাক্য পাঠাল, আর প্রতিবার অপর প্রান্তে গিয়ে বোঝা যায় না — "৫০ থান রেশম" মানে কি নতুন অর্ডার, নাকি আগের অর্ডার সংশোধন? ধোঁয়াশা, ভুল, ঝামেলা।

তাই দুজন বসে একটা নিয়মে একমত হলো: প্রতিটা বার্তা শুরু হবে একটা category শব্দ দিয়ে, তারপর বিস্তারিত। "ORDER ৫০ থান রেশম কর্ডোবা" — মানে নতুন অর্ডার। "CANCEL অর্ডার ১৭" — মানে বাতিল। "PING" — মানে শুধু জীবিত আছি কিনা দেখা। এখন category শব্দটা দেখেই ইবনে সিনা সেকেন্ডে বুঝে যায় কীভাবে হাত লাগাতে হবে, বিস্তারিত অংশটা পড়ার আগেই। একই বেসুরো তার, কিন্তু দুজনের সম্মত convention থাকায় আর কোনো ধোঁয়াশা নেই।

এই গল্পটাই আসলে **application-level message protocol**। বেসুরো টেলিগ্রাফের তার হলো WebSocket — সে শুধু raw byte বহন করে, বার্তার মানে জানে না। দুজনের সম্মত "category শব্দ + বিস্তারিত" নিয়মটাই হলো তোমার message protocol বা **envelope**, যেটা তুমি WebSocket-এর উপরে নিজে ডিজাইন করো। category শব্দটা (`ORDER`, `CANCEL`, `PING`) হলো message-এর **type** বা event, আর তার পরের বিস্তারিত অংশটা হলো **payload** (JSON-এ যেটা `data`)। এই সম্মত envelope ছাড়া raw byte-গুলো ঠিক এলোমেলো বাক্যের মতোই অস্পষ্ট থেকে যেত। বাস্তবে chat, presence, বা multiplayer game — প্রতিটা WebSocket app ঠিক এভাবেই প্রতিটা message-কে `type` + `payload` খামে মুড়ে দুই প্রান্তকে এক ভাষায় কথা বলায়।

## envelope

প্রথম সিদ্ধান্ত: প্রতিটা message একটা envelope-এ wrap করা হয় যা `type`, `id`, আর payload বহন করে।

```json
{
	"type": "chat.message",
	"id": "abc123",
	"data": {
		"room": "general",
		"text": "hello"
	}
}
```

তিনটা field, ভারী কাজটা করছে:

- **`type`** — message-এর ধরন। একটা namespace-style string (`chat.message`, `presence.join`, `error.unauthorized`)। দরকার হলে পরে message level-এ versioning।
- **`id`** — correlation-এর জন্য একটা request ID। UUID v4 বা একটা ছোট random string। fire-and-forget-এর জন্য optional; reply আশা করা যেকোনো message-এর জন্য required।
- **`data`** — payload। Schema `type`-এর উপর নির্ভর করে।

আপনি পরে `ts` (timestamp), `v` (version), বা `meta` যোগ করতে পারেন। কিন্তু এই তিনটাই minimum viable envelope।

## envelope আদৌ কেন

envelope ছাড়া, প্রতিটা message-কে তার identity তার data-র ভেতরে বহন করতে হয় — দেখার কোনো সামঞ্জস্যপূর্ণ জায়গা নেই। একজন receiver লেখে:

```js
// no envelope
if (msg.text && msg.room) handleChat(msg);
else if (msg.cursor) handlePresence(msg);
else if (msg.error) handleError(msg);
```

দুটো message type field শেয়ার না করা পর্যন্ত এটা কাজ করে। তারপর আপনি অনুমান করেন। তারপর একটা bug ship করেন।

একটা envelope সহ:

```js
switch (msg.type) {
	case 'chat.message':
		return handleChat(msg.data);
	case 'presence.cursor':
		return handlePresence(msg.data);
	case 'error':
		return handleError(msg.data);
}
```

প্রতিটা `type` একটা closed contract। আপনি পুরোনো code না ছুঁয়ে নতুন type যোগ করেন। parser না ভেঙে existing type-এ নতুন field যোগ করেন।

## JSON, msgpack, নাকি protobuf

তিনটা serialization পছন্দ।

**JSON** — text frame, human-readable, প্রতিটা ভাষায় একটা parser আছে। Scale-এ slow (কয়েকশো KB/s JSON serialization বাস্তব), binary-র চেয়ে wire-এ বড়, কোনো schema নেই। **যেকোনো app-এর জন্য default যেখানে message কম-ঘন আর ছোট** (chat, presence, dashboard)।

**MessagePack** — binary, JSON-এর চেয়ে ~30% ছোট, parse করতে ~2–3× দ্রুত। JSON-compatible type (`map`, `array`, `string`, `number`)। Schema-less। JSON bottleneck হলে সহজ upgrade।

**Protobuf** — binary, schema-mandatory, সবচেয়ে ছোট আর দ্রুত। gRPC-তে যে `.proto` file ব্যবহার করেছিলেন সেটাই। সঠিক যখন দুই প্রান্তই এমন service যা আগে থেকেই protobuf ব্যবহার করে, আর message volume codegen-এর আনুষ্ঠানিকতা ন্যায্য করে।

বেশিরভাগ team JSON ship করে। কয়েকজন serialization CPU-তে আঘাত করলে msgpack-এ migrate করে। App code-এ Protobuf-on-WebSocket বিরল (polyglot জিতগুলো gRPC-তে); এটা browser-extension protocol আর game traffic-এ দেখা যায়।

এই ট্র্যাকের জন্য: beginner চ্যাপ্টারে JSON, চ্যাপ্টার 9-এ দেখতে চাইলে msgpack-এ switch।

## Request আর response correlation

Plain HTTP আপনাকে বিনামূল্যে request/response দেয়। WebSockets দেয় না। একটা client যদি `{"type": "user.lookup", "data": {"id": 42}}` পাঠায় আর একটা reply আশা করে, server-এর reply-কে এমন কিছু বহন করতে হবে যা client মূল request-এর সাথে match করতে পারে।

প্যাটার্ন: **request একটা `id` অন্তর্ভুক্ত করে; reply সেটা echo করে।**

```json
// client → server
{ "type": "user.lookup", "id": "req-abc", "data": { "id": 42 } }

// server → client
{ "type": "user.lookup.reply", "id": "req-abc", "data": { "name": "Sumayya" } }
```

Client side-এ, pending request ID থেকে promise resolver-এর একটা map রাখুন:

```js
class WSClient {
	constructor(url) {
		this.ws = new WebSocket(url);
		this.pending = new Map();
		this.ws.onmessage = (e) => {
			const msg = JSON.parse(e.data);
			const resolver = this.pending.get(msg.id);
			if (resolver) {
				this.pending.delete(msg.id);
				resolver(msg.data);
			} else {
				this.dispatch(msg); // server-pushed event, no reply expected
			}
		};
	}

	request(type, data, timeoutMs = 5000) {
		const id = crypto.randomUUID();
		return new Promise((resolve, reject) => {
			const t = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error('timeout'));
			}, timeoutMs);
			this.pending.set(id, (res) => {
				clearTimeout(t);
				resolve(res);
			});
			this.ws.send(JSON.stringify({ type, id, data }));
		});
	}
}
```

এখন `await ws.request("user.lookup", { id: 42 })` একটা HTTP call-এর মতো লাগে। Server-pushed event (কোনো `id` নেই, বা অজানা `id`) একটা আলাদা dispatch function-এ বয়ে যায়।

## Server-pushed event vs request reply

server-এর দৃষ্টিকোণ থেকে দুই ধরনের inbound message:

1. **Client request-এর reply।** `id` echo করুন। স্পষ্টতার জন্য একটা `.reply` suffix বা একটা আলাদা `type` ব্যবহার করুন।
2. **Server-pushed event।** কোনো `id` নেই, বা একটা fresh server-generated `id`। client `type` দিয়ে route করে।

একটা পরিষ্কার নিয়ম: **একটা message-এর `id` যদি একটা client-এর outstanding request-এর সাথে match করে, এটা একটা reply; নাহলে এটা একটা event।**

সহজ সংস্করণ: আলাদা `type` namespace — reply-র জন্য `*.reply`, বাকি সব event। একটা নিয়ম বাছুন আর তাতে অটল থাকুন।

## Error

প্রতিটা protocol-এর একটা পরিষ্কার failure shape দরকার। দুটো যুক্তিসঙ্গত convention।

**1. একটা আলাদা message হিসেবে error:**

```json
{
	"type": "error",
	"id": "req-abc",
	"data": { "code": "NOT_FOUND", "message": "user 42 not found" }
}
```

`id` ব্যর্থ request-এর সাথে match করে। Client code:

```js
if (msg.type === 'error') {
	const reject = this.pendingRej.get(msg.id);
	reject(new Error(msg.data.message));
	return;
}
```

**2. reply envelope-এর ভেতরে error:**

```json
{ "type": "user.lookup.reply", "id": "req-abc", "data": null, "error": { "code": "NOT_FOUND" } }
```

দুটোই কাজ করে। প্রথমটা fan-out-এর জন্য পরিষ্কার (সব subscriber-এ error broadcast করা); দ্বিতীয়টা এক message type-এর মধ্যে success আর failure জোড়া বাঁধে। একটা বাছুন।

code-এর জন্য, gRPC-কে অনুসরণ করুন: `OK`, `NOT_FOUND`, `INVALID_ARGUMENT`, `PERMISSION_DENIED`, `UNAVAILABLE` ইত্যাদি। শব্দভাণ্ডার পুনরায় ব্যবহার করুন; নতুন string বানাবেন না। যখন "error code → action" protocol জুড়ে সামঞ্জস্যপূর্ণ থাকে তখন client লেখা অনেক সহজ হয়ে যায়।

## Versioning

version তিনটা জায়গায় থাকতে পারে। একটা বাছুন।

**1. URL.** `wss://api.example.com/ws/v2`। প্রতি version-এ আলাদা endpoint। পুরোনো code অপরিবর্তিত; নতুন code একটা নতুন path-এ। hard break-এর জন্য সবচেয়ে পরিষ্কার।

**2. Subprotocol.** handshake-এ negotiated (`Sec-WebSocket-Protocol: chat.v2`)। server একসাথে অনেকগুলো support করতে পারে। server যখন একটা binary অনেক version serve করে তখন URL-এর চেয়ে পরিষ্কার।

**3. Per-message.** envelope-এ একটা `v` field। সবচেয়ে flexible — আলাদা message type স্বাধীনভাবে evolve করতে পারে। সবচেয়ে error-prone — প্রতিটা parser-কে version check করতে হয়।

একটা fresh project-এর জন্য, **URL versioning** সবচেয়ে সহজ। breaking change করলে version bump করুন। অনেক message type আর ধীর client rollout সহ পরিপক্ব system-এর জন্য, per-message version control আপনাকে সূক্ষ্মতর migration path দেয়।

<Callout type="info">

**আপনার version 2 শুধু তখনই লাগবে যদি আপনার একটা বাস্তব breaking change থাকে।** একটা নতুন message type যোগ করা breaking নয়। `data`-তে একটা নতুন field যোগ করা breaking নয় (client অজানা জিনিস উপেক্ষা করে)। field rename বা remove করা, type বদলানো, বা ভিন্ন semantics সহ একটা `type` name পুনরায় ব্যবহার করা — সেগুলো breaking। বন্য পরিবেশে বেশিরভাগ "v2" rollout অপ্রয়োজনীয় ছিল।

</Callout>

## Schema validation

JSON আপনাকে কোনো schema দেয় না। server-কে প্রতিটা inbound message validate করতে হয়।

```go
type ChatMessage struct {
    Room string `json:"room"`
    Text string `json:"text"`
}

type Envelope struct {
    Type string          `json:"type"`
    ID   string          `json:"id,omitempty"`
    Data json.RawMessage `json:"data"`
}

func handle(env Envelope, conn *websocket.Conn) {
    switch env.Type {
    case "chat.message":
        var msg ChatMessage
        if err := json.Unmarshal(env.Data, &msg); err != nil {
            send(conn, errReply(env.ID, "INVALID_ARGUMENT", err.Error()))
            return
        }
        if len(msg.Text) == 0 || len(msg.Text) > 5000 {
            send(conn, errReply(env.ID, "INVALID_ARGUMENT", "text length"))
            return
        }
        ...
    }
}
```

আরও বিস্তৃত validation-এর জন্য, একটা library ব্যবহার করুন — Go-র জন্য `go-playground/validator`, TypeScript client/server-এর জন্য Zod। নীতিটা হলো **প্রতিটা untrusted message একটা strict schema-র বিরুদ্ধে parse হয়**। কোনো "শুধু JSON পড়ে field ব্যবহার করা" নয় — ওভাবেই SQL injection আর অদ্ভুত-shape bug লুকিয়ে ঢোকে।

## Streaming response

কখনো একটা request শুধু একটা নয়, reply-র একটা stream ট্রিগার করে। প্যাটার্ন: request `id` stream-এর প্রতিটা reply-র সাথে match করে, আর একটা final `complete` message এটা শেষ করে।

```json
// request
{ "type": "log.tail", "id": "req-abc", "data": { "service": "api" } }

// stream of replies
{ "type": "log.tail.reply", "id": "req-abc", "data": { "line": "hello" } }
{ "type": "log.tail.reply", "id": "req-abc", "data": { "line": "world" } }
...
{ "type": "log.tail.complete", "id": "req-abc" }
```

Client side-এ, একটা multi-callback API expose করুন:

```js
ws.stream(
	'log.tail',
	{ service: 'api' },
	{
		onMessage: (line) => console.log(line),
		onComplete: () => console.log('done'),
		onError: (e) => console.error(e)
	}
);
```

এটা plain WebSockets-এর উপর gRPC-র server-streaming পুনর্নির্মাণ করে। gRPC চালাতে না চাইলে কাজে লাগে।

## Cancellation

একটা client যদি একটা in-flight request (বিশেষত একটা streaming-টা) cancel করতে চায়, একই `id` সহ একটা cancel envelope পাঠান:

```json
{ "type": "cancel", "data": { "id": "req-abc" } }
```

Server side-এ, request ID দিয়ে keyed একটা open stream। cancel-এ, stream বন্ধ করুন। gRPC-র `stream.Context().Done()`-এর মতোই একই প্যাটার্ন কিন্তু application layer-এ।

এটা long-lived stream-এর জন্য অপরিহার্য — এটা ছাড়া, একটা বন্ধ UI server-এ stream-টা চিরকাল চালিয়ে রাখে।

## message type ডিজাইন — naming

যে convention scale করে:

- **Dot-namespaced.** `chat.message`, `chat.delete`, `presence.join`, `auth.login`। খুঁজে পাওয়া সহজ; ভবিষ্যতের namespace সংঘর্ষ করে না।
- **শেষে verb।** `*.create`, `*.update`, `*.delete`, `*.subscribe`। REST CRUD শব্দভাণ্ডারকে অনুসরণ করে।
- **Reply-এ `.reply` suffix।** বা একটা আলাদা naming convention ব্যবহার করুন কিন্তু সামঞ্জস্যপূর্ণ থাকুন।
- **Server-pushed event past tense।** `chat.posted`, `presence.joined`। request type থেকে আলাদা করে।

এড়িয়ে চলুন:

- `data` বা `event`-এর মতো generic type। switch করার জন্য অকেজো।
- type name-এ versioned (`chat.message.v2`)। versioning-এর জন্য envelope বা URL ব্যবহার করুন।
- Hyphen-separated আর dot-separated মিশ্রিত (`chat-message` আর `chat.delete`)। একটা বাছুন।

একটা ভালো naming convention হলো একটা 50-লাইন dispatcher আর একটা 5-লাইন-এর মধ্যে পার্থক্য।

## Compression

`permessage-deflate` (চ্যাপ্টার 2) message payload compress করে। JSON traffic-এর জন্য, এটা wire byte ~50% কাটে। Library-level setting:

```go
c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
    OriginPatterns:    []string{"*"},
    CompressionMode:   websocket.CompressionContextTakeover,
})
```

খরচ: ~10–20% বেশি CPU, plus প্রতি connection-এ একটা memory খরচ (একটা deflate window)। বেশিরভাগ ছোট message-এর জন্য, সাশ্রয় খরচকে ছাড়িয়ে যায়। আগে থেকেই compressed binary blob-এর (image, video) জন্য, off করুন।

## Recap

- সবসময় message-কে একটা envelope-এ wrap করুন: `type`, `id`, `data`। হয়তো `error`, `v`, `ts` যোগ করুন।
- JSON হলো default; JSON parsing bottleneck হলে msgpack; দুই প্রান্তই আগে থেকে protobuf ব্যবহারকারী service হলে protobuf।
- `id`-র মাধ্যমে request/reply correlation। client একটা pending-resolver map রাখে।
- Error `type=error` envelope হিসেবে বা একটা `error` field হিসেবে — একটা সামঞ্জস্যপূর্ণভাবে বাছুন।
- Versioning: URL > subprotocol > per-message। বেশিরভাগ project কখনো শুধু v1-ই দরকার হয়।
- প্রতিটা inbound message একটা schema-র বিরুদ্ধে validate করুন। কোনো "শুধু shape-এ বিশ্বাস করা" নয়।
- Streaming response: reply জুড়ে একই `id`, একটা terminator message।
- `{"type":"cancel","data":{"id":...}}`-এর মাধ্যমে cancel — long stream-এর জন্য অপরিহার্য।
- Naming: dot-namespaced, verb-final, reply-এ suffix। নিজের 1000 dispatcher লাইন বাঁচান।
- `permessage-deflate` JSON-এর জন্য bandwidth অর্ধেক করে; CPU/memory খরচ ম্যানেজেবল।

পরবর্তী: [Server-Sent Events](/notes/websockets/05-sse) — যখন one-way যথেষ্ট, অর্ধেক protocol দ্বিগুণ সরলতায়।
