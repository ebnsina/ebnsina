<script lang="ts">
	import LevelBadge from '$lib/components/content/LevelBadge.svelte';
	import { colorFor } from '$lib/colors';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.meta.label} — Notes — Ebn Sina</title>
	<meta name="description" content={data.meta.description} />
</svelte:head>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<header class="mb-10">
		<a
			href="/notes"
			class="text-[10px] font-semibold uppercase tracking-widest text-muted transition-colors hover:text-fg"
			>← Notes</a
		>
		<h1 class="mb-3 mt-3 font-serif text-5xl font-semibold tracking-tight">{data.meta.label}</h1>
		<p class="text-lg text-muted">{data.meta.description}</p>
	</header>

	<ol class="space-y-2">
		{#each data.chapters as ch (ch.slug)}
			<li>
				<a
					href={`/notes/${data.category}/${ch.slug}`}
					class="glass-card group flex items-center gap-4 px-4 py-3.5"
					style="--cc: {colorFor(ch.slug)}"
				>
					<span class="w-6 flex-shrink-0 font-mono text-xs tabular-nums text-muted">
						{String(ch.meta.chapter).padStart(2, '0')}
					</span>
					<span class="min-w-0 flex-1">
						<span class="font-semibold transition-colors group-hover:text-accent"
							>{ch.meta.title}</span
						>
						<span class="mt-0.5 block truncate text-sm text-muted">{ch.meta.subtitle}</span>
					</span>
					<span class="hidden flex-shrink-0 sm:block"><LevelBadge level={ch.meta.level} /></span>
					<span
						class="hidden flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted sm:block"
						>{ch.meta.readingTime}</span
					>
					<span
						class="flex-shrink-0 -translate-x-1 text-sm text-muted opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100"
						>→</span
					>
				</a>
			</li>
		{/each}
	</ol>
</div>
