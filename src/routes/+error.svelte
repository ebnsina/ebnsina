<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { page } from '$app/state';
</script>

<Seo title={page.status === 404 ? 'Not found' : 'Error'} noindex />

<div class="mx-auto max-w-3xl px-5 py-24 sm:px-8 text-center">
	<p class="mb-4 font-mono text-sm text-muted">{page.status}</p>
	<h1 class="mb-4 title-page">
		{page.status === 404 ? 'Not here.' : 'Something broke.'}
	</h1>
	<p class="mb-8 text-muted">
		{page.status === 404
			? "That page doesn't exist, or it moved."
			: (page.error?.message ?? 'An unexpected error occurred.')}
	</p>
	<a href="/" class="btn btn-solid">Back home</a>
</div>
