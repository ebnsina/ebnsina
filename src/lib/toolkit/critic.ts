/**
 * The critic — the part of the toolkit that earns its place.
 *
 * A generator that fills templates produces exactly the fluent, specific-to-
 * nobody copy the series says gets ignored. This does the opposite: it reads
 * what the reader wrote and refuses the filler, naming the fix each time.
 *
 * Every check is deterministic and English-facing (the *output* is English —
 * buyers and hiring managers read it), while the findings themselves are in
 * Bangla, because the reader is.
 *
 * These are all cheap string checks by design: they run on every keystroke,
 * offline, with no model behind them. The judgement calls a model would be
 * better at ("is this genuinely specific?") are deliberately left to the
 * optional AI hand-off in `spec.ts` rather than faked here.
 */
import type { Finding } from './types';
import { lengthState, limitFor } from './limits';

/** Phrases that claim without evidencing. Matched case-insensitively as whole
 *  phrases so "passionate" inside "dispassionate analysis" doesn't trip. */
const FILLER: { phrase: string; why: string }[] = [
	{ phrase: 'i hope this message finds you well', why: 'পড়ার আগেই বোঝা যায় এটা টেমপ্লেট।' },
	{ phrase: 'dear sir/madam', why: 'নাম না জানলে ভূমিকাটাই বাদ দাও।' },
	{ phrase: 'dear sir or madam', why: 'নাম না জানলে ভূমিকাটাই বাদ দাও।' },
	{ phrase: 'to whom it may concern', why: 'নাম না জানলে ভূমিকাটাই বাদ দাও।' },
	{ phrase: 'esteemed organization', why: 'অতি-আনুষ্ঠানিক ভাষা দূরত্ব তৈরি করে।' },
	{ phrase: 'kindly do the needful', why: 'অতি-আনুষ্ঠানিক ভাষা দূরত্ব তৈরি করে।' },
	{ phrase: 'passionate', why: 'আবেগ দাবি করা যায়, প্রমাণ করা যায় না।' },
	{ phrase: 'hard-working', why: 'সবাই এটাই লেখে, তাই এটা কোনো তথ্য না।' },
	{ phrase: 'hardworking', why: 'সবাই এটাই লেখে, তাই এটা কোনো তথ্য না।' },
	{ phrase: 'team player', why: 'সবাই এটাই লেখে, তাই এটা কোনো তথ্য না।' },
	{ phrase: 'detail-oriented', why: 'দাবি — কাজের উদাহরণ দিয়ে দেখাও।' },
	{ phrase: 'self-motivated', why: 'দাবি — অভ্যাস দিয়ে দেখাও।' },
	{ phrase: 'go-getter', why: 'দাবি, তথ্য না।' },
	{ phrase: 'best of my knowledge', why: 'অনিশ্চয়তা প্রকাশ করে, আত্মবিশ্বাস না।' },
	{ phrase: 'i am writing to', why: 'পাঠক জানে তুমি লিখছ — প্রথম লাইনটা তার কাজে লাগাও।' },
	{
		phrase: 'i would like to apply',
		why: 'অ্যাপ্লাই করছ সেটা স্পষ্ট; প্রথম লাইনে তার সমস্যার কথা বলো।'
	},
	{ phrase: 'please find attached', why: 'সংযুক্তির কথা বলার চেয়ে ভেতরের প্রমাণটা লেখো।' },
	{ phrase: 'looking forward to hearing from you', why: 'জায়গা নেয়, কিছু যোগ করে না।' },
	{ phrase: 'thank you for your time and consideration', why: 'জায়গা নেয়, কিছু যোগ করে না।' }
];

/** Adjectives that pretend to be measurements. Flagged only when the same block
 *  carries no actual number — "highly scalable, handling 5k rps" is fine. */
const VAGUE_SCALE = [
	'highly scalable',
	'high quality',
	'top quality',
	'best quality',
	'world class',
	'world-class',
	'cutting edge',
	'cutting-edge',
	'state of the art',
	'state-of-the-art',
	'fast delivery',
	'quick turnaround',
	'100% satisfaction',
	'unlimited revisions'
];

/** Digits in any script the reader might type, plus written-out magnitudes. */
const NUMBER_RE = /[0-9০-৯]|\b(million|billion|thousand|percent|লাখ|হাজার|মিলিয়ন|শতাংশ)\b/i;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function findPhrases(text: string, phrases: string[]): string[] {
	const hay = norm(text);
	return phrases.filter((p) => hay.includes(p));
}

/** True when the text contains at least one number-like token. */
export function hasNumber(text: string): boolean {
	return NUMBER_RE.test(text);
}

/** Words, counted the same way for Bangla and Latin script. */
export function wordCount(text: string): number {
	return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ---- individual checks ------------------------------------------------------

function checkFiller(field: string, text: string): Finding[] {
	const hay = norm(text);
	return FILLER.filter((f) => hay.includes(f.phrase)).map((f) => ({
		severity: 'blocker' as const,
		field,
		message: `"${f.phrase}" — ${f.why}`,
		fix: 'লাইনটা মুছে দাও, বা তার জায়গায় একটা নির্দিষ্ট তথ্য বসাও।',
		excerpt: f.phrase
	}));
}

function checkVagueScale(field: string, text: string): Finding[] {
	if (hasNumber(text)) return [];
	return findPhrases(text, VAGUE_SCALE).map((p) => ({
		severity: 'warning' as const,
		field,
		message: `"${p}" একটা দাবি, পরিমাপ না — আর আশেপাশে কোনো সংখ্যা নেই।`,
		fix: 'একটা সংখ্যা দাও: কত ট্রাফিক, কত সময়, কতটা কমেছে বা বেড়েছে।',
		excerpt: p
	}));
}

function checkLength(field: string, text: string, platform?: string, limitKey?: string): Finding[] {
	if (!platform || !limitKey) return [];
	const limit = limitFor(platform, limitKey);
	const state = lengthState(text.length, limit);
	if (!limit || state === 'ok' || state === 'empty') return [];
	if (state === 'over-max') {
		return [
			{
				severity: 'blocker',
				field,
				message: `সীমা ${limit.max} অক্ষর, এখন ${text.length} — প্ল্যাটফর্ম এটা নেবে না।`,
				fix: 'ছাঁটো। সবচেয়ে দুর্বল বাক্যটা আগে যায়।'
			}
		];
	}
	return [
		{
			severity: 'warning',
			field,
			message: `${limit.practical} অক্ষরের পরে অংশটা বাস্তবে দেখা যায় না (এখন ${text.length})।`,
			fix: limit.note ?? 'গুরুত্বপূর্ণ কথাটা শুরুর দিকে নিয়ে এসো।'
		}
	];
}

// ---- public API -------------------------------------------------------------

export type CritiqueInput = {
	field: string;
	text: string;
	platform?: string;
	limitKey?: string;
	/** For a proposal opener: the job post it is answering. */
	jobPost?: string;
	/** Minimum words before the field is considered attempted. */
	minWords?: number;
	/** When true, a block with no number at all is itself a finding. */
	requireNumber?: boolean;
};

/** Run every applicable check over one field. Ordered blockers first, because
 *  that is the order the reader should fix them in. */
export function critique(input: CritiqueInput): Finding[] {
	const { field, text, platform, limitKey, minWords, requireNumber, jobPost } = input;
	const findings: Finding[] = [];

	if (!text.trim()) return findings;

	findings.push(...checkFiller(field, text));
	findings.push(...checkVagueScale(field, text));
	findings.push(...checkLength(field, text, platform, limitKey));

	if (minWords && wordCount(text) < minWords) {
		findings.push({
			severity: 'warning',
			field,
			message: `এখানে ${wordCount(text)} শব্দ — এত অল্পে প্রমাণ দাঁড়ায় না।`,
			fix: `অন্তত ${minWords} শব্দ লেখো: সমস্যা, তুমি কী করলে, ফলটা কী।`
		});
	}

	if (requireNumber && !hasNumber(text)) {
		findings.push({
			severity: 'warning',
			field,
			message: 'কোনো সংখ্যা নেই — পাঠকের কাছে দাবিটা যাচাই করার উপায় থাকছে না।',
			fix: 'একটা মাপ যোগ করো: আগে/পরে, স্কেল, সময়, বা খরচ।'
		});
	}

	if (jobPost !== undefined) findings.push(...checkOpenerRelevance(field, text, jobPost));

	const rank = { blocker: 0, warning: 1, nudge: 2 };
	return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Stop-words excluded when looking for overlap between an opener and the post
 *  it answers — otherwise "the" and "and" make every opener look relevant. */
const STOP = new Set(
	`a an and are as at be but by for from has have i in is it its me my of on or our so that the their they this to we with you your will can need looking someone who help work project`.split(
		/\s+/
	)
);

/** Does the opener actually engage with the post, or could it be sent to anyone?
 *  Deterministic proxy: content-word overlap. Crude, and deliberately only a
 *  nudge — the real judgement is a job for the AI hand-off. */
export function checkOpenerRelevance(field: string, opener: string, jobPost: string): Finding[] {
	if (!opener.trim() || !jobPost.trim()) return [];
	const words = (s: string) =>
		new Set(
			norm(s)
				.split(/[^a-z0-9+#.-]+/)
				.filter((w) => w.length > 3 && !STOP.has(w))
		);
	const post = words(jobPost);
	const shared = [...words(opener)].filter((w) => post.has(w));
	if (shared.length >= 2) return [];
	return [
		{
			severity: 'warning',
			field,
			message: 'শুরুর লাইনটা এই জব পোস্টের সাথে কোথাও মিলছে না — এটা যে কাউকে পাঠানো যায়।',
			fix: 'ওদের পোস্টের নির্দিষ্ট একটা শব্দ বা সমস্যা প্রথম বাক্যেই ধরো।'
		}
	];
}

/** Evidence entries are the root of everything, so they get their own pass. */
export function critiqueEvidence(e: {
	label: string;
	problem: string;
	action: string;
	metric?: { before: string; after: string; unit: string };
	scale?: string;
}): Finding[] {
	const findings: Finding[] = [];
	const filled = (m?: { before: string; after: string; unit: string }) =>
		!!m && !!m.before.trim() && !!m.after.trim();

	if (!filled(e.metric) && !e.scale?.trim()) {
		findings.push({
			severity: 'blocker',
			field: 'metric',
			message: 'কোনো সংখ্যা নেই — সংখ্যা ছাড়া এই প্রমাণটা বাকি সব জায়গায় দুর্বল থাকবে।',
			fix: 'আগে/পরে একটা মাপ দাও, অথবা অন্তত স্কেল লেখো (কত ইউজার, দিনে কত রিকোয়েস্ট)।'
		});
	}
	if (wordCount(e.action) < 12) {
		findings.push({
			severity: 'warning',
			field: 'action',
			message: 'তুমি কী করেছ সেটা খুব সংক্ষিপ্ত — সিদ্ধান্তটা দেখা যাচ্ছে না।',
			fix: 'কোন পথটা বেছে নিয়েছিলে আর কোনটা বাদ দিয়েছিলে, সেটা লেখো।'
		});
	}
	findings.push(...checkFiller('action', e.action), ...checkFiller('problem', e.problem));
	return findings;
}

/** One number for the stepper: 0–100, blockers cost most. Never shown alone —
 *  the findings list is always next to it. */
export function score(findings: Finding[]): number {
	const cost = { blocker: 25, warning: 10, nudge: 4 };
	const total = findings.reduce((n, f) => n + cost[f.severity], 0);
	return Math.max(0, 100 - total);
}
