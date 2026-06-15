import { error } from '@sveltejs/kit';
import { loadChapter, getChapters, getNoteCategories } from '$lib/content';
import { CATEGORIES } from '$lib/data/categories';

export function entries() {
	const out: Array<{ category: string; slug: string }> = [];
	for (const category of getNoteCategories()) {
		for (const ch of getChapters(category)) out.push({ category, slug: ch.slug });
	}
	return out;
}

export async function load({ params }) {
	const loaded = await loadChapter(params.category, params.slug);
	const meta = CATEGORIES[params.category];
	if (!loaded || !meta) error(404, 'Chapter not found');

	const chapters = getChapters(params.category);
	const idx = chapters.findIndex((c) => c.slug === params.slug);

	return {
		component: loaded.component,
		meta: loaded.meta,
		category: params.category,
		categoryLabel: meta.label,
		total: chapters.length,
		prev: idx > 0 ? chapters[idx - 1] : null,
		next: idx < chapters.length - 1 ? chapters[idx + 1] : null
	};
}
