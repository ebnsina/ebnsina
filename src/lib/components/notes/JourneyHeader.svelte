<script lang="ts">
	import { onMount } from 'svelte';
	import { Settings } from '@lucide/svelte';
	import { progress } from '$lib/progress.svelte';

	let { total }: { total: number } = $props();

	let fileInput = $state<HTMLInputElement>();
	let menuEl = $state<HTMLElement>();
	let menuOpen = $state(false);
	let confirmReset = $state(false);
	let importError = $state('');

	onMount(() => progress.hydrate());

	function closeMenu() {
		menuOpen = false;
		confirmReset = false;
	}

	function onWindowClick(e: MouseEvent) {
		if (menuOpen && menuEl && !menuEl.contains(e.target as Node)) closeMenu();
	}

	function onWindowKey(e: KeyboardEvent) {
		if (menuOpen && e.key === 'Escape') closeMenu();
	}

	const pct = $derived(total ? Math.round((progress.count / total) * 100) : 0);

	function download() {
		const blob = new Blob([progress.export()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'notes-progress.json';
		a.click();
		URL.revokeObjectURL(url);
	}

	async function onImport(e: Event) {
		importError = '';
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			progress.import(await file.text());
		} catch {
			importError = 'Could not read that file.';
		}
		if (fileInput) fileInput.value = '';
	}

	function doReset() {
		progress.reset();
		confirmReset = false;
		menuOpen = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<section
	class="mb-8 rounded-2xl border border-[color-mix(in_oklch,var(--fg)_8%,transparent)] bg-[color-mix(in_oklch,var(--fg)_3%,var(--bg))] p-5 sm:p-6"
>
	<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
		<div class="flex items-center gap-4">
			<div
				class="grid size-14 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklch,var(--fg)_6%,var(--bg))] font-pixel text-sm text-accent"
				aria-hidden="true"
			>
				L{progress.ready ? progress.rank.level : 1}
			</div>
			<div>
				<p class="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted">Your journey</p>
				<p class="font-pixel text-xl tracking-tight">
					{progress.ready ? progress.rank.name : 'Curious'}
				</p>
				<p class="mt-1 font-pixel text-sm text-muted">
					<span class="text-fg">{progress.ready ? progress.xp : 0} XP</span>
					· {progress.ready ? progress.count : 0}/{total} chapters · {progress.ready ? pct : 0}%
				</p>
			</div>
		</div>

		<div class="flex items-center gap-3">
			<div class="hidden w-40 sm:block">
				<div class="mb-1 flex justify-between font-pixel text-[0.6rem] text-muted">
					<span>{progress.ready ? progress.rank.name : 'Curious'}</span>
					<span>{progress.ready && progress.rank.next ? progress.rank.next.name : 'Max'}</span>
				</div>
				<div
					class="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--fg)_10%,transparent)]"
				>
					<div
						class="h-full rounded-full bg-accent transition-[width] duration-500"
						style="width: {progress.ready ? progress.rank.pct : 0}%"
					></div>
				</div>
				{#if progress.ready && progress.rank.next}
					<p class="mt-1 text-right font-pixel text-[0.6rem] text-muted">
						{progress.rank.toNext} XP to {progress.rank.next.name}
					</p>
				{/if}
			</div>

			<div class="relative" bind:this={menuEl}>
				<button
					type="button"
					onclick={() => (menuOpen = !menuOpen)}
					aria-label="Manage progress"
					aria-expanded={menuOpen}
					class="grid size-9 place-items-center rounded-full border border-[color-mix(in_oklch,var(--fg)_12%,transparent)] text-muted transition-colors hover:text-fg"
				>
					<Settings size={16} />
				</button>

				{#if menuOpen}
					<div
						class="absolute right-0 top-11 z-30 w-52 rounded-xl border border-[color-mix(in_oklch,var(--fg)_10%,transparent)] bg-bg p-1.5 shadow-xl"
					>
						<button type="button" onclick={download} class="menu-item">Export progress</button>
						<button type="button" onclick={() => fileInput?.click()} class="menu-item"
							>Import progress</button
						>
						{#if importError}
							<p class="px-3 py-1 text-xs text-accent">{importError}</p>
						{/if}
						<div class="my-1 border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)]"></div>
						{#if confirmReset}
							<button type="button" onclick={doReset} class="menu-item text-accent"
								>Confirm reset</button
							>
							<button type="button" onclick={() => (confirmReset = false)} class="menu-item"
								>Cancel</button
							>
						{:else}
							<button
								type="button"
								onclick={() => (confirmReset = true)}
								class="menu-item text-muted">Reset progress</button
							>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
	<input
		bind:this={fileInput}
		type="file"
		accept="application/json,.json"
		class="hidden"
		onchange={onImport}
	/>
</section>

<style>
	.menu-item {
		display: block;
		width: 100%;
		border-radius: 0.5rem;
		padding: 0.45rem 0.7rem;
		text-align: left;
		font-size: 0.85rem;
		transition: background-color 0.12s;
	}
	.menu-item:hover {
		background: color-mix(in oklch, var(--fg) 6%, transparent);
	}
</style>
