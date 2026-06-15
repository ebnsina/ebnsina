---
title: "Integration Testing"
subtitle: "Testing real boundaries — database queries, HTTP handlers, message queues — without mocking what matters."
chapter: 3
level: "beginner"
readingTime: "10 min"
topics: ["integration testing", "database testing", "HTTP testing", "Testcontainers", "supertest", "migrations"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Testing a new employee's first day working with real coworkers, not role-playing it in a training room. The training (unit tests) teaches the job; the real first day reveals whether the knowledge translates — whether they can actually use the filing system, talk to the right people, follow the actual workflows.

</Callout>

## Why Integration Tests Need Real Dependencies

```typescript
// This test will always pass even if your SQL is wrong
const mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
await createUser(mockDb, { email: 'test@example.com' });
// mockDb.query was called — but did the INSERT work?
// Does the email uniqueness constraint fire? No.
// Does the trigger that creates a profile row run? No.
// You tested that your code calls query(). That's it.

// A real test DB catches:
// - Syntax errors in SQL
// - Wrong column names
// - Constraint violations
// - Missing indexes causing slow queries
// - Trigger side effects
// - Transaction behavior
```

## Database Integration Tests

Use a real database. Roll back after each test:

```typescript
// src/test/setup.ts
import { Pool } from 'pg';
import { runMigrations } from '../db/migrate';

export const testDb = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://test:test@localhost:5432/testdb',
});

// Run migrations once before all tests
beforeAll(async () => {
  await runMigrations(testDb);
});

// Clean up after all tests
afterAll(async () => {
  await testDb.end();
});
```

```typescript
// src/users/users.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb } from '../test/setup';
import { createUser, getUserByEmail } from './users';

describe('users integration', () => {
  beforeEach(async () => {
    await testDb.query('BEGIN');
  });

  afterEach(async () => {
    await testDb.query('ROLLBACK');
  });

  it('creates a user and retrieves by email', async () => {
    const email = 'alice@example.com';

    const user = await createUser(testDb, { email, name: 'Alice' });

    expect(user.id).toBeDefined();
    expect(user.email).toBe(email);

    const found = await getUserByEmail(testDb, email);
    expect(found?.id).toBe(user.id);
  });

  it('enforces unique email constraint', async () => {
    await createUser(testDb, { email: 'alice@example.com', name: 'Alice' });

    await expect(
      createUser(testDb, { email: 'alice@example.com', name: 'Other' })
    ).rejects.toThrow(/unique/i);
  });

  it('returns null for nonexistent email', async () => {
    const result = await getUserByEmail(testDb, 'nobody@example.com');
    expect(result).toBeNull();
  });
});
```

**Transaction rollback** means tests don't interfere with each other — each test starts with a clean slate and leaves no trace.

## Testcontainers — Spin Up Dependencies in CI

Testcontainers starts real Docker containers for your test run — no pre-configured test DB needed:

```bash
npm install -D @testcontainers/postgresql
```

```typescript
// src/test/db-container.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { runMigrations } from '../db/migrate';

let pool: Pool;

export async function startTestDatabase() {
  const container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('testdb')
    .start();

  pool = new Pool({ connectionString: container.getConnectionUri() });

  await runMigrations(pool);

  return {
    pool,
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
```

```typescript
// vitest.config.ts — global setup
export default defineConfig({
  test: {
    globalSetup: './src/test/global-setup.ts',
  },
});

// src/test/global-setup.ts
import { startTestDatabase } from './db-container';

export async function setup() {
  const { pool, stop } = await startTestDatabase();
  process.env.DATABASE_URL = pool.options.connectionString;
  return stop;  // Vitest calls this as teardown
}
```

## HTTP Integration Tests

Test your HTTP layer end-to-end — real server, real DB, real middleware:

```bash
npm install -D supertest @types/supertest
```

```typescript
// src/app.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from './app';
import { testDb } from './test/setup';

const request = supertest(app);

describe('POST /users', () => {
  it('creates user and returns 201', async () => {
    const res = await request
      .post('/users')
      .send({ email: 'bob@example.com', name: 'Bob' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe('bob@example.com');
  });

  it('returns 400 for duplicate email', async () => {
    await request.post('/users').send({ email: 'dup@example.com', name: 'First' });

    const res = await request
      .post('/users')
      .send({ email: 'dup@example.com', name: 'Second' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('returns 422 for invalid email', async () => {
    const res = await request
      .post('/users')
      .send({ email: 'not-an-email', name: 'Bob' });

    expect(res.status).toBe(422);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ field: 'email' })
    );
  });
});

describe('GET /users/:id', () => {
  it('returns 404 for missing user', async () => {
    const res = await request.get('/users/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});
```

## Testing Authenticated Routes

```typescript
// Helper: create a test user and get auth token
async function authenticatedRequest(overrides: Partial<User> = {}) {
  const user = await createUser(testDb, {
    email: `test-${randomUUID()}@example.com`,
    ...overrides,
  });
  const token = signJwt({ userId: user.id, role: user.role });

  return {
    user,
    agent: supertest(app).set('Authorization', `Bearer ${token}`),
  };
}

// Use in tests
it('allows admin to delete users', async () => {
  const { agent } = await authenticatedRequest({ role: 'admin' });
  const target = await createUser(testDb, { email: 'victim@example.com' });

  const res = await agent.delete(`/users/${target.id}`);
  expect(res.status).toBe(204);
});

it('blocks standard user from deleting', async () => {
  const { agent } = await authenticatedRequest({ role: 'standard' });
  const target = await createUser(testDb, { email: 'victim@example.com' });

  const res = await agent.delete(`/users/${target.id}`);
  expect(res.status).toBe(403);
});
```

## Testing External HTTP APIs

For external services you don't control, use `msw` (Mock Service Worker) to intercept HTTP at the network level — not at the import level:

```bash
npm install -D msw
```

```typescript
// src/test/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('https://api.stripe.com/v1/charges', () => {
    return HttpResponse.json({
      id: 'ch_test123',
      status: 'succeeded',
      amount: 100_00,
    });
  }),

  http.post('https://api.sendgrid.com/v3/mail/send', () => {
    return new HttpResponse(null, { status: 202 });
  }),
];

// src/test/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./src/test/msw-setup.ts'],
  },
});

// src/test/msw-setup.ts
import { server } from './server';
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

```typescript
// Override for specific test
it('handles Stripe payment failure', async () => {
  server.use(
    http.post('https://api.stripe.com/v1/charges', () => {
      return HttpResponse.json({ error: { code: 'card_declined' } }, { status: 402 });
    })
  );

  const result = await processPayment({ amount: 50_00, card: 'tok_declined' });
  expect(result.success).toBe(false);
  expect(result.error).toBe('card_declined');
});
```

## Testing Message Queue Consumers

```typescript
// Test the consumer function directly — no need to run a real queue
import { processOrderEvent } from './order-consumer';

it('marks order as shipped on ShipmentCreated event', async () => {
  const orderId = await createOrder(testDb, { userId: 'user-1', totalCents: 50_00 });

  await processOrderEvent(testDb, {
    type: 'ShipmentCreated',
    orderId,
    trackingNumber: 'TRACK123',
  });

  const order = await getOrder(testDb, orderId);
  expect(order.status).toBe('shipped');
  expect(order.trackingNumber).toBe('TRACK123');
});

// For testing that the right events are published, spy on the publisher
it('publishes OrderShipped event after processing', async () => {
  const publish = vi.fn();
  const orderId = await createOrder(testDb, { userId: 'user-1', totalCents: 50_00 });

  await processOrderEvent(testDb, { type: 'ShipmentCreated', orderId }, { publish });

  expect(publish).toHaveBeenCalledWith(
    'orders',
    expect.objectContaining({ type: 'OrderShipped', orderId })
  );
});
```

## Database Seeding Helpers

```typescript
// src/test/factories.ts
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

export async function seedUser(db: Pool, overrides: Partial<User> = {}): Promise<User> {
  const { rows } = await db.query(
    `INSERT INTO users (id, email, name, role, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING *`,
    [
      randomUUID(),
      overrides.email ?? `user-${randomUUID()}@example.com`,
      overrides.name ?? 'Test User',
      overrides.role ?? 'standard',
    ]
  );
  return rows[0];
}

export async function seedProduct(db: Pool, overrides: Partial<Product> = {}): Promise<Product> {
  const { rows } = await db.query(
    `INSERT INTO products (id, name, price_cents, in_stock)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      randomUUID(),
      overrides.name ?? 'Test Product',
      overrides.priceCents ?? 10_00,
      overrides.inStock ?? true,
    ]
  );
  return rows[0];
}
```

Factories keep test setup readable and maintainable — when schema changes, fix the factory once.

