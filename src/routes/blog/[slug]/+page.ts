import { error } from '@sveltejs/kit';
import { loadPost, getBlogPosts } from '$lib/content';

export function entries() {
	return getBlogPosts().map((p) => ({ slug: p.slug }));
}

export async function load({ params }) {
	const post = await loadPost(params.slug);
	if (!post) error(404, 'Post not found');
	return { component: post.component, meta: post.meta, slug: params.slug };
}
