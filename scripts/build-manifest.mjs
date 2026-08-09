// Rebuilds the notes half of content-manifest.json by scanning local content,
// so new tracks self-register without re-running the `es` migration.
// Blog entries are preserved from the existing manifest.
//
//   node scripts/build-manifest.mjs

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/ebnsina/Sites/ebnsina';
const NOTES_DIR = join(ROOT, 'src/content/notes');
const MANIFEST = join(ROOT, 'src/lib/content-manifest.json');

/** Turn one frontmatter value string into a JS value.
 *  Frontmatter uses YAML-ish single quotes (not valid JSON), so handle
 *  single-quoted arrays and scalars explicitly. Arrays MUST stay arrays —
 *  collapsing `topics` to a string makes `{#each}` iterate its characters. */
function parseValue(raw) {
	if (!raw) return '';
	if (raw.startsWith('[') && raw.endsWith(']')) {
		const inner = raw.slice(1, -1).trim();
		return inner ? inner.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')) : [];
	}
	try {
		return JSON.parse(raw); // double-quoted strings / numbers
	} catch {
		return raw.replace(/^["']|["']$/g, '');
	}
}

/** Parse the frontmatter block of a markdown file into an object.
 *  Joins continuation lines onto their key, so a value wrapped onto the next
 *  line (e.g. a long `topics: [...]` array) is parsed as one value. */
function parseFrontmatter(text) {
	const m = text.match(/^---\n([\s\S]*?)\n---/);
	if (!m) return null;
	const meta = {};
	let key = null;
	let raw = '';
	const commit = () => {
		if (key !== null) meta[key] = parseValue(raw.trim());
		key = null;
		raw = '';
	};
	for (const line of m[1].split('\n')) {
		const km = line.match(/^([A-Za-z_][\w-]*):(.*)$/); // a new top-level key
		if (km) {
			commit();
			key = km[1];
			raw = km[2];
		} else if (key !== null) {
			raw += ' ' + line; // continuation of the current value (wrapped array, etc.)
		}
	}
	commit();
	return meta;
}

/** Scan the notes tree into manifest entries. */
function scanNotes(baseDir) {
	if (!existsSync(baseDir)) return [];
	const dirs = readdirSync(baseDir).filter((d) => statSync(join(baseDir, d)).isDirectory());
	const out = [];
	for (const category of dirs.sort()) {
		const files = readdirSync(join(baseDir, category)).filter((f) => f.endsWith('.md'));
		for (const file of files.sort()) {
			const slug = file.replace(/\.md$/, '');
			const meta = parseFrontmatter(readFileSync(join(baseDir, category, file), 'utf8'));
			if (!meta) {
				console.warn(`! no frontmatter: ${category}/${file}`);
				continue;
			}
			out.push({ category, slug, meta });
		}
	}
	return out;
}

const notes = scanNotes(NOTES_DIR);

const existing = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const manifest = { blog: existing.blog ?? [], notes };

writeFileSync(MANIFEST, JSON.stringify(manifest, null, '\t') + '\n');
const trackCount = new Set(notes.map((n) => n.category)).size;
console.log(
	`Manifest rebuilt: ${manifest.notes.length} note chapters across ${trackCount} tracks, ${manifest.blog.length} blog posts preserved.`
);
