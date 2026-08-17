import { error } from '@sveltejs/kit';
import { getSeriesParts, getSeriesSlugs } from '$lib/content';
import { seriesMeta } from '$lib/data/series';

export function entries() {
	return getSeriesSlugs().map((series) => ({ series }));
}

export function load({ params }) {
	const meta = seriesMeta(params.series);
	const parts = getSeriesParts(params.series);
	if (!meta || !parts.length) error(404, 'Series not found');
	return { meta, parts };
}
