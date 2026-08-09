import { loadChapterData } from '$lib/notes-load';
import { getChapters, getNoteCategories } from '$lib/content';

export function entries() {
	const out: Array<{ category: string; slug: string }> = [];
	for (const category of getNoteCategories()) {
		for (const ch of getChapters(category)) out.push({ category, slug: ch.slug });
	}
	return out;
}

export function load({ params }) {
	return loadChapterData(params.category, params.slug);
}
