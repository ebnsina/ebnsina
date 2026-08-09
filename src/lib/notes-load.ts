// Shared load logic for the notes routes, parameterised by locale so the
// English (/notes) and Bangla (/bn/notes) route trees stay single-sourced.
import { error } from '@sveltejs/kit';
import { loadChapter, getChapters, hasCounterpart, hasCategoryCounterpart } from '$lib/content';
import { categoryMeta } from '$lib/data/categories.bn';
import { notesBase, type Locale } from '$lib/i18n/notes';

/** Data for a category (track) index page. */
export function loadCategoryData(category: string, locale: Locale) {
	const meta = categoryMeta(category, locale);
	if (!meta) error(404, 'Category not found');
	return {
		locale,
		base: notesBase(locale),
		category,
		meta,
		chapters: getChapters(category, locale),
		hasCounterpart: hasCategoryCounterpart(category, locale)
	};
}

/** Data for a single chapter page. */
export async function loadChapterData(category: string, slug: string, locale: Locale) {
	const loaded = await loadChapter(category, slug, locale);
	const cat = categoryMeta(category, locale);
	if (!loaded || !cat) error(404, 'Chapter not found');

	const chapters = getChapters(category, locale);
	const idx = chapters.findIndex((c) => c.slug === slug);

	return {
		locale,
		base: notesBase(locale),
		component: loaded.component,
		meta: loaded.meta,
		category,
		slug,
		categoryLabel: cat.label,
		hasCounterpart: hasCounterpart(category, slug, locale),
		trackSlugs: chapters.map((c) => c.slug),
		total: chapters.length,
		prev: idx > 0 ? chapters[idx - 1] : null,
		next: idx < chapters.length - 1 ? chapters[idx + 1] : null
	};
}
