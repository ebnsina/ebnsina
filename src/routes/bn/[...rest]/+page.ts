// The notes used to live in two locales — English at /notes and Bangla at
// /bn/notes. They are now Bangla-only and served from /notes, so every old
// /bn/notes/* URL redirects to its counterpart rather than 404ing.
import { redirect } from '@sveltejs/kit';
import { getChapters, getNoteCategories } from '$lib/content';

export function entries() {
	const out = [{ rest: 'notes' }];
	for (const category of getNoteCategories()) {
		out.push({ rest: `notes/${category}` });
		for (const ch of getChapters(category)) out.push({ rest: `notes/${category}/${ch.slug}` });
	}
	return out;
}

export function load({ params }) {
	redirect(308, `/${params.rest}`);
}
