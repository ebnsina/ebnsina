// One-shot migration: es (Astro MDX) → ebnsina (SvelteKit mdsvex).
// Usage: node scripts/migrate-content.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import getReadingTime from 'reading-time';

const SRC = '/Users/ebnsina/Sites/es/src/content';
const OUT = '/Users/ebnsina/Sites/ebnsina/src/content';

const NOTE_TOPICS = readdirSync(SRC).filter((d) => {
	const p = join(SRC, d);
	return statSync(p).isDirectory() && d !== 'blog' && d !== 'projects';
});

// ---- helpers ---------------------------------------------------------------

function splitFrontmatter(raw) {
	if (!raw.startsWith('---')) return { fm: '', body: raw };
	const end = raw.indexOf('\n---', 3);
	if (end === -1) return { fm: '', body: raw };
	const fmInner = raw.slice(3, end).replace(/^\n/, '');
	const body = raw.slice(end + 4).replace(/^\r?\n/, '');
	return { fm: fmInner, body };
}

// Remove real component imports (outside code fences only).
function stripAstroImports(body) {
	const lines = body.split('\n');
	let inFence = false;
	const out = [];
	for (const line of lines) {
		const t = line.trimStart();
		if (t.startsWith('```')) inFence = !inFence;
		if (!inFence && /^\s*import\s+.+\s+from\s+["'][^"']*\.astro["'];?\s*$/.test(line)) continue;
		out.push(line);
	}
	return out.join('\n');
}

function detectComponents(body) {
	const lines = body.split('\n');
	let inFence = false;
	const used = new Set();
	for (const line of lines) {
		const t = line.trimStart();
		if (t.startsWith('```')) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		if (/<Callout\b/.test(line)) used.add('Callout');
		if (/<CodeTabs\b/.test(line)) used.add('CodeTabs');
		if (/<Diagram\b/.test(line)) used.add('Diagram');
		if (/<LevelBadge\b/.test(line)) used.add('LevelBadge');
	}
	return used;
}

function convertCodeTabs(body) {
	return body
		.replace(/<Fragment\s+slot="ts">[ \t]*\n/g, '<div class="ct-panel ct-active" data-lang="ts">\n\n')
		.replace(/<Fragment\s+slot="go">[ \t]*\n/g, '<div class="ct-panel" data-lang="go">\n\n')
		.replace(/\n[ \t]*<\/Fragment>/g, '\n\n</div>');
}

// Escape `<` used as a comparison operator (e.g. `< 200ms`, `<= 5`) so Svelte
// doesn't treat it as a tag. Real tags (`<div`, `</p`) and generics (`<T>`)
// start with a letter or `/` and are left alone. Skips code fences.
function escapeAngles(body) {
	const lines = body.split('\n');
	let inFence = false;
	return lines
		.map((line) => {
			const t = line.trimStart();
			if (t.startsWith('```')) {
				inFence = !inFence;
				return line;
			}
			if (inFence) return line;
			return line.replace(/<(?=[\s0-9=])/g, '&lt;');
		})
		.join('\n');
}

function spaceCallouts(body) {
	return body
		.replace(/(<Callout\b[^>]*>)[ \t]*\n(?!\n)/g, '$1\n\n')
		.replace(/([^\n])\n[ \t]*<\/Callout>/g, '$1\n\n</Callout>');
}

function buildScript(used) {
	const imports = [];
	if (used.has('Callout'))
		imports.push("\timport Callout from '$lib/components/content/Callout.svelte';");
	if (used.has('CodeTabs'))
		imports.push("\timport CodeTabs from '$lib/components/content/CodeTabs.svelte';");
	if (used.has('Diagram'))
		imports.push("\timport Diagram from '$lib/components/content/Diagram.svelte';");
	if (used.has('LevelBadge'))
		imports.push("\timport LevelBadge from '$lib/components/content/LevelBadge.svelte';");
	if (!imports.length) return '';
	return `<script>\n${imports.join('\n')}\n</script>\n\n`;
}

// Minimal YAML-frontmatter parser for the simple key: value shapes used here.
function parseFrontmatter(fm) {
	const meta = {};
	for (const line of fm.split('\n')) {
		const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
		if (!m) continue;
		const key = m[1];
		let v = m[2].trim();
		if (v === '') continue;
		if (v.startsWith('[')) {
			meta[key] = v
				.slice(1, -1)
				.split(',')
				.map((s) => s.trim().replace(/^["']|["']$/g, ''))
				.filter(Boolean);
		} else if (v === 'true' || v === 'false') {
			meta[key] = v === 'true';
		} else if (/^-?\d+$/.test(v)) {
			meta[key] = Number(v);
		} else {
			meta[key] = v.replace(/^["']|["']$/g, '');
		}
	}
	return meta;
}

function transform(raw, { isBlog }) {
	let { fm, body } = splitFrontmatter(raw);

	body = stripAstroImports(body);
	const used = detectComponents(body);
	body = convertCodeTabs(body);
	body = spaceCallouts(body);
	body = escapeAngles(body);
	body = body.replace(/\/backend\b/g, '/notes'); // content used /backend as the notes root
	body = body.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');

	// blog: inject reading time into frontmatter
	if (isBlog) {
		const minutes = Math.max(1, Math.round(getReadingTime(body).minutes));
		if (!/^minutesRead:/m.test(fm)) fm = `${fm}\nminutesRead: ${minutes}`;
	}

	const script = buildScript(used);
	const text = `---\n${fm}\n---\n\n${script}${body}\n`;
	return { text, meta: parseFrontmatter(fm) };
}

function migrateDir(srcDir, outDir, isBlog) {
	mkdirSync(outDir, { recursive: true });
	const entries = [];
	for (const file of readdirSync(srcDir)) {
		if (!/\.mdx?$/.test(file)) continue;
		const raw = readFileSync(join(srcDir, file), 'utf8');
		const slug = basename(file).replace(/\.mdx?$/, '');
		const { text, meta } = transform(raw, { isBlog });
		writeFileSync(join(outDir, `${slug}.md`), text, 'utf8');
		entries.push({ slug, meta });
	}
	return entries;
}

// ---- run -------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });

const manifest = { blog: [], notes: [] };

manifest.blog = migrateDir(join(SRC, 'blog'), join(OUT, 'blog'), true);
for (const topic of NOTE_TOPICS) {
	const entries = migrateDir(join(SRC, topic), join(OUT, 'notes', topic), false);
	for (const e of entries) manifest.notes.push({ category: topic, slug: e.slug, meta: e.meta });
}

writeFileSync(
	'/Users/ebnsina/Sites/ebnsina/src/lib/content-manifest.json',
	JSON.stringify(manifest, null, '\t') + '\n'
);

const total = manifest.blog.length + manifest.notes.length;
console.log(`Migrated ${total} files + manifest across ${NOTE_TOPICS.length} note topics + blog.`);
