export const SITE = {
	name: 'Ebn Sina',
	title: 'Ebn Sina — Software Engineer',
	description:
		'Software engineer building thoughtful, fast, durable systems. Distributed backends, snappy frontends, and the infrastructure that holds it all up.',
	url: 'https://ebnsina.dev',
	author: 'Ebn Sina',
	email: 'ebnsina.dev@gmail.com',
	locale: 'en-US',
	twitterHandle: '@ebns1na',
	ogImage: '/og.png',
	social: {
		github: 'https://github.com/ebnsina',
		twitter: 'https://twitter.com/ebns1na',
		linkedin: 'https://linkedin.com/in/ebnsina.dev'
	},
	nav: [
		{ label: 'Writing', href: '/blog' },
		{ label: 'Notes', href: '/notes' },
		{ label: 'Directory', href: '/directory' },
		{ label: 'Projects', href: '/projects' },
		{ label: 'About', href: '/about' },
		{ label: 'Uses', href: '/uses' },
		{ label: 'Now', href: '/now' }
	]
} as const;
