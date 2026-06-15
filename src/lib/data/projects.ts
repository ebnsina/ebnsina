export type Project = {
	title: string;
	description: string;
	year: number;
	role?: string;
	stack: string[];
	url?: string;
	repo?: string;
	featured?: boolean;
	order: number;
};

export const projects: Project[] = [
	{
		title: 'Acme Platform',
		description:
			'Multi-tenant internal platform powering 40+ services. Designed the deploy pipeline, secret rotation, and the observability stack from scratch.',
		year: 2026,
		role: 'Tech lead',
		stack: ['Go', 'Postgres', 'Kubernetes', 'OpenTelemetry'],
		featured: true,
		order: 1
	},
	{
		title: "ds — a developer's swiss army CLI",
		description:
			'Open-source CLI that wraps the 20 commands every backend engineer types daily. Written in Rust, distributed via Homebrew.',
		year: 2025,
		stack: ['Rust', 'clap', 'tokio'],
		repo: 'https://github.com/ebnsina/ds',
		featured: true,
		order: 2
	},
	{
		title: 'Sidebar Search',
		description:
			'Realtime full-text search over 12M docs. Sub-50ms p99. Built on Tantivy with a custom ranking layer.',
		year: 2024,
		stack: ['Rust', 'Tantivy', 'Redis'],
		featured: true,
		order: 3
	},
	{
		title: 'Edge Transcode',
		description:
			'Adaptive video ingest + transcoding pipeline with edge caching. Cuts time-to-first-frame on cold assets by serving the right rendition close to the viewer.',
		year: 2025,
		stack: ['Go', 'ffmpeg', 'Cloudflare', 'NATS'],
		featured: false,
		order: 4
	},
	{
		title: 'glasspane',
		description:
			'A tiny Svelte component library for the translucent, depth-layered UI you see across this site. Headless, themeable, zero-runtime CSS.',
		year: 2024,
		stack: ['Svelte', 'TypeScript', 'Tailwind'],
		repo: 'https://github.com/ebnsina/glasspane',
		featured: false,
		order: 5
	}
];
