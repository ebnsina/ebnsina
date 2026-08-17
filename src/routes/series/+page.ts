import { getSeriesParts } from '$lib/content';
import { SERIES } from '$lib/data/series';

export function load() {
	// Only surface series that actually have parts on disk — an entry added to
	// `SERIES` before its content lands shouldn't render an empty card.
	const series = SERIES.map((meta) => ({ meta, parts: getSeriesParts(meta.slug) })).filter(
		(s) => s.parts.length > 0
	);
	return { series };
}
