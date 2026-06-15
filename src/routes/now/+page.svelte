<script lang="ts">
	import PageBanner from '$lib/components/PageBanner.svelte';
	const updated = new Date();
	const label = updated.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
</script>

<svelte:head>
	<title>Now — Ebn Sina</title>
	<meta name="description" content="What I'm focused on right now." />
</svelte:head>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow="Now · Updated {label}"
		title="What I'm doing now"
		description="A snapshot of what I'm building, learning, and thinking about right now."
		shape="ring"
	/>

<div class="prose-editorial max-w-[44rem]">
	<h2>Work</h2>
	<ul>
		<li>
			Building a <strong>video infrastructure platform</strong> — ingest, transcoding pipelines,
			adaptive delivery, and the edge caching layer that ties it together.
		</li>
		<li>Going deeper on distributed systems — specifically consensus and durable execution.</li>
	</ul>
	<h2>Learning</h2>
	<ul>
		<li>
			Working through <em>Mastering SRE</em> — SLOs that mean something, toil reduction that sticks,
			and incident response that doesn't rely on heroics.
		</li>
		<li>Reading <em>Designing Data-Intensive Applications</em> (again).</li>
		<li>Tinkering with Rust on the side — embedded + WASM.</li>
	</ul>
	<h2>Life</h2>
	<ul>
		<li>Coffee, long walks, occasional bouldering.</li>
	</ul>
</div>
</div>
