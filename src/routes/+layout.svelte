<script>
	import '$lib/styles/tailwind.css';
	import '$lib/styles/prism-dracula.css';

	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';

	console.log(
		`%c 
███████╗██████╗░███╗░░██╗  ░██████╗██╗███╗░░██╗░█████╗░
██╔════╝██╔══██╗████╗░██║  ██╔════╝██║████╗░██║██╔══██╗
█████╗░░██████╦╝██╔██╗██║  ╚█████╗░██║██╔██╗██║███████║
██╔══╝░░██╔══██╗██║╚████║  ░╚═══██╗██║██║╚████║██╔══██║
███████╗██████╦╝██║░╚███║  ██████╔╝██║██║░╚███║██║░░██║
╚══════╝╚═════╝░╚═╝░░╚══╝  ╚═════╝░╚═╝╚═╝░░╚══╝╚═╝░░╚═╝`,
		'color: #A68BFF'
	);
</script>

<div id="__sveltekit" class="bg-slate-900 text-white">
	<Header />
	<slot />
	<Footer />
</div>
