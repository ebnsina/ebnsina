<script lang="ts">
	import PageBanner from '$lib/components/PageBanner.svelte';
	import { reveal } from '$lib/actions';

	const groups = [
		{
			name: 'Editor & Terminal',
			items: [
				['Neovim', 'Daily driver. LazyVim base, custom keymaps.'],
				['Ghostty', 'Fast, GPU-accelerated terminal.'],
				['Zsh + Starship', 'Prompt that stays out of the way.'],
				['tmux', 'For session persistence over SSH.']
			]
		},
		{
			name: 'Languages I reach for',
			items: [
				['TypeScript', 'Most product work.'],
				['Go', 'Backends and CLIs that need to be boring.'],
				['Rust', 'When correctness and speed both matter.'],
				['Python', 'Scripts, glue, data.']
			]
		},
		{
			name: 'Hardware',
			items: [
				['MacBook Pro 14"', 'M-series. Local dev.'],
				['HHKB Pro Hybrid', 'Topre, 45g.'],
				['LG UltraFine 32"', 'External 4K.']
			]
		},
		{
			name: 'Services I pay for',
			items: [
				['Fly.io', 'Cheap, fast, global app hosting.'],
				['Cloudflare', 'DNS, R2, Workers.'],
				['1Password', 'Secrets everywhere.'],
				['GitHub', 'Code, CI, the works.']
			]
		}
	];
</script>

<svelte:head>
	<title>Uses — Ebn Sina</title>
	<meta name="description" content="Hardware, software, and services I actually use." />
</svelte:head>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow="Uses"
		title="What I use"
		description="Hardware, software, and services that have earned their place."
		shape="keyboard"
	/>

<div class="max-w-[44rem] space-y-12">
	{#each groups as g (g.name)}
		<section use:reveal>
			<h2 class="mb-4 font-serif text-2xl font-semibold tracking-tight">{g.name}</h2>
			<dl class="divide-y divide-rule border-y border-rule">
				{#each g.items as [name, desc] (name)}
					<div class="grid grid-cols-[10rem_1fr] gap-4 py-3">
						<dt class="font-medium">{name}</dt>
						<dd class="text-muted">{desc}</dd>
					</div>
				{/each}
			</dl>
		</section>
	{/each}
</div>
</div>
