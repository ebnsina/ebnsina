<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
</script>

<Seo
	title="About"
	description="A bit about Ebn Sina — engineer, builder, occasional writer."
	profilePage
/>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow="About"
		title="Ebn Sina"
		description="Software engineer. Building things that hold up — over coffee, mostly."
	/>

	<div class="prose-editorial mx-auto max-w-[44rem]">
		<p>
			<strong>Ebn Sina</strong> is a software engineer who builds complex infrastructure and developer
			products end to end — video infrastructure, CDN and edge delivery, analytics pipelines, media players,
			error-tracking tools, e-commerce, and learning platforms — plus the platform engineering that keeps
			them fast and durable.
		</p>
		<p>
			I've spent the last several years shipping software that real people rely on — backend
			services, developer tools, and the occasional deeply unfashionable internal CLI. I care about
			correctness, taste, and shipping.
		</p>
		<p>
			My work sits at the intersection of infrastructure and product: distributed backends built to
			survive real traffic, frontends that don't make users wait, and the platform engineering layer
			that makes both sustainable. I've built the hard, complex pieces across a lot of domains —
			video infrastructure (ingest, transcoding at scale, edge caching), CDN and edge delivery,
			analytics pipelines, media players, error-tracking and observability tooling, e-commerce
			platforms, and learning systems. The common thread is systems with real load and real users
			where the details matter.
		</p>

		<h2>Background</h2>
		<p>
			Started with web development, drifted toward systems, ended up somewhere in between — which
			turns out to be where most of the interesting problems live. I've worked across the stack long
			enough to have strong opinions about most layers of it, and enough scars to know which
			opinions to hold loosely.
		</p>
		<p>
			Tools I reach for most: Go, Rust, TypeScript, PostgreSQL, Redis, nginx/OpenResty. Currently
			learning where Rust fits best and how far you can push edge compute before it becomes the
			wrong abstraction.
		</p>

		<h2>Beyond the terminal</h2>
		<p>
			Coffee brewed carefully, long walks with no destination, occasional bouldering. I read more
			than I finish and take notes in the margins.
		</p>
	</div>
</div>
