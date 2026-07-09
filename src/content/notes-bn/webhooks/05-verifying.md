---
title: 'Signature verify করা'
subtitle: 'receiver-এর কাজ হলো raw body পড়া, HMAC পুনরায় গণনা করা, constant time-এ compare করা, আর replay window-এর চেয়ে পুরনো event reject করা। ছোট কোড, ভুল করা সহজ।'
chapter: 5
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['webhooks', 'hmac', 'verification', 'receiver', 'security']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

receiver হলো security boundary। আপনার URL-এ আসা প্রতিটা webhook যতক্ষণ না প্রমাণিত হয়, ততক্ষণ একটা সম্ভাব্য জালিয়াতি। এই অধ্যায়ে একটা Go receiver ship হয় যা signature সঠিকভাবে verify করে — আর সেই তিনটে classic bug ঘুরে দেখায় যা signing-কে security theatre-এ পরিণত করে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা signature verify করা অনেকটা একটা bouncer-এর মতো যে আপনার হাতের স্ট্যাম্প দরজার স্ট্যাম্পের সাথে মেলায় কিনা দেখে — স্ট্যাম্প প্রমাণ করে আপনি টাকা দিয়েছেন, কিন্তু কেবল যদি এটা জাল করা না যায়।

</Callout>

## গড়ন

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

এটাই পুরো verification flow: parse, replay window check, recompute, compare। ~৫০ লাইন।

## তিনটে classic bug

### ১. Framework body parsing-এর পরে verify করা

সবচেয়ে common verification bug। receiver-এর web framework আপনার handler চলার আগেই JSON body auto-parse করে। আপনার handler parsed object পড়ে সেটা verify করতে re-encode করে — আর signature কখনও মেলে না।

**ভুল:**

```go
func handler(w http.ResponseWriter, r *http.Request) {
    var event Event
    json.NewDecoder(r.Body).Decode(&event) // body consumed and parsed

    body, _ := json.Marshal(event) // <-- different bytes!
    if !verify(secret, sig, body) { ... }
}
```

re-encoded JSON মূলটার থেকে আলাদা — ভিন্ন whitespace, ভিন্ন field order, ভিন্ন unicode escape। ভিন্ন byte-এর HMAC = ভিন্ন signature।

**সঠিক:**

```go
func handler(w http.ResponseWriter, r *http.Request) {
    body, _ := io.ReadAll(io.LimitReader(r.Body, maxBody))
    if !verify(secret, sig, body) { ... }

    // only after verification, parse:
    var event Event
    json.Unmarshal(body, &event)
}
```

raw byte একবার পড়ুন, ওই byte-এর ওপর verify করুন, কেবল তারপরে parse করুন। Gin, Echo, Express, FastAPI-র মতো framework সবই body parse করে, যদি না আপনি তাদের না করতে বলেন। framework-এর "raw body" hook ব্যবহার করুন (`gin.Context.GetRawData`, Express-এ json parser-এর আগের middleware-এ `req.body`, FastAPI-তে `Request.body`)।

<Callout type="warn">

**আপনার verifier edit করে সে যে byte hash করে তা log করে টেস্ট করুন।** প্রথম integration-এ producer-এর byte আর receiver-এর byte পাশাপাশি print করুন। এক whitespace দিয়েও যদি কখনও আলাদা হয়, আপনার framework reformat করছে। verification নয়, framework ফিক্স করুন।

</Callout>

### ২. Constant-time compare-এর বদলে string comparison

```go
// WRONG — vulnerable to timing attack
if expectedHex == sigFromHeader {
    // accept
}
```

string-এ `==` প্রথম যে byte আলাদা সেখানে short-circuit করে। যে attacker অনেক অনুমানে response time মাপতে পারে, সে expected signature-এর prefix byte-by-byte শিখে ফেলে পুরোটা পাওয়া পর্যন্ত।

`hmac.Equal` (Go) আর `crypto.timingSafeEqual` (Node) **constant time**-এ compare করে — পার্থক্য যেখানেই থাক, একই সময়কাল।

```go
// RIGHT
if !hmac.Equal([]byte(expectedHex), []byte(sigFromHeader)) {
    return errBadSignature
}
```

যেকোনো cryptographic check-এর জন্য সবসময় platform-এর constant-time compare ব্যবহার করুন। কয়েক microsecond বেশির কোনো ছাড় নেই।

### ৩. Timestamp check বাদ দেওয়া

গণিতগতভাবে valid একটা signature প্রমাণ করে না event-টা সাম্প্রতিক। Replay attack valid-কিন্তু-পুরনো signed payload পাঠায়। timestamp window check ছাড়া, আপনার receiver প্রতিটা replay চিরকাল accept করে।

```go
if time.Since(ts) > replayWindow {
    return errStale
}
```

ভবিষ্যতের timestamp-ও সন্দেহজনক — clock drift করে, কিন্তু সাধারণত শুধু কয়েক মিনিট সামনে। ৩০ মিনিট ভবিষ্যতের একটা timestamp জালিয়াতি বা ভাঙা producer-এর ইঙ্গিত দেয়:

```go
if time.Until(ts) > 1*time.Minute {
    return errStale
}
```

দুই দিকেই টাইট বাউন্ড clock-skew abuse-এর বিরুদ্ধে রক্ষা করে। NTP আসল production host-কে true time-এর কয়েক সেকেন্ডের মধ্যে রাখে।

## Body size limit

একটা hard cap সহ পড়ুন। এটা ছাড়া, একটা attacker আপনার verifier-এ gigabyte stream করে memory শেষ করতে বা garbage collection storm ট্রিগার করতে পারে।

```go
body, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
```

সাধারণ webhook payload-এর জন্য 1 MiB উদার। আপনার producer বড় event পাঠালে বাড়ান; নাহলে cap টাইট রাখুন।

একটা HTTP server-এর জন্য, একটা `MaxHeaderBytes` আর connection timeout-ও set করুন:

```go
srv := &http.Server{
    Addr:              ":3000",
    Handler:           mux,
    ReadHeaderTimeout: 5 * time.Second,
    ReadTimeout:       30 * time.Second,
    MaxHeaderBytes:    8 << 10,
}
```

এগুলো verifier-এর বিরুদ্ধে slowloris-ধরনের abuse ঠেকায়।

## সঠিক status code return করা

আপনি কী return করেন তা গুরুত্বপূর্ণ, কারণ producer আপনার status code দিয়ে retry behaviour ঠিক করে।

**verification failure-এ (bad signature, malformed header):** `400 Bad Request` বা `401 Unauthorized`। producer একটা 4xx দেখে, তার retry policy অনুযায়ী permanent বা transient mark করে। signature-সংক্রান্ত 4xx-এর জন্য, **producer-এর retry করা উচিত নয়** — একই body আর signature দিয়ে retry কাজে দেবে না।

```go
if errors.Is(err, errBadSignature) {
    http.Error(w, "unauthorized", http.StatusUnauthorized) // permanent
    return
}
```

**internal processing failure-এ (DB down, ইত্যাদি):** `500 Internal Server Error`। producer retry করে।

```go
if err := process(body); err != nil {
    http.Error(w, "try again", http.StatusServiceUnavailable) // 503 also fine
    return
}
```

**success-এ:** `200 OK` (বা 204 No Content)। 2xx যেকোনো কিছুই acknowledgement।

একটা সূক্ষ্ম কিন্তু গুরুত্বপূর্ণ নিয়ম: **দ্রুত 200 return করুন**, ধীর কাজ করার আগে। producer-এর একটা timeout আছে (অধ্যায় ৩-এ ১০ সেকেন্ড ব্যবহার হয়েছিল)। আপনার handler process করতে বেশি সময় নিলে, producer হাল ছেড়ে retry করে — আর এখন আপনি একই event দুবার process করছেন।

ফিক্স:

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

webhook handler verification + enqueue করে। একটা আলাদা worker job process করে। Standard background-job pattern; path-এ পরে **Background jobs** track-এ কভার করা।

## একাধিক secret — key rotation

অধ্যায় ৪-এর v0/v1 rotation pattern সামলাতে, receiver header-এর প্রতিটা version চেষ্টা করে যতক্ষণ না একটা মেলে:

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

Customer-রা rotation-এর সময় পুরনো আর নতুন দুই secret-ই ধরে রাখতে পারে; যেকোনো একটা মেলে। migration-এর পরে পুরনোটা বাদ দিন।

## Fail closed

অজানা header, missing timestamp, malformed signature — এগুলো reject করাই default হোক। প্রতিটা check pass না করলে body কখনও accept করবেন না।

```go
if sigHeader == "" {
    return errMalformed // not "treat as unsigned"
}
```

Unsigned event কখনও `process()`-এ পৌঁছানো উচিত নয়। handler হলো security boundary; এর পরে কিছুই যেন কখনও unverified data process না করে।

## Verifier টেস্ট করা

প্রতিটা verifier-এর তিনটে test দরকার।

**১. Happy path।** একটা valid signed payload 200 return করে।

**২. Tampered body।** body-র একটা byte পরিবর্তন করুন, signature রাখুন, 401 আশা করুন।

```go
body[10] ^= 0x01 // flip a bit
// expect 401
```

**৩. Replay।** ১০ মিনিট পুরনো একটা timestamp ব্যবহার করুন, valid signature, 400 আশা করুন (stale)।

এই তিনটে এই অধ্যায়ের আগের bug-গুলো ধরে। CI-তে প্রতিটা push-এ এগুলো চলা উচিত।

## যা log করবেন

প্রতি request:

- **Success:** `webhook-received event_id=evt_... type=payment.succeeded ts=... dur=12ms`
- **Verify fail:** `webhook-rejected reason=bad-signature ip=10.0.0.5 type=...`

debug করার মতো যথেষ্ট log করুন ("কোন event? কোন producer IP?") কিন্তু **secret বা full signature কখনও log করবেন না** — দুটোই audit trail-এ যায় যা কেউ একসময় grep করতে পারে। signature একা কোনো credential নয়, কিন্তু সেটা log করা crypto material-এর ঢিলেঢালা handling-কে স্বাভাবিক করে তোলে।

## Multi-tenancy — সঠিক secret খোঁজা

আপনি এক URL-এ একাধিক subscription থেকে webhook পেলে, receiver-কে বের করতে হবে কোন secret ব্যবহার করবে। দুটো উপায়:

**A. URL-per-subscription।** `/webhooks/sub_42` path-এ subscription ID বহন করে। secret পেতে DB-তে lookup করুন।

**B. ID-in-body বা header।** producer `X-Webhook-Subscription`-এ বা event payload-এ একটা subscription ID অন্তর্ভুক্ত করে। verify করার আগে lookup করুন।

A পরিষ্কার: routing যেকোনো crypto-র আগে ঘটে। B আপনাকে verification-এর আগে body-র কিছু অংশ parse করতে বাধ্য করে, যা parse error log করলে info ফাঁস করতে পারে। A prefer করুন।

## রিক্যাপ

- Verifier: raw body পড়ুন, header parse করুন, replay-window check, HMAC recompute, constant-time compare।
- যেকোনো framework body parsing-এর **আগে** raw byte পড়ুন। re-encoded JSON signature ভাঙে।
- Platform-এর constant-time compare ব্যবহার করুন (`hmac.Equal`, `crypto.timingSafeEqual`)।
- Replay window: ~৫ মিনিট অতীত, ~১ মিনিট ভবিষ্যৎ। NTP চালান।
- Body size cap (1 MiB), header timeout, max header byte।
- verify fail-এ 4xx (no retry); internal fail-এ 5xx (retry)।
- দ্রুত 200 return করুন; ধীর কাজ একটা background queue-তে defer করুন।
- rotation-এর সময় একাধিক secret সমর্থন করুন (v0 + v1)।
- Fail closed: missing বা malformed = reject।
- Happy path, tampered body, stale timestamp টেস্ট করুন।

পরবর্তী: [Retries ও backoff](/notes/webhooks/06-retries) — কখন আবার চেষ্টা করবেন, কখন হাল ছাড়বেন, আর jitter সহ exponential pattern।
