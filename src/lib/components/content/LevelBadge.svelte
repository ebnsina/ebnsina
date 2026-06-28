<script lang="ts">
	let { level }: { level: string } = $props();

	const color = $derived(
		(
			{
				beginner: 'oklch(0.6 0.11 145)',
				intermediate: 'oklch(0.6 0.11 70)',
				advanced: 'oklch(0.6 0.11 30)',
				mastery: 'oklch(0.6 0.11 295)'
			} as Record<string, string>
		)[level] ?? 'var(--muted)'
	);
</script>

<span
	class="inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest"
	style="color: {color}; background: color-mix(in oklch, {color} 14%, transparent);"
>
	{level}
</span>
