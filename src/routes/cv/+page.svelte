<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { SITE } from '$lib/config';
	import { projects } from '$lib/data/projects';

	const selected = projects.filter((p) => p.featured).sort((a, b) => a.order - b.order);

	const skills: [string, string][] = [
		['Languages', 'Go, TypeScript, Rust, Swift, SQL'],
		['Backend', 'Distributed systems, REST APIs, WebSockets, job queues, multi-tenant SaaS'],
		['Data', 'PostgreSQL (row-level security), ClickHouse, Redis, S3 object storage'],
		[
			'Media & Edge',
			'ffmpeg, HLS adaptive streaming, RTMP/SRT/WHIP, MediaMTX, libvips, CDN caching, nginx/OpenResty'
		],
		['Frontend', 'SvelteKit, Svelte 5, Tailwind CSS, SwiftUI'],
		['Platform', 'Linux VPS operations, Docker, observability, CI/CD']
	];

	const bare = (url: string) => url.replace(/^https?:\/\//, '');
</script>

<Seo title="CV" description="Curriculum vitae of {SITE.name}, {SITE.jobTitle}." />

<article class="cv mx-auto max-w-[46rem] px-5 sm:px-8">
	<header>
		<h1>{SITE.name}</h1>
		<p class="role">{SITE.jobTitle}</p>
		<p class="contact">
			{SITE.email} | {SITE.phone} | Bangladesh<br />
			{bare(SITE.url)} | {bare(SITE.social.github)} | {bare(SITE.social.linkedin)}
		</p>
		<button type="button" class="btn btn-ghost print-hide" onclick={() => window.print()}>
			Save as PDF
		</button>
	</header>

	<section>
		<h2>Summary</h2>
		<p>
			Software engineer who builds complex infrastructure and developer products end to end: video
			infrastructure, CDN and edge delivery, analytics pipelines, media players, error-tracking
			tools, e-commerce and learning platforms, plus the platform engineering that keeps them fast
			and durable.
		</p>
	</section>

	<section>
		<h2>Skills</h2>
		<ul>
			{#each skills as [label, list] (label)}
				<li><strong>{label}:</strong> {list}</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>Projects</h2>
		{#each selected as p (p.slug)}
			<div class="entry">
				<h3>{p.title} | {p.year}</h3>
				<p class="meta">{p.stack.join(', ')}</p>
				<p>{p.caseStudy?.summary ?? p.description}</p>
				{#if p.caseStudy}
					<ul>
						{#each p.caseStudy.features.slice(0, 3) as f (f)}
							<li>{f}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	</section>
</article>

<style>
	/* ATS: one column, plain text, standard headings, no icons or tables. */
	.cv {
		line-height: 1.55;
	}
	h1 {
		font-size: 2rem;
		font-weight: 700;
	}
	.role {
		font-size: 1.1rem;
	}
	.contact,
	.meta {
		color: var(--muted);
		font-size: 0.9rem;
	}
	header .btn {
		margin-top: 1rem;
	}
	h2 {
		margin-top: 2rem;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid var(--rule);
		border-radius: 0;
		font-size: 1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	h3 {
		font-weight: 600;
	}
	section > p,
	section > ul,
	.entry {
		margin-top: 0.75rem;
	}
	ul {
		list-style: disc;
		padding-left: 1.25rem;
	}

	@media print {
		:global(header.site-header, footer, .print-hide, a[href='#main']) {
			display: none !important;
		}
		:global(main) {
			padding: 0 !important;
		}
		:global(body) {
			background: #fff;
			color: #000;
		}
		.cv {
			max-width: none;
			padding: 0;
			font-size: 10.5pt;
		}
		.contact,
		.meta {
			color: #333;
		}
		.entry {
			break-inside: avoid;
		}
	}
</style>
