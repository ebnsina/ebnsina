<script>
	import { SERVICES } from '$lib/data/data';
</script>

<section class="lg:py-40">
	<div class="container mx-auto px-8 lgpx-0 text-center">
		<h3 class="text-3xl lg:text-4xl font-bold text-center mb-5 pt-20">Service I Offer</h3>

		<div class="grid md:grid-cols-3 gap-10 text-center">
			{#each SERVICES as service}
				<article class={`flex flex-col justify-between p-8 ${service.color} text-black`}>
					<h2 class="text-xl lg:text-2xl font-bold mb-2">{service.title}</h2>
					<p class="text-sm leading-relaxed">{service.description}</p>
				</article>
			{/each}
		</div>
	</div>
</section>
