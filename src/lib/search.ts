/**
 * The ⌘K palette's engine — index loading plus ranking. Deliberately framework-
 * free so the component stays a view.
 *
 * Speed comes from doing the expensive work at build time, not per keystroke:
 * `search-index.json` ships each row with a pre-lowercased, word-deduped
 * haystack (title + subtitle + topics + every `##`/`###` heading), so a query is
 * a few `indexOf` calls over ~530 short strings — microseconds, no debounce, no
 * search library. The index is fetched lazily on first intent (see `preload`),
 * never on initial page load.
 */
import { getNoteCategories } from '$lib/content';
import { categoryMeta } from '$lib/data/notes-labels';
import { SERIES, seriesMeta } from '$lib/data/series';

export type Kind = 'chapter' | 'post' | 'track' | 'series' | 'project' | 'page';

export type Hit = {
	url: string;
	title: string;
	subtitle: string;
	kind: Kind;
	/** Where the hit lives — the track name for a chapter, the section otherwise. */
	context: string;
};

/** A hit plus the folded strings it is matched against. */
type Row = Hit & { t: string; s: string; h: string };

/** Build-time row shape: [kind, group, slug, title, subtitle, haystack].
 *  `group` is the track for a chapter and the series slug for a series part;
 *  it is empty for a standalone post. */
type RawRow = [0 | 1, string, string, string, string, string];

const KIND_LABEL: Record<Kind, string> = {
	chapter: 'Notes',
	post: 'Writing',
	track: 'Track',
	series: 'Series',
	project: 'Project',
	page: 'Page'
};

export const kindLabel = (kind: Kind) => KIND_LABEL[kind];

/** Case/width-folded form. Bangla has no case, but NFC matters: the same word
 *  typed with decomposed matras must match the composed form in the index. */
const fold = (s: string) => s.normalize('NFC').toLowerCase();

const row = (hit: Hit, haystack: string): Row => ({
	...hit,
	t: fold(hit.title),
	s: fold(hit.subtitle),
	h: haystack
});

/** Tracks, projects and top-level pages are cheap to derive at runtime from
 *  modules the app already has, so they stay out of the shipped index — which
 *  also means the Bangla track labels live in exactly one place. */
async function localRows(): Promise<Row[]> {
	const { projects } = await import('$lib/data/projects');

	const tracks = getNoteCategories().flatMap((category) => {
		const meta = categoryMeta(category);
		if (!meta) return [];
		const hit: Hit = {
			url: `/notes/${category}`,
			title: meta.label,
			subtitle: meta.description,
			kind: 'track',
			context: meta.group
		};
		return [row(hit, fold(`${meta.label} ${meta.description} ${category.replace(/-/g, ' ')}`))];
	});

	// Series landings are a handful of static entries — same reasoning as tracks.
	const seriesRows = SERIES.map((s) => {
		const hit: Hit = {
			url: `/series/${s.slug}`,
			title: s.title,
			subtitle: s.tagline,
			kind: 'series',
			context: 'Series'
		};
		return row(hit, fold(`${s.title} ${s.tagline} ${s.slug.replace(/-/g, ' ')}`));
	});

	const projectRows = projects.map((p) => {
		const hit: Hit = {
			url: `/projects/${p.slug}`,
			title: p.title,
			subtitle: p.description,
			kind: 'project',
			context: String(p.year)
		};
		return row(hit, fold(`${p.title} ${p.description} ${p.stack.join(' ')} ${p.role ?? ''}`));
	});

	const pages: Hit[] = [
		{
			url: '/notes',
			title: 'Notes',
			subtitle: 'নোটস — the full learning path',
			kind: 'page',
			context: 'Read'
		},
		{ url: '/blog', title: 'Writing', subtitle: 'Standalone posts', kind: 'page', context: 'Read' },
		{
			url: '/series',
			title: 'Series',
			subtitle: 'Multi-part writing, read in order',
			kind: 'page',
			context: 'Read'
		},
		{
			url: '/directory',
			title: 'Track directory',
			subtitle: 'Every notes track, grouped by area',
			kind: 'page',
			context: 'Read'
		},
		{
			url: '/projects',
			title: 'Projects',
			subtitle: 'Things I have built',
			kind: 'page',
			context: 'Read'
		},
		{
			url: '/about',
			title: 'About',
			subtitle: 'Who I am and what I work on',
			kind: 'page',
			context: 'Me'
		},
		{
			url: '/uses',
			title: 'Uses',
			subtitle: 'Hardware, editor, and daily tools',
			kind: 'page',
			context: 'Me'
		},
		{
			url: '/now',
			title: 'Now',
			subtitle: 'What I am focused on at the moment',
			kind: 'page',
			context: 'Me'
		}
	];

	return [
		...tracks,
		...seriesRows,
		...projectRows,
		...pages.map((p) => row(p, fold(`${p.title} ${p.subtitle} ${p.url.slice(1)}`)))
	];
}

let rowsPromise: Promise<Row[]> | null = null;

/** Load (once) and prepare every searchable row. */
export function loadRows(): Promise<Row[]> {
	rowsPromise ??= (async () => {
		const [{ default: raw }, local] = await Promise.all([
			import('$lib/search-index.json'),
			localRows()
		]);

		const indexed = (raw as RawRow[]).map(([kind, group, slug, title, subtitle, haystack]) => {
			// A prose row with a group is a series part; without one it's a post.
			const url =
				kind === 0
					? `/notes/${group}/${slug}`
					: group
						? `/series/${group}/${slug}`
						: `/blog/${slug}`;
			const context =
				kind === 0
					? (categoryMeta(group)?.label ?? group)
					: group
						? (seriesMeta(group)?.title ?? 'Series')
						: 'Writing';
			return row(
				{ url, title, subtitle, kind: kind === 0 ? 'chapter' : 'post', context },
				haystack
			);
		});

		return [...local, ...indexed];
	})();
	return rowsPromise;
}

/** Warm the index chunk before it is needed (hover/focus of the trigger, or the
 *  moment ⌘/Ctrl goes down) so opening the palette never waits on a fetch. */
export const preload = () => void loadRows();

/** A match at a word boundary is worth far more than one mid-word: "cache"
 *  inside "apache" tells the reader nothing. */
function fieldScore(hay: string, token: string, atStart: number, atWord: number, inside: number) {
	const i = hay.indexOf(token);
	if (i < 0) return 0;
	if (i === 0) return atStart;
	return /[\p{L}\p{N}]/u.test(hay[i - 1]) ? inside : atWord;
}

/**
 * Rank rows against a query. Every whitespace-separated token must appear
 * somewhere in a row (AND), which keeps multi-word queries tight; the score
 * then favours title hits over subtitle hits over deep hits in the headings.
 */
export function search(query: string, rows: Row[], limit = 12): Hit[] {
	const q = fold(query).trim();
	if (!q) return [];
	const tokens = q.split(/\s+/);

	const scored: Array<{ row: Row; score: number }> = [];

	for (const r of rows) {
		let score = 0;
		let matched = true;

		for (const token of tokens) {
			const hit =
				fieldScore(r.t, token, 120, 90, 55) ||
				fieldScore(r.s, token, 34, 28, 18) ||
				fieldScore(r.h, token, 16, 14, 8);
			if (!hit) {
				matched = false;
				break;
			}
			score += hit;
		}
		if (!matched) continue;

		// The whole query as one phrase in the title is the strongest signal there
		// is — it is what "search by post name" actually means.
		if (tokens.length > 1 && r.t.includes(q)) score += 90;
		// Landmarks first: a track or a page outranks one chapter that mentions it.
		if (r.kind === 'track' || r.kind === 'series') score += 30;
		else if (r.kind === 'page' || r.kind === 'project') score += 20;
		// Among equals, the more specific (shorter) title is the better answer.
		score -= Math.min(r.t.length, 60) / 60;

		scored.push({ row: r, score });
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit).map(({ row: r }) => ({
		url: r.url,
		title: r.title,
		subtitle: r.subtitle,
		kind: r.kind,
		context: r.context
	}));
}
