import { getBlogPosts, getAllTags, getSeriesParts } from '$lib/content';
import { SERIES } from '$lib/data/series';

export function load() {
	// Series parts aren't listed here — eight of them would bury the standalone
	// writing. Each series collapses to one card that links into /series.
	const series = SERIES.map((meta) => ({ meta, count: getSeriesParts(meta.slug).length })).filter(
		(s) => s.count > 0
	);
	return { posts: getBlogPosts(), tags: getAllTags(), series };
}
