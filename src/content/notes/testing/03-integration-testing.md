---
title: 'Integration Testing'
subtitle: 'সত্যিকারের boundary টেস্ট করা — database query, HTTP handler, message queue — যা গুরুত্বপূর্ণ তা mock না করেই।'
chapter: 3
level: 'beginner'
readingTime: '10 মিনিট'
topics:
  [
    'integration testing',
    'database testing',
    'HTTP testing',
    'Testcontainers',
    'supertest',
    'migrations'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন নতুন কর্মচারীর প্রথম দিন সত্যিকারের সহকর্মীদের সাথে কাজ করে টেস্ট করা, training room-এ role-play করে নয়। training (unit test) কাজটা শেখায়; সত্যিকারের প্রথম দিন প্রকাশ করে জ্ঞানটা বাস্তবে কাজে লাগে কিনা — তারা কি সত্যিই filing system ব্যবহার করতে পারে, সঠিক লোকের সাথে কথা বলতে পারে, আসল workflow অনুসরণ করতে পারে।

</Callout>

## গল্পে বুঝি

ফাতিমা নতুন বাড়ির আলোর লাইন বসাচ্ছেন, আর ইলেকট্রিশিয়ান হিসেবে ডেকেছেন সিনাকে। কাজ শুরুর আগে সিনা প্রতিটা যন্ত্রাংশ আলাদা করে বেঞ্চে পরখ করে নিলেন — সুইচটা টিপে দেখলেন ঠিকঠাক ক্লিক করে, বাল্বটা আলাদা একটা ব্যাটারিতে ঠেকিয়ে দেখলেন জ্বলে, ফিউজটা মিটার দিয়ে মেপে দেখলেন। প্রতিটাই আলাদাভাবে পাস। কিন্তু তিনি জানেন, এতেই কাজ শেষ না।

এবার তিনি সবগুলো একসাথে জোড়া দিলেন — দেয়ালের সুইচ, আসল তার, বাল্ব-হোল্ডার, আর ফিউজ বক্স — তারপর সুইচটা অন করলেন গোটা সার্কিটটা এক হয়ে চলে কিনা দেখতে। আর ঠিক তখনই বেরিয়ে এল সমস্যা: বাল্ব একা একা জ্বললেও, সুইচের তারটা ভুল লাইনে জোড়া দেওয়া ছিল, ফলে অন করতেই ফিউজ ট্রিপ করে বসল। প্রতিটা যন্ত্রাংশ একা একা পাস করেছিল, কিন্তু জোড়া দেওয়ার জায়গায় — interface-এ — লুকিয়ে ছিল বাগটা, যা কেবল আসল অংশগুলো মিলিত হলেই ধরা পড়ে।

এটাই **integration test**। আলাদাভাবে পাস করা যন্ত্রাংশগুলো হলো mock দিয়ে টেস্ট করা unit — প্রতিটা component একা ঠিক। কিন্তু সেগুলো সত্যিকারভাবে জোড়া দিয়ে সুইচ অন করা মানে আসল component-গুলো একসাথে চালিয়ে দেখা, আর ভুল তারে জোড়া দেওয়া বা ফিউজ ট্রিপ করাটাই সেই interface/wiring বাগ, যা mock দিয়ে করা unit test কখনো ধরতে পারে না। আর সিনা যেমন খেলনা তার নয়, বাড়ির আসল তার আর আসল ফিউজ বক্স দিয়েই পরীক্ষা করেছেন — বাস্তবেও তাই integration test আসল dependency, যেমন একটা সত্যিকারের database-এর বিপরীতে চালাতে হয়, mock দিয়ে নয়।

## Integration Test-এর জন্য কেন Real Dependency দরকার

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

## Database Integration Test

একটা real database ব্যবহার করুন। প্রতিটি test-এর পরে roll back করুন:

```typescript
// src/test/setup.ts
import { Pool } from 'pg';
import { runMigrations } from '../db/migrate';

export const testDb = new Pool({
	connectionString: process.env.DATABASE_URL ?? 'postgres://test:test@localhost:5432/testdb'
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
		const email = 'fatima@example.com';

		const user = await createUser(testDb, { email, name: 'Fatima' });

		expect(user.id).toBeDefined();
		expect(user.email).toBe(email);

		const found = await getUserByEmail(testDb, email);
		expect(found?.id).toBe(user.id);
	});

	it('enforces unique email constraint', async () => {
		await createUser(testDb, { email: 'fatima@example.com', name: 'Fatima' });

		await expect(
			createUser(testDb, { email: 'fatima@example.com', name: 'Other' })
		).rejects.toThrow(/unique/i);
	});

	it('returns null for nonexistent email', async () => {
		const result = await getUserByEmail(testDb, 'nobody@example.com');
		expect(result).toBeNull();
	});
});
```

**Transaction rollback** মানে test-গুলো একে অপরের সাথে হস্তক্ষেপ করে না — প্রতিটি test একটা পরিষ্কার slate দিয়ে শুরু হয় আর কোনো ছাপ রেখে যায় না।

## Testcontainers — CI-তে Dependency চালু করা

Testcontainers আপনার test run-এর জন্য real Docker container চালু করে — কোনো pre-configured test DB দরকার নেই:

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
	const container = await new PostgreSqlContainer('postgres:16').withDatabase('testdb').start();

	pool = new Pool({ connectionString: container.getConnectionUri() });

	await runMigrations(pool);

	return {
		pool,
		stop: async () => {
			await pool.end();
			await container.stop();
		}
	};
}
```

```typescript
// vitest.config.ts — global setup
export default defineConfig({
	test: {
		globalSetup: './src/test/global-setup.ts'
	}
});

// src/test/global-setup.ts
import { startTestDatabase } from './db-container';

export async function setup() {
	const { pool, stop } = await startTestDatabase();
	process.env.DATABASE_URL = pool.options.connectionString;
	return stop; // Vitest calls this as teardown
}
```

## HTTP Integration Test

আপনার HTTP layer end-to-end টেস্ট করুন — real server, real DB, real middleware:

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
			.send({ email: 'omar@example.com', name: 'Omar' })
			.set('Accept', 'application/json');

		expect(res.status).toBe(201);
		expect(res.body.id).toBeDefined();
		expect(res.body.email).toBe('omar@example.com');
	});

	it('returns 400 for duplicate email', async () => {
		await request.post('/users').send({ email: 'dup@example.com', name: 'First' });

		const res = await request.post('/users').send({ email: 'dup@example.com', name: 'Second' });

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/already exists/i);
	});

	it('returns 422 for invalid email', async () => {
		const res = await request.post('/users').send({ email: 'not-an-email', name: 'Omar' });

		expect(res.status).toBe(422);
		expect(res.body.errors).toContainEqual(expect.objectContaining({ field: 'email' }));
	});
});

describe('GET /users/:id', () => {
	it('returns 404 for missing user', async () => {
		const res = await request.get('/users/00000000-0000-0000-0000-000000000000');
		expect(res.status).toBe(404);
	});
});
```

## Authenticated Route টেস্ট করা

```typescript
// Helper: create a test user and get auth token
async function authenticatedRequest(overrides: Partial<User> = {}) {
	const user = await createUser(testDb, {
		email: `test-${randomUUID()}@example.com`,
		...overrides
	});
	const token = signJwt({ userId: user.id, role: user.role });

	return {
		user,
		agent: supertest(app).set('Authorization', `Bearer ${token}`)
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

## External HTTP API টেস্ট করা

আপনার নিয়ন্ত্রণে নেই এমন external service-এর জন্য, HTTP-কে network level-এ intercept করতে `msw` (Mock Service Worker) ব্যবহার করুন — import level-এ নয়:

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
			amount: 100_00
		});
	}),

	http.post('https://api.sendgrid.com/v3/mail/send', () => {
		return new HttpResponse(null, { status: 202 });
	})
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
		setupFiles: ['./src/test/msw-setup.ts']
	}
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

## Message Queue Consumer টেস্ট করা

```typescript
// Test the consumer function directly — no need to run a real queue
import { processOrderEvent } from './order-consumer';

it('marks order as shipped on ShipmentCreated event', async () => {
	const orderId = await createOrder(testDb, { userId: 'user-1', totalCents: 50_00 });

	await processOrderEvent(testDb, {
		type: 'ShipmentCreated',
		orderId,
		trackingNumber: 'TRACK123'
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

## Database Seeding Helper

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
			overrides.role ?? 'standard'
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
			overrides.inStock ?? true
		]
	);
	return rows[0];
}
```

Factory test setup-কে পঠনযোগ্য আর maintainable রাখে — schema বদলালে, factory-টা একবার ঠিক করুন।
