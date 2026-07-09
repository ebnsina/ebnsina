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

// ---- notes -----------------------------------------------------------------

export function getChapters(category: string, locale: Locale = 'en'): ChapterEntry[] {
	const chapters = noteList
		.filter((c) => c.category === category)
		.sort((a, b) => a.meta.chapter - b.meta.chapter);
	if (locale === 'en') return chapters;
	// Overlay BN metadata where a translation exists; keep English otherwise.
	return chapters.map((c) => {
		const bn = bnMetaMap.get(bnMetaKey(c.category, c.slug));
		return bn ? { ...c, meta: bn } : c;
	});
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
