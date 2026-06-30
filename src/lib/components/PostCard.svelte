<script lang="ts">
	import { catFor } from '$lib/colors';
	import { vtName } from '$lib/actions';

	let {
		href,
		title,
		description,
		slug
	}: {
		href: string;
		title: string;
		description: string;
		slug?: string;
	} = $props();
</script>

<a
	{href}
	class="glass-card group flex h-full min-h-[7rem] flex-col justify-center p-5"
	style="--cc: {catFor(title)}"
>
	<h3
		class="truncate font-serif text-lg font-semibold tracking-tight transition-colors group-hover:text-accent"
		style={slug ? `view-transition-name: ${vtName('post-title', slug)}` : undefined}
	>
		{title}
	</h3>
	<p class="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{description}</p>
</a>
