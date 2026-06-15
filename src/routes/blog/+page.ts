import { getBlogPosts, getAllTags } from '$lib/content';

export function load() {
	return { posts: getBlogPosts(), tags: getAllTags() };
}
