---
title: "Message protocols on top"
subtitle: "Raw frames carry bytes. Real apps need types, versions, and request/response correlation. Designing the message envelope before you have ten clients in the wild saves you years of pain."
chapter: 4
level: "beginner"
readingTime: "12 min"
topics: ["websockets", "json", "protocol", "versioning", "envelope"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

WebSockets give you a pipe. Two endpoints, frames going both ways, no built-in concept of "what kind of message is this" or "is this a reply to that one." You need to design that yourself.

This is the place where greenfield projects make decisions they regret for years. Spend an afternoon now and you save a yearlong migration later.

<Callout type="info">

**Real-World Analogy**

Designing a message protocol is like agreeing on a common language before a conversation — without it, both sides are talking but neither understands what the other means.

</Callout>

## The envelope

The first decision: every message is wrapped in an envelope that carries `type`, `id`, and the payload.

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

Three fields, doing the heavy lifting:

- **`type`** — the message kind. A namespace-style string (`chat.message`, `presence.join`, `error.unauthorized`). Versioning at the message level later if needed.
- **`id`** — a request ID for correlation. UUID v4 or short random string. Optional for fire-and-forget; required for any message expecting a reply.
- **`data`** — the payload. Schema depends on `type`.

You may add `ts` (timestamp), `v` (version), or `meta` later. But these three are the minimum viable envelope.

## Why an envelope at all

Without an envelope, each message has to carry its identity inside its data — no consistent place to look. A receiver writes:

```js
// no envelope
if (msg.text && msg.room) handleChat(msg);
else if (msg.cursor) handlePresence(msg);
else if (msg.error) handleError(msg);
```

It works until two message types share fields. Then you guess. Then you ship a bug.

With an envelope:

```js
switch (msg.type) {
  case "chat.message": return handleChat(msg.data);
  case "presence.cursor": return handlePresence(msg.data);
  case "error":  return handleError(msg.data);
}
```

Each `type` is a closed contract. You add new types without touching old code. You add new fields to existing types without breaking parsers.

## JSON, msgpack, or protobuf

Three serialization choices.

**JSON** — text frames, human-readable, every language has a parser. Slow at scale (a few hundred KB/s of JSON serialization is real), bigger on the wire than binary, no schema. **Default for any app where messages are infrequent and small** (chat, presence, dashboards).

**MessagePack** — binary, ~30% smaller than JSON, ~2–3× faster to parse. JSON-compatible types (`map`, `array`, `string`, `number`). Schema-less. Easy upgrade when JSON becomes the bottleneck.

**Protobuf** — binary, schema-mandatory, smallest and fastest. Same `.proto` files you used in gRPC. Right when both ends are services that already use protobuf, and the message volume justifies the codegen ceremony.

Most teams ship JSON. A few migrate to msgpack when they hit serialization CPU. Protobuf-on-WebSocket is rare in app code (the polyglot wins are in gRPC); it does appear in browser-extension protocols and game traffic.

For this track: JSON in beginner chapters, switch to msgpack in chapter 9 if you want to see it.

## Request and response correlation

Plain HTTP gives you request/response for free. WebSockets do not. If a client sends `{"type": "user.lookup", "data": {"id": 42}}` and expects a reply, the server's reply has to carry something the client can match to the original request.

Pattern: **request includes an `id`; reply echoes it.**

```json
// client → server
{ "type": "user.lookup", "id": "req-abc", "data": { "id": 42 } }

// server → client
{ "type": "user.lookup.reply", "id": "req-abc", "data": { "name": "Aoife" } }
```

Client side, keep a map of pending request IDs to promise resolvers:

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
        reject(new Error("timeout"));
      }, timeoutMs);
      this.pending.set(id, (res) => { clearTimeout(t); resolve(res); });
      this.ws.send(JSON.stringify({ type, id, data }));
    });
  }
}
```

Now `await ws.request("user.lookup", { id: 42 })` feels like an HTTP call. Server-pushed events (no `id`, or unknown `id`) flow into a separate dispatch function.

## Server-pushed events vs request replies

Two kinds of inbound messages from the server's perspective:

1. **Replies to client requests.** Echo the `id`. Use a `.reply` suffix or a different `type` for clarity.
2. **Server-pushed events.** No `id`, or a fresh server-generated `id`. The client routes by `type`.

A clean rule: **if a message has an `id` matching a client's outstanding request, it is a reply; otherwise it is an event.**

The simpler version: separate `type` namespaces — `*.reply` for replies, everything else is event. Pick one rule and stick to it.

## Errors

Every protocol needs a clear failure shape. Two reasonable conventions.

**1. Error as a separate message:**

```json
{ "type": "error", "id": "req-abc", "data": { "code": "NOT_FOUND", "message": "user 42 not found" } }
```

The `id` matches the failed request. Client code:

```js
if (msg.type === "error") {
  const reject = this.pendingRej.get(msg.id);
  reject(new Error(msg.data.message));
  return;
}
```

**2. Error inside the reply envelope:**

```json
{ "type": "user.lookup.reply", "id": "req-abc", "data": null, "error": { "code": "NOT_FOUND" } }
```

Either works. The first is cleaner for fan-out (broadcast errors to all subscribers); the second pairs success and failure within one message type. Pick one.

For codes, mirror gRPC: `OK`, `NOT_FOUND`, `INVALID_ARGUMENT`, `PERMISSION_DENIED`, `UNAVAILABLE`, etc. Reuse the vocabulary; don't invent new strings. Clients become much easier to write when "error code → action" is consistent across protocols.

## Versioning

Three places version can live. Pick one.

**1. URL.** `wss://api.example.com/ws/v2`. Different endpoint per version. Old code unchanged; new code at a new path. Cleanest for hard breaks.

**2. Subprotocol.** Negotiated at handshake (`Sec-WebSocket-Protocol: chat.v2`). Server can support many simultaneously. Cleaner than URL when the server is one binary serving many versions.

**3. Per-message.** A `v` field in the envelope. Most flexible — different message types can evolve independently. Most error-prone — every parser must check the version.

For a fresh project, **URL versioning** is the simplest. Bump the version when you make breaking changes. For mature systems with many message types and slow client rollouts, per-message version control gives you finer migration paths.

<Callout type="info">

**You will only need version 2 if you have a real breaking change.** Adding a new message type is not breaking. Adding a new field to `data` is not breaking (clients ignore unknowns). Renaming or removing fields, changing types, or reusing a `type` name with different semantics — those are breaking. Most "v2" rollouts in the wild were unnecessary.

</Callout>

## Schema validation

JSON gives you no schema. The server has to validate every inbound message.

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

For more elaborate validation, use a library — `go-playground/validator` for Go, Zod for TypeScript clients/servers. The principle is that **every untrusted message gets parsed against a strict schema**. No "just read the JSON and use the fields" — that is how SQL injections and weird-shape bugs sneak in.

## Streaming responses

Sometimes a request triggers a stream of replies, not just one. The pattern: the request `id` matches every reply in the stream, and a final `complete` message ends it.

```json
// request
{ "type": "log.tail", "id": "req-abc", "data": { "service": "api" } }

// stream of replies
{ "type": "log.tail.reply", "id": "req-abc", "data": { "line": "hello" } }
{ "type": "log.tail.reply", "id": "req-abc", "data": { "line": "world" } }
...
{ "type": "log.tail.complete", "id": "req-abc" }
```

Client side, expose a multi-callback API:

```js
ws.stream("log.tail", { service: "api" }, {
  onMessage: (line) => console.log(line),
  onComplete: () => console.log("done"),
  onError: (e) => console.error(e),
});
```

This rebuilds gRPC's server-streaming on top of plain WebSockets. Useful when you do not want to run gRPC.

## Cancellation

If a client wants to cancel an in-flight request (especially a streaming one), send a cancel envelope with the same `id`:

```json
{ "type": "cancel", "data": { "id": "req-abc" } }
```

Server side, an open stream keyed by request ID. On cancel, close the stream. Same pattern as gRPC's `stream.Context().Done()` but at the application layer.

This is essential for long-lived streams — without it, a closed UI keeps the stream running on the server forever.

## Designing message types — naming

Conventions that scale:

- **Dot-namespaced.** `chat.message`, `chat.delete`, `presence.join`, `auth.login`. Easy to search; future namespaces don't collide.
- **Verb at the end.** `*.create`, `*.update`, `*.delete`, `*.subscribe`. Mirrors REST CRUD vocabulary.
- **Replies suffixed `.reply`.** Or use a different naming convention but be consistent.
- **Server-pushed events past tense.** `chat.posted`, `presence.joined`. Distinguishes from request types.

Avoid:

- Generic types like `data` or `event`. Useless to switch on.
- Versioned in the type name (`chat.message.v2`). Use envelope or URL for versioning instead.
- Hyphen-separated and dot-separated mixed (`chat-message` and `chat.delete`). Pick one.

A good naming convention is the difference between a 50-line dispatcher and a 5-line one.

## Compression

`permessage-deflate` (chapter 2) compresses message payloads. For JSON traffic, it cuts wire bytes by ~50%. Library-level setting:

```go
c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
    OriginPatterns:    []string{"*"},
    CompressionMode:   websocket.CompressionContextTakeover,
})
```

The cost: ~10–20% more CPU, plus a memory cost per connection (a deflate window). For mostly small messages, the savings outweigh the cost. For binary blobs that are already compressed (images, video), turn it off.

## Recap

- Always wrap messages in an envelope: `type`, `id`, `data`. Maybe add `error`, `v`, `ts`.
- JSON is the default; msgpack when JSON parsing is the bottleneck; protobuf when both ends are services already using it.
- Request/reply correlation via `id`. Client keeps a pending-resolver map.
- Errors as a `type=error` envelope or an `error` field — pick one consistently.
- Versioning: URL > subprotocol > per-message. Most projects only ever need v1.
- Validate every inbound message against a schema. No "just trust the shape."
- Streaming responses: same `id` across replies, terminator message.
- Cancel via `{"type":"cancel","data":{"id":...}}` — essential for long streams.
- Naming: dot-namespaced, verb-final, replies suffixed. Save yourself 1000 dispatcher lines.
- `permessage-deflate` halves bandwidth for JSON; CPU/memory cost is manageable.

Next: [Server-Sent Events](/notes/websockets/05-sse) — when one-way is enough, half the protocol with twice the simplicity.

