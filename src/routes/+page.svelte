<script>
	import Cta from '$lib/components/home/CTA.svelte';
	import Typewriter from '$lib/components/shared/Typewriter.svelte';
</script>

<svelte:head>
	<title>Marhaba - Ebn Sina</title>
</svelte:head>

<section
	class="relative py-10 border-b border-slate-200 px-6"
	style="
    background-image: 
      repeating-linear-gradient(0deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px),
      repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px);
  "
>
	<Typewriter
		sentences={[
			'Merhaba, ben Ebn Sina, bir full stack geliştiricisiyim.',
			'Hello, I am Ebn Sina, a full stack developer.',
			'I am passionate about creating user-centric applications.',
			"Let's transform ideas into robust, scalable solutions."
		]}
	/>

	<div
		class="relative text-sm md:text-base text-slate-600 leading-loose md:leading-10 mt-4 space-y-4"
	>
		<ul>
			<li>
				Meet a dedicated and versatile Full Stack Developer who seamlessly blends front-end
				creativity with back-end logic. With expertise in modern web technologies such as SvelteKit,
				TypeScript, and Tailwind CSS, I specialize in crafting dynamic, user-centric applications
				that are both robust and scalable. Whether designing intuitive interfaces or optimizing
				server-side performance, I thrive on turning complex challenges into elegant, functional
				solutions that deliver exceptional user experiences. Committed to continuous learning and
				innovation, I am always exploring new frameworks and tools to enhance my skills. When not
				coding, I enjoy sharing insights through blog posts and engaging with the developer
				community.
			</li>
			<li>
				I mostly <a
					class="inline-flex underline text-primary font-medium decoration-wavy underline-offset-2"
					href="/stack">work</a
				> with Svelte/SvelteKit, React/Nextjs to build awesome product that also has top level developer
				experiences.
			</li>
			<li>
				Sometimes i <a
					class="inline-flex underline text-primary font-medium decoration-wavy underline-offset-2"
					href="/blog">write</a
				> things about web development & native apps development and all other bleeding edge technologies.
			</li>
		</ul>

		<img
			class="absolute -right-16 bottom-28 -rotate-[140deg] size-20"
			src="/images/fun-arrow.svg"
			alt="fun arrow"
		/>
	</div>
</section>

<Cta />
