---
title: 'Retries and backoff'
subtitle: "A delivery that fails once is normal. A delivery that fails ten times in a hot loop takes down your service and your customer's. Exponential backoff with jitter and a hard deadline is the simple, correct fix."
chapter: 6
level: 'intermediate'
readingTime: '12 min'
topics: ['webhooks', 'retries', 'backoff', 'jitter', 'deadlines']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A network drops. A receiver restarts. A database lock holds. None of these mean "the customer no longer wants this event" — they mean "try again later." Webhooks need retry semantics that recover from transient failures without ever degrading into a hot loop.

This chapter is the algorithm and the parameters. Producers in the wild that get this wrong DDoS their own customers; teams that get it right almost never page anyone for delivery issues.

<Callout type="info">

**Real-World Analogy**

Retrying a failed webhook is like leaving a voicemail and calling back if they don't pick up — you don't give up after one ring.

</Callout>

## What needs retry

Three families of failure, each with its own retry policy.

**1. Transient failures — retry.**

- Network errors: timeouts, connection refused, DNS failures.
- Receiver returns `5xx` (server error).
- Receiver returns `429` (rate limited; usually with `Retry-After`).
- Receiver returns `408` (request timeout).

These are "try again later" — the failure isn't about the payload.

**2. Permanent failures — do not retry.**

- Receiver returns `400` or `422` (the payload is malformed; another try with the same payload won't help).
- Receiver returns `401` or `403` (auth failed; the secret is wrong, fix the config).
- Receiver returns `410` (the endpoint is gone; tell the customer).

**3. Ambiguous — retry conservatively.**

- Receiver returns `404`. Could be a misconfigured URL (transient — they fix it) or a dead endpoint (permanent). Retry for a while; eventually escalate.

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

When in doubt, retry. The cost of an extra attempt is small; the cost of dropping a real event is large.

## Exponential backoff

Wait between retries; double the wait each time. Cap at some max.

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

Two reasons exponential is right:

1. A receiver that's down for 5 seconds and a receiver that's down for 2 hours need different policies. Exponential adapts: brief outages recover fast, long outages don't drown the receiver in retries.
2. The total number of attempts in any time window is bounded — eight retries cover ~2 hours; a hot loop would do thousands.

## Jitter — don't synchronise

Without jitter, every event that started failing at the same moment retries at the same moment. When the receiver comes back up, it's hit with a synchronised wave.

Add randomness:

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

This produces a delay between half and full of the nominal backoff. The "thundering herd" disappears.

Two jitter strategies, both common:

**Full jitter:** `delay = rand(0, base)` — most spread, lowest expected delay.

**Equal jitter:** `delay = base/2 + rand(0, base/2)` — half-randomized; preserves average backoff. Recommended.

The exact formula matters less than having jitter at all.

## How long to retry — the give-up policy

Retry forever and you fill your queue with dead events. Stop too soon and a 6-hour outage loses every event.

The standard window is **2 to 5 days** of retries. Stripe retries for 3 days; SendGrid for 4. Long enough to survive a weekend outage; short enough to bound the queue.

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

`GiveUpAt` is set on first delivery: `time.Now().Add(72 * time.Hour)`. Every retry checks; if past, mark permanently failed and route to dead-letter (chapter 8).

## Number of attempts vs total time

Two ways to express the same policy: "8 attempts" or "3 days." Both are needed.

- **Max attempts:** caps total work. A receiver that returns 500 in 10 ms doesn't burn 100K attempts in an afternoon.
- **Max total time:** caps the customer's exposure window. A 30-day-old event is rarely useful even if it could still deliver.

The conservative implementation enforces both:

```go
if d.Attempts >= 16 || time.Now().After(d.GiveUpAt) {
    return errGiveUp
}
```

16 attempts × max-1-hour backoff = ~10 hours, well under the 3-day GiveUpAt. Either condition triggers escalation.

## `Retry-After` header

`429 Too Many Requests` and sometimes `503 Service Unavailable` come with a `Retry-After` header — the receiver telling you exactly when to come back. **Respect it.**

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

Two formats: integer seconds or HTTP-date. Parse both, override your usual backoff if it's longer:

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

A receiver that says "wait 5 minutes" knows more than your backoff algorithm. Listen.

<Callout type="warn">

**Don't shorten on `Retry-After`.** If the receiver says wait 5 minutes and your backoff says wait 1, retrying at 1 minute will probably get another 429. Take the larger of the two.

</Callout>

## Concurrency limits per receiver

Multiple events failing at once should not produce N parallel retry storms at one receiver. Cap the in-flight count:

```go
type ReceiverLimits struct {
    InFlight int // semaphore-bounded
}
```

A simple per-host semaphore in the worker pool throttles to, say, 10 concurrent attempts to one receiver. The 11th waits.

For very hot receivers with sustained traffic, the cap should be higher; for typical webhooks, 10 is plenty.

## Worker queue with retry

The full picture wires a durable queue, a worker pool, and the retry decision:

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

`scheduleRetry` writes back to the durable queue with `next_attempt_at = now + delay`; a scheduler reads jobs whose time has come and dispatches them. Postgres with a `next_attempt_at TIMESTAMPTZ` index works for tens of thousands per second; Redis or RabbitMQ for higher throughput.

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

`FOR UPDATE SKIP LOCKED` is Postgres's built-in queue primitive. Multiple workers claim non-overlapping rows; each row is processed once.

## Idempotency in retries

The producer's own retries must send the **same `id` and the same body**. If you regenerate the event ID on retry, the receiver cannot dedupe and processes twice (chapter 7).

The producer also must keep the **signature consistent**. The signature was computed over the original body and timestamp; retries must reuse that exact pair, or sign with the new timestamp:

**Option A:** sign once at first attempt, store the signature in the queue, reuse on every retry. The receiver's replay window must be long enough to cover the entire retry duration (3 days). Receivers typically don't allow that.

**Option B:** re-sign with a fresh timestamp on each attempt. Standard practice; the receiver always sees a current timestamp.

Option B is the standard. The body and event ID stay the same; the timestamp and signature change per attempt.

## Don't retry into errors

A subtle bug: a worker that fails to claim a job (DB error), or fails to deserialize, or panics before sending — these aren't _delivery_ failures, they're _worker_ failures. Don't increment `Attempts`; don't bump `next_attempt_at`. Just put the job back, let another worker try.

```go
defer func() {
    if r := recover(); r != nil {
        log.Errorf("worker panic on job %s: %v", job.DeliveryID, r)
        unclaim(job.DeliveryID) // back to "pending", same attempt count
    }
}()
```

Confusing worker errors with delivery errors leads to giving up too fast.

## Backoff for permanent transitions

A receiver that returns `200` for two days then suddenly `410`s for a week is signaling "this endpoint is gone." After repeated permanent-class errors, mark the _subscription_ as suspect — pause new deliveries, alert the customer. Don't keep firing retries at a known-dead URL.

```go
if subscription.PermanentFailureStreak > 100 {
    pauseSubscription(subscription.ID)
    notifyCustomer(subscription.OwnerEmail, "Webhook URL appears dead")
}
```

This balances "transient flap recovers" against "let's not flood a dead URL."

## Per-subscription rate limits

Some receivers have known capacity — "we can handle 10 events/sec." The producer should respect that even when retries pile up:

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

Configurable per subscription; defaults to a generous-but-finite number.

## Total system view

Putting the pieces together:

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

That is the full lifecycle of one event. The retry layer is a few hundred lines once you have the queue and the classifier.

## Recap

- Classify: 5xx/network/429/408 retry; 400/401/403/410/422 permanent; 404 conservatively retry.
- Exponential backoff (double per attempt), capped at ~1 hour.
- Always add jitter (equal or full). Avoid synchronised retry waves.
- Total retry window: 2–5 days. Dead-letter after that.
- Respect `Retry-After`. Take the longer of header and computed backoff.
- Cap concurrent in-flight per receiver (~10).
- Use Postgres `FOR UPDATE SKIP LOCKED` for the worker queue.
- Re-sign with fresh timestamp on each retry; same event ID and body.
- Worker errors aren't delivery errors — don't bump attempt count.
- Pause subscriptions after sustained permanent failures; notify the customer.

Next: [Idempotency on the receiver](/notes/webhooks/07-idempotency) — the inbox pattern, dedup keys, and processing once even when delivery is at-least-once.
