<script>
	import Typewriter from '$lib/components/shared/Typewriter.svelte';
</script>

<svelte:head>
	<title>Ebn Sina - Full Stack Developer | Instructor | JS Evangelist</title>
</svelte:head>

<section>
	<Typewriter
		sentences={[
			'Merhaba, ben Ebn Sina, bir full stack geliştiricisiyim.',
			'Hello, I am Ebn Sina, a full stack developer.',
			'I am passionate about creating user-centric applications.',
			"Let's transform ideas into robust, scalable solutions."
		]}
	/>

	<div class="text-sm text-slate-600 leading-7 mt-4 space-y-4">
		<p>
			Meet a dedicated and versatile Full Stack Developer who seamlessly blends front-end creativity
			with back-end logic. With expertise in modern web technologies such as SvelteKit, TypeScript,
			and Tailwind CSS, I specialize in crafting dynamic, user-centric applications that are both
			robust and scalable. Whether designing intuitive interfaces or optimizing server-side
			performance, I thrive on turning complex challenges into elegant, functional solutions that
			deliver exceptional user experiences. Committed to continuous learning and innovation, I am
			always exploring new frameworks and tools to enhance my skills. When not coding, I enjoy
			sharing insights through blog posts and engaging with the developer community.
		</p>

		<p>
			I mostly <a
				class="inline-flex underline text-primary font-medium decoration-wavy underline-offset-2"
				href="/stack">work</a
			> with Svelte/SvelteKit, React/Nextjs to build awesome product that also has top level developer
			experiences.
		</p>

		<p>
			Sometimes i <a
				class="inline-flex underline text-primary font-medium decoration-wavy underline-offset-2"
				href="/blog">write</a
			> things about web development & native apps development and all other bleeding edge technologies.
		</p>
	</div>
</section>
