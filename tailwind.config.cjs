/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				sans: 'Google Sans',
				'sans-heading': 'Darker Grotesque'
			},
			colors: {
				primary: '#59F9BE',
				secondary: '#A68BFF',
				tertiary: '#D4FE56'
			},
			zIndex: {
				'-1': '-1'
			},
			backgroundPosition: {
				'right-center': 'right center'
			},
			animation: {
				'move-slow': 'moveSlow 3s linear infinite'
			},
			keyframes: {
				moveSlow: {
					'0%, 100%': { bottom: 0 },
					'50%': { bottom: '100px' }
				}
			}
		}
	},
	plugins: [require('@tailwindcss/typography')]
};
