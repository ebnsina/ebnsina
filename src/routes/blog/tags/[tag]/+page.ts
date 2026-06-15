import { error } from '@sveltejs/kit';
import { getBlogPosts, getAllTags } from '$lib/content';

export function entries() {
	return getAllTags().map((tag) => ({ tag }));
}

export function load({ params }) {
	const posts = getBlogPosts().filter((p) => (p.meta.tags ?? []).includes(params.tag));
	if (!posts.length) error(404, 'No posts for tag');
	return { tag: params.tag, posts };
}
