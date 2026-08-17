import { defineConfig } from '@playwright/test';

/**
 * E2E runs against the built site, because that is what actually ships — the
 * whole app is prerendered, and a dev-server-only pass would not prove the
 * toolkit works from static HTML plus hydration.
 */
export default defineConfig({
	testDir: 'e2e',
	webServer: {
		command: 'pnpm build && pnpm preview --port 4188 --strictPort',
		port: 4188,
		// Never adopt a server we did not start. A leftover `vite preview` on the
		// port serves an older build, and the failure it produces (a page that
		// renders but never hydrates) looks exactly like an app bug.
		reuseExistingServer: false,
		// A full prerender of the site is ~500 pages, so the build alone can run
		// for minutes on a loaded machine. Generous, because the failure mode of a
		// tight timeout here looks like a test failure rather than a slow build.
		timeout: 900_000
	},
	use: { baseURL: 'http://localhost:4188' }
});
