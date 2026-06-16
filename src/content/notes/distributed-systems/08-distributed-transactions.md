---
title: "Distributed Transactions"
subtitle: "Coordinating changes across services: two-phase commit and its blocking problem, sagas, the outbox pattern, and exactly-once myths."
chapter: 8
level: "mastery"
readingTime: "12 min"
topics: ["2pc", "saga", "outbox"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A single-database transaction gives you ACID: a set of changes either all commit or all roll back, atomically. The moment your operation spans two databases, two services, or a database *and* a message broker, that guarantee evaporates — there is no shared transaction to roll back. A **distributed transaction** is any unit of work that must take effect across multiple independent systems. This chapter surveys the techniques for making such work reliable, from the classic-but-flawed two-phase commit to the patterns most production systems actually use.

## Two-phase commit (2PC)

The textbook answer is **two-phase commit**, which introduces a **coordinator** that drives the participants through two phases:

```text
Phase 1 — PREPARE (voting):
  Coordinator -> all participants: "prepare to commit"
  Each participant does the work, locks resources, writes to its log,
    and replies YES (I can commit) or NO (I must abort).

Phase 2 — COMMIT / ABORT (decision):
  If ALL voted YES -> Coordinator -> all: "commit"
  If ANY voted NO  -> Coordinator -> all: "abort"
  Participants act, release locks, and acknowledge.
```

Once a participant votes YES in phase 1, it has *promised* to commit if asked — it must hold its locks and wait, unable to decide on its own. That promise is the source of 2PC's fatal weakness.

### The blocking problem

Suppose every participant has voted YES, and then **the coordinator crashes** before sending the phase-2 decision. Each participant is now stuck: it cannot commit (maybe someone voted NO) and cannot abort (maybe everyone voted YES and the coordinator already told someone to commit). It must hold its locks and **block**, waiting for the coordinator to recover. Until then, the locked rows are unavailable to everyone else.

```text
P1: voted YES  -> locked, waiting...
P2: voted YES  -> locked, waiting...
Coordinator: [CRASHED]   <- nobody can safely proceed
```

This makes the coordinator a single point of failure that can freeze the system. 2PC is therefore a **CP** protocol (chapter 5): it preserves consistency at the cost of availability, and a coordinator failure can stall participants indefinitely. (Three-phase commit reduces blocking but adds rounds and still fails under partitions, so it is rarely used.)

<Callout type="warning">

**Avoid 2PC across services.** Its synchronous locking couples the availability of every participant — the whole transaction is only as available as the *least* available service, and a coordinator crash blocks everyone holding locks. It is acceptable inside a single tightly-coupled system (e.g. a distributed database's internal commit) but a poor fit for coordinating independent microservices.

</Callout>

## Sagas

Because 2PC is too fragile for service-to-service work, most systems use **sagas**. A saga breaks one big distributed transaction into a sequence of **local** transactions, each committed independently in its own service. There are no global locks. If a step fails, the saga runs **compensating transactions** that semantically undo the completed steps — there is no rollback, only deliberate "undo" actions.

```text
Order saga (happy path):
  1. Order service:    create order        (local commit)
  2. Payment service:  charge card         (local commit)
  3. Inventory service: reserve stock      (local commit)
  4. Shipping service: schedule shipment   (local commit)

If step 3 fails:
  Compensate 2: refund the card
  Compensate 1: cancel the order
```

The crucial mental shift: a saga is **not atomic and not isolated**. There are intermediate states where the order exists but isn't paid, visible to other transactions. You must design those states to be acceptable, and you must write a compensating action for every step that has externally visible effects (you can refund a charge, but you cannot un-send an email — so design the email to come last, or to be cancelable).

Sagas come in two coordination flavors:

| | Orchestration | Choreography |
| --- | --- | --- |
| Control | A central **orchestrator** tells each service what to do next | Each service reacts to events and emits the next event; no central brain |
| Visibility | Flow is explicit in one place, easy to follow and monitor | Flow is emergent, spread across services, harder to trace |
| Coupling | Services coupled to the orchestrator | Services coupled to event schemas |
| Best for | Complex flows, many branches, clear ownership | Simple flows, loose coupling, few steps |

Neither is universally better. Orchestration shines when the workflow is complex and you need a single place to reason about it; choreography shines when steps are simple and you want minimal central coordination.

## The outbox pattern

Sagas advance by emitting events, which surfaces a subtle but vicious bug. Consider a service that must do two things: commit a row to its database *and* publish an event to a message broker. These are two different systems, so they cannot share a transaction. Whichever order you choose, a crash in between leaves them inconsistent:

```text
  commit DB row, then crash, then... event never published   -> lost event
  publish event, then crash, then... DB commit fails          -> phantom event
```

This is the **dual-write problem**, and it has no solution as long as you write to two systems separately. The **outbox pattern** dissolves it by writing to *only one* system in the critical path. Within the same local database transaction that changes your business data, you also insert the event into an **outbox table**:

```sql
BEGIN;
  UPDATE orders SET status = 'paid' WHERE id = 42;
  INSERT INTO outbox (event_type, payload)
    VALUES ('OrderPaid', '{"orderId": 42}');
COMMIT;
```

Because both writes are in one ACID transaction, they succeed or fail together — no dual write. A separate **relay process** then reads new rows from the outbox and publishes them to the broker, marking them sent once acknowledged. If the relay crashes mid-publish, it simply retries on restart; the event is still safely in the outbox.

<Callout type="info">

**Note:** The outbox relay guarantees **at-least-once** delivery, not exactly-once. The relay can publish an event and crash before recording that it did, then publish the same event again after restart. This is unavoidable and *fine* — it pushes the duplicate problem to the consumer, where idempotency (below) handles it cleanly. The relay can read the outbox by polling or, more efficiently, by tailing the database's change log (change data capture).

</Callout>

## Idempotency keys

An operation is **idempotent** if performing it twice has the same effect as performing it once. In a world of at-least-once delivery and retries, idempotency is not optional — it is the only thing standing between you and double charges. The standard technique is an **idempotency key**: the caller attaches a unique ID to the request, and the server records which keys it has already processed.

```text
Request carries: Idempotency-Key: 7f3a-...

Server:
  if key already in processed table:
      return the SAVED response   (do NOT re-run the work)
  else:
      do the work, store (key -> result) in the SAME transaction
      return the result
```

The key and the result must be stored in the *same transaction* as the work itself; otherwise a crash between doing the work and recording the key reopens the duplicate window. Done correctly, a retried request is recognized and the original outcome is returned — the card is charged exactly once no matter how many times the request arrives.

## Exactly-once: the myth and the reality

You will hear systems advertise **exactly-once delivery**. Taken literally, across an unreliable network, it is **impossible**: the sender can never know whether a lost acknowledgment means the message wasn't delivered or the *ack* was lost, so it must either risk losing the message (at-most-once) or risk duplicating it (at-least-once). There is no third option on the wire.

What is achievable — and what "exactly-once" really means in practice — is **exactly-once *processing*** (also called *effectively-once*): messages may be *delivered* more than once, but their *effect* on state happens exactly once. The recipe is always the same:

> **at-least-once delivery** (retries until acknowledged) **+ idempotent processing** (deduplication via idempotency keys) **= exactly-once effect.**

So the honest framing is: stop trying to make delivery exactly-once. Make delivery at-least-once and reliable, then make processing idempotent. That combination gives you the behavior people actually want.

<Callout type="tip">

**A coherent strategy:** use the **outbox** to reliably emit events from each service (at-least-once), drive cross-service workflows with **sagas** plus compensations (no global locks), and make every consumer **idempotent** with idempotency keys (so duplicates are harmless). This trio replaces the brittle 2PC with a design that stays available under partial failure — exactly the posture chapter 9 builds on.

</Callout>
