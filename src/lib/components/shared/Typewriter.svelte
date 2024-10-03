<script lang="ts">
	import { onMount } from 'svelte';

	export let sentences: string[];
	let displayedText = '';
	let index = 0;
	const typingSpeed = 300;
	const sentenceDelay = 1000;

	const typeSentence = () => {
		const words = sentences[index].split(' ');
		let wordIndex = 0;

		const typeWord = () => {
			if (wordIndex < words.length) {
				displayedText += words[wordIndex] + ' ';
				wordIndex++;
				setTimeout(typeWord, typingSpeed);
			} else {
				setTimeout(() => {
					index = (index + 1) % sentences.length;
					displayedText = '';
					typeSentence();
				}, sentenceDelay);
			}
		};

		typeWord();
	};

	onMount(() => {
		typeSentence();
	});
</script>

<div class="relative inline-block">
	<p class="text-lg font-medium">{displayedText}</p>
</div>

<style>
	p {
		transition: opacity 0.5s ease;
	}
</style>
