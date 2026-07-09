---
title: 'Server-Sent Events'
subtitle: 'যখন client শুধু শোনে, SSE গুরুত্বপূর্ণ প্রতিটা মাত্রায় WebSockets-কে হারায় — সহজতর protocol, বিনামূল্যে reconnect, plain HTTP। One-way realtime-এর default।'
chapter: 5
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['sse', 'server-sent-events', 'realtime', 'http']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব উদাহরণ**

একটা রেডিও broadcast — স্টেশন একটানা transmit করে, শ্রোতারা tune in করে receive করে, আর একজন শ্রোতার পাল্টা কথা বলার কোনো ব্যবস্থা নেই। SSE হলো HTTP-র উপর সেই model: এক দিক, সবসময় on, বিনামূল্যে reconnect।

</Callout>

চ্যাপ্টার 1-এর heuristic পড়েছেন: client যদি শুধু consume করে, SSE বাছুন। এই চ্যাপ্টার সেটার পক্ষে যুক্তি। শেষে আপনার কাছে Go-তে একটা SSE server থাকবে, একটা browser client যা স্বয়ংক্রিয়ভাবে reconnect করে, আর কখন SSE সঠিক tool আর কখন WebSockets সেটার একটা পরিষ্কার ধারণা।

## SSE কী

একটা Server-Sent Events stream হলো `Content-Type: text/event-stream` সহ একটা long-running HTTP response। server একটা ছোট line-based format-এ UTF-8 text লেখে; browser-এর `EventSource` API প্রতিটা event parse করে আর একটা callback fire করে।

পুরো protocol একটা paragraph-এ ধরে যায়। কোনো frame নেই, কোনো opcode নেই, কোনো masking নেই। এটা plain HTTP।

```
GET /events HTTP/1.1
Accept: text/event-stream
```

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: hello

data: world
event: notify
id: 42
data: {"text": "you got mail"}

retry: 5000
```

প্রতিটা event হলো এক বা একাধিক `field: value` line, একটা blank line দিয়ে terminated। Field:

- **`data:`** — event payload। একাধিক `data:` line newline দিয়ে join হয়।
- **`event:`** — event-এর নাম। Default `"message"`। Browser নাম দিয়ে route করে।
- **`id:`** — একটা sequence ID। Browser এটা মনে রাখে আর reconnect-এ `Last-Event-ID` header হিসেবে পাঠায়।
- **`retry:`** — reconnect করার আগে অপেক্ষার মিলিসেকেন্ড। Browser এটা সম্মান করে।

এটাই পুরো format। RFC 6202 plus `EventSource` spec।

## একটা Go SSE server

```go
// sse/main.go
package main

import (
    "fmt"
    "log"
    "net/http"
    "time"
)

func sseHandler(w http.ResponseWriter, r *http.Request) {
    flusher, ok := w.(http.Flusher)
    if !ok {
        http.Error(w, "streaming unsupported", http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")

    ticker := time.NewTicker(2 * time.Second)
    defer ticker.Stop()

    var seq int
    for {
        select {
        case <-r.Context().Done():
            log.Println("client gone")
            return

        case t := <-ticker.C:
            seq++
            fmt.Fprintf(w, "id: %d\n", seq)
            fmt.Fprintf(w, "event: tick\n")
            fmt.Fprintf(w, "data: %s\n\n", t.Format(time.RFC3339))
            flusher.Flush()
        }
    }
}

func main() {
    http.HandleFunc("/events", sseHandler)
    http.Handle("/", http.FileServer(http.Dir("static")))
    log.Println("sse on http://localhost:8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

দুটো অংশ দেখানোর মতো।

**`http.Flusher`** হলো সেই লিভার যা একটা সাধারণ handler-কে একটা stream-এ পরিণত করে। `Flush()` ছাড়া, handler return না করা পর্যন্ত response buffered থাকে। প্রতিটা write-এর পর `Flush()` সহ, byte সাথে সাথে বেরিয়ে যায়। বেশিরভাগ Go web framework এটা expose করে।

**`r.Context().Done()`** client disconnect করলে (TCP RST, browser tab বন্ধ, navigation) fire করে। সবসময় এটার উপর select করুন। এটা ছাড়া, client চলে যাওয়ার পরও goroutine চিরকাল tick করতে থাকে।

## Browser client

```html
<!doctype html>
<html>
	<body>
		<pre id="log"></pre>
		<script>
			const log = document.getElementById('log');
			const es = new EventSource('/events');

			es.onopen = () => (log.textContent += 'connected\n');
			es.onerror = (e) => (log.textContent += `error / reconnect...\n`);

			es.addEventListener('tick', (e) => {
				log.textContent += `tick: ${e.data}\n`;
			});
		</script>
	</body>
</html>
```

`EventSource` আপনার জন্য তিনটা জিনিস করে:

1. **Auto-reconnect.** connection ড্রপ করলে, browser retry করে। Default backoff কয়েক সেকেন্ড; server `retry:` দিয়ে override করতে পারে।
2. **Last-Event-ID resumption.** reconnect-এ, browser `Last-Event-ID: <last-id-it-saw>` পাঠায়। server সেখান থেকে resume করতে পারে — নিচে দেখুন।
3. **Event routing.** `addEventListener("tick", cb)` শুধু `event: tick` সহ event-এর জন্য fire করে। Default হলো `"message"`।

## `Last-Event-ID` দিয়ে resumption

network যদি stream-এর মাঝপথে ড্রপ করে, browser সবচেয়ে সাম্প্রতিক `id:` যা দেখেছে সেটায় set করা `Last-Event-ID` header সহ reconnect করে। server তখন resume করতে পারে:

```go
lastID := r.Header.Get("Last-Event-ID")
if lastID != "" {
    // pull events from a buffer or DB starting after lastID
    for _, ev := range eventsAfter(lastID) {
        fmt.Fprintf(w, "id: %s\nevent: %s\ndata: %s\n\n", ev.ID, ev.Type, ev.JSON)
    }
    flusher.Flush()
}
// then continue with live events
```

এটা বিনামূল্যে at-least-once delivery, যতক্ষণ আপনি একটা event log রাখেন। Postgres + একটা `seq` column, Redis Streams, Kafka, যেকোনো append-only store কাজ করে।

WebSockets-এ এটা built in নেই। আপনি নিজে বানান। এখানে SSE জেতে।

## কখন SSE WebSockets-কে হারায়

- **One-way push** — protocol-টা যে কারণে আছে সেই পুরো কারণ।
- **সব জায়গায় HTTP middlebox।** Corporate proxy যা `Upgrade` header strip করে, CDN যা response buffer করে, প্রাচীন firewall — SSE পার হয়। WebSockets কখনো কখনো পারে না।
- **Auth আর routing infrastructure।** SSE শুধুই HTTP। আপনার বিদ্যমান rate limiter, auth middleware, observability, log forwarding, CDN — সব অপরিবর্তিতভাবে কাজ করে।
- **বিনামূল্যে reconnection।** `EventSource` backoff সহ retry করে আর `Last-Event-ID`-র মাধ্যমে resume করে। আপনি শূন্য client code লেখেন।
- **সহজ debugging।** `curl -N https://example.com/events` live stream দেখায়। কোনো `wscat` দরকার নেই।

## কখন WebSockets SSE-কে হারায়

- **Bidirectional.** SSE শুধু server-to-client। client পাঠানোর জন্য সাধারণ HTTP ব্যবহার করে।
- **Low-latency two-way।** client-to-server path একটা HTTP round-trip যোগ করে; chat-feel typing indicator-এর জন্য, latency জমে ওঠে।
- **Binary frame।** SSE text-only। Binary-র জন্য base64 লাগে — 33% overhead যোগ করে।
- **Browser limit.** Browser প্রতি origin-এ concurrent `EventSource` connection ~6-এ cap করে (HTTP/1.1 limit)। HTTP/2 এটা তুলে দেয়। WebSockets প্রতি origin-এ unlimited।

একটা "send command" button সহ একটা admin dashboard-এর জন্য, সঠিক shape প্রায়ই receive-এর জন্য SSE + পাঠানোর জন্য plain `fetch`। button `POST /actions` করে; dashboard SSE-র মাধ্যমে subscribe করে। দুটো protocol, দুটোই পরিচিত, কোনো WebSocket framing নেই।

<Callout type="tip">

**একটা সাধারণ প্যাটার্ন: read-এর জন্য SSE, write-এর জন্য REST।** browser live feed-এর জন্য একটা `EventSource` খোলে; user action হলো সাধারণ `fetch` call যা server process করে আর SSE-র মাধ্যমে ফেরত broadcast করে। WebSocket protocol-এর অর্ধেক, framing-এর জটিলতার কিছুই না।

</Callout>

## nginx-এর পেছনে SSE

দুটো nginx setting SSE-কে গড়ে বা ভাঙে।

```nginx
location /events {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;          # critical
    proxy_read_timeout 24h;       # long-lived
    add_header X-Accel-Buffering no;
}
```

**`proxy_buffering off`** nginx-কে একটা full buffer-এর মতো না হওয়া পর্যন্ত response আটকে রাখা থেকে বিরত রাখে। এটা ছাড়া, আপনার tick event জমে গিয়ে batch-এ পৌঁছায়।

**`proxy_read_timeout 24h`** connection-কে default 60 সেকেন্ডের চেয়ে বেশি বাঁচতে দেয়। SSE connection long হওয়ার কথা।

`X-Accel-Buffering: no` response header nginx-কে (আর কিছু CDN-কে) বলে "এই response buffer করবেন না", location block override না করলে।

## Heartbeat — keepalive comment

SSE-র কোনো protocol-level heartbeat নেই। middlebox-দের idle connection বন্ধ করা থেকে বিরত রাখতে, একটা periodic comment পাঠান:

```go
case <-keepalive.C:
    fmt.Fprint(w, ": keepalive\n\n")
    flusher.Flush()
```

`:` দিয়ে শুরু হওয়া line হলো comment। Browser এগুলো উপেক্ষা করে। প্রতি 15–30 সেকেন্ডে একটা পাঠান।

## Compression

SSE যেকোনো HTTP response-এর মতোই gzip থেকে উপকৃত হয়:

```nginx
location /events {
    gzip on;
    gzip_types text/event-stream;
    ...
}
```

JSON payload-এর জন্য, এটা bandwidth অর্ধেক করে। WebSockets-এর `permessage-deflate`-এর মতো, খরচ হলো CPU; chat-rate traffic-এর জন্য এটা বিনামূল্যে।

## SSE scaling

architectural shape WebSockets-এর মতোই:

- একটা process হাজার হাজার SSE connection ধরে রাখতে পারে (প্রতিটা একটা goroutine আর একটা TCP socket)।
- একাধিক process-এর অন্য process-এ connected client-দের fan out করতে একটা pub/sub bus দরকার।

চ্যাপ্টার 6 SSE আর WebSocket worker দুটোর জন্যই Redis pub/sub cover করে। প্যাটার্ন অভিন্ন — একই broker, একই fan-out, শুধু আলাদা per-client output (SSE `http.ResponseWriter`-এ লেখে, WebSocket `conn.Write`-এ লেখে)।

## AI/LLM streaming-এর জন্য SSE

একটা বাস্তব ক্ষেত্র যেখানে SSE প্রভাবশালী: streaming LLM response। ChatGPT, Claude, প্রতিটা LLM API SSE-র মাধ্যমে token delta stream করে। কেন:

- One-way push (model produce করে, client consume করে)।
- HTTP-native মানে এটা প্রতিটা proxy-র ভেতর দিয়ে কাজ করে।
- standard use case-এর সাথে নিখুঁতভাবে মানায়: প্রতিটা token একটা event।
- `Last-Event-ID` semantics "এই token থেকে resume"-এ map করে।

আপনি যদি একটা AI app বানান, model output channel-এর জন্য SSE প্রায় নিশ্চিতভাবে সঠিক পছন্দ।

## সাধারণ SSE bug

**1. Buffered output.** nginx-এ `proxy_buffering` off করা হয়নি, বা ভাষার HTTP framework flush করছে না। লক্ষণ: event live-এর বদলে batch-এ পৌঁছায়। Fix: explicit `Flush()` আর proxy config।

**2. disconnect-এ close করতে ভুলে যাওয়া।** handler একটা বন্ধ connection-এ লিখতেই থাকে কারণ `http.ResponseWriter.Write` error গিলে ফেলে। Fix: সবসময় `r.Context().Done()`-এর উপর select করুন।

**3. cross-origin SSE-র জন্য CORS।** browser CORS সম্মান করে। আপনার SSE endpoint যদি একটা আলাদা origin-এ থাকে, `Access-Control-Allow-Origin` set করুন।

**4. Unicode আর `data:` parser।** browser spec অনুযায়ী `\n`-এ split করে; multi-line `data:` payload-এর প্রতিটা line-এ prefix দরকার। JSON one-liner সমস্যাটা এড়ায়।

```go
// safe: one data line per event
fmt.Fprintf(w, "data: %s\n\n", string(jsonBytes))
```

## Recap

- SSE = `Content-Type: text/event-stream` সহ HTTP/1.1 streaming response।
- Wire format line-based: `data:`, `event:`, `id:`, `retry:`। একটা blank line একটা event শেষ করে।
- browser-এ `EventSource` বিনামূল্যে auto-reconnect আর `Last-Event-ID` resumption সামলায়।
- One-way push-এর জন্য, SSE সরলতা, ops আর middlebox compatibility-তে WebSockets-কে হারায়।
- Bidirectional, low-latency, বা binary-র জন্য, WebSockets জেতে।
- nginx: `proxy_buffering off`, long `proxy_read_timeout`, `X-Accel-Buffering no`।
- Heartbeat: প্রতি 15–30s-এ comment line (`:` prefix)।
- LLM streaming আর বেশিরভাগ "live updates" feature SSE-তে নিখুঁতভাবে মানায়।

পরবর্তী: [Pub/sub at scale](/notes/websockets/06-pubsub-scale) — Redis বা NATS দিয়ে অনেক WebSocket বা SSE worker process জুড়ে event fan out করা।
