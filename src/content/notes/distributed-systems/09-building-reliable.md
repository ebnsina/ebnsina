---
title: "Building Reliable Distributed Systems"
subtitle: "Putting it together: retries with backoff and jitter, idempotency and deduplication, delivery semantics, and durable execution."
chapter: 9
level: "mastery"
readingTime: "12 min"
topics: ["idempotency", "retries", "durable execution"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Everything so far has been about understanding distributed systems. This final chapter is about *operating* in one: the concrete, hard-won patterns that turn the inevitability of partial failure into something your system survives gracefully. The unifying mindset is simple to state and hard to internalize — **assume every remote call can fail, time out, or succeed-but-look-like-it-failed, and design so that handling that case is the normal path, not the exception.**

## Retries

When a remote call fails or times out, the first instinct is to retry — and it is usually right, because many failures are transient (a brief blip, a momentary overload). But naive retries are dangerous in two distinct ways, and you must defend against both.

### The thundering herd

If a service hiccups and a thousand clients all retry immediately, they hit the recovering service with a synchronized wall of traffic, knocking it down again. The retries *cause* the next outage. The defenses are backoff and jitter.

**Exponential backoff:** wait longer after each successive failure — 1s, 2s, 4s, 8s — giving the struggling service room to recover instead of hammering it.

**Jitter:** add randomness to each wait so retries spread out in time rather than firing in lockstep. Without jitter, exponential backoff still synchronizes all clients onto the same retry instants (everyone waits exactly 2s, then exactly 4s).

```text
No jitter:        all clients retry at t = 1, 2, 4, 8  (synchronized spikes)
Full jitter:      each waits random(0, 2^n)            (smoothly spread out)

wait = random_between(0, min(cap, base * 2^attempt))
```

**Full jitter** — picking a random delay anywhere between zero and the backoff ceiling — is the simplest scheme that works well; it both backs off and de-synchronizes.

### Knowing when not to retry

Retries only make sense for *transient* failures. Retrying a deterministic error (a `400 Bad Request`, a validation failure) just wastes resources — it will fail identically every time. And retries must be **bounded**: cap the number of attempts and the total time, then give up and surface the failure. Unbounded retries turn a transient blip into a permanent resource leak. Pair retries with a **circuit breaker**: after too many failures to a dependency, stop calling it for a cooldown period, failing fast instead of piling up.

<Callout type="warning">

**Retries multiply load at the worst possible moment** — during an outage, when the system is already struggling. Always combine retries with exponential backoff, jitter, a hard attempt cap, and a circuit breaker. Retries without these turn a small incident into a self-inflicted, cascading outage.

</Callout>

## Idempotency is the prerequisite for retries

Here is the catch that makes the previous chapter essential: **you cannot safely retry an operation unless it is idempotent.** Recall the slow-vs-dead ambiguity (chapter 2) — when a call times out, the operation may have *already succeeded*; the response just got lost. If you retry a non-idempotent operation in that situation, you do it twice: a double charge, a duplicate order, a doubled balance.

So retries and idempotency are inseparable. Before you add a retry anywhere, ensure the target operation is idempotent — naturally (setting a value, which is the same however many times you do it) or via an **idempotency key** (chapter 8) that lets the server recognize and de-duplicate a repeated request.

## Delivery semantics

Every message-passing system makes one of three guarantees. Knowing which one you have — and which one you need — is fundamental.

| Semantic | Guarantee | Risk | How |
| --- | --- | --- | --- |
| **At-most-once** | Delivered zero or one time | May **lose** messages | Send and forget; never retry |
| **At-least-once** | Delivered one or more times | May **duplicate** messages | Retry until acknowledged |
| **Exactly-once** | Effect happens once | (Impossible as pure delivery) | At-least-once **+** idempotent consumer |

The practical takeaways:

- **At-most-once** is acceptable only when losing a message is harmless — metrics, best-effort notifications.
- **At-least-once** is the sensible default for anything that matters: retry until you get an acknowledgment, accept that duplicates will happen.
- **Exactly-once** processing is achieved, not delivered: at-least-once plus a deduplicating, idempotent consumer (chapter 8). Stop chasing exactly-once *delivery*; it does not exist on an unreliable network.

## Deduplication

At-least-once delivery means duplicates are guaranteed, so consumers need to recognize and drop them. Practical dedup strategies:

- **Idempotency key on each message** plus a store of processed keys — the consumer skips a key it has already handled.
- **Natural idempotency** — design the operation so a replay is a no-op (e.g. "set status to shipped" rather than "increment shipped count").
- **A deduplication window** — keep recently-seen message IDs for a bounded time (a TTL set, a Bloom filter), assuming duplicates arrive close together. This trades a tiny risk of a missed dedup against unbounded storage.

The dedup store has the same requirement as idempotency keys: marking a message "processed" and applying its effect must be **atomic**, or a crash between them reopens the duplicate window.

## Durable execution and workflows

A multi-step workflow — the order saga of chapter 8 — has a fragile property: if the process running it crashes at step 3, where does it resume? Plain code holds its progress in memory and in the call stack, both of which vanish on a crash. You are left writing tangled state machines and recovery logic by hand for every workflow.

**Durable execution** engines (Temporal, AWS Step Functions, restate, and similar) solve this directly. They run your workflow as ordinary-looking code, but **persist every step's input and result** to durable storage as the workflow progresses. If the worker crashes, the engine restarts the workflow on another worker and **replays** it, skipping completed steps by feeding back their recorded results — so execution resumes exactly where it left off, sometimes hours or days later.

```text
Workflow: charge -> reserve -> ship

Engine records:  charge done (result saved)
                 reserve done (result saved)
                 [WORKER CRASHES before ship]

On recovery:     replay -> charge: use saved result (skip)
                           reserve: use saved result (skip)
                           ship: actually run    <- resumes here
```

For replay to be correct, the durable engine relies on the very ideas from this whole track: steps must be **idempotent** (replay may re-invoke a step whose result wasn't recorded before the crash), and side effects go through the engine so they can be tracked and retried. Durable execution is, in effect, the saga + outbox + idempotency + retry stack of chapter 8 packaged as a reusable runtime — which is why it has become the modern default for orchestrating long-running, multi-service workflows.

<Callout type="info">

**Note:** Durable execution does not repeal the laws of distributed systems — it *encapsulates* the patterns you would otherwise build by hand. Your activities still must be idempotent, your timeouts still can't tell slow from dead, and "exactly-once" is still really at-least-once plus dedup. The engine just removes the boilerplate of persisting and resuming workflow state.

</Callout>

## Designing for partial failure: a checklist

Pulling the whole track together, a system that survives the real world tends to share these traits:

- **Assume every dependency can be unavailable.** Add timeouts to every remote call; never block forever.
- **Make operations idempotent** so retries and replays are safe.
- **Retry with exponential backoff, jitter, a cap, and a circuit breaker** — never naively.
- **Choose at-least-once delivery** and pair it with idempotent, deduplicating consumers.
- **Avoid 2PC across services**; use sagas with compensations and the outbox pattern.
- **Degrade gracefully:** serve stale data or a reduced feature set rather than failing completely, where the consistency model allows it.
- **Pick the weakest consistency model** that meets each requirement, to maximize availability and minimize latency.
- **Make failure observable:** without good metrics, logs, and traces, you cannot tell slow from dead — the central problem of chapter 2 — let alone fix it.

<Callout type="tip">

**The one habit that matters most:** treat the unhappy path as the main path. In distributed systems, timeouts, retries, duplicates, and partial failures are not edge cases you handle if you have time — they are the normal operating condition. Code that handles them first, and the happy path as a special case of "nothing went wrong this time," is code that survives production.

</Callout>
