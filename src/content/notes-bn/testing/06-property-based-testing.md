---
title: 'Property-Based Testing'
subtitle: 'স্বয়ংক্রিয়ভাবে শত শত random input তৈরি করা — fast-check এমন edge case খুঁজে বের করে যা আপনার example test মিস করে।'
chapter: 6
level: 'intermediate'
readingTime: '8 মিনিট'
topics: ['property-based testing', 'fast-check', 'fuzzing', 'generative testing', 'invariants']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন professional adversarial tester নিয়োগ করা বনাম একটা checklist লেখা: আপনি যেসব case ভাবতে পারেন সেগুলোর জন্য test লেখেন। Property-based testing হলো সেই adversarial tester যে আপনার কল্পনাতেও আসবে না এমন প্রতিটা অদ্ভুত combination চেষ্টা করে — খালি string, ঋণাত্মক সংখ্যা, Unicode edge case, সর্বোচ্চ মান — যতক্ষণ না কিছু একটা ভেঙে পড়ে।

</Callout>

## Property-Based Testing কী ধরে

Example test আপনার ভাবা নির্দিষ্ট case চেক করে। Property test এমন invariant চেক করে যা _যেকোনো_ valid input-এর জন্য সত্য হতে হবে:

```typescript
// Example test — you thought of 3 cases
test('sort works', () => {
	expect(sort([3, 1, 2])).toEqual([1, 2, 3]);
	expect(sort([])).toEqual([]);
	expect(sort([1])).toEqual([1]);
});

// Property test — checks invariants across 1000 random arrays:
// 1. Output is same length as input
// 2. Each element in output appears in input (no data added)
// 3. Output is non-decreasing
// 4. First element ≤ last element (for non-empty arrays)
```

আপনি এগুলো নিয়ে ভাবেননি: `[NaN, Infinity, -0]`, `[2^53, 2^53 + 1]`, ১০,০০০ element-এর array।

## Setup: fast-check

```bash
npm install -D fast-check
```

```typescript
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { sort } from './sort';

describe('sort', () => {
	it('returns array of same length', () => {
		fc.assert(
			fc.property(fc.array(fc.integer()), (arr) => {
				expect(sort([...arr])).toHaveLength(arr.length);
			})
		);
	});

	it('output is non-decreasing', () => {
		fc.assert(
			fc.property(fc.array(fc.integer()), (arr) => {
				const result = sort([...arr]);
				for (let i = 1; i < result.length; i++) {
					expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]);
				}
			})
		);
	});

	it('contains same elements as input', () => {
		fc.assert(
			fc.property(fc.array(fc.integer()), (arr) => {
				const result = sort([...arr]);
				expect(result.sort()).toEqual([...arr].sort());
			})
		);
	});
});
```

fast-check ডিফল্টভাবে 100টা random input চালায়। যখন এটা একটা failure খুঁজে পায়, তখন এটা **shrink** করে — সবচেয়ে ছোট reproduce-করা case বের করে:

```
Error: Property failed after 14 tests
Counterexample: [[-2147483648, 2147483647]]
Shrunk 4 times
```

`[1, -5, 3, 8, -2147483648, 2147483647]` নয় — শুধু `[-2147483648, 2147483647]`।

## Arbitraries: Test Data তৈরি করা

```typescript
import fc from 'fast-check';

// Primitives
fc.integer(); // any integer
fc.integer({ min: 0, max: 100 }); // bounded
fc.float(); // any float (including NaN, Infinity)
fc.float({ noNaN: true, noDefaultInfinity: true });
fc.string(); // any string (including Unicode, empty)
fc.string({ minLength: 1 }); // non-empty string
fc.boolean();
fc.date();

// Collections
fc.array(fc.integer()); // array of integers (length 0–10 by default)
fc.array(fc.string(), { minLength: 1, maxLength: 100 });
fc.set(fc.integer()); // unique values
fc.record({
	// object with specific shape
	id: fc.uuid(),
	name: fc.string({ minLength: 1 }),
	age: fc.integer({ min: 0, max: 120 })
});

// Combinators
fc.oneof(fc.integer(), fc.string()); // either type
fc.option(fc.integer()); // integer or null
fc.tuple(fc.string(), fc.integer()); // fixed-length tuple
fc.constantFrom('admin', 'standard', 'premium'); // enum-like
```

## Domain-Specific Generator

আপনার domain type-এর জন্য generator তৈরি করুন:

```typescript
const arbEmail = fc
	.string({ minLength: 1 })
	.map((s) => `${s.replace(/[^a-z0-9]/gi, 'x')}@example.com`);

const arbMoney = fc.integer({ min: 0, max: 1_000_000_00 }); // cents, no negatives

const arbUser = fc.record({
	id: fc.uuid(),
	email: arbEmail,
	role: fc.constantFrom('admin', 'standard', 'premium'),
	balanceCents: arbMoney
});

const arbOrder = fc.record({
	id: fc.uuid(),
	userId: fc.uuid(),
	items: fc.array(
		fc.record({
			productId: fc.uuid(),
			quantity: fc.integer({ min: 1, max: 100 }),
			priceCents: fc.integer({ min: 1, max: 100_000_00 })
		}),
		{ minLength: 1, maxLength: 20 }
	)
});
```

## Business Logic Property টেস্ট করা

```typescript
import fc from 'fast-check';
import { calculateOrderTotal, applyDiscount } from './pricing';

describe('pricing properties', () => {
	it('total is sum of (quantity × price) for all items', () => {
		fc.assert(
			fc.property(arbOrder, (order) => {
				const expected = order.items.reduce(
					(sum, item) => sum + item.quantity * item.priceCents,
					0
				);
				expect(calculateOrderTotal(order)).toBe(expected);
			})
		);
	});

	it('discount never increases price', () => {
		fc.assert(
			fc.property(arbMoney, fc.integer({ min: 0, max: 100 }), (price, discountPercent) => {
				const discounted = applyDiscount(price, discountPercent);
				expect(discounted).toBeLessThanOrEqual(price);
				expect(discounted).toBeGreaterThanOrEqual(0);
			})
		);
	});

	it('applying 0% discount returns original price', () => {
		fc.assert(
			fc.property(arbMoney, (price) => {
				expect(applyDiscount(price, 0)).toBe(price);
			})
		);
	});

	it('applying 100% discount returns 0', () => {
		fc.assert(
			fc.property(arbMoney, (price) => {
				expect(applyDiscount(price, 100)).toBe(0);
			})
		);
	});
});
```

## Stateful Property Testing

operation-এর ক্রম টেস্ট করা — model-based testing:

```typescript
// Test a shopping cart: any sequence of add/remove operations
// should maintain invariants
import fc from 'fast-check';
import { Cart } from './cart';

const cartCommands = [
	// Add item command
	fc.record({
		type: fc.constant('add'),
		productId: fc.uuid(),
		quantity: fc.integer({ min: 1, max: 10 }),
		price: fc.integer({ min: 1, max: 10_000_00 })
	}),
	// Remove item command
	fc.record({
		type: fc.constant('remove'),
		productId: fc.uuid()
	})
];

it('cart invariants hold for any sequence of operations', () => {
	fc.assert(
		fc.property(fc.array(fc.oneof(...cartCommands), { maxLength: 50 }), (commands) => {
			const cart = new Cart();

			for (const cmd of commands) {
				if (cmd.type === 'add') {
					cart.add(cmd.productId, cmd.quantity, cmd.price);
				} else {
					cart.remove(cmd.productId);
				}
			}

			// Invariants that must hold regardless of operation sequence:
			// 1. Total matches sum of items
			const expectedTotal = [...cart.items()].reduce(
				(sum, [, item]) => sum + item.quantity * item.price,
				0
			);
			expect(cart.total()).toBe(expectedTotal);

			// 2. Total is never negative
			expect(cart.total()).toBeGreaterThanOrEqual(0);

			// 3. Item count matches items map size
			expect(cart.itemCount()).toBe([...cart.items()].length);
		})
	);
});
```

## Round-Trip Property

serialization, encoding, আর data transformation-এর জন্য বিশেষভাবে কাজের:

```typescript
import { serialize, deserialize } from './serializer';
import { encode, decode } from './base64url';

it('serialize → deserialize is identity', () => {
	fc.assert(
		fc.property(arbUser, (user) => {
			expect(deserialize(serialize(user))).toEqual(user);
		})
	);
});

it('encode → decode is identity', () => {
	fc.assert(
		fc.property(fc.uint8Array(), (bytes) => {
			expect(decode(encode(bytes))).toEqual(bytes);
		})
	);
});

it('parseDate → formatDate is identity for valid dates', () => {
	fc.assert(
		fc.property(fc.date({ min: new Date(1970, 0, 1), max: new Date(2100, 11, 31) }), (date) => {
			const formatted = formatDate(date);
			const parsed = parseDate(formatted);
			expect(parsed.getTime()).toBe(date.getTime());
		})
	);
});
```

## Run Configure করা

```typescript
// More samples for critical code
fc.assert(
	fc.property(fc.integer(), fn),
	{ numRuns: 1000 } // default is 100
);

// Reproduce a specific failure (from the seed/path in the error output)
fc.assert(fc.property(fc.integer(), fn), { seed: 1234567890, path: '3:1' });

// Verbose output for debugging
fc.assert(fc.property(fc.integer(), fn), { verbose: true });
```

## কখন Property Test ব্যবহার করবেন

**দারুণ মানানসই:**

- গাণিতিক property সহ pure function (sort, encode/decode, arithmetic)
- Parser আর serializer (round-trip property)
- Data transformation pipeline
- স্পষ্ট invariant সহ domain logic (pricing, discount, scoring)
- Protocol implementation

**দুর্বল মানানসই:**

- UI interaction (e2e test ব্যবহার করুন)
- Side effect সহ operation (DB write, HTTP call)
- যেখানে function-টা আবার লেখা ছাড়া "সঠিক" output সংজ্ঞায়িত করা কঠিন
- সাধারণ CRUD (example test স্পষ্টতর)

Property আর example test মিশিয়ে নিন: property test সেই edge case ধরে যা আপনি কল্পনা করতে পারেন না, example test আপনার domain-এর জন্য গুরুত্বপূর্ণ নির্দিষ্ট case নথিভুক্ত করে।
