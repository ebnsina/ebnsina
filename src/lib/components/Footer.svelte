<script lang="ts">
	import { SITE } from '$lib/config';
	import Icon from '$lib/components/Icon.svelte';
	const year = new Date().getFullYear();

	// Sitemap columns. Kept here rather than derived from SITE.nav so the footer
	// can group by intent (read / about me / off-site) and surface the feed and
	// sitemap routes that never belong in the header.
	const columns = [
		{
			heading: 'Read',
			links: [
				{ label: 'Writing', href: '/blog' },
				{ label: 'Notes', href: '/notes' },
				{ label: 'Directory', href: '/directory' },
				{ label: 'Projects', href: '/projects' }
			]
		},
		{
			heading: 'About',
			links: [
				{ label: 'About me', href: '/about' },
				{ label: 'Uses', href: '/uses' }
			]
		},
		{
			heading: 'Elsewhere',
			links: [
				{ label: 'GitHub', href: SITE.social.github, external: true },
				{ label: 'Twitter', href: SITE.social.twitter, external: true },
				{ label: 'LinkedIn', href: SITE.social.linkedin, external: true },
				{ label: 'Email', href: `mailto:${SITE.email}` },
				{ label: 'RSS feed', href: '/rss.xml' }
			]
		}
	];
</script>

<footer class="mt-20" style="border-top: 1px solid color-mix(in oklch, var(--fg) 7%, transparent)">
	<div class="mx-auto max-w-5xl px-5 py-14 sm:px-8">
		<div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-8">
			<!-- brand blurb; contact is a plain link in the Elsewhere column -->
			<div class="max-w-xs">
				<p class="font-display text-base font-semibold tracking-tight">
					Ebn <span class="text-accent">Sina</span>
				</p>
				<p class="mt-2.5 text-sm leading-relaxed text-muted">
					Software engineer building infrastructure and developer products — and writing about the
					craft behind them.
				</p>
			</div>

			{#each columns as col (col.heading)}
				<nav aria-label={col.heading}>
					<p class="mb-3.5 font-mono text-[0.66rem] uppercase tracking-[0.2em] text-muted">
						{col.heading}
					</p>
					<ul class="space-y-2.5">
						{#each col.links as link (link.href)}
							<li>
								<a
									href={link.href}
									target={link.external ? '_blank' : undefined}
									rel={link.external ? 'me noopener' : undefined}
									class="group inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
								>
									{link.label}
									{#if link.external}
										<Icon
											name="arrowUpRight"
											size={12}
											class="opacity-0 transition-opacity group-hover:opacity-100"
										/>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</nav>
			{/each}
		</div>

		<!-- bottom bar -->
		<div
			class="mt-12 flex flex-col gap-4 pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between"
			style="border-top: 1px solid color-mix(in oklch, var(--fg) 7%, transparent)"
		>
			<p>
				© {year}
				<a href="/" class="transition-colors hover:text-accent">{SITE.name}</a>.
			</p>

			<a href="/rss.xml" class="transition-colors hover:text-fg">RSS</a>
		</div>
	</div>
</footer>
