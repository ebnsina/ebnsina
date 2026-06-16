---
title: "Pub/Sub & Streams"
subtitle: "Fire-and-forget messaging versus a durable, replayable log with consumer groups."
chapter: 5
level: "intermediate"
readingTime: "13 min"
topics: ["pubsub", "streams", "consumer groups"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Redis can move messages between processes, not just store values. It offers two very different tools for this: Pub/Sub, a lightweight broadcast with no memory, and Streams, a durable append-only log with delivery guarantees. They look superficially similar and are constantly confused. This chapter draws the line and shows when each fits.

## Pub/Sub: fire-and-forget broadcast

In Pub/Sub, publishers send messages to named **channels** and subscribers receive whatever is published while they are listening. There is no storage and no queue — a message is delivered to every connected subscriber at that instant and then forgotten.

```text
# Terminal A — subscriber
127.0.0.1:6379> SUBSCRIBE news:tech
Reading messages... (press Ctrl-C to quit)
1) "subscribe"
2) "news:tech"
3) (integer) 1

# Terminal B — publisher
127.0.0.1:6379> PUBLISH news:tech "Redis 8 released"
(integer) 1          # number of subscribers that received it

# Terminal A now shows
1) "message"
2) "news:tech"
3) "Redis 8 released"
```

Pattern subscriptions let one subscriber match many channels:

```text
127.0.0.1:6379> PSUBSCRIBE news:*
```

**Where it fits.** Real-time fan-out where losing a message is acceptable and you only care about the *now*: live notifications, presence updates, chat to currently-connected clients, cache-invalidation signals across app servers, and broadcasting config changes.

### The limitations

Pub/Sub's simplicity is also its ceiling, and you must design around these:

- **No persistence.** A message published when no one is subscribed is gone. A subscriber that connects one millisecond too late never sees it.
- **No acknowledgement.** The publisher gets a count of recipients but no proof anyone processed the message.
- **No replay.** A subscriber that disconnects and reconnects has no way to catch up on what it missed.
- **At-most-once delivery.** If a subscriber is slow and its buffer overflows, Redis drops it. There is no redelivery.

If any of those guarantees matter — and for a job queue or an event log they almost always do — Pub/Sub is the wrong tool. That is exactly the gap Streams fill.

<Callout type="warning">

**Note:** The classic Pub/Sub trap is using it as a job queue. Because there is no persistence or ack, a worker that restarts, lags, or is briefly offline silently loses jobs, and nothing tells you. For anything that must be processed reliably, use Streams or a list-based queue (chapter 6), not Pub/Sub.

</Callout>

## Streams: a durable, replayable log

A Stream is an append-only log of entries, each with an auto-generated ID (a millisecond timestamp plus a sequence number) and a set of field-value pairs. Entries persist until you trim them, multiple consumers can read independently, and everyone can replay history. Think of it as Redis's answer to a Kafka-style log.

```text
127.0.0.1:6379> XADD orders * item "book" qty 2
"1718553600000-0"
127.0.0.1:6379> XADD orders * item "pen" qty 5
"1718553600050-0"
127.0.0.1:6379> XLEN orders
(integer) 2
127.0.0.1:6379> XRANGE orders - +
1) 1) "1718553600000-0"
   2) 1) "item"
      2) "book"
      3) "qty"
      4) "2"
2) 1) "1718553600050-0"
   2) 1) "item"
      2) "pen"
      3) "qty"
      4) "5"
```

The `*` tells Redis to generate the ID. `XADD ... MAXLEN ~ 10000` caps the stream length so it does not grow forever. To read new entries as they arrive, `XREAD` can block:

```text
127.0.0.1:6379> XREAD COUNT 10 BLOCK 5000 STREAMS orders $
```

Here `$` means "only entries added after I started reading," and `BLOCK 5000` waits up to five seconds for one to appear. Passing a specific ID instead of `$` lets a reader resume exactly where it left off — the replay that Pub/Sub cannot do.

## Consumer groups

A single blocking reader does not scale; you want several workers sharing the load with no entry processed twice. **Consumer groups** provide exactly that. The group tracks a shared cursor, and Redis hands each new entry to one consumer in the group.

```text
127.0.0.1:6379> XGROUP CREATE orders workers $ MKSTREAM
OK
# worker "w1" claims the next undelivered entries
127.0.0.1:6379> XREADGROUP GROUP workers w1 COUNT 1 STREAMS orders >
1) 1) "orders"
   2) 1) 1) "1718553600100-0"
         2) 1) "item"
            2) "lamp"
# after processing, acknowledge it
127.0.0.1:6379> XACK orders workers 1718553600100-0
(integer) 1
```

The `>` means "entries never delivered to any consumer in this group." Each delivered entry enters that consumer's **Pending Entries List (PEL)** and stays there until `XACK`. This is what makes delivery reliable:

- **At-least-once delivery.** An entry stays pending until explicitly acknowledged, so a worker that crashes mid-job leaves the entry recoverable.
- **Recovery with `XPENDING` and `XCLAIM`.** `XPENDING` lists entries delivered but not yet acked (and how long they have been idle). `XCLAIM` (or `XAUTOCLAIM`) lets another worker take over entries a dead consumer never finished.
- **Load balancing.** Add more consumers to the group and Redis spreads new entries across them automatically.

```text
127.0.0.1:6379> XPENDING orders workers
1) (integer) 1
2) "1718553600100-0"
3) "1718553600100-0"
4) 1) 1) "w1"
      2) "1"
```

<Callout type="info">

**Note:** Pub/Sub and Streams answer different questions. Pub/Sub asks "who is listening *right now*?" Streams ask "what happened, and has each event been handled?" Pub/Sub keeps no state; Streams keep a durable log plus per-group delivery state. If you need acknowledgement, replay, or load-balanced workers, it is Streams.

</Callout>

## Streams vs a real message broker

Streams are genuinely capable, but they are not a full replacement for Kafka, RabbitMQ, or a managed queue. Choose deliberately:

- **Reach for Streams** when you already run Redis, throughput and retention are moderate, and you want a durable queue or event log without operating another system. The latency is excellent and the API is simple.
- **Reach for a dedicated broker** when you need very high sustained throughput, long retention measured in days or weeks, partitioning across many nodes, complex routing and exchanges (RabbitMQ), strong ordering and exactly-once semantics across a cluster, or an ecosystem of connectors. A Stream's data still has to fit alongside everything else in Redis's memory, which bounds how much history you can hold.

The honest summary: Streams are the right amount of durability and delivery guarantee for many in-house workloads, and a good reason not to add Kafka prematurely — but at large scale or with demanding routing needs, a purpose-built broker earns its operational cost.
