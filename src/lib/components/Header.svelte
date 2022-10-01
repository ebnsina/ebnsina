<script lang="ts">
	let y: number;
</script>

<header
	class={`block py-6 lg:sticky top-0 left-0 w-full z-50 text-white ${
		y > 100 ? 'bg-[#12161B] z-50' : ''
	}`}
>
	<div
		class="container mx-auto px-8 lgpx-0 flex flex-col lg:flex-row flex-wrap lg:flex-nowrap justify-between items-center"
	>
		<h1>
			<a class="text-2xl font-bold" href="/">ES.</a>
		</h1>

		<nav class="my-5 lg:my-0">
			<ul
				class="flex space-x-6 uppercase md:capitalize text-sm lg:space-x-8 items-center lg:text-lg"
			>
				<li>
					<a href="/about">About</a>
				</li>
				<li>
					<a href="/blog">Blog</a>
				</li>
				<li>
					<a href="/uses">Uses</a>
				</li>
			</ul>
		</nav>

		<div>
			<ul class="flex space-x-4 items-center">
				<li>
					<a href="https://m.me/ebnsina.dev" target="_blank" class="btn-1">Let&apos;s Be Friend!</a>
				</li>
			</ul>
		</div>
	</div>
</header>

<svelte:window bind:scrollY={y} />
