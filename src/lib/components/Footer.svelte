<script lang="ts">
	import { SITE } from '$lib/config';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';

	const contacts: { icon: IconName; label: string; value: string; href: string; external?: boolean }[] = [
		{ icon: 'mail', label: 'Email', value: SITE.email, href: `mailto:${SITE.email}` },
		{ icon: 'phone', label: 'Call', value: '+880 1841-252123', href: `tel:${SITE.phone}` },
		{
			icon: 'whatsapp',
			label: 'WhatsApp',
			value: 'Chat on WhatsApp',
			href: `https://wa.me/${SITE.phone.slice(1)}`,
			external: true
		}
	];

	// Sitemap columns. Kept here rather than derived from SITE.nav so the footer
	// can group by intent (read / about me / off-site) and surface the feed and
	// sitemap routes that never belong in the header.
	const columns: {
		heading: string;
		links: { label: string; href: string; external?: boolean; icon?: IconName }[];
	}[] = [
		{
			heading: 'Read',
			links: [
				{ label: 'Writing', href: '/blog' },
				{ label: 'Series', href: '/series' },
				{ label: 'Notes', href: '/notes' },
				{ label: 'Tools', href: '/tools' },
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
				{ label: 'GitHub', href: SITE.social.github, external: true, icon: 'github' },
				{ label: 'X / Twitter', href: SITE.social.twitter, external: true, icon: 'x' },
				{ label: 'LinkedIn', href: SITE.social.linkedin, external: true, icon: 'linkedin' },
				{ label: 'Email', href: `mailto:${SITE.email}`, icon: 'mail' },
				{ label: 'RSS feed', href: '/rss.xml', icon: 'rss' }
			]
		}
	];
</script>

<!-- its own section, on the page, so the footer stays a quiet sitemap -->
<section class="mx-auto mt-24 max-w-5xl px-5 sm:px-8" aria-labelledby="contact-heading">
	<div class="surface flex flex-col items-center px-6 py-16 text-center sm:py-20">
		<p class="eyebrow mb-4">Contact</p>
		<h2
			id="contact-heading"
			class="max-w-xl font-display text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-4xl"
		>
			Building something that has to hold up under load?
		</h2>
		<p class="mt-4 max-w-md text-muted">
			I'm happy to talk through architecture, a system that's struggling, or a product you want to
			get off the ground.
		</p>
		<ul class="mt-8 flex flex-wrap items-center justify-center gap-3">
			{#each contacts as c (c.href)}
				<li>
					<a
						href={c.href}
						target={c.external ? '_blank' : undefined}
						rel={c.external ? 'noopener' : undefined}
						aria-label={`${c.label}: ${c.value}`}
						class="contact-pill btn btn-ghost"
					>
						<Icon name={c.icon} size={18} />
						<span class="contact-label"><span>{c.value}</span></span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
</section>

<footer class="relative mt-24 overflow-hidden bg-[color-mix(in_oklch,var(--fg)_3%,var(--bg))]">
	<div class="mx-auto max-w-5xl px-5 sm:px-8">
		<div class="relative z-10 grid gap-10 pt-16 pb-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-8">
			<div class="max-w-xs">
				<p class="font-display text-base font-semibold tracking-tight">
					Ebn <span class="font-normal text-muted">Sina</span>
				</p>
				<p class="mt-2.5 text-[0.95rem] leading-relaxed text-muted">
					Software engineer building infrastructure and developer products — and writing about the
					craft behind them.
				</p>
			</div>

			{#each columns as col (col.heading)}
				<nav aria-label={col.heading}>
					<p class="mb-3.5 eyebrow">
						{col.heading}
					</p>
					<ul class="space-y-3">
						{#each col.links as link (link.href)}
							<li>
								<a
									href={link.href}
									target={link.external ? '_blank' : undefined}
									rel={link.external ? 'me noopener' : undefined}
									class="group inline-flex items-center gap-2 text-[0.95rem] text-muted transition-colors hover:text-fg"
								>
									{#if link.icon}<Icon name={link.icon} size={16} />{/if}
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

	</div>

	<!-- oversized wordmark: its cap line meets the link columns, and it is cropped
	     by the page edge — faint enough that the links above stay readable -->
	<p class="wordmark" aria-hidden="true">Ebn Sina</p>
</footer>

<style>
	/* Icon-only at rest; hovering or focusing slides the value out. The label
	   animates grid-template-columns 0fr → 1fr, which transitions smoothly to the
	   text's real width with no measured max-width. */
	/* .btn supplies size, type and colour; this only removes the side padding so
	   the collapsed button is a 46px square around its icon */
	.contact-pill {
		gap: 0;
		padding: 0 13px;
	}
	.contact-label {
		display: grid;
		grid-template-columns: 0fr;
		transition:
			grid-template-columns 0.4s cubic-bezier(0.22, 1, 0.36, 1),
			margin 0.4s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.contact-label > span {
		overflow: hidden;
		white-space: nowrap;
	}
	.contact-pill:focus-visible {
		border-color: var(--accent-solid);
		background: var(--accent-solid);
		color: var(--on-accent);
	}
	.contact-pill:hover .contact-label,
	.contact-pill:focus-visible .contact-label {
		grid-template-columns: 1fr;
		margin-left: 0.6rem;
		margin-right: 0.2rem;
	}
	/* touch screens have no hover — show the values outright */
	@media (hover: none) {
		.contact-label {
			grid-template-columns: 1fr;
			margin-left: 0.6rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.contact-label {
			transition: none;
		}
	}

	.wordmark {
		margin: -0.26em 0 -0.22em;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: clamp(5rem, 22vw, 17rem);
		line-height: 0.9;
		letter-spacing: -0.05em;
		text-align: center;
		white-space: nowrap;
		user-select: none;
		color: color-mix(in oklch, var(--fg) 6%, transparent);
		mask-image: linear-gradient(to bottom, #000 25%, transparent 92%);
		pointer-events: none;
	}
</style>
