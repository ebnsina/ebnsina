<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { SITE } from '$lib/config';
	import { projects } from '$lib/data/projects';

	const PDF = '/ebn-sina-cv.pdf';

	const selected = projects
		.filter((p) => p.featured)
		.sort((a, b) => a.order - b.order)
		.slice(0, 4);

	const skills: [string, string][] = [
		['Languages', 'Go, Rust, C++, TypeScript, SQL, Swift'],
		[
			'Backend & distributed systems',
			'gRPC, REST, GraphQL, event-driven architecture, job queues, multi-tenant SaaS, leasing and failure recovery'
		],
		['Data', 'PostgreSQL (row-level security, partitioning), ClickHouse, Kafka, Redis, S3'],
		['Video & edge', 'libav/ffmpeg, CMAF, DASH, HLS, RTMP, SRT, DRM, CDN, nginx/OpenResty'],
		['Frontend', 'SvelteKit, Svelte 5, React, React Native, Tailwind CSS'],
		['Platform', 'Linux, Docker, CI/CD, observability, self-hosted infrastructure']
	];

	type Job = { role: string; org: string; place: string; dates: string; points: string[] };

	const jobs: Job[] = [
		{
			role: 'Vice President of Engineering',
			org: 'Tenbyte',
			place: 'Dhaka, Bangladesh',
			dates: 'Nov 2025 – Present',
			points: [
				'Designed and largely wrote four production systems: a distributed transcoder, a playback analytics platform, an AI voice-calling platform and a player SDK.',
				'Distributed transcoder: Go control plane on PostgreSQL orchestrating a fleet of C++/libav workers over gRPC; chunked parallel encoding packaged as CMAF for DASH and HLS (H.264, HEVC, AV1).',
				'Capacity-aware scheduling with leases, generation-guarded compare-and-swap and per-tenant fair share, so a worker lost mid-encode is reclaimed and rescheduled automatically.',
				'Analytics: Kafka ingest into ClickHouse with materialized aggregates, monthly partitions and TTL retention, plus a tracking SDK published on npm.',
				'AI calling platform: Go services on partitioned PostgreSQL, Postgres-backed job queue, Redis semaphores, envelope-encrypted customer data, HMAC-signed keys and webhooks with outbox retry.',
				'Multi-tenancy with row-level security, per-tenant quotas and billing-grade metering; media parsing sandboxed with no credentials or network.'
			]
		},
		{
			role: 'Senior Software Engineer',
			org: 'Tenbyte',
			place: 'Dhaka, Bangladesh',
			dates: 'Sep 2025 – Nov 2025',
			points: []
		},
		{
			role: 'Software Engineer',
			org: 'Amharc Tech',
			place: 'Dublin, Ireland (remote)',
			dates: 'Dec 2021 – Aug 2025',
			points: [
				'Built features across a field-service management platform used by contractors across Ireland and the UK: jobs, scheduling, stock, billing and CRM.',
				'Built the internal CRM, the reporting dashboards and e-commerce for parts and services, tied into the job-scheduling records.',
				'Integrated Stripe subscription billing: invoicing, failed-payment handling and plan changes.',
				'Contributed offline handling and sync to the iOS and Android apps used on site; GDPR-compliant, ISO 27001-certified infrastructure.'
			]
		},
		{
			role: 'Web Developer',
			org: 'Planet Nine',
			place: 'Amsterdam, Netherlands (remote)',
			dates: 'Jun 2019 – Nov 2021',
			points: [
				'Built data-driven web components under strict file-size and performance budgets, rendering identically across browsers and platforms.'
			]
		},
		{
			role: 'Instructor',
			org: "Let's Learn Coding",
			place: 'Dhaka, Bangladesh',
			dates: 'Nov 2017 – May 2019',
			points: [
				'Taught web development to over 2,000 students: JavaScript, React, Node.js and Python; designed the curriculum and built the course platform.'
			]
		}
	];

	const bare = (url: string) => url.replace(/^https?:\/\//, '');
</script>

<Seo
	title="CV"
	description="Curriculum vitae of {SITE.name}: distributed backend systems, video infrastructure and data pipelines."
/>

<article class="cv mx-auto max-w-[46rem] px-5 sm:px-8">
	<header>
		<h1>{SITE.name}</h1>
		<p class="role">Senior Software Engineer · Distributed Systems</p>
		<p class="contact">
			{SITE.email} | {SITE.phone} | Dhaka, Bangladesh (UTC+6)<br />
			{bare(SITE.url)} | {bare(SITE.social.github)} | {bare(SITE.social.linkedin)}
		</p>
		<a class="btn btn-solid print-hide" href={PDF} download>Download PDF</a>
	</header>

	<section>
		<h2>Summary</h2>
		<p>
			Software engineer with 10 years of experience (since 2016) building distributed backend
			systems: video infrastructure, event pipelines, deployment tooling and the products on top of
			them. Designs and runs production systems end to end in Go, Rust and C++, with TypeScript,
			Svelte and React front ends.
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
		<h2>Experience</h2>
		{#each jobs as job (job.role + job.dates)}
			<div class="entry">
				<h3>{job.role}, {job.org}</h3>
				<p class="meta">{job.place} | {job.dates}</p>
				{#if job.points.length}
					<ul>
						{#each job.points as point (point)}
							<li>{point}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	</section>

	<section>
		<h2>Projects</h2>
		{#each selected as p (p.slug)}
			<div class="entry">
				<h3>{p.title}</h3>
				<p class="meta">{p.stack.join(', ')}</p>
				<p>{p.description}</p>
			</div>
		{/each}
	</section>

	<section>
		<h2>Education</h2>
		<p>University of Dhaka</p>
	</section>
</article>

<style>
	/* ATS: one column, plain text, standard headings, no icons or tables. */
	.cv {
		line-height: 1.55;
	}
	h1 {
		font-size: var(--step-4);
		font-weight: 700;
	}
	.role {
		font-size: var(--step-1);
	}
	.contact,
	.meta {
		color: var(--muted);
		font-size: var(--step--1);
	}
	header .btn {
		margin-top: 1rem;
	}
	h2 {
		margin-top: 2rem;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid var(--rule);
		border-radius: 0;
		font-size: var(--step-0);
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
		:global(header.site-header),
		:global(footer),
		:global(.print-hide),
		:global(a[href='#main']) {
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
			font-size: 10pt;
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
