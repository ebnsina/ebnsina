---
title: "Pub/sub at scale"
subtitle: "One process can hold thousands of connections; production needs many. The piece that makes that work is a pub/sub bus that fans events from any process to every connection on every other process."
chapter: 6
level: "intermediate"
readingTime: "12 min"
topics: ["websockets", "pubsub", "redis", "nats", "scaling"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

The chat server in chapter 3 broadcasts to clients connected to one process. That works until you spin up two. Connections to process A do not see messages broadcast on process B. The fix is a shared **pub/sub bus** — every process publishes to it, every process subscribes from it, the bus fans out.

This chapter wires Redis pub/sub into the chapter-3 server, then discusses NATS as the alternative when Redis runs out of headroom. Same patterns work for SSE — the broker is protocol-agnostic.

<Callout type="info">

**Real-World Analogy**

A pub/sub bus is like a radio tower broadcasting to many receivers — one transmitter sends the signal, unlimited listeners receive it, and no direct connection between them is required.

</Callout>

## The architecture

```
   Browser A ─── ws ──→ Process 1 ─┐
   Browser B ─── ws ──→ Process 1 ─┤
                                   ├──→ Redis pub/sub channel "room:general"
   Browser C ─── ws ──→ Process 2 ─┤
   Browser D ─── ws ──→ Process 3 ─┘
```

Browser A sends a message. Process 1 receives it on the WebSocket, publishes to `room:general` on Redis. All three processes are subscribed to `room:general` — they each receive the message and write it to every browser connected to them. Browsers A through D all see the message.

Two qualities of this setup:

1. **Horizontally scalable.** Add a fourth process; it subscribes to channels on Redis and starts serving connections immediately.
2. **Stateless processes.** Any process can take any client. Connection state (which client is in which room) lives in the process; the bus carries the events.

## Why Redis pub/sub

Redis pub/sub is:

- **Free** (open-source, easy to self-host).
- **Fast** — sub-millisecond fanout on a single Redis instance.
- **Simple** — one binary, no configuration, no clustering required for small deployments.
- **Universally supported** — every language has a Redis client.

The trade-off: **fire-and-forget**. Subscribers that are offline when a message is published do not get it. No replay, no buffering, no acknowledgements. For ephemeral events (chat messages, presence updates, live cursors), this is the right model. For durable events (orders, audit logs), use a queue (chapter on **Background jobs** or **Messaging & queues** later in the path).

## Wiring Redis into the chat server

Install Redis (`apt install redis` or `brew install redis`), start it (`redis-server`), confirm with `redis-cli ping` → `PONG`.

```bash
go get github.com/redis/go-redis/v9
```

Refactored server (cuts to the new parts):

```go
package main

import (
    "context"
    "encoding/json"
    "log"
    "net/http"
    "sync"
    "time"

    "github.com/coder/websocket"
    "github.com/redis/go-redis/v9"
)

type Hub struct {
    rdb     *redis.Client
    mu      sync.Mutex
    rooms   map[string]map[*Client]struct{}
}

type Client struct {
    conn *websocket.Conn
    out  chan []byte
    room string
}

func NewHub(rdb *redis.Client) *Hub {
    h := &Hub{rdb: rdb, rooms: map[string]map[*Client]struct{}{}}
    go h.subscribeLoop(context.Background())
    return h
}

// subscribeLoop reads from Redis and fans out to local clients.
func (h *Hub) subscribeLoop(ctx context.Context) {
    sub := h.rdb.PSubscribe(ctx, "room:*")
    defer sub.Close()

    for msg := range sub.Channel() {
        room := msg.Channel[len("room:"):]
        h.mu.Lock()
        for c := range h.rooms[room] {
            select {
            case c.out <- []byte(msg.Payload):
            default: // drop slow client
            }
        }
        h.mu.Unlock()
    }
}

func (h *Hub) join(c *Client, room string) {
    h.mu.Lock()
    if _, ok := h.rooms[room]; !ok {
        h.rooms[room] = map[*Client]struct{}{}
    }
    h.rooms[room][c] = struct{}{}
    c.room = room
    h.mu.Unlock()
}

func (h *Hub) leave(c *Client) {
    h.mu.Lock()
    if c.room != "" {
        delete(h.rooms[c.room], c)
        if len(h.rooms[c.room]) == 0 {
            delete(h.rooms, c.room)
        }
    }
    h.mu.Unlock()
    close(c.out)
}

func (h *Hub) publish(ctx context.Context, room string, data []byte) error {
    return h.rdb.Publish(ctx, "room:"+room, data).Err()
}

func (h *Hub) handle(w http.ResponseWriter, r *http.Request) {
    conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
        OriginPatterns: []string{"localhost:*"},
    })
    if err != nil {
        return
    }
    defer conn.CloseNow()

    client := &Client{conn: conn, out: make(chan []byte, 64)}
    defer h.leave(client)

    ctx, cancel := context.WithCancel(r.Context())
    defer cancel()

    // writer goroutine
    go func() {
        for msg := range client.out {
            wctx, wcancel := context.WithTimeout(ctx, 5*time.Second)
            err := conn.Write(wctx, websocket.MessageText, msg)
            wcancel()
            if err != nil {
                cancel()
                return
            }
        }
    }()

    // reader: parse envelope, route by type
    for {
        _, data, err := conn.Read(ctx)
        if err != nil {
            return
        }

        var env struct {
            Type string          `json:"type"`
            Data json.RawMessage `json:"data"`
        }
        if err := json.Unmarshal(data, &env); err != nil {
            continue
        }

        switch env.Type {
        case "join":
            var req struct{ Room string }
            json.Unmarshal(env.Data, &req)
            h.join(client, req.Room)

        case "chat.message":
            if client.room == "" {
                continue
            }
            h.publish(ctx, client.room, data)
        }
    }
}

func main() {
    rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:6379"})
    hub := NewHub(rdb)

    http.HandleFunc("/ws", hub.handle)
    http.Handle("/", http.FileServer(http.Dir("static")))

    log.Println("chat on http://localhost:8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

The shape:

- **`subscribeLoop`** is a single goroutine per process, reading from Redis and dispatching to local connections.
- **`PSubscribe("room:*")`** uses pattern subscription so one Redis subscription handles all rooms. Alternative: subscribe per-room as clients join, unsubscribe as they leave. The pattern subscription is simpler if you do not have thousands of distinct rooms.
- **`publish`** writes to Redis from the WebSocket reader. It returns immediately; fan-out is async.
- **`rooms`** map per-process tracks which local clients are in each room. The Redis bus does not know about clients.

Run two copies on different ports (`PORT=8080 go run .` and `PORT=8081 go run .`). Connect a browser to each. Send from one — both see it. Horizontal scale, achieved.

## Backpressure across the bus

Redis pub/sub is fast but not magic. If publishers vastly outpace consumers, the consumer's TCP buffer fills, Redis disconnects the consumer, and you lose messages.

Things to consider:

- **Consumer side latency matters.** A subscribe loop that does heavy work per message creates lag. Keep `subscribeLoop` thin — just dispatch to per-client channels.
- **Per-client channel size.** The chapter's `out` chan is `make(chan []byte, 64)`. For high-throughput rooms, raise it. But buffers cost memory per connection times every connection — tens of thousands of clients × 64 messages × 1 KiB is gigabytes. Pick a number that bounds memory.
- **Drop policy.** The `select { ... default: drop }` pattern from chapter 3. With many connections, dropping is the right move.

For mission-critical "must-deliver" messages, pub/sub is the wrong primitive. Use a queue with acknowledgements (Redis Streams, NATS JetStream, RabbitMQ, Kafka). Chapter from **Messaging & queues** later in the path is the right place for that.

## Channel design

Three patterns for naming Redis channels.

**1. Per-room.** `room:general`, `room:engineering`. Pattern subscribe `room:*`. Simple. Right when rooms are the only fan-out unit.

**2. Per-user.** `user:42`. For DMs and per-user notifications. Channel cardinality scales with users — fine, Redis handles millions.

**3. Per-event-type.** `event:order.created`, `event:user.joined`. For broadcast events, all connections care about all events of a type. Lower cardinality, simpler subscription.

Many apps mix all three. A user opens a connection; the process subscribes to `user:42` (DMs), `room:general` (currently active room), and a global `notifications` channel. As the user navigates between rooms, the subscriptions change.

## NATS — when Redis is the bottleneck

Redis pub/sub on a single instance handles ~1M messages/second on commodity hardware. Beyond that, scale paths are limited (Redis cluster pub/sub is awkward).

**NATS** is a different broker built specifically for high-throughput messaging. Drop-in for the pub/sub use case, with three additional capabilities:

- **Subjects with wildcards.** `room.*.message` matches `room.general.message`, `room.engineering.message`. Cleaner than Redis patterns.
- **Queue groups.** `room.general` with queue group `workers` distributes messages across workers (each message goes to one worker). Useful when you want one of many backend workers to process an event.
- **JetStream.** A persistent log layer for at-least-once delivery — replaces Redis pub/sub + a queue with one system.

NATS in Go:

```go
nc, _ := nats.Connect("nats://localhost:4222")
sub, _ := nc.Subscribe("room.*", func(m *nats.Msg) {
    handleMessage(m.Subject, m.Data)
})
nc.Publish("room.general", payload)
```

Same shape, different broker. For most apps, Redis is enough. NATS becomes the right call when you have:

- More than ~100K messages/second sustained.
- A need for message persistence and replay (JetStream).
- Many services where the pub/sub bus is a primary architecture component.

<Callout type="info">

**Don't switch brokers prematurely.** The right time to move from Redis pub/sub to NATS or Kafka is when you have measurements showing the bottleneck. Migrating brokers is real work; doing it before you need to is wasted effort.

</Callout>

## Sticky sessions — why you might not need them

A common myth: WebSocket clients need sticky sessions (the load balancer routes a client to the same process on reconnect). With pub/sub fan-out, you do not.

A client reconnects, lands on any process, subscribes to its rooms, starts receiving fan-out from the bus. The previous process forgot about it; the new process treats it as fresh. Connection state is local; routing is global.

Sticky sessions become necessary if you cache per-client state in process memory (recent messages, derived views) and need that state to survive the same client's reconnects. Avoid that pattern; put per-client state in Redis or Postgres so any process can serve any client.

## Replay on reconnect

What about messages sent while a client was disconnected? Pub/sub does not have them.

For ephemeral data (live chat), most apps accept the gap — clients see messages from the moment they reconnect. Chat history comes from a database query the client makes separately on connect.

For at-least-once semantics (notifications you must not miss):

1. Persist events to Postgres (or Redis Streams, or any append-only store) as well as publishing.
2. On client connect, query the persistent store for events since the client's last seen ID.
3. Continue with live pub/sub from there.

Same pattern as SSE's `Last-Event-ID`. Build it once, reuse it. Chapter 9 covers reconnection in more detail.

## Operating Redis

Three things to do:

1. **Pin a version, run as systemd.** `apt install redis-server` and let systemd manage it. Restart on failure.
2. **Enable AOF persistence** if any state matters (it doesn't for pub/sub, but if you also use Redis for caching, presence, or rate limiting, yes).
3. **Monitor with `redis-cli info`** — connected clients, keyspace stats, memory. Hook into Prometheus via `redis_exporter`.

For pub/sub specifically, `redis-cli monitor` shows the live message stream — invaluable for debugging "is my publisher actually firing."

## Testing pub/sub locally

The cheapest test is `redis-cli`:

```bash
redis-cli subscribe room:general
# ... in another shell ...
redis-cli publish room:general 'hi'
```

Confirms the bus is healthy without any of your code involved. If your service publishes but `redis-cli subscribe` sees nothing, your service is misconfigured. If `redis-cli` works but your service does not see messages, your subscriber loop is wrong.

## Recap

- One process can hold many connections; many processes need a shared pub/sub bus.
- Redis pub/sub: simple, fast, fire-and-forget. Right for ephemeral events.
- One subscribe goroutine per process, fanning out to per-client channels with a drop policy.
- Channel design: per-room, per-user, per-event-type. Mix them.
- NATS for higher throughput, queue groups, or JetStream's persistent log.
- Sticky sessions usually unnecessary if all per-client state is local or in Redis.
- Replay on reconnect: not built in. Use a persistent store + last-seen-ID.
- Operate Redis with systemd, AOF (if other features need it), Prometheus exporter.
- Test fan-out with `redis-cli` before blaming your code.

Next: [Presence and rooms](/notes/websockets/07-presence-rooms) — tracking who is online, joining and leaving channels, and the operational patterns that work.

