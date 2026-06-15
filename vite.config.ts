import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { mdsvex, escapeSvelte } from 'mdsvex';
import { codeToHtml } from 'shiki';

/** Shiki highlighter with dual light/dark themes, auto-loading languages. */
async function highlighter(code: string, lang: string | null | undefined) {
	const opts = {
		themes: { light: 'github-light', dark: 'github-dark' },
		defaultColor: false
	} as const;
	let html: string;
	try {
		html = await codeToHtml(code, { lang: lang || 'text', ...opts });
	} catch {
		html = await codeToHtml(code, { lang: 'text', ...opts });
	}
	// escapeSvelte neutralises {, }, ` and \t\r\n; any other backslash (\d, \u, …)
	// would still break the untagged template literal, so escape those too.
	const safe = escapeSvelte(html).replace(/\\/g, '&#92;');
	return `{@html \`${safe}\`}`;
}

const mdsvexOptions = {
	extensions: ['.md', '.svx'],
	highlight: { highlighter },
	smartypants: { dashes: 'oldschool' as const }
};

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				experimental: { async: true }
			},
			adapter: adapter(),
			preprocess: [mdsvex(mdsvexOptions)],
			extensions: ['.svelte', '.svx', '.md'],
			prerender: { handleHttpError: 'warn', handleMissingId: 'warn' },
			experimental: { remoteFunctions: true, handleRenderingErrors: true }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
