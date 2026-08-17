import { getBlogPosts, getSeriesSlugs, getSeriesParts } from '$lib/content';
import { SITE } from '$lib/config';

export const prerender = true;

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function GET() {
	// One feed for everything readable: standalone posts plus every series part,
	// each under its own canonical URL, newest first.
	const entries = [
		...getBlogPosts().map((p) => ({ url: `${SITE.url}/blog/${p.slug}/`, meta: p.meta })),
		...getSeriesSlugs().flatMap((s) =>
			getSeriesParts(s).map((p) => ({ url: `${SITE.url}/series/${s}/${p.slug}/`, meta: p.meta }))
		)
	].sort((a, b) => +new Date(b.meta.date) - +new Date(a.meta.date));

	const items = entries
		.map(
			(p) => `    <item>
      <title>${esc(p.meta.title)}</title>
      <description>${esc(p.meta.description)}</description>
      <link>${p.url}</link>
      <guid>${p.url}</guid>
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
