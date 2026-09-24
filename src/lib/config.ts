export const SITE = {
	name: 'Ebn Sina',
	title: 'Ebn Sina | Software Engineer',
	description:
		'Software engineer building complex infrastructure and developer products: video, CDN, analytics, media players, error tracking, e-commerce, and learning platforms. Thoughtful, fast, and durable.',
	// One-line factual identity for structured data / LLM extraction.
	jobTitle: 'Software Engineer',
	bio: 'Ebn Sina is a software engineer who builds complex infrastructure and developer products end to end: video infrastructure, CDN and edge delivery, analytics pipelines, media players, error-tracking tools, e-commerce platforms, and learning platforms, plus the platform engineering that keeps them fast and durable.',
	knowsAbout: [
		'Distributed systems',
		'Backend engineering',
		'Video infrastructure',
		'Content delivery networks (CDN)',
		'Edge computing',
		'Analytics pipelines',
		'Media players',
		'Error tracking and observability',
		'E-commerce platforms',
		'Learning management systems (LMS)',
		'Platform engineering',
		'Go',
		'Rust',
		'TypeScript',
		'PostgreSQL'
	],
	url: 'https://ebnsina.dev',
	author: 'Ebn Sina',
	email: 'ebnsina.dev@gmail.com',
	// E.164, digits only after the plus — reused for tel: and wa.me links
	phone: '+8801841252123',
	locale: 'en-US',
	twitterHandle: '@ebns1na',
	ogImage: '/og.png',
	social: {
		github: 'https://github.com/ebnsina',
		twitter: 'https://twitter.com/ebns1na',
		linkedin: 'https://linkedin.com/in/ebnsina.dev'
	},
	// Header nav, kept to three. Everything else that is browsable — Series,
	// Notes, Directory, Uses, Now, RSS — is reachable from the footer sitemap
	// (and from ⌘K), so the header stays a masthead rather than a menu.
	nav: [
		{ label: 'Writing', href: '/blog' },
		{ label: 'Projects', href: '/projects' },
		{ label: 'About', href: '/about' }
	]
} as const;
