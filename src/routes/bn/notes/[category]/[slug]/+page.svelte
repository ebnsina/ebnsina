<script lang="ts">
	// Bangla chapter page — reuses the English article component; the bn loader
	// serves the translated body + metadata (falling back to English per-field).
	import ChapterPage from '../../../../notes/[category]/[slug]/+page.svelte';

	let { data } = $props();
</script>

<ChapterPage {data} />
