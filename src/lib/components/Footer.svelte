<script>
	let currentYear = new Date().getFullYear();
</script>

<footer class="py-10 lg:py-20">
	<div class="container mx-auto px-8 lg:px-0">
		<div class="border-t border-slate-700 pb-6" />

		<div class="flex justify-between items-center">
			<a href="/" class="inline-block text-sm lg:text-2xl font-bold">Ebn Sina</a>
			<p class="text-xs lg:text-sm flex items-center">
				<span>made with</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="h-6 w-6 flex-none fill-rose stroke-rose-500 stroke-2 mx-1"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
					/>
				</svg>

				<span>Ebn Sina</span> - {currentYear}.
			</p>
		</div>
	</div>
</footer>
