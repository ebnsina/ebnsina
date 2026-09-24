<script lang="ts">
	/**
	 * One labelled field with its platform limit and its critique attached.
	 *
	 * The counter is the quiet half of the tool: knowing that Upwork truncates an
	 * overview at ~250 characters in search results changes what you write far
	 * more than any advice about writing does.
	 */
	import { lengthState, limitFor } from '$lib/toolkit/limits';
	import { critique } from '$lib/toolkit/critic';
	import type { Finding } from '$lib/toolkit/types';
	import Findings from './Findings.svelte';

	let {
		label,
		value = $bindable(''),
		placeholder = '',
		hint = '',
		rows = 0,
		platform,
		limitKey,
		jobPost,
		minWords,
		requireNumber = false,
		findings: extra = [],
		oninput
	}: {
		label: string;
		value?: string;
		placeholder?: string;
		hint?: string;
		/** 0 renders an input, anything else a textarea of that height. */
		rows?: number;
		platform?: string;
		limitKey?: string;
		jobPost?: string;
		minWords?: number;
		requireNumber?: boolean;
		findings?: Finding[];
		/** Forwarded to the control. Use this to push a value somewhere else on
		 *  edit — writing to the store from an effect that also reads it is what
		 *  causes `effect_update_depth_exceeded`. */
		oninput?: (e: Event) => void;
	} = $props();

	const limit = $derived(platform && limitKey ? limitFor(platform, limitKey) : undefined);
	const state = $derived(lengthState(value.length, limit));
	const own = $derived(
		critique({ field: label, text: value, platform, limitKey, jobPost, minWords, requireNumber })
	);
	const all = $derived([...own, ...extra]);
</script>

<div class="field">
	<div class="head">
		<label class="label" for={`f-${label}`}>{label}</label>
		{#if limit}
			<span class="counter" data-state={state}>
				{value.length}<span class="sep">/</span>{limit.practical ?? limit.max}
			</span>
		{/if}
	</div>

	{#if rows}
		<textarea id={`f-${label}`} bind:value {placeholder} {rows} class="control" data-state={state}
		></textarea>
	{:else}
		<input
			id={`f-${label}`}
			bind:value
			{placeholder}
			{oninput}
			class="control"
			data-state={state}
		/>
	{/if}

	{#if hint}
		<p class="hint">{hint}</p>
	{:else if limit?.note}
		<p class="hint">{limit.note}</p>
	{/if}

	<Findings findings={all} />
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--fg);
	}

	.counter {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}

	.counter[data-state='over-practical'] {
		color: #c98a1b;
	}
	.counter[data-state='over-max'] {
		color: #d94a4a;
	}

	.sep {
		opacity: 0.5;
		padding: 0 0.1em;
	}

	.control {
		width: 100%;
		padding: 0.55rem 0.7rem;
		border: 1px solid transparent;
		border-radius: var(--radius-button);
		background: color-mix(in oklch, var(--fg) 2%, var(--bg));
		color: var(--fg);
		font: inherit;
		font-size: 0.9375rem;
		line-height: 1.55;
		resize: vertical;
		transition: border-color 0.15s ease;
	}

	.control::placeholder {
		color: color-mix(in oklch, var(--fg) 35%, transparent);
	}

	.control:focus {
		outline: none;
		border-color: var(--accent);
	}

	.control[data-state='over-max'] {
		border-color: #d94a4a;
	}

	.hint {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.control {
			transition: none;
		}
	}
</style>
