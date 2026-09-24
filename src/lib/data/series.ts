/**
 * Series are multi-part works that read in order — a track through one subject,
 * not a stream of standalone posts. They live in `src/content/series/<slug>/`
 * and are served from `/series/<slug>/<part>`; `/blog` keeps the standalone
 * writing and links out to each series with a single card.
 *
 * A new series needs its markdown directory, an entry here, and a manifest
 * rebuild (`node scripts/build-manifest.mjs`) — nothing else.
 */
export type SeriesMeta = {
	/** Directory name under `src/content/series/`, and the URL segment. */
	slug: string;
	/** Display name, as written in each part's `series` frontmatter. */
	title: string;
	/** One line of English chrome — the site outside /notes is English. */
	tagline: string;
	/** Bangla blurb shown on the series page, above the parts. */
	description: string;
	status: 'complete' | 'ongoing';
	/** Total parts the series is planned to have, when more are still drafts.
	 *  Drives "3 of 17 parts" so an in-progress series doesn't read as finished. */
	plannedParts?: number;
};

export const SERIES: SeriesMeta[] = [
	{
		slug: 'video-mastery',
		title: 'ভিডিও মাস্টারি',
		tagline:
			'Eight parts on how video actually works: codecs, transcoding, packaging, delivery, and the player.',
		description:
			'পিক্সেল থেকে প্লেয়ার পর্যন্ত পুরো ভিডিও স্ট্যাক — কোডেক আর রেট কন্ট্রোল, নিজের হাতে ট্রান্সকোডার, প্রোডাকশন পাইপলাইন, Netflix/Vimeo/Mux কীভাবে করে, লাইভ স্ট্রিমিং, আর প্লেয়ারের ভেতরের ABR। ধাপে ধাপে, পর্ব ১ থেকে পড়ার জন্য।',
		status: 'complete'
	},
	{
		slug: 'remote-job-prep',
		title: 'রিমোট জব প্রিপারেশন',
		tagline:
			'A complete guide to landing a senior remote role from Bangladesh, aimed first at the Gulf, Turkey and Europe, with the US as a later step: positioning, outreach, the interview loop, the contract, and the first 90 days.',
		description:
			'বাংলাদেশে বসে সিনিয়র রিমোট রোল পাওয়ার পুরো পথটা — অগ্রাধিকার উপসাগরীয় দেশ, তুরস্ক আর ইউরোপে, US পরের ধাপ হিসেবে। হায়ারিং ফানেল আসলে কোথায় তোমাকে বাদ দেয়, "সিনিয়র" শব্দটা ওদের কাছে কী মানে, রেজিউমে আর প্রোফাইল, রোল খোঁজা, আউটরিচ, ইন্টারভিউ লুপ, অফার-কন্ট্রাক্ট-পেমেন্ট, আর অ্যাসিঙ্ক টিমে প্রথম ৯০ দিন। ধাপে ধাপে, পর্ব ১ থেকে।',
		status: 'complete'
	},
	{
		slug: 'freelance-zero-to-pro',
		title: 'ফ্রিল্যান্সিং: জিরো থেকে প্রো',
		tagline:
			'A complete guide to Fiverr and Upwork from zero: how the marketplaces actually rank you, gigs and proposals that convert, the first order, and the climb to Level 2 and Top Rated.',
		description:
			'শূন্য থেকে শুরু করে Fiverr Level 2 আর Upwork Top Rated পর্যন্ত পুরো পথটা — মার্কেটপ্লেসের র‍্যাংকিং ভেতর থেকে কেমন, নিশ বাছাই, প্রোফাইল ও গিগ, প্রপোজাল, প্রথম অর্ডার, ক্লায়েন্ট সামলানো, রিভিউ ও মেট্রিক, দাম বাড়ানো, পেমেন্ট ও ট্যাক্স, আর প্ল্যাটফর্ম-নির্ভরতার ঝুঁকি।',
		status: 'complete'
	}
];

/** "8 parts" / "1 of 17 parts" — published count first, because that is what a
 *  reader can actually read today. */
export function partsLabel(published: number, planned?: number): string {
	if (planned && planned > published) return `${published} of ${planned} parts`;
	return published === 1 ? '1 part' : `${published} parts`;
}

export const seriesMeta = (slug: string): SeriesMeta | undefined =>
	SERIES.find((s) => s.slug === slug);

/** The series a display title belongs to (parts carry the title, not the slug). */
export const seriesByTitle = (title: string): SeriesMeta | undefined =>
	SERIES.find((s) => s.title === title);

/** Part titles read "<series> — <part>", so the shared prefix is redundant
 *  wherever the series name is already on screen. Falls back to the full title
 *  if a part doesn't follow that shape. */
export function partLabel(title: string): string {
	const i = title.indexOf('—');
	return i > -1 ? title.slice(i + 1).trim() : title;
}

/**
 * Old `/blog/<slug>` URLs for parts that have moved under `/series`. These were
 * published and linked, so they 308 rather than 404 — see
 * `src/routes/blog/[slug]/+page.ts`. Keep entries here for as long as the old
 * links are plausibly still out there.
 */
export const MOVED_POSTS: Record<string, string> = {
	'video-mastery-1-video-and-player': '/series/video-mastery/01-video-and-player',
	'video-mastery-2-build-a-transcoder': '/series/video-mastery/02-build-a-transcoder',
	'video-mastery-3-production-transcoder': '/series/video-mastery/03-production-transcoder',
	'video-mastery-4-netflix': '/series/video-mastery/04-netflix',
	'video-mastery-5-vimeo': '/series/video-mastery/05-vimeo',
	'video-mastery-6-mux': '/series/video-mastery/06-mux',
	'video-mastery-7-live': '/series/video-mastery/07-live',
	'video-mastery-8-player': '/series/video-mastery/08-player'
};
