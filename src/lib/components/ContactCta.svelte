<script lang="ts">
	import { SITE } from '$lib/config';
</script>

<section
	class="mb-4 mt-20 overflow-hidden rounded-3xl border border-[color-mix(in_oklch,var(--fg)_8%,transparent)] bg-[color-mix(in_oklch,var(--accent)_8%,var(--bg))] px-7 py-12 sm:px-12 sm:py-16"
>
	<p class="mb-4 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">Get in touch</p>
	<h2 class="max-w-2xl font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
		Building something interesting? <span class="text-accent">Let's talk.</span>
	</h2>
	<p class="mt-4 max-w-xl text-base leading-[1.65] text-muted sm:text-lg">
		Whether it's a hard distributed-systems problem, a platform that needs to scale, or just a
		second opinion — I'm generally up for it.
	</p>
	<div class="mt-7 flex flex-wrap items-center gap-3">
		<a
			href={`mailto:${SITE.email}`}
			class="rounded-2xl bg-fg px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-accent"
			>Email me</a
		>
		<a
			href={SITE.social.github}
			target="_blank"
			rel="noopener"
			class="rounded-2xl border border-[color-mix(in_oklch,var(--fg)_14%,transparent)] px-5 py-2.5 text-sm font-medium transition-colors hover:text-accent"
			>GitHub</a
		>
		<a
			href={SITE.social.twitter}
			target="_blank"
			rel="noopener"
			class="rounded-2xl border border-[color-mix(in_oklch,var(--fg)_14%,transparent)] px-5 py-2.5 text-sm font-medium transition-colors hover:text-accent"
			>Twitter</a
		>
		<a
			href={SITE.social.linkedin}
			target="_blank"
			rel="noopener"
			class="rounded-2xl border border-[color-mix(in_oklch,var(--fg)_14%,transparent)] px-5 py-2.5 text-sm font-medium transition-colors hover:text-accent"
			>LinkedIn</a
		>
	</div>
</section>
