---
title: 'End-to-End Testing'
subtitle: 'একটা real browser-এ user journey টেস্ট করা — Playwright setup, selector, auth, CI, আর e2e test-কে দ্রুত ও নির্ভরযোগ্য রাখা।'
chapter: 5
level: 'intermediate'
readingTime: '9 মিনিট'
topics:
  ['e2e testing', 'Playwright', 'browser automation', 'Cypress', 'test reliability', 'flakiness']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন mystery shopper একটা দোকানে যাচ্ছে: তারা সম্পূর্ণ customer journey অনুভব করে — দোকানে ঢোকে, একটা প্রোডাক্ট খুঁজে বের করে, সেটা register-এ নিয়ে যায়, দাম দেয়, receipt নিয়ে বেরিয়ে যায়। তারা POS system-এর API বা inventory database সরাসরি টেস্ট করে না — তারা একজন customer-এর দৃষ্টিকোণ থেকে টেস্ট করে গোটা ব্যাপারটা একসাথে কাজ করে কিনা।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরি বুখারার একটা বড় দোকানের মালিক। দোকানটা ঠিকঠাক চলছে কিনা যাচাই করতে তিনি একজন mystery shopper — আল-খোয়ারিজমি — কে ভাড়া করলেন। শর্ত একটাই: তুমি কোনো কর্মচারীকে বলবে না তুমি কে, আর একজন সাধারণ খদ্দেরের মতোই পুরো ব্যাপারটা করে দেখবে। আল-খোয়ারিজমি সদর দরজা দিয়ে ঢুকলেন, তাক থেকে জিনিস খুঁজে ঝুড়িতে ভরলেন, ক্যাশ কাউন্টারে গিয়ে দাম মেটালেন, receipt বুঝে নিলেন, আর শেষে বাসায় ডেলিভারিটাও ঠিকমতো এলো কিনা সেটাও দেখলেন।

তিনি গুদামের হিসাব-খাতা বা ক্যাশ মেশিনের ভেতরটা আলাদা করে পরীক্ষা করেননি — শুরু থেকে শেষ পর্যন্ত গোটা journey-টা একজন খদ্দের যেভাবে অনুভব করে ঠিক সেভাবেই অনুভব করেছেন। এতে ফাতিমা সবচেয়ে বিশ্বস্ত প্রমাণটা পেলেন: আসল খদ্দেরের কাছে দোকানের অভিজ্ঞতা পুরোটা কাজ করে। কিন্তু এই যাচাই ধীর আর খরুচে — প্রতিটা ছোটখাটো জিনিস (একটা তাকের দাম ঠিক আছে কিনা) দেখতে তিনি বারবার mystery shopper পাঠান না, শুধু আসল গুরুত্বপূর্ণ যাত্রাপথগুলোর জন্যই পাঠান।

এই গল্পটাই আসলে **end-to-end (e2e) test**। mystery shopper একজন আসল খদ্দেরের মতো আচরণ করাটাই হলো e2e test-এর গোটা system-কে সত্যিকারের UI দিয়ে, ঠিক user-এর মতো চালানো। ঢোকা থেকে ডেলিভারি পর্যন্ত পুরো পথটাই হলো সব layer জুড়ে একটা complete user journey — UI, backend, database সব একসাথে। আর "সবচেয়ে বাস্তব প্রমাণ, কিন্তু ধীর ও খরুচে, তাই কম ব্যবহার করো" কথাটাই e2e-র মূল tradeoff: testing pyramid-এর একদম উপরে অল্প কয়েকটা রাখুন। বাস্তবে Playwright বা Cypress দিয়ে ঠিক এভাবেই signup থেকে checkout পর্যন্ত critical flow টেস্ট করা হয় — শক্তিশালী, কিন্তু flaky হওয়ার ঝুঁকি বেশি বলে সাবধানে অল্প রাখা হয়।

## কখন E2E Test লিখবেন

E2E test ব্যয়বহুল — চালাতে ধীর, debug করা কঠিন, unit বা integration test-এর চেয়ে বেশি flaky। এগুলো ব্যবহার করুন:

- **Critical user journey**-র জন্য: signup, login, checkout, payment
- **High-value workflow**-র জন্য: ৫–১০টা flow যা business চলার জন্য অবশ্যই কাজ করতে হবে
- **Regression protection**-এর জন্য: যেসব flow আগে production-এ ভেঙেছে

যেসবে ব্যবহার করবেন না:

- প্রতিটি feature (এর বদলে integration test ব্যবহার করুন)
- Error state (integration test দিয়ে ভালো টেস্ট হয় — দ্রুত, বেশি নির্ভরযোগ্য)
- যেসব জিনিস প্রায়ই বদলায় (বেশি maintenance খরচ)

একটা স্বাস্থ্যকর অনুপাত: ৫–১৫টা e2e test, ২০০টা নয়।

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
	timeout: 30_000, // per test
	retries: process.env.CI ? 2 : 0, // retry on CI, not locally
	workers: process.env.CI ? 1 : undefined, // parallel locally, serial in CI

	use: {
		baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
		trace: 'on-first-retry', // record trace when test fails
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},

	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }
		// Add mobile/firefox/safari selectively — only where it matters
	],

	webServer: {
		command: 'npm run start:test', // starts app with test config
		url: 'http://localhost:3000',
		reuseExistingServer: !process.env.CI
	}
});
```

## E2E Test লেখা

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
		await expect(page).toHaveURL('/signup'); // didn't navigate
	});

	test('can log out', async ({ page, context }) => {
		// Use saved auth state (see Authentication section)
		await page.goto('/dashboard');
		await page.click('[data-testid=user-menu]');
		await page.click('text=Sign out');

		await expect(page).toHaveURL('/login');

		// Verify session is cleared
		await page.goto('/dashboard');
		await expect(page).toHaveURL('/login'); // redirected
	});
});
```

## Selector: কোনটা ব্যবহার করবেন

```typescript
// BEST: role-based (accessible, resilient to UI changes)
await page.getByRole('button', { name: 'Add to cart' });
await page.getByRole('link', { name: 'Sign in' });
await page.getByRole('textbox', { name: 'Email' });

// GOOD: test IDs (explicit, stable)
await page.getByTestId('checkout-button'); // data-testid="checkout-button"

// GOOD: label text (for form inputs)
await page.getByLabel('Email address');

// ACCEPTABLE: text content (for static text)
await page.getByText('Your order was placed');

// AVOID: CSS classes (implementation detail, breaks on refactor)
await page.locator('.btn-primary.checkout'); // fragile

// AVOID: XPath (brittle, hard to read)
await page.locator('//div[@class="cart"]//button[1]'); // avoid
```

আপনার app-এর interactive element-এ `data-testid` attribute যোগ করুন:

```tsx
// In your component
<button data-testid="checkout-button" onClick={checkout}>
	Checkout
</button>
```

## Authentication সামলানো

প্রতিটি test-এর আগে আবার login চালানো ধীর আর flakiness-এর একটা সাধারণ উৎস। auth state একবার save করুন:

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
			testMatch: /auth\.setup\.ts/
		},
		{
			name: 'authenticated',
			use: {
				storageState: path.join(__dirname, 'e2e/.auth/user.json')
			},
			dependencies: ['setup']
		}
	]
});

// Now all tests in 'authenticated' project start already logged in
// test('views dashboard', async ({ page }) => {
//   await page.goto('/dashboard');  // no login needed
// });
```

## Page Object Model

জটিল flow-এর জন্য, selector আর action-গুলো page object-এ বের করে আনুন:

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
			orderId: await this.page.getByTestId('order-id').textContent()
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

## Flakiness এড়ানো

Flaky e2e test-এর সবচেয়ে সাধারণ কারণগুলো:

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
	const name = `Test Product ${runId}`; // unique name
	await page.fill('[name=product-name]', name);
	// ...
	await expect(page.getByText(name)).toBeVisible(); // safe to assert exact name
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

## Failed Test Debug করা

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

Playwright-এর trace viewer প্রতিটি action, network request, আর console log দেখায় — locally reproduce না করেই CI failure debug করার জন্য অপরিহার্য।
