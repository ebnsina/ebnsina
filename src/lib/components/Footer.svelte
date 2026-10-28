<script lang="ts">
	import { SITE } from '$lib/config';

	const year = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(new Date());

	const pages = [
		{ label: 'Writing', href: '/blog' },
		{ label: 'Series', href: '/series' },
		{ label: 'Notes', href: '/notes' },
		{ label: 'Projects', href: '/projects' },
		{ label: 'Tools', href: '/tools' },
		{ label: 'Directory', href: '/directory' },
		{ label: 'About', href: '/about' },
		{ label: 'Uses', href: '/uses' },
		{ label: 'CV', href: '/cv' },
		{ label: 'RSS', href: '/rss.xml' }
	];

	const elsewhere = [
		{ label: 'GitHub', href: SITE.social.github },
		{ label: 'LinkedIn', href: SITE.social.linkedin },
		{ label: 'WhatsApp', href: `https://wa.me/${SITE.phone.slice(1)}` }
	];
</script>

<footer class="site-footer">
	<p class="eyebrow">Have something to build?</p>
	<a class="mail" href="mailto:{SITE.email}">
		<span>Say hello</span>
		<span class="address">{SITE.email}</span>
	</a>

	<nav class="pages" aria-label="Site">
		{#each pages as p (p.href)}
			<a href={p.href}>{p.label}</a>
		{/each}
	</nav>

	<div class="base">
		<span>© {year} {SITE.name}</span>
		<nav aria-label="Elsewhere">
			{#each elsewhere as e (e.href)}
				<a href={e.href} target="_blank" rel="noopener">{e.label}</a>
			{/each}
		</nav>
	</div>
</footer>

<style>
	.site-footer {
		display: grid;
		gap: var(--step-3);
		margin-top: var(--section-space);
		padding: var(--section-space) var(--sina-gutter) 2rem;
		border-top: 1px solid var(--rule);
		border-radius: 0;
	}
	.mail {
		display: grid;
		gap: 0.15em;
		width: fit-content;
		font-family: var(--font-display);
		font-size: clamp(2.5rem, 8vw, 7.5rem);
		font-weight: 400;
		line-height: 1;
		letter-spacing: -0.03em;
	}
	.address {
		font-size: 0.75em;
		color: var(--em);
		transition: color 0.2s;
	}
	.pages,
	.base nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--step--1) var(--step-1);
	}
	.pages {
		margin-top: var(--step-3);
		font-size: var(--step--1);
	}
	.base {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--step--1) var(--step-1);
		padding-top: var(--step-0);
		border-top: 1px solid var(--rule);
		border-radius: 0;
		font-size: var(--step--1);
		color: var(--muted);
	}
	.pages a,
	.base a {
		color: var(--muted);
		transition: color 0.15s;
	}
	.pages a:hover,
	.base a:hover {
		color: var(--fg);
	}
</style>
