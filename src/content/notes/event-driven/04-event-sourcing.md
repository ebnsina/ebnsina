---
title: "Event Sourcing"
subtitle: "Store events as the primary record instead of current state — rebuild any past state by replaying the event log."
chapter: 4
level: "advanced"
readingTime: "12 min"
topics: ["event sourcing", "event store", "aggregates", "projections", "snapshots"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A bank account statement: your bank doesn't store your current balance and erase the history. It stores every transaction — deposits, withdrawals, fees — and your current balance is derived by summing them. Every past state is recoverable. If there's a dispute, you can replay exactly what happened and when.

</Callout>

## The Core Idea

Traditional persistence stores current state — a row in a database with the latest values. When you update the row, the previous state is gone.

Event sourcing stores the sequence of events that led to the current state. Current state is derived by replaying the events.

```typescript
// Traditional: store current state
// orders table: { id, status, totalAmount, updatedAt }
// UPDATE orders SET status = 'shipped' WHERE id = 123;
// ← previous 'pending' status is gone

// Event sourcing: store events
// order_events: append-only log
[
  { type: 'OrderPlaced',   orderId: 123, items: [...], totalAmount: 9999, at: T1 },
  { type: 'PaymentTaken',  orderId: 123, amount: 9999,                    at: T2 },
  { type: 'OrderShipped',  orderId: 123, trackingId: 'UPS-456',           at: T3 },
]
// Current state is derived by replaying these three events
```

## Aggregates and Event Application

An **aggregate** is the domain object that owns the event stream. Its current state is rebuilt by applying each event in sequence.

```typescript
interface OrderEvent {
  type: string;
  orderId: string;
  at: string;
}

interface OrderPlaced extends OrderEvent {
  type: 'OrderPlaced';
  userId: string;
  items: OrderItem[];
  totalAmount: number;
}

interface OrderShipped extends OrderEvent {
  type: 'OrderShipped';
  trackingId: string;
  carrier: string;
}

interface OrderCancelled extends OrderEvent {
  type: 'OrderCancelled';
  reason: string;
}

// The aggregate: rebuilt from events
class Order {
  id!: string;
  userId!: string;
  status!: 'placed' | 'paid' | 'shipped' | 'cancelled';
  totalAmount!: number;
  trackingId?: string;

  // Rebuild state by applying events in order
  static fromEvents(events: OrderEvent[]): Order {
    const order = new Order();
    for (const event of events) {
      order.apply(event);
    }
    return order;
  }

  private apply(event: OrderEvent): void {
    switch (event.type) {
      case 'OrderPlaced': {
        const e = event as OrderPlaced;
        this.id = e.orderId;
        this.userId = e.userId;
        this.status = 'placed';
        this.totalAmount = e.totalAmount;
        break;
      }
      case 'OrderShipped': {
        const e = event as OrderShipped;
        this.status = 'shipped';
        this.trackingId = e.trackingId;
        break;
      }
      case 'OrderCancelled': {
        this.status = 'cancelled';
        break;
      }
    }
  }
}
```

## The Event Store

An append-only store for events. Each aggregate has its own stream identified by aggregate type + ID.

```typescript
interface StoredEvent {
  id: string;
  streamId: string;         // e.g. 'Order-123'
  type: string;
  version: number;          // position within the stream (1, 2, 3...)
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

class EventStore {
  // Append events to a stream
  async append(
    streamId: string,
    events: Omit<StoredEvent, 'id' | 'streamId' | 'version' | 'createdAt'>[],
    expectedVersion: number, // optimistic concurrency control
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // Check for concurrent writes (optimistic lock)
      const currentVersion = await tx.events.maxVersion(streamId);
      if (currentVersion !== expectedVersion) {
        throw new ConcurrencyError(
          `Stream ${streamId} at version ${currentVersion}, expected ${expectedVersion}`
        );
      }

      const stored = events.map((e, i) => ({
        ...e,
        id: crypto.randomUUID(),
        streamId,
        version: expectedVersion + i + 1,
        createdAt: new Date(),
      }));

      await tx.events.insertMany(stored);
    });
  }

  // Load all events for a stream
  async load(streamId: string, fromVersion = 0): Promise<StoredEvent[]> {
    return db.events.findAll({
      where: { streamId, version: { gte: fromVersion } },
      orderBy: { version: 'asc' },
    });
  }
}
```

**PostgreSQL event store table:**
```sql
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id   TEXT NOT NULL,                          -- 'Order-123'
  type        TEXT NOT NULL,                          -- 'OrderPlaced'
  version     INT NOT NULL,                           -- sequence within stream
  data        JSONB NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (stream_id, version)                         -- optimistic concurrency
);

CREATE INDEX ON events (stream_id, version);
CREATE INDEX ON events (created_at);                  -- for projections catching up
```

## Optimistic Concurrency

Two requests try to modify the same aggregate simultaneously. Optimistic concurrency prevents the second write from overwriting the first:

```typescript
class OrderService {
  async shipOrder(orderId: string, trackingId: string): Promise<void> {
    // Load current events
    const events = await eventStore.load(`Order-${orderId}`);
    const order = Order.fromEvents(events);
    const expectedVersion = events.length; // version after last event

    if (order.status !== 'paid') {
      throw new Error('Cannot ship unpaid order');
    }

    const newEvent = {
      type: 'OrderShipped',
      data: { orderId, trackingId, at: new Date().toISOString() },
      metadata: {},
    };

    // If another request appended an event between our load and this append,
    // the version check fails and we retry
    await eventStore.append(`Order-${orderId}`, [newEvent], expectedVersion);
  }
}
```

## Projections

A projection is a read model built by consuming the event stream. Different projections answer different questions from the same event history.

```typescript
class OrderSummaryProjection {
  // Called for each event in order as they arrive
  async handle(event: StoredEvent): Promise<void> {
    switch (event.type) {
      case 'OrderPlaced':
        await db.orderSummaries.insert({
          id: event.data.orderId,
          userId: event.data.userId,
          status: 'placed',
          totalAmount: event.data.totalAmount,
          placedAt: event.data.at,
        });
        break;

      case 'OrderShipped':
        await db.orderSummaries.update(event.data.orderId, {
          status: 'shipped',
          trackingId: event.data.trackingId,
          shippedAt: event.data.at,
        });
        break;

      case 'OrderCancelled':
        await db.orderSummaries.update(event.data.orderId, {
          status: 'cancelled',
          cancelledAt: event.data.at,
        });
        break;
    }
  }
}

// Rebuild projection from scratch (when you add new fields or fix a bug)
async function rebuildOrderSummaries(): Promise<void> {
  await db.orderSummaries.truncate();

  const allEvents = await db.events.findAll({
    where: { type: { in: ['OrderPlaced', 'OrderShipped', 'OrderCancelled'] } },
    orderBy: { createdAt: 'asc' },
  });

  const projection = new OrderSummaryProjection();
  for (const event of allEvents) {
    await projection.handle(event);
  }
}
```

**Key advantage:** You can create new projections retroactively by replaying history. Added a new analytics requirement? Build a new projection from existing events — no data lost.

## Snapshots

Loading thousands of events to rebuild an aggregate is slow. Snapshots checkpoint the aggregate state periodically:

```typescript
interface Snapshot {
  streamId: string;
  version: number;          // event version this snapshot was taken at
  state: Record<string, unknown>;
  createdAt: Date;
}

class SnapshotStore {
  async save(streamId: string, version: number, state: unknown): Promise<void> {
    await db.snapshots.upsert({ streamId, version, state, createdAt: new Date() });
  }

  async load(streamId: string): Promise<Snapshot | null> {
    return db.snapshots.findLatest(streamId);
  }
}

// Load aggregate: snapshot + events since snapshot
async function loadOrder(orderId: string): Promise<Order> {
  const snapshot = await snapshotStore.load(`Order-${orderId}`);

  if (snapshot) {
    // Load only events after the snapshot
    const events = await eventStore.load(`Order-${orderId}`, snapshot.version + 1);
    const order = Order.fromSnapshot(snapshot.state);
    for (const event of events) order.apply(event);
    return order;
  }

  // No snapshot: load all events from beginning
  const events = await eventStore.load(`Order-${orderId}`);
  return Order.fromEvents(events);
}

// Take snapshot every 50 events
async function maybeSnapshot(orderId: string, currentVersion: number): Promise<void> {
  if (currentVersion % 50 === 0) {
    const order = await loadOrder(orderId);
    await snapshotStore.save(`Order-${orderId}`, currentVersion, order.toSnapshot());
  }
}
```

## When to Use Event Sourcing

Event sourcing adds real complexity. Use it when:

- **Audit log is mandatory** — financial systems, healthcare, compliance
- **Business wants temporal queries** — "what was the state of this order on Tuesday?"
- **Multiple read models needed** — events as the single source feeding many projections
- **Debugging production issues** — replay events to reproduce bugs exactly

Don't use it for:
- Simple CRUD with no audit requirements
- Small teams without experience with the pattern
- Systems where the operational complexity of rebuilding projections is too high

Event sourcing pairs naturally with CQRS and pub/sub: events are stored in the event store, published to a bus, and consumed by projection builders — all consistent, all from one write.

