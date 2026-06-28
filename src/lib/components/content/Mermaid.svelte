<script lang="ts">
	import { onMount } from 'svelte';

	let { title, code }: { title?: string; code: string } = $props();

	let svg = $state('');
	let failed = $state(false);
	let seq = 0;

	// Neutral palette per theme (mermaid's khroma can't parse the oklch neutral
	// tokens, so mirror them as hex). The ACCENT is read live from the --accent
	// CSS var (the single source of truth) so diagrams reskin with the rest of
	// the site; the node fill is derived from it.
	const PALETTE = {
		light: { bg: '#fbfaf9', fg: '#2e2925', muted: '#7a716c', rule: '#e7e2dd' },
		dark: { bg: '#211e1d', fg: '#ece9e6', muted: '#a79c98', rule: '#423c3a' }
	};

	const clampHex = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
	function hexMix(a: string, b: string, t: number): string {
		const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
		const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
		return (
			'#' +
			pa
				.map((v, i) =>
					clampHex(v + (pb[i] - v) * t)
						.toString(16)
						.padStart(2, '0')
				)
				.join('')
		);
	}

	// On phones, horizontal (LR/RL) graphs blow past the viewport and either scroll
	// or shrink the text to mush. Reflow them top-down so they stack into the column
	// width and stay readable. Wide chains still scroll as a fallback.
	function sourceFor(narrow: boolean): string {
		const src = code.trim();
		if (!narrow) return src;
		return src.replace(/^(\s*(?:flowchart|graph))[ \t]+(?:LR|RL)\b/i, '$1 TD');
	}

	async function render() {
		if (!code) return;
		const isDark = document.documentElement.classList.contains('dark');
		const narrow = window.matchMedia('(max-width: 639px)').matches;
		const base = isDark ? PALETTE.dark : PALETTE.light;
		// brand accent from the single source; node fill derived from it
		const css = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
		const accent = /^#[0-9a-f]{6}$/i.test(css) ? css : isDark ? '#7e9443' : '#5a6c23';
		const p = { ...base, accent, node: hexMix(base.bg, accent, isDark ? 0.22 : 0.12) };
		const { default: mermaid } = await import('mermaid');
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: 'base',
			fontFamily: "'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace",
			themeVariables: {
				darkMode: isDark,
				background: 'transparent',
				fontSize: narrow ? '15px' : '14px',
				primaryColor: p.node,
				primaryBorderColor: p.accent,
				primaryTextColor: p.fg,
				secondaryColor: p.node,
				secondaryBorderColor: p.rule,
				secondaryTextColor: p.fg,
				tertiaryColor: 'transparent',
				tertiaryBorderColor: p.rule,
				tertiaryTextColor: p.fg,
				lineColor: p.muted,
				textColor: p.fg,
				mainBkg: p.node,
				nodeBorder: p.accent,
				clusterBkg: 'transparent',
				clusterBorder: p.rule,
				edgeLabelBackground: p.bg,
				labelBoxBkgColor: p.node,
				labelBoxBorderColor: p.accent,
				actorBkg: p.node,
				actorBorder: p.accent,
				actorTextColor: p.fg,
				signalColor: p.muted,
				signalTextColor: p.fg,
				noteBkgColor: p.node,
				noteBorderColor: p.accent,
				noteTextColor: p.fg
			}
		});
		try {
			const id = `mermaid-${seq++}`;
			const out = await mermaid.render(id, sourceFor(narrow));
			svg = out.svg;
			failed = false;
		} catch {
			failed = true;
		}
	}

	onMount(() => {
		render();
		// Re-render on theme toggle and when crossing the phone breakpoint.
		const observer = new MutationObserver(render);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});
		const mq = window.matchMedia('(max-width: 639px)');
		mq.addEventListener('change', render);
		return () => {
			observer.disconnect();
			mq.removeEventListener('change', render);
		};
	});
</script>

<figure class="diagram-figure">
	{#if title}
		<figcaption class="diagram-label">
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
				<line x1="3" y1="9" x2="21" y2="9" />
				<line x1="9" y1="21" x2="9" y2="9" />
			</svg>
			{title}
		</figcaption>
	{/if}
	<div class="diagram">
		<div class="diagram-body">
			{#if failed}
				<pre class="mermaid-fallback">{code}</pre>
			{:else if svg}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html svg}
			{:else}
				<div class="mermaid-placeholder" aria-hidden="true"></div>
			{/if}
		</div>
	</div>
</figure>

<style>
	.diagram-figure {
		margin: 1.5rem 0;
	}
	.diagram {
		border: 1px solid color-mix(in oklch, var(--fg) 8%, transparent);
		border-radius: 0.85rem;
		padding: 1.25rem;
		overflow-x: auto;
		background: color-mix(in oklch, var(--fg) 2.5%, transparent);
	}
	@media (max-width: 639px) {
		.diagram {
			padding: 0.85rem;
			border-radius: 0.7rem;
		}
	}
	/* title now sits ABOVE the card, not inside it */
	.diagram-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		margin-bottom: 0.6rem;
		padding-left: 0.15rem;
	}
	.diagram-body {
		display: flex;
		justify-content: center;
	}
	.diagram-body :global(svg) {
		max-width: 100%;
		height: auto;
	}
	/* round the flowchart node rectangles a touch */
	.diagram-body :global(.node rect),
	.diagram-body :global(.node polygon),
	.diagram-body :global(.cluster rect) {
		rx: 8px;
		ry: 8px;
	}
	.mermaid-placeholder {
		min-height: 120px;
		width: 100%;
	}
	.mermaid-fallback {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--muted);
		white-space: pre-wrap;
		margin: 0;
	}
</style>
