/**
 * Deterministic job-post reader.
 *
 * No model here: a job post is a short, highly conventional document, and the
 * things that actually decide a proposal's fate — the screening instruction,
 * the explicit questions, the stated must-haves — are findable with structure
 * and vocabulary alone.
 *
 * The screening instruction is the highest-value catch. Clients bury "start
 * your reply with the word 'banana'" in the middle of a post precisely to bin
 * anyone who skimmed, and missing it is an instant rejection no amount of good
 * writing recovers from.
 */

export type Extraction = {
	/** "Start your proposal with…" style filters. Missing one is fatal. */
	screeners: string[];
	/** Questions the client explicitly asked. */
	questions: string[];
	/** Lines that read as hard requirements. */
	requirements: string[];
	/** Technology and tool names found in the post. */
	keywords: string[];
	/** Budget, rate and engagement-type signals, verbatim. */
	budget: string[];
	/** Duration and deadline signals, verbatim. */
	timeline: string[];
	/** Red flags worth seeing before you spend a Connect. */
	warnings: string[];
};

const lines = (text: string) =>
	text
		.split(/\r?\n|(?<=[.!?])\s{2,}/)
		.map((l) => l.replace(/^[\s•*\-–—▪]+/, '').trim())
		.filter(Boolean);

const SCREENER_CUES = [
	'start your proposal with',
	'begin your proposal with',
	'start your application with',
	'include the word',
	'use the word',
	'type the word',
	'reply with the word',
	'first word of your',
	'to show you read',
	'to prove you read',
	'so i know you read',
	'answer the following',
	'in your first sentence',
	'mention the word'
];

const REQUIREMENT_CUES = [
	'must have',
	'must be',
	'required',
	'requirement',
	'you should have',
	'you will need',
	'looking for someone who',
	'experience with',
	'experience in',
	'proficient in',
	'familiar with',
	'at least',
	'minimum of',
	'years of experience',
	'native',
	'fluent'
];

const BUDGET_CUES = [
	'budget',
	'hourly',
	'per hour',
	'fixed price',
	'fixed-price',
	'rate',
	'pay',
	'salary',
	'compensation'
];

const TIMELINE_CUES = [
	'deadline',
	'asap',
	'urgent',
	'by end of',
	'within',
	'timeline',
	'duration',
	'ongoing',
	'long term',
	'long-term',
	'part time',
	'part-time',
	'full time',
	'full-time'
];

/** Phrases that reliably predict a bad engagement. Deliberately short — a long
 *  list turns into noise and the reader stops reading it. */
const WARNING_CUES: { cue: string; why: string }[] = [
	{ cue: 'unpaid test', why: 'বিনা পারিশ্রমিকে টেস্ট চাওয়া হচ্ছে।' },
	{ cue: 'free sample', why: 'বিনা পারিশ্রমিকে নমুনা চাওয়া হচ্ছে।' },
	{ cue: 'free trial task', why: 'বিনা পারিশ্রমিকে কাজ চাওয়া হচ্ছে।' },
	{
		cue: 'long term potential',
		why: '"ভবিষ্যতে অনেক কাজ" দিয়ে কম দাম যুক্তিসঙ্গত করার চেষ্টা হতে পারে।'
	},
	{
		cue: 'long-term potential',
		why: '"ভবিষ্যতে অনেক কাজ" দিয়ে কম দাম যুক্তিসঙ্গত করার চেষ্টা হতে পারে।'
	},
	{ cue: 'rockstar', why: 'অস্পষ্ট প্রত্যাশার লক্ষণ।' },
	{ cue: 'ninja', why: 'অস্পষ্ট প্রত্যাশার লক্ষণ।' },
	{
		cue: 'whatsapp',
		why: 'প্ল্যাটফর্মের বাইরে যোগাযোগের অনুরোধ — ToS ভাঙলে অ্যাকাউন্ট যেতে পারে।'
	},
	{
		cue: 'telegram',
		why: 'প্ল্যাটফর্মের বাইরে যোগাযোগের অনুরোধ — ToS ভাঙলে অ্যাকাউন্ট যেতে পারে।'
	},
	{
		cue: 'contact me directly',
		why: 'প্ল্যাটফর্মের বাইরে যোগাযোগের অনুরোধ — ToS ভাঙলে অ্যাকাউন্ট যেতে পারে।'
	},
	{ cue: 'no agencies', why: 'তুমি এজেন্সির হয়ে বিড করলে এটা তোমার জন্য না।' }
];

/** Tech vocabulary. Kept small and high-signal; anything capitalised and
 *  unusual is picked up separately by `looksLikeTech`. */
const TECH = [
	'javascript',
	'typescript',
	'react',
	'vue',
	'svelte',
	'angular',
	'node',
	'next.js',
	'nuxt',
	'python',
	'django',
	'flask',
	'fastapi',
	'php',
	'laravel',
	'wordpress',
	'shopify',
	'webflow',
	'go',
	'golang',
	'rust',
	'java',
	'kotlin',
	'swift',
	'flutter',
	'react native',
	'ruby',
	'rails',
	'c#',
	'.net',
	'postgres',
	'postgresql',
	'mysql',
	'mongodb',
	'redis',
	'elasticsearch',
	'kafka',
	'rabbitmq',
	'graphql',
	'rest',
	'grpc',
	'aws',
	'gcp',
	'azure',
	'docker',
	'kubernetes',
	'terraform',
	'ci/cd',
	'figma',
	'photoshop',
	'illustrator',
	'after effects',
	'premiere',
	'blender',
	'seo',
	'copywriting',
	'ffmpeg',
	'stripe',
	'paypal',
	'openai',
	'langchain'
];

const has = (hay: string, needle: string) => hay.includes(needle);

/** Read a job post into the parts that change what you write. */
export function extract(post: string): Extraction {
	const all = lines(post);
	const lower = post.toLowerCase();

	const screeners: string[] = [];
	const questions: string[] = [];
	const requirements: string[] = [];
	const budget: string[] = [];
	const timeline: string[] = [];

	for (const line of all) {
		const l = line.toLowerCase();

		if (SCREENER_CUES.some((c) => has(l, c))) {
			screeners.push(line);
			continue; // a screener is never also a plain requirement
		}
		if (line.endsWith('?')) {
			questions.push(line);
			continue;
		}
		if (REQUIREMENT_CUES.some((c) => has(l, c))) requirements.push(line);
		if (BUDGET_CUES.some((c) => has(l, c)) || /[$€£]\s?\d/.test(line)) budget.push(line);
		if (TIMELINE_CUES.some((c) => has(l, c))) timeline.push(line);
	}

	const keywords = TECH.filter((t) => {
		const i = lower.indexOf(t);
		if (i < 0) return false;
		// Avoid "go" matching inside "going"; require a non-word boundary.
		const before = lower[i - 1] ?? ' ';
		const after = lower[i + t.length] ?? ' ';
		return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
	});

	const warnings = WARNING_CUES.filter((w) => has(lower, w.cue)).map((w) => w.why);

	return {
		screeners,
		questions,
		requirements: dedupe(requirements),
		keywords: dedupe(keywords),
		budget: dedupe(budget),
		timeline: dedupe(timeline),
		warnings: dedupe(warnings)
	};
}

const dedupe = (xs: string[]) => [...new Set(xs)];

/** Did the draft obey the screening instruction? Answers the one check that
 *  silently kills otherwise-good proposals.
 *
 * Returns the quoted words the client asked for that are missing from the
 * draft — empty means either there was no screener or the draft complied. */
export function missingScreenerTokens(extraction: Extraction, draft: string): string[] {
	const d = draft.toLowerCase();
	const missing: string[] = [];
	for (const s of extraction.screeners) {
		// Clients quote the required word: 'the word "banana"' / 'the word banana'.
		const quoted = [...s.matchAll(/["'“”‘’]([^"'“”‘’]{2,30})["'“”‘’]/g)].map((m) => m[1]);
		const bare = s.match(/\bword\s+([a-z0-9-]{2,30})\b/i)?.[1];
		const wanted = dedupe([...quoted, ...(bare ? [bare] : [])]);
		for (const w of wanted) if (!d.includes(w.toLowerCase())) missing.push(w);
	}
	return dedupe(missing);
}
