---
title: "What webhooks are and when to use them"
subtitle: "A webhook is an HTTP POST you make to somebody else's server when something happens. The protocol is trivial; the failure modes are not."
chapter: 1
level: "beginner"
readingTime: "10 min"
topics: ["webhooks", "events", "rest", "queues"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

You signed up for Stripe. A customer paid. Stripe needed to tell your server. They could have made you poll an API every minute, but instead they posted to a URL you gave them. That POST was a webhook.

Webhooks are the simplest possible inter-service push primitive. They are also the place where most teams ship their first real distributed-system bug — because "fire-and-forget HTTP POST" sounds easy and the failure cases are subtle.

<Callout type="info">

**Real-World Analogy**

A webhook is like a smoke detector that calls the fire station itself, rather than waiting for someone to check if there's smoke.

</Callout>

## The shape of a webhook

```
POST /your/webhook/url HTTP/1.1
Host: app.example.com
Content-Type: application/json
X-Webhook-ID: evt_abc123
X-Webhook-Timestamp: 1714831200
X-Webhook-Signature: t=1714831200,v1=abc...

{
  "id": "evt_abc123",
  "type": "payment.succeeded",
  "created": "2026-05-04T12:00:00Z",
  "data": { "amount": 4200, "currency": "usd", "customer": "cus_42" }
}
```

That is the whole protocol. A POST. JSON body. A few headers carrying the event ID, timestamp, and HMAC signature. The receiver responds with `2xx` to acknowledge or `5xx`/timeout to fail.

Everything else in this track — signing, retries, idempotency, dead-letter queues — is the operational story around making that simple POST reliable across networks that drop packets, receivers that go down for hours, and attackers who would love to forge events.

## Push vs pull

Two ways for a system to learn that something happened in another system.

**Pull (polling).** Your code calls `GET /api/payments?since=...` every minute. Easy to write, expensive to operate, latency = polling interval. Right when events are rare and stale data is fine.

**Push (webhook).** They call you when something happens. Low-latency, low-overhead, but introduces a whole new failure surface: what if your server is down when their POST arrives?

Most production integrations end up using both: webhooks for low-latency notification, polling as a safety net for missed events.

## Webhooks vs message queues vs WebSockets

| | Webhooks | Message queues | WebSockets |
|---|---|---|---|
| Direction | producer → receiver, push | producer → broker → consumer | bidirectional |
| Transport | HTTP POST | AMQP / Kafka / SQS / NATS | WebSocket frames |
| Coupling | producer knows receiver URL | both know broker | persistent connection |
| Reach | any HTTPS endpoint on internet | usually inside one trust zone | usually browser ↔ your server |
| Operational | mostly the producer | mostly the broker | both ends |
| Replay | producer replays | broker replays | reconnect + resume |

Webhooks are the right answer when:

- The receiver lives in a different organisation, network, or trust zone.
- You need to notify many independent receivers (one event, multiple subscribers, each with their own URL).
- You want the receiver to use plain HTTPS — no broker SDK, no WebSocket library.
- The receiver decides whether and when to consume; the producer does not maintain a queue per consumer.

They are wrong when:

- Both sides are inside one infrastructure you control. Use a queue (chapter on **Messaging & queues** later in the path).
- You need realtime UI updates to a browser. Use WebSockets or SSE (track you just finished).
- You need ordering guarantees stronger than "eventually delivered." Webhooks reorder under retries.
- Throughput is sustained at >1K events/sec per receiver. The HTTP overhead dominates; switch to a queue and let the receiver drain.

## The four hard parts

A POST request is one HTTP call. A *production* webhook system has to solve:

**1. Authenticity.** The receiver must know the POST really came from you and not from an attacker who guessed the URL. → HMAC signing (chapter 4).

**2. At-least-once delivery.** Networks drop. Receivers crash mid-process. The producer must retry until the receiver acknowledges. → Retries with backoff (chapter 6).

**3. Idempotency.** Retries mean the same event arrives multiple times. The receiver must process it once. → Event IDs and dedup (chapter 7).

**4. Durability.** A producer that crashes after writing to its database but before sending the POST loses the event forever. → The outbox pattern (chapter 10).

Skipping any one of these turns webhooks into "almost-correct events" — silent data loss, double-charges, missed notifications. The four together are the difference between a feature that works on the demo and one that works for years.

## A real webhook system

Stripe's webhook infrastructure is the canonical reference. The shape:

- Producer (Stripe) generates events for every state change.
- Each customer registers one or more endpoint URLs and chooses event types they care about.
- Producer signs every payload with the customer's secret.
- Producer attempts delivery; on non-2xx or timeout, retries with exponential backoff for up to 3 days.
- Customer's receiver verifies signature, dedupes by event ID, processes, returns 200.
- Stripe exposes a dashboard with delivery history, the request/response of each attempt, manual retry buttons.

That dashboard is the giveaway. Webhooks are not a fire-and-forget feature; they are an *operated* feature. You build the system *and* the tooling to debug it.

## The receiver perspective

If you are integrating with someone else's webhooks, the rules are simple:

- **Respond 200 quickly** (under a few seconds). Defer slow work to a background queue.
- **Respond 200 even if you've seen this event ID before.** Idempotency is your job.
- **Verify the signature on every request.** Reject anything that fails the check.
- **Reject events older than your replay window** (5 minutes is typical).
- **Be ready to receive duplicates** — at-least-once is the contract.

Most of the bugs come from receivers doing slow synchronous work on the webhook handler. The producer times out, retries, and now you have N copies of the same payment processed.

<Callout type="warn">

**Receivers must be idempotent.** A producer with a perfect retry policy still delivers some events twice when the receiver's 200 response gets lost between TCP and your application. The receiver dedupes; the producer cannot guarantee exactly-once.

</Callout>

## When webhooks fail and you do not notice

Three silent failure modes worth memorizing:

**1. Receiver returns 200 but throws after.** Producer thinks the event landed. Receiver dropped it on the floor. Fix: receivers acknowledge *after* persisting the event, not before.

**2. Producer crashes after the side-effect, before sending.** A payment is recorded in your DB but no webhook is sent. Customers' systems never learn. Fix: outbox pattern (chapter 10).

**3. Permanent failure goes unnoticed.** Receiver URL is dead, producer retries for 3 days, gives up, no one is paged. Fix: dead-letter queue with alerting (chapter 8).

If your webhook system has none of these, you have not built it yet — you just shipped its happy path.

## What "self-hosted" looks like

The whole track stays vendor-neutral. No "use AWS EventBridge" or "deploy to Hookdeck." We build a Go producer, a Go receiver, Postgres for the outbox and inbox, and ship behind nginx on a VPS. Same operational shape as the rest of the path.

You also get to feel the operator's pain. Running webhooks teaches you why managed services charge for them — they handle the dead receivers, the noisy retries, the replay UI. After you build it once you can decide whether to build or buy.

## Recap

- A webhook is a POST you make when something happens. JSON body, a few headers, 2xx ack.
- Push is the alternative to polling. Lower latency, harder operations.
- Webhooks fit cross-trust-boundary push to many receivers; queues fit inside one infra.
- The four hard parts: authenticity (HMAC), at-least-once (retries), idempotency (dedup), durability (outbox).
- Receivers must respond fast, dedupe, verify signature, accept replay.
- Silent failures come from receivers ack'ing too early, producers crashing post-side-effect, and unnoticed permanent failures.
- We build it self-hosted in Go + Postgres on a VPS — same shape as Stripe, your scale.

Next: [Event contract design](/notes/webhooks/02-event-contract) — types, fields, idempotency keys, and the schema-evolution rules that keep your customers' code working.

