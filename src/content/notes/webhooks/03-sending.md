---
title: 'Webhooks পাঠানো'
subtitle: 'Go-তে ষাট লাইনে end-to-end producer। শেষে আপনার হাতে একটা binary থাকবে যা একটা URL-এ JSON POST করে, non-2xx সামলায়, আর পরিষ্কারভাবে timeout করে। Signing, retries, আর outbox পরে আসছে।'
chapter: 3
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['webhooks', 'go', 'http client', 'producer']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

এই অধ্যায়ে একটা কাজ করা webhook producer ship হয়। আসল Go কোড। আমরা শুধু _পাঠানোর_ দিকে মন দিই — অধ্যায় ৪-এ signing, অধ্যায় ৬-এ retries, অধ্যায় ১০-এ outbox pattern। শেষে আপনার হাতে একটা ছোট program থাকবে যা যেকোনো URL-এ event deliver করে আর সততার সাথে success বা failure রিপোর্ট করে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা webhook পাঠানো অনেকটা একটা registered চিঠি পোস্ট করার মতো — আপনি পাঠান, একটা receipt পান, কিন্তু প্রাপক আলাদাভাবে delivery নিশ্চিত করে।

</Callout>

## গল্পে বুঝি

ফাতিমা একটা কুরিয়ার অফিস চালান। সিনার নামে একটা জরুরি নোটিশ-স্লিপ এসেছে, আর তাঁর খাতায় লেখা আছে সিনার রেজিস্টার্ড করা ঠিকানা — কোন গলি, কোন বাড়ি। ফাতিমা একজন রানারের হাতে স্লিপটা তুলে দেন। রানার সেই ঠিকানায় হেঁটে যায়, দরজায় গিয়ে কড়া নাড়ে, আর একটা নিয়ম মেনে চলে — একটা যুক্তিসংগত সময় দাঁড়িয়ে অপেক্ষা করবে, তার বেশি নয়।

সকালে সিনা নিজেই দরজা খুললেন, স্লিপ নিলেন, আর রিসিট-বইয়ে সই করে দিলেন — রানার খুশিমনে ফিরে গিয়ে "ডেলিভার্ড" লিখল। কিন্তু পরদিন খোয়ারিজমির ঠিকানায় গিয়ে দেখা গেল অন্য চিত্র: একবার এত ডাকাডাকির পরও ভেতর থেকে কেউ সাড়া দিল না, রানার নির্দিষ্ট সময় দাঁড়িয়ে থেকে ফিরে এল; আরেকবার ঠিকানাটাই ভুল বেরোল, বাড়ির লোক স্লিপ নিতে সাফ মানা করে দিল। দুই ক্ষেত্রেই রানার খাতায় "ব্যর্থ চেষ্টা — পরে আবার" টুকে রাখল।

গল্পটা হুবহু webhook পাঠানো। রানারের স্লিপ নিয়ে রেজিস্টার্ড ঠিকানায় হেঁটে যাওয়া = provider-এর subscriber-এর URL-এ payload নিয়ে POST করা; সিনার সই করে নেওয়া = একটা 2xx success response, মানে ডেলিভার্ড; নির্দিষ্ট সময়ে কেউ সাড়া না দেওয়া = timeout; আর ভুল বা মানা-করা ঠিকানা = non-2xx failure — timeout আর non-2xx দুটোই retry-র জন্য চিহ্নিত। বাস্তবেও তাই: Stripe বা GitHub আপনার event পাঠানোর সময় ঠিক এভাবেই একটা timeout সেট করে POST করে, 2xx পেলে সফল ধরে, না পেলে পরে backoff দিয়ে আবার চেষ্টা করে।

## যা যা লাগবে

- Go 1.22+ (`go version`)।
- একটা receiver — আপাতত, **webhook.site** আপনাকে একটা free public URL দেয় যা browser-এ আসা POST দেখায়। আমরা টেস্টিংয়ের জন্য সেটা ব্যবহার করি।

```bash
mkdir webhook-sender && cd webhook-sender
go mod init example.com/webhook-sender
```

Basic sender-এর জন্য কোনো dependency নেই। আমরা ID-র জন্য `oklog/ulid/v2` যোগ করব।

```bash
go get github.com/oklog/ulid/v2
```

## Minimum viable sender

```go
// sender.go
package main

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "log"
    "net/http"
    "os"
    "time"

    "github.com/oklog/ulid/v2"
)

type Event struct {
    ID         string          `json:"id"`
    Type       string          `json:"type"`
    Created    time.Time       `json:"created"`
    APIVersion string          `json:"api_version"`
    Data       json.RawMessage `json:"data"`
}

func newEvent(typ string, payload any) (*Event, error) {
    data, err := json.Marshal(map[string]any{"object": payload})
    if err != nil {
        return nil, err
    }
    return &Event{
        ID:         "evt_" + ulid.Make().String(),
        Type:       typ,
        Created:    time.Now().UTC(),
        APIVersion: "2026-05-01",
        Data:       data,
    }, nil
}

var httpClient = &http.Client{
    Timeout: 10 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
    },
}

func send(ctx context.Context, url string, ev *Event) error {
    body, err := json.Marshal(ev)
    if err != nil {
        return fmt.Errorf("marshal: %w", err)
    }

    req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
    if err != nil {
        return err
    }
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("User-Agent", "myapp-webhooks/1.0")
    req.Header.Set("X-Webhook-ID", ev.ID)
    req.Header.Set("X-Webhook-Type", ev.Type)
    req.Header.Set("X-Webhook-Timestamp", fmt.Sprintf("%d", ev.Created.Unix()))

    resp, err := httpClient.Do(req)
    if err != nil {
        return fmt.Errorf("post: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode < 200 || resp.StatusCode >= 300 {
        snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
        return fmt.Errorf("non-2xx: %d %s body=%q", resp.StatusCode, resp.Status, snippet)
    }
    io.Copy(io.Discard, resp.Body) // drain so connection is reusable
    return nil
}

func main() {
    url := os.Getenv("WEBHOOK_URL")
    if url == "" {
        log.Fatal("set WEBHOOK_URL")
    }

    ev, err := newEvent("payment.succeeded", map[string]any{
        "id":       "py_" + ulid.Make().String(),
        "amount":   4200,
        "currency": "usd",
        "customer": "cus_42",
    })
    if err != nil {
        log.Fatal(err)
    }

    ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
    defer cancel()

    if err := send(ctx, url, ev); err != nil {
        log.Fatalf("send: %v", err)
    }
    log.Printf("delivered %s", ev.ID)
}
```

```bash
WEBHOOK_URL=https://webhook.site/your-id-here go run .
# 2026/05/04 12:00:01 delivered evt_01HF5J7XK4TG6N2VRT9P0M3DZ4
```

webhook.site refresh করুন — আপনি POST, header, JSON body দেখতে পাবেন। End-to-end।

একটা কাজ করা sender-এর জন্য এটা মোটামুটি ৬০ লাইন। গড়নটা সর্বজনীন: একটা event বানাও, marshal করো, POST করো, status check করো, error surface করো।

## যা মন দিয়ে পড়বেন

**explicit `Timeout` সহ `http.Client`।** Go-র default HTTP client-এর _কোনো timeout নেই_। যে receiver connection accept করে অথচ কখনও response দেয় না, সে আপনার sender-কে চিরকাল ঝুলিয়ে রাখবে। সবসময় একটা set করুন। ১০ সেকেন্ড উদার; ৫ আরও aggressive।

**idle conn pooling সহ `Transport`।** একই host-এ TCP connection reuse করলে প্রতি call-এ handshake এড়ানো যায়। যে sender একই receiver-এ হাজার হাজার event deliver করে, তার জন্য এটা অর্থবহ। একটা event-এর জন্য অপ্রাসঙ্গিক।

**`io.Copy(io.Discard, resp.Body)`।** একটা সূক্ষ্ম Go gotcha: response body drain না করলে pool থেকে connection reuse করা যায় না। library একটা in-progress response দেখে আর পরের call-এ একটা নতুন connection খোলে। সবসময় drain করুন, success-এও।

**সীমিত error body capture।** `io.LimitReader(resp.Body, 512)` error response থেকে সর্বোচ্চ 512 byte পড়ে। limit ছাড়া, একটা buggy server megabyte-খানেক HTML ফেরত দিলে আপনার sender OOM হতে পারে। Cap করুন।

**timeout সহ Context।** client timeout একটা safety net; request context আরেকটা। যেকোনো একটা trigger হলে call abort হয়। Belt-and-braces।

## Timeout বেছে নেওয়া

তিন tier ভেবে দেখার মতো:

- **Connect timeout** — TCP+TLS complete হতে কতক্ষণ অপেক্ষা। ~৩ সেকেন্ডই যথেষ্ট।
- **Request timeout** — read সহ মোট সময়। ~১০ সেকেন্ড বেশিরভাগ receiver কভার করে।
- **Per-event budget** — একটা worker queue-এর জন্য, একটা event-এ কতক্ষণ কাটিয়ে হাল ছেড়ে পরে retry করবেন? ~৩০ সেকেন্ড।

Go-র `http.Client.Timeout` হলো মোট request timeout। আলাদা connect/read timeout-এর জন্য, সেগুলো `Transport`-এ configure করুন:

```go
&http.Transport{
    DialContext: (&net.Dialer{
        Timeout:   3 * time.Second,
        KeepAlive: 30 * time.Second,
    }).DialContext,
    ResponseHeaderTimeout: 5 * time.Second,
    ExpectContinueTimeout: 1 * time.Second,
}
```

বেশিরভাগ production sender-এর জন্য, client-এ সরল `Timeout: 10 * time.Second`-ই যথেষ্ট।

## Transient vs permanent failure আলাদা করা

সব failure retry করা উচিত না। receiver 410 Gone return করল? endpoint মৃত; retry করে কিছু হয় না। 500 return করল? সম্ভবত transient — পরে আবার চেষ্টা করুন।

```go
type DeliveryResult struct {
    StatusCode int
    Err        error
    Permanent  bool
}

func classify(statusCode int, err error) DeliveryResult {
    res := DeliveryResult{StatusCode: statusCode, Err: err}
    if err != nil {
        // network errors are transient by default
        return res
    }
    switch statusCode {
    case 410, 401, 403, 404:
        // gone, unauthorized, forbidden, not found
        res.Permanent = true
    case 400, 422:
        // bad request — payload is wrong, no retry will fix it
        res.Permanent = true
    }
    return res
}
```

একটা আসল classifier আরও সূক্ষ্ম হবে (অধ্যায় ৬ retry semantics বিস্তারিত করে)। মূল নীতি: 4xx সাধারণত permanent (payload নিজেই সমস্যা); 5xx আর network error transient।

<Callout type="warn">

**error-কে permanent হিসেবে mark করায় রক্ষণশীল হোন।** একটা misconfigured receiver থেকে আসা 404 আর একটা মৃত endpoint থেকে আসা 404 একই দেখতে। আপনি খুব আগ্রহভরে event delete করলে customer-রা তাদের integration ভাঙা অবস্থায় পায়, কোনো উপায় ছাড়াই। সন্দেহ হলে, retry করুন।

</Callout>

## যা log করবেন

প্রতিটা delivery attempt-এ, structured log:

```
webhook-deliver event_id=evt_... type=payment.succeeded url=https://... status=200 dur=243ms
webhook-deliver event_id=evt_... type=payment.succeeded url=https://... status=502 dur=11s err="non-2xx"
```

field-গুলো:

- **`event_id`** — একটা event-এর সব attempt grep করার জন্য।
- **`type`** — per-type metric-এর জন্য।
- **`url`** — per-receiver metric-এর জন্য। query string secret ধারণ করলে সেগুলো strip করুন।
- **`status`** + **`dur`** — latency আর error tracking-এর জন্য।
- **`err`** — সংক্ষিপ্ত error বর্ণনা; পূর্ণ stack trace শুধু debug level-এ।

এটাই observability pipeline-এর ভিত্তি হয়ে দাঁড়ায় (অধ্যায় ৯)।

## smee.io বা ngrok দিয়ে লোকালে টেস্ট করুন

sender-কে production receiver-এর দিকে তাক করার আগে, লোকালে টেস্ট করুন:

**ngrok** — একটা tunnel দিয়ে একটা local port-কে internet-এ expose করে।

```bash
ngrok http 3000
# https://abc123.ngrok-free.app -> http://localhost:3000
```

port 3000-এ একটা Go receiver চালান যা আসা request print করে। `WEBHOOK_URL=https://abc123.ngrok-free.app/webhooks` set করুন আর সেগুলো বয়ে আসতে দেখুন।

**smee.io** — free public webhook proxy। smee.io-তে যান, একটা URL নিন, আপনার sender-কে সেটার দিকে তাক করুন, forward করার জন্য `smee --url <url> --target http://localhost:3000` চালান।

দুটোই dev-only tool। Production-এ receiver একটা public URL-এ চলে।

## অনেক event পাঠানো — work pool

একটা queue আর N goroutine যোগ করলে single-event sender একটা multi-event worker হয়ে যায়:

```go
func worker(ctx context.Context, jobs <-chan Job) {
    for job := range jobs {
        if err := send(ctx, job.URL, job.Event); err != nil {
            log.Printf("[%s] send failed: %v", job.Event.ID, err)
            // chapter 6 will add: requeue with backoff
            continue
        }
    }
}

func main() {
    jobs := make(chan Job, 1000)
    for i := 0; i < 16; i++ {
        go worker(ctx, jobs)
    }
    // producers push to jobs
}
```

16 worker একটা fast receiver-এ ~1500 deliveries/sec টানতে পারে, ধীর receiver-এ কম। মেপে tune করুন; একটা receiver-এ অতিরিক্ত parallelise করবেন না (rate limit-এ ঠোক্কর খাবেন)।

পূর্ণ ছবিটা — durable queue, retries, dead-letter — পরের অধ্যায়গুলোতে আসে। আপাতত মূল কথা: scale out করা মানে goroutine প্লাস একটা channel।

## অনেক receiver-এ পাঠানো

পাঁচজন customer একই event-এ subscribe করলে, আপনি fan out করেন:

```go
for _, sub := range subscriptions {
    select {
    case jobs <- Job{URL: sub.URL, Event: ev}:
    default:
        log.Printf("queue full")
        // back-pressure or drop
    }
}
```

প্রতিটা subscription একটা delivery attempt হয়ে দাঁড়ায়। পাঁচ subscriber = পাঁচটা POST। অধ্যায় ৮ per-subscription failure handling কভার করে — একজন customer-এর ভাঙা endpoint বাকিদের delivery ধীর করবে না।

## এখনও যা করিনি

এই sender:

- payload sign করে না। URL জানা যে কেউ event জাল করতে পারে। **অধ্যায় ৪।**
- retry করে না। একটা transient failure আর event গায়েব। **অধ্যায় ৬।**
- outbound event persist করে না। পাঠানোর মাঝপথে crash হলে হারায়। **অধ্যায় ১০।**
- এর কোনো dashboard নেই। কী fail করল operator দেখতে পারে না। **অধ্যায় ৯।**

এটাই একটা আসল সিস্টেমের বেশিরভাগ অংশ। কিন্তু আগে basic POST কীভাবে কাজ করে জানলে পরের প্রতিটা layer-এর একটা পরিষ্কার "এটা কোন সমস্যা সমাধান করে" থাকে।

## রিক্যাপ

- Sender হলো JSON body সহ একটা POST, অধ্যায় ৪-এ signed, অধ্যায় ৬-এ retried।
- একটা আসল `Timeout` সহ `http.Client` — default বিপজ্জনক।
- response body drain করুন (`io.Copy(io.Discard, ...)`) যাতে TCP connection reuse হয়।
- Failure classify করুন: 4xx বেশিরভাগ permanent, 5xx আর network বেশিরভাগ transient।
- "permanent" নিয়ে রক্ষণশীল হোন — দুবার বেশি retry করা event drop করার চেয়ে সস্তা।
- প্রতিটা attempt event ID, type, URL, status, duration, error সহ log করুন।
- ngrok বা smee.io দিয়ে লোকালে টেস্ট করুন।
- একটা channel-এর ওপর worker pool দিয়ে scale করুন; per subscription fan out করুন।
- Sign, retry, persist, dashboard — পরে আসছে।

পরবর্তী: [Payload signing](/notes/webhooks/04-signing) — HMAC, canonical string, আর replay-এর বিরুদ্ধে রক্ষা করা timestamp।
