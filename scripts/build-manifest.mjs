// Rebuilds the notes half of content-manifest.json by scanning local content,
// so new tracks self-register without re-running the `es` migration.
// Blog entries are preserved from the existing manifest.
//
// Also emits src/lib/search-index.json — the ⌘K palette's index. Both come
// from the same pass because the search haystack needs each file's headings,
// and this script is already reading every file to parse frontmatter.
//
//   node scripts/build-manifest.mjs

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/ebnsina/Sites/ebnsina';
const NOTES_DIR = join(ROOT, 'src/content/notes');
const BLOG_DIR = join(ROOT, 'src/content/blog');
const MANIFEST = join(ROOT, 'src/lib/content-manifest.json');
const SEARCH_INDEX = join(ROOT, 'src/lib/search-index.json');

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

/** Scan the notes tree into manifest entries. `text` rides along for the search
 *  index and is stripped before the manifest is written. */
function scanNotes(baseDir) {
	if (!existsSync(baseDir)) return [];
	const dirs = readdirSync(baseDir).filter((d) => statSync(join(baseDir, d)).isDirectory());
	const out = [];
	for (const category of dirs.sort()) {
		const files = readdirSync(join(baseDir, category)).filter((f) => f.endsWith('.md'));
		for (const file of files.sort()) {
			const slug = file.replace(/\.md$/, '');
			const text = readFileSync(join(baseDir, category, file), 'utf8');
			const meta = parseFrontmatter(text);
			if (!meta) {
				console.warn(`! no frontmatter: ${category}/${file}`);
				continue;
			}
			out.push({ category, slug, meta, text });
		}
	}
	return out;
}

// ---- search index ----------------------------------------------------------

/** Every `##`/`###` heading in a document, stripped of markdown noise.
 *  Headings are the cheapest useful proxy for full text: 5k of them cover what
 *  a chapter is *about* at ~2% of the prose's weight. */
function headings(text) {
	return [...text.matchAll(/^#{2,3} +(.+)$/gm)].map((m) =>
		m[1]
			.replace(/[`*_[\]()]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

/** Fold text into its lowercase words. \p{M} keeps Bangla matras attached —
 *  without it every combining mark splits a word and the text degrades to loose
 *  consonants. */
function words(text) {
	return text
		.normalize('NFC')
		.toLowerCase()
		.split(/[^\p{L}\p{N}\p{M}+#.-]+/u)
		.filter(Boolean);
}

/** The bag of words a row is matched against *beyond* its title and subtitle.
 *  Those two are scored as their own fields at runtime, so repeating them here
 *  would be dead weight — as would the heavy repetition between topics and
 *  headings. Deduping against both cuts the shipped index by about a third at
 *  zero cost to recall. */
function haystack(title, subtitle, parts) {
	const named = new Set([...words(title), ...words(subtitle)]);
	return [...new Set(words(parts.join(' ')))].filter((w) => !named.has(w)).join(' ');
}

function chapterRow({ category, slug, meta, text }) {
	// 0 = notes chapter. `category`/`slug` build the URL at runtime, and the
	// track's display label is resolved from the category there too, so this
	// file never has to duplicate the Bangla category strings.
	return [
		0,
		category,
		slug,
		meta.title,
		meta.subtitle ?? '',
		haystack(meta.title, meta.subtitle ?? '', [
			(meta.topics ?? []).join(' '),
			category.replace(/-/g, ' '),
			slug.replace(/[-\d]+/g, ' '),
			headings(text).join(' ')
		])
	];
}

function postRow(entry) {
	const file = join(BLOG_DIR, `${entry.slug}.md`);
	const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
	const m = entry.meta;
	return [
		1, // blog post
		'',
		entry.slug,
		m.title,
		m.description ?? '',
		haystack(m.title, m.description ?? '', [
			(m.tags ?? []).join(' '),
			m.series ?? '',
			entry.slug.replace(/-/g, ' '),
			headings(text).join(' ')
		])
	];
}

const notes = scanNotes(NOTES_DIR);

const existing = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const blog = existing.blog ?? [];
const manifest = { blog, notes: notes.map(({ text, ...rest }) => rest) };

writeFileSync(MANIFEST, JSON.stringify(manifest, null, '\t') + '\n');

const rows = [...notes.map(chapterRow), ...blog.filter((p) => !p.meta.draft).map(postRow)];
writeFileSync(SEARCH_INDEX, JSON.stringify(rows) + '\n');

const trackCount = new Set(notes.map((n) => n.category)).size;
const indexKb = Math.round(Buffer.byteLength(JSON.stringify(rows)) / 1024);
console.log(
	`Manifest rebuilt: ${manifest.notes.length} note chapters across ${trackCount} tracks, ${blog.length} blog posts preserved.`
);
console.log(`Search index rebuilt: ${rows.length} rows, ${indexKb} KB raw.`);
