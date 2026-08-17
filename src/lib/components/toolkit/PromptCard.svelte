<script lang="ts">
	/**
	 * The AI hand-off, in its no-backend form.
	 *
	 * The tool has already done the part a model is bad at — pulling the client's
	 * actual requirements out of the post, holding the reader's real evidence,
	 * enforcing the platform's limits. This packages that into a prompt the
	 * reader pastes into whatever assistant they already have. No key, no cost,
	 * no rate limit, and nothing leaves the browser until they choose to paste it.
	 *
	 * If a hosted version ever lands, it consumes the same `PromptSpec` and this
	 * component grows a second button.
	 */
	import { approxTokens, render } from '$lib/toolkit/spec';
	import type { PromptSpec } from '$lib/toolkit/types';
	import Icon from '$lib/components/Icon.svelte';

	let {
		spec,
		disabled = false,
		blockedReason = ''
	}: { spec: PromptSpec; disabled?: boolean; blockedReason?: string } = $props();

	const text = $derived(render(spec));
	const tokens = $derived(approxTokens(text));

	let copied = $state(false);
	let open = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard blocked (insecure context, permissions) — open the text so
			// the reader can select it by hand rather than hitting a dead button.
			open = true;
		}
	}
</script>

<section class="prompt">
	<header class="head">
		<div>
			<h3 class="title">AI-কে দিয়ে লেখাতে চাইলে</h3>
			<p class="sub">
				তোমার লেখা তথ্য দিয়ে প্রম্পটটা তৈরি — কপি করে যেকোনো AI-তে পেস্ট করো। কিছুই এখান থেকে বাইরে
				যায় না।
			</p>
		</div>
		<span class="tokens">~{tokens.toLocaleString('en-US')} tokens</span>
	</header>

	{#if disabled}
		<p class="blocked">{blockedReason}</p>
	{:else}
		<div class="actions">
			<button class="btn primary" onclick={copy}>
				<Icon name={copied ? 'check' : 'sparkles'} size={14} color="#fff" />
				{copied ? 'কপি হয়েছে' : 'প্রম্পট কপি করো'}
			</button>
			<button class="btn ghost" onclick={() => (open = !open)}>
				{open ? 'লুকাও' : 'দেখে নাও'}
			</button>
		</div>

		{#if open}
			<pre class="preview">{text}</pre>
		{/if}
	{/if}
</section>

<style>
	.prompt {
		margin-top: 1.5rem;
		padding: 1rem 1.1rem;
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		background: color-mix(in oklch, var(--accent) 3%, var(--bg));
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.title {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.sub {
		margin: 0.2rem 0 0;
		font-size: 0.8125rem;
		line-height: 1.55;
		color: var(--muted);
		max-width: 52ch;
	}

	.tokens {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.85rem;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.85rem;
		border-radius: var(--radius-button);
		border: 1px solid transparent;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
	}

	.primary {
		background: var(--accent-solid);
		color: #fff;
	}

	.ghost {
		background: transparent;
		border-color: var(--rule);
		color: var(--muted);
	}

	.ghost:hover {
		color: var(--fg);
	}

	.blocked {
		margin: 0.6rem 0 0;
		font-size: 0.8125rem;
		color: var(--muted);
	}

	.preview {
		margin: 0.85rem 0 0;
		padding: 0.85rem;
		max-height: 22rem;
		overflow: auto;
		border-radius: var(--radius-card);
		background: color-mix(in oklch, var(--fg) 4%, var(--bg));
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1.6;
		white-space: pre-wrap;
		color: var(--fg);
	}
</style>
