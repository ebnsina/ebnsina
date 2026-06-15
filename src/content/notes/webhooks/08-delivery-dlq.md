---
title: "Delivery guarantees and the dead-letter queue"
subtitle: "Some events never deliver. The dead-letter queue is where they go, the dashboard is where humans see them, and the manual replay is how you recover. None of these are optional."
chapter: 8
level: "intermediate"
readingTime: "11 min"
topics: ["webhooks", "dlq", "delivery", "alerts", "replay"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

After the retries run out, what happens? The default in too many systems is "the event vanishes silently, the customer notices weeks later that their integration has gaps, the support ticket lands on you." That is the worst possible outcome for both sides.

This chapter is the recovery story. Dead-letter queue (DLQ), alerting, manual replay, customer visibility. Build it once, sleep at night.

<Callout type="info">

**Real-World Analogy**

A dead-letter queue is like a post office dead-letter bin for mail that couldn't be delivered — held separately for inspection rather than lost forever.

</Callout>

## The delivery state machine

```
                  ┌─────────┐
                  │ pending │
                  └────┬────┘
                       │ claimed by worker
                       ▼
                  ┌─────────┐
                  │  in     │
                  │ flight  │
                  └────┬────┘
                       │
        ┌──────────────┼──────────────────────┐
        │ 2xx          │ 4xx permanent        │ 5xx/transient
        ▼              ▼                      ▼
   ┌─────────┐   ┌────────┐            ┌────────────┐
   │delivered│   │ failed │            │ retrying   │
   └─────────┘   └───┬────┘            └─────┬──────┘
                     │                       │
                     │             ┌─────────┴─────────┐
                     │             │                   │
                     │       under deadline     past deadline
                     │             │                   │
                     │             ▼                   ▼
                     │       (back to pending)   ┌──────────┐
                     │                           │ expired  │
                     ▼                           └──────────┘
              ┌──────────────┐                       │
              │ dead-letter  │ ◀─────────────────────┘
              └──────────────┘
```

Three terminal states a delivery can reach:

- **delivered** — receiver responded 2xx, work is done.
- **failed (permanent)** — receiver returned a permanent-class error.
- **expired** — retry deadline passed without a 2xx.

`failed` and `expired` both end in the dead-letter queue. They differ in *why* — important for alerting, not for storage.

## The DLQ as a table

Same table as your delivery queue, with a state column:

```sql
CREATE TABLE webhook_deliveries (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    subscription_id BIGINT NOT NULL,
    url TEXT NOT NULL,
    body BYTEA NOT NULL,
    headers JSONB NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending','in_flight','delivered','failed','expired')),
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    give_up_at TIMESTAMPTZ NOT NULL,
    last_status INT,
    last_response BYTEA,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX webhook_deliveries_pending ON webhook_deliveries(next_attempt_at)
WHERE state = 'pending';

CREATE INDEX webhook_deliveries_dlq ON webhook_deliveries(updated_at DESC)
WHERE state IN ('failed', 'expired');
```

The DLQ is just `state IN ('failed', 'expired')`. No separate table — searching, listing, replaying are all queries on the same table.

The partial index on pending rows keeps the queue scan fast even when the DLQ grows.

## What to store

For dead-lettered deliveries, capture enough to debug and replay:

- **The full body** — re-deliverable as is.
- **The full headers** — including the signature.
- **The last response status and body snippet** — what the receiver actually said. ~512 bytes is usually enough; truncate longer responses.
- **The last error** — the network error or status text.
- **All attempt timestamps** — debug "when did this start failing."

A separate `webhook_attempts` table linked by delivery ID is worth it for high-traffic systems where each delivery may have many tries:

```sql
CREATE TABLE webhook_attempts (
    delivery_id BIGINT NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
    attempt INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    duration_ms INT,
    status INT,
    response_snippet BYTEA,
    error TEXT,
    PRIMARY KEY (delivery_id, attempt)
);
```

Now operators can see the timeline: 8 attempts at this URL, started at this time, ended at that time, last response was a 502 Bad Gateway with a Cloudflare error page.

## When to alert

Three alerting tiers worth differentiating.

**1. Per-event alerts — almost never.** A single delivery hitting the DLQ is normal noise. Don't page on these.

**2. Per-subscription alerts — when failure is sustained.** If a subscription's deliveries have been DLQ'd for an hour, the customer's endpoint is down. Email the customer (and your support):

```
Your webhook endpoint https://customer.com/webhooks has been failing
for 1 hour. The most recent attempts returned 503. We will continue
retrying for 3 days. If your endpoint is down, please fix it.

Last 5 events: [list]
```

A first email at 1 hour, a second at 24 hours, a third before expiry. After expiry, a final summary of what was lost.

**3. Producer-wide alerts — for systemic issues.** If the DLQ rate suddenly jumps across many subscriptions, you have a producer-side bug or a network issue. Page the on-call.

```yaml
- alert: WebhookDLQRateHigh
  expr: rate(webhook_deliveries_failed_total[5m]) > 10
  for: 10m
  annotations:
    summary: "Webhook DLQ rate is {{ $value }} per second"
```

Tuning these thresholds is per-environment. Start tight; relax based on noise.

## The customer dashboard

Customers cannot debug their integration without visibility into delivery attempts. Build a UI that shows:

- **List of events** sent to a subscription, filterable by state.
- **Per-event detail:** request body, headers, all attempts (timestamps, status, response snippet).
- **Resend button** — manually replay a delivery.
- **Endpoint health summary** — success rate, average latency, current state.

Stripe's webhooks dashboard is the reference. You don't need the polish; you need the function. A bare-bones admin page with these features beats any amount of "view in CloudWatch" plumbing.

The schema supports it directly — these are queries on `webhook_deliveries` and `webhook_attempts`. No special data store.

## Manual replay

Operators (and customers, with auth) need a "send this again" button. Implementation:

```sql
UPDATE webhook_deliveries
SET state = 'pending',
    next_attempt_at = now(),
    give_up_at = now() + interval '72 hours',
    attempts = 0,
    last_error = NULL
WHERE id = $1
  AND state IN ('failed', 'expired', 'delivered');
```

Resetting the state and bumping the deadline puts the delivery back on the queue. Workers pick it up on the next scan.

Reset `attempts = 0` so the backoff starts fresh. Otherwise a manually-replayed delivery starts at "wait 1 hour" because the previous attempts count is preserved.

For customer-driven replay, also rate-limit the button: 100 replays per minute per subscription is plenty; without a limit, a customer could DDoS their own integration via your UI.

## Bulk replay

For systemic failures (a deploy bug DLQ'd 50K events), individual replay is impractical. A bulk replay tool:

```sql
UPDATE webhook_deliveries
SET state = 'pending', next_attempt_at = now() + (random() * interval '5 minutes'),
    give_up_at = now() + interval '72 hours', attempts = 0
WHERE id IN (
  SELECT id FROM webhook_deliveries
  WHERE state IN ('failed', 'expired')
    AND created_at >= '2026-05-04 12:00:00'
    AND created_at <  '2026-05-04 14:00:00'
);
```

Two important details:

- **Spread `next_attempt_at` randomly over 5 minutes.** Otherwise 50K replays hit the queue at the same instant and overwhelm workers.
- **Set a fresh `give_up_at`.** Past deadlines are stale.

Bulk replay should be a deliberate operator action, gated behind admin auth. Log every bulk replay (operator, count, criteria, time). It's the "rm -rf with one extra step" of webhook ops.

<Callout type="warn">

**Replays are not free.** A bulk replay generates POSTs that customers receive again. Their dedup logic (chapter 7) handles correctness; their rate limits may not handle volume. Communicate before replaying — "we're going to redeliver yesterday's events, expect a spike" — especially for any replay over a few thousand events.

</Callout>

## Subscription-level pause

When a subscription has been DLQ'ing constantly for a day, keep retrying is harmful — burning queue capacity, possibly the customer's bandwidth. Pause it:

```sql
UPDATE webhook_subscriptions SET state = 'paused' WHERE id = $1;
```

Workers skip paused subscriptions:

```sql
SELECT * FROM webhook_deliveries d
JOIN webhook_subscriptions s ON s.id = d.subscription_id
WHERE d.state = 'pending' AND s.state = 'active'
  AND d.next_attempt_at <= now()
ORDER BY d.next_attempt_at;
```

The DLQ continues to grow with new events, but no more retries fire. The customer fixes the endpoint, hits "resume," and the queue drains.

A safety: events emitted while paused should still be enqueued (so resume catches up). Don't skip enqueue based on subscription state — that's silent data loss.

## At-least-once vs exactly-once vs at-most-once

Three delivery semantics, only two of which are achievable.

- **At-most-once** — events delivered zero or one time. Easy: just don't retry. Useless: a network blip loses events.
- **At-least-once** — events delivered one or more times. Webhooks are this by default. Receivers dedupe.
- **Exactly-once** — events delivered exactly once. Impossible without a coordinated commit between producer and receiver, which webhooks (HTTP POST) don't have.

Some systems claim exactly-once; what they mean is "at-least-once with idempotent processing," which is the same thing dressed up. Don't fight it. Build at-least-once delivery, and idempotent receivers (chapter 7).

## Long-term storage

DLQ entries should not live forever. Two retention strategies:

**1. Time-based.** Delete after 30 or 90 days. Most operators only debug recent events.

**2. Move to cold storage.** Export DLQ entries older than X days to a JSON file or S3. Free up Postgres space; preserve audit trail.

Most teams use time-based with a shred at 90 days. Customer disputes about events from 6 months ago are exceptional and usually unsolvable anyway (their data is gone too).

## Disclosing the contract

Document, on every webhook subscription:

- "We retry for up to 72 hours."
- "We deliver at-least-once; please make your handlers idempotent on the `id` field."
- "Permanent failures are dead-lettered and visible in your dashboard."
- "After 72 hours, undelivered events are marked expired."

Customers signed up to your webhooks based on a promise. The promise is the contract. Honour it; document it; let support point to it.

## Recap

- Three terminal states: delivered, failed (permanent), expired (out of time).
- DLQ is a state column, not a separate system.
- Store full body + headers + last response + per-attempt history. Replay needs all of it.
- Alert per-subscription on sustained failure, producer-wide on systemic issues. Never per-event.
- Customer dashboard is mandatory: list, detail, resend button.
- Bulk replay spreads `next_attempt_at` to avoid synchronised storms; gated behind admin auth.
- Pause a subscription that's chronically failing; resume when fixed.
- At-least-once is the achievable semantics. Receivers dedupe.
- Retain DLQ for 30–90 days, then delete or archive.
- Document the contract publicly.

Next: [Observability and replay](/notes/webhooks/09-observability) — dashboards, metrics, traces, and the full operator UI.

