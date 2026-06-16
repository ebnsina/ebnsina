---
title: "Testing Strategies"
subtitle: "Unit tests, integration tests, E2E tests, Testing Library patterns, and mocking — building confidence in your code."
chapter: 7
level: "advanced"
readingTime: "12 min"
topics: ["testing", "unit tests", "integration tests", "E2E", "testing library", "mocking"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Test Frontend Code?

Frontend code is notoriously fragile — a CSS change can break layouts, a refactor can disconnect event handlers, and API changes can crash entire pages. Testing gives you confidence to ship changes without manually clicking through every flow. The key is knowing which type of test to write for each situation.

<Callout type="info">

**Real-World Analogy**

Like quality control at a car factory — unit testing checks each part individually, integration testing checks if the engine connects to the transmission, E2E testing drives the finished car around a track.

</Callout>

## The Testing Trophy

Kent C. Dodds' testing trophy suggests this distribution:

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

Integration tests give the most confidence per dollar because they test components the way users interact with them — without being as slow and brittle as E2E tests.

## Unit Testing: Pure Logic

Unit tests are for pure functions and utilities — things with clear inputs and outputs, no DOM, no side effects.

```typescript
// utils/price.ts
export function formatPrice(amount: number, currency: string = "BDT"): string {
  if (amount < 0) throw new Error("Price cannot be negative");
  return `৳${amount.toLocaleString("en-BD")}`;
}

export function calculateDiscount(
  price: number,
  discountPercent: number
): number {
  return Math.round(price * (1 - discountPercent / 100));
}

export function isInStock(quantity: number): boolean {
  return quantity > 0;
}
```

```typescript
// utils/price.test.ts
import { describe, it, expect } from "vitest";
import { formatPrice, calculateDiscount, isInStock } from "./price";

describe("formatPrice", () => {
  it("formats a standard price", () => {
    expect(formatPrice(1500)).toBe("৳1,500");
  });

  it("handles zero", () => {
    expect(formatPrice(0)).toBe("৳0");
  });

  it("throws on negative price", () => {
    expect(() => formatPrice(-100)).toThrow("Price cannot be negative");
  });
});

describe("calculateDiscount", () => {
  it("applies 20% discount", () => {
    expect(calculateDiscount(1000, 20)).toBe(800);
  });

  it("rounds to nearest integer", () => {
    expect(calculateDiscount(999, 15)).toBe(849);
  });

  it("handles 0% discount", () => {
    expect(calculateDiscount(500, 0)).toBe(500);
  });

  it("handles 100% discount", () => {
    expect(calculateDiscount(500, 100)).toBe(0);
  });
});

describe("isInStock", () => {
  it("returns true for positive quantity", () => {
    expect(isInStock(5)).toBe(true);
  });

  it("returns false for zero", () => {
    expect(isInStock(0)).toBe(false);
  });
});
```

## Integration Testing: Components

Integration tests render components, simulate user interactions, and verify the resulting DOM. Use Testing Library to test components the way users see them.

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

**Testing Library best practices:**
- Query by role, label, or text — never by class name or test ID (unless necessary)
- Use `userEvent` over `fireEvent` — it simulates real user behavior including focus, keyboard events, and pointer events
- Test behavior, not implementation — do not assert on state variables or component internals
- One assertion per behavior — if a test does too many things, split it

</Callout>

## Mocking

Mocking isolates the code under test from external dependencies like APIs, timers, and modules.

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

## E2E Testing with Playwright

E2E tests run in a real browser and test complete user flows across multiple pages.

```typescript
// tests/checkout.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Checkout Flow", () => {
  test("user can add item to cart and checkout", async ({ page }) => {
    // Navigate to products
    await page.goto("/products");

    // Add a product to cart
    await page.getByRole("button", { name: "Add to Cart" }).first().click();

    // Verify cart count updated
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    // Go to cart
    await page.getByRole("link", { name: "Cart" }).click();

    // Verify product is in cart
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();

    // Proceed to checkout
    await page.getByRole("button", { name: "Checkout" }).click();

    // Fill shipping info
    await page.getByLabel("Full Name").fill("Layla al-Khwarizmi");
    await page.getByLabel("Phone").fill("+1-555-0123");
    await page.getByLabel("Address").fill("123 Main St, Springfield");

    // Place order
    await page.getByRole("button", { name: "Place Order" }).click();

    // Verify success
    await expect(page.getByText("Order placed successfully")).toBeVisible();
  });
});
```

<Callout type="warning">

**Common testing mistakes:**
- **Testing implementation details** — asserting on state variables, CSS classes, or internal method calls. These tests break on refactors even when behavior is unchanged.
- **Not testing error states** — happy path tests are easy. The bugs hide in loading, error, empty, and edge case states.
- **Flaky E2E tests** — always use `await expect(...).toBeVisible()` instead of arbitrary `waitForTimeout` calls.
- **100% coverage as a goal** — coverage measures which lines executed, not which behaviors are verified. A test that renders a component with no assertions gives 100% coverage and 0% confidence.

</Callout>

## Test Organization

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

## Key Takeaways

1. **Integration tests** give the most value — test components the way users interact with them
2. **Unit test** pure logic — utilities, reducers, formatters — not React components
3. **E2E tests** cover critical user flows — login, checkout, signup — sparingly
4. **Query by role and label** — never by class name or DOM structure
5. **Mock at the boundary** — mock API calls and external services, not internal modules
6. **Test error states** — the bugs live in loading, error, empty, and edge cases

