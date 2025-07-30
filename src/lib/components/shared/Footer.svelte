<script lang="ts">
	import { spring } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	const socials = [
		{ label: 'twitter', handler: 'ebns1na', href: 'https://x.com/ebns1na' },
		{ label: 'github', handler: 'ebnsina', href: 'https://github.com/ebnsina' },
		{ label: 'linkedin', handler: 'ebn-sina', href: 'https://www.linkedin.com/in/ebn-sina' },
		{ label: 'facebook', handler: 'ebnsina.dev', href: 'https://m.me/ebnsina.dev' },
		{ label: 'gmail', handler: 'ebnsina.dev', href: 'mailto:ebnsina.dev@gmail.com' }
	];

	let hoveredIndex = -1;
	const animationProgress = spring(0, { stiffness: 0.1, damping: 0.4 });

	function handleMouseEnter(index: number) {
		hoveredIndex = index;
		animationProgress.set(1);
	}

	function handleMouseLeave() {
		hoveredIndex = -1;
		animationProgress.set(0);
	}

	function getAnimatedText(text: string, progress: number) {
		const chars = text.split('');
		return chars
			.map((char, i) => {
				const charProgress = Math.max(0, Math.min(1, progress * chars.length - i));
				const randomChar = String.fromCharCode(33 + Math.floor(Math.random() * 94));
				return charProgress === 1 ? char : randomChar;
			})
			.join('');
	}
</script>

<footer class="border-t border-slate-200">
	<div class="max-w-5xl mx-auto px-4 py-4 border-x">
		<ul class="flex space-x-4 items-center justify-center text-slate-600 text-sm">
			{#each socials as social, index (social.href)}
				<li>
					<a
						class="hover:underline relative"
						target="_blank"
						rel="noopener noreferrer"
						href={social.href}
						on:mouseenter={() => handleMouseEnter(index)}
						on:mouseleave={handleMouseLeave}
					>
						<span class="block w-[10s0px] bg-">
							{#if hoveredIndex === index}
								<span transition:fade={{ duration: 150 }}>
									{getAnimatedText(social.handler, $animationProgress)}
								</span>
							{:else}
								{social.label}
							{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
</footer>
