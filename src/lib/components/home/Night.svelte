<script lang="ts">
	// Deterministic star field so SSR and client agree
	let seed = 7;
	const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	const stars = Array.from({ length: 90 }, () => ({
		x: rnd() * 1440,
		y: rnd() * 520,
		r: 0.6 + rnd() * 1.4
	}));
</script>

<!-- Dusk and night skies are stacked; scrolling fades night in over dusk. -->
<svg class="night" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
	<defs>
		<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color: var(--dusk-0)" />
			<stop offset="0.22" style="stop-color: var(--dusk-1)" />
			<stop offset="0.42" style="stop-color: var(--dusk-2)" />
			<stop offset="0.62" style="stop-color: var(--dusk-3)" />
			<stop offset="0.82" style="stop-color: var(--dusk-4)" />
			<stop offset="1" style="stop-color: var(--dusk-5)" />
		</linearGradient>
		<linearGradient id="nightsky" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color: var(--dusk-0)" />
			<stop offset="0.22" style="stop-color: var(--night-1)" />
			<stop offset="0.42" style="stop-color: var(--night-2)" />
			<stop offset="0.62" style="stop-color: var(--night-3)" />
			<stop offset="0.82" style="stop-color: var(--night-4)" />
			<stop offset="1" style="stop-color: var(--night-5)" />
		</linearGradient>
		<radialGradient id="mglow">
			<stop offset="0" style="stop-color: var(--moon-glow)" />
			<stop offset="1" style="stop-color: var(--moon-glow); stop-opacity: 0" />
		</radialGradient>
		<linearGradient id="n1" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color: var(--n1-a)" />
			<stop offset="1" style="stop-color: var(--n1-b)" />
		</linearGradient>
		<linearGradient id="n2" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color: var(--n2-a)" />
			<stop offset="1" style="stop-color: var(--n2-b)" />
		</linearGradient>
	</defs>
	<rect width="1440" height="900" fill="url(#dusk)" />
	<rect class="sky-night" width="1440" height="900" fill="url(#nightsky)" opacity="0" />
	<g class="stars" opacity="0" style="fill: var(--star)">
		{#each stars as s, i (i)}<circle class="star" cx={s.x} cy={s.y} r={s.r} />{/each}
	</g>
	<g class="moon" opacity="0">
		<circle cx="1000" cy="500" r="180" fill="url(#mglow)" />
		<circle cx="1000" cy="500" r="46" style="fill: var(--moon)" />
		<circle cx="1018" cy="488" r="40" style="fill: var(--moon-shade)" opacity="0.92" />
	</g>
	<path
		class="nridge r1"
		fill="url(#n1)"
		d="M0 700 50 680 90 696 150 646 190 668 230 652 290 690 340 660 380 676 430 632 470 656 510 644 560 686 620 660 660 672 720 628 760 650 800 640 850 684 900 664 950 676 1000 642 1040 662 1080 650 1130 692 1180 666 1230 680 1280 646 1320 664 1370 654 1440 696V1000H0Z"
	/>
	<path
		class="nridge r2"
		fill="url(#n2)"
		d="M0 800 60 780 100 792 150 756 200 776 240 766 300 804 350 784 400 794 450 752 500 774 540 764 600 806 650 786 700 798 760 758 800 778 850 770 900 810 950 788 1000 798 1050 762 1090 780 1140 772 1200 812 1250 790 1300 800 1350 768 1400 784 1440 778V1000H0Z"
	/>
</svg>

<style>
	.night {
		/* fade in from the page so the footer has no top edge */
		mask-image: linear-gradient(transparent, #000 35%);
		position: absolute;
		inset: 0;
		z-index: -1;
		width: 100%;
		height: 100%;
		pointer-events: none;
		border-radius: 0;
	}
	.moon {
		transform-origin: 1000px 500px;
	}
</style>
