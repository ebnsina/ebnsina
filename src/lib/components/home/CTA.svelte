<script lang="ts">
	export let title = 'Interested in Future Collaboration?';
	export let subtitle = 'Feel free to reach out—I’m always open to new ideas and projects.';
	export let buttonText = 'Contact Me';
</script>

<div
	class="relative rounded-2xl p-10 text-center text-white mt-6 md:mt-16 mx-5 md:mx-10"
	style="background: conic-gradient(from 180deg at center, #000000, #1f2937, #4b5563, #000000);"
>
	<h2 class="text-2xl md:text-3xl font-bold mb-4">{title}</h2>
	<p class="mb-6 text-base md:text-lg text-slate-300">{subtitle}</p>
	<a
		href="mailto:ebnsina.dev@gmail.com"
		class="bg-white text-black px-10 py-3 text-sm rounded-2xl hover:bg-slate-100 transition"
	>
		{buttonText}
	</a>

	<img
		class="absolute -left-12 md:-left-20 rotate-6 bottom-28 size-16"
		src="/images/coffee.svg"
		alt="fun arrow"
	/>
</div>
