// Rebuilds the notes half of content-manifest.json by scanning local content,
// so new tracks self-register without re-running the `es` migration.
// Blog entries are preserved from the existing manifest.
//
//   node scripts/build-manifest.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/ebnsina/Sites/ebnsina';
const NOTES_DIR = join(ROOT, 'src/content/notes');
const MANIFEST = join(ROOT, 'src/lib/content-manifest.json');

/** Parse the frontmatter block of a markdown file into an object. */
function parseFrontmatter(text) {
	const m = text.match(/^---\n([\s\S]*?)\n---/);
	if (!m) return null;
	const meta = {};
	for (const line of m[1].split('\n')) {
		const i = line.indexOf(':');
		if (i === -1) continue;
		const key = line.slice(0, i).trim();
		const raw = line.slice(i + 1).trim();
		if (!key || !raw) continue;
		try {
			meta[key] = JSON.parse(raw); // values are double-quoted / numbers / JSON arrays
		} catch {
			meta[key] = raw.replace(/^["']|["']$/g, '');
		}
	}
	return meta;
}

const dirs = readdirSync(NOTES_DIR).filter((d) => statSync(join(NOTES_DIR, d)).isDirectory());

const notes = [];
for (const category of dirs.sort()) {
	const files = readdirSync(join(NOTES_DIR, category)).filter((f) => f.endsWith('.md'));
	for (const file of files.sort()) {
		const slug = file.replace(/\.md$/, '');
		const meta = parseFrontmatter(readFileSync(join(NOTES_DIR, category, file), 'utf8'));
		if (!meta) {
			console.warn(`! no frontmatter: ${category}/${file}`);
			continue;
		}
		notes.push({ category, slug, meta });
	}
}

const existing = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const manifest = { blog: existing.blog ?? [], notes };

writeFileSync(MANIFEST, JSON.stringify(manifest, null, '\t') + '\n');
console.log(
	`Manifest rebuilt: ${manifest.notes.length} note chapters across ${dirs.length} tracks, ${manifest.blog.length} blog posts preserved.`
);
