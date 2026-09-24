---
title: 'Testing Strategy'
subtitle: 'Testing pyramid, প্রতিটি layer কী টেস্ট করে, আর যেসব ফাঁদ test suite-কে ধীর ও ভঙ্গুর করে তা কীভাবে এড়াবেন।'
chapter: 1
level: 'beginner'
readingTime: '7 মিনিট'
topics: ['testing pyramid', 'unit tests', 'integration tests', 'e2e tests', 'test strategy', 'TDD']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা গাড়ির কারখানায় quality control: ইন্সপেক্টররা আলাদা আলাদা bolt চেক করে (unit tests), তারপর assemble করা subcomponent যেমন engine block (integration tests), তারপর তৈরি হওয়া গাড়িটা test track-এ চালিয়ে দেখে (e2e tests)। Bolt ইন্সপেক্টররা দ্রুত ও সস্তা — আপনি প্রতিটি পার্টসের ওপর এগুলো চালান। প্রতিটা weld করার জন্য আপনি প্রতিটা গাড়িকে পুরো road course-এ চালিয়ে দেখেন না।

</Callout>

## গল্পে বুঝি

সিনার একটা রেস্তোরাঁ, রান্নাঘরে খাবারের নিরাপত্তার একটা পুরো প্ল্যান আছে। সারাদিন ধরে শেফরা অসংখ্য ছোট ছোট চেক করে — যে ডিমটা ভাঙা হচ্ছে সেটার গন্ধ শোঁকা, যে দুধ ঢালা হচ্ছে সেটা এক চুমুক চেখে দেখা, সবজিটা টাটকা কিনা তাকিয়ে দেখা। এগুলো সেকেন্ডের কাজ, প্রায় বিনা খরচে, তাই প্রতিটা উপকরণ ব্যবহারের ঠিক আগে করে ফেলা যায়। এভাবেই বেশিরভাগ সমস্যা একদম শুরুতেই ধরা পড়ে যায়।

তার চেয়ে একটু কম ঘন ঘন, রান্না শেষ হওয়া প্রতিটা ডিশ পাস থেকে বেরোনোর আগে হেড শেফ খোয়ারিজমি একবার চেখে দেখেন — নুন ঠিক আছে তো, উপকরণগুলো একসাথে মিলে ঠিকঠাক স্বাদ হয়েছে তো। এটা একটা উপকরণের চেয়ে বড় পরীক্ষা, একটু বেশি সময় নেয়, কিন্তু পুরো ডিশ ঠিকঠাক জোড়া লেগেছে কিনা তা এটাই বলে দেয়। আর কালেভদ্রে — কয়েক মাসে একবার — ফাতিমা পুরো রান্নাঘরের একটা সম্পূর্ণ হেলথ ইন্সপেকশন করান: ফ্রিজের তাপমাত্রা, স্টোরেজ, পরিষ্কার-পরিচ্ছন্নতা, সবকিছু আগাগোড়া। এটা ধীর আর খরুচে, তাই প্রতিদিন করা হয় না — শুধু বড় নিশ্চয়তার দরকারে মাঝেমধ্যে।

এই পুরো প্ল্যানটাই হলো **test pyramid**। অসংখ্য দ্রুত সস্তা উপকরণ-চেক হলো আপনার **unit test** — অনেক, দ্রুত, প্রতিবার চালানোর মতো। তার চেয়ে কম সংখ্যক ডিশ-চেখে-দেখা হলো **integration test** — আপনার আলাদা অংশগুলো একসাথে ঠিকঠাক কাজ করছে কিনা যাচাই। আর কালেভদ্রের সেই পূর্ণ ইন্সপেকশন হলো ধীর, খরুচে **e2e test** — কম সংখ্যায়, শুধু জরুরি নিশ্চয়তার জন্য। বাস্তবেও ঠিক এভাবেই test suite সাজানো উচিত: প্রচুর unit test দিয়ে বেশিরভাগ bug সস্তায় ও আগেভাগে ধরে ফেলুন, কম integration test দিয়ে boundary যাচাই করুন, আর মুষ্টিমেয় e2e test জমিয়ে রাখুন সেই দামি, ধীর অথচ গুরুত্বপূর্ণ full-stack নিশ্চয়তার জন্য।

## Testing Pyramid

```
        ┌─────────────┐
        │     E2E      │  ← few, slow, expensive, high confidence
        ├─────────────┤
        │ Integration  │  ← moderate, medium speed, test real boundaries
        ├─────────────┤
        │    Unit      │  ← many, fast, cheap, test logic in isolation
        └─────────────┘
```

বেশিরভাগ প্রজেক্টে এটা উল্টে থাকে — অনেক ধীর e2e test, কম unit test। এটা একটা ফাঁদ: e2e test ভুল কারণে ভাঙে, কী fail করেছে তা বলে না, আর প্রতি CI run-এ ২০ মিনিট নেয়।

## প্রতিটি Layer কী টেস্ট করে

**Unit tests** — pure function, domain logic, transformation, edge case। কোনো I/O নেই, network নেই, database নেই। প্রতিবার file save-এ চালানোর মতো যথেষ্ট দ্রুত।

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

**Integration tests** — আপনার কোড আর কোনো সত্যিকারের জিনিসের মধ্যকার boundary টেস্ট করে: একটা database, একটা third-party API, একটা message queue। Mock-এর বিপরীতে নয়, একটা real (test) instance-এর বিপরীতে চালান।

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

**E2e tests** — একটা পুরোপুরি deploy করা app-এর বিপরীতে একটা real browser-এ একজন সত্যিকারের user-কে simulate করে। সংযমী হয়ে ব্যবহার করুন: প্রতিটি feature নয়, ৫–১৫টি critical user journey।

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

## Mock Trap

সবকিছু mock করা লিখতে দ্রুত কিন্তু ভরসা করতে ধীর। যখন সবকিছুই mock করা, তখন আপনার test pass করে কিন্তু আপনার system ভাঙা:

```typescript
// BAD: mocking the database — tests the mock, not the code
const mockDb = { query: jest.fn().mockResolvedValue({ rows: [{ id: '1' }] }) };
const result = await createUser(mockDb, { email: 'test@example.com' });
// This tells you nothing — you wrote both the code and the expected behavior

// GOOD: real test database, transactions rolled back after each test
// Tests actually verify the query works, constraints fire, triggers run
```

Mock যেসব ক্ষেত্রে উপযুক্ত:

- External third-party API (Stripe, SendGrid) — এগুলো আপনার নিয়ন্ত্রণে নেই
- Time (`Date.now()`, `new Date()`) — deterministic test-এর জন্য
- Random value — reproducibility-র জন্য
- যেসব system call আপনি CI-তে চালাতে পারবেন না (GPU, hardware interface)

উপযুক্ত নয়:

- আপনার নিজের database (real migration সহ একটা test DB ব্যবহার করুন)
- আপনার নিজের internal service (test instance বা contract test ব্যবহার করুন)
- আপনার নিয়ন্ত্রণে থাকা external HTTP API (একটা test environment ব্যবহার করুন)

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

Database test-এর জন্য: test-এর যতটুকু দরকার শুধু ততটুকু seed করুন, পরে পরিষ্কার করুন:

```typescript
// Global test setup — run migrations once
// beforeAll: seed shared reference data (categories, config)
// beforeEach: nothing — keep tests independent
// afterEach: truncate or rollback — tests don't share state
// afterAll: drop test data, close connections
```

## Coverage একটা Tool, Goal নয়

100% coverage মানে এই নয় যে কোড কাজ করে। Coverage আপনাকে বলে কোন line গুলো চলেছে, behavior সঠিক কিনা তা নয়।

কাজের coverage signal:

- **কোনো module-এ কম coverage** → সম্ভবত কোনো জটিল অংশের test মিসিং
- **সব জায়গায় 100% coverage** → সম্ভবত behavior-এর বদলে implementation টেস্ট করা হচ্ছে

এসবের coverage উপেক্ষা করুন: generated code, migration, config file, CLI entry point।

Regression ঠেকাতে একটা floor (যেমন 70%) সেট করুন, তাড়া করার জন্য কোনো ceiling নয়।

## প্রথমে কী টেস্ট করবেন

test নেই এমন কোনো বিদ্যমান codebase-এ যোগ দিলে, এই ক্রমে test যোগ করুন:

1. **যেসব bug আপনি fix করেন** — fix করার আগে bug-টা reproduce করে এমন একটা test লিখুন
2. **Critical path** — checkout flow, auth, payment, টাকা-সংক্রান্ত যেকোনো কিছু
3. **জটিল domain logic** — pricing, discount, business rule
4. **Integration boundary** — যেখানে আপনার কোড database বা external API-র সাথে মেলে
5. **Happy path-এর জন্য E2e** — signup, login, core user journey

সব জায়গায় coverage retrofit করার চেষ্টা করবেন না। যেসব জিনিস ভাঙলে ব্যথা লাগে সেগুলো টেস্ট করুন।

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

প্রতিটি push-এ unit + integration test চালান। e2e শুধু deploy-এর আগে বা main-এ চালান — প্রতিটি PR branch-এর জন্য এগুলো বড্ড ধীর।
