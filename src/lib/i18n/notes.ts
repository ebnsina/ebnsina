// i18n for the notes ("journey") section. English is the source of truth; `bn`
// is the Bangla locale served under /bn/notes. Every user-visible string in the
// notes UI resolves through `nt(locale)`; the content prose itself lives in the
// parallel src/content/notes-bn tree (see content.ts).

export type Locale = 'en' | 'bn';

export const LOCALES: Locale[] = ['en', 'bn'];

/** URL prefix for the notes section in a given locale. */
export const notesBase = (locale: Locale): string => (locale === 'bn' ? '/bn/notes' : '/notes');

/** The "switch to the other language" target. */
export const otherLocale = (locale: Locale): Locale => (locale === 'bn' ? 'en' : 'bn');

export const LOCALE_LABEL: Record<Locale, string> = { en: 'EN', bn: 'বাংলা' };

interface NotesStrings {
	// section chrome
	notesTitle: string;
	notesDesc: string;
	backToNotes: string;
	// journey header
	yourJourney: string;
	xp: string;
	chaptersWord: string;
	max: string;
	xpToNext: (n: number, name: string) => string;
	manageProgress: string;
	exportProgress: string;
	importProgress: string;
	importError: string;
	confirmReset: string;
	cancel: string;
	resetProgress: string;
	// track / category page
	trackProgress: (done: number, total: number, xp: number) => string;
	/** Suffix after the bolded "done/total" count on the track header. */
	chapterTail: (xp: number) => string;
	trackMastered: string;
	startHere: string;
	continueWord: string;
	startBadge: string;
	nextBadge: string;
	// chapter footer
	chapterComplete: string;
	finishedReading: string;
	xpEarned: (xp: number) => string;
	markToEarn: (xp: number) => string;
	nextChapter: string;
	toastMastered: (label: string) => string;
	toastXp: (xp: number, rank: string, total: number) => string;
	// chapter nav
	prev: string;
	next: string;
	// roadmap
	thePath: string;
	pathHeading: string;
	pathSub: string;
	youllLearn: string;
	tracksCount: (n: number) => string;
	chaptersTime: (n: number) => string;
	doneWord: string;
	beginPath: string;
	continuePath: string;
	levelWord: (n: number) => string;
	pathComplete: string;
	architect: string;
	architectPath: string;
	capstoneAllDone: string;
	capstoneStart: string;
	capstoneMid: (remaining: number) => string;
	chaptersCount: (n: number) => string;
	// badges section
	badges: string;
	tracksMastered: (done: number, total: number) => string;
	// maps keyed by the English source value
	ranks: Record<string, string>;
	levels: Record<string, string>;
	// roadmap level overlay, indexed by level.n (1-4)
	roadmap: Record<number, { title: string; blurb: string; outcomes: string[] }>;
}

const en: NotesStrings = {
	notesTitle: 'Notes',
	notesDesc: 'Deep-dive series on systems, infrastructure, and engineering craft.',
	backToNotes: '← Notes',
	yourJourney: 'Your journey',
	xp: 'XP',
	chaptersWord: 'chapters',
	max: 'Max',
	xpToNext: (n, name) => `${n} XP to ${name}`,
	manageProgress: 'Manage progress',
	exportProgress: 'Export progress',
	importProgress: 'Import progress',
	importError: 'Could not read that file.',
	confirmReset: 'Confirm reset',
	cancel: 'Cancel',
	resetProgress: 'Reset progress',
	trackProgress: (done, total, xp) => `${done}/${total} chapters · ${xp} XP earned`,
	chapterTail: (xp) => ` chapters · ${xp} XP earned`,
	trackMastered: 'Track mastered',
	startHere: 'Start here',
	continueWord: 'Continue',
	startBadge: 'Start',
	nextBadge: 'Next',
	chapterComplete: 'Chapter complete',
	finishedReading: 'Finished reading?',
	xpEarned: (xp) => `+${xp} XP earned`,
	markToEarn: (xp) => `Mark complete to earn ${xp} XP`,
	nextChapter: 'Next chapter →',
	toastMastered: (label) => `Track mastered — ${label}!`,
	toastXp: (xp, rank, total) => `+${xp} XP · ${rank} · ${total} XP total`,
	prev: '← Previous',
	next: 'Next →',
	thePath: 'The path',
	pathHeading: 'A guided route, start to mastery',
	pathSub: 'Four levels, in order. Follow the line top to bottom — or jump anywhere you like.',
	youllLearn: "You'll learn",
	tracksCount: (n) => `${n} tracks`,
	chaptersTime: (n) => `${n} chapters`,
	doneWord: 'done',
	beginPath: 'Begin path',
	continuePath: 'Continue path',
	levelWord: (n) => `Level ${n}`,
	pathComplete: 'Path complete',
	architect: 'Architect',
	architectPath: 'The Architect Path',
	capstoneAllDone:
		"Every level cleared — the Architect badge is yours. That's the full stack, top to bottom.",
	capstoneStart:
		"Work through all four levels to earn the Architect badge. It's a long road, but it starts with a single chapter.",
	capstoneMid: (remaining) =>
		`${remaining} chapters stand between you and the Architect badge. Keep the momentum going.`,
	chaptersCount: (n) => `${n} chapters`,
	badges: 'Badges',
	tracksMastered: (done, total) => `${done}/${total} tracks mastered`,
	ranks: {
		Curious: 'Curious',
		Novice: 'Novice',
		Apprentice: 'Apprentice',
		Practitioner: 'Practitioner',
		Engineer: 'Engineer',
		Architect: 'Architect',
		Distinguished: 'Distinguished'
	},
	levels: {
		beginner: 'beginner',
		intermediate: 'intermediate',
		advanced: 'advanced',
		mastery: 'mastery'
	},
	roadmap: {}
};

const bn: NotesStrings = {
	notesTitle: 'নোটস',
	notesDesc: 'সিস্টেম, ইনফ্রাস্ট্রাকচার আর ইঞ্জিনিয়ারিং দক্ষতা নিয়ে গভীর আলোচনার সিরিজ।',
	backToNotes: '← নোটস',
	yourJourney: 'আপনার যাত্রা',
	xp: 'XP',
	chaptersWord: 'অধ্যায়',
	max: 'সর্বোচ্চ',
	xpToNext: (n, name) => `${name} হতে ${n} XP বাকি`,
	manageProgress: 'অগ্রগতি ব্যবস্থাপনা',
	exportProgress: 'অগ্রগতি এক্সপোর্ট',
	importProgress: 'অগ্রগতি ইমপোর্ট',
	importError: 'ফাইলটি পড়া যায়নি।',
	confirmReset: 'রিসেট নিশ্চিত করুন',
	cancel: 'বাতিল',
	resetProgress: 'অগ্রগতি রিসেট',
	trackProgress: (done, total, xp) => `${done}/${total} অধ্যায় · ${xp} XP অর্জিত`,
	chapterTail: (xp) => ` অধ্যায় · ${xp} XP অর্জিত`,
	trackMastered: 'ট্র্যাক সম্পন্ন',
	startHere: 'এখান থেকে শুরু',
	continueWord: 'চালিয়ে যান',
	startBadge: 'শুরু',
	nextBadge: 'পরবর্তী',
	chapterComplete: 'অধ্যায় সম্পন্ন',
	finishedReading: 'পড়া শেষ?',
	xpEarned: (xp) => `+${xp} XP অর্জিত`,
	markToEarn: (xp) => `সম্পন্ন চিহ্নিত করে ${xp} XP অর্জন করুন`,
	nextChapter: 'পরবর্তী অধ্যায় →',
	toastMastered: (label) => `ট্র্যাক সম্পন্ন — ${label}!`,
	toastXp: (xp, rank, total) => `+${xp} XP · ${rank} · মোট ${total} XP`,
	prev: '← পূর্ববর্তী',
	next: 'পরবর্তী →',
	thePath: 'পথ',
	pathHeading: 'শুরু থেকে পারদর্শিতা — একটি নির্দেশিত পথ',
	pathSub: 'চারটি ধাপ, ক্রমানুসারে। উপর থেকে নিচে রেখা ধরে এগোন — অথবা যেকোনো জায়গায় ঝাঁপ দিন।',
	youllLearn: 'যা শিখবেন',
	tracksCount: (n) => `${n} ট্র্যাক`,
	chaptersTime: (n) => `${n} অধ্যায়`,
	doneWord: 'সম্পন্ন',
	beginPath: 'পথ শুরু করুন',
	continuePath: 'পথ চালিয়ে যান',
	levelWord: (n) => `ধাপ ${n}`,
	pathComplete: 'পথ সম্পন্ন',
	architect: 'স্থপতি',
	architectPath: 'স্থপতির পথ',
	capstoneAllDone: 'সব ধাপ পার — স্থপতি ব্যাজ এখন আপনার। উপর থেকে নিচ পর্যন্ত পুরো স্ট্যাক।',
	capstoneStart:
		'চারটি ধাপ শেষ করে স্থপতি ব্যাজ অর্জন করুন। পথটি দীর্ঘ, তবে শুরু হয় একটিমাত্র অধ্যায় দিয়ে।',
	capstoneMid: (remaining) =>
		`স্থপতি ব্যাজ পেতে আর মাত্র ${remaining} অধ্যায় বাকি। গতি ধরে রাখুন।`,
	chaptersCount: (n) => `${n} অধ্যায়`,
	badges: 'ব্যাজ',
	tracksMastered: (done, total) => `${done}/${total} ট্র্যাক সম্পন্ন`,
	ranks: {
		Curious: 'কৌতূহলী',
		Novice: 'নবীন',
		Apprentice: 'শিক্ষানবিস',
		Practitioner: 'অনুশীলনকারী',
		Engineer: 'প্রকৌশলী',
		Architect: 'স্থপতি',
		Distinguished: 'বিশিষ্ট'
	},
	levels: {
		beginner: 'প্রাথমিক',
		intermediate: 'মধ্যবর্তী',
		advanced: 'উন্নত',
		mastery: 'পারদর্শী'
	},
	roadmap: {
		1: {
			title: 'মৌলিক ভিত্তি',
			blurb:
				'সিস্টেম কীভাবে কথা বলে, ডেটা জমা রাখে আর নেটওয়ার্কে বিট আদান-প্রদান করে — বাকি সবকিছুর ভিত্তি এখানেই।',
			outcomes: [
				'ক্লায়েন্ট আর সার্ভার কীভাবে কথা বলে',
				'ডেটা জমা রাখা ও মডেল করা',
				'নেটওয়ার্কিং ও প্রোটোকলের মূল ধারণা'
			]
		},
		2: {
			title: 'তৈরি ও প্রকাশ',
			blurb:
				'মানুষ যে সার্ভিস আর ইন্টারফেস আসলে ব্যবহার করে তা লিখুন — ভাষা, আর যে API-গুলো তাদের যুক্ত করে।',
			outcomes: [
				'বাস্তবে ব্যাকএন্ড ভাষা',
				'পরিচ্ছন্ন REST ও GraphQL API ডিজাইন',
				'রিয়েল-টাইম, ইভেন্ট-চালিত ইন্টারফেস'
			]
		},
		3: {
			title: 'পরিচালনা ও স্কেল',
			blurb:
				'প্রোডাকশনে চালান: ইনফ্রাস্ট্রাকচার, বড় স্কেলে ডেটা, আর ভেঙে না পড়ে অনুভূমিকভাবে বৃদ্ধি।',
			outcomes: [
				'প্রোডাকশনে ইনফ্রাস্ট্রাকচার চালানো',
				'ডেটা ও ট্রাফিক অনুভূমিকভাবে স্কেল করা',
				'ক্যাশিং, কিউ ও লোড ব্যালান্সিং'
			]
		},
		4: {
			title: 'পারদর্শিতা',
			blurb:
				'বাস্তব চাপের মধ্যেও নির্ভরযোগ্য ও নিরাপদ রাখুন — যে কাজ সিনিয়রদের বাকিদের থেকে আলাদা করে।',
			outcomes: [
				'চাপের মধ্যে অবজারভেবিলিটি ও নির্ভরযোগ্যতা',
				'স্কেলে নিরাপত্তা ও অথেন্টিকেশন',
				'সমস্যা হলেও টিকে থাকা'
			]
		}
	}
};

const STRINGS: Record<Locale, NotesStrings> = { en, bn };

/** Resolve the notes string table for a locale. */
export const nt = (locale: Locale): NotesStrings => STRINGS[locale] ?? en;
