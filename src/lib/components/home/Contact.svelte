<script lang="ts">
	import Night from './Night.svelte';
	import { SITE } from '$lib/config';
	import { gsap, SplitText, motion } from '$lib/motion';

	const year = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(new Date());
	// The site footer. Full height on the home page, where the night falls as you scroll.
	let { tall = false }: { tall?: boolean } = $props();

	const pages = [
		['Writing', '/blog'],
		['Series', '/series'],
		['Notes', '/notes'],
		['Projects', '/projects'],
		['Tools', '/tools'],
		['Directory', '/directory'],
		['About', '/about'],
		['Uses', '/uses'],
		['CV', '/cv'],
		['RSS', '/rss.xml']
	];
	const elsewhere = [
		['GitHub', SITE.social.github],
		['LinkedIn', SITE.social.linkedin],
		['WhatsApp', `https://wa.me/${SITE.phone.slice(1)}`]
	];
	let root: HTMLElement;
	let mail: HTMLElement;

	$effect(() =>
		motion(root, (reduce) => {
			gsap.set(root.querySelectorAll('.pre'), { visibility: 'visible' });
			if (reduce) {
				gsap.set(root.querySelectorAll('.sky-night, .stars, .moon'), { opacity: 1 });
				return;
			}
			// Dusk to night: night sky fades in, stars and moon appear, layers parallax at different depths
			const q = (s: string) => root.querySelectorAll(s);
			gsap
				.timeline({
					scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom bottom', scrub: 0.6 }
				})
				.to(q('.sky-night'), { opacity: 1, ease: 'none' }, 0)
				.to(q('.stars'), { opacity: 1, y: -60, ease: 'none' }, 0.2)
				.to(q('.moon'), { opacity: 1, y: -90, ease: 'none' }, 0.1)
				.fromTo(q('.r1'), { y: 420 }, { y: 0, ease: 'power1.out', duration: 0.8 }, 0.25)
				.fromTo(q('.r2'), { y: 640 }, { y: 0, ease: 'power1.out', duration: 0.75 }, 0.35);
			gsap.to(q('.star'), {
				opacity: 0.15,
				duration: () => 1 + Math.random() * 2,
				repeat: -1,
				yoyo: true,
				ease: 'sine.inOut',
				stagger: { each: 0.05, from: 'random' }
			});
			SplitText.create(root.querySelector('.hello'), {
				type: 'chars',
				mask: 'chars',
				charsClass: 'ch',
				aria: 'none',
				onSplit: (self) =>
					gsap.from(self.chars, {
						yPercent: 110,
						duration: 1,
						stagger: 0.03,
						ease: 'power4.out',
						scrollTrigger: { trigger: self.elements[0], start: 'top 85%' }
					})
			});
			gsap.from(q('.label, .base'), {
				autoAlpha: 0,
				y: 16,
				duration: 0.9,
				stagger: 0.2,
				scrollTrigger: { trigger: root, start: 'top 75%' }
			});
		})
	);

	function scramble() {
		gsap.to(mail, {
			duration: 1,
			scrambleText: { text: SITE.email, chars: 'lowerCase', speed: 0.6 }
		});
	}
</script>

<footer id="contact" class="contact" class:tall bind:this={root}>
	<Night />
	<p class="label pre">Have something to build?</p>
	<a class="mail" href="mailto:{SITE.email}" onmouseenter={scramble} onfocus={scramble}>
		<span class="hello pre">Say hello</span>
		<em bind:this={mail}>{SITE.email}</em>
	</a>
	<div class="base pre">
		<nav aria-label="Site">
			{#each pages as [name, href] (href)}
				<a {href}>{name}</a>
			{/each}
		</nav>
		<nav aria-label="Elsewhere">
			{#each elsewhere as [name, href] (href)}
				<a {href} target="_blank" rel="noopener">{name}</a>
			{/each}
			<span>© {year} {SITE.name}</span>
		</nav>
	</div>
</footer>

<style>
	.contact {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		min-height: 100svh;
		display: grid;
		align-content: end;
		padding: clamp(6rem, 14vw, 12rem) var(--sina-gutter) 2rem;
		color: var(--on-band);
		border-radius: 0;
	}
	.tall {
		min-height: 150svh;
	}
	.label {
		font-size: var(--step--1);
		color: var(--band-mute);
		margin-bottom: 2rem;
	}
	.mail {
		display: grid;
		gap: 0.25em;
		width: fit-content;
		font-family: var(--font-display);
		font-size: clamp(2.5rem, 8vw, 7.5rem);
		line-height: 1;
		letter-spacing: -0.03em;
	}
	.hello {
		display: block;
	}
	.mail em {
		font-style: normal;
		font-size: 0.75em;
		color: var(--band-hi);
	}
	.base {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem 2rem;
		flex-wrap: wrap;
		margin-top: clamp(4rem, 10vw, 8rem);
		font-size: var(--step--2);
		color: var(--band-mute);
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
	}
	nav a:hover {
		color: var(--band-hi);
	}
</style>
