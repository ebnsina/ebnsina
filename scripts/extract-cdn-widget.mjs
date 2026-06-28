import { readFileSync, writeFileSync } from 'node:fs';

const SRC = '/Users/ebnsina/Sites/es/src/content/blog/cdn-openresty-gcore.md';
const lines = readFileSync(SRC, 'utf8').split('\n');

// 1-indexed source boundaries
const styleInner = lines.slice(1215, 1342).join('\n'); // between <style> and </style>
const rawMarkup = lines.slice(1343, 1616).join('\n').trim(); // after </style>, before <script>
const scriptInner = lines.slice(1617, 2178).join('\n'); // between <script> and </script>

// The widget markup has a few markdown section labels/paragraphs interleaved
// between the cards. Convert those bare-text lines to HTML (everything else is
// already a tag, so it passes through untouched).
const bold = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const markup = rawMarkup
	.split('\n')
	.map((line) => {
		const t = line.trim();
		if (/^###\s+/.test(t))
			return `<h3 class="pg-section-heading">${bold(t.replace(/^###\s+/, ''))}</h3>`;
		if (t && !t.includes('<') && /[A-Za-z]/.test(t))
			return `<p class="pg-section-text">${bold(t)}</p>`;
		return line;
	})
	.join('\n');

// global css file (+ styling for the converted section labels)
const sectionCss = `
.pg-section-heading {
	font-family: var(--font-serif);
	font-weight: 600;
	font-size: 1.25rem;
	letter-spacing: -0.01em;
	margin: 2rem 0 0.4rem;
}
.pg-section-text {
	color: var(--muted);
	line-height: 1.7;
	margin: 0 0 1rem;
}
`;
writeFileSync(
	'/Users/ebnsina/Sites/ebnsina/src/lib/components/content/cdn-playground.css',
	styleInner + '\n' + sectionCss
);

// svelte component
const comp = `<script>
	// @ts-nocheck
	// Self-contained vanilla-JS interactive demo, ported verbatim; runs client-side.
	import { onMount } from 'svelte';
	import './cdn-playground.css';

	onMount(() => {
${scriptInner
	.split('\n')
	.map((l) => '\t\t' + l)
	.join('\n')}
	});
</script>

${markup}
`;
writeFileSync('/Users/ebnsina/Sites/ebnsina/src/lib/components/content/CdnPlayground.svelte', comp);

// patch the migrated post: replace everything from first body <style> to EOF.
// Idempotent: only patches a freshly-migrated post (one that still has <style>).
const OUT = '/Users/ebnsina/Sites/ebnsina/src/content/blog/cdn-openresty-gcore.md';
let post = readFileSync(OUT, 'utf8');
const styleIdx = post.indexOf('\n<style>');
if (styleIdx === -1) {
	console.log('post already patched — run migrate-content.mjs first to reset. Skipping patch.');
	process.exit(0);
}
post = post.slice(0, styleIdx).replace(/\n+$/, '') + '\n\n<CdnPlayground />\n';
// add import to the post's <script> block (create one if missing)
if (post.includes('<CdnPlayground')) {
	if (/^<script>/m.test(post)) {
		post = post.replace(
			/(<script>\n)/,
			"$1\timport CdnPlayground from '$lib/components/content/CdnPlayground.svelte';\n"
		);
	} else {
		// insert after frontmatter
		post = post.replace(
			/(^---\n[\s\S]*?\n---\n)/,
			"$1\n<script>\n\timport CdnPlayground from '$lib/components/content/CdnPlayground.svelte';\n</script>\n"
		);
	}
}
writeFileSync(OUT, post);
console.log(
	'markup lines:',
	markup.split('\n').length,
	'| script lines:',
	scriptInner.split('\n').length,
	'| style lines:',
	styleInner.split('\n').length
);
console.log('post now ends with CdnPlayground:', post.trimEnd().endsWith('<CdnPlayground />'));
