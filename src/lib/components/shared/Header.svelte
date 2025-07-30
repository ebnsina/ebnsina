<script lang="ts">
	const links = [
		{ href: '/', label: 'Home' },
		{ href: '/blog', label: 'Blog' },
		{ href: '/stack', label: 'Stack' }
	];
</script>

<header class="border-b">
	<div
		class="max-w-5xl mx-auto px-4 flex justify-between items-center border-x py-4 border-slate-300"
	>
		<a class="text-2xl md:text-3xl font-extrabold text-black" href="/"><h1>ebn sina.</h1></a>

		<nav>
			<ul class="flex space-x-6 items-center text-sm">
				{#each links as { href, label }}
					<li><a class="text-slate-600 hover:text-slate-800 transition-all" {href}>{label}</a></li>
				{/each}
			</ul>
		</nav>
	</div>
</header>
