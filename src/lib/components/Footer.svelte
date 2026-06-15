<script lang="ts">
	import { SITE } from '$lib/config';
	const year = new Date().getFullYear();
</script>

<footer class="mt-24" style="border-top: 1px solid color-mix(in oklch, var(--fg) 6%, transparent)">
	<div
		class="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-10"
	>
		<p>© {year} {SITE.name}. Built with SvelteKit &amp; Threlte.</p>
		<div class="flex gap-4">
			<a href={SITE.social.github} class="hover:text-fg" target="_blank" rel="noopener">GitHub</a>
			<a href={SITE.social.twitter} class="hover:text-fg" target="_blank" rel="noopener">Twitter</a>
			<a href={SITE.social.linkedin} class="hover:text-fg" target="_blank" rel="noopener">LinkedIn</a>
			<a href="/rss.xml" class="hover:text-fg">RSS</a>
		</div>
	</div>
</footer>
