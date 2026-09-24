---
title: 'WebSockets ও Real-Time'
subtitle: 'Go-তে real-time ফিচার বানান — chat, live update, notification — WebSockets আর Go-এর concurrency model ব্যবহার করে।'
chapter: 17
level: 'intermediate'
readingTime: '20 মিনিট'
topics: ['WebSockets', 'real-time', 'chat', 'pub/sub', 'SSE', 'gorilla/websocket']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

একটা কুরিয়ার কোম্পানির ডিসপ্যাচ অফিসে ফাতিমা বসে আছেন হেডফোন-মাইক নিয়ে, সামনে একটা CB-রেডিও সেট। শহরজুড়ে ছড়িয়ে থাকা প্রতিটা ডেলিভারি ভ্যানের ড্রাইভার — সিনা, খোয়ারিজমি, আরও দশজন — সবার হাতে একটা করে ওয়াকি-টকি হ্যান্ডসেট। এই রেডিও চ্যানেলটা সারাক্ষণ খোলা থাকে; ফোনের মতো একবার কথা বলে লাইন কেটে দিতে হয় না। রাস্তায় জ্যাম দেখলে সিনা সাথে সাথে বলে ওঠে "মিরপুর রোড বন্ধ", আবার ফাতিমাও তখনই তাকে নতুন রুট বলে দিতে পারেন — দুই পক্ষই যখন খুশি কথা বলতে পারে।

সবচেয়ে মজার জিনিসটা হলো broadcast। হঠাৎ যদি অফিস থেকে সবাইকে একসাথে জানাতে হয় "আজ ৬টার পর কোনো ডেলিভারি নেই", ফাতিমাকে একে একে সবাইকে ফোন করতে হয় না — তিনি একবার মাইকে বললেই সেই একটা মেসেজ চালু থাকা প্রতিটা হ্যান্ডসেটে একসাথে পৌঁছে যায়। কোনো ড্রাইভার গ্যারেজে ঢুকে রেডিও বন্ধ করে দিলে ফাতিমা তাকে তালিকা থেকে বাদ দিয়ে দেন, বাকিদের চ্যানেল আগের মতোই চলতে থাকে।

এই খোলা রেডিও লিংকটাই হলো একটা persistent, দুই-মুখী WebSocket connection — ফোন কলের মতো একবার কানেক্ট হলে দুই দিক থেকেই মেসেজ যায়। ফাতিমা হলেন hub, যে সব connection একজায়গায় ম্যানেজ করে; মাইকে একবার বলে সবার কাছে পৌঁছে দেওয়াটাই সব connected client-এর কাছে broadcast করা (fan-out)। আর প্রতিটা ড্রাইভারের হ্যান্ডসেট হলো per-connection goroutine — প্রত্যেকের জন্য আলাদা লাইন শোনে আর কথা বলে। বাস্তবে live chat বা real-time notification ঠিক এভাবেই কাজ করে — একজন কিছু লিখলে বা কোনো ঘটনা ঘটলে hub সেটা একসাথে সব ইউজারের স্ক্রিনে পৌঁছে দেয়।

## WebSockets বনাম HTTP

HTTP হলো request-response: client জিজ্ঞেস করে, server উত্তর দেয়, connection বন্ধ হয়ে যায়। WebSockets একটা **persistent, bidirectional connection** ধরে রাখে — দুই পক্ষই যেকোনো সময় message পাঠাতে পারে।

<Callout type="info">

**বাস্তব উদাহরণ**

HTTP হলো texting-এর মতো — আপনি একটা message পাঠান আর reply-এর জন্য অপেক্ষা করেন। WebSockets হলো ফোন কলের মতো — একবার connect হয়ে গেলে দুই পক্ষই যখন খুশি কথা বলতে পারে, আর কেউ hang up না করা পর্যন্ত লাইনটা খোলা থাকে।

</Callout>

## gorilla/websocket দিয়ে WebSocket Server

```go
import "github.com/gorilla/websocket"

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin: func(r *http.Request) bool {
        return true  // In production: validate allowed origins
    },
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        slog.Error("websocket upgrade failed", "error", err)
        return
    }
    defer conn.Close()

    for {
        messageType, message, err := conn.ReadMessage()
        if err != nil {
            if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
                slog.Error("websocket read error", "error", err)
            }
            break
        }

        // Echo the message back
        if err := conn.WriteMessage(messageType, message); err != nil {
            slog.Error("websocket write error", "error", err)
            break
        }
    }
}
```

## একটা Chat Room বানানো

একটা বাস্তব chat system, যেখানে একটা hub সব connection ম্যানেজ করে:

```go
// Hub manages all connected clients and broadcasts messages
type Hub struct {
    clients    map[*Client]bool
    broadcast  chan []byte
    register   chan *Client
    unregister chan *Client
    mu         sync.RWMutex
}

type Client struct {
    hub  *Hub
    conn *websocket.Conn
    send chan []byte
    user string
}

type ChatMessage struct {
    Type    string `json:"type"`
    User    string `json:"user"`
    Content string `json:"content"`
    Time    string `json:"time"`
}

func NewHub() *Hub {
    return &Hub{
        clients:    make(map[*Client]bool),
        broadcast:  make(chan []byte),
        register:   make(chan *Client),
        unregister: make(chan *Client),
    }
}

func (h *Hub) Run() {
    for {
        select {
        case client := <-h.register:
            h.mu.Lock()
            h.clients[client] = true
            h.mu.Unlock()
            slog.Info("client connected", "user", client.user, "total", len(h.clients))

        case client := <-h.unregister:
            h.mu.Lock()
            if _, ok := h.clients[client]; ok {
                delete(h.clients, client)
                close(client.send)
            }
            h.mu.Unlock()
            slog.Info("client disconnected", "user", client.user, "total", len(h.clients))

        case message := <-h.broadcast:
            h.mu.RLock()
            for client := range h.clients {
                select {
                case client.send <- message:
                default:
                    // Client's send buffer is full — disconnect them
                    close(client.send)
                    delete(h.clients, client)
                }
            }
            h.mu.RUnlock()
        }
    }
}

// Each client has two goroutines: one for reading, one for writing
func (c *Client) readPump() {
    defer func() {
        c.hub.unregister <- c
        c.conn.Close()
    }()

    c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
    c.conn.SetPongHandler(func(string) error {
        c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
        return nil
    })

    for {
        _, message, err := c.conn.ReadMessage()
        if err != nil {
            break
        }

        msg := ChatMessage{
            Type:    "message",
            User:    c.user,
            Content: string(message),
            Time:    time.Now().Format(time.RFC3339),
        }

        data, _ := json.Marshal(msg)
        c.hub.broadcast <- data
    }
}

func (c *Client) writePump() {
    ticker := time.NewTicker(30 * time.Second)
    defer func() {
        ticker.Stop()
        c.conn.Close()
    }()

    for {
        select {
        case message, ok := <-c.send:
            if !ok {
                c.conn.WriteMessage(websocket.CloseMessage, []byte{})
                return
            }
            c.conn.WriteMessage(websocket.TextMessage, message)

        case <-ticker.C:
            // Send ping to keep connection alive
            if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                return
            }
        }
    }
}
```

## Chat Server-টা wire করা

```go
func main() {
    hub := NewHub()
    go hub.Run()

    mux := http.NewServeMux()

    mux.HandleFunc("GET /ws", func(w http.ResponseWriter, r *http.Request) {
        username := r.URL.Query().Get("user")
        if username == "" {
            http.Error(w, "user parameter required", http.StatusBadRequest)
            return
        }

        conn, err := upgrader.Upgrade(w, r, nil)
        if err != nil {
            return
        }

        client := &Client{
            hub:  hub,
            conn: conn,
            send: make(chan []byte, 256),
            user: username,
        }

        hub.register <- client

        go client.writePump()
        go client.readPump()
    })

    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

<Callout type="info">

**বাস্তব উদাহরণ**

Hub হলো একটা রেডিও স্টেশনের কন্ট্রোল রুমের মতো। প্রতিটা শ্রোতার (client) একটা রেডিও রিসিভার (WebSocket connection) আছে। কেউ যখন কল করে (message পাঠায়), কন্ট্রোল রুম (hub) সেটা প্রতিটা active রিসিভারে broadcast করে। কোনো রিসিভার signal হারালে (disconnect হলে), hub তাকে broadcast list থেকে সরিয়ে দেয়।

</Callout>

## Server-Sent Events (SSE)

one-way server-to-client streaming-এর জন্য SSE, WebSockets-এর চেয়ে সহজ:

```go
func handleSSE(w http.ResponseWriter, r *http.Request) {
    flusher, ok := w.(http.Flusher)
    if !ok {
        http.Error(w, "streaming not supported", http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")

    ticker := time.NewTicker(2 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            data := map[string]any{
                "cpu":    getCPUUsage(),
                "memory": getMemoryUsage(),
                "time":   time.Now().Format(time.RFC3339),
            }
            jsonData, _ := json.Marshal(data)

            fmt.Fprintf(w, "event: metrics\ndata: %s\n\n", jsonData)
            flusher.Flush()

        case <-r.Context().Done():
            return  // Client disconnected
        }
    }
}
```

**SSE বনাম WebSockets — কখন কোনটা ব্যবহার করবেন:**

- **SSE** — server client-এ update push করে (live score, stock ticker, notification)। সহজ, auto-reconnect হয়, HTTP/2-এর উপর কাজ করে।
- **WebSockets** — bidirectional communication (chat, collaborative editing, gaming)। বেশি জটিল কিন্তু বেশি শক্তিশালী।

## Redis Pub/Sub দিয়ে WebSockets Scale করা

যখন আপনি একাধিক server instance চালান, WebSocket connection প্রতিটা instance-এর জন্য local থাকে। Redis pub/sub instance-গুলোর মধ্যে message sync করে দেয়:

```go
type DistributedHub struct {
    local  *Hub
    redis  *redis.Client
    channel string
}

func NewDistributedHub(redisClient *redis.Client, channel string) *DistributedHub {
    return &DistributedHub{
        local:   NewHub(),
        redis:   redisClient,
        channel: channel,
    }
}

func (dh *DistributedHub) Run(ctx context.Context) {
    // Start local hub
    go dh.local.Run()

    // Subscribe to Redis channel
    sub := dh.redis.Subscribe(ctx, dh.channel)
    ch := sub.Channel()

    go func() {
        for msg := range ch {
            // Broadcast messages from other instances to local clients
            dh.local.broadcast <- []byte(msg.Payload)
        }
    }()
}

func (dh *DistributedHub) Broadcast(ctx context.Context, message []byte) {
    // Publish to Redis — all instances receive it
    dh.redis.Publish(ctx, dh.channel, message)
}
```

## মূল কথা

1. **bidirectional-এর জন্য WebSockets**, **server-push-এর জন্য SSE** — যখন সম্ভব সহজ option-টা বেছে নিন
2. **Hub pattern** client ম্যানেজমেন্ট এক জায়গায় নিয়ে আসে — register, unregister, broadcast
3. **প্রতি client-এ দুইটা goroutine** — একটা reading, একটা writing। কখনো একাধিক goroutine-এর মধ্যে একটা connection share করবেন না
4. **Ping/pong connection alive রাখে** — মৃত client-গুলো জমে যাওয়ার আগেই detect করুন
5. **Buffered send channel** overflow detection সহ, slow client-দের hub block করা থেকে আটকায়
6. একাধিক server instance-এ scale করার জন্য **Redis pub/sub**
