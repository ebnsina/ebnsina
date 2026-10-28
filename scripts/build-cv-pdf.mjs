// Renders /cv from a running preview server into static/ebn-sina-cv.pdf.
// Usage: pnpm build && pnpm preview, then `pnpm cv:pdf [url]`.
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173/cv';
const out = new URL('../static/ebn-sina-cv.pdf', import.meta.url);

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	const res = await page.goto(url, { waitUntil: 'networkidle' });
	if (!res?.ok()) throw new Error(`GET ${url} returned ${res?.status()}`);
	await page.emulateMedia({ media: 'print', colorScheme: 'light' });
	await page.pdf({
		path: out.pathname,
		format: 'A4',
		printBackground: false,
		margin: { top: '14mm', bottom: '14mm', left: '16mm', right: '16mm' }
	});
	console.log(`wrote ${out.pathname}`);
} finally {
	await browser.close();
}
