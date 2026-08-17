<script lang="ts">
	/**
	 * The critic's output. Always shows the fix, never a bare score — a tool that
	 * says "62/100" without saying what to type instead is just a nicer way of
	 * telling someone they failed.
	 */
	import type { Finding } from '$lib/toolkit/types';

	let { findings, compact = false }: { findings: Finding[]; compact?: boolean } = $props();

	const LABEL: Record<Finding['severity'], string> = {
		blocker: 'ঠিক করতেই হবে',
		warning: 'দুর্বল',
		nudge: 'ভেবে দেখো'
	};
</script>

{#if findings.length}
	<ul class="findings" class:is-compact={compact}>
		{#each findings as f, i (f.field + i)}
			<li class="finding" data-severity={f.severity}>
				<span class="tag">{LABEL[f.severity]}</span>
				<div class="body">
					<p class="msg">{f.message}</p>
					<p class="fix">{f.fix}</p>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.findings {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.finding {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.6rem;
		align-items: start;
		padding: 0.55rem 0.7rem;
		border-radius: var(--radius-button);
		background: color-mix(in oklch, var(--cl) 8%, var(--bg));
		--cl: var(--accent);
	}

	.finding[data-severity='blocker'] {
		--cl: #d94a4a;
	}
	.finding[data-severity='warning'] {
		--cl: #c98a1b;
	}

	:global(.dark) .finding[data-severity='blocker'] {
		--cl: #ff8b8b;
	}
	:global(.dark) .finding[data-severity='warning'] {
		--cl: #e3b662;
	}

	.tag {
		flex: none;
		margin-top: 0.1rem;
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--cl);
		white-space: nowrap;
	}

	.body {
		min-width: 0;
	}

	.msg {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--fg);
	}

	.fix {
		margin: 0.15rem 0 0;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--muted);
	}

	.is-compact .finding {
		padding: 0.4rem 0.55rem;
	}
</style>
