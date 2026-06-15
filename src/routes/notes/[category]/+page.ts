import { error } from '@sveltejs/kit';
import { getChapters, getNoteCategories } from '$lib/content';
import { CATEGORIES } from '$lib/data/categories';

export function entries() {
	return getNoteCategories().map((category) => ({ category }));
}

export function load({ params }) {
	const meta = CATEGORIES[params.category];
	const chapters = getChapters(params.category);
	if (!meta || !chapters.length) error(404, 'Category not found');
	return { category: params.category, meta, chapters };
}
