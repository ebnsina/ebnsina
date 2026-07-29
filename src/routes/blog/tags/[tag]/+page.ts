import { error } from '@sveltejs/kit';
import { getBlogPosts } from '$lib/content';

// Rendered on demand rather than prerendered — deliberately.
//
// adapter-vercel emits two routes per prerendered page (a rewrite plus a 308
// for the trailing-slash counterpart), and Vercel caps a deployment at 2048
// routes total. The notes tree alone is ~936 pages, so prerendering one page
// per tag spent ~114 routes on pages that mostly list a single post — and it
// pushed a deploy over the limit.
//
// Serving these from the existing catch-all function costs no extra routes and
// keeps every tag URL working. Everything else on the site stays prerendered.
export const prerender = false;

export function load({ params }) {
	const posts = getBlogPosts().filter((p) => (p.meta.tags ?? []).includes(params.tag));
	if (!posts.length) error(404, 'No posts for tag');
	return { tag: params.tag, posts };
}
