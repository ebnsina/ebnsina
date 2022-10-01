<script>
	import About from '$lib/components/About.svelte';
	import Cta from '$lib/components/CTA.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Project from '$lib/components/Project.svelte';
	import Service from '$lib/components/Service.svelte';
	import Testimonial from '$lib/components/Testimonial.svelte';
</script>

<svelte:head>
	<html lang="en" />
	<title>Ebn Sina - Software Developer</title>
	<meta name="robots" content="noindex nofollow" />
	<meta name="description" content="ebnsina - software engineer, developer" />
	<meta
		name="keywords"
		content="ebnsina - software engineer, developer, javascript, fullstack, web application development, mobile application development."
	/>
</svelte:head>

<Hero />
<About />
<Service />
<Project />
<Testimonial />
<Cta />
