<script>
	import ArrowRight from '$lib/icons/arrow-right.svelte';
	import Download from '$lib/icons/download.svelte';
	import HeroImage from '$lib/assets/hero.svg';
</script>

<section class="py-10 lg:py-40 relative">
	<div class="container mx-auto px-8 lg:px-0 grid md:grid-cols-2 gap-10 lg:pt-20">
		<div>
			<h2 class="text-4xl lg:text-6xl font-bold lg:mb-5">
				Hi <span class="text-slate-500">,</span>
			</h2>

			<h1 class="text-4xl lg:text-6xl font-bold">
				I&apos;m <span class="text-primary">Ebn Sina</span>
			</h1>

			<p class="text-sm md:text-lg leading-relaxed mt-3">
				A FullStack Developer, Software Engineer speacialized in web &amp; mobile technologies and
				building softwares for customer over 4 years.
			</p>

			<div class="flex space-x-5 mt-5">
				<button class="btn-2">
					<span class="relative z-10 transition-all font-sans-heading">Get in touch</span>
					<span class="absolute block text-white bottom-0 z-50 opacity-0 top-1/2 left-1/2 h-4"
						><ArrowRight /></span
					>
				</button>

				<button class="btn-2">
					<span class="relative z-10 transition-all font-sans-heading">Download CV</span>
					<span class="absolute block text-white bottom-0 z-50 opacity-0 top-1/2 left-1/2 h-4"
						><Download /></span
					>
				</button>
			</div>
		</div>
		<div>
			<img
				src={HeroImage}
				alt="A man coding with a computer."
				width={500}
				height={300}
				class="rounded-2xl object-cover"
			/>
		</div>
	</div>
</section>
