---
title: 'Verifying signatures'
subtitle: "The receiver's job is to read the raw body, recompute the HMAC, compare in constant time, and reject events older than the replay window. Tiny code, easy to get wrong."
chapter: 5
level: 'intermediate'
readingTime: '11 min'
topics: ['webhooks', 'hmac', 'verification', 'receiver', 'security']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

The receiver is the security boundary. Every webhook arriving at your URL is a potential forgery until proven otherwise. This chapter ships a Go receiver that verifies signatures correctly — and walks through the three classic bugs that turn signing into security theatre.

<Callout type="info">

**Real-World Analogy**

Verifying a signature is like a bouncer checking a stamp on your hand matches the one from the door — the stamp proves you paid, but only if it can't be faked.

</Callout>

## The shape

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "io"
    "log"
    "net/http"
    "strconv"
    "strings"
    "time"
)

const (
    replayWindow = 5 * time.Minute
    maxBody      = 1 << 20 // 1 MiB
)

func verify(secret []byte, sigHeader string, body []byte) error {
    // parse header: t=...,v1=...
    var tsStr, sig string
    for _, part := range strings.Split(sigHeader, ",") {
        kv := strings.SplitN(part, "=", 2)
        if len(kv) != 2 {
            continue
        }
        switch kv[0] {
        case "t":
            tsStr = kv[1]
        case "v1":
            sig = kv[1]
        }
    }
    if tsStr == "" || sig == "" {
        return errMalformed
    }

    tsInt, err := strconv.ParseInt(tsStr, 10, 64)
    if err != nil {
        return errMalformed
    }
    ts := time.Unix(tsInt, 0)

    // replay window check
    if time.Since(ts) > replayWindow || time.Until(ts) > 1*time.Minute {
        return errStale
    }

    // recompute HMAC
    h := hmac.New(sha256.New, secret)
    h.Write([]byte(tsStr))
    h.Write([]byte("."))
    h.Write(body)
    expected := h.Sum(nil)

    expectedHex := hex.EncodeToString(expected)
    if !hmac.Equal([]byte(expectedHex), []byte(sig)) {
        return errBadSignature
    }
    return nil
}

var (
    errMalformed    = httpErr{http.StatusBadRequest, "malformed signature"}
    errStale        = httpErr{http.StatusBadRequest, "timestamp outside replay window"}
    errBadSignature = httpErr{http.StatusUnauthorized, "signature mismatch"}
)

type httpErr struct {
    Code    int
    Message string
}

func (e httpErr) Error() string { return e.Message }

func handler(secret []byte) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        body, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
        if err != nil {
            http.Error(w, "read", http.StatusBadRequest)
            return
        }

        if err := verify(secret, r.Header.Get("X-Webhook-Signature"), body); err != nil {
            log.Printf("verify failed: %v from %s", err, r.RemoteAddr)
            if he, ok := err.(httpErr); ok {
                http.Error(w, he.Message, he.Code)
                return
            }
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }

        // verified — hand off to the application
        if err := process(body); err != nil {
            http.Error(w, "internal", http.StatusInternalServerError)
            return
        }
        w.WriteHeader(http.StatusOK)
    }
}
```

That is the entire verification flow: parse, check replay window, recompute, compare. ~50 lines.

## The three classic bugs

### 1. Verifying after framework body parsing

The single most common verification bug. The receiver's web framework auto-parses the JSON body before your handler runs. Your handler reads the parsed object and re-encodes it to verify — and the signature never matches.

**Wrong:**

```go
func handler(w http.ResponseWriter, r *http.Request) {
    var event Event
    json.NewDecoder(r.Body).Decode(&event) // body consumed and parsed

    body, _ := json.Marshal(event) // <-- different bytes!
    if !verify(secret, sig, body) { ... }
}
```

The re-encoded JSON differs from the original — different whitespace, different field order, different unicode escapes. HMAC of different bytes = different signature.

**Right:**

```go
func handler(w http.ResponseWriter, r *http.Request) {
    body, _ := io.ReadAll(io.LimitReader(r.Body, maxBody))
    if !verify(secret, sig, body) { ... }

    // only after verification, parse:
    var event Event
    json.Unmarshal(body, &event)
}
```

Read the raw bytes once, verify on those bytes, parse only after. Frameworks like Gin, Echo, Express, FastAPI all parse the body unless you tell them not to. Use the framework's "raw body" hook (`gin.Context.GetRawData`, `req.body` in Express middleware before json parser, `Request.body` in FastAPI).

<Callout type="warn">

**Test by editing your verifier to log the bytes it hashes.** Print the producer's bytes and the receiver's bytes side by side on the first integration. If they ever differ, even by one whitespace, your framework is reformatting. Fix the framework, not the verification.

</Callout>

### 2. String comparison instead of constant-time compare

```go
// WRONG — vulnerable to timing attack
if expectedHex == sigFromHeader {
    // accept
}
```

`==` on strings short-circuits on the first byte that differs. An attacker who can measure response time across many guesses learns the prefix of the expected signature byte-by-byte until they have the whole thing.

`hmac.Equal` (Go) and `crypto.timingSafeEqual` (Node) compare in **constant time** — same duration regardless of where the difference is.

```go
// RIGHT
if !hmac.Equal([]byte(expectedHex), []byte(sigFromHeader)) {
    return errBadSignature
}
```

Always use the platform's constant-time compare for any cryptographic check. The few extra microseconds are not negotiable.

### 3. Skipping the timestamp check

A signature that's mathematically valid does not prove the event is recent. Replay attacks send valid-but-old signed payloads. Without the timestamp window check, your receiver accepts every replay forever.

```go
if time.Since(ts) > replayWindow {
    return errStale
}
```

Future timestamps are also suspicious — clocks drift, but only forward by minutes typically. A timestamp 30 minutes in the future suggests forgery or a broken producer:

```go
if time.Until(ts) > 1*time.Minute {
    return errStale
}
```

Tight bounds on both sides protect against clock-skew abuse. NTP keeps real production hosts within seconds of true time.

## Body size limits

Read with a hard cap. Without it, an attacker can stream gigabytes at your verifier and starve memory or trigger garbage collection storms.

```go
body, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
```

1 MiB is generous for typical webhook payloads. If your producer sends bigger events, raise it; otherwise leave the cap tight.

For an HTTP server, also set a `MaxHeaderBytes` and connection timeouts:

```go
srv := &http.Server{
    Addr:              ":3000",
    Handler:           mux,
    ReadHeaderTimeout: 5 * time.Second,
    ReadTimeout:       30 * time.Second,
    MaxHeaderBytes:    8 << 10,
}
```

These prevent slowloris-style abuse against the verifier.

## Returning correct status codes

What you return matters because the producer uses your status code to decide retry behaviour.

**On verification failure (bad signature, malformed header):** `400 Bad Request` or `401 Unauthorized`. The producer sees a 4xx, marks permanent or transient based on its retry policy. For signature-related 4xx, **the producer must not retry** — retrying with the same body and signature won't help.

```go
if errors.Is(err, errBadSignature) {
    http.Error(w, "unauthorized", http.StatusUnauthorized) // permanent
    return
}
```

**On internal processing failure (DB down, etc.):** `500 Internal Server Error`. The producer retries.

```go
if err := process(body); err != nil {
    http.Error(w, "try again", http.StatusServiceUnavailable) // 503 also fine
    return
}
```

**On success:** `200 OK` (or 204 No Content). Anything 2xx is acknowledgement.

A subtle but important rule: **return 200 quickly**, before doing slow work. The producer has a timeout (chapter 3 used 10 seconds). If your handler takes longer to process, the producer gives up and retries — and now you're processing the same event twice.

The fix:

```go
func handler(...) {
    if err := verify(...); err != nil { ... }

    // enqueue to your local job system; return 200 immediately
    if err := jobs.Enqueue(body); err != nil {
        http.Error(w, "queue", http.StatusServiceUnavailable)
        return
    }
    w.WriteHeader(http.StatusOK)
}
```

The webhook handler does verification + enqueue. A separate worker processes the job. Standard background-job pattern; covered in **Background jobs** track later in the path.

## Multiple secrets — key rotation

To handle the v0/v1 rotation pattern from chapter 4, the receiver tries each version in the header until one matches:

```go
func verify(secrets []KeyedSecret, sigHeader string, body []byte) error {
    parts := parseSig(sigHeader)
    ts := parseTimestamp(parts["t"])
    if isStale(ts) {
        return errStale
    }

    for _, s := range secrets {
        sig := parts[s.Version] // "v1" or "v0"
        if sig == "" {
            continue
        }
        if matches(s.Secret, parts["t"], body, sig) {
            return nil
        }
    }
    return errBadSignature
}

type KeyedSecret struct {
    Version string // "v1", "v0"
    Secret  []byte
}
```

Customers can hold both old and new secrets during rotation; either matches. After migration, drop the old.

## Failing closed

Default to rejecting unknown headers, missing timestamps, malformed signatures. Never accept the body unless every check passes.

```go
if sigHeader == "" {
    return errMalformed // not "treat as unsigned"
}
```

Unsigned events should never reach `process()`. The handler is the security boundary; nothing past it should ever process unverified data.

## Testing the verifier

Three tests every verifier needs.

**1. Happy path.** A valid signed payload returns 200.

**2. Tampered body.** Modify a byte of the body, keep the signature, expect 401.

```go
body[10] ^= 0x01 // flip a bit
// expect 401
```

**3. Replay.** Use a timestamp 10 minutes old, valid signature, expect 400 (stale).

These three catch the bugs from earlier in this chapter. CI should run them every push.

## What to log

Per request:

- **Success:** `webhook-received event_id=evt_... type=payment.succeeded ts=... dur=12ms`
- **Verify fail:** `webhook-rejected reason=bad-signature ip=10.0.0.5 type=...`

Log enough to debug ("which event? which producer IP?") but **never log the secret or the full signature** — both go in audit trails that someone may eventually grep. The signature alone is not a credential, but logging it normalises sloppy handling of crypto material.

## Multi-tenancy — finding the right secret

If you receive webhooks from multiple subscriptions on one URL, the receiver must figure out which secret to use. Two approaches:

**A. URL-per-subscription.** `/webhooks/sub_42` carries the subscription ID in the path. Look it up in your DB to get the secret.

**B. ID-in-body or header.** Producer includes a subscription ID in `X-Webhook-Subscription` or in the event payload. Look it up before verifying.

A is cleaner: routing happens before any crypto. B forces you to parse some of the body before verification, which can leak info if you log parse errors. Prefer A.

## Recap

- Verifier: read raw body, parse header, replay-window check, recompute HMAC, constant-time compare.
- Read raw bytes **before** any framework body parsing. Re-encoded JSON breaks signatures.
- Use platform constant-time compare (`hmac.Equal`, `crypto.timingSafeEqual`).
- Replay window: ~5 minutes past, ~1 minute future. Run NTP.
- Body size cap (1 MiB), header timeouts, max header bytes.
- 4xx on verify fail (no retry); 5xx on internal fail (retry).
- Return 200 fast; defer slow work to a background queue.
- Support multiple secrets during rotation (v0 + v1).
- Fail closed: missing or malformed = reject.
- Test happy path, tampered body, stale timestamp.

Next: [Retries and backoff](/notes/webhooks/06-retries) — when to try again, when to give up, and the exponential-with-jitter pattern.
