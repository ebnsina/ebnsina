<script lang="ts">
	import Hero from '$lib/three/Hero.svelte';
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import PostCard from '$lib/components/PostCard.svelte';
	import ContactCta from '$lib/components/ContactCta.svelte';
	import Typewriter from '$lib/components/Typewriter.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { projects } from '$lib/data/projects';
	import { SITE } from '$lib/config';
	import { reveal } from '$lib/actions';
	import { catFor } from '$lib/colors';

	let { data } = $props();

	const featured = projects.filter((p) => p.featured).sort((a, b) => a.order - b.order);

	const TITLES = [
		'Software Engineer',
		'Solution Architect',
		'Platform Engineer',
		'Backend Engineer',
		'Systems Designer',
		'Reliability Engineer',
		'Full-Stack Engineer'
	];

	const doing = [
		{
			k: 'Backend & distributed systems',
			v: 'Services built to survive real traffic — queues, durable execution, consensus, and the failure modes most teams only discover in production.',
			tags: ['Go', 'Rust', 'Postgres', 'Redis', 'NATS']
		},
		{
			k: 'Frontend & product',
			v: "Interfaces that don't make people wait. Accessible, fast, and considered down to the empty and loading states.",
			tags: ['TypeScript', 'Svelte', 'React', 'WebGL']
		},
		{
			k: 'Platform & reliability',
			v: 'The unglamorous layer that keeps everything else sustainable — CI/CD, observability, infra-as-code, and SLOs that actually mean something.',
			tags: ['Kubernetes', 'Terraform', 'OpenTelemetry', 'nginx']
		}
	];

	const currently = [
		'Building a video-infrastructure platform — ingest, transcoding pipelines, adaptive delivery, and the edge caching that ties it together.',
		'Going deeper on distributed systems — specifically consensus and durable execution.',
		'Working through Mastering SRE and re-reading Designing Data-Intensive Applications.',
		'Tinkering with Rust on the side — embedded and WASM.'
	];

	const toolkit = [
		{ group: 'Languages', items: ['Go', 'Rust', 'TypeScript', 'Python'] },
		{ group: 'Data', items: ['PostgreSQL', 'Redis', 'NATS', 'Kafka'] },
		{
			group: 'Infrastructure',
			items: ['Kubernetes', 'Terraform', 'nginx / OpenResty', 'Cloudflare']
		},
		{ group: 'Observability', items: ['OpenTelemetry', 'Prometheus', 'Grafana'] }
	];
</script>

<Seo />

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<!-- Hero -->
	<section
		class="relative -mx-5 mb-6 flex min-h-[54vh] items-center py-10 sm:-mx-8 sm:min-h-[82vh] sm:py-0"
	>
		<div class="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2">
			<Hero />
		</div>

		<div class="relative z-10 px-5 sm:px-8">
			<p
				class="mb-6 inline-flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.28em] text-muted"
			>
				<span class="corner-round inline-block size-1.5 rounded-full bg-accent"></span>
				<Typewriter words={TITLES} />
			</p>
			<h1
				class="mb-7 max-w-xl font-display text-[2.2rem] font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl"
			>
				Building <span class="text-accent">fast, durable</span> systems &mdash; and the craft behind them.
			</h1>
			<p class="max-w-xl text-lg leading-[1.65] text-muted sm:text-xl">
				I'm {SITE.name}. I design and ship product-grade software: distributed backends, snappy
				frontends, and the infrastructure that makes both possible. Currently focused on
				<span class="text-fg">platform engineering</span>.
			</p>
			<div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
				<a
					href="/projects"
					class="rounded-2xl bg-fg px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-accent"
					>See my work</a
				>
				<a
					href="/about"
					class="group inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-fg"
				>
					More about me
					<span class="transition-transform group-hover:translate-x-0.5">→</span>
				</a>
			</div>
		</div>
	</section>

	<!-- Intro -->
	<section class="border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] py-16" use:reveal>
		<p class="mb-5 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">Intro</p>
		<div class="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
			<h2 class="font-display text-2xl font-bold leading-[1.2] tracking-[-0.02em] sm:text-3xl">
				Engineer at the intersection of infrastructure and product.
			</h2>
			<div class="max-w-2xl space-y-4 text-[1.05rem] leading-[1.75] text-muted">
				<p>
					I've spent the last several years shipping software that real people rely on — backend
					services, developer tools, and the occasional deeply unfashionable internal CLI. Right now
					I'm deep in <span class="text-fg">video infrastructure</span>: ingest pipelines,
					transcoding at scale, and the edge caching that gets frames to viewers fast.
				</p>
				<p>
					I care about correctness, taste, and shipping. I write here mostly to think out loud —
					post-mortems, patterns that held up under load, and opinions I'd defend with diagrams.
				</p>
			</div>
		</div>
	</section>

	<!-- What I do -->
	<section class="border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] py-16" use:reveal>
		<p class="mb-8 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">What I do</p>
		<div class="grid gap-4 lg:grid-cols-3">
			{#each doing as d (d.k)}
				<div class="glass-card flex h-full flex-col p-6" style="--cc: {catFor(d.k)}">
					<h3 class="font-display text-lg font-bold tracking-tight">{d.k}</h3>
					<p class="mt-2 text-sm leading-[1.6] text-muted">{d.v}</p>
					<div class="mt-auto flex flex-wrap gap-1.5 pt-5">
						{#each d.tags as t (t)}
							<span class="tag-pill">{t}</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Selected work -->
	<section class="border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] py-16" use:reveal>
		<div class="mb-6 flex items-end justify-between gap-6">
			<div>
				<p class="mb-2 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">
					Selected work
				</p>
				<h2 class="font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
					Things I've shipped
				</h2>
			</div>
			<a href="/projects" class="shrink-0 text-sm text-muted transition-colors hover:text-fg"
				>All projects →</a
			>
		</div>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each featured as project (project.title)}
				<div class="h-full"><ProjectCard {project} /></div>
			{/each}
		</div>
	</section>

	<!-- Recent writing -->
	{#if data.posts.length}
		<section
			class="border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] py-16"
			use:reveal
		>
			<div class="mb-6 flex items-end justify-between gap-6">
				<div>
					<p class="mb-2 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">Writing</p>
					<h2 class="font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
						Recent notes
					</h2>
				</div>
				<a href="/blog" class="shrink-0 text-sm text-muted transition-colors hover:text-fg"
					>All writing →</a
				>
			</div>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.posts as post (post.slug)}
					<div class="h-full">
						<PostCard
							href={`/blog/${post.slug}`}
							title={post.meta.title}
							description={post.meta.description}
							slug={post.slug}
						/>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Currently + Toolkit -->
	<section
		class="grid gap-12 border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] py-16 lg:grid-cols-2"
		use:reveal
	>
		<div>
			<div class="mb-6 flex items-baseline justify-between">
				<p class="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">Currently</p>
				<a href="/now" class="text-sm text-muted transition-colors hover:text-fg">Now →</a>
			</div>
			<ul class="space-y-4">
				{#each currently as item (item)}
					<li class="flex gap-3 text-[0.97rem] leading-[1.6] text-muted">
						<span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>
						<span>{item}</span>
					</li>
				{/each}
			</ul>
		</div>

		<div>
			<div class="mb-6 flex items-baseline justify-between">
				<p class="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">Toolkit</p>
				<a href="/uses" class="text-sm text-muted transition-colors hover:text-fg">Uses →</a>
			</div>
			<div class="space-y-4">
				{#each toolkit as t (t.group)}
					<div class="grid grid-cols-[7rem_1fr] gap-3">
						<span class="pt-0.5 text-sm font-medium">{t.group}</span>
						<div class="flex flex-wrap gap-1.5">
							{#each t.items as item (item)}
								<span class="tag-pill">{item}</span>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<ContactCta />
</div>
