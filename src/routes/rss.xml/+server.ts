import { getBlogPosts } from '$lib/content';
import { SITE } from '$lib/config';

export const prerender = true;

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function GET() {
	const posts = getBlogPosts();
	const items = posts
		.map(
			(p) => `    <item>
      <title>${esc(p.meta.title)}</title>
      <description>${esc(p.meta.description)}</description>
      <link>${SITE.url}/blog/${p.slug}/</link>
      <guid>${SITE.url}/blog/${p.slug}/</guid>
      <pubDate>${new Date(p.meta.date).toUTCString()}</pubDate>
${(p.meta.tags ?? []).map((t) => `      <category>${esc(t)}</category>`).join('\n')}
    </item>`
		)
		.join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE.name)}</title>
    <description>${esc(SITE.description)}</description>
    <link>${SITE.url}</link>
    <atom:link href="${SITE.url}/rss.xml" rel="self" type="application/rss+xml" />
    <language>en-us</language>
${items}
  </channel>
</rss>`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/xml; charset=utf-8' }
	});
}
