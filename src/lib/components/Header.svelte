<script lang="ts">
	import { page } from '$app/state';
	import { SITE } from '$lib/config';
	import ThemeToggle from './ThemeToggle.svelte';
	import SearchTrigger from './SearchTrigger.svelte';
	import RollDigit from './RollDigit.svelte';

	// `inset` is false inside the home hero, which already pads its edges.
	let { inset = true }: { inset?: boolean } = $props();

	// Live Dhaka time to the second; clicking switches 24-hour and AM/PM (remembered).
	let h12 = $state(false);
	const format = (twelve: boolean) =>
		new Intl.DateTimeFormat('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: twelve,
			timeZone: 'Asia/Dhaka'
		});
	// Prerendered without a time; the live clock starts once the page runs.
	let time = $state('--:--:--');
	// natural width of the current format, measured from a hidden copy; the slot eases to it
	let slotWidth = $state(0);

	$effect(() => {
		try {
			h12 = localStorage.getItem('clock') === '12';
		} catch {
			// storage blocked: keep the 24-hour default
		}
	});

	$effect(() => {
		const fmt = format(h12);
		const tick = () => (time = fmt.format(new Date()).toUpperCase());
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	});

	// Split-flap turn when the clock switches between 24-hour and AM/PM.
	function flap(_node: Element) {
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		return {
			duration: reduce ? 0 : 420,
			css: (t: number) => `transform: perspective(12em) rotateX(${(1 - t) * -90}deg); opacity: ${t}`
		};
	}

	// The old time blows away like sand: a noise filter scatters it while it fades.
	// It leaves the layout as it goes, so the new time takes its place without a shift.
	let grains: SVGFEDisplacementMapElement;
	function sand(node: HTMLElement) {
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		node.style.position = 'absolute';
		node.style.filter = 'url(#clock-sand)';
		return {
			duration: reduce ? 0 : 700,
			tick: (t: number, u: number) => {
				grains?.setAttribute('scale', String(u * 36));
				node.style.opacity = String(t);
				node.style.transform = `translate(${u * 10}px, ${-u * 8}px)`;
			}
		};
	}

	function toggleClock() {
		h12 = !h12;
		try {
			localStorage.setItem('clock', h12 ? '12' : '24');
		} catch {
			// storage blocked: the toggle still works for this visit
		}
	}

	const isActive = (href: string) => {
		const base = href.split('#')[0];
		return base.length > 1 && page.url.pathname.startsWith(base);
	};
</script>

<!-- The home page's bar, used on every page: name left; links, Dhaka time and switches right. -->
<svg width="0" height="0" class="absolute" aria-hidden="true">
	<filter id="clock-sand" x="-20%" y="-50%" width="140%" height="200%">
		<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" result="noise" />
		<feDisplacementMap
			bind:this={grains}
			in="SourceGraphic"
			in2="noise"
			scale="0"
			xChannelSelector="R"
			yChannelSelector="G"
		/>
	</filter>
</svg>

<header class="site-header" class:inset>
	<a href="/" class="logo">{SITE.name}</a>
	<nav aria-label="Main">
		<span class="links">
			{#each SITE.nav as item (item.href)}
				<a href={item.href} class="link" class:is-active={isActive(item.href)}>{item.label}</a>
			{/each}
		</span>
		<button
			type="button"
			class="clock"
			onclick={toggleClock}
			title={h12 ? 'Show 24-hour time' : 'Show AM/PM time'}
		>
			Bangladesh ·
			<span class="slot" style:width={slotWidth ? `${slotWidth}px` : undefined}>
				<span class="ghost" aria-hidden="true" bind:offsetWidth={slotWidth}>{time}</span>
				{#key h12}
					<span class="time" in:flap out:sand>
						<span class="sr-only">{time}</span>
						{#each time.split('') as ch, i (i)}
							{#if ch >= '0' && ch <= '9'}<RollDigit digit={+ch} />{:else}<span aria-hidden="true"
									>{ch}</span
								>{/if}
						{/each}
					</span>
				{/key}
			</span>
		</button>
		<span class="tools">
			<SearchTrigger compact />
			<ThemeToggle />
		</span>
	</nav>
</header>

<style>
	.site-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		font-size: var(--step--1);
		color: var(--muted);
		border-radius: 0;
	}
	.inset {
		padding: var(--sina-gutter) var(--sina-gutter) 0;
	}
	.logo {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--fg);
	}
	nav,
	.links {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}
	.link {
		transition: color 0.15s;
	}
	.link:hover,
	.link.is-active {
		color: var(--fg);
	}
	.clock {
		position: relative;
		color: inherit;
		transition: color 0.15s;
	}
	.clock:hover {
		color: var(--fg);
	}
	/* the slot eases between the two formats' widths, so the label glides instead of jumping */
	.slot {
		position: relative;
		display: inline-block;
		vertical-align: bottom;
		text-align: left;
		transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.ghost {
		position: absolute;
		visibility: hidden;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.time {
		display: inline-block;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		transform-origin: 50% 50%;
	}
	@media (prefers-reduced-motion: reduce) {
		.slot {
			transition: none;
		}
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	@media (max-width: 900px) {
		.clock {
			display: none;
		}
	}
	/* phones: name and switches on the first row, the links on their own row below */
	@media (max-width: 639px) {
		.site-header {
			display: grid;
			grid-template-columns: 1fr auto;
			grid-template-areas:
				'logo tools'
				'links links';
			row-gap: 0.75rem;
		}
		nav {
			display: contents;
		}
		.logo {
			grid-area: logo;
		}
		.tools {
			grid-area: tools;
		}
		.links {
			grid-area: links;
			gap: 1.25rem;
		}
	}
</style>
