<script lang="ts">
	import { onMount, tick, onDestroy } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';

	export let sentences: string[] = [];

	let displayedText = '';
	let index = 0;
	let isTyping = true;
	let isVisible = true;
	let animationRunning = false;
	let timeoutIds: number[] = [];

	const typingSpeed = 100;
	const sentenceDelay = 1500;
	const fadeDelay = 500;

	const delay = (ms: number): Promise<void> => {
		return new Promise((resolve) => {
			const timeoutId = setTimeout(resolve, ms);
			timeoutIds.push(timeoutId);
		});
	};

	const clearAllTimeouts = () => {
		timeoutIds.forEach((id) => clearTimeout(id));
		timeoutIds = [];
	};

	const typeSentence = async (): Promise<void> => {
		if (!sentences.length || animationRunning) return;

		animationRunning = true;

		try {
			const words = sentences[index].split(' ');
			displayedText = '';
			isVisible = true;
			isTyping = true;

			// Type out the sentence word by word
			for (let i = 0; i < words.length; i++) {
				if (!animationRunning) return; // Check if we should stop
				displayedText += (i === 0 ? '' : ' ') + words[i];
				await delay(typingSpeed);
			}

			isTyping = false;
			await delay(sentenceDelay);

			if (!animationRunning) return; // Check if we should stop

			// Fade out
			isVisible = false;
			await delay(fadeDelay);

			if (!animationRunning) return; // Check if we should stop

			// Move to next sentence
			index = (index + 1) % sentences.length;

			// Wait for DOM to update
			await tick();

			// Continue with next sentence
			animationRunning = false;
			typeSentence();
		} catch (error) {
			console.error('Error in typeSentence:', error);
			animationRunning = false;
		}
	};

	onMount(() => {
		if (sentences.length > 0) {
			typeSentence();
		}
	});

	onDestroy(() => {
		animationRunning = false;
		clearAllTimeouts();
	});

	$: if (sentences.length > 0 && !animationRunning) {
		index = 0;
		typeSentence();
	}
</script>

<div class="relative inline-block whitespace-pre-wrap break-words max-w-full">
	{#if isVisible}
		<h1
			in:fade={{ duration: 400, easing: cubicOut }}
			out:fade={{ duration: 400, easing: cubicOut }}
			class="text-xl md:text-3xl xl:text-4xl font-bold"
		>
			{displayedText}<span class="caret bg-primary" class:isTyping>|</span>
		</h1>
	{/if}
</div>

<style>
	.caret {
		display: inline-block;
		animation: blink 1.2s steps(2, start) infinite;
		color: currentColor;
	}

	.caret.isTyping {
		animation-play-state: running;
	}

	.caret:not(.isTyping) {
		animation-play-state: paused;
		opacity: 1;
	}

	@keyframes blink {
		0%,
		50% {
			opacity: 1;
		}
		51%,
		100% {
			opacity: 0;
		}
	}
</style>
