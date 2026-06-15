<script lang="ts">
	import { colorFor } from '$lib/colors';

	let {
		href,
		title,
		description,
		index = 0
	}: {
		href: string;
		title: string;
		description: string;
		date?: Date | string;
		tags?: string[];
		index?: number;
	} = $props();
</script>

<a
	{href}
	class="glass-card group flex h-full min-h-[7rem] flex-col justify-center p-5"
	style="--cc: {colorFor(title)}"
>
	<h3 class="truncate font-serif text-lg font-semibold tracking-tight transition-colors group-hover:text-accent">
		{title}
	</h3>
	<p class="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{description}</p>
</a>
