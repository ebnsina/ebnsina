<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { projects } from '$lib/data/projects';
	import { gsap, motion } from '$lib/motion';

	type Project = (typeof projects)[number];
	const featured = projects
		.filter((p) => p.featured)
		.sort((a, b) => a.order - b.order)
		.slice(0, 5);

	// The home page shows five featured projects; /projects passes every one.
	let {
		items = featured,
		heading = 'Selected work',
		more = true
	}: { items?: Project[]; heading?: string; more?: boolean } = $props();
	const num = (i: number) => String(i + 1).padStart(2, '0');
	let root: HTMLElement;

	$effect(() =>
		motion(root, (reduce) => {
			gsap.set(root.querySelectorAll('.pre'), { visibility: 'visible' });
			if (reduce) return;
			gsap.from(root.querySelector('.head'), {
				autoAlpha: 0,
				y: 20,
				duration: 1,
				scrollTrigger: { trigger: root.querySelector('.head'), start: 'top 85%' }
			});
			gsap.utils.toArray<HTMLElement>(root.querySelectorAll('li')).forEach((li) => {
				gsap.from(li.querySelectorAll('.t, .d'), {
					autoAlpha: 0,
					y: 50,
					duration: 1.1,
					stagger: 0.12,
					ease: 'power3.out',
					scrollTrigger: { trigger: li, start: 'top 85%' }
				});
				gsap.fromTo(
					li.querySelector('.n'),
					{ y: 60 },
					{
						y: -60,
						ease: 'none',
						scrollTrigger: { trigger: li, start: 'top bottom', end: 'bottom top', scrub: true }
					}
				);
			});
		})
	);
</script>

<section id="work" class="work" bind:this={root}>
	<header class="head pre">
		<h2>{heading}</h2>
		{#if more}<a href="/projects">All projects</a>{/if}
	</header>
	<ol>
		{#each items as p, i (p.slug)}
			<li>
				<a href="/projects/{p.slug}">
					<em class="n" aria-hidden="true">{num(i)}</em>
					<div class="t pre">
						<h3>{p.title}</h3>
						<span class="arrow" aria-hidden="true"><Icon name="arrowRight" size={32} /></span>
					</div>
					<div class="d pre">
						<p>{p.description}</p>
						<span class="meta">
							{p.stack.slice(0, 4).join(' · ')}<span class="year">{p.year}</span>
						</span>
					</div>
				</a>
			</li>
		{/each}
	</ol>
</section>

<style>
	.work {
		/* the band fades back into the page at its foot instead of ending on a hard edge */
		--fade: clamp(8rem, 16vw, 14rem);
		background: linear-gradient(var(--band) calc(100% - var(--fade)), var(--bg));
		color: var(--on-band);
		padding: clamp(4rem, 10vw, 9rem) var(--sina-gutter) calc(var(--fade) + 2rem);
		overflow: hidden;
		border-radius: 0;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: var(--step--1);
		color: var(--band-mute);
		margin-bottom: clamp(2rem, 6vw, 5rem);
	}
	.head a:hover {
		color: var(--band-hi);
	}
	h2 {
		font-family: inherit;
		font-size: inherit;
		font-weight: 400;
		letter-spacing: normal;
	}
	ol {
		list-style: none;
		padding: 0;
		display: grid;
		gap: clamp(2.5rem, 6vw, 5rem);
	}
	li a {
		position: relative;
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: 1.5rem 3rem;
		align-items: end;
		padding-left: clamp(2rem, 5vw, 5rem);
		border-radius: 0;
		color: inherit;
	}
	.n {
		position: absolute;
		left: 0;
		top: -0.35em;
		z-index: 0;
		font-family: var(--font-display);
		font-style: normal;
		font-size: clamp(3rem, 6vw, 5.5rem);
		line-height: 1;
		color: transparent;
		-webkit-text-stroke: 1px color-mix(in oklab, var(--on-band) 22%, transparent);
		transition: color 0.6s ease;
	}
	li a:hover .n {
		color: color-mix(in oklab, var(--on-band) 6%, transparent);
	}
	.t {
		position: relative;
		display: flex;
		align-items: baseline;
		gap: 1rem;
	}
	h3 {
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 3vw, 2.75rem);
		font-weight: 400;
		letter-spacing: -0.025em;
		line-height: 1.05;
		transition: color 0.4s ease;
	}
	li a:hover h3 {
		color: var(--band-hi);
	}
	.arrow {
		color: var(--em);
		opacity: 0;
		transform: translateX(-10px);
		transition:
			opacity 0.4s ease,
			transform 0.5s cubic-bezier(0.76, 0, 0.24, 1);
	}
	li a:hover .arrow {
		opacity: 1;
		transform: none;
	}
	.d {
		display: grid;
		gap: 0.75rem;
	}
	p {
		max-width: 38ch;
		color: var(--band-soft);
	}
	.meta {
		font-size: var(--step--1);
		color: var(--band-mute);
	}
	.year {
		margin-left: 1rem;
		color: var(--on-band);
	}
	@media (max-width: 800px) {
		li a {
			grid-template-columns: 1fr;
			gap: 1rem;
			padding-left: 0;
			padding-top: 1.5rem;
		}
		.n {
			top: -0.5rem;
			font-size: 3.5rem;
		}
		.arrow {
			display: none;
		}
	}
</style>
