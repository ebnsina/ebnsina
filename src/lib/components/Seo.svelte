<script lang="ts">
	import { page } from '$app/state';
	import { SITE } from '$lib/config';

	let {
		title,
		description = SITE.description,
		type = 'website',
		image = SITE.ogImage,
		noindex = false
	}: {
		title?: string;
		description?: string;
		type?: 'website' | 'article';
		image?: string;
		noindex?: boolean;
	} = $props();

	const fullTitle = $derived(title ? `${title} — ${SITE.name}` : SITE.title);
	const canonical = $derived(new URL(page.url.pathname, SITE.url).href);
	const ogImage = $derived(new URL(image, SITE.url).href);
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

	<link rel="alternate" type="application/rss+xml" title="{SITE.name} — RSS" href="/rss.xml" />
</svelte:head>
