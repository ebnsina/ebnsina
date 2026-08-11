<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { progress } from '$lib/progress.svelte';
	import { t } from '$lib/data/notes-strings';

	let { total }: { total: number } = $props();

	// Rank names are stored in English in the progress store; localize for display.
	const rankName = $derived(t.ranks[progress.rank.name] ?? progress.rank.name);
	const nextRankName = $derived(
		progress.rank.next ? (t.ranks[progress.rank.next.name] ?? progress.rank.next.name) : ''
	);
	const curious = t.ranks['Curious'];

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
			importError = t.importError;
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

<!-- Progress reduced to one line of text. This was a bordered panel with a level
	 medallion, rank, XP, percentage and a rank-progress bar — a dashboard sitting
	 between the reader and the notes. The numbers are all still here, stated once
	 and quietly. -->
<section class="mb-14 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
	<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
		<p class="font-mono text-[0.72rem] text-muted">
			<span class="text-fg">{progress.ready ? progress.count : 0}/{total}</span>
			{t.chaptersWord}
			<span class="mx-1 opacity-40">·</span>
			{progress.ready ? rankName : curious}
			<span class="mx-1 opacity-40">·</span>
			{progress.ready ? progress.xp : 0}
			{t.xp}
		</p>

		<div class="flex items-center gap-3">
			<div class="relative" bind:this={menuEl}>
				<button
					type="button"
					onclick={() => (menuOpen = !menuOpen)}
					aria-label={t.manageProgress}
					aria-expanded={menuOpen}
					class="grid size-7 place-items-center text-muted transition-colors hover:text-fg"
				>
					<Icon name="settings" size={16} />
				</button>

				{#if menuOpen}
					<div
						class="absolute right-0 top-11 z-30 w-52 rounded-xl border border-[color-mix(in_oklch,var(--fg)_10%,transparent)] bg-bg p-1.5 shadow-xl"
					>
						<button type="button" onclick={download} class="menu-item">{t.exportProgress}</button>
						<button type="button" onclick={() => fileInput?.click()} class="menu-item"
							>{t.importProgress}</button
						>
						{#if importError}
							<p class="px-3 py-1 text-xs text-accent">{importError}</p>
						{/if}
						<div class="my-1 border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)]"></div>
						{#if confirmReset}
							<button type="button" onclick={doReset} class="menu-item text-accent"
								>{t.confirmReset}</button
							>
							<button type="button" onclick={() => (confirmReset = false)} class="menu-item"
								>{t.cancel}</button
							>
						{:else}
							<button
								type="button"
								onclick={() => (confirmReset = true)}
								class="menu-item text-muted">{t.resetProgress}</button
							>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if progress.ready && progress.rank.next}
		<p class="font-mono text-[0.72rem] text-muted">
			{t.xpToNext(progress.rank.toNext, nextRankName)}
		</p>
	{/if}

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
		border-radius: var(--radius-button);
		padding: 0.45rem 0.7rem;
		text-align: left;
		font-size: 0.85rem;
		transition: background-color 0.12s;
	}
	.menu-item:hover {
		background: color-mix(in oklch, var(--fg) 6%, transparent);
	}
</style>
