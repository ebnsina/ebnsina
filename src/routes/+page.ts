import { getBlogPosts } from '$lib/content';

export function load() {
	return { posts: getBlogPosts().slice(0, 3) };
}
