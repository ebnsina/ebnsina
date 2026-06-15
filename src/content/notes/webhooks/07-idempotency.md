---
title: "Idempotency on the receiver"
subtitle: "At-least-once delivery means duplicates. The receiver's job is to process exactly once anyway. The inbox pattern — dedupe keys, atomic claim, idempotent side effects — is how."
chapter: 7
level: "intermediate"
readingTime: "12 min"
topics: ["webhooks", "idempotency", "inbox pattern", "dedup", "transactions"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

The producer retries until acknowledged. The receiver crashes occasionally between processing and ACK. Both behaviours are correct. The unavoidable consequence is that some webhooks are delivered, processed, and *then* the producer retries because it never saw the ACK.

The receiver must handle that. Process every event exactly once, even when it arrives twice (or ten times). This chapter is the receiver's idempotency story — small in code, large in correctness.

<Callout type="info">

**Real-World Analogy**

Idempotency is like pressing an elevator button twice — the second press does nothing, the elevator still comes once.

</Callout>

## What "idempotent" actually means

A handler is idempotent if **running it twice on the same input produces the same end state as running it once**.

```
Process(event A) once  ->  state X
Process(event A) twice ->  state X (not X again, just X)
```

Some operations are naturally idempotent:

- **Setting** a value: `user.email = 'a@b'` — same end state regardless of how many times you set it.
- **Adding to a set:** `tags.add("blue")` — already-present is a no-op.
- **Deleting by ID:** `DELETE FROM users WHERE id = 42` — no rows the second time, same outcome.

Some are not:

- **Incrementing a counter:** `views = views + 1` — runs twice, increments twice. Wrong.
- **Inserting a row** without unique constraints — two events, two rows.
- **Charging a card** — two events, two charges. The cardinal sin.

For non-idempotent operations, the receiver needs an explicit dedupe layer.

## The inbox pattern

Track every event ID you've successfully processed. Before doing the work, check if you've seen the ID. If yes, ack and move on. If no, do the work and record the ID — atomically.

```sql
CREATE TABLE webhook_inbox (
    event_id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    result JSONB
);
```

Receiver flow:

```go
func process(ctx context.Context, event Event) error {
    tx, err := db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // try to insert; if dup, we've seen this event
    _, err = tx.Exec(ctx,
        `INSERT INTO webhook_inbox (event_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        event.ID,
    )
    if err != nil {
        return err
    }

    // check if it's still pending
    var processedAt sql.NullTime
    err = tx.QueryRow(ctx,
        `SELECT processed_at FROM webhook_inbox WHERE event_id = $1 FOR UPDATE`,
        event.ID,
    ).Scan(&processedAt)
    if err != nil {
        return err
    }
    if processedAt.Valid {
        // already processed — return success without re-running side effects
        return tx.Commit()
    }

    // do the actual work
    if err := handleEvent(ctx, tx, event); err != nil {
        return err // tx rolls back; will retry on next delivery
    }

    // mark processed
    _, err = tx.Exec(ctx,
        `UPDATE webhook_inbox SET processed_at = now() WHERE event_id = $1`,
        event.ID,
    )
    if err != nil {
        return err
    }

    return tx.Commit()
}
```

Three guarantees from this shape:

1. **Inserting the inbox row is atomic with the side effects.** The transaction either commits both or neither.
2. **Concurrent duplicate deliveries serialize on `FOR UPDATE`.** The first one processes; the second sees `processed_at IS NOT NULL` and acks without re-running.
3. **A crash mid-handler leaves no inbox row** (transaction rolled back), so the next delivery does the work cleanly.

This is the standard inbox pattern. ~30 lines of Go around your domain logic.

## What "side effects" includes

The transaction must wrap **everything that has a visible effect**:

- DB writes (the obvious one).
- External API calls — these are the trap. A webhook that "send a confirmation email" is calling Postmark; if the email send is in the same transaction logically but not actually atomic, you can email twice. Use idempotency keys when calling external APIs.
- Outbound webhook fan-out — same problem; use the outbox pattern (chapter 10).
- File system operations — for these, derive filenames from the event ID so re-running overwrites the same file.

```go
func handleEvent(ctx context.Context, tx *sql.Tx, event Event) error {
    // DB writes — these are inside the transaction, atomic
    if _, err := tx.Exec(ctx, `UPDATE users SET ...`, ...); err != nil {
        return err
    }

    // External API call — idempotency key tied to event ID
    if err := postmark.Send(postmark.Email{
        IdempotencyKey: event.ID,
        ...
    }); err != nil {
        return err
    }

    // Triggering an outbound webhook — outbox row in same tx
    _, err := tx.Exec(ctx, `INSERT INTO outbox ...`, ...)
    return err
}
```

External APIs that don't support idempotency keys are the trickiest. Options:

- Use a "check-then-act" — check via API if the side effect already happened, skip if so. Race-conditional but often acceptable.
- Move the call to an outbound webhook of your own; rely on your idempotent processor.
- Accept duplicates and log loudly.

## Idempotency keys for outbound calls

Many APIs (Stripe, Postmark, Twilio) accept an `Idempotency-Key` header. Using your event ID:

```go
req.Header.Set("Idempotency-Key", event.ID)
```

The remote service dedupes on the key for some window (usually 24 hours). A retry with the same key returns the original result instead of charging again or sending again. Lifesaver.

If the remote call costs money (charges, email sends), idempotency keys are not optional.

## Dedup window — how long to remember

The inbox grows linearly with events. After a year, billions of rows. Two strategies:

**1. Expire old inbox rows.** Anything older than the producer's max retry window (3–5 days) is safe to delete. Anything older than that, if it arrives, is so far from "current" you can decide your own policy (probably reject as stale).

```sql
DELETE FROM webhook_inbox WHERE received_at < now() - interval '7 days';
```

Run via cron daily. Trim to whatever window is comfortably larger than the producer's retry deadline.

**2. Keep forever.** Only viable for low-volume webhook receivers (under 1M events ever). Cheaper than running a cleanup job, and you get history for audit purposes.

For most receivers, expiring at 7–14 days is the right tradeoff.

<Callout type="warn">

**Don't make the dedup window shorter than the producer's retry deadline.** If you delete rows after 24 hours but the producer retries for 3 days, the same event can be re-processed on day 2.

</Callout>

## What if the event ID is missing or untrusted?

A receiver that trusts the producer's `event.id` to be unique is making an assumption. Almost always safe with reputable producers; less safe with unknown integrations.

Belt-and-braces: derive a dedup key from a hash of the canonical body:

```go
key := event.ID
if key == "" {
    h := sha256.Sum256(rawBody)
    key = "body_" + hex.EncodeToString(h[:])
}
```

Now any duplicate body is dedupable even without a unique ID. Costs CPU; protects against producer bugs.

## What about Redis-based dedup

Redis SETNX with a TTL is a tempting alternative to a Postgres table:

```go
ok, _ := rdb.SetNX(ctx, "inbox:"+event.ID, "1", 7*24*time.Hour).Result()
if !ok {
    return nil // duplicate
}
```

This works for **the dedup decision** but not for **atomicity with side effects**. If your work is "update Postgres," the Redis SETNX and the Postgres write are in two systems — you can SETNX in Redis, then crash before Postgres commits, and on retry Redis says "duplicate" and the work is never done.

Two patterns make Redis-based dedup safe:

**A. SETNX after the work commits.** First do the DB work atomically, then SETNX. On retry: if the work would be a no-op (idempotent at the DB layer thanks to upserts), the second processor reaches SETNX and sees it set, acks. Works only if the underlying operations are themselves naturally idempotent (UPSERT, set-equals-value).

**B. Two-phase.** SETNX with a short TTL (5 min) at start; do work; on success, extend TTL to dedup window. On crash, the short TTL expires and the next delivery retries cleanly.

Postgres-based inbox is simpler. Use it unless you have a measured reason to switch.

## Receiver returns 200 on duplicate

A duplicate event is **not an error** for the receiver to surface. Return 200. The producer sees success, stops retrying, moves on.

```go
if alreadyProcessed {
    w.WriteHeader(http.StatusOK)
    log.Printf("dedup: event %s already processed", event.ID)
    return
}
```

Returning anything else (4xx, 5xx) makes the producer keep retrying. Worst case, the producer gets stuck on an event the receiver "thinks" is bad but is actually a re-delivery.

## Ordering — webhooks don't guarantee it

A retry pattern produces *out-of-order* delivery. Event A is sent at t=0, fails. Event B is sent at t=1, succeeds. Event A retries at t=60 — receiver sees A *after* B.

If you depend on order ("user.created must arrive before user.updated"), you have a problem. Three approaches:

**1. Don't depend on it.** For most state-update webhooks where the payload is the full resource, ordering doesn't matter — the latest event wins regardless of arrival order.

**2. Sequence numbers.** Producer adds a monotonic `sequence` per resource. Receiver applies only if `event.sequence > last_seen_for_resource`. Out-of-order events are dropped.

```go
if event.Sequence <= lastSeen[event.ResourceID] {
    return nil // skip stale event
}
lastSeen[event.ResourceID] = event.Sequence
```

**3. Pause processing until prerequisites arrive.** A `user.updated` for user 42 arrives but no `user.created` yet — buffer for some time, then process. Complex and error-prone; usually not worth it.

Sequence numbers are the right tool for resources where order matters. The producer must include them in the event payload.

## Failures during processing

A handler that throws halfway through must not partially commit. With the transaction pattern above, a thrown error rolls back — no inbox row, no side effects. The next delivery retries from scratch.

If your handler does multi-step work that takes minutes, the long transaction holds locks; better to:

1. Insert the inbox row in a short transaction (claim).
2. Do the long work without a transaction.
3. Mark processed in a second short transaction.

Trade-off: between steps 2 and 3, a crash means the work happened but the inbox isn't marked. The next delivery re-runs the work. Either accept the rare duplicate or put per-step idempotency keys around individual operations.

For most webhook handlers, the work is small (update a record, enqueue a job). One transaction is fine.

## Receiver-side replay

When debugging, you may want to *re-process* a specific event. The simplest path: clear its inbox row, then trigger redelivery from the producer. Receivers should not have a "force re-process" button that bypasses the inbox — too easy to double-process by accident.

## Recap

- At-least-once delivery means duplicates. Receivers process exactly once anyway.
- Inbox pattern: a row per event ID, atomic with side effects, `FOR UPDATE` serializes concurrent dupes.
- Wrap **all** side effects in the same transaction, including DB writes and outbound queue rows.
- Use `Idempotency-Key` on outbound API calls to dedupe at the remote service.
- Expire inbox rows older than the producer's retry window + buffer.
- Fall back to body hashes if event IDs aren't trustworthy.
- Redis SETNX alone isn't atomic with DB work — Postgres inbox is the simpler tool.
- Return 200 on duplicate. Never error.
- Out-of-order delivery is the default. Use sequence numbers if order matters.
- Long handlers: split into "claim → work → mark processed" if you need to avoid long transactions.

Next: [Delivery guarantees and the dead-letter queue](/notes/webhooks/08-delivery-dlq) — what happens when retries run out, and the operator interface for deciding what to do.

