<script>
	import { USES } from '$lib/data/data';
</script>

<svelte:head>
	<title>Uses - Ebn Sina</title>
</svelte:head>

<section class="py-10 lg:py-20">
	<div class="container mx-auto px-8 lg:px-0">
		<div class="grid lg:grid-cols-3 lg:gap-20">
			{#each Object.entries(USES) as [title, items]}
				<div class="mb-8">
					<h4 class="text-3xl font-sans-heading mb-5">{title}</h4>

					{#each items as item}
						<div class="flex mb-3">
							<svg
								class="h-6 w-6 flex-none fill-primary stroke-green-700 stroke-2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<circle cx="12" cy="12" r="11" />
								<path d="m8 13 2.165 2.165a1 1 0 0 0 1.521-.126L16 9" fill="none" />
							</svg>

							<a
								href={item.link}
								target="_blank"
								class="inline-block transition hover:underline hover:text-primary ml-3"
								>{item.title}</a
							>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</section>
