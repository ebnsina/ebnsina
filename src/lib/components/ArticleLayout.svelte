<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, tick } from 'svelte';

	let {
		header,
		children,
		footer
	}: { header: Snippet; children: Snippet; footer?: Snippet } = $props();

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

			// 2. copy buttons on code blocks
			article!.querySelectorAll<HTMLPreElement>('pre').forEach((pre) => {
				if (pre.parentElement?.classList.contains('code-block-wrapper')) return;
				const wrap = document.createElement('div');
				wrap.className = 'code-block-wrapper';
				pre.parentNode!.insertBefore(wrap, pre);
				wrap.appendChild(pre);
				const btn = document.createElement('button');
				btn.className = 'copy-btn';
				btn.setAttribute('aria-label', 'Copy code');
				const copyIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
				const okIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
				btn.innerHTML = copyIcon;
				wrap.appendChild(btn);
				btn.addEventListener('click', async () => {
					await navigator.clipboard.writeText(pre.querySelector('code')?.innerText ?? pre.innerText);
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

<div
	class="mx-auto grid max-w-5xl items-start px-5 sm:px-8 gap-y-10 lg:grid-cols-[minmax(0,44rem)_13rem] lg:justify-between"
>
	<article bind:this={article} class="min-w-0">
		{@render header()}
		<div class="prose-editorial">
			{@render children()}
		</div>
		{#if footer}
			{@render footer()}
		{/if}
	</article>

	<aside
		id="toc-aside"
		class="sticky top-12 hidden max-h-[calc(100vh-3.5rem)] self-start overflow-y-auto pb-4 pr-1 pt-[4.5rem] lg:block"
	>
		{#if headings.length}
			<nav aria-label="Table of contents">
				<span
					class="mb-3 block font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted"
					>Contents</span
				>
				<ul
					class="space-y-0.5 pl-4"
					style="border-left: 1px solid color-mix(in oklch, var(--fg) 8%, transparent)"
				>
					{#each headings as h (h.id)}
						<li>
							<a
								href={`#${h.id}`}
								onclick={(e) => toToc(e, h.id)}
								class="toc-link block py-1 text-[14px] leading-[1.5] text-muted no-underline transition-colors hover:text-fg"
								class:toc-active={activeId === h.id}
								class:pl-3={h.depth === 3}
							>
								{h.text}
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}
	</aside>
</div>
