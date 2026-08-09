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

const blogList = manifest.blog as BlogEntry[];
const noteList = manifest.notes as ChapterEntry[];

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
