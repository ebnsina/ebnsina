---
title: 'Unit Testing'
subtitle: 'Isolation-এ pure logic টেস্ট করা — Vitest, assertion pattern, test double, আর একটা ভালো unit test কী দিয়ে তৈরি হয়।'
chapter: 2
level: 'beginner'
readingTime: '9 মিনিট'
topics: ['unit testing', 'Vitest', 'Jest', 'mocking', 'spies', 'test doubles', 'assertions']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমি একজন ইলেকট্রিশিয়ান। পুরো বিল্ডিংয়ের ওয়্যারিং করার আগে তার হাতে একটা ছোট বেঞ্চ টেস্টার থাকে — টেবিলের ওপর ছোট্ট একটা যন্ত্র, দুটো তার আর একটা সুইচ। নতুন একটা বাল্ব হাতে নিয়ে সে সেটাকে শুধু এই টেস্টারে লাগায়, একটা নির্দিষ্ট ভোল্টেজ দেয়, আর দেখে — বাল্বটা জ্বলে ওঠে কিনা। পুরোপুরি একা, বিল্ডিংয়ের কোনো তার, কোনো মিটার, কোনো মেইন লাইনের সাথে যুক্ত না।

বাল্বটা জ্বলে উঠলে সে জানে এটা ঠিক আছে। আর না জ্বললে? সে সাথে সাথেই নিশ্চিত — সমস্যাটা এই বাল্বেই, অন্য কোথাও না। বিল্ডিংয়ের হাজারটা তারের মধ্যে খুঁজে বেড়াতে হয় না, ফিউজ বক্স খুলে বসে থাকতে হয় না। এক সেকেন্ডে পরিষ্কার — পাস কি ফেল। খারাপ বাল্বটা ঝুড়িতে ফেলে সে পরেরটা তুলে নেয়।

এই বেঞ্চ টেস্টারই আসলে **unit test**। বেঞ্চের ওপর একটা বাল্ব = **isolation**-এ টেস্ট করা একটা function; নির্দিষ্ট ভোল্টেজ দিয়ে "জ্বলে উঠল কিনা" দেখা = একটা known **input** দিয়ে expected **output** যাচাই করা; বেঞ্চটা যে বিল্ডিং থেকে আলাদা = external dependency (database, network) **mock** করে সরিয়ে দেওয়া; আর এক সেকেন্ডে পরিষ্কার পাস/ফেল = একটা fast, **deterministic** টেস্ট। বাস্তবে ঠিক তাই — `calculateDiscount` function-টা ভুল আউটপুট দিলে unit test সাথে সাথে সেটা ধরিয়ে দেয়, পুরো অ্যাপ চালিয়ে কোন জায়গায় বাগ তা আন্দাজ করতে হয় না।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

কোনো recipe-র একটা ingredient আলাদাভাবে টেস্ট করা: sauce টা dish-এ যাওয়ার আগেই আপনি সেটার স্বাদ নেন। sauce ভুল হলে ঠিক কী ঠিক করতে হবে তা আপনি জানেন — পুরো খাবার পরিবেশন করে কোন ingredient-টা বেঠিক ছিল তা আন্দাজ করতে হয় না। Unit test আপনাকে আলাদা function-এর ওপর ঠিক সেই একই নিখুঁত feedback দেয়।

</Callout>

## Setup: Vitest

Vitest হলো TypeScript প্রজেক্টের জন্য আধুনিক পছন্দ — দ্রুত, ESM-native, Jest-এর API-র সাথে compatible:

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

## একটা ভালো Unit Test-এর গঠন

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

প্রতিটি test: একটা logical assertion, একটা বর্ণনামূলক নাম যা একটা বাক্যের মতো পড়া যায়, test-গুলোর মধ্যে কোনো shared mutable state নেই।

## Assertion

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

## Spy আর Mock

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

## Async Code টেস্ট করা

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

## Class টেস্ট করা

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

## Parameterized Test

test কোড ডুপ্লিকেট না করে একই logic অনেকগুলো input-এর ওপর টেস্ট করুন:

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

## যা Unit Test করবেন না

- Framework code (Express routing, ORM query) — এগুলো integration level-এ টেস্ট করুন
- logic নেই এমন সাধারণ getter/setter
- Configuration object
- পুরোটাই I/O এমন code (DB call, HTTP call) — I/O mock করুন বা integration test ব্যবহার করুন
- Private method — এগুলো টেস্ট করার দরকার হলে, আপনার class হয়তো ভাগ করা দরকার

Unit test-এর ফোকাস রাখুন: algorithm, business rule, data transformation, error handling, edge case-এর ওপর।

## Test চালানো

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
