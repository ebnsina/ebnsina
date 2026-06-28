---
title: 'Sending webhooks'
subtitle: 'End-to-end producer in Go in sixty lines. By the end you have a binary that POSTs JSON to a URL, handles non-2xx, and times out cleanly. Signing, retries, and the outbox come later.'
chapter: 3
level: 'beginner'
readingTime: '10 min'
topics: ['webhooks', 'go', 'http client', 'producer']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

This chapter ships a working webhook producer. Real Go code. We focus only on the _sending_ — signing in chapter 4, retries in chapter 6, the outbox pattern in chapter 10. By the end you have a tiny program that delivers an event to any URL and reports success or failure honestly.

<Callout type="info">

**Real-World Analogy**

Sending a webhook is like posting a certified letter — you send it, get a receipt, but the recipient confirms delivery separately.

</Callout>

## What you need

- Go 1.22+ (`go version`).
- A receiver — for now, **webhook.site** gives you a free public URL that displays incoming POSTs in a browser. We use that for testing.

```bash
mkdir webhook-sender && cd webhook-sender
go mod init example.com/webhook-sender
```

No dependencies for the basic sender. We will add `oklog/ulid/v2` for IDs.

```bash
go get github.com/oklog/ulid/v2
```

## The minimum viable sender

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

Refresh webhook.site — you see the POST, the headers, the JSON body. End-to-end.

That is roughly 60 lines for a working sender. The shape is universal: build an event, marshal, POST, check status, surface errors.

## What to read carefully

**`http.Client` with explicit `Timeout`.** The default Go HTTP client has _no timeout_. A receiver that accepts the connection and never responds will hang your sender forever. Always set one. 10 seconds is generous; 5 is more aggressive.

**`Transport` with idle conn pooling.** Reusing TCP connections to the same host avoids the handshake on each call. For a sender that delivers thousands of events to the same receiver, this is meaningful. For one event, irrelevant.

**`io.Copy(io.Discard, resp.Body)`.** A subtle Go gotcha: if you don't drain the response body, the connection cannot be reused from the pool. The library sees an in-progress response and opens a new connection next call. Always drain, even on success.

**Limited error body capture.** `io.LimitReader(resp.Body, 512)` reads at most 512 bytes from the error response. Without the limit, a buggy server returning megabytes of HTML could OOM your sender. Cap it.

**Context with timeout.** The client timeout is one safety net; the request context is another. Either firing aborts the call. Belt-and-braces.

## Choosing the timeout

Three tiers worth thinking through:

- **Connect timeout** — how long to wait for TCP+TLS to complete. ~3 seconds is plenty.
- **Request timeout** — total time including read. ~10 seconds covers most receivers.
- **Per-event budget** — for a worker queue, how long do you spend on one event before giving up and retrying later? ~30 seconds.

Go's `http.Client.Timeout` is the total request timeout. For separate connect/read timeouts, configure them on the `Transport`:

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

For most production senders, the simpler `Timeout: 10 * time.Second` on the client is enough.

## Distinguishing transient vs permanent failures

Not all failures should be retried. Receiver returns 410 Gone? The endpoint is dead; retrying does nothing. Returns 500? Probably transient — try again later.

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

A real classifier will be more nuanced (chapter 6 expands on retry semantics). The principle: 4xx is usually permanent (the payload itself is the problem); 5xx and network errors are transient.

<Callout type="warn">

**Be conservative about marking errors permanent.** A 404 from a misconfigured receiver looks the same as a 404 from a dead endpoint. If you delete events too eagerly, customers find their integration broken with no recourse. When in doubt, retry.

</Callout>

## What to log

Per delivery attempt, structured log:

```
webhook-deliver event_id=evt_... type=payment.succeeded url=https://... status=200 dur=243ms
webhook-deliver event_id=evt_... type=payment.succeeded url=https://... status=502 dur=11s err="non-2xx"
```

The fields:

- **`event_id`** — for grepping all attempts at a single event.
- **`type`** — for per-type metrics.
- **`url`** — for per-receiver metrics. Strip query strings if they contain secrets.
- **`status`** + **`dur`** — for latency and error tracking.
- **`err`** — short error description; full stack trace at debug level only.

This becomes the foundation of the observability pipeline (chapter 9).

## Test locally with smee.io or ngrok

Before pointing the sender at production receivers, test locally:

**ngrok** — exposes a local port to the internet via a tunnel.

```bash
ngrok http 3000
# https://abc123.ngrok-free.app -> http://localhost:3000
```

Run a Go receiver on port 3000 that prints incoming requests. Set `WEBHOOK_URL=https://abc123.ngrok-free.app/webhooks` and watch them flow.

**smee.io** — free public webhook proxy. Visit smee.io, get a URL, point your sender at it, run `smee --url <url> --target http://localhost:3000` to forward.

Both are dev-only tools. In production the receiver runs on a public URL.

## Sending many events — work pool

The single-event sender becomes a multi-event worker by adding a queue and N goroutines:

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

16 workers can sustain ~1500 deliveries/sec to a single fast receiver, less for slow ones. Tune by measurement; don't over-parallelise to a single receiver (you'll trip rate limits).

The full picture — durable queue, retries, dead-letter — comes in later chapters. For now the takeaway is: scaling out is goroutines plus a channel.

## Sending to many receivers

If five customers subscribe to the same event, you fan out:

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

Each subscription becomes one delivery attempt. Five subscribers = five POSTs. Chapter 8 covers per-subscription failure handling — one customer's broken endpoint shouldn't slow down delivery to the others.

## What we have not done yet

This sender:

- Does not sign payloads. Anyone who knows the URL can forge events. **Chapter 4.**
- Does not retry. One transient failure and the event is gone. **Chapter 6.**
- Does not persist outbound events. A crash mid-send loses them. **Chapter 10.**
- Does not have a dashboard. Operators cannot see what failed. **Chapter 9.**

That's most of a real system. But knowing how the basic POST works first means each subsequent layer has a clear "what problem does this solve."

## Recap

- Sender is a POST with JSON body, signed in chapter 4, retried in chapter 6.
- `http.Client` with a real `Timeout` — defaults are dangerous.
- Drain response bodies (`io.Copy(io.Discard, ...)`) so TCP connections reuse.
- Classify failures: 4xx mostly permanent, 5xx and network mostly transient.
- Be conservative about "permanent" — retrying twice extra is cheaper than dropping the event.
- Log every attempt with event ID, type, URL, status, duration, error.
- Test locally with ngrok or smee.io.
- Scale via worker pool over a channel; fan out per subscription.
- Sign, retry, persist, dashboard — coming next.

Next: [Signing payloads](/notes/webhooks/04-signing) — HMAC, the canonical string, and timestamps that defend against replay.
