// UI strings for the notes ("journey") section — the chrome around the prose:
// the journey header, roadmap, track pages and chapter footer. The notes are
// Bangla-only, so this is a plain string table, not a locale layer.

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

/** The notes UI string table. */
export const t: NotesStrings = {
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
	pathHeading: 'জিরো থেকে মাস্টারি — একটি গাইডেড পথ',
	pathSub: 'চারটি ধাপ, ক্রমানুসারে। উপর থেকে নিচে রেখা ধরে এগোন — অথবা যেকোনো জায়গায় ঝাঁপ দিন।',
	youllLearn: 'যা শিখবেন',
	tracksCount: (n) => `${n} ট্র্যাক`,
	chaptersTime: (n) => `${n} অধ্যায়`,
	doneWord: 'সম্পন্ন',
	beginPath: 'পথ শুরু করুন',
	continuePath: 'পথ চালিয়ে যান',
	levelWord: (n) => `ধাপ ${n}`,
	pathComplete: 'পথ সম্পন্ন',
	architect: 'আর্কিটেক্ট',
	architectPath: 'আর্কিটেক্টের পথ',
	capstoneAllDone: 'সব ধাপ পার — আর্কিটেক্ট ব্যাজ এখন আপনার। উপর থেকে নিচ পর্যন্ত পুরো স্ট্যাক।',
	capstoneStart:
		'চারটি ধাপ শেষ করে আর্কিটেক্ট ব্যাজ অর্জন করুন। পথটি দীর্ঘ, তবে শুরু হয় একটিমাত্র অধ্যায় দিয়ে।',
	capstoneMid: (remaining) =>
		`আর্কিটেক্ট ব্যাজ পেতে আর মাত্র ${remaining} অধ্যায় বাকি। গতি ধরে রাখুন।`,
	chaptersCount: (n) => `${n} অধ্যায়`,
	badges: 'ব্যাজ',
	tracksMastered: (done, total) => `${done}/${total} ট্র্যাক সম্পন্ন`,
	ranks: {
		Curious: 'কৌতূহলী',
		Novice: 'নবীন',
		Apprentice: 'শিক্ষানবিস',
		Practitioner: 'অনুশীলনকারী',
		Engineer: 'ইঞ্জিনিয়ার',
		Architect: 'আর্কিটেক্ট',
		Distinguished: 'বিশিষ্ট'
	},
	levels: {
		beginner: 'বিগিনার',
		intermediate: 'ইন্টারমিডিয়েট',
		advanced: 'অ্যাডভান্সড',
		mastery: 'মাস্টারি'
	},
	roadmap: {
		1: {
			title: 'ফান্ডামেন্টালস',
			blurb:
				'সিস্টেম কীভাবে কথা বলে, ডেটা স্টোর করে আর নেটওয়ার্কে বিট আদান-প্রদান করে — বাকি সবকিছুর ভিত্তি এখানেই।',
			outcomes: [
				'ক্লায়েন্ট আর সার্ভার কীভাবে কথা বলে',
				'ডেটা স্টোর করা ও মডেল করা',
				'নেটওয়ার্কিং ও প্রোটোকলের বেসিক'
			]
		},
		2: {
			title: 'বিল্ড ও শিপ',
			blurb:
				'মানুষ যে সার্ভিস আর ইন্টারফেস আসলে ব্যবহার করে তা লিখুন — ল্যাঙ্গুয়েজ, আর যে API-গুলো তাদের যুক্ত করে।',
			outcomes: [
				'বাস্তবে ব্যাকএন্ড ল্যাঙ্গুয়েজ',
				'ক্লিন REST ও GraphQL API ডিজাইন',
				'রিয়েল-টাইম, ইভেন্ট-ড্রিভেন ইন্টারফেস'
			]
		},
		3: {
			title: 'অপারেট ও স্কেল',
			blurb:
				'প্রোডাকশনে চালান: ইনফ্রাস্ট্রাকচার, বড় স্কেলে ডেটা, আর ভেঙে না পড়ে হরাইজন্টালি স্কেল করা।',
			outcomes: [
				'প্রোডাকশনে ইনফ্রাস্ট্রাকচার চালানো',
				'ডেটা ও ট্রাফিক হরাইজন্টালি স্কেল করা',
				'ক্যাশিং, কিউ ও লোড ব্যালান্সিং'
			]
		},
		4: {
			title: 'মাস্টারি',
			blurb:
				'বাস্তব চাপের মধ্যেও রিলায়েবল ও সিকিউর রাখুন — যে কাজ সিনিয়রদের বাকিদের থেকে আলাদা করে।',
			outcomes: [
				'লোডের মধ্যে অবজারভেবিলিটি ও রিলায়েবিলিটি',
				'স্কেলে সিকিউরিটি ও অথেন্টিকেশন',
				'ব্রেক করলেও রেজিলিয়েন্ট থাকা'
			]
		}
	}
};
