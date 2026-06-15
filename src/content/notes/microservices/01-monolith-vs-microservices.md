---
title: "Monolith vs Microservices"
subtitle: "The real costs of splitting — when a monolith is the right call, when it isn't, and how to identify the seams before you cut."
chapter: 1
level: "beginner"
readingTime: "9 min"
topics: ["microservices", "monolith", "architecture", "domain boundaries", "decomposition"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A Swiss Army knife vs a professional chef's knife set: the Swiss Army knife does everything in one package — easy to carry, no coordination needed. A chef's set has specialized tools that each do one thing superbly. But the chef's set requires knowing which knife to grab, keeping them all sharp, and not losing any. The right choice depends on what you're cooking and how many cooks are in the kitchen.

</Callout>

## The Monolith Is Not the Enemy

A well-structured monolith is faster to develop, easier to debug, simpler to deploy, and has lower operational overhead than a microservices architecture. Most teams split too early, not too late.

What a monolith gives you:
- **In-process calls** — no network latency, no serialization, no partial failure between components
- **Atomic transactions** — one database, ACID across all operations
- **Simple deployment** — one artifact, one deploy, one rollback
- **Easy debugging** — one process, one log stream, one stack trace

The monolith only becomes a problem when specific constraints emerge:
- **Independent deployment** — two teams want to deploy without coordinating releases
- **Independent scaling** — the checkout flow needs 10x resources but the admin panel needs none
- **Technology isolation** — the ML team needs Python; the rest of the codebase is Node
- **Fault isolation** — one unreliable component should not take down the entire system

If none of these constraints apply, the monolith is the right choice.

## The Real Costs of Microservices

Every service boundary you draw adds:

**Network calls replace function calls:**
```typescript
// Monolith — in-process, never fails due to network
const user = userRepository.findById(userId);

// Microservices — can fail, can be slow, needs timeout/retry
const user = await userServiceClient.getUser(userId, { timeout: 5000, retries: 3 });
```

**Distributed transactions replace ACID transactions:**
```typescript
// Monolith — one transaction, all-or-nothing
await db.transaction(async (tx) => {
  await tx.update('orders', { status: 'confirmed' });
  await tx.insert('payments', { orderId, amount });
  await tx.update('inventory', { itemId, quantity: quantity - 1 });
});

// Microservices — three services, three databases, eventual consistency
// If payment succeeds but inventory update fails: manual compensation needed
await orderService.confirm(orderId);        // can succeed
await paymentService.charge(orderId);       // can succeed
await inventoryService.decrement(itemId);   // can fail — now what?
```

**Operational overhead multiplies:**
- 10 services = 10 CI pipelines, 10 deployment configs, 10 monitoring dashboards
- Service discovery, load balancing, circuit breakers needed for every call
- Distributed tracing required to follow a request across services
- Local development requires running all dependencies (or mocking them)

## Identifying Domain Boundaries

Before splitting, find the seams. Good seams have:

1. **High cohesion inside** — the data and logic inside a boundary change together
2. **Low coupling outside** — the boundary interacts with others through a narrow, stable interface
3. **Independent lifecycle** — the team responsible can deploy without coordinating

A practical heuristic: if changing a feature requires modifying code in more than 2 bounded contexts, your boundary is wrong.

**Event storming as a tool:** Gather the team, map all domain events on a timeline (`OrderPlaced`, `PaymentCharged`, `ItemShipped`). Cluster events that always change together — those clusters are your bounded contexts.

```
[OrderPlaced] [OrderCancelled]     → Order domain
[PaymentCharged] [PaymentRefunded] → Payment domain
[ItemReserved] [ItemShipped]       → Fulfillment domain
[UserRegistered] [UserDeleted]     → Identity domain
```

## The Strangler Fig Pattern

Don't rewrite — migrate incrementally. Build the new service alongside the monolith; redirect specific paths to it; shrink the monolith over time.

```nginx
# API gateway or nginx: route by path
location /api/v2/payments/ {
    proxy_pass http://payment-service;   # new microservice
}

location /api/ {
    proxy_pass http://monolith;          # everything else still in monolith
}
```

Steps:
1. Identify the piece to extract (high-value and well-defined)
2. Build the new service with its own database
3. Route traffic to the new service
4. Delete the corresponding code from the monolith
5. Repeat

The monolith shrinks with each migration. You never have a big-bang rewrite.

## Data Ownership

Each service must own its data. No service reads another service's database directly.

```
✗ PaymentService reads FROM orders table in OrderService's DB
✓ PaymentService calls OrderService API or consumes order events
```

Shared databases create hidden coupling — a schema change in one service breaks another. Own your schema; expose your data through APIs or events.

**Database-per-service patterns:**
- Different schema in the same PostgreSQL instance (cheap, acceptable for small teams)
- Different PostgreSQL instances (true isolation, higher ops cost)
- Different database technology per service (Postgres for orders, Redis for sessions, Elasticsearch for search)

## When to Split

A useful checklist before extracting a service:

```
[ ] Two teams actively block each other on deploys (not just occasionally)
[ ] This component needs to scale independently (10x traffic differential)
[ ] This component needs a different technology stack (ML model, Go for performance)
[ ] This component fails in a way that takes down unrelated features
[ ] The domain boundary is clear and stable (not actively evolving)
[ ] The team owns the full lifecycle (not a shared component)
```

If fewer than 3 boxes are checked: keep it in the monolith. The coordination overhead is not justified.

## The Modular Monolith Middle Ground

A monolith with enforced module boundaries gets many microservice benefits without the operational overhead:

```typescript
// src/modules/orders/
//   orders.service.ts
//   orders.repository.ts
//   orders.types.ts
//   index.ts  ← public API of this module

// src/modules/payments/
//   payments.service.ts
//   payments.repository.ts
//   index.ts

// Enforce: payments can only import from orders/index.ts
// Never: import { OrderRepository } from '../orders/orders.repository'
```

Tools like `eslint-plugin-boundaries` enforce module constraints at the linter level. The boundary is real — crossing it requires going through the public interface. When the time comes to extract a service, the seam already exists.

This is the right starting point for most teams. Extract services only when the specific pressure justifies it.

