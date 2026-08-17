import { error, redirect } from '@sveltejs/kit';
import { loadPost, getBlogPosts } from '$lib/content';
import { MOVED_POSTS } from '$lib/data/series';

export function entries() {
	// Slugs of parts that moved under /series are still built — as redirects, so
	// the published URLs keep working.
	return [
		...getBlogPosts().map((p) => ({ slug: p.slug })),
		...Object.keys(MOVED_POSTS).map((slug) => ({ slug }))
	];
}

export async function load({ params }) {
	const moved = MOVED_POSTS[params.slug];
	if (moved) redirect(308, moved);

	const post = await loadPost(params.slug);
	if (!post) error(404, 'Post not found');
	return { component: post.component, meta: post.meta, slug: params.slug };
}
