<script>
	import LoveImage from '$lib/assets/social/love.svg';
</script>

<section class="py-10 lg:py-40">
	<div class="container mx-auto px-8 lgpx-0">
		<h2 class="text-3xl lg:text-4xl font-bold text-center mb-5">
			Let&apos;s make something amazing
		</h2>
		<h4 class="text-base lg:text-xl font-bold text-center mb-8">Write to me</h4>

		<div class="relative bg-primary/30">
			<form
				class="relative z-30 bg-black/90 border border-primary -rotate-2 md:rotate-1 grid lg:grid-cols-3 gap-10 items-center p-4"
				autoComplete="off"
			>
				<input
					class="w-full bg-transparent border border-slate-50 px-4 py-4 focus:outline-none focus:ring-0 focus:border-secondary"
					type="email"
					name="email"
					placeholder="Your fancy email"
					required
				/>
				<textarea
					class="w-full bg-transparent border border-slate-50 px-4 py-4 focus:outline-none focus:ring-0 focus:border-secondary"
					name="message"
					placeholder="Type your message here"
					required
				/>

				<button
					type="submit"
					class="btn-3 px-8 py-4 font-bold transition-all duration-500 ease-linear cursor-pointer select-none touch-manipulation font-sans-heading text-2xl"
				>
					Get a quote
				</button>
			</form>

			<div class="animate-move-slow absolute left-[0] -top-[58px] transform -rotate-12 ">
				<img class="love-icon" src={LoveImage} alt="love" />
			</div>
		</div>
	</div>
</section>
