---
title: 'Testing Strategy'
subtitle: 'The testing pyramid, what each layer tests, and how to avoid the traps that make test suites slow and fragile.'
chapter: 1
level: 'beginner'
readingTime: '7 min'
topics: ['testing pyramid', 'unit tests', 'integration tests', 'e2e tests', 'test strategy', 'TDD']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Quality control in a car factory: inspectors check individual bolts (unit tests), then assembled subcomponents like the engine block (integration tests), then drive the finished car around the test track (e2e tests). The bolt inspectors are fast and cheap — you run them on every part. You don't drive every car through a full road course for every weld you make.

</Callout>

## The Testing Pyramid

```
        ┌─────────────┐
        │     E2E      │  ← few, slow, expensive, high confidence
        ├─────────────┤
        │ Integration  │  ← moderate, medium speed, test real boundaries
        ├─────────────┤
        │    Unit      │  ← many, fast, cheap, test logic in isolation
        └─────────────┘
```

Most projects have this inverted — many slow e2e tests, few unit tests. This is a trap: e2e tests break for the wrong reasons, don't tell you what failed, and take 20 minutes per CI run.

## What Each Layer Tests

**Unit tests** — pure functions, domain logic, transformations, edge cases. No I/O, no network, no database. Fast enough to run on every file save.

```typescript
// Good unit test: tests logic, no I/O
import { calculateDiscount } from './pricing';

test('applies 20% discount for premium members', () => {
	expect(calculateDiscount(100_00, 'premium')).toBe(80_00);
});

test('no discount for standard members', () => {
	expect(calculateDiscount(100_00, 'standard')).toBe(100_00);
});

test('never discounts below zero', () => {
	expect(calculateDiscount(0, 'premium')).toBe(0);
});
```

**Integration tests** — test the boundary between your code and something real: a database, a third-party API, a message queue. Run against a real (test) instance, not mocks.

```typescript
// Integration test: hits a real test database
import { createOrder } from './orders';
import { db } from './db';

beforeAll(async () => {
	await db.query('BEGIN');
});

afterAll(async () => {
	await db.query('ROLLBACK');
});

test('creates order with correct total', async () => {
	const order = await createOrder({
		userId: 'user-1',
		items: [{ productId: 'prod-1', quantity: 2, priceEach: 50_00 }]
	});

	expect(order.totalCents).toBe(100_00);

	const row = await db.query('SELECT * FROM orders WHERE id = $1', [order.id]);
	expect(row.rows[0].total_cents).toBe(100_00);
});
```

**E2e tests** — simulate a real user in a real browser against a fully deployed app. Use sparingly: 5–15 critical user journeys, not every feature.

```typescript
// E2e test: Playwright, tests the full stack
import { test, expect } from '@playwright/test';

test('user can sign up and place an order', async ({ page }) => {
	await page.goto('/signup');
	await page.fill('[name=email]', 'test@example.com');
	await page.fill('[name=password]', 'password123');
	await page.click('[type=submit]');

	await expect(page).toHaveURL('/dashboard');
	await page.click('text=Shop');
	await page.click('text=Add to cart');
	await page.click('text=Checkout');
	await expect(page.locator('.order-confirmation')).toBeVisible();
});
```

## The Mock Trap

Mocking everything is fast to write and slow to trust. When everything is mocked, your tests pass but your system is broken:

```typescript
// BAD: mocking the database — tests the mock, not the code
const mockDb = { query: jest.fn().mockResolvedValue({ rows: [{ id: '1' }] }) };
const result = await createUser(mockDb, { email: 'test@example.com' });
// This tells you nothing — you wrote both the code and the expected behavior

// GOOD: real test database, transactions rolled back after each test
// Tests actually verify the query works, constraints fire, triggers run
```

Mocks are appropriate for:

- External third-party APIs (Stripe, SendGrid) — you don't control them
- Time (`Date.now()`, `new Date()`) — for deterministic tests
- Random values — for reproducibility
- System calls you can't run in CI (GPU, hardware interfaces)

Not appropriate for:

- Your own database (use a test DB with real migrations)
- Your own internal services (use a test instance or contract tests)
- External HTTP APIs you control (use a test environment)

## Test Data

```typescript
// Builder pattern — construct minimal valid objects, override what matters
function buildUser(overrides: Partial<User> = {}): User {
	return {
		id: randomUUID(),
		email: `test-${randomUUID()}@example.com`,
		role: 'standard',
		createdAt: new Date(),
		...overrides
	};
}

// Use in tests
const premiumUser = buildUser({ role: 'premium' });
const adminUser = buildUser({ role: 'admin', email: 'admin@example.com' });
```

For database tests: seed only what the test needs, clean up after:

```typescript
// Global test setup — run migrations once
// beforeAll: seed shared reference data (categories, config)
// beforeEach: nothing — keep tests independent
// afterEach: truncate or rollback — tests don't share state
// afterAll: drop test data, close connections
```

## Coverage as a Tool, Not a Goal

100% coverage doesn't mean the code works. Coverage tells you which lines ran, not whether the behavior is correct.

Useful coverage signals:

- **Low coverage on a module** → probably missing tests for a complex area
- **100% coverage everywhere** → probably testing implementation instead of behavior

Ignore coverage on: generated code, migrations, config files, CLI entry points.

Set a floor (e.g., 70%) to prevent regressions, not a ceiling to chase.

## What to Test First

When joining an existing codebase with no tests, add tests in this order:

1. **Bugs you fix** — write a test that reproduces the bug before fixing it
2. **Critical paths** — checkout flow, auth, payment, anything money-related
3. **Complex domain logic** — pricing, discounts, business rules
4. **Integration boundaries** — places where your code meets the database or external APIs
5. **E2e for happy paths** — signup, login, core user journeys

Don't try to retrofit coverage everywhere. Test the things that hurt when they break.

## CI Configuration

```yaml
# GitHub Actions
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: testdb
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - run: npm ci
      - run: npm run db:migrate
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/testdb

      - run: npm test -- --coverage
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/testdb
          NODE_ENV: test

      - run: npm run test:e2e
        if: github.ref == 'refs/heads/main' # e2e only on main
```

Run unit + integration tests on every push. Run e2e only before deploy or on main — they're too slow for every PR branch.
