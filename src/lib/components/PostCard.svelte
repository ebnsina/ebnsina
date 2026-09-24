<script lang="ts">
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

<a {href} class="media-card group h-full">
	<div class="flex flex-1 flex-col">
		<h3
			class="line-clamp-2 font-display text-base font-semibold leading-normal tracking-tight transition-colors group-hover:text-accent"
			style={slug ? `view-transition-name: ${vtName('post-title', slug)}` : undefined}
		>
			{title}
		</h3>
		<p class="mt-2.5 line-clamp-2 text-[0.95rem] leading-relaxed text-muted">{description}</p>
	</div>
</a>
