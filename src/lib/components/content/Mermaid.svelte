<script lang="ts">
	import { onMount } from 'svelte';

	let { title, code }: { title?: string; code: string } = $props();

	let svg = $state('');
	let failed = $state(false);
	let seq = 0;

	// Design-system palettes (cherry/burgundy accent, no glow). Mermaid's colour
	// maths (khroma) can't parse the oklch tokens in layout.css, so mirror them as
	// hex per theme.
	const PALETTE = {
		light: {
			bg: '#fbfaf9',
			fg: '#2e2925',
			muted: '#7a716c',
			rule: '#e7e2dd',
			accent: '#9c2a45',
			node: '#f6e3e1'
		},
		dark: {
			bg: '#211e1d',
			fg: '#ece9e6',
			muted: '#a79c98',
			rule: '#423c3a',
			accent: '#c44560',
			node: '#3b2128'
		}
	};

	async function render() {
		if (!code) return;
		const isDark = document.documentElement.classList.contains('dark');
		const p = isDark ? PALETTE.dark : PALETTE.light;
		const { default: mermaid } = await import('mermaid');
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: 'base',
			fontFamily: 'Epilogue, ui-sans-serif, system-ui, sans-serif',
			themeVariables: {
				darkMode: isDark,
				background: 'transparent',
				fontSize: '14px',
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
			const out = await mermaid.render(id, code.trim());
			svg = out.svg;
			failed = false;
		} catch {
			failed = true;
		}
	}

	onMount(() => {
		render();
		const observer = new MutationObserver(render);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});
		return () => observer.disconnect();
	});
</script>

<div class="diagram">
	{#if title}
		<div class="diagram-label">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
				<line x1="3" y1="9" x2="21" y2="9" />
				<line x1="9" y1="21" x2="9" y2="9" />
			</svg>
			{title}
		</div>
	{/if}
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

<style>
	.diagram {
		border: 1px solid color-mix(in oklch, var(--fg) 8%, transparent);
		border-radius: 0.75rem;
		padding: 1.25rem;
		margin: 1.5rem 0;
		overflow-x: auto;
		background: color-mix(in oklch, var(--fg) 2.5%, transparent);
	}
	.diagram-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		margin-bottom: 1.25rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--rule);
	}
	.diagram-body {
		display: flex;
		justify-content: center;
	}
	.diagram-body :global(svg) {
		max-width: 100%;
		height: auto;
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
