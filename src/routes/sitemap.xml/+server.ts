import { getBlogPosts, getAllTags, getNoteCategories, getChapters } from '$lib/content';
import { SITE } from '$lib/config';

export const prerender = true;

export function GET() {
	const paths: string[] = ['', '/projects', '/about', '/uses', '/now', '/blog', '/notes'];

	for (const p of getBlogPosts()) paths.push(`/blog/${p.slug}`);
	for (const t of getAllTags()) paths.push(`/blog/tags/${encodeURIComponent(t)}`);
	for (const c of getNoteCategories()) {
		paths.push(`/notes/${c}`);
		for (const ch of getChapters(c)) paths.push(`/notes/${c}/${ch.slug}`);
	}

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((u) => `  <url><loc>${SITE.url}${u}</loc></url>`).join('\n')}
</urlset>`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/xml; charset=utf-8' }
	});
}
