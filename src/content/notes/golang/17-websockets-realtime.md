---
title: "WebSockets & Real-Time"
subtitle: "Build real-time features in Go — chat, live updates, notifications — using WebSockets and Go's concurrency model."
chapter: 17
level: "intermediate"
readingTime: "20 min"
topics: ["WebSockets", "real-time", "chat", "pub/sub", "SSE", "gorilla/websocket"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## WebSockets vs HTTP

HTTP is request-response: client asks, server answers, connection closes. WebSockets maintain a **persistent, bidirectional connection** — both sides can send messages at any time.

<Callout type="info">

**Real-World Analogy**

HTTP is like texting — you send a message and wait for a reply. WebSockets are like a phone call — once connected, both sides can talk whenever they want, and the line stays open until someone hangs up.

</Callout>

## WebSocket Server with gorilla/websocket

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

## Building a Chat Room

A real-world chat system with a hub that manages all connections:

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

## Wiring the Chat Server

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

**Real-World Analogy**

The Hub is like a radio station's control room. Every listener (client) has a radio receiver (WebSocket connection). When someone calls in (sends a message), the control room (hub) broadcasts it to every active receiver. If a receiver loses signal (disconnects), the hub removes them from the broadcast list.

</Callout>

## Server-Sent Events (SSE)

For one-way server-to-client streaming, SSE is simpler than WebSockets:

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

**When to use SSE vs WebSockets:**
- **SSE** — server pushes updates to client (live scores, stock tickers, notifications). Simpler, auto-reconnects, works over HTTP/2.
- **WebSockets** — bidirectional communication (chat, collaborative editing, gaming). More complex but more powerful.

## Scaling WebSockets with Redis Pub/Sub

When you run multiple server instances, WebSocket connections are local to each instance. Redis pub/sub syncs messages across instances:

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

## Key Takeaways

1. **WebSockets for bidirectional**, **SSE for server-push** — pick the simpler option when possible
2. **Hub pattern** centralizes client management — register, unregister, broadcast
3. **Two goroutines per client** — one reading, one writing. Never share a connection between goroutines
4. **Ping/pong keeps connections alive** — detect dead clients before they pile up
5. **Buffered send channels** with overflow detection prevent slow clients from blocking the hub
6. **Redis pub/sub** for scaling across multiple server instances

