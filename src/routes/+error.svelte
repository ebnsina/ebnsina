<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { page } from '$app/state';
</script>

<Seo title={page.status === 404 ? 'Not found' : 'Error'} noindex />

<div class="mx-auto max-w-3xl px-5 py-24 sm:px-8 text-center">
	<p class="mb-4 font-mono text-sm text-muted">{page.status}</p>
	<h1 class="mb-4 font-serif text-4xl font-semibold tracking-tight">
		{page.status === 404 ? 'Not here.' : 'Something broke.'}
	</h1>
	<p class="mb-8 text-muted">
		{page.status === 404
			? "That page doesn't exist — or it moved."
			: (page.error?.message ?? 'An unexpected error occurred.')}
	</p>
	<a
		href="/"
		class="rounded-2xl bg-accent-solid px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[color-mix(in_oklch,var(--accent-solid)_82%,black)]"
		>Back home</a
	>
</div>
