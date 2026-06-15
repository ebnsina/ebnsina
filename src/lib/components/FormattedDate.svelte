<script lang="ts">
	let { date }: { date: Date | string } = $props();
	const d = $derived(typeof date === 'string' ? new Date(date) : date);
</script>

<time datetime={d.toISOString()}>
	{d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
</time>
