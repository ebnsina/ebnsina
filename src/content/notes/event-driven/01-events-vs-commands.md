---
title: "Events vs Commands vs Queries"
subtitle: "Three distinct message types with different semantics — understanding the difference shapes how you design every integration."
chapter: 1
level: "beginner"
readingTime: "8 min"
topics: ["events", "commands", "queries", "CQRS", "message semantics"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Three different ways to tell a colleague something: "Please send the report" is a command — directed, expects action. "The report has been sent" is an event — a fact that happened, broadcast to whoever cares. "Did you send the report?" is a query — expects a response with information. Mixing these up in code creates the same confusion it would in conversation.

</Callout>

## The Three Message Types

**Commands:** Tell a service to do something. Directed at a specific recipient. The sender cares whether it succeeds.

```typescript
// Command: imperative verb, directed, expects handling
interface SendPasswordResetEmail {
  type: 'SendPasswordResetEmail';
  userId: string;
  email: string;
  resetToken: string;
}

interface ProcessPayment {
  type: 'ProcessPayment';
  orderId: string;
  amount: number;
  customerId: string;
}
```

**Events:** Record that something happened. Broadcast to any interested party. The sender doesn't know or care who handles it.

```typescript
// Event: past tense, records a fact, no specific recipient
interface UserRegistered {
  type: 'UserRegistered';
  userId: string;
  email: string;
  plan: string;
  registeredAt: string; // ISO 8601
}

interface OrderPlaced {
  type: 'OrderPlaced';
  orderId: string;
  userId: string;
  totalAmount: number;
  items: OrderItem[];
  placedAt: string;
}
```

**Queries:** Request information. Expect a response. Typically synchronous (request/response).

```typescript
// Query: asks a question, expects an answer
interface GetUserById {
  type: 'GetUserById';
  userId: string;
}

interface GetOrderHistory {
  type: 'GetOrderHistory';
  userId: string;
  fromDate: string;
  limit: number;
}
```

## Why the Distinction Matters

The difference isn't just naming convention — it changes the coupling, failure modes, and semantics of your system.

**Commands create coupling:**
```
Service A → sends command → Service B
```
Service A knows about Service B. If B is down, the command fails. If B's interface changes, A breaks.

**Events decouple:**
```
Service A → emits event → Event Bus
                               ↓
                         Service B (subscribes)
                         Service C (subscribes)
                         Service D (subscribes)
```
Service A knows nothing about B, C, or D. New subscribers can be added without touching A. If B is down, the event waits in the queue; when B recovers, it processes it.

**Operational consequences:**

| | Command | Event |
|--|---------|-------|
| Coupling | Tight — sender knows receiver | Loose — sender knows only the event |
| Failure | Synchronous — both fail together | Asynchronous — sender unaffected |
| Recipients | One | Many |
| Expectation | Must succeed | Fire and forget |
| Naming | Imperative verb | Past tense |

## Event Naming Conventions

Events are facts — name them as such:

```typescript
// WRONG — sounds like a command, ambiguous
'ProcessOrder'
'UserUpdate'
'PaymentDone'

// RIGHT — past tense, specific, unambiguous
'OrderPlaced'
'UserEmailChanged'
'PaymentSucceeded'
'PaymentFailed'
'SubscriptionRenewed'
'InventoryDepleted'
```

A rule of thumb: if you can't use past tense, it's probably a command, not an event.

## Event Envelope

Wrap every event in a standard envelope with metadata:

```typescript
interface EventEnvelope<T = unknown> {
  // Routing and identification
  id: string;           // unique event ID (for deduplication)
  type: string;         // event type name
  version: number;      // schema version (for evolution)

  // Context
  correlationId: string; // request that triggered this event (for tracing)
  causationId: string;   // event that caused this event (for event chains)
  source: string;        // service that emitted this event

  // Timing
  timestamp: string;    // ISO 8601 UTC

  // Payload
  data: T;
}

// Example
const event: EventEnvelope<UserRegistered> = {
  id: crypto.randomUUID(),
  type: 'UserRegistered',
  version: 1,
  correlationId: 'req_abc123',  // from the HTTP request that created the user
  causationId: '',              // no parent event — triggered by user action
  source: 'user-service',
  timestamp: new Date().toISOString(),
  data: {
    type: 'UserRegistered',
    userId: 'u_xyz',
    email: 'user@example.com',
    plan: 'starter',
    registeredAt: new Date().toISOString(),
  },
};
```

The envelope lets any consumer understand where an event came from, when it happened, and relate it to other events — without parsing the payload.

## CQRS: Separating Reads from Writes

Command Query Responsibility Segregation separates the models for writing data (command side) from reading data (query side). Events bridge the two.

```typescript
// Command side: handles writes, emits events
class OrderService {
  async placeOrder(command: PlaceOrderCommand): Promise<void> {
    // Validate and persist
    const order = await this.db.orders.create({
      userId: command.userId,
      items: command.items,
      status: 'placed',
    });

    // Emit event — read side will update its own model
    await this.eventBus.publish({
      type: 'OrderPlaced',
      data: {
        orderId: order.id,
        userId: order.userId,
        items: order.items,
        totalAmount: order.totalAmount,
        placedAt: order.createdAt,
      },
    });
  }
}

// Query side: handles reads from a denormalized read model
class OrderQueryService {
  // Read model is updated by consuming 'OrderPlaced' events
  // Optimized for query patterns — might be in a different database
  async getOrderHistory(userId: string): Promise<OrderSummary[]> {
    return this.readDb.orderSummaries.findAll({ userId });
  }
}

// Event handler: keeps read model in sync
class OrderReadModelUpdater {
  async handleOrderPlaced(event: EventEnvelope<OrderPlaced>): Promise<void> {
    await this.readDb.orderSummaries.upsert({
      id: event.data.orderId,
      userId: event.data.userId,
      itemCount: event.data.items.length,
      totalAmount: event.data.totalAmount,
      status: 'placed',
      placedAt: event.data.placedAt,
    });
  }
}
```

CQRS is not always necessary — don't add it to a simple CRUD app. It pays off when read and write patterns are genuinely different (high read volume with complex filtering, or write patterns that trigger many downstream effects).

## When to Use Each

**Use commands when:**
- You need to know if the operation succeeded before continuing
- The operation is directed at a specific service
- The sender needs to handle failure (retry, compensate)

**Use events when:**
- Multiple services care about what happened
- The sender doesn't need to know the outcome
- You want to decouple services so they evolve independently
- You need an audit trail of what happened

**Use queries when:**
- You need current state
- The response is needed synchronously
- The operation is read-only (no side effects)

Mixing them deliberately is fine — an HTTP request (query) that triggers a command that emits an event is a common and correct pattern. The naming and semantics just need to be clear.

