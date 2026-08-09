import type { Component } from 'svelte';
import manifest from './content-manifest.json';

// ---- types -----------------------------------------------------------------

export type BlogMeta = {
	title: string;
	description: string;
	date: string;
	updated?: string;
	tags?: string[];
	draft?: boolean;
	cover?: string;
	minutesRead?: number;
	/** Posts sharing a `series` render an ordered index of the whole series. */
	series?: string;
	/** Position within the series. Ordering key — not derived from date. */
	seriesPart?: number;
};

export type ChapterMeta = {
	title: string;
	subtitle: string;
	chapter: number;
	level: 'beginner' | 'intermediate' | 'advanced' | 'mastery';
	readingTime: string;
	topics?: string[];
};

type MdModule = { default: Component };

export type BlogEntry = { slug: string; meta: BlogMeta };
export type ChapterEntry = { category: string; slug: string; meta: ChapterMeta };

// ---- lazy component loaders (one chunk per file, no eager bundling) ---------

const blogComps = import.meta.glob<MdModule>('/src/content/blog/*.md');
const noteComps = import.meta.glob<MdModule>('/src/content/notes/*/*.md');
const noteCompsBn = import.meta.glob<MdModule>('/src/content/notes-bn/*/*.md');

const blogList = manifest.blog as BlogEntry[];
const noteList = manifest.notes as ChapterEntry[];
// Bangla is a *partial overlay*: the English list is the canonical catalog
// (ordering, which chapters exist), and a BN entry overrides title/subtitle/
// topics + the rendered body where a translation exists. Untranslated chapters
// gracefully fall back to English, so /bn always shows the full roadmap.
const noteListBn = ((manifest as { notesBn?: unknown }).notesBn ?? []) as ChapterEntry[];

export type Locale = 'en' | 'bn';

const bnMetaKey = (category: string, slug: string) => `${category}/${slug}`;
const bnMetaMap = new Map(noteListBn.map((c) => [bnMetaKey(c.category, c.slug), c.meta]));

// Chapters that exist only in Bangla — a track authored in BN with no English
// counterpart. These are additive: they appear under /bn alongside the
// overlaid+fallback English catalog, and are invisible to the English routes.
const enKeys = new Set(noteList.map((c) => bnMetaKey(c.category, c.slug)));
const bnOnlyList = noteListBn.filter((c) => !enKeys.has(bnMetaKey(c.category, c.slug)));

// ---- blog ------------------------------------------------------------------

export function getBlogPosts(): BlogEntry[] {
	return blogList
		.filter((p) => !p.meta.draft)
		.sort((a, b) => +new Date(b.meta.date) - +new Date(a.meta.date));
}

export function getAllTags(): string[] {
	return [...new Set(getBlogPosts().flatMap((p) => p.meta.tags ?? []))].sort();
}

export type SeriesInfo = { title: string; parts: BlogEntry[]; currentIndex: number };

/** The ordered parts of the series a post belongs to, or null if it's standalone.
 *  Ordered by `seriesPart` rather than date, so a backfilled or corrected part
 *  still lands in the right place. */
export function getSeries(slug: string): SeriesInfo | null {
	const name = blogList.find((p) => p.slug === slug)?.meta.series;
	if (!name) return null;
	const parts = blogList
		.filter((p) => p.meta.series === name && !p.meta.draft)
		.sort((a, b) => (a.meta.seriesPart ?? 0) - (b.meta.seriesPart ?? 0));
	const currentIndex = parts.findIndex((p) => p.slug === slug);
	// A "series" of one is just a post.
	return parts.length > 1 && currentIndex !== -1 ? { title: name, parts, currentIndex } : null;
}

export async function loadPost(slug: string) {
	const meta = blogList.find((p) => p.slug === slug)?.meta;
	const loader = blogComps[`/src/content/blog/${slug}.md`];
	if (!meta || !loader) return null;
	const mod = await loader();
	return { component: mod.default, meta };
}

// ---- notes -----------------------------------------------------------------

export function getChapters(category: string, locale: Locale = 'en'): ChapterEntry[] {
	const chapters = noteList
		.filter((c) => c.category === category)
		.sort((a, b) => a.meta.chapter - b.meta.chapter);
	if (locale === 'en') return chapters;
	// Overlay BN metadata where a translation exists; keep English otherwise,
	// then append any BN-only chapters in this track and re-sort.
	const overlaid = chapters.map((c) => {
		const bn = bnMetaMap.get(bnMetaKey(c.category, c.slug));
		return bn ? { ...c, meta: bn } : c;
	});
	const bnOnly = bnOnlyList.filter((c) => c.category === category);
	if (bnOnly.length === 0) return overlaid;
	return [...overlaid, ...bnOnly].sort((a, b) => a.meta.chapter - b.meta.chapter);
}

/** Does the other locale have a page for this chapter?
 *  Asymmetric on purpose: an English chapter always has a /bn page (translated,
 *  or falling back to English prose per-field), but a BN-only chapter has no
 *  English counterpart at all — linking to one would 404. */
export function hasCounterpart(category: string, slug: string, locale: Locale): boolean {
	if (locale !== 'bn') return true;
	return noteList.some((c) => c.category === category && c.slug === slug);
}

/** The track-level equivalent of `hasCounterpart`. */
export function hasCategoryCounterpart(category: string, locale: Locale): boolean {
	if (locale !== 'bn') return true;
	return noteList.some((c) => c.category === category);
}

export function getNoteCategories(locale: Locale = 'en'): string[] {
	const categories = noteList.map((c) => c.category);
	// BN-only tracks have no English counterpart, so they must be added
	// explicitly or their routes never get prerendered.
	if (locale === 'bn') categories.push(...bnOnlyList.map((c) => c.category));
	return [...new Set(categories)];
}

export function getTotalChapters(): number {
	return noteList.length;
}

/** Each note category as a "track" with its ordered chapter slugs. */
export function getTracks(): Array<{ category: string; slugs: string[] }> {
	return getNoteCategories().map((category) => ({
		category,
		slugs: getChapters(category).map((c) => c.slug)
	}));
}

export async function loadChapter(category: string, slug: string, locale: Locale = 'en') {
	if (locale === 'bn') {
		// Prefer the translated body + metadata; fall back to English per-field.
		const bnMeta = bnMetaMap.get(bnMetaKey(category, slug));
		const bnLoader = noteCompsBn[`/src/content/notes-bn/${category}/${slug}.md`];
		if (bnMeta && bnLoader) {
			const mod = await bnLoader();
			return { component: mod.default, meta: bnMeta };
		}
	}
	const meta = noteList.find((c) => c.category === category && c.slug === slug)?.meta;
	const loader = noteComps[`/src/content/notes/${category}/${slug}.md`];
	if (!meta || !loader) return null;
	const mod = await loader();
	return { component: mod.default, meta };
}
