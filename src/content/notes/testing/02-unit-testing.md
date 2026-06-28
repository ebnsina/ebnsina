---
title: 'Unit Testing'
subtitle: 'Testing pure logic in isolation — Vitest, assertion patterns, test doubles, and what makes a good unit test.'
chapter: 2
level: 'beginner'
readingTime: '9 min'
topics: ['unit testing', 'Vitest', 'Jest', 'mocking', 'spies', 'test doubles', 'assertions']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Testing a recipe ingredient in isolation: you taste the sauce before it goes in the dish. If the sauce is wrong, you know exactly what to fix — you don't have to serve the whole meal and guess which ingredient was off. Unit tests give you that same pinpoint feedback on individual functions.

</Callout>

## Setup: Vitest

Vitest is the modern choice for TypeScript projects — fast, ESM-native, compatible with Jest's API:

```bash
npm install -D vitest @vitest/coverage-v8
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true, // no need to import describe/it/expect
		environment: 'node',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			exclude: ['node_modules', 'dist', '**/*.config.*', 'src/migrations/**']
		}
	}
});
```

```json
// package.json
{
	"scripts": {
		"test": "vitest run",
		"test:watch": "vitest",
		"test:coverage": "vitest run --coverage"
	}
}
```

## Anatomy of a Good Unit Test

```typescript
// src/pricing.test.ts
import { describe, it, expect } from 'vitest';
import { calculateDiscount, applyPromoCode } from './pricing';

describe('calculateDiscount', () => {
	it('applies 20% for premium members', () => {
		// Arrange
		const priceInCents = 100_00;
		const tier = 'premium';

		// Act
		const result = calculateDiscount(priceInCents, tier);

		// Assert
		expect(result).toBe(80_00);
	});

	it('returns original price for standard members', () => {
		expect(calculateDiscount(50_00, 'standard')).toBe(50_00);
	});

	it('handles zero price', () => {
		expect(calculateDiscount(0, 'premium')).toBe(0);
	});

	it('rounds down fractional cents', () => {
		// 33_33 * 0.8 = 26.664 → 26_66
		expect(calculateDiscount(33_33, 'premium')).toBe(26_66);
	});
});
```

Each test: one logical assertion, descriptive name that reads as a sentence, no shared mutable state between tests.

## Assertions

```typescript
// Equality
expect(value).toBe(42); // strict ===
expect(value).toEqual({ a: 1 }); // deep equality (objects/arrays)
expect(value).not.toBe(null);

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(0.1 + 0.2).toBeCloseTo(0.3, 5); // floating point
expect(value).toBeGreaterThan(0);
expect(value).toBeLessThanOrEqual(100);

// Strings
expect(str).toContain('hello');
expect(str).toMatch(/^\d{4}-\d{2}-\d{2}$/); // regex

// Arrays
expect(arr).toHaveLength(3);
expect(arr).toContain('item');
expect(arr).toEqual(expect.arrayContaining(['a', 'b'])); // subset

// Objects
expect(obj).toMatchObject({ name: 'Fatima' }); // partial match

// Errors
expect(() => fn()).toThrow('expected message');
expect(() => fn()).toThrow(ValidationError);
await expect(asyncFn()).rejects.toThrow('error');

// Snapshots (use sparingly — for serializable output like HTML or JSON)
expect(renderResult).toMatchSnapshot();
```

## Spies and Mocks

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Spy on a function (tracks calls, lets original run)
it('calls the logger on success', () => {
	const logger = { info: vi.fn() };
	processOrder({ id: '1' }, logger);
	expect(logger.info).toHaveBeenCalledWith('Order processed', { orderId: '1' });
	expect(logger.info).toHaveBeenCalledTimes(1);
});

// Mock a function (replace with fake implementation)
it('uses the mocked time', () => {
	const now = new Date('2024-01-15T10:00:00Z');
	vi.setSystemTime(now);

	const result = createTimestamp();

	expect(result).toBe('2024-01-15T10:00:00.000Z');

	vi.useRealTimers();
});

// Mock a module
vi.mock('./email', () => ({
	sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-123' })
}));

import { sendEmail } from './email';

it('sends a welcome email on signup', async () => {
	await createUser({ email: 'user@example.com' });
	expect(sendEmail).toHaveBeenCalledWith(
		expect.objectContaining({ to: 'user@example.com', subject: 'Welcome' })
	);
});
```

```typescript
// Reset mocks between tests
beforeEach(() => {
	vi.clearAllMocks(); // clears call history
	// vi.resetAllMocks() — also resets implementations
	// vi.restoreAllMocks() — restores original implementations
});
```

## Testing Async Code

```typescript
// Async/await (preferred)
it('resolves with user data', async () => {
	const user = await fetchUser('user-1');
	expect(user.name).toBe('Fatima');
});

// Rejected promises
it('throws on missing user', async () => {
	await expect(fetchUser('nonexistent')).rejects.toThrow('User not found');
});

// Timers (without waiting real time)
it('debounces rapid calls', async () => {
	vi.useFakeTimers();
	const fn = vi.fn();
	const debounced = debounce(fn, 300);

	debounced();
	debounced();
	debounced();

	expect(fn).not.toHaveBeenCalled();

	vi.advanceTimersByTime(300);
	expect(fn).toHaveBeenCalledTimes(1);

	vi.useRealTimers();
});
```

## Testing Classes

```typescript
class Cart {
	private items: Map<string, number> = new Map();

	add(productId: string, quantity: number) {
		const current = this.items.get(productId) ?? 0;
		this.items.set(productId, current + quantity);
	}

	total(prices: Record<string, number>): number {
		let sum = 0;
		for (const [id, qty] of this.items) {
			sum += (prices[id] ?? 0) * qty;
		}
		return sum;
	}

	isEmpty(): boolean {
		return this.items.size === 0;
	}
}

describe('Cart', () => {
	let cart: Cart;

	beforeEach(() => {
		cart = new Cart(); // fresh instance per test — no shared state
	});

	it('starts empty', () => {
		expect(cart.isEmpty()).toBe(true);
	});

	it('accumulates quantities for the same product', () => {
		cart.add('prod-1', 2);
		cart.add('prod-1', 3);

		const total = cart.total({ 'prod-1': 10_00 });
		expect(total).toBe(50_00);
	});

	it('calculates total across multiple products', () => {
		cart.add('prod-1', 1);
		cart.add('prod-2', 2);

		const total = cart.total({ 'prod-1': 20_00, 'prod-2': 15_00 });
		expect(total).toBe(50_00); // 20 + 30
	});
});
```

## Parameterized Tests

Test the same logic across many inputs without duplicating test code:

```typescript
import { describe, it, expect } from 'vitest';
import { parseDate } from './date-utils';

describe.each([
	['2024-01-15', { year: 2024, month: 1, day: 15 }],
	['2024-12-31', { year: 2024, month: 12, day: 31 }],
	['2000-02-29', { year: 2000, month: 2, day: 29 }] // leap year
])('parseDate("%s")', (input, expected) => {
	it('parses correctly', () => {
		expect(parseDate(input)).toEqual(expected);
	});
});

// For error cases
it.each([
	['2024-13-01', 'Invalid month'],
	['2024-00-01', 'Invalid month'],
	['not-a-date', 'Invalid format']
])('parseDate("%s") throws "%s"', (input, message) => {
	expect(() => parseDate(input)).toThrow(message);
});
```

## What Not to Unit Test

- Framework code (Express routing, ORM queries) — test these at integration level
- Simple getters/setters with no logic
- Configuration objects
- Code that's all I/O (DB calls, HTTP calls) — mock the I/O or use integration tests
- Private methods — if you need to test them, your class may need splitting

Focus unit tests on: algorithms, business rules, data transformations, error handling, edge cases.

## Running Tests

```bash
# Run once
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# Run specific file
npx vitest run src/pricing.test.ts

# Run tests matching a pattern
npx vitest run --reporter=verbose -t "discount"

# Coverage report
npm run test:coverage
# Open coverage/index.html in browser
```
