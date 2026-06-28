<script lang="ts">
	import { Trophy, Lock } from '@lucide/svelte';

	let {
		label,
		color,
		earned = false,
		done = 0,
		total = 0,
		size = 'md'
	}: {
		label: string;
		color: string;
		earned?: boolean;
		done?: number;
		total?: number;
		size?: 'sm' | 'md';
	} = $props();
</script>

<div class="badge" class:earned class:sm={size === 'sm'} style="--bc:{color}" title={label}>
	<div class="medal">
		{#if earned}
			<Trophy strokeWidth={1.8} />
		{:else}
			<Lock strokeWidth={1.8} />
		{/if}
	</div>
	<span class="label">{label}</span>
	{#if earned}
		<span class="meta">Mastered</span>
	{:else}
		<span class="meta">{done}/{total}</span>
	{/if}
</div>

<style>
	.badge {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		width: 5.5rem;
		text-align: center;
	}
	.badge.sm {
		width: 4.5rem;
	}
	.medal {
		display: grid;
		place-items: center;
		width: 3.4rem;
		height: 3.8rem;
		/* hexagon shield */
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		color: color-mix(in oklch, var(--fg) 32%, transparent);
		background: color-mix(in oklch, var(--fg) 7%, transparent);
	}
	.badge.sm .medal {
		width: 2.9rem;
		height: 3.2rem;
	}
	.medal :global(svg) {
		width: 42%;
		height: 42%;
	}
	.badge.earned .medal {
		color: #fff;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.28), transparent 45%),
			linear-gradient(
				160deg,
				color-mix(in oklch, var(--bc) 90%, #fff),
				color-mix(in oklch, var(--bc) 74%, #000)
			);
		box-shadow: 0 8px 18px -10px color-mix(in oklch, var(--bc) 70%, #000);
	}
	.label {
		font-family: var(--font-pixel);
		font-size: 0.6rem;
		line-height: 1.2;
		color: color-mix(in oklch, var(--fg) 55%, transparent);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.badge.earned .label {
		color: var(--fg);
	}
	.meta {
		font-family: var(--font-pixel);
		font-size: 0.5rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: color-mix(in oklch, var(--fg) 40%, transparent);
	}
	.badge.earned .meta {
		color: color-mix(in oklch, var(--bc) 65%, var(--fg));
	}
</style>
