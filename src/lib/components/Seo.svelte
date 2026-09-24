<script lang="ts">
	import { page } from '$app/state';
	import { SITE } from '$lib/config';

	let {
		title,
		description = SITE.description,
		type = 'website',
		image = SITE.ogImage,
		noindex = false,
		profilePage = false
	}: {
		title?: string;
		description?: string;
		type?: 'website' | 'article';
		image?: string;
		noindex?: boolean;
		/** Emit ProfilePage schema (use on the /about page). */
		profilePage?: boolean;
	} = $props();

	const fullTitle = $derived(title ? `${title} | ${SITE.name}` : SITE.title);
	const canonical = $derived(new URL(page.url.pathname, SITE.url).href);
	const ogImage = $derived(new URL(image, SITE.url).href);

	const personId = `${SITE.url}/#person`;
	const websiteId = `${SITE.url}/#website`;

	// Machine-readable identity graph so search engines and LLMs resolve a
	// single, unambiguous entity for "Ebn Sina" (linked to off-site profiles).
	const jsonLd = $derived(() => {
		const graph: Record<string, unknown>[] = [
			{
				'@type': 'Person',
				'@id': personId,
				name: SITE.name,
				url: SITE.url,
				jobTitle: SITE.jobTitle,
				description: SITE.bio,
				email: `mailto:${SITE.email}`,
				image: new URL(SITE.ogImage, SITE.url).href,
				sameAs: Object.values(SITE.social),
				knowsAbout: SITE.knowsAbout
			},
			{
				'@type': 'WebSite',
				'@id': websiteId,
				name: SITE.name,
				url: SITE.url,
				description: SITE.description,
				inLanguage: SITE.locale,
				author: { '@id': personId },
				publisher: { '@id': personId }
			}
		];
		if (profilePage) {
			graph.push({
				'@type': 'ProfilePage',
				url: canonical,
				mainEntity: { '@id': personId }
			});
		}
		return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
	});

	// Build the script tag from split literals so the source never contains a
	// raw opening/closing script substring (Svelte would treat it as a second
	// script block). Escape `<` in the payload so data can't break out.
	const LD_OPEN = '<' + 'script type="application/ld+json">';
	const LD_CLOSE = '</' + 'script>';
	const jsonLdScript = $derived(LD_OPEN + jsonLd().replace(/</g, '\\u003c') + LD_CLOSE);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<meta name="author" content={SITE.author} />
	{#if noindex}<meta name="robots" content="noindex, nofollow" />{/if}
	<link rel="canonical" href={canonical} />

	<meta property="og:type" content={type} />
	<meta property="og:site_name" content={SITE.name} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:locale" content={SITE.locale.replace('-', '_')} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImage} />
	<meta name="twitter:creator" content={SITE.twitterHandle} />
	<meta name="twitter:site" content={SITE.twitterHandle} />

	<link rel="alternate" type="application/rss+xml" title="{SITE.name} RSS" href="/rss.xml" />

	{@html jsonLdScript}
</svelte:head>
