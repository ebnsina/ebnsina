---
title: 'আপনার প্রথম server'
subtitle: 'End-to-end Go WebSocket server আশি লাইনে, একটা browser client সহ। শেষে আপনার কাছে একটা echo service plus একটা ছোট chat room থাকবে — দুটোই localhost-এ চলছে, দুটোই বাস্তব।'
chapter: 3
level: 'beginner'
readingTime: '11 মিনিট'
topics: ['websockets', 'go', 'coder/websocket', 'browser']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

মেলার এক কোণে সিনা প্রথমবারের মতো একটা তথ্য-বুথ খুলে বসলেন। নিয়মটা সহজ — যখনই কোনো দর্শনার্থী বুথের সামনে এসে দাঁড়ায়, সিনা তার জন্য একটা আলাদা কথোপকথন শুরু করেন, একটা খোলা লাইন। ফাতিমা এসে দাঁড়ালেন। সিনা তক্ষুনি তার দিকে মনোযোগ দিলেন, আর কান পেতে রইলেন — ফাতিমা কখন কিছু বলবেন। ফাতিমা বললেন "সালাম", সঙ্গে সঙ্গে সেই একই খোলা লাইনে সিনা জবাব দিলেন।

প্রথম দিন তো, সিনা এখনো জটিল কিছু সামলানো শেখেননি। তাই তিনি একটা সহজ নিয়ম মানলেন — দর্শনার্থী যা-ই বলুক, তিনি হুবহু সেটাই ফেরত বলেন। ফাতিমা বললেন "আজকের আবহাওয়া কেমন?", সিনাও শুনিয়ে দিলেন "আজকের আবহাওয়া কেমন?"। এভাবে যাচাই করে নেওয়া যায় লাইনটা ঠিকঠাক কাজ করছে কিনা। কাজ শেষে ফাতিমা যখন বিদায় নিয়ে চলে গেলেন, সিনা পরিষ্কারভাবে সেই কথোপকথনটা গুটিয়ে ফেললেন, লাইন বন্ধ করলেন — পরের দর্শনার্থীর জন্য প্রস্তুত।

এই বুথটাই আসলে একটা WebSocket **server**। দর্শনার্থী এসে দাঁড়ানো মানে নতুন একটা connection **accept** করা। তার কথা শোনার জন্য কান পেতে থাকা হলো message handler — প্রতিবার সে কিছু বললে ওই handler চালু হয়। একই খোলা লাইনে জবাব দেওয়া হলো **send**, আর হুবহু ফেরত বলা হলো **echo** server। দর্শনার্থী চলে যাওয়া হলো **close** event, যেখানে connection পরিষ্কারভাবে বন্ধ হয়। বাস্তবে একটা chat বা live-notification server ঠিক এভাবেই কাজ করে — প্রতিটা client-এর জন্য একটা করে খোলা connection, message এলে সাড়া, আর client চলে গেলে connection বন্ধ।

Theory off। Code on।

এই চ্যাপ্টার `github.com/coder/websocket` ব্যবহার করে Go-তে একটা বাস্তব WebSocket server ship করে। আমরা একটা single-connection echo server দিয়ে শুরু করি, তারপর সেটাকে একটা many-connection broadcast room-এ বিস্তৃত করি। দুটোই ছোট; দুটোই বাকি ট্র্যাকের সবকিছুর ভিত্তি।

<Callout type="info">

**বাস্তব উদাহরণ**

একটা WebSocket server বানানো হলো একটা walkie-talkie network সেট আপ করার মতো — একবার channel খোলা হলে, frequency-তে থাকা যে কেউ broadcast করতে পারে আর বাকি সবাই সাথে সাথে শোনে।

</Callout>

## Setup

```bash
mkdir mywebsocket && cd mywebsocket
go mod init example.com/mywebsocket
go get github.com/coder/websocket
```

এটাই dependency। Modern Go WebSocket library, ~3000 লাইন, idiomatic, context-aware, MIT licensed।

## echo server

```go
// echo/main.go
package main

import (
    "context"
    "log"
    "net/http"
    "time"

    "github.com/coder/websocket"
)

func handleEcho(w http.ResponseWriter, r *http.Request) {
    c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
        OriginPatterns: []string{"localhost:*"},
    })
    if err != nil {
        log.Println("accept:", err)
        return
    }
    defer c.CloseNow()

    ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
    defer cancel()

    for {
        typ, data, err := c.Read(ctx)
        if err != nil {
            log.Println("read:", err)
            return
        }
        if err := c.Write(ctx, typ, data); err != nil {
            log.Println("write:", err)
            return
        }
    }
}

func main() {
    http.HandleFunc("/ws", handleEcho)
    http.Handle("/", http.FileServer(http.Dir("static")))

    log.Println("serving on http://localhost:8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

চলমান অংশগুলো পড়ুন।

**`websocket.Accept`** handshake করে — `Upgrade` validate করে, `Sec-WebSocket-Accept` compute করে, ঐচ্ছিকভাবে extension আর subprotocol negotiate করে। একটা `*websocket.Conn` return করে। `OriginPatterns` whitelist সীমাবদ্ধ করে কোন origin connect করতে পারবে (পুরো প্যাটার্নের জন্য চ্যাপ্টার 8 দেখুন; dev-এর জন্য `"localhost:*"` ঠিক আছে)।

**`c.CloseNow()` in `defer`** handler যদি একটা clean close ছাড়া exit করে তবে connection kill করে। Belt-and-braces — কিছু panic করলে বা return করলে, connection leak করে না।

**`c.Read(ctx)` returns `(messageType, []byte, error)`।** Message type হলো `websocket.MessageText` বা `websocket.MessageBinary`। library স্বচ্ছভাবে fragment reassemble করে — আপনি পুরো message দেখেন।

**`c.Write(ctx, typ, data)`** একটা frame পাঠায়। Atomic; অন্য writer-দের সাথে কোনো interleaving নেই (library-র একটা internal write lock আছে)।

**Context timeout (এই উদাহরণে 10 min)** যেকোনো একটা read বা write কতক্ষণ block করতে পারে তা cap করে। একটা echo server-এর জন্য এটা ঠিক আছে; idle user সহ একটা বাস্তব chat server-এর জন্য, আপনি আরও লম্বা বা কোনো timeout চান না (idle-এ নয়, disconnect-এ cancel)।

## একটা browser client

```html
<!-- static/index.html -->
<!doctype html>
<html>
	<body>
		<input id="msg" placeholder="say something" />
		<button onclick="send()">send</button>
		<pre id="log"></pre>

		<script>
			const ws = new WebSocket(`ws://${location.host}/ws`);
			const log = document.getElementById('log');

			ws.onopen = () => (log.textContent += 'connected\n');
			ws.onmessage = (e) => (log.textContent += `recv: ${e.data}\n`);
			ws.onclose = (e) => (log.textContent += `closed (${e.code})\n`);
			ws.onerror = (e) => (log.textContent += `error\n`);

			function send() {
				const v = document.getElementById('msg').value;
				ws.send(v);
				log.textContent += `sent: ${v}\n`;
			}
		</script>
	</body>
</html>
```

```bash
mkdir static
# save the html above to static/index.html
go run ./echo
# serving on http://localhost:8080
```

একটা browser-এ `http://localhost:8080` খুলুন, কিছু type করুন, send চাপুন। আপনি `sent: hello` তারপর `recv: hello` দেখবেন — echo round-trip করেছে।

এটাই Go-তে end-to-end WebSockets: ~30 লাইন server, ~20 লাইন client, কোনো external service নেই।

## একটা বাস্তব broadcast room

Echo একঘেয়ে। আসল যে primitive-টা আপনি চান সেটা হলো "অনেক client connected; একটা client পাঠায়, সব client পায়।"

```go
// chat/main.go
package main

import (
    "context"
    "errors"
    "log"
    "net/http"
    "sync"
    "time"

    "github.com/coder/websocket"
)

type Room struct {
    mu      sync.Mutex
    clients map[*Client]struct{}
}

type Client struct {
    conn *websocket.Conn
    out  chan []byte
}

func (r *Room) add(c *Client) {
    r.mu.Lock()
    r.clients[c] = struct{}{}
    r.mu.Unlock()
}

func (r *Room) remove(c *Client) {
    r.mu.Lock()
    delete(r.clients, c)
    r.mu.Unlock()
    close(c.out)
}

func (r *Room) broadcast(data []byte) {
    r.mu.Lock()
    defer r.mu.Unlock()
    for c := range r.clients {
        select {
        case c.out <- data:
        default:
            // slow client: drop the message rather than blocking the room
        }
    }
}

func (r *Room) handle(w http.ResponseWriter, req *http.Request) {
    conn, err := websocket.Accept(w, req, &websocket.AcceptOptions{
        OriginPatterns: []string{"localhost:*"},
    })
    if err != nil {
        log.Println("accept:", err)
        return
    }
    defer conn.CloseNow()

    client := &Client{conn: conn, out: make(chan []byte, 64)}
    r.add(client)
    defer r.remove(client)

    ctx, cancel := context.WithCancel(req.Context())
    defer cancel()

    // writer goroutine: drains outbound queue
    go func() {
        for msg := range client.out {
            wctx, wcancel := context.WithTimeout(ctx, 5*time.Second)
            err := conn.Write(wctx, websocket.MessageText, msg)
            wcancel()
            if err != nil {
                cancel() // signal the reader to stop
                return
            }
        }
    }()

    // reader: loops until disconnect
    for {
        _, data, err := conn.Read(ctx)
        if err != nil {
            if !errors.Is(err, context.Canceled) {
                log.Println("read:", err)
            }
            return
        }
        r.broadcast(data)
    }
}

func main() {
    room := &Room{clients: map[*Client]struct{}{}}

    http.HandleFunc("/ws", room.handle)
    http.Handle("/", http.FileServer(http.Dir("static")))

    log.Println("chat on http://localhost:8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

দুটো browser tab খুলুন। একটা থেকে পাঠান — অন্যটায় দেখা যায়। এটাই ভিত্তিমূলক প্যাটার্ন: per-connection reader আর writer goroutine, একটা room map, per-client channel-এ push করা broadcast।

## প্রতি client-এ একটা writer goroutine কেন

একটা `*websocket.Conn` concurrent read আর write অনুমতি দেয়, কিন্তু প্রতি direction-এ একবারে শুধু একটা writer। library-র internal locking আছে, কিন্তু একাধিক goroutine একসাথে `Write` call করলে message (locking-এর নিচে) অকাজের ভাবে interleave করতে পারে।

পরিষ্কার প্যাটার্ন হলো **প্রতি direction-এ একটা goroutine**:

- **Reader goroutine:** HTTP handler নিজেই, `conn.Read`-এ loop করছে।
- **Writer goroutine:** একটা per-client `chan []byte` drain করে, একবারে একটা message করে `conn.Write` call করে।

যে কেউ একটা client-এ পাঠাতে চায় সে channel-এ push করে — তারা কখনো সরাসরি `Write` call করে না। channel sender-কে network থেকে decouple করে, আর writer goroutine সবকিছু পরিষ্কারভাবে serialize করে।

## slow client সামলানো

`broadcast`-এর `select`-টা গুরুত্বপূর্ণ:

```go
select {
case c.out <- data:
default:
    // drop
}
```

client-এর outbound channel full হলে (slow consumer, slow network), broadcasting block করে। অনেক client-এর সাথে, একটা slow client পুরো room stall করে দেয়। `default` case block করার বদলে message ড্রপ করে — slow client একটা update miss করে, কিন্তু বাকি client-রা অক্ষত থাকে।

অন্য policy-ও সম্ভব:

- **Drop oldest.** Push করার আগে channel থেকে একটা pop করুন।
- **Slow client disconnect করুন।** তাদের channel পর পর N বার full হলে, connection বন্ধ করুন।
- **Block (খারাপ)।** করবেন না।

চ্যাপ্টার 9 backpressure বিস্তারিত cover করে। আপাতত, dropping-ই সঠিক default।

<Callout type="warn">

**broadcast loop থেকে কখনো সরাসরি `conn.Write` call করবেন না।** একটা single slow client পুরো room block করবে, যেটা ঠিক সেই failure mode যা এড়াতে writer goroutine বানানো হয়েছিল। সবসময় একটা buffered channel-এ push করুন; writer goroutine-কে network call সামলাতে দিন।

</Callout>

## Graceful close

`conn.CloseNow()` একটা close handshake ছাড়াই connection ঝপ করে বন্ধ করে দেয় — error-এর কারণে আমরা যখন connection পরিত্যাগ করছি তখন উপযুক্ত।

একটা clean close-এর জন্য, `conn.Close(code, reason)` ব্যবহার করুন:

```go
conn.Close(websocket.StatusNormalClosure, "")
```

এটা একটা close frame পাঠায়, peer-এর reply-র জন্য সংক্ষিপ্তভাবে অপেক্ষা করে, তারপর TCP বন্ধ করে। peer-এর জন্য clean; JS `onclose` event `code=1000` report করে।

shutdown-এ এটা যোগ করুন:

```go
sigs := make(chan os.Signal, 1)
signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
go func() {
    <-sigs
    log.Println("shutting down...")
    room.mu.Lock()
    for c := range room.clients {
        c.conn.Close(websocket.StatusGoingAway, "server shutting down")
    }
    room.mu.Unlock()
    os.Exit(0)
}()
```

Status `1001 GoingAway` হলো "আমি ইচ্ছে করে চলে যাচ্ছি"-র signal। Browser client এর উপর branch করে reconnect করবে কিনা ঠিক করতে পারে। চ্যাপ্টার 9-এ পুরো reconnect protocol আছে।

## আপনার toolkit-এ `wscat` যোগ করা

`wscat` হলো `curl`-এর WebSocket সমতুল্য। একটা browser না চালিয়ে server test করার জন্য অপরিহার্য।

```bash
npm install -g wscat
wscat -c ws://localhost:8080/ws
> hello
< hello
```

বা custom Origin header, custom subprotocol ইত্যাদি পাঠান। manpage পড়ুন; এটা ছোট।

## Concurrency আর limit

প্রতি connection-এ একটা goroutine ব্যবহার করা একটা naive Go server বিস্ময়করভাবে অনেক দূর scale করে। একটা ছোট VPS-এ:

- ~10K concurrent connection আরামদায়ক।
- ~50K টাইট কিন্তু সম্ভব যদি আপনার message ছোট আর কম-ঘন হয়।
- এর বাইরে, `evio` / `gnet` দেখুন (epoll-based, কম goroutine) বা একাধিক process-এ কাজ ভাগ করুন।

প্রতিটা connection-এর খরচ:

- read-এর জন্য একটা goroutine (শুরুতে ~8 KB stack)।
- write-এর জন্য একটা goroutine (~8 KB stack)।
- একটা channel buffer (`out` chan; ~64 × message-size)।
- একটা file descriptor।

প্রতি idle connection-এ মোট ~50–100 KB, plus আপনার message buffer যা-ই হোক। high count-এর জন্য OS limit tune করুন (চ্যাপ্টার 10)।

## একটা সাধারণ bug: reader disconnect দেখে না

যদি শুধু `conn.Write` call করেন আর কখনো `conn.Read` না করেন, তবে client কখন disconnect করেছে তা আপনি detect করবেন না যতক্ষণ না আপনার write শেষমেশ fail করে। সেটা মিনিট লাগতে পারে।

**Reader goroutine optional নয়**, এমনকি client থেকে কোনো message সামলানোর না থাকলেও। এটা থাকে যাতে:

1. control frame (ping, close) drain করা যায়।
2. disconnect দ্রুত detect করা যায়।

একটা server-push-only service-এর জন্য, reader loop শুধু সবকিছু ফেলে দেয়:

```go
go func() {
    for {
        _, _, err := conn.Read(ctx)
        if err != nil {
            cancel()
            return
        }
    }
}()
```

সস্তা। সবসময় থাকবে।

## Recap

- `coder/websocket` handshake, framing, fragmentation, control frame সামলায়।
- `Accept(w, r, opts)` upgrade করে; `Read(ctx)` আর `Write(ctx, typ, data)` message নাড়ায়।
- প্রতি connection-এ একটা reader goroutine আর একটা writer goroutine। সবসময়।
- Broadcast per-client channel-এ push করে; একটা fan-out loop থেকে কখনো সরাসরি `Write` call করবেন না।
- Slow client: `select { ... default: }` দিয়ে message ড্রপ করুন। N বার drop-এর পর disconnect করুন।
- graceful shutdown-এর জন্য `Close(code, reason)`; emergency-র জন্য `CloseNow`।
- Tool: command-line WS testing-এর জন্য `wscat`।
- disconnect detect করতে আর ping সামলাতে push-only service-এও reader বাধ্যতামূলক।

পরবর্তী: [উপরে message protocol](/notes/websockets/04-message-protocols) — JSON, msgpack, framing, versioning, আর raw frame-এর উপর যে request/response প্যাটার্ন বানান।
