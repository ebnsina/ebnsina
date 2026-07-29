<script lang="ts">
	import { auroraFor } from '$lib/colors';
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
	<div class="media-card__cover aurora-surface" style={auroraFor(title)}></div>
	<div class="media-card__body">
		<h3
			class="line-clamp-2 font-serif text-base font-semibold leading-snug tracking-tight transition-colors group-hover:text-accent"
			style={slug ? `view-transition-name: ${vtName('post-title', slug)}` : undefined}
		>
			{title}
		</h3>
		<p class="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{description}</p>
	</div>
</a>
