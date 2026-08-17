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
	/** Series parts only: the series' display title, as declared in `series.ts`. */
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
/** A part of a multi-part series. `series` is the directory/URL slug; the
 *  display title lives in `$lib/data/series`. */
export type SeriesEntry = { series: string; slug: string; meta: BlogMeta };

// ---- lazy component loaders (one chunk per file, no eager bundling) ---------

const blogComps = import.meta.glob<MdModule>('/src/content/blog/*.md');
const noteComps = import.meta.glob<MdModule>('/src/content/notes/*/*.md');
const seriesComps = import.meta.glob<MdModule>('/src/content/series/*/*.md');

const blogList = manifest.blog as BlogEntry[];
const noteList = manifest.notes as ChapterEntry[];
const seriesPartList = manifest.series as SeriesEntry[];

// ---- blog ------------------------------------------------------------------

export function getBlogPosts(): BlogEntry[] {
	return blogList
		.filter((p) => !p.meta.draft)
		.sort((a, b) => +new Date(b.meta.date) - +new Date(a.meta.date));
}

export function getAllTags(): string[] {
	return [...new Set(getBlogPosts().flatMap((p) => p.meta.tags ?? []))].sort();
}

export async function loadPost(slug: string) {
	const meta = blogList.find((p) => p.slug === slug)?.meta;
	const loader = blogComps[`/src/content/blog/${slug}.md`];
	if (!meta || !loader) return null;
	const mod = await loader();
	return { component: mod.default, meta };
}

// ---- series ----------------------------------------------------------------

export type SeriesInfo = {
	/** URL slug of the series. */
	series: string;
	/** Display title, taken from the parts' frontmatter. */
	title: string;
	parts: SeriesEntry[];
	currentIndex: number;
	prev: SeriesEntry | null;
	next: SeriesEntry | null;
};

/** Every series slug that has published parts, newest series first. */
export function getSeriesSlugs(): string[] {
	return [...new Set(getSeriesEntries().map((p) => p.series))];
}

function getSeriesEntries(): SeriesEntry[] {
	return seriesPartList.filter((p) => !p.meta.draft);
}

/** The parts of one series in reading order. Ordered by `seriesPart` rather
 *  than date or filename, so a backfilled or renumbered part still lands in the
 *  right place. */
export function getSeriesParts(series: string): SeriesEntry[] {
	return getSeriesEntries()
		.filter((p) => p.series === series)
		.sort((a, b) => (a.meta.seriesPart ?? 0) - (b.meta.seriesPart ?? 0));
}

/** Ordered parts plus the neighbours of `slug` — what both the series index and
 *  the prev/next pager read from, so "what comes after this" is decided once. */
export function getSeriesNav(series: string, slug: string): SeriesInfo | null {
	const parts = getSeriesParts(series);
	const currentIndex = parts.findIndex((p) => p.slug === slug);
	if (currentIndex === -1) return null;
	return {
		series,
		title: parts[currentIndex].meta.series ?? series,
		parts,
		currentIndex,
		prev: parts[currentIndex - 1] ?? null,
		next: parts[currentIndex + 1] ?? null
	};
}

export async function loadSeriesPart(series: string, slug: string) {
	const meta = seriesPartList.find((p) => p.series === series && p.slug === slug)?.meta;
	const loader = seriesComps[`/src/content/series/${series}/${slug}.md`];
	if (!meta || !loader) return null;
	const mod = await loader();
	return { component: mod.default, meta };
}

// ---- notes -----------------------------------------------------------------

export function getChapters(category: string): ChapterEntry[] {
	return noteList
		.filter((c) => c.category === category)
		.sort((a, b) => a.meta.chapter - b.meta.chapter);
}

export function getNoteCategories(): string[] {
	return [...new Set(noteList.map((c) => c.category))];
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

export async function loadChapter(category: string, slug: string) {
	const meta = noteList.find((c) => c.category === category && c.slug === slug)?.meta;
	const loader = noteComps[`/src/content/notes/${category}/${slug}.md`];
	if (!meta || !loader) return null;
	const mod = await loader();
	return { component: mod.default, meta };
}
