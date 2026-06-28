---
title: 'Webhooks — Roadmap'
subtitle: "Ten chapters that go from 'webhooks are just HTTP POST requests' to a self-hosted, signed, retried, idempotent webhook system that survives the receiver being down for hours."
chapter: 0
level: 'beginner'
readingTime: '5 min'
topics: ['roadmap', 'webhooks', 'hmac', 'retries', 'idempotency']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What you will be able to do at the end

You will be able to design event contracts that don't break clients, sign and verify HMAC payloads correctly, retry deliveries with the right backoff and deadline, dedupe at the receiver with idempotency keys, route permanently-failed deliveries to a dead-letter queue, expose a replay UI, and ship a self-hosted producer using the outbox pattern that does not lose events when the database commits but the network drops.

<Callout type="info">

**Prereqs:** finish the **REST API building** track first. Webhooks are HTTP — every concept ports. Knowing the **Background jobs** and **Messaging & queues** tracks helps for the producer side; the **TLS & Certificates** track for signing. Go is the primary language; the patterns translate to Node and Python directly.

</Callout>

## The 10 chapters, in order

**Foundations**

1. **What webhooks are and when to use them** — push vs pull, vs queues, vs WebSockets
2. **Event contract design** — types, fields, versioning, idempotency keys
3. **Sending webhooks** — the producer side in Go, in 60 lines
4. **Signing payloads** — HMAC, timestamps, the canonical string

**The receiver story**

5. **Verifying signatures** — timing-safe compare, replay windows, key rotation
6. **Retries and backoff** — exponential with jitter, deadlines, give-up rules
7. **Idempotency on the receiver** — dedup by event ID, the inbox pattern
8. **Delivery guarantees and the dead-letter queue** — at-least-once, when to drop

**Production**

9. **Observability and replay** — dashboards, per-endpoint metrics, manual replay UI
10. **Self-host** — outbox pattern, worker pool, behind nginx

## How to use this track

Read in order. The first four chapters ship a working sender; chapters 5–8 build the receiver story; the last two are operational. Total reading: ~3 hours. Hands-on, the first time you build the whole system: a long weekend.

You need Go 1.22+, Postgres, and a public-internet-reachable VPS for chapter 10 (webhooks need an inbound URL). For testing, **ngrok** or **smee.io** work locally.
