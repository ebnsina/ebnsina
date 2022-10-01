import adapter from '@sveltejs/adapter-auto';
import sveltePreprocess from 'svelte-preprocess';
import { mdsvex } from 'mdsvex';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.md'],

	preprocess: [sveltePreprocess({ postcss: true }), mdsvex({ extensions: ['.md'] })],

	kit: {
		adapter: adapter()
	}
};

export default config;
