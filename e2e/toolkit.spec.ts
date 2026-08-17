import { expect, test } from '@playwright/test';

/**
 * The end-to-end pass the toolkit exists for: one artifact chain, walked in
 * order, asserting that what you type in step one is still doing work in step
 * five. Unit tests cover the critic and the extractor; this covers the thing
 * neither of them can — that the steps are actually wired to each other.
 */

const JOB_POST = `
We need a backend engineer to fix duplicate charges in our Stripe checkout.

Requirements:
- Must have experience with idempotent payment flows
- At least 4 years with Node.js and PostgreSQL

Please start your proposal with the word "reconcile" so we know you read this.

How would you handle refunds?

Budget is $3000 fixed price.
`;

test.describe('freelance kit', () => {
	test('carries one piece of evidence from the bank through to the proposal', async ({ page }) => {
		await page.goto('/tools/freelance');

		// --- step 1: evidence -------------------------------------------------
		await page.getByRole('button', { name: 'নতুন প্রমাণ যোগ করো' }).click();

		await page.getByLabel('নাম').fill('Checkout double charges');
		await page.getByLabel('ডোমেইন').fill('payments');
		await page.getByLabel('সমস্যা').fill('Double charges during peak sales.');
		await page
			.getByLabel('তুমি কী করলে')
			.fill(
				'I designed an idempotency key and a nightly reconciliation job, choosing that over distributed transactions.'
			);
		await page.getByLabel('আগে').fill('0.4');
		await page.getByLabel('পরে').fill('0.02');
		await page.getByLabel('একক').fill('% of orders');

		// With a measurement present, the blocker on this entry clears.
		await expect(page.getByText('কোনো সংখ্যা নেই', { exact: false })).toHaveCount(0);

		// --- step 2: positioning ---------------------------------------------
		await page.getByRole('button', { name: /পজিশনিং/ }).click();
		await page.getByLabel('ভূমিকা').fill('Senior Backend Engineer');
		await page.getByLabel('ডোমেইন').fill('payments and orders');
		await page.getByLabel('সমস্যার ধরন').fill('reliability');
		await page.getByLabel('স্ট্যাক').fill('Go, PostgreSQL');

		// The evidence written in step 1 is selectable here — the chain is real.
		await page.getByRole('combobox').selectOption({ label: 'Checkout double charges' });
		await expect(page.getByText('Double charges during peak sales.')).toBeVisible();

		// --- step 5: proposal -------------------------------------------------
		await page.getByRole('button', { name: /প্রপোজাল/ }).click();
		await page.getByLabel('জব পোস্ট').fill(JOB_POST);

		// The extractor surfaces what the client actually asked for. The question
		// appears twice on purpose — once in the read-out, once as the label of the
		// answer field it generated — so both are asserted explicitly.
		await expect(page.getByText('স্ক্রিনিং শর্ত')).toBeVisible();
		await expect(page.locator('li', { hasText: 'How would you handle refunds?' })).toBeVisible();
		await expect(page.getByLabel(/উত্তর 1/)).toBeVisible();
		await expect(page.locator('.chip', { hasText: 'stripe' })).toBeVisible();

		// The screener is unmet while the required word is missing…
		await page.getByLabel('শুরুর লাইন').fill('Duplicate charges usually come from retries.');
		await expect(page.getByText(/"reconcile" শব্দটা চেয়েছে/)).toBeVisible();

		// …and clears once it is used.
		await page
			.getByLabel('শুরুর লাইন')
			.fill('Reconcile — duplicate charges usually come from retries, not from Stripe.');
		await expect(page.getByText(/"reconcile" শব্দটা চেয়েছে/)).toHaveCount(0);

		// The composer deliberately does not guess which evidence belongs in a
		// proposal — pick it, as a reader would.
		await page.getByRole('button', { name: 'Checkout double charges' }).click();

		// --- the hand-off ------------------------------------------------------
		await page.getByRole('button', { name: 'দেখে নাও' }).click();
		const prompt = page.locator('.preview');
		await expect(prompt).toContainText('Checkout double charges'); // evidence
		await expect(prompt).toContainText('Senior Backend Engineer'); // positioning
		await expect(prompt).toContainText('reconcile'); // the screener
		await expect(prompt).toContainText('Do not invent facts'); // the standing rule
	});

	test('survives a reload — everything is stored locally', async ({ page }) => {
		await page.goto('/tools/freelance');
		await page.getByRole('button', { name: 'নতুন প্রমাণ যোগ করো' }).click();
		await page.getByLabel('নাম').fill('Persisted entry');

		await page.waitForTimeout(500); // debounced autosave
		await page.reload();

		await expect(page.getByText('Persisted entry')).toBeVisible();
	});

	test('the critic blocks template filler', async ({ page }) => {
		await page.goto('/tools/freelance');
		await page.getByRole('button', { name: /প্রোফাইল/ }).click();
		await page
			.getByLabel('ওভারভিউ')
			.fill('I hope this message finds you well. I am a passionate developer.');

		await expect(page.getByText('ঠিক করতেই হবে').first()).toBeVisible();
	});
});
