import { getNoteCategories } from '$lib/content';
import { loadCategoryData } from '$lib/notes-load';

export function entries() {
	return getNoteCategories().map((category) => ({ category }));
}

export function load({ params }) {
	return loadCategoryData(params.category);
}
