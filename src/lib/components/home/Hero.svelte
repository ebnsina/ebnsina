<script lang="ts">
	import Scene from './Scene.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Header from '$lib/components/Header.svelte';
	import { gsap, SplitText, motion } from '$lib/motion';

	let root: HTMLElement;
	// Scroll without writing the hash into the URL
	function go(e: MouseEvent) {
		e.preventDefault();
		document.getElementById('work')?.scrollIntoView({ behavior: 'smooth' });
	}

	$effect(() =>
		motion(root, (reduce) => {
			const d = (n: number) => (reduce ? 0 : n);
			const q = (s: string) => root.querySelectorAll(s);
			gsap
				.timeline({ defaults: { ease: 'power4.out' } })
				.to(q('.ridge'), { y: 0, duration: d(1.6), stagger: 0.12 }, 0)
				.to(q('.sun'), { y: 0, duration: d(3), ease: 'power2.out' }, 0.2)
				.from(
					q('.fade, .site-header'),
					{ autoAlpha: 0, y: 10, duration: d(0.9), stagger: 0.1 },
					0.8
				);

			SplitText.create(root.querySelector('h1'), {
				type: 'lines,words',
				mask: 'lines',
				linesClass: 'ln',
				aria: 'none',
				autoSplit: true,
				onSplit: (self) =>
					gsap.from(self.words, {
						yPercent: 110,
						duration: d(1.2),
						stagger: 0.04,
						ease: 'power4.out',
						delay: 0.2
					})
			});

			if (reduce) return;
			// Scroll parallax: ridges drift apart, sun sinks, headline recedes
			gsap
				.timeline({
					scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true }
				})
				.to(q('.ridge'), { y: (i) => -40 * (3 - i), ease: 'none' }, 0)
				.to(q('.sun'), { y: 90, ease: 'none' }, 0)
				.to(q('h1'), { y: 120, autoAlpha: 0.2, ease: 'none' }, 0);
		})
	);
</script>

<section class="hero" bind:this={root}>
	<Scene />
	<Header inset={false} />

	<h1>Software engineer<br />building <em>distributed,</em><br />well-made systems.</h1>

	<footer class="foot">
		<p class="fade">
			I design and ship backends and interfaces that stay calm under load. Currently working on AI
			agents, video infrastructure and CDN.
		</p>
		<a class="fade cta" href="#work" onclick={go}>
			Selected work <Icon name="arrowDown" size={16} />
		</a>
	</footer>
</section>

<style>
	.hero {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		min-height: 100svh;
		display: grid;
		grid-template-rows: auto 1fr auto;
		padding: var(--sina-gutter);
		gap: 2rem;
		border-radius: 0;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		font-size: var(--step--1);
		color: var(--muted);
	}
	h1 {
		align-self: center;
		font-family: var(--font-display);
		font-weight: 400;
		font-size: clamp(2.75rem, 9vw, 8.5rem);
		line-height: 0.98;
		letter-spacing: -0.03em;
		text-wrap: initial;
	}
	h1 em {
		font-style: normal;
		color: var(--em);
		letter-spacing: -0.01em;
	}
	.foot {
		align-items: flex-end;
	}
	.foot p {
		max-width: 34ch;
		color: var(--on-band);
	}
	.cta {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding-bottom: 2px;
		border-bottom: 1px solid currentColor;
		border-radius: 0;
		color: var(--on-band);
		transition: color 0.3s;
	}
	.cta:hover {
		color: var(--band-hi);
	}
	@media (max-width: 640px) {
		.foot {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
