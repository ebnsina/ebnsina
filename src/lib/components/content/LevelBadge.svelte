<script lang="ts">
	let { level, label }: { level: string; label?: string } = $props();

	const color = $derived(
		(
			{
				beginner: 'var(--success)',
				intermediate: 'var(--info)',
				advanced: 'var(--warning)',
				mastery: 'var(--secondary)'
			} as Record<string, string>
		)[level] ?? 'var(--muted)'
	);
</script>

<span
	class="level-badge inline-flex items-center rounded-lg px-2.5 py-1 eyebrow"
	style="color: {color}; background: color-mix(in oklab, {color} 14%, transparent);"
>
	{label ?? level}
</span>
