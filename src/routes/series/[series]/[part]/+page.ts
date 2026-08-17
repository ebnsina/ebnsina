import { error } from '@sveltejs/kit';
import { getSeriesNav, getSeriesParts, getSeriesSlugs, loadSeriesPart } from '$lib/content';

export function entries() {
	return getSeriesSlugs().flatMap((series) =>
		getSeriesParts(series).map((p) => ({ series, part: p.slug }))
	);
}

export async function load({ params }) {
	const post = await loadSeriesPart(params.series, params.part);
	const nav = getSeriesNav(params.series, params.part);
	if (!post || !nav) error(404, 'Part not found');
	return { component: post.component, meta: post.meta, series: nav };
}
