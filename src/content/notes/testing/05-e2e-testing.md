---
title: "End-to-End Testing"
subtitle: "Testing user journeys in a real browser — Playwright setup, selectors, auth, CI, and keeping e2e tests fast and reliable."
chapter: 5
level: "intermediate"
readingTime: "9 min"
topics: ["e2e testing", "Playwright", "browser automation", "Cypress", "test reliability", "flakiness"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A mystery shopper visiting a store: they experience the complete customer journey — enter the store, find a product, bring it to the register, pay, leave with a receipt. They don't test the POS system's API or the inventory database directly — they test whether the whole thing works together from a customer's perspective.

</Callout>

## When to Write E2E Tests

E2E tests are expensive — slow to run, harder to debug, flakier than unit or integration tests. Use them for:

- **Critical user journeys**: signup, login, checkout, payment
- **High-value workflows**: the 5–10 flows that must work for the business to function
- **Regression protection**: flows that have broken in production before

Don't use for:
- Every feature (use integration tests instead)
- Error states (better tested with integration tests — faster, more reliable)
- Things that change frequently (high maintenance cost)

A healthy ratio: 5–15 e2e tests, not 200.

## Playwright Setup

```bash
npm install -D @playwright/test
npx playwright install chromium  # or --with-deps for all browsers
```

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,           // per test
  retries: process.env.CI ? 2 : 0,  // retry on CI, not locally
  workers: process.env.CI ? 1 : undefined,  // parallel locally, serial in CI

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',      // record trace when test fails
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Add mobile/firefox/safari selectively — only where it matters
  ],

  webServer: {
    command: 'npm run start:test',  // starts app with test config
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Writing E2E Tests

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can sign up', async ({ page }) => {
    await page.goto('/signup');

    await page.fill('[name=email]', 'newuser@example.com');
    await page.fill('[name=password]', 'SecurePass123!');
    await page.fill('[name=name]', 'New User');
    await page.click('[type=submit]');

    // Wait for navigation, not arbitrary time
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Welcome, New User' })).toBeVisible();
  });

  test('shows error for duplicate email', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('[name=email]', 'existing@example.com');
    await page.fill('[name=password]', 'SecurePass123!');
    await page.click('[type=submit]');

    await expect(page.getByText('Email already registered')).toBeVisible();
    await expect(page).toHaveURL('/signup');  // didn't navigate
  });

  test('can log out', async ({ page, context }) => {
    // Use saved auth state (see Authentication section)
    await page.goto('/dashboard');
    await page.click('[data-testid=user-menu]');
    await page.click('text=Sign out');

    await expect(page).toHaveURL('/login');

    // Verify session is cleared
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');  // redirected
  });
});
```

## Selectors: What to Use

```typescript
// BEST: role-based (accessible, resilient to UI changes)
await page.getByRole('button', { name: 'Add to cart' });
await page.getByRole('link', { name: 'Sign in' });
await page.getByRole('textbox', { name: 'Email' });

// GOOD: test IDs (explicit, stable)
await page.getByTestId('checkout-button');  // data-testid="checkout-button"

// GOOD: label text (for form inputs)
await page.getByLabel('Email address');

// ACCEPTABLE: text content (for static text)
await page.getByText('Your order was placed');

// AVOID: CSS classes (implementation detail, breaks on refactor)
await page.locator('.btn-primary.checkout');  // fragile

// AVOID: XPath (brittle, hard to read)
await page.locator('//div[@class="cart"]//button[1]');  // avoid
```

Add `data-testid` attributes to interactive elements in your app:

```tsx
// In your component
<button data-testid="checkout-button" onClick={checkout}>
  Checkout
</button>
```

## Handling Authentication

Re-running login before every test is slow and a common source of flakiness. Save auth state once:

```typescript
// e2e/auth.setup.ts — runs once, saves cookies/storage
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', process.env.TEST_USER_EMAIL!);
  await page.fill('[name=password]', process.env.TEST_USER_PASSWORD!);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');

  // Save the auth state (cookies + localStorage)
  await page.context().storageState({ path: authFile });
});
```

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'authenticated',
      use: {
        storageState: path.join(__dirname, 'e2e/.auth/user.json'),
      },
      dependencies: ['setup'],
    },
  ],
});

// Now all tests in 'authenticated' project start already logged in
// test('views dashboard', async ({ page }) => {
//   await page.goto('/dashboard');  // no login needed
// });
```

## Page Object Model

For complex flows, extract selectors and actions into page objects:

```typescript
// e2e/pages/checkout-page.ts
import { Page, expect } from '@playwright/test';

export class CheckoutPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/checkout');
  }

  async fillShipping(address: { street: string; city: string; zip: string }) {
    await this.page.fill('[name=street]', address.street);
    await this.page.fill('[name=city]', address.city);
    await this.page.fill('[name=zip]', address.zip);
  }

  async fillPayment(card: { number: string; expiry: string; cvc: string }) {
    // Stripe iframe — must switch frame context
    const frame = this.page.frameLocator('[data-testid=card-iframe]');
    await frame.getByLabel('Card number').fill(card.number);
    await frame.getByLabel('Expiry').fill(card.expiry);
    await frame.getByLabel('CVC').fill(card.cvc);
  }

  async submit() {
    await this.page.click('[data-testid=place-order]');
  }

  async expectConfirmation() {
    await expect(this.page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
    return {
      orderId: await this.page.getByTestId('order-id').textContent(),
    };
  }
}

// Use in tests
test('completes checkout', async ({ page }) => {
  const checkout = new CheckoutPage(page);
  await checkout.goto();
  await checkout.fillShipping({ street: '123 Main St', city: 'NYC', zip: '10001' });
  await checkout.fillPayment({ number: '4242424242424242', expiry: '12/28', cvc: '123' });
  await checkout.submit();
  const { orderId } = await checkout.expectConfirmation();
  expect(orderId).toBeTruthy();
});
```

## Avoiding Flakiness

The most common causes of flaky e2e tests:

```typescript
// WRONG: arbitrary sleep (race condition waiting to happen)
await page.click('button');
await page.waitForTimeout(2000);  // hope the page loaded
await expect(page.locator('.result')).toBeVisible();

// RIGHT: wait for a specific condition
await page.click('button');
await expect(page.locator('.result')).toBeVisible();  // auto-retries until visible
// Or:
await page.waitForResponse(res => res.url().includes('/api/search'));

// WRONG: depends on previous test state
test('deletes the user created in the previous test', ...);  // fragile

// RIGHT: each test is self-contained
test('deletes a user', async ({ page }) => {
  // Seed the user this test needs
  await page.request.post('/api/test/seed-user', { data: { id: 'test-user-1' } });
  // Now test deletion
  await page.goto('/admin/users/test-user-1');
  await page.click('[data-testid=delete-user]');
});
```

```typescript
// Test isolation: use unique data per test run
const runId = Date.now();

test('creates a product', async ({ page }) => {
  const name = `Test Product ${runId}`;  // unique name
  await page.fill('[name=product-name]', name);
  // ...
  await expect(page.getByText(name)).toBeVisible();  // safe to assert exact name
});
```

## CI Configuration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - run: npm ci
      - run: npx playwright install --with-deps chromium

      - name: Start app
        run: npm run start:test &
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
          NODE_ENV: test

      - name: Wait for app
        run: npx wait-on http://localhost:3000 --timeout 60000

      - name: Run e2e tests
        run: npx playwright test
        env:
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
          BASE_URL: http://localhost:3000

      - name: Upload test artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

## Debugging Failed Tests

```bash
# Run with UI mode — visual debugger
npx playwright test --ui

# Run headed (see the browser)
npx playwright test --headed --project=chromium

# Slow down for debugging
npx playwright test --headed --slow-mo=500

# Open last trace
npx playwright show-trace test-results/trace.zip

# Debug specific test with inspector
npx playwright test --debug e2e/checkout.spec.ts
```

Playwright's trace viewer shows every action, network request, and console log — essential for debugging CI failures without reproducing locally.

