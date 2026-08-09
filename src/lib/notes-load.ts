// Shared load logic for the notes routes.
import { error } from '@sveltejs/kit';
import { loadChapter, getChapters } from '$lib/content';
import { categoryMeta } from '$lib/data/notes-labels';

/** Data for a category (track) index page. */
export function loadCategoryData(category: string) {
	const meta = categoryMeta(category);
	if (!meta) error(404, 'Category not found');
	return {
		category,
		meta,
		chapters: getChapters(category)
	};
}

/** Data for a single chapter page. */
export async function loadChapterData(category: string, slug: string) {
	const loaded = await loadChapter(category, slug);
	const cat = categoryMeta(category);
	if (!loaded || !cat) error(404, 'Chapter not found');

	const chapters = getChapters(category);
	const idx = chapters.findIndex((c) => c.slug === slug);

	return {
		component: loaded.component,
		meta: loaded.meta,
		category,
		slug,
		categoryLabel: cat.label,
		trackSlugs: chapters.map((c) => c.slug),
		total: chapters.length,
		prev: idx > 0 ? chapters[idx - 1] : null,
		next: idx < chapters.length - 1 ? chapters[idx + 1] : null
	};
}
