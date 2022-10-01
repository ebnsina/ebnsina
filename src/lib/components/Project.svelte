<script>
	import { PROJECTS } from '$lib/data/data';
	import Github from '$lib/icons/github.svelte';
	import ArrowRight from '$lib/icons/arrow-right.svelte';
</script>

<section class="py-10 lg:py-40">
	<div class="container mx-auto px-8 lg:px-0">
		<h3 class="text-3xl lg:text-4xl font-bold text-center mb-5">Project Showcase</h3>

		<div class="flex overflow-x-auto overflow-y-hidden py-10 snap-x">
			{#each PROJECTS as project (project.id)}
				<article
					class={`p-10 mx-10 min-w-[400px] transform bg-gradient-to-r ${project.fromColor} ${
						project.toColor
					} ${project.id % 2 === 0 ? '-rotate-2' : 'rotate-2'}`}
				>
					<h2 class="text-2xl lgtext-4xl font-bold mb-2">{project.title}</h2>
					<p class="text-sm">{project.description}</p>

					<div class="mt-5 flex justify-end space-x-4">
						<button type="button"><Github /></button>
						<button type="button"><ArrowRight /></button>
					</div>
				</article>
			{/each}
		</div>

		<div class="flex justify-center items-center mt-8">
			<a href="https://github.com/ebnsina?tab=repositories" target="_blank" class="btn-4"
				>See More</a
			>
		</div>
	</div>
</section>
