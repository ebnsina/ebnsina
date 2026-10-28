<!-- Dawn over layered ridges: sun rises, haze drifts, ridges settle in. Colours come from the theme tokens. -->
<svg class="scene" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
	<defs>
		<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color: var(--sky-0)" />
			<stop offset="0.45" style="stop-color: var(--sky-1)" />
			<stop offset="0.7" style="stop-color: var(--sky-2)" />
		</linearGradient>
		<radialGradient id="glow">
			<stop offset="0" style="stop-color: var(--glow); stop-opacity: 0.6" />
			<stop offset="1" style="stop-color: var(--glow); stop-opacity: 0" />
		</radialGradient>
		<linearGradient id="r0" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color: var(--r0-a)" />
			<stop offset="0.5" style="stop-color: var(--r0-b)" />
		</linearGradient>
		<linearGradient id="r1" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color: var(--r1-a)" />
			<stop offset="0.5" style="stop-color: var(--r1-b)" />
		</linearGradient>
		<linearGradient id="r2" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color: var(--r2-a)" />
			<stop offset="0.5" style="stop-color: var(--r2-b)" />
		</linearGradient>
		<linearGradient id="r3" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color: var(--r3-a)" />
			<stop offset="0.6" style="stop-color: var(--r3-b)" />
		</linearGradient>
		<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color: var(--haze); stop-opacity: 0" />
			<stop offset="0.55" style="stop-color: var(--haze); stop-opacity: 0.7" />
			<stop offset="1" style="stop-color: var(--haze); stop-opacity: 0" />
		</linearGradient>
	</defs>

	<rect width="1440" height="900" fill="url(#sky)" />

	<g class="sun">
		<circle cx="1300" cy="468" r="230" fill="url(#glow)" />
		<circle cx="1300" cy="468" r="58" style="fill: var(--sun)" />
	</g>

	<g
		class="birds"
		fill="none"
		stroke-width="1.5"
		stroke-linecap="round"
		style="stroke: var(--birds)"
	>
		<path d="M520 190q7-7 14 0q7-7 14 0M562 172q5-5 10 0q5-5 10 0M590 202q4-4 8 0q4-4 8 0" />
	</g>

	<g transform="translate(0 -70)">
		<path
			class="ridge"
			fill="url(#r0)"
			d="M0 650 60 618 110 634 150 596 200 620 240 586 270 604 320 552 350 574 380 560 420 584 460 548 500 566 540 528 570 548 610 536 660 582 700 562 740 596 790 574 830 598 870 566 900 540 940 558 980 524 1010 546 1050 532 1090 566 1130 512 1160 534 1200 520 1250 560 1290 546 1330 574 1370 556 1440 594V1000H0Z"
		/>
		<rect class="haze" x="0" y="540" width="1440" height="200" fill="url(#haze)" />
		<path
			class="ridge"
			fill="url(#r1)"
			d="M0 700 50 680 90 696 150 646 190 668 230 652 290 690 340 660 380 676 430 632 470 656 510 644 560 686 620 660 660 672 720 628 760 650 800 640 850 684 900 664 950 676 1000 642 1040 662 1080 650 1130 692 1180 666 1230 680 1280 646 1320 664 1370 654 1440 696V1000H0Z"
		/>
		<rect
			class="haze slow"
			x="0"
			y="640"
			width="1440"
			height="180"
			fill="url(#haze)"
			opacity="0.7"
		/>
		<path
			class="ridge"
			fill="url(#r2)"
			d="M0 772 60 752 100 764 150 728 200 748 240 738 300 776 350 756 400 766 450 724 500 746 540 736 600 778 650 758 700 770 760 730 800 750 850 742 900 782 950 760 1000 770 1050 734 1090 752 1140 744 1200 784 1250 762 1300 772 1350 740 1400 756 1440 750V1000H0Z"
		/>
		<path
			class="ridge"
			fill="url(#r3)"
			d="M0 850 70 836 140 846 220 826 300 842 380 822 460 838 540 820 620 840 700 826 780 846 860 830 940 848 1020 832 1100 850 1180 834 1260 852 1340 838 1440 850V1000H0Z"
		/>
	</g>
</svg>

<style>
	.scene {
		position: absolute;
		inset: 0;
		z-index: -1;
		width: 100%;
		height: 100%;
		pointer-events: none;
		border-radius: 0;
	}
	.sun {
		transform: translateY(160px);
	}
	.ridge {
		transform: translateY(40px);
	}
	.haze {
		animation: breathe 14s ease-in-out infinite alternate;
	}
	.slow {
		animation-duration: 20s;
		animation-direction: alternate-reverse;
	}
	.birds {
		animation: fly 45s linear infinite;
	}
	@keyframes breathe {
		from {
			opacity: 0.5;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes fly {
		from {
			transform: translate(-250px, 40px);
		}
		to {
			transform: translate(1000px, -60px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.haze,
		.birds {
			animation: none;
		}
	}
</style>
