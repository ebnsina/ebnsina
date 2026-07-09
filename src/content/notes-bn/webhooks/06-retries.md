---
title: 'Retries ও backoff'
subtitle: 'একবার fail হওয়া delivery স্বাভাবিক। একটা hot loop-এ দশবার fail হওয়া delivery আপনার আর আপনার customer-এর service নামিয়ে দেয়। jitter সহ exponential backoff আর একটা hard deadline-ই হলো সরল, সঠিক সমাধান।'
chapter: 6
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['webhooks', 'retries', 'backoff', 'jitter', 'deadlines']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা network drop করে। একটা receiver restart করে। একটা database lock ধরে রাখে। এর কোনোটাই মানে না "customer আর এই event চায় না" — এগুলো মানে "পরে আবার চেষ্টা করো।" Webhooks-এর এমন retry semantics দরকার যা transient failure থেকে recover করে কিন্তু কখনও একটা hot loop-এ অবনতি ঘটায় না।

এই অধ্যায়টা হলো algorithm আর parameter। বাস্তবের যেসব producer এটা ভুল করে তারা নিজেদের customer-কে DDoS করে; যারা ঠিক করে তারা delivery issue-র জন্য প্রায় কখনও কাউকে page করে না।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা fail হওয়া webhook retry করা অনেকটা একটা voicemail রেখে তারা না ধরলে আবার ফোন করার মতো — এক ring-এই আপনি হাল ছাড়েন না।

</Callout>

## কী retry দরকার

তিন পরিবারের failure, প্রতিটার নিজস্ব retry policy।

**১. Transient failure — retry।**

- Network error: timeout, connection refused, DNS failure।
- receiver `5xx` return করে (server error)।
- receiver `429` return করে (rate limited; সাধারণত `Retry-After` সহ)।
- receiver `408` return করে (request timeout)।

এগুলো "পরে আবার চেষ্টা করো" — failure-টা payload নিয়ে নয়।

**২. Permanent failure — retry করবেন না।**

- receiver `400` বা `422` return করে (payload malformed; একই payload দিয়ে আরেকবার চেষ্টা কাজে দেবে না)।
- receiver `401` বা `403` return করে (auth failed; secret ভুল, config ঠিক করুন)।
- receiver `410` return করে (endpoint চলে গেছে; customer-কে জানান)।

**৩. Ambiguous — রক্ষণশীলভাবে retry।**

- receiver `404` return করে। এটা একটা misconfigured URL হতে পারে (transient — তারা ঠিক করে) বা একটা মৃত endpoint (permanent)। কিছুক্ষণ retry করুন; একসময় escalate করুন।

```go
func classify(statusCode int, err error) Decision {
    if err != nil {
        return Decision{Retry: true} // network error: retry
    }
    switch {
    case statusCode == 200, statusCode == 201, statusCode == 202, statusCode == 204:
        return Decision{Retry: false, Success: true}
    case statusCode == 429, statusCode == 408, statusCode >= 500:
        return Decision{Retry: true}
    case statusCode == 400, statusCode == 401, statusCode == 403, statusCode == 410, statusCode == 422:
        return Decision{Retry: false, Permanent: true}
    case statusCode == 404:
        return Decision{Retry: true} // ambiguous
    default:
        return Decision{Retry: true}
    }
}
```

সন্দেহ হলে, retry করুন। একটা অতিরিক্ত attempt-এর খরচ ছোট; একটা আসল event drop করার খরচ বড়।

## Exponential backoff

retry-র মাঝে অপেক্ষা করুন; প্রতিবার অপেক্ষা দ্বিগুণ করুন। কোনো একটা max-এ cap করুন।

```
attempt 1: deliver immediately
attempt 2: wait 1 minute
attempt 3: wait 2 minutes
attempt 4: wait 4 minutes
attempt 5: wait 8 minutes
attempt 6: wait 16 minutes
attempt 7: wait 32 minutes
attempt 8: wait 1 hour       <-- cap
attempt 9: wait 1 hour
...
```

Exponential ঠিক হওয়ার দুটো কারণ:

1. ৫ সেকেন্ড down থাকা receiver আর ২ ঘণ্টা down থাকা receiver-এর ভিন্ন policy দরকার। Exponential মানিয়ে নেয়: সংক্ষিপ্ত outage দ্রুত recover করে, দীর্ঘ outage receiver-কে retry-তে ডুবিয়ে দেয় না।
2. যেকোনো time window-এ মোট attempt সংখ্যা bounded — আটটা retry ~২ ঘণ্টা কভার করে; একটা hot loop হাজার হাজার করত।

## Jitter — synchronise করবেন না

jitter ছাড়া, একই মুহূর্তে fail শুরু করা প্রতিটা event একই মুহূর্তে retry করে। receiver ফিরে এলে, একটা synchronised ঢেউ তাকে আঘাত করে।

randomness যোগ করুন:

```go
func backoffWithJitter(attempt int) time.Duration {
    base := time.Minute << min(attempt, 6) // exponential, capped
    if base > time.Hour {
        base = time.Hour
    }
    jitter := time.Duration(rand.Int63n(int64(base) / 2))
    return base/2 + jitter // [base/2, base]
}
```

এটা nominal backoff-এর অর্ধেক আর পূর্ণের মাঝে একটা delay তৈরি করে। "thundering herd" উধাও হয়।

দুটো jitter strategy, দুটোই common:

**Full jitter:** `delay = rand(0, base)` — সবচেয়ে বেশি ছড়ানো, সবচেয়ে কম প্রত্যাশিত delay।

**Equal jitter:** `delay = base/2 + rand(0, base/2)` — অর্ধেক randomized; গড় backoff সংরক্ষণ করে। Recommended।

সঠিক formula-টা jitter আদৌ থাকার চেয়ে কম গুরুত্বপূর্ণ।

## কতক্ষণ retry — give-up policy

চিরকাল retry করলে আপনার queue মৃত event-এ ভরে যায়। খুব তাড়াতাড়ি থামলে একটা ৬-ঘণ্টার outage প্রতিটা event হারায়।

Standard window হলো **২ থেকে ৫ দিন**-এর retry। Stripe ৩ দিন retry করে; SendGrid ৪। একটা weekend outage টিকে থাকার মতো যথেষ্ট দীর্ঘ; queue bound করার মতো যথেষ্ট ছোট।

Implementation:

```go
type Delivery struct {
    EventID    string
    URL        string
    Attempts   int
    LastError  string
    NextRetry  time.Time
    GiveUpAt   time.Time
}

func shouldRetry(d Delivery) bool {
    return time.Now().Before(d.GiveUpAt)
}
```

`GiveUpAt` প্রথম delivery-তে set হয়: `time.Now().Add(72 * time.Hour)`। প্রতিটা retry check করে; পার হয়ে গেলে, permanently failed mark করে dead-letter-এ route করুন (অধ্যায় ৮)।

## attempt সংখ্যা vs মোট সময়

একই policy প্রকাশের দুটো উপায়: "৮ attempt" অথবা "৩ দিন।" দুটোই দরকার।

- **Max attempts:** মোট কাজ cap করে। ১০ ms-এ 500 return করা receiver একটা বিকেলে 100K attempt পোড়ায় না।
- **Max total time:** customer-এর exposure window cap করে। ৩০ দিন পুরনো একটা event deliver হতে পারলেও খুব কমই কাজের।

রক্ষণশীল implementation দুটোই enforce করে:

```go
if d.Attempts >= 16 || time.Now().After(d.GiveUpAt) {
    return errGiveUp
}
```

16 attempt × max-১-ঘণ্টা backoff = ~১০ ঘণ্টা, ৩-দিনের GiveUpAt-এর অনেক নিচে। যেকোনো একটা condition escalation ট্রিগার করে।

## `Retry-After` header

`429 Too Many Requests` আর মাঝেমধ্যে `503 Service Unavailable` একটা `Retry-After` header সহ আসে — receiver আপনাকে ঠিক কখন ফিরতে হবে বলছে। **সেটা মানুন।**

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

দুটো format: integer second বা HTTP-date। দুটোই parse করুন, বেশি হলে আপনার usual backoff-কে override করুন:

```go
if resp.StatusCode == 429 || resp.StatusCode == 503 {
    if ra := resp.Header.Get("Retry-After"); ra != "" {
        delay := parseRetryAfter(ra)
        if delay > backoffWithJitter(d.Attempts) {
            return delay
        }
    }
}
```

যে receiver বলে "৫ মিনিট অপেক্ষা করো" সে আপনার backoff algorithm-এর চেয়ে বেশি জানে। শুনুন।

<Callout type="warn">

**`Retry-After`-এ ছোট করবেন না।** receiver ৫ মিনিট অপেক্ষা করতে বললে আর আপনার backoff ১ মিনিট বললে, ১ মিনিটে retry করলে সম্ভবত আরেকটা 429 পাবেন। দুটোর বড়টা নিন।

</Callout>

## Per-receiver concurrency limit

একসাথে অনেক event fail করলে এক receiver-এ N parallel retry storm তৈরি হওয়া উচিত নয়। in-flight count cap করুন:

```go
type ReceiverLimits struct {
    InFlight int // semaphore-bounded
}
```

worker pool-এ একটা সরল per-host semaphore এক receiver-এ, ধরুন, 10 concurrent attempt-এ throttle করে। 11তমটা অপেক্ষা করে।

টানা traffic সহ খুব hot receiver-এর জন্য, cap বেশি হওয়া উচিত; সাধারণ webhook-এর জন্য 10-ই যথেষ্ট।

## retry সহ worker queue

পূর্ণ ছবিটা একটা durable queue, একটা worker pool, আর retry decision তার করে:

```go
type Job struct {
    DeliveryID string
    EventID    string
    URL        string
    Body       []byte
    Headers    map[string]string
    Attempts   int
    GiveUpAt   time.Time
}

func worker(ctx context.Context, jobs <-chan Job, retries chan<- Job) {
    for job := range jobs {
        result := deliver(ctx, job)

        switch {
        case result.Success:
            markDelivered(job.DeliveryID, result)
        case result.Permanent:
            markFailed(job.DeliveryID, result)
            // dead-letter (chapter 8)
        case time.Now().After(job.GiveUpAt):
            markFailed(job.DeliveryID, result)
        default:
            // schedule retry
            job.Attempts++
            delay := pickDelay(job.Attempts, result.RetryAfter)
            scheduleRetry(job, delay)
        }
    }
}
```

`scheduleRetry` `next_attempt_at = now + delay` সহ durable queue-তে লিখে ফেরায়; একটা scheduler সেসব job পড়ে যাদের সময় এসেছে আর dispatch করে। একটা `next_attempt_at TIMESTAMPTZ` index সহ Postgres প্রতি সেকেন্ডে হাজার-দশেকের জন্য কাজ করে; বেশি throughput-এর জন্য Redis বা RabbitMQ।

```sql
-- claim due jobs
WITH claimed AS (
  SELECT id FROM webhook_deliveries
  WHERE state = 'pending' AND next_attempt_at <= now()
  ORDER BY next_attempt_at
  FOR UPDATE SKIP LOCKED
  LIMIT 100
)
UPDATE webhook_deliveries
SET state = 'in_flight', claimed_at = now()
FROM claimed
WHERE webhook_deliveries.id = claimed.id
RETURNING webhook_deliveries.*;
```

`FOR UPDATE SKIP LOCKED` হলো Postgres-এর built-in queue primitive। একাধিক worker non-overlapping row claim করে; প্রতিটা row একবার process হয়।

## retry-তে idempotency

producer-এর নিজের retry-কে **একই `id` আর একই body** পাঠাতে হবে। retry-তে event ID regenerate করলে, receiver dedupe করতে পারে না আর দুবার process করে (অধ্যায় ৭)।

producer-কে **signature-ও consistent** রাখতে হবে। signature মূল body আর timestamp-এর ওপর গণনা করা হয়েছিল; retry-কে ঠিক ওই জোড়া reuse করতে হবে, অথবা নতুন timestamp দিয়ে sign করতে হবে:

**Option A:** প্রথম attempt-এ একবার sign করুন, signature queue-তে store করুন, প্রতি retry-তে reuse করুন। receiver-এর replay window পুরো retry duration (৩ দিন) কভার করার মতো দীর্ঘ হতে হবে। receiver-রা সাধারণত সেটা দেয় না।

**Option B:** প্রতিটা attempt-এ একটা fresh timestamp দিয়ে re-sign করুন। Standard practice; receiver সবসময় একটা current timestamp দেখে।

Option B-ই standard। body আর event ID একই থাকে; timestamp আর signature per attempt বদলায়।

## error-এর মধ্যে retry করবেন না

একটা সূক্ষ্ম bug: একটা worker job claim করতে fail করে (DB error), বা deserialize করতে fail করে, বা পাঠানোর আগে panic করে — এগুলো _delivery_ failure নয়, এগুলো _worker_ failure। `Attempts` বাড়াবেন না; `next_attempt_at` bump করবেন না। শুধু job-টা ফিরিয়ে রাখুন, অন্য একটা worker-কে চেষ্টা করতে দিন।

```go
defer func() {
    if r := recover(); r != nil {
        log.Errorf("worker panic on job %s: %v", job.DeliveryID, r)
        unclaim(job.DeliveryID) // back to "pending", same attempt count
    }
}()
```

worker error-কে delivery error-এর সাথে গুলিয়ে ফেললে খুব দ্রুত হাল ছেড়ে দেওয়া হয়।

## Permanent transition-এর জন্য backoff

যে receiver দুদিন `200` return করে হঠাৎ এক সপ্তাহ ধরে `410` করে, সে সংকেত দিচ্ছে "এই endpoint চলে গেছে।" বারবার permanent-class error-এর পরে, _subscription_-কে সন্দেহভাজন mark করুন — নতুন delivery pause করুন, customer-কে alert দিন। একটা known-dead URL-এ retry ছুড়তে থাকবেন না।

```go
if subscription.PermanentFailureStreak > 100 {
    pauseSubscription(subscription.ID)
    notifyCustomer(subscription.OwnerEmail, "Webhook URL appears dead")
}
```

এটা "transient flap recover করে" আর "চলুন একটা মৃত URL flood না করি"-র মধ্যে ভারসাম্য রাখে।

## Per-subscription rate limit

কিছু receiver-এর known capacity আছে — "আমরা 10 events/sec সামলাতে পারি।" retry জমা হলেও producer-এর সেটা মানা উচিত:

```go
type SubscriptionRate struct {
    PerSecond int
}

// check before enqueuing or before delivering
if !rateLimiter.Allow(subscription.ID) {
    delay := rateLimiter.NextAvailable(subscription.ID)
    scheduleRetry(job, delay)
}
```

per subscription configurable; default একটা উদার-কিন্তু-সসীম সংখ্যা।

## পুরো সিস্টেমের ছবি

টুকরোগুলো একসাথে জোড়া:

```
event happens
    ↓
producer writes outbox row (chapter 10)
    ↓
worker claims, signs, POSTs
    ↓
2xx? → mark delivered, done
non-2xx + transient? → schedule retry with backoff+jitter
non-2xx + permanent?  → mark failed, dead-letter (chapter 8)
expired? → mark expired, dead-letter
```

এটাই একটা event-এর পূর্ণ lifecycle। queue আর classifier থাকলে retry layer কয়েকশো লাইন।

## রিক্যাপ

- Classify করুন: 5xx/network/429/408 retry; 400/401/403/410/422 permanent; 404 রক্ষণশীলভাবে retry।
- Exponential backoff (per attempt দ্বিগুণ), ~১ ঘণ্টায় cap।
- সবসময় jitter যোগ করুন (equal বা full)। synchronised retry ঢেউ এড়ান।
- মোট retry window: ২–৫ দিন। তারপর dead-letter।
- `Retry-After` মানুন। header আর computed backoff-এর দীর্ঘটা নিন।
- per receiver concurrent in-flight cap করুন (~10)।
- worker queue-র জন্য Postgres `FOR UPDATE SKIP LOCKED` ব্যবহার করুন।
- প্রতিটা retry-তে fresh timestamp দিয়ে re-sign করুন; একই event ID আর body।
- worker error delivery error নয় — attempt count bump করবেন না।
- টানা permanent failure-এর পরে subscription pause করুন; customer-কে জানান।

পরবর্তী: [Receiver-এ idempotency](/notes/webhooks/07-idempotency) — inbox pattern, dedup key, আর delivery at-least-once হলেও একবার process করা।
