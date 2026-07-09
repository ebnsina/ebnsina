<script lang="ts">
	// Bangla track page — reuses the English category component; data comes from
	// the bn loader below, which localizes labels and overlays translated content.
	import CategoryPage from '../../../notes/[category]/+page.svelte';

	let { data } = $props();
</script>

<CategoryPage {data} />
