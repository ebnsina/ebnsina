<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { page } from '$app/state';
</script>

<Seo title={page.status === 404 ? 'Not found' : 'Error'} noindex />

<div class="page py-24">
	<p class="mb-4 eyebrow">{page.status}</p>
	<h1 class="mb-4 title-page">
		{page.status === 404 ? 'Not here.' : 'Something broke.'}
	</h1>
	<p class="mb-8 text-muted">
		{page.status === 404
			? "That page doesn't exist, or it moved."
			: 'Something went wrong on our side. Try again in a moment, or head back home.'}
	</p>
	<a href="/" class="btn btn-solid">Back home</a>
</div>
