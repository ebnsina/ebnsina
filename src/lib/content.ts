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

export async function loadChapter(category: string, slug: string) {
	const meta = noteList.find((c) => c.category === category && c.slug === slug)?.meta;
	const loader = noteComps[`/src/content/notes/${category}/${slug}.md`];
	if (!meta || !loader) return null;
	const mod = await loader();
	return { component: mod.default, meta };
}
