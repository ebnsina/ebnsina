<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, tick } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Toc from '$lib/components/Toc.svelte';

	let {
		header,
		children,
		footer,
		lang
	}: { header: Snippet; children: Snippet; footer?: Snippet; lang?: string } = $props();

	// Reader mode: strips the page down to the article body — site header and
	// footer, the TOC, the article's meta chrome and its outro all step aside.
	// The choice sticks across articles (localStorage) since it's a reading
	// preference, not per-page state.
	const READER_KEY = 'reader-mode';
	let reader = $state(false);

	onMount(() => {
		reader = localStorage.getItem(READER_KEY) === '1';
		return () => document.documentElement.classList.remove('reader-mode');
	});

	$effect(() => {
		document.documentElement.classList.toggle('reader-mode', reader);
		localStorage.setItem(READER_KEY, reader ? '1' : '0');
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && reader) reader = false;
	}

	type Heading = { id: string; text: string; depth: number };
	let headings = $state<Heading[]>([]);
	let activeId = $state('');
	let article = $state<HTMLElement>();

	const slugify = (s: string) =>
		s
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '')
			.replace(/\s+/g, '-');

	onMount(() => {
		if (!article) return;
		let observer: IntersectionObserver | undefined;

		(async () => {
			await tick();

			// 1. assign ids + collect TOC
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, non-reactive
			const used = new Set<string>();
			const hs = Array.from(article!.querySelectorAll<HTMLElement>('h2, h3'));
			headings = hs.map((h) => {
				let id = h.id || slugify(h.textContent ?? '');
				while (used.has(id)) id += '-x';
				used.add(id);
				h.id = id;
				h.style.scrollMarginTop = '5rem';
				return { id, text: h.textContent ?? '', depth: h.tagName === 'H3' ? 3 : 2 };
			});

			// 2. code blocks: fold control + copy button.
			//    Each <pre> is moved into a <details open> so a reader can collapse a
			//    block they've read past. Open by default — nothing is hidden; the
			//    control is just there. The language comes from the `language-*`
			//    class Shiki puts on the <code>.
			article!.querySelectorAll<HTMLPreElement>('pre').forEach((pre) => {
				if (pre.parentElement?.classList.contains('code-block-wrapper')) return;

				const details = document.createElement('details');
				details.className = 'code-details';
				details.open = true;
				const summary = document.createElement('summary');
				summary.className = 'code-summary';
				const code = pre.querySelector('code');
				// set by the Shiki highlighter in vite.config.ts
				const lang = pre.dataset.lang || 'code';
				const lines = (code?.textContent ?? '').replace(/\n$/, '').split('\n').length;
				summary.textContent = `${lang} · ${lines} ${lines === 1 ? 'line' : 'lines'}`;
				details.appendChild(summary);
				pre.parentNode!.insertBefore(details, pre);

				const wrap = document.createElement('div');
				wrap.className = 'code-block-wrapper';
				details.appendChild(wrap);
				wrap.appendChild(pre);
				const btn = document.createElement('button');
				btn.className = 'copy-btn';
				btn.setAttribute('aria-label', 'Copy code');
				const copyIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
				const okIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
				btn.innerHTML = copyIcon;
				wrap.appendChild(btn);
				btn.addEventListener('click', async () => {
					await navigator.clipboard.writeText(
						pre.querySelector('code')?.innerText ?? pre.innerText
					);
					btn.innerHTML = okIcon;
					btn.classList.add('copied');
					setTimeout(() => {
						btn.innerHTML = copyIcon;
						btn.classList.remove('copied');
					}, 2000);
				});
			});

			// 3. scroll spy
			observer = new IntersectionObserver(
				(entries) => {
					for (const e of entries) if (e.isIntersecting) activeId = e.target.id;
				},
				{ rootMargin: '0px 0px -65% 0px', threshold: 0 }
			);
			hs.forEach((h) => observer!.observe(h));
		})();

		return () => observer?.disconnect();
	});

	function toToc(e: MouseEvent, id: string) {
		const el = document.getElementById(id);
		if (!el) return;
		e.preventDefault();
		el.scrollIntoView({ behavior: 'smooth' });
		history.replaceState(null, '', location.pathname + location.search);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Full site container (matches header/footer), so the article lines up with
     the rest of the page. The TOC is pinned to the viewport edge rather than
     holding a column, so nothing here depends on whether it's showing. Focus
     mode is the narrow-measure option. -->
<div {lang} class="mx-auto px-5 sm:px-8 {reader ? 'max-w-[44rem]' : 'max-w-5xl'}">
	<article bind:this={article} class="min-w-0">
		{@render header()}
		<div class="prose-editorial">
			{@render children()}
		</div>
		{#if footer && !reader}
			{@render footer()}
		{/if}
	</article>

	{#if !reader}
		<!-- xl, not lg: the rail is pinned to the viewport edge now, and below
		     1280px there isn't margin enough to keep it off the text. -->
		<aside id="toc-aside" class="hidden xl:block">
			{#if headings.length}
				<Toc {headings} {activeId} onnavigate={toToc} />
			{/if}
		</aside>
	{/if}
</div>

<button
	type="button"
	class="reader-toggle"
	aria-pressed={reader}
	title={reader ? 'Exit focus mode (Esc)' : 'Focus mode — hide everything but the article'}
	onclick={() => (reader = !reader)}
>
	<!-- separate instances: the icon wrapper doesn't re-render on a changed glyph prop -->
	{#if reader}
		<Icon name="close" size={14} strokeWidth={2} />
	{:else}
		<Icon name="book" size={14} strokeWidth={2} />
	{/if}
	<span>{reader ? 'Exit focus' : 'Focus'}</span>
</button>

<style>
	.reader-toggle {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		z-index: 45;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.75rem;
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: color-mix(in oklch, var(--bg) 88%, transparent);
		backdrop-filter: blur(10px);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--muted);
		transition:
			color 0.15s,
			border-color 0.15s;
	}
	.reader-toggle:hover {
		color: var(--fg);
		border-color: color-mix(in oklch, var(--fg) 25%, transparent);
	}
	@media print {
		.reader-toggle {
			display: none;
		}
	}
</style>
