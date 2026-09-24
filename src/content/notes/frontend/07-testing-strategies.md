---
title: 'টেস্টিং স্ট্র্যাটেজি'
subtitle: 'ইউনিট টেস্ট, ইন্টিগ্রেশন টেস্ট, E2E টেস্ট, Testing Library প্যাটার্ন এবং মকিং — আপনার কোডে আস্থা তৈরি করা।'
chapter: 7
level: 'advanced'
readingTime: '12 মিনিট'
topics: ['testing', 'unit tests', 'integration tests', 'E2E', 'testing library', 'mocking']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

গাড়ির অ্যাসেম্বলি প্ল্যান্টে টেকনিশিয়ান খোয়ারিজমি সকাল থেকে বেঞ্চে বসে একটার পর একটা আলাদা পার্ট বাজিয়ে দেখছেন। একটা হর্ন হাতে নিয়ে সরাসরি ব্যাটারিতে তার লাগিয়ে চাপ দেন — বাজল কিনা, ঠিক শব্দটা এল কিনা, ব্যস। পাশের বাক্সে সুইচ, ওটাতেও একটা করে ক্লিক — অন হয় তো অফ হয়। এক-একটা পার্ট মিনিটখানেকের পরীক্ষা, খরচও নেই বললেই চলে, তাই দিনে শত শত পার্ট এভাবে যাচাই হয়ে যায়।

কিন্তু পার্ট আলাদা ভালো মানে তো পুরোটা এক সাথে কাজ করবে এমন না। তাই পরের ধাপে সিনা একটা পুরো অ্যাসেম্বল করা ড্যাশবোর্ড প্যানেল সামনে টেনে নেন — হর্ন, সুইচ, ইন্ডিকেটর সব বসানো। তিনি বাস্তবে বাটনগুলো টিপে দেখেন আর চোখ রাখেন বাতিগুলোর দিকে: হেডলাইট সুইচ টিপলে ঠিক আলোটা জ্বলছে তো, ইন্ডিকেটর দিলে ঠিক পাশের বাতি ব্লিংক করছে তো। এমন প্যানেল-পরীক্ষা পার্ট-পরীক্ষার চেয়ে কম হয়, একটু সময়ও নেয়। আর একদম শেষে ফাতিমা তৈরি হয়ে যাওয়া গোটা গাড়িটা নিয়ে রাস্তায় নামেন — লম্বা টেস্ট-ড্রাইভ, স্টিয়ারিং, ব্রেক, হর্ন, লাইট সব একসাথে। এই পুরো টেস্ট-ড্রাইভ দিনে গুটিকয়েক গাড়িতেই হয়, কারণ ওতে সময় আর খরচ দুটোই বেশি।

এই গল্পটাই আসলে ফ্রন্টএন্ড টেস্টিং। বেঞ্চে একটা পার্ট আলাদা বাজিয়ে দেখা হলো **unit test** — পিওর ফাংশন বা ইউটিলিটি একা যাচাই করা। ড্যাশবোর্ড প্যানেলের বাটন টিপে বাতি দেখা হলো **component test** — কম্পোনেন্ট রেন্ডার করে বাস্তবে ইন্টারঅ্যাক্ট করে ফলাফল দেখা। আর গোটা গাড়ি নিয়ে রাস্তায় টেস্ট-ড্রাইভ হলো **end-to-end (e2e) test** — আসল ব্রাউজারে পুরো অ্যাপ চালিয়ে দেখা। আর অনেক সস্তা পার্ট-টেস্ট, কম প্যানেল-টেস্ট, মুষ্টিমেয় ড্রাইভ — এই বণ্টনটাই **testing pyramid**। বাস্তবে এই তিন ধাপ হয় Vitest (unit), Testing Library (component) আর Playwright (e2e) দিয়ে — নিচের অংশে ঠিক এগুলোই ব্যবহার করব।

## ফ্রন্টএন্ড কোড কেন টেস্ট করবেন?

ফ্রন্টএন্ড কোড কুখ্যাতভাবে ভঙ্গুর — একটা CSS পরিবর্তন লেআউট ভেঙে দিতে পারে, একটা রিফ্যাক্টর ইভেন্ট হ্যান্ডলার বিচ্ছিন্ন করে দিতে পারে, আর API পরিবর্তন গোটা পেজ ক্র্যাশ করাতে পারে। টেস্টিং আপনাকে সেই আস্থা দেয় যাতে প্রতিটা ফ্লো ম্যানুয়ালি ক্লিক করে না দেখেই পরিবর্তন শিপ করা যায়। মূল বিষয়টা হলো — কোন পরিস্থিতিতে কোন ধরনের টেস্ট লিখতে হবে সেটা জানা।

<Callout type="info">

**বাস্তব জীবনের উপমা**

গাড়ির কারখানায় কোয়ালিটি কন্ট্রোলের মতো — ইউনিট টেস্টিং প্রতিটা পার্ট আলাদাভাবে যাচাই করে, ইন্টিগ্রেশন টেস্টিং দেখে ইঞ্জিন ট্রান্সমিশনের সাথে ঠিকমতো যুক্ত হয় কিনা, আর E2E টেস্টিং পুরো তৈরি গাড়িটা একটা ট্র্যাকে চালিয়ে দেখে।

</Callout>

## দ্য টেস্টিং ট্রফি

Kent C. Dodds-এর টেস্টিং ট্রফি এই বণ্টনটা প্রস্তাব করে:

```
         /\
        /E2E\        — Few: critical user flows
       /------\
      /Integra-\     — Most: component interactions
     /  tion    \
    /------------\
   / Unit Tests   \  — Some: pure logic, utilities
  /________________\
  Static Analysis    — Foundation: TypeScript, ESLint
```

ইন্টিগ্রেশন টেস্ট প্রতি ডলারে সবচেয়ে বেশি আস্থা দেয়, কারণ ব্যবহারকারীরা যেভাবে কম্পোনেন্টের সাথে ইন্টারঅ্যাক্ট করে সেভাবেই এগুলো কম্পোনেন্ট টেস্ট করে — অথচ E2E টেস্টের মতো ধীর আর ভঙ্গুর নয়।

## ইউনিট টেস্টিং: পিওর লজিক

ইউনিট টেস্ট হলো পিওর ফাংশন আর ইউটিলিটির জন্য — যেগুলোর ইনপুট-আউটপুট স্পষ্ট, কোনো DOM নেই, কোনো সাইড এফেক্ট নেই।

```typescript
// utils/price.ts
export function formatPrice(amount: number, currency: string = 'BDT'): string {
	if (amount < 0) throw new Error('Price cannot be negative');
	return `৳${amount.toLocaleString('en-BD')}`;
}

export function calculateDiscount(price: number, discountPercent: number): number {
	return Math.round(price * (1 - discountPercent / 100));
}

export function isInStock(quantity: number): boolean {
	return quantity > 0;
}
```

```typescript
// utils/price.test.ts
import { describe, it, expect } from 'vitest';
import { formatPrice, calculateDiscount, isInStock } from './price';

describe('formatPrice', () => {
	it('formats a standard price', () => {
		expect(formatPrice(1500)).toBe('৳1,500');
	});

	it('handles zero', () => {
		expect(formatPrice(0)).toBe('৳0');
	});

	it('throws on negative price', () => {
		expect(() => formatPrice(-100)).toThrow('Price cannot be negative');
	});
});

describe('calculateDiscount', () => {
	it('applies 20% discount', () => {
		expect(calculateDiscount(1000, 20)).toBe(800);
	});

	it('rounds to nearest integer', () => {
		expect(calculateDiscount(999, 15)).toBe(849);
	});

	it('handles 0% discount', () => {
		expect(calculateDiscount(500, 0)).toBe(500);
	});

	it('handles 100% discount', () => {
		expect(calculateDiscount(500, 100)).toBe(0);
	});
});

describe('isInStock', () => {
	it('returns true for positive quantity', () => {
		expect(isInStock(5)).toBe(true);
	});

	it('returns false for zero', () => {
		expect(isInStock(0)).toBe(false);
	});
});
```

## ইন্টিগ্রেশন টেস্টিং: কম্পোনেন্ট

ইন্টিগ্রেশন টেস্ট কম্পোনেন্ট রেন্ডার করে, ইউজার ইন্টারঅ্যাকশন সিমুলেট করে, আর ফলাফল হিসেবে যে DOM তৈরি হয় সেটা যাচাই করে। ব্যবহারকারীরা যেভাবে দেখে সেভাবেই কম্পোনেন্ট টেস্ট করতে Testing Library ব্যবহার করুন।

```typescript
// components/LoginForm.tsx
import { useState } from "react";

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

      <label htmlFor="password">Password</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
```

```typescript
// components/LoginForm.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  it("submits email and password", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "mypassword");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(handleSubmit).toHaveBeenCalledWith("user@example.com", "mypassword");
  });

  it("shows error message on failure", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockRejectedValue(new Error("Invalid credentials"));

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText("Email"), "wrong@example.com");
    await user.type(screen.getByLabelText("Password"), "bad");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
  });

  it("disables button while submitting", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn(() => new Promise(() => {})); // never resolves

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent("Signing in...");
  });
});
```

<Callout type="tip">

**Testing Library-এর সেরা চর্চা:**

- role, label বা text দিয়ে কোয়েরি করুন — কখনো class name বা test ID দিয়ে নয় (একান্ত দরকার না হলে)
- `fireEvent`-এর বদলে `userEvent` ব্যবহার করুন — এটা ফোকাস, কীবোর্ড ইভেন্ট আর পয়েন্টার ইভেন্টসহ প্রকৃত ব্যবহারকারীর আচরণ সিমুলেট করে
- বিহেভিয়ার টেস্ট করুন, ইমপ্লিমেন্টেশন নয় — state ভেরিয়েবল বা কম্পোনেন্টের অভ্যন্তরীণ বিষয় নিয়ে assert করবেন না
- প্রতি বিহেভিয়ারে একটা assertion — কোনো টেস্ট যদি অনেক কিছু করে ফেলে, সেটা ভাগ করে দিন

</Callout>

## মকিং

মকিং টেস্টের অধীন কোডকে API, টাইমার আর মডিউলের মতো বাইরের নির্ভরশীলতা থেকে আলাদা করে রাখে।

```typescript
// Mocking API calls
import { vi } from "vitest";

// Mock a module
vi.mock("../api/products", () => ({
  fetchProducts: vi.fn(),
}));

import { fetchProducts } from "../api/products";

it("displays products from API", async () => {
  (fetchProducts as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: "1", name: "Smartphone", price: 25000 },
    { id: "2", name: "Laptop", price: 75000 },
  ]);

  render(<ProductList />);

  expect(await screen.findByText("Smartphone")).toBeInTheDocument();
  expect(screen.getByText("Laptop")).toBeInTheDocument();
});

// Mocking fetch globally
beforeEach(() => {
  global.fetch = vi.fn();
});

it("handles API error", async () => {
  (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error("Network error")
  );

  render(<ProductList />);

  expect(await screen.findByText(/network error/i)).toBeInTheDocument();
});
```

## Playwright দিয়ে E2E টেস্টিং

E2E টেস্ট একটা আসল ব্রাউজারে চলে আর একাধিক পেজজুড়ে সম্পূর্ণ ইউজার ফ্লো টেস্ট করে।

```typescript
// tests/checkout.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
	test('user can add item to cart and checkout', async ({ page }) => {
		// Navigate to products
		await page.goto('/products');

		// Add a product to cart
		await page.getByRole('button', { name: 'Add to Cart' }).first().click();

		// Verify cart count updated
		await expect(page.getByTestId('cart-count')).toHaveText('1');

		// Go to cart
		await page.getByRole('link', { name: 'Cart' }).click();

		// Verify product is in cart
		await expect(page.getByRole('heading', { level: 2 })).toBeVisible();

		// Proceed to checkout
		await page.getByRole('button', { name: 'Checkout' }).click();

		// Fill shipping info
		await page.getByLabel('Full Name').fill('Layla al-Khwarizmi');
		await page.getByLabel('Phone').fill('+1-555-0123');
		await page.getByLabel('Address').fill('123 Main St, Springfield');

		// Place order
		await page.getByRole('button', { name: 'Place Order' }).click();

		// Verify success
		await expect(page.getByText('Order placed successfully')).toBeVisible();
	});
});
```

<Callout type="warning">

**টেস্টিংয়ের সাধারণ ভুল:**

- **ইমপ্লিমেন্টেশন ডিটেইল টেস্ট করা** — state ভেরিয়েবল, CSS ক্লাস বা অভ্যন্তরীণ মেথড কলের উপর assert করা। বিহেভিয়ার একই থাকলেও রিফ্যাক্টরে এই টেস্টগুলো ভেঙে পড়ে।
- **এরর স্টেট টেস্ট না করা** — হ্যাপি পাথ টেস্ট সহজ। বাগ লুকিয়ে থাকে loading, error, empty আর এজ কেস স্টেটে।
- **ফ্লেকি E2E টেস্ট** — এলোমেলো `waitForTimeout` কলের বদলে সবসময় `await expect(...).toBeVisible()` ব্যবহার করুন।
- **লক্ষ্য হিসেবে 100% কভারেজ** — কভারেজ মাপে কোন লাইন এক্সিকিউট হলো, কোন বিহেভিয়ার যাচাই হলো তা নয়। কোনো assertion ছাড়া একটা কম্পোনেন্ট রেন্ডার করা টেস্ট 100% কভারেজ দেয় আর 0% আস্থা দেয়।

</Callout>

## টেস্ট সংগঠন

```
src/
├── components/
│   ├── LoginForm.tsx
│   └── LoginForm.test.tsx      ← co-located integration test
├── utils/
│   ├── price.ts
│   └── price.test.ts           ← co-located unit test
├── hooks/
│   ├── useAuth.ts
│   └── useAuth.test.ts         ← hook test with renderHook
tests/
├── e2e/
│   ├── checkout.spec.ts        ← E2E tests in separate folder
│   └── auth.spec.ts
└── setup.ts                    ← test setup (mocks, matchers)
```

## মূল বিষয়সমূহ

1. **ইন্টিগ্রেশন টেস্ট** সবচেয়ে বেশি মূল্য দেয় — ব্যবহারকারীরা যেভাবে কম্পোনেন্টের সাথে ইন্টারঅ্যাক্ট করে সেভাবেই টেস্ট করুন
2. পিওর লজিক **ইউনিট টেস্ট** করুন — ইউটিলিটি, রিডিউসার, ফরম্যাটার — React কম্পোনেন্ট নয়
3. **E2E টেস্ট** ক্রিটিক্যাল ইউজার ফ্লো কভার করে — login, checkout, signup — অল্প পরিমাণে
4. **role আর label দিয়ে কোয়েরি করুন** — কখনো class name বা DOM স্ট্রাকচার দিয়ে নয়
5. **বাউন্ডারিতে মক করুন** — API কল আর বাইরের সার্ভিস মক করুন, অভ্যন্তরীণ মডিউল নয়
6. **এরর স্টেট টেস্ট করুন** — বাগ থাকে loading, error, empty আর এজ কেসে
