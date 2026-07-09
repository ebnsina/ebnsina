---
title: 'Pub/sub at scale'
subtitle: 'একটা process হাজার হাজার connection ধরে রাখতে পারে; production-এ অনেকগুলো দরকার। যে অংশটা সেটা কাজ করায় তা হলো একটা pub/sub bus যা যেকোনো process থেকে অন্য প্রতিটা process-এর প্রতিটা connection-এ event fan করে।'
chapter: 6
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['websockets', 'pubsub', 'redis', 'nats', 'scaling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

চ্যাপ্টার 3-এর chat server একটা process-এ connected client-দের broadcast করে। দুটো spin up না করা পর্যন্ত সেটা কাজ করে। process A-র connection process B-তে broadcast করা message দেখে না। ঠিক করার উপায় হলো একটা shared **pub/sub bus** — প্রতিটা process এতে publish করে, প্রতিটা process এটা থেকে subscribe করে, bus fan out করে।

এই চ্যাপ্টার চ্যাপ্টার-3 server-এ Redis pub/sub wire করে, তারপর Redis-এর জায়গা ফুরিয়ে গেলে বিকল্প হিসেবে NATS নিয়ে আলোচনা করে। একই প্যাটার্ন SSE-তে কাজ করে — broker protocol-agnostic।

<Callout type="info">

**বাস্তব উদাহরণ**

একটা pub/sub bus হলো অনেক receiver-এ broadcast করা একটা রেডিও টাওয়ারের মতো — একটা transmitter signal পাঠায়, অসীম শ্রোতা receive করে, আর তাদের মধ্যে কোনো সরাসরি connection দরকার নেই।

</Callout>

## architecture

```
   Browser A ─── ws ──→ Process 1 ─┐
   Browser B ─── ws ──→ Process 1 ─┤
                                   ├──→ Redis pub/sub channel "room:general"
   Browser C ─── ws ──→ Process 2 ─┤
   Browser D ─── ws ──→ Process 3 ─┘
```

Browser A একটা message পাঠায়। Process 1 এটা WebSocket-এ receive করে, Redis-এ `room:general`-এ publish করে। তিনটা process-ই `room:general`-এ subscribed — তারা প্রত্যেকে message receive করে আর তাদের সাথে connected প্রতিটা browser-এ লেখে। Browser A থেকে D সবাই message দেখে।

এই setup-এর দুটো গুণ:

1. **Horizontally scalable.** একটা চতুর্থ process যোগ করুন; এটা Redis-এ channel subscribe করে আর সাথে সাথে connection serve করা শুরু করে।
2. **Stateless process.** যেকোনো process যেকোনো client নিতে পারে। Connection state (কোন client কোন room-এ) process-এ থাকে; bus event বহন করে।

## Redis pub/sub কেন

Redis pub/sub:

- **Free** (open-source, self-host করা সহজ)।
- **Fast** — একটা single Redis instance-এ sub-millisecond fanout।
- **Simple** — একটা binary, কোনো configuration নেই, ছোট deployment-এর জন্য clustering লাগে না।
- **Universally supported** — প্রতিটা ভাষায় একটা Redis client আছে।

trade-off: **fire-and-forget**। message publish হওয়ার সময় যে subscriber offline ছিল তারা এটা পায় না। কোনো replay নেই, কোনো buffering নেই, কোনো acknowledgement নেই। ephemeral event-এর (chat message, presence update, live cursor) জন্য, এটাই সঠিক model। durable event-এর (order, audit log) জন্য, একটা queue ব্যবহার করুন (path-এ পরে **Background jobs** বা **Messaging & queues** চ্যাপ্টার)।

## chat server-এ Redis wire করা

Redis install করুন (`apt install redis` বা `brew install redis`), শুরু করুন (`redis-server`), `redis-cli ping` → `PONG` দিয়ে নিশ্চিত করুন।

```bash
go get github.com/redis/go-redis/v9
```

Refactored server (নতুন অংশে কাটা):

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

shape:

- **`subscribeLoop`** হলো প্রতি process-এ একটা single goroutine, Redis থেকে পড়ে আর local connection-এ dispatch করে।
- **`PSubscribe("room:*")`** pattern subscription ব্যবহার করে যাতে একটা Redis subscription সব room সামলায়। বিকল্প: client join করার সাথে সাথে per-room subscribe, তারা leave করার সাথে সাথে unsubscribe। হাজার হাজার আলাদা room না থাকলে pattern subscription সহজতর।
- **`publish`** WebSocket reader থেকে Redis-এ লেখে। এটা সাথে সাথে return করে; fan-out async।
- **`rooms`** map per-process track করে কোন local client কোন room-এ। Redis bus client সম্পর্কে জানে না।

আলাদা port-এ দুটো copy চালান (`PORT=8080 go run .` আর `PORT=8081 go run .`)। প্রতিটায় একটা করে browser connect করুন। একটা থেকে পাঠান — দুটোই দেখে। Horizontal scale, অর্জিত।

## bus জুড়ে backpressure

Redis pub/sub fast কিন্তু জাদু নয়। publisher যদি consumer-কে বিপুলভাবে ছাড়িয়ে যায়, consumer-এর TCP buffer ভরে যায়, Redis consumer-কে disconnect করে, আর আপনি message হারান।

বিবেচনার বিষয়:

- **Consumer side latency গুরুত্বপূর্ণ।** একটা subscribe loop যা প্রতি message-এ ভারী কাজ করে সেটা lag তৈরি করে। `subscribeLoop` পাতলা রাখুন — শুধু per-client channel-এ dispatch করুন।
- **Per-client channel size.** চ্যাপ্টারের `out` chan হলো `make(chan []byte, 64)`। high-throughput room-এর জন্য, এটা বাড়ান। কিন্তু buffer প্রতি connection গুণ প্রতিটা connection memory খরচ করে — হাজার হাজার client × 64 message × 1 KiB হলো গিগাবাইট। এমন একটা সংখ্যা বাছুন যা memory bound করে।
- **Drop policy.** চ্যাপ্টার 3-এর `select { ... default: drop }` প্যাটার্ন। অনেক connection-এ, dropping-ই সঠিক পদক্ষেপ।

mission-critical "must-deliver" message-এর জন্য, pub/sub ভুল primitive। acknowledgement সহ একটা queue ব্যবহার করুন (Redis Streams, NATS JetStream, RabbitMQ, Kafka)। path-এ পরে **Messaging & queues** চ্যাপ্টার তার সঠিক জায়গা।

## Channel design

Redis channel naming-এর তিনটা প্যাটার্ন।

**1. Per-room.** `room:general`, `room:engineering`। Pattern subscribe `room:*`। সহজ। room-ই একমাত্র fan-out unit হলে সঠিক।

**2. Per-user.** `user:42`। DM আর per-user notification-এর জন্য। Channel cardinality user-এর সাথে scale করে — ঠিক আছে, Redis লক্ষ লক্ষ সামলায়।

**3. Per-event-type.** `event:order.created`, `event:user.joined`। broadcast event-এর জন্য, সব connection একটা type-এর সব event নিয়ে চিন্তিত। কম cardinality, সহজতর subscription।

অনেক app তিনটাই মেশায়। একটা user একটা connection খোলে; process `user:42` (DM), `room:general` (বর্তমানে active room), আর একটা global `notifications` channel subscribe করে। user room-এর মধ্যে navigate করার সাথে সাথে, subscription বদলায়।

## NATS — যখন Redis bottleneck

একটা single instance-এ Redis pub/sub commodity hardware-এ ~1M message/second সামলায়। এর বাইরে, scale path সীমিত (Redis cluster pub/sub আনাড়ি)।

**NATS** হলো একটা আলাদা broker যা বিশেষভাবে high-throughput messaging-এর জন্য বানানো। pub/sub use case-এর জন্য drop-in, তিনটা অতিরিক্ত capability সহ:

- **Wildcard সহ subject।** `room.*.message` `room.general.message`, `room.engineering.message`-এর সাথে match করে। Redis pattern-এর চেয়ে পরিষ্কার।
- **Queue group।** `workers` queue group সহ `room.general` worker জুড়ে message বিতরণ করে (প্রতিটা message একটা worker-এ যায়)। যখন আপনি চান অনেক backend worker-এর একটা একটা event process করুক তখন কাজে লাগে।
- **JetStream.** at-least-once delivery-র জন্য একটা persistent log layer — Redis pub/sub + একটা queue-কে একটা system দিয়ে replace করে।

Go-তে NATS:

```go
nc, _ := nats.Connect("nats://localhost:4222")
sub, _ := nc.Subscribe("room.*", func(m *nats.Msg) {
    handleMessage(m.Subject, m.Data)
})
nc.Publish("room.general", payload)
```

একই shape, আলাদা broker। বেশিরভাগ app-এর জন্য, Redis যথেষ্ট। NATS সঠিক পছন্দ হয় যখন আপনার আছে:

- ~100K message/second-এর বেশি sustained।
- message persistence আর replay-র প্রয়োজন (JetStream)।
- অনেক service যেখানে pub/sub bus একটা primary architecture component।

<Callout type="info">

**অকালে broker switch করবেন না।** Redis pub/sub থেকে NATS বা Kafka-তে যাওয়ার সঠিক সময় হলো যখন আপনার কাছে bottleneck দেখানো measurement আছে। broker migrate করা বাস্তব কাজ; দরকার হওয়ার আগে করা অপচয়।

</Callout>

## Sticky session — কেন আপনার লাগতে নাও পারে

একটা সাধারণ মিথ: WebSocket client-এর sticky session দরকার (load balancer reconnect-এ একটা client-কে একই process-এ route করে)। pub/sub fan-out সহ, আপনার লাগে না।

একটা client reconnect করে, যেকোনো process-এ ল্যান্ড করে, তার room subscribe করে, bus থেকে fan-out পাওয়া শুরু করে। আগের process এটার কথা ভুলে গেছে; নতুন process এটাকে fresh হিসেবে দেখে। Connection state local; routing global।

Sticky session তখনই দরকার হয় যদি আপনি per-client state process memory-তে cache করেন (recent message, derived view) আর একই client-এর reconnect-এ সেই state টিকে থাকা দরকার। ওই প্যাটার্ন এড়িয়ে চলুন; per-client state Redis বা Postgres-এ রাখুন যাতে যেকোনো process যেকোনো client serve করতে পারে।

## Reconnect-এ replay

একটা client disconnected থাকার সময় পাঠানো message-এর কী হবে? pub/sub-এ সেগুলো নেই।

ephemeral data-র (live chat) জন্য, বেশিরভাগ app gap মেনে নেয় — client reconnect করার মুহূর্ত থেকে message দেখে। Chat history connect-এ client-এর আলাদা করা একটা database query থেকে আসে।

at-least-once semantics-এর (যে notification miss করা যাবে না) জন্য:

1. publish করার পাশাপাশি Postgres-এও (বা Redis Streams, বা যেকোনো append-only store) event persist করুন।
2. client connect-এ, client-এর last seen ID থেকে event-এর জন্য persistent store query করুন।
3. সেখান থেকে live pub/sub সহ চালিয়ে যান।

SSE-র `Last-Event-ID`-র মতোই একই প্যাটার্ন। একবার বানান, পুনরায় ব্যবহার করুন। চ্যাপ্টার 9 reconnection আরও বিস্তারিত cover করে।

## Redis operate করা

তিনটা জিনিস করতে হবে:

1. **একটা version pin করুন, systemd হিসেবে চালান।** `apt install redis-server` আর systemd-কে এটা manage করতে দিন। failure-এ restart।
2. যদি কোনো state গুরুত্বপূর্ণ হয় **AOF persistence enable করুন** (pub/sub-এর জন্য নয়, কিন্তু আপনি যদি caching, presence বা rate limiting-এর জন্যও Redis ব্যবহার করেন, হ্যাঁ)।
3. **`redis-cli info` দিয়ে monitor করুন** — connected client, keyspace stats, memory। `redis_exporter`-এর মাধ্যমে Prometheus-এ hook করুন।

pub/sub-এর জন্য বিশেষভাবে, `redis-cli monitor` live message stream দেখায় — "আমার publisher কি আসলে fire করছে" debug করার জন্য অমূল্য।

## locally pub/sub test করা

সবচেয়ে সস্তা test হলো `redis-cli`:

```bash
redis-cli subscribe room:general
# ... in another shell ...
redis-cli publish room:general 'hi'
```

আপনার কোনো code জড়িত না করে bus healthy কিনা নিশ্চিত করে। আপনার service যদি publish করে কিন্তু `redis-cli subscribe` কিছু না দেখে, আপনার service misconfigured। `redis-cli` কাজ করলে কিন্তু আপনার service message না দেখলে, আপনার subscriber loop ভুল।

## Recap

- একটা process অনেক connection ধরতে পারে; অনেক process-এর একটা shared pub/sub bus দরকার।
- Redis pub/sub: সহজ, fast, fire-and-forget। ephemeral event-এর জন্য সঠিক।
- প্রতি process-এ একটা subscribe goroutine, drop policy সহ per-client channel-এ fan out করছে।
- Channel design: per-room, per-user, per-event-type। মেশান।
- higher throughput, queue group, বা JetStream-এর persistent log-এর জন্য NATS।
- সব per-client state local বা Redis-এ থাকলে sticky session সাধারণত অপ্রয়োজনীয়।
- Reconnect-এ replay: built in নয়। একটা persistent store + last-seen-ID ব্যবহার করুন।
- systemd, AOF (অন্য feature দরকার হলে), Prometheus exporter দিয়ে Redis operate করুন।
- নিজের code-কে দোষ দেওয়ার আগে `redis-cli` দিয়ে fan-out test করুন।

পরবর্তী: [Presence আর rooms](/notes/websockets/07-presence-rooms) — কে online তা track করা, channel-এ join আর leave করা, আর যে operational প্যাটার্নগুলো কাজ করে।
