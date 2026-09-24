<script lang="ts">
	/**
	 * Global ⌘K search. Mounted once in the root layout, so it opens from any
	 * page without each route knowing about it.
	 *
	 * Nothing is loaded until the user shows intent: the index chunk is fetched
	 * on hover/focus of the trigger or the moment ⌘/Ctrl goes down, so by the
	 * time the panel paints the data is usually already there. Ranking runs
	 * synchronously on every keystroke — see `$lib/search` for why that is fine —
	 * and the highlighted result is preloaded, so Enter navigates instantly.
	 */
	import { goto, preloadData } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { loadRows, preload, search, kindLabel, type Hit } from '$lib/search';
	import { searchUI, openSearch, closeSearch } from '$lib/search-ui.svelte';

	type Rows = Awaited<ReturnType<typeof loadRows>>;

	const open = $derived(searchUI.open);
	let query = $state('');
	let rows = $state<Rows | null>(null);
	let selected = $state(0);
	let input = $state<HTMLInputElement>();
	let restore: HTMLElement | null = null;

	const results = $derived(rows && query.trim() ? search(query, rows) : []);

	function show() {
		if (open) return;
		restore = document.activeElement as HTMLElement | null;
		openSearch();
	}

	function hide() {
		closeSearch();
		restore?.focus?.();
		restore = null;
	}

	// Opening resets the query and pulls the index in (cached after the first
	// time, and usually already warmed by the trigger's hover/modifier preload).
	$effect(() => {
		if (!open) return;
		query = '';
		selected = 0;
		loadRows().then((r) => (rows = r));
	});

	function onWindowKey(e: KeyboardEvent) {
		// Warm the chunk on the modifier, before the "k" even lands.
		if (e.key === 'Meta' || e.key === 'Control') preload();

		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			open ? hide() : show();
			return;
		}
		// Bare "/" is the other muscle-memory shortcut, but only when the user is
		// not already typing somewhere.
		const el = e.target as HTMLElement | null;
		const typing = el?.isContentEditable || /^(input|textarea|select)$/i.test(el?.tagName ?? '');
		if (e.key === '/' && !open && !typing) {
			e.preventDefault();
			show();
		}
	}

	function onPanelKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			hide();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (results.length) selected = (selected + 1) % results.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (results.length) selected = (selected - 1 + results.length) % results.length;
		} else if (e.key === 'Enter') {
			const hit = results[selected];
			if (!hit) return;
			e.preventDefault();
			hide();
			goto(hit.url);
		}
	}

	// A new query invalidates the highlight position.
	$effect(() => {
		query;
		selected = 0;
	});

	$effect(() => {
		if (open) input?.focus();
	});

	// Preload the highlighted route so Enter is a paint, not a fetch.
	$effect(() => {
		const hit = results[selected];
		if (hit) preloadData(hit.url).catch(() => {});
	});

	// Freeze the page behind the panel.
	$effect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});

	/** Cut a string into plain and matched segments so every occurrence of every
	 *  query token can be marked — in the subtitle as much as the title, since a
	 *  row often matches on the subtitle alone and an unmarked hit reads as a
	 *  mystery ("why is this result here?").
	 *
	 *  Offsets come from `toLowerCase()` only, never `normalize()`: normalising
	 *  can change a string's length and would slide the marks off the words. */
	type Segment = { text: string; hit: boolean };

	function segments(text: string, q: string): Segment[] {
		const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
		if (!tokens.length || !text) return [{ text, hit: false }];

		const lower = text.toLowerCase();
		const ranges: Array<[number, number]> = [];
		for (const token of tokens) {
			for (let i = lower.indexOf(token); i >= 0; i = lower.indexOf(token, i + token.length)) {
				ranges.push([i, i + token.length]);
			}
		}
		if (!ranges.length) return [{ text, hit: false }];

		// Tokens can overlap ("cache" + "caching"); merge before slicing so a
		// character is never emitted twice.
		ranges.sort((a, b) => a[0] - b[0]);
		const merged: Array<[number, number]> = [ranges[0]];
		for (const [start, end] of ranges.slice(1)) {
			const last = merged[merged.length - 1];
			if (start <= last[1]) last[1] = Math.max(last[1], end);
			else merged.push([start, end]);
		}

		const out: Segment[] = [];
		let at = 0;
		for (const [start, end] of merged) {
			if (start > at) out.push({ text: text.slice(at, start), hit: false });
			out.push({ text: text.slice(start, end), hit: true });
			at = end;
		}
		if (at < text.length) out.push({ text: text.slice(at), hit: false });
		return out;
	}

	const go = (hit: Hit) => {
		hide();
		goto(hit.url);
	};
</script>

<svelte:window onkeydown={onWindowKey} />

{#if open}
	<!-- The backdrop is a real button so dismissing by click is reachable by
		 keyboard users too, rather than a click handler on a bare div. -->
	<div class="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] sm:pt-[15vh]">
		<button type="button" class="search-backdrop" aria-label="Close search" onclick={hide}></button>

		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Search this site"
			tabindex="-1"
			class="search-panel"
			onkeydown={onPanelKey}
		>
			<div class="flex items-center gap-3 px-4 py-3.5">
				<Icon name="search" size={17} class="shrink-0 text-muted" />
				<input
					bind:this={input}
					bind:value={query}
					type="text"
					role="combobox"
					aria-label="Search chapters, tracks, posts and projects"
					aria-expanded={results.length > 0}
					aria-controls="search-results"
					aria-autocomplete="list"
					aria-activedescendant={results.length ? `search-hit-${selected}` : undefined}
					placeholder="Search notes, writing, projects…"
					autocomplete="off"
					spellcheck="false"
					class="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
				/>
				<button type="button" onclick={hide} class="shrink-0 text-muted hover:text-fg">
					<Icon name="close" size={16} />
				</button>
			</div>

			{#if results.length}
				<div
					id="search-results"
					role="listbox"
					aria-label="Search results"
					class="max-h-[min(60vh,26rem)] overflow-y-auto border-t border-rule py-1.5"
				>
					{#each results as hit, i (hit.url)}
						<a
							id={`search-hit-${i}`}
							href={hit.url}
							role="option"
							aria-selected={i === selected}
							class="search-hit"
							class:is-active={i === selected}
							onmouseenter={() => (selected = i)}
							onclick={(e) => {
								e.preventDefault();
								go(hit);
							}}
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium">
									{#each segments(hit.title, query) as part, p (p)}{#if part.hit}<mark
												>{part.text}</mark
											>{:else}{part.text}{/if}{/each}
								</span>
								{#if hit.subtitle}
									<span class="mt-0.5 block truncate text-xs text-muted">
										{#each segments(hit.subtitle, query) as part, p (p)}{#if part.hit}<mark
													>{part.text}</mark
												>{:else}{part.text}{/if}{/each}
									</span>
								{/if}
							</span>
							<span class="shrink-0 text-right">
								<span class="block eyebrow">
									{kindLabel(hit.kind)}
								</span>
								{#if hit.context}
									<span class="mt-0.5 block max-w-[9rem] truncate text-[0.7rem] text-muted"
										>{hit.context}</span
									>
								{/if}
							</span>
						</a>
					{/each}
				</div>
			{:else if query.trim()}
				<p class="border-t border-rule px-4 py-8 text-center text-sm text-muted">
					No matches for “{query.trim()}”.
				</p>
			{:else}
				<p class="border-t border-rule px-4 py-8 text-center text-sm text-muted">
					Search every chapter, track, post and project by title, topic or heading.
				</p>
			{/if}

			<div
				class="flex items-center justify-between gap-3 border-t border-rule px-4 py-2 font-mono text-[0.62rem] text-muted"
			>
				<span><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>↵</kbd> open · <kbd>esc</kbd> close</span>
				{#if results.length}<span>{results.length} results</span>{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.search-panel kbd {
		border: 1px solid var(--rule);
		border-radius: 0.35rem;
		padding: 0.05rem 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		line-height: 1.4;
	}

	.search-backdrop {
		position: fixed;
		inset: 0;
		cursor: default;
		background: color-mix(in oklch, var(--fg) 28%, transparent);
		backdrop-filter: blur(2px);
	}

	.search-panel {
		position: relative;
		width: 100%;
		max-width: 34rem;
		overflow: hidden;
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		background: var(--bg);
		box-shadow: 0 24px 60px -20px color-mix(in oklch, var(--fg) 40%, transparent);
	}

	.search-hit {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin: 0 0.4rem;
		border-radius: var(--radius-button);
		padding: 0.55rem 0.7rem;
		text-decoration: none;
		color: inherit;
	}
	.search-hit.is-active {
		background: color-mix(in oklch, var(--fg) 6%, transparent);
	}
	/* The mark has to read on both the title (full ink) and the subtitle (muted)
	   without becoming a highlighter pen — a soft accent wash plus the accent's
	   own ink, so the matched word is the thing the eye lands on. */
	.search-hit mark {
		border-radius: 0.2rem;
		background: color-mix(in oklab, var(--accent) 16%, transparent);
		color: var(--accent);
		font-weight: 600;
	}
</style>
